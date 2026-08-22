import { joinRoom, selfId, getRelaySockets } from 'trystero/nostr'
import type { Acao, EstadoJogo } from '../game/types'

export const APP_ID = 'topaz-ascendance-hub'

/**
 * Os relays de sinalização, escolhidos por nós.
 *
 * O padrão do Trystero é um embaralhamento determinístico da lista dele
 * semeado pelo `appId`: todo mundo do Topaz caía nos MESMOS 5 relays. Isso é
 * um ponto único de falha coletivo — em 21/08/2026, um deles (`hol.is`) estava
 * fora do ar e outro (`relay.agorist.space`) foi marcado como phishing pelo
 * Norton, deixando 3 de pé sem ninguém ser avisado.
 *
 * Passar `relayConfig.urls` substitui a lista inteira, sem corte: os dez
 * abaixo são todos usados.
 *
 * O critério de escolha mudou depois de um erro: na primeira versão desta
 * lista eu escolhi por o socket ABRIR, e dois dos oito (`nostr.wine`, pago, e
 * `basspistol.org`) recusam publicação. Um relay assim parece vivo e descarta
 * todo anúncio, o que fazia a descoberta funcionar muito bem uma hora e falhar
 * na outra, conforme onde o anúncio de cada pessoa tivesse caído.
 *
 * Agora os dez foram verificados nos DOIS critérios: o socket abre e o NIP-11
 * não declara `payment_required`, `auth_required`, `restricted_writes` nem
 * exigência de proof-of-work. Estão em ordem de latência medida.
 */
export const RELAYS = [
  'wss://relay.mostro.network',
  'wss://strfry.shock.network',
  'wss://nos.lol',
  'wss://purplerelay.com',
  'wss://relay.damus.io',
  'wss://offchain.pub',
  'wss://relay.mostr.pub',
  'wss://nostr.bitcoiner.social',
  'wss://relay.libernet.app',
  'wss://nostr.data.haus',
]

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
  return joinRoom({ appId: APP_ID, relayConfig: { urls: RELAYS } }, codigoSala)
}

/**
 * Quantos relays de sinalização estão de fato conectados.
 *
 * Sem isto, "não foi possível conectar" significa tanto "ninguém entrou na
 * sala" quanto "a sinalização está bloqueada" — e a segunda é justamente a que
 * a pessoa não tem como adivinhar sozinha, porque antivírus e firewall
 * bloqueiam em silêncio.
 */
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
