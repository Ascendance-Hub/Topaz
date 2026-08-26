import { joinRoom as entrarNostr } from '@trystero-p2p/nostr'
import { joinRoom as entrarMqtt } from '@trystero-p2p/mqtt'
import { joinRoom as entrarTorrent } from '@trystero-p2p/torrent'
import { APP_ID, REDUNDANCIA } from '../net/transport'
import type { SalaDeFundo } from './presenca'

/**
 * A sala de um grupo que você NÃO abriu.
 *
 * **As três redes**, e essa é a correção que fechou a caçada.
 *
 * A presença era só nostr, por uma decisão de custo que parecia sensata. O
 * diagnóstico do app mostrou por que ela nunca funcionou:
 *
 *     sala (15s): relays nostr abertos 16 · peers 1
 *                 · por rede: nostr=0 mqtt=1 torrent=0
 *
 * As máquinas do teste se acham por **mqtt**. Um observador de nostr esperava
 * numa rede em que aquelas pessoas não aparecem — e por isso sonda passiva,
 * sonda ativa e o módulo falharam todos contra o app, enquanto os três
 * funcionavam contra outra sonda, que também era só nostr.
 *
 * O torrent entra junto porque `torrent=0` significa "não chegou primeiro", e
 * não "não conectaria": quem acha antes fica dono do peer, e o outro nem
 * aparece na conta. Deixá-lo de fora seria apostar sem motivo — e a rede que
 * conecta uma pessoa não é a mesma que conecta outra.
 *
 * Fica honesto dizer o que continua sem explicação: entre as MESMAS duas
 * máquinas, o nostr acha uma sonda e não acha o app. Isso não foi resolvido —
 * foi contornado, ouvindo todas as redes em vez de adivinhar qual.
 *
 * **E o custo continua perto de zero**, que é o que torna isso razoável:
 * passivo não anuncia, não pré-fabrica conexões, e dois passivos nunca se
 * conectam. Um grupo em que ninguém está custa conexão nenhuma. Os sockets de
 * relay são compartilhados por estratégia — quando você está numa sala, as
 * três já estão abertas de qualquer jeito.
 *
 * A exceção honesta é o torrent: lá o passivo se anuncia como *seeder*, sem
 * ofertas. É um pouco mais de tráfego que nas outras duas, e ainda assim
 * nenhuma conexão.
 */

interface SalaCrua {
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
  leave(): Promise<void> | void
}

export function abrirSalaDeFundo(codigo: string): SalaDeFundo {
  const config = {
    appId: APP_ID,
    passive: true,
    relayConfig: { redundancy: REDUNDANCIA },
  }

  // Um objeto de configuração POR REDE. O app compartilha um só entre as três
  // e passa bem, porque as estratégias só leem — mas configuração
  // compartilhada é o tipo de coisa que só machuca no dia em que alguém
  // escrever nela, e esse dia não avisa.
  const nova = (): Parameters<typeof entrarNostr>[0] =>
    ({ ...config, relayConfig: { ...config.relayConfig } }) as Parameters<typeof entrarNostr>[0]

  const salas: SalaCrua[] = [
    entrarNostr(nova(), codigo) as unknown as SalaCrua,
    entrarMqtt(nova(), codigo) as unknown as SalaCrua,
    entrarTorrent(nova(), codigo) as unknown as SalaCrua,
  ]

  return {
    // As três redes chamam o MESMO ouvinte, e quem conta desduplica por
    // peerId: a mesma pessoa achada em duas não pode virar duas.
    //
    // Atribuição, e não chamada: nesta versão do Trystero `onPeerJoin` é uma
    // propriedade. Um handler só por sala, e aqui basta — ninguém mais usa a
    // sala de fundo.
    aoEntrarPeer: (cb) => { for (const s of salas) s.onPeerJoin = cb },
    aoSairPeer: (cb) => { for (const s of salas) s.onPeerLeave = cb },
    // Devolve promessa, e isso NÃO é detalhe: `fecharUm` espera esta saída
    // antes de entrar no grupo de verdade, porque o Trystero devolve a mesma
    // sala num id já aberto. Antes o `sair` devolvia `void`, o `await`
    // resolvia na hora e a proteção não protegia nada.
    sair: () => Promise.all(salas.map((s) => Promise.resolve(s.leave()).catch(() => {})))
      .then(() => undefined),
  }
}
