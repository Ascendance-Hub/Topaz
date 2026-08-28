import {
  joinRoom as entrarNostr, selfId, getRelaySockets, defaultRelayUrls,
} from '@trystero-p2p/nostr'
import { joinRoom as entrarMqtt } from '@trystero-p2p/mqtt'
import { joinRoom as entrarTorrent } from '@trystero-p2p/torrent'
import { fundirSalas } from './salas'
import type { Salas, SalaNomeada } from './salas'
import type { Acao, EstadoJogo } from '../game/types'
import { criarEmissor } from './avisar'

export const APP_ID = 'topaz-ascendance-hub'

/**
 * Os relays de sinalização.
 *
 * **Voltou a ser a lista padrão do Trystero, e isto é um recuo deliberado.**
 *
 * Passamos por três listas curadas por nós, cada uma com um critério melhor
 * que o anterior: o socket abre; o NIP-11 não declara restrição; o relay
 * entrega de ponta a ponta. Todas mediram bem — e mesmo assim a conexão
 * piorou, a ponto de um amigo que antes conectava sempre passar a falhar
 * quase toda vez.
 *
 * O erro de método foi medir em SEGUNDOS o que se usa em MINUTOS. Abrir,
 * publicar e receber uma vez não diz nada sobre inscrição longa, reconexão,
 * limite de taxa nem quantas assinaturas simultâneas o relay tolera. A lista
 * padrão é a que os autores da biblioteca exercitam nesse regime, e é a
 * configuração sob a qual este projeto funcionava melhor.
 *
 * `RELAYS` continua exportada, agora refletindo a escolha do Trystero, para a
 * tela de diagnóstico poder listar quais estão conectados.
 */
/**
 * Quantos relays da lista padrão usar de fato.
 *
 * O Trystero traz 47 endereços e usa só **5** por omissão
 * (`defaultRedundancy`), sempre os mesmos, derivados do `appId`. Cinco é
 * pouco demais quando antivírus entram na conta: o Norton bloqueou um deles
 * na máquina do autor, e cada pessoa tem um antivírus bloqueando endereços
 * diferentes. Com uma reserva de cinco, a interseção entre duas pessoas
 * desmorona rápido — quem não sobrepunha com o anfitrião nunca aparecia na
 * sala, sem erro nenhum.
 *
 * Vinte não é curadoria: é a MESMA lista da biblioteca, só que mais funda. A
 * lição da curadoria anterior continua valendo — o que faltava não era
 * escolher melhor, era ter mais de onde escolher.
 */
export const REDUNDANCIA = 20

export const RELAYS = defaultRelayUrls.slice(0, REDUNDANCIA)

/**
 * Para quem esta mensagem é.
 *
 * `canal` não é um filtro de exibição: ela é ENVIADA só para quem está no meu
 * canal. Filtrar na tela deixaria o texto viajando para quem não devia
 * recebê-lo, e bastaria abrir o console para ler.
 */
export type EscopoChat = 'geral' | 'canal'

interface MensagemChat {
  texto: string
  escopo: EscopoChat
}

/** Lê o que chegou pelo canal de chat, ou `null` se não fechar. */
export function lerMensagemChat(bruto: unknown): MensagemChat | null {
  // Versão anterior aos escopos mandava a string crua. Aceitar é o que impede
  // uma aba não recarregada de ficar muda para quem já recarregou.
  if (typeof bruto === 'string') return { texto: bruto, escopo: 'geral' }
  if (typeof bruto !== 'object' || bruto === null) return null
  const m = bruto as Record<string, unknown>
  if (typeof m['texto'] !== 'string') return null
  if (m['escopo'] !== 'geral' && m['escopo'] !== 'canal') return null
  return { texto: m['texto'], escopo: m['escopo'] }
}

export interface Transporte {
  meuId(): string
  peers(): string[]
  enviarAcao(acao: Acao): void
  aoReceberAcao(cb: (acao: Acao, peerId: string) => void): void
  enviarEstado(estado: EstadoJogo): void
  aoReceberEstado(cb: (estado: EstadoJogo, peerId: string) => void): void
  /**
   * Conversa da mesa. Canal à parte de propósito: o chat não passa pelo
   * anfitrião, não entra no `EstadoJogo` e não é conceito de blackjack — por
   * isso o texto é só uma string aqui, e não um tipo em `game/types.ts`.
   * Mensagem perdida não tem como corromper partida nenhuma.
   */
  enviarMensagem(texto: string, escopo: EscopoChat, para?: string[]): void
  aoReceberMensagem(cb: (texto: string, peerId: string, escopo: EscopoChat) => void): void
  /**
   * A foto de perfil, como `data:` de imagem gerado no próprio navegador.
   *
   * Canal à parte pelo mesmo motivo do chat, e mais um: a foto é grande perto
   * de tudo que trafega aqui (uns 4 a 8 KB). Se morasse no `EstadoJogo`, ela
   * viajaria de novo a cada anúncio do anfitrião — que durante a compra do
   * dealer acontece a cada 700 ms.
   *
   * Enviada quando alguém entra e quando muda, no mesmo espírito de anúncio
   * completo que o resto do projeto usa: quem chega depois recebe sem precisar
   * pedir, e uma perda no caminho se conserta no próximo anúncio.
   */
  enviarFoto(foto: string): void
  aoReceberFoto(cb: (foto: unknown, peerId: string) => void): void
  /**
   * A troca de identidade: `{ tipo: 'ola' }` com a chave pública e um desafio
   * sorteado, e `{ tipo: 'prova' }` com a assinatura daquele desafio.
   *
   * Canal próprio para que a prova não dependa do jogo nem da call — ela
   * precisa acontecer com quem entrou na sala, jogando ou não. E entregue como
   * `unknown`: quem valida é quem consome.
   */
  enviarIdentidade(mensagem: unknown, para?: string): void
  aoReceberIdentidade(cb: (mensagem: unknown, peerId: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
  sair(): void
}

/** A conexão crua do Trystero. Dados e mídia viajam por ela. */
export type SalaTrystero = ReturnType<typeof entrarNostr>

/**
 * Abre a conexão. Fica separada de `criarTransporte` porque a mesma conexão
 * carrega dados do jogo e, no módulo de call, mídia — abrir uma segunda seria
 * um handshake inteiro a mais para os mesmos peers.
 *
 * Separar também torna `criarTransporte` testável com uma sala falsa: antes,
 * verificar que cada canal vai para o lugar certo exigia navegador.
 */
/**
 * Abre a sala nas TRÊS redes de descoberta ao mesmo tempo.
 *
 * Nostr, MQTT e BitTorrent são infraestruturas completamente diferentes —
 * outros servidores, outros protocolos, outras portas. Antivírus e filtros de
 * DNS bloqueiam por reputação, e a lista inteira do nostr costuma cair na
 * mesma categoria: uma máquina que alcança 5 de 20 relays nostr pode alcançar
 * o MQTT inteiro.
 *
 * As três só servem para as pessoas se ACHAREM. Depois disso a conversa é
 * direta entre os navegadores, como sempre foi — e `fundirSalas` garante uma
 * conexão por pessoa, não três.
 */
export function criarSalasTrystero(codigo: string): Salas {
  const config = { appId: APP_ID, relayConfig: { redundancy: REDUNDANCIA } }
  const nomeadas: SalaNomeada[] = [
    { nome: 'nostr', sala: entrarNostr(config, codigo) },
    { nome: 'mqtt', sala: entrarMqtt(config, codigo) as SalaTrystero },
    { nome: 'torrent', sala: entrarTorrent(config, codigo) as SalaTrystero },
  ]
  return fundirSalas(nomeadas)
}

export interface RelayDetalhe {
  url: string
  /** Só o host, que é o que se compara entre duas telas. */
  nome: string
  conectado: boolean
}

/**
 * Situação de cada relay configurado.
 *
 * Existe para duas pessoas conseguirem COMPARAR. Se a rede de cada uma alcança
 * relays diferentes e os conjuntos não se cruzam, elas nunca se encontram — e
 * nenhuma das duas vê erro, porque ambas têm relays conectados. Só olhando os
 * nomes lado a lado dá para ver isso.
 */
export function relaysDetalhados(): RelayDetalhe[] {
  let abertos: Set<string>
  try {
    const sockets = getRelaySockets() as Record<string, { readyState?: number }>
    abertos = new Set(
      Object.entries(sockets)
        .filter(([, s]) => s?.readyState === WebSocket.OPEN)
        .map(([url]) => url),
    )
  } catch {
    abertos = new Set()
  }

  return RELAYS.map((url) => ({
    url,
    nome: url.replace(/^wss:\/\//, ''),
    // O Trystero normaliza a URL com barra no fim; comparar os dois formatos
    // evita listar como desconectado quem está de pé.
    conectado: abertos.has(url) || abertos.has(`${url}/`),
  }))
}

export function relaysConectados(): number {
  try {
    // O tipo devolvido não promete `readyState`, mas em navegador são
    // `WebSocket` de verdade. Estreitar aqui é mais honesto que `any`.
    const sockets = getRelaySockets() as Record<string, { readyState?: number }>
    return Object.values(sockets)
      .filter((socket) => socket?.readyState === WebSocket.OPEN).length
  } catch {
    return 0
  }
}

export function criarTransporte(salas: Salas): Transporte {
  const acaoAction = salas.criarAcao<Acao>('acao')
  const estadoAction = salas.criarAcao<EstadoJogo>('estado')
  const chatAction = salas.criarAcao<unknown>('chat')
  const fotoAction = salas.criarAcao<string>('foto')
  const identidadeAction = salas.criarAcao<unknown>('identidade')

  const aoFoto = criarEmissor<[foto: unknown, peerId: string]>()
  const aoIdentidade = criarEmissor<[mensagem: unknown, peerId: string]>()
  const aoAcao = criarEmissor<[acao: Acao, peerId: string]>()
  const aoEstado = criarEmissor<[estado: EstadoJogo, peerId: string]>()
  const aoEntrar = criarEmissor<[peerId: string]>()
  const aoSair = criarEmissor<[peerId: string]>()
  const aoMensagem = criarEmissor<[texto: string, peerId: string, escopo: EscopoChat]>()

  // A fusão já entrega `de` desduplicado: só o que veio pela rede dona.
  acaoAction.onMessage((acao, de) => {
    aoAcao.avisar(acao, de)
  })
  estadoAction.onMessage((estado, de) => {
    aoEstado.avisar(estado, de)
  })
  identidadeAction.onMessage((mensagem, de) => {
    aoIdentidade.avisar(mensagem, de)
  })

  fotoAction.onMessage((foto, de) => {
    // Entregue como `unknown`: a validação é de quem consome, que é quem sabe
    // o que serve como foto. Aqui só existe o transporte.
    aoFoto.avisar(foto, de)
  })

  chatAction.onMessage((bruto, de) => {
    // Vem da rede: pode ser de uma versão antiga (só o texto), de uma futura,
    // ou de alguém com o console aberto. O que não fecha o formato é
    // descartado; texto solto continua valendo como mensagem geral, senão
    // quem não recarregou a página ficaria mudo para nós.
    const msg = lerMensagemChat(bruto)
    if (msg === null) return
    aoMensagem.avisar(msg.texto, de, msg.escopo)
  })
  salas.aoEntrarPeer((peerId) => {
    aoEntrar.avisar(peerId)
  })
  salas.aoSairPeer((peerId) => {
    aoSair.avisar(peerId)
  })

  return {
    meuId: () => selfId,
    peers: () => salas.peers(),
    enviarAcao: (acao) => {
      acaoAction.send(acao)
    },
    aoReceberAcao: aoAcao.ouvir,
    enviarEstado: (estado) => {
      estadoAction.send(estado)
    },
    aoReceberEstado: aoEstado.ouvir,
    enviarMensagem: (texto, escopo, para) => {
      // `para` presente e vazio significa "não há ninguém no meu canal além
      // de mim" — enviar sem alvo viraria broadcast, que é o oposto do
      // pedido. Sem `para`, é geral mesmo.
      if (para !== undefined && para.length === 0) return
      if (para === undefined) {
        chatAction.send({ texto, escopo })
        return
      }
      // Um envio por destinatário: `send` fala com um peer por vez, e cada um
      // pode ter vindo por uma rede de descoberta diferente. Numa conversa de
      // amigos são poucos, e a alternativa — mandar a todos e filtrar na tela
      // — deixaria o texto viajando para quem não devia recebê-lo.
      for (const alvo of para) chatAction.send({ texto, escopo }, alvo)
    },
    aoReceberMensagem: aoMensagem.ouvir,
    enviarFoto: (foto) => {
      fotoAction.send(foto)
    },
    aoReceberFoto: aoFoto.ouvir,
    enviarIdentidade: (mensagem, para) => {
      identidadeAction.send(mensagem, para)
    },
    aoReceberIdentidade: aoIdentidade.ouvir,
    aoEntrarPeer: aoEntrar.ouvir,
    aoSairPeer: aoSair.ouvir,
    sair: () => {
      salas.sair()
    },
  }
}
