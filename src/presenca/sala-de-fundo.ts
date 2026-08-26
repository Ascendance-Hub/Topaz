import { joinRoom as entrarNostr } from '@trystero-p2p/nostr'
import { APP_ID } from '../net/transport'
import type { SalaDeFundo } from './presenca'

/**
 * A sala de um grupo que você NÃO abriu.
 *
 * Só nostr, e com poucos relays. A sala em que a pessoa está usa as três redes
 * de descoberta e vinte relays porque conectar ali é obrigação; aqui é
 * enfeite, e enfeite não pode ameaçar a peça que mais custou para funcionar
 * neste projeto.
 *
 * `passive: true` é o que torna isto viável. Passivo não anuncia e não
 * pré-fabrica conexões, e dois passivos nunca se conectam — então um grupo em
 * que ninguém está custa zero conexões, e o tráfego de anúncio não multiplica
 * pelo número de grupos salvos.
 */
export const RELAYS_DE_FUNDO = 4

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
      relayConfig: { redundancy: RELAYS_DE_FUNDO },
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
