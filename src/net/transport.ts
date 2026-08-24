import { joinRoom, selfId, getRelaySockets, defaultRelayUrls } from 'trystero/nostr'
import type { Acao, EstadoJogo } from '../game/types'

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
  enviarMensagem(texto: string): void
  aoReceberMensagem(cb: (texto: string, peerId: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
  sair(): void
}

/** A conexão crua do Trystero. Dados e mídia viajam por ela. */
export type SalaTrystero = ReturnType<typeof joinRoom>

/**
 * Abre a conexão. Fica separada de `criarTransporte` porque a mesma conexão
 * carrega dados do jogo e, no módulo de call, mídia — abrir uma segunda seria
 * um handshake inteiro a mais para os mesmos peers.
 *
 * Separar também torna `criarTransporte` testável com uma sala falsa: antes,
 * verificar que cada canal vai para o lugar certo exigia navegador.
 */
export function criarSalaTrystero(codigoSala: string): SalaTrystero {
  return joinRoom(
    { appId: APP_ID, relayConfig: { redundancy: REDUNDANCIA } },
    codigoSala,
  )
}

/**
 * Quantos relays de sinalização estão de fato conectados.
 *
 * Sem isto, "não foi possível conectar" significa tanto "ninguém entrou na
 * sala" quanto "a sinalização está bloqueada" — e a segunda é justamente a que
 * a pessoa não tem como adivinhar sozinha, porque antivírus e firewall
 * bloqueiam em silêncio.
 */
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

export function criarTransporte(sala: SalaTrystero): Transporte {
  const acaoAction = sala.makeAction<Acao>('acao')
  const estadoAction = sala.makeAction<EstadoJogo>('estado')
  const chatAction = sala.makeAction<string>('chat')

  // Trystero só guarda um handler por slot (`onMessage`, `onPeerJoin`,
  // `onPeerLeave`) — atribuir de novo substitui o anterior em vez de somar.
  // A interface `Transporte`, porém, permite múltiplos registros (é o que a
  // rede falsa já faz). Por isso mantemos as listas aqui e atribuímos a cada
  // slot do Trystero um único despachante que itera a lista.
  const aoAcao: ((acao: Acao, peerId: string) => void)[] = []
  const aoEstado: ((estado: EstadoJogo, peerId: string) => void)[] = []
  const aoEntrar: ((peerId: string) => void)[] = []
  const aoSair: ((peerId: string) => void)[] = []
  const aoMensagem: ((texto: string, peerId: string) => void)[] = []

  acaoAction.onMessage = (acao, contexto) => {
    for (const cb of aoAcao) cb(acao, contexto.peerId)
  }
  estadoAction.onMessage = (estado, contexto) => {
    for (const cb of aoEstado) cb(estado, contexto.peerId)
  }
  chatAction.onMessage = (texto, contexto) => {
    for (const cb of aoMensagem) cb(texto, contexto.peerId)
  }
  sala.onPeerJoin = (peerId) => {
    for (const cb of aoEntrar) cb(peerId)
  }
  sala.onPeerLeave = (peerId) => {
    for (const cb of aoSair) cb(peerId)
  }

  return {
    meuId: () => selfId,
    peers: () => Object.keys(sala.getPeers()),
    enviarAcao: (acao) => {
      void acaoAction.send(acao)
    },
    aoReceberAcao: (cb) => {
      aoAcao.push(cb)
    },
    enviarEstado: (estado) => {
      void estadoAction.send(estado)
    },
    aoReceberEstado: (cb) => {
      aoEstado.push(cb)
    },
    enviarMensagem: (texto) => {
      void chatAction.send(texto)
    },
    aoReceberMensagem: (cb) => {
      aoMensagem.push(cb)
    },
    aoEntrarPeer: (cb) => {
      aoEntrar.push(cb)
    },
    aoSairPeer: (cb) => {
      aoSair.push(cb)
    },
    sair: () => {
      void sala.leave()
    },
  }
}
