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

  return {
    meuId: () => selfId,
    peers: () => Object.keys(sala.getPeers()),
    enviarAcao: (acao) => {
      void acaoAction.send(acao)
    },
    aoReceberAcao: (cb) => {
      acaoAction.onMessage = (acao, contexto) => cb(acao, contexto.peerId)
    },
    enviarEstado: (estado) => {
      void estadoAction.send(estado)
    },
    aoReceberEstado: (cb) => {
      estadoAction.onMessage = (estado, contexto) => cb(estado, contexto.peerId)
    },
    aoEntrarPeer: (cb) => {
      sala.onPeerJoin = cb
    },
    aoSairPeer: (cb) => {
      sala.onPeerLeave = cb
    },
    sair: () => {
      void sala.leave()
    },
  }
}
