import { joinRoom as entrarNostr } from '@trystero-p2p/nostr'
import { APP_ID, REDUNDANCIA } from '../net/transport'
import type { SalaDeFundo } from './presenca'

/**
 * A sala de um grupo que você NÃO abriu.
 *
 * Só nostr, mas com os MESMOS relays da sala de verdade — e aqui eu estava
 * errado antes.
 *
 * O desenho dizia "menos relays, porque presença é enfeite". A economia não
 * existia: o Trystero abre os sockets de relay UMA vez por estratégia e os
 * compartilha entre todas as salas do mesmo `appId`. Quatro relays não
 * economizavam socket nenhum — só reduziam a chance de ouvir.
 *
 * E reduziam muito, porque vários dos primeiros relays da lista estão mortos:
 * o console mostra `chorus`, `hol.is`, `artio` e `libernet` falhando o tempo
 * todo. A sala de verdade sobrevive a isso por ter vinte; a de fundo, com
 * quatro, assinava quase só relay morto e não ouvia ninguém.
 *
 * O que continua valendo do desenho original: só nostr. As outras duas redes
 * ficam para a sala em que a pessoa está.
 *
 * `passive: true` é o que torna isto viável. Passivo não anuncia e não
 * pré-fabrica conexões, e dois passivos nunca se conectam — então um grupo em
 * que ninguém está custa zero conexões, e o tráfego de anúncio não multiplica
 * pelo número de grupos salvos.
 */


interface SalaCrua {
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
  leave(): void
}

export function abrirSalaDeFundo(codigo: string): SalaDeFundo {
  const sala = entrarNostr(
    {
      appId: APP_ID,
      passive: true,
      relayConfig: { redundancy: REDUNDANCIA },
    } as Parameters<typeof entrarNostr>[0],
    codigo,
  ) as unknown as SalaCrua

  return {
    // Atribuição, e não chamada: nesta versão do Trystero `onPeerJoin` é uma
    // PROPRIEDADE. Chamá-la como método foi o erro que uma vez quebrou uma
    // sonda de medição em silêncio, dentro de um `onclick` assíncrono.
    //
    // Um handler só por sala, e aqui isso basta: ninguém mais usa a sala de
    // fundo. Na sala de verdade há uma lista de ouvintes justamente porque
    // jogo, call e fotos disputam o mesmo evento.
    aoEntrarPeer: (cb) => { sala.onPeerJoin = cb },
    aoSairPeer: (cb) => { sala.onPeerLeave = cb },
    sair: () => { sala.leave() },
  }
}
