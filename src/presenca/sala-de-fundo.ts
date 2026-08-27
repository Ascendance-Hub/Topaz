/**
 * A sala de presença de um grupo.
 *
 * **O id é próprio, e é ele o conserto** — ver `idDePresenca`.
 *
 * **As três redes**, e essa foi a outra correção — a que fechou a caçada.
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


import { joinRoom as entrarNostr } from '@trystero-p2p/nostr'
import { joinRoom as entrarMqtt } from '@trystero-p2p/mqtt'
import { joinRoom as entrarTorrent } from '@trystero-p2p/torrent'
import { APP_ID, REDUNDANCIA } from '../net/transport'
import { avisarTodos } from '../net/avisar'
import type { SalaDeFundo } from './presenca'
import { idDePresenca } from './id'

interface CanalCru {
  send: (dados: unknown, para?: string[]) => unknown
  onMessage: ((dados: unknown, contexto: { peerId: string }) => void) | null
}

interface SalaCrua {
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
  makeAction(nome: string): CanalCru
  leave(): Promise<void> | void
}

/**
 * O anúncio de que você está MESMO no grupo.
 *
 * Curto de propósito: o Trystero limita o nome da ação a 12 bytes.
 */
const ACAO_AQUI = 'aqui'

/**
 * Observar um grupo que você NÃO abriu: passivo, e por isso quase de graça.
 *
 * Passivo não anuncia, não pré-fabrica conexões, e dois passivos nunca se
 * conectam — um grupo em que ninguém está custa conexão nenhuma.
 */
export function abrirSalaDeFundo(codigo: string): SalaDeFundo {
  return entrarNaPresenca(codigo, true)
}

/**
 * Anunciar que VOCÊ está neste grupo: ativo.
 *
 * É a metade que faz a presença existir — sem alguém ativo, os observadores
 * passivos ficam se olhando e ninguém aparece para ninguém.
 *
 * Vale para o grupo que você abriu, e só para ele: o app entra aqui **depois**
 * de a sala de verdade estar de pé, nunca junto. Ver `main.ts`.
 */
export function anunciarPresenca(codigo: string): SalaDeFundo {
  return entrarNaPresenca(codigo, false)
}

function entrarNaPresenca(codigo: string, passivo: boolean): SalaDeFundo {
  const config = {
    appId: APP_ID,
    ...(passivo ? { passive: true } : {}),
    relayConfig: { redundancy: REDUNDANCIA },
  }

  // Um objeto de configuração POR REDE. O app compartilha um só entre as três
  // e passa bem, porque as estratégias só leem — mas configuração
  // compartilhada é o tipo de coisa que só machuca no dia em que alguém
  // escrever nela, e esse dia não avisa.
  const nova = (): Parameters<typeof entrarNostr>[0] =>
    ({ ...config, relayConfig: { ...config.relayConfig } }) as Parameters<typeof entrarNostr>[0]

  const id = idDePresenca(codigo)
  const salas: SalaCrua[] = [
    entrarNostr(nova(), id) as unknown as SalaCrua,
    entrarMqtt(nova(), id) as unknown as SalaCrua,
    entrarTorrent(nova(), id) as unknown as SalaCrua,
  ]

  /**
   * Contar quem DECLAROU estar no grupo, e não quem apenas conectou.
   *
   * Foi assim que "1 pessoa online" aparecia num grupo vazio, e a causa é da
   * biblioteca: uma sala passiva **se ativa** ao receber um anúncio
   * (`signal-handler.ts:807` → `requeueAnnounce`) e, a partir daí, **também
   * anuncia**. Dois observadores do mesmo grupo passam a se enxergar, e a
   * conta vira "quantos estão OLHANDO o grupo" em vez de "quantos estão NELE".
   *
   * Inferir presença de conexão não tem conserto: a conexão existe nos dois
   * casos. Então a gente pergunta. Quem está de verdade no grupo manda `aqui`;
   * quem só observa nunca manda, e some da conta de todo mundo.
   *
   * O anúncio é reenviado a cada pessoa que chega, e não uma vez só: quem
   * conecta depois não tem como pedir, e um anúncio completo repetido é o
   * mesmo padrão que o resto do projeto usa para se consertar sozinho.
   */
  const canais = salas.map((s) => s.makeAction(ACAO_AQUI))
  const declararam = new Set<string>()
  /**
   * Listas, e não um slot só — como `net/salas.ts` já faz.
   *
   * `onPeerJoin` do Trystero guarda um handler único, e copiar esse formato
   * aqui era copiar a armadilha junto: atribuir de novo apaga o anterior, em
   * silêncio, sem erro no console.
   *
   * Hoje há um consumidor só (a contagem), então lista e slot fazem o mesmo.
   * A feature de amigos põe um segundo — a `Apresentacao`, que prova quem é
   * quem para a presença poder dizer *quem* e não só *quantos* —, e aí o
   * segundo inscrito apagaria o primeiro sem nenhuma pista.
   *
   * `avisarTodos` ainda isola o estouro de um ouvinte para que ele não leve os
   * outros junto: uma entrada de peer alimentaria a contagem E a prova de
   * identidade, e um `for` cru entrega só até o primeiro erro.
   */
  const aoEntrar: ((peerId: string) => void)[] = []
  const aoSair: ((peerId: string) => void)[] = []

  salas.forEach((sala, i) => {
    sala.onPeerJoin = (peerId) => {
      // Só quem está no grupo declara. O observador fica calado — é isso que
      // impede dois observadores de contarem um ao outro.
      if (!passivo) canais[i]?.send(1, [peerId])
    }
    sala.onPeerLeave = (peerId) => {
      if (!declararam.delete(peerId)) return
      avisarTodos(aoSair, peerId)
    }
    const canal = canais[i]
    if (canal) {
      canal.onMessage = (_dados, { peerId }) => {
        // `Set` já deduplica: a mesma pessoa achada por duas redes, ou o
        // reenvio periódico, não podem virar duas.
        if (declararam.has(peerId)) return
        declararam.add(peerId)
        avisarTodos(aoEntrar, peerId)
      }
    }
  })

  return {
    aoEntrarPeer: (cb) => { aoEntrar.push(cb) },
    aoSairPeer: (cb) => { aoSair.push(cb) },
    // Devolve promessa, e isso NÃO é detalhe: `fecharUm` espera esta saída
    // antes de entrar no grupo de verdade, porque o Trystero devolve a mesma
    // sala num id já aberto. Antes o `sair` devolvia `void`, o `await`
    // resolvia na hora e a proteção não protegia nada.
    sair: () => Promise.all(salas.map((s) => Promise.resolve(s.leave()).catch(() => {})))
      .then(() => undefined),
  }
}
