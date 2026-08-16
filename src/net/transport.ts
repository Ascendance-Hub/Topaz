import { joinRoom, selfId } from 'trystero/nostr'
import type { DataPayload } from 'trystero/nostr'
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
  // `EstadoJogo` é declarado como `interface`, então — ao contrário de
  // `Acao`, que é um `type` de objetos literais — não recebe assinatura de
  // índice implícita e não satisfaz a constraint `DataPayload` do Trystero,
  // mesmo sendo, em tempo de execução, um objeto JSON simples. A ação
  // 'estado' trafega então sem parâmetro de tipo explícito (assumindo
  // `DataPayload`) e convertemos nas duas bordas abaixo, onde confiamos no
  // formato definido pelo nosso próprio protocolo.
  const estadoAction = sala.makeAction('estado')

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
      void estadoAction.send(estado as unknown as DataPayload)
    },
    aoReceberEstado: (cb) => {
      estadoAction.onMessage = (estado, contexto) => cb(estado as unknown as EstadoJogo, contexto.peerId)
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
