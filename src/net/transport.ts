import { joinRoom, selfId } from 'trystero/nostr'
import type { Acao, EstadoJogo } from '../game/types'

export const APP_ID = 'topaz-ascendance-hub'

export interface Transporte {
  meuId(): string
  peers(): string[]
  enviarAcao(acao: Acao): void
  aoReceberAcao(cb: (acao: Acao, peerId: string) => void): void
  enviarEstado(estado: EstadoJogo): void
  aoReceberEstado(cb: (estado: EstadoJogo, peerId: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
  sair(): void
}

export function criarTransporteTrystero(codigoSala: string): Transporte {
  const sala = joinRoom({ appId: APP_ID }, codigoSala)
  const acaoAction = sala.makeAction<Acao>('acao')
  const estadoAction = sala.makeAction<EstadoJogo>('estado')

  // Trystero só guarda um handler por slot (`onMessage`, `onPeerJoin`,
  // `onPeerLeave`) — atribuir de novo substitui o anterior em vez de somar.
  // A interface `Transporte`, porém, permite múltiplos registros (é o que a
  // rede falsa já faz). Por isso mantemos as listas aqui e atribuímos a cada
  // slot do Trystero um único despachante que itera a lista.
  const aoAcao: ((acao: Acao, peerId: string) => void)[] = []
  const aoEstado: ((estado: EstadoJogo, peerId: string) => void)[] = []
  const aoEntrar: ((peerId: string) => void)[] = []
  const aoSair: ((peerId: string) => void)[] = []

  acaoAction.onMessage = (acao, contexto) => {
    for (const cb of aoAcao) cb(acao, contexto.peerId)
  }
  estadoAction.onMessage = (estado, contexto) => {
    for (const cb of aoEstado) cb(estado, contexto.peerId)
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
