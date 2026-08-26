import { joinRoom as entrarNostr } from '@trystero-p2p/nostr'
import { joinRoom as entrarMqtt } from '@trystero-p2p/mqtt'
import { APP_ID, REDUNDANCIA } from '../net/transport'
import type { SalaDeFundo } from './presenca'

/**
 * A sala de um grupo que você NÃO abriu.
 *
 * **Nostr E mqtt**, e essa é a correção que fechou a caçada.
 *
 * A presença era só nostr, por uma decisão de custo que parecia sensata. O
 * diagnóstico do app mostrou por que ela nunca funcionou:
 *
 *     sala (15s): relays nostr abertos 16 · peers 1
 *                 · por rede: nostr=0 mqtt=1 torrent=0
 *
 * As máquinas do teste se acham por **mqtt**. Um observador de nostr esperava
 * numa rede em que aquelas pessoas simplesmente não aparecem — e por isso
 * sonda passiva, sonda ativa e o módulo falharam todos contra o app, enquanto
 * os três funcionavam contra outra sonda, que também era só nostr.
 *
 * Fica honesto dizer o que continua sem explicação: entre as MESMAS duas
 * máquinas, o nostr acha uma sonda e não acha o app. Isso não foi resolvido —
 * foi contornado, usando a rede que comprovadamente conecta essas máquinas.
 *
 * O torrent fica de fora: os trackers falham no console o tempo todo, e a
 * terceira rede aumentaria o custo sem evidência de ganho. Se um dia a
 * presença falhar de novo, ele é o próximo a entrar.
 *
 * `passive: true` nas duas: passivo não anuncia e não pré-fabrica conexões, e
 * dois passivos nunca se conectam. Um grupo em que ninguém está continua
 * custando zero conexões.
 */

interface SalaCrua {
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
  leave(): void
}

export function abrirSalaDeFundo(codigo: string): SalaDeFundo {
  const config = {
    appId: APP_ID,
    passive: true,
    relayConfig: { redundancy: REDUNDANCIA },
  } as Parameters<typeof entrarNostr>[0]

  // Um objeto de configuração POR REDE. O app compartilha um só entre as três
  // e passa bem, porque as estratégias só leem — mas uma configuração
  // compartilhada é o tipo de coisa que só machuca no dia em que alguém
  // escrever nela, e esse dia não avisa.
  const salas: SalaCrua[] = [
    entrarNostr(config, codigo) as unknown as SalaCrua,
    entrarMqtt({ ...config }, codigo) as unknown as SalaCrua,
  ]

  return {
    // As duas redes chamam o MESMO ouvinte, e quem conta desduplica por
    // peerId: a mesma pessoa achada nas duas não pode virar duas.
    //
    // Atribuição, e não chamada: nesta versão do Trystero `onPeerJoin` é uma
    // propriedade. Um handler só por sala, e aqui basta — ninguém mais usa a
    // sala de fundo.
    aoEntrarPeer: (cb) => { for (const s of salas) s.onPeerJoin = cb },
    aoSairPeer: (cb) => { for (const s of salas) s.onPeerLeave = cb },
    sair: () => { for (const s of salas) s.leave() },
  }
}
