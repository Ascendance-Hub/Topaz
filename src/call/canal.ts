import { selfId } from 'trystero/nostr'
import type { SalaTrystero, Transporte } from '../net/transport'
import type { CanalCall, MensagemCall } from './protocolo'

/**
 * O canal da call por cima da mesma conexão que o jogo usa.
 *
 * Canal próprio (`makeAction('call')`) e não a interface `Transporte`: ela
 * sustenta a rede falsa que testa eleição, migração e split-brain, e não deve
 * ganhar conceitos que não são do jogo. Mensagem de call perdida não tem como
 * corromper partida nenhuma.
 *
 * Mas entrada e saída de peers vêm do `Transporte`, NÃO da sala crua. O
 * Trystero guarda um ÚNICO handler em `onPeerJoin`: atribuí-lo aqui apagaria o
 * do jogo, a eleição de anfitrião pararia de receber avisos, e a sala
 * quebraria em silêncio — do jeito mais difícil de diagnosticar. O
 * `Transporte` já mantém uma lista de ouvintes, e há teste dos dois lados
 * guardando essa propriedade.
 */
export function criarCanalCall(sala: SalaTrystero, transporte: Transporte): CanalCall {
  const callAction = sala.makeAction<MensagemCall>('call')
  const aoReceber: ((msg: MensagemCall, de: string) => void)[] = []

  callAction.onMessage = (msg, contexto) => {
    for (const cb of aoReceber) cb(msg, contexto.peerId)
  }

  return {
    meuId: () => selfId,
    enviar: (msg, para) => {
      // O destinatário vai em `target` dentro das opções — o segundo argumento
      // de `send` é o objeto de opções, não o peerId.
      void callAction.send(msg, para === undefined ? undefined : { target: para })
    },
    aoReceber: (cb) => {
      aoReceber.push(cb)
    },
    aoEntrarPeer: (cb) => transporte.aoEntrarPeer(cb),
    aoSairPeer: (cb) => transporte.aoSairPeer(cb),
  }
}
