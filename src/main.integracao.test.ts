// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Ao contrário de `main.test.ts`, que substitui a interface `Transporte`
 * inteira, aqui só o Trystero é substituído. Isso faz o teste passar por tudo
 * que roda de verdade ao entrar numa sala: `criarSalaTrystero`,
 * `criarTransporte`, `criarCanalCall`, `ProtocoloCall`, `Midia` e a montagem
 * do `main.ts`.
 *
 * Existe porque uma regressão de "não conecto mais na sala" não apareceu em
 * nenhum teste: os que havia nunca executavam a fiação real.
 */
const salas: FakeSala[] = []

interface FakeSala {
  canais: Map<string, { send: ReturnType<typeof vi.fn>; onMessage: unknown }>
  /** O id com que a sala foi aberta — é dele que sai a colisão. */
  roomId?: string
  passiva: boolean
  onPeerJoin: ((id: string) => void) | null
  onPeerLeave: ((id: string) => void) | null
  onPeerStream: ((s: unknown, id: string, m?: unknown) => void) | null
  onPeerTrack: unknown
  addStream: ReturnType<typeof vi.fn>
  removeStream: ReturnType<typeof vi.fn>
  getPeers: () => Record<string, unknown>
  leave: ReturnType<typeof vi.fn>
}

function fabricarSala(roomId?: string, config?: { passive?: boolean }) {
    const canais = new Map<string, { send: ReturnType<typeof vi.fn>; onMessage: unknown }>()
    const sala: FakeSala = {
      canais,
      roomId,
      passiva: config?.passive === true,
      onPeerJoin: null,
      onPeerLeave: null,
      onPeerStream: null,
      onPeerTrack: null,
      addStream: vi.fn(),
      removeStream: vi.fn(),
      getPeers: () => ({}),
      leave: vi.fn(),
      // eslint-disable-next-line
      makeAction: (nome: string) => {
        const canal = { send: vi.fn(), onMessage: null }
        canais.set(nome, canal)
        return canal
      },
    } as unknown as FakeSala
  salas.push(sala)
  return sala
}

// As TRÊS redes são substituídas: a produção abre uma sala em cada, e é
// justamente a convivência delas que este arquivo existe para exercitar.
vi.mock('@trystero-p2p/nostr', () => ({
  selfId: 'eu-mesmo',
  defaultRelayUrls: ['wss://exemplo-a.test', 'wss://exemplo-b.test'],
  getRelaySockets: () => ({}),
  joinRoom: vi.fn((config: { passive?: boolean }, roomId: string) => fabricarSala(roomId, config)),
}))
vi.mock('@trystero-p2p/mqtt', () => ({
  joinRoom: vi.fn((config: { passive?: boolean }, roomId: string) => fabricarSala(roomId, config)),
}))
vi.mock('@trystero-p2p/torrent', () => ({
  joinRoom: vi.fn((config: { passive?: boolean }, roomId: string) => fabricarSala(roomId, config)),
}))

import { entrarNaSala } from './main'
import { abrirSalaDeFundo, anunciarPresenca } from './presenca/sala-de-fundo'

describe('entrar numa sala com o Trystero de mentira, mas a fiação de verdade', () => {
  beforeEach(() => {
    salas.length = 0
  })

  it('monta a sala sem estourar', () => {
    const app = document.createElement('div')

    expect(() => entrarNaSala(app, 'Alex', 'CODIGO01')).not.toThrow()
  })

  it('desenha a sala, a navegação e os controles da call', () => {
    const app = document.createElement('div')

    entrarNaSala(app, 'Alex', 'CODIGO01')

    expect(app.querySelector('.barra-sala')).not.toBeNull()
    // O trilho substituiu a antiga barra de navegação: ele é a navegação da
    // sala agora, e tem três destinos em vez de dois.
    expect(app.querySelector('.trilho')).not.toBeNull()
    expect(app.querySelector('.call-controles')).not.toBeNull()
    expect(app.querySelector('.chat')).not.toBeNull()
  })

  it('abre UMA sala por rede de descoberta, e não mais', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    // Três redes, três salas — nostr, MQTT e BitTorrent. Uma sala a mais na
    // mesma rede seria handshake duplicado com os mesmos peers.
    expect(salas).toHaveLength(3)
  })

  it('cria os canais do jogo E o da call em TODAS as redes', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    // Cada rede precisa de TODOS os canais: a pessoa pode ser alcançável por
    // qualquer uma delas, e é por ela que tudo vai trafegar. Um canal que só
    // existisse numa rede sumiria para quem foi descoberto por outra.
    for (const sala of salas) {
      expect([...sala.canais.keys()].sort())
        .toEqual(['acao', 'call', 'chat', 'estado', 'foto', 'identidade'])
    }
  })

  it('a entrada de um peer chega ao jogo E à call, sem um apagar o outro', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    expect(() => salas[0]!.onPeerJoin?.('pa')).not.toThrow()
    expect(salas[0]!.canais.get('call')!.send).toHaveBeenCalled()
  })

  it('a mesma pessoa descoberta por duas redes conta UMA vez', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    salas[0]!.onPeerJoin?.('pa')
    const enviosDepoisDaPrimeira = salas[1]!.canais.get('call')!.send.mock.calls.length
    salas[1]!.onPeerJoin?.('pa')

    // A segunda descoberta é ignorada: a rede reserva não vira um segundo
    // caminho por onde tudo trafegaria em dobro.
    expect(salas[1]!.canais.get('call')!.send.mock.calls.length)
      .toBe(enviosDepoisDaPrimeira)
  })

  it('a saída de um peer não estoura', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    expect(() => salas[0]!.onPeerLeave?.('pa')).not.toThrow()
  })
})

describe('a sala de presença nunca divide o id com a sala de verdade', () => {
  beforeEach(() => {
    salas.length = 0
    localStorage.clear()
  })

  /**
   * A regra que as quatro tentativas anteriores quebravam.
   *
   * O Trystero indexa `occupiedRooms` só pelo `roomId` e devolve a sala já
   * aberta, ignorando a config (`strategy.ts:213`). Com o mesmo código nas
   * duas salas, entrar no grupo devolvia a sala de fundo PASSIVA — e passivo
   * não anuncia nem pré-fabrica ofertas. Medido: `mesmoObjeto: true`,
   * `isPassive: true`, zero conexões pré-fabricadas.
   *
   * Este teste é a trava: se alguém voltar a usar o código puro na presença,
   * ele quebra aqui e não no notebook de alguém.
   */
  it('entrar numa sala abre as três redes com o código puro, e nenhuma passiva', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    const doCodigo = salas.filter((s) => s.roomId === 'CODIGO01')
    expect(doCodigo).toHaveLength(3)
    expect(doCodigo.every((s) => !s.passiva)).toBe(true)
  })

  it('observar um grupo abre as três redes, passivas e com id próprio', () => {
    abrirSalaDeFundo('CODIGO01')

    expect(salas).toHaveLength(3)
    expect(salas.map((s) => s.roomId)).toEqual(
      ['CODIGO01#presenca', 'CODIGO01#presenca', 'CODIGO01#presenca'])
    expect(salas.every((s) => s.passiva)).toBe(true)
  })

  it('anunciar usa o MESMO id do observador, mas ATIVO', () => {
    // O mesmo id nos dois lados é o que faz observador e anunciante se
    // encontrarem; o ativo/passivo é o que faz a conta custar quase nada.
    // Se um dos dois mudar de id, a presença passa a não ver ninguém — que é
    // exatamente o sintoma que a gente perseguiu por três dias.
    anunciarPresenca('CODIGO01')

    expect(salas.map((s) => s.roomId)).toEqual(
      ['CODIGO01#presenca', 'CODIGO01#presenca', 'CODIGO01#presenca'])
    expect(salas.every((s) => !s.passiva)).toBe(true)
  })

  it('o id da presença nunca é o código do grupo', () => {
    abrirSalaDeFundo('CODIGO01')
    anunciarPresenca('OUTROGRUPO000001')

    expect(salas.some((s) => s.roomId === 'CODIGO01')).toBe(false)
    expect(salas.some((s) => s.roomId === 'OUTROGRUPO000001')).toBe(false)
  })
})

describe('a presença conta quem DECLAROU estar no grupo', () => {
  beforeEach(() => {
    salas.length = 0
    localStorage.clear()
  })

  /**
   * Medido com duas abas: um grupo VAZIO aparecia com "1 pessoa online".
   *
   * A causa é da biblioteca. Uma sala passiva **se ativa** ao receber um
   * anúncio (`signal-handler.ts:807` → `requeueAnnounce`) e, a partir daí,
   * também anuncia. Dois observadores do mesmo grupo passam a se enxergar, e a
   * conta vira "quantos estão OLHANDO o grupo" em vez de "quantos estão NELE".
   *
   * Inferir presença de conexão não tem conserto: a conexão existe nos dois
   * casos. Por isso quem está no grupo DECLARA, e quem observa fica calado.
   */
  it('quem só observa nunca declara — senão dois observadores se contam', () => {
    const observador = abrirSalaDeFundo('CODIGO01')
    const vistos: string[] = []
    observador.aoEntrarPeer((id) => vistos.push(id))

    // Alguém conecta na sala de presença. Só conectar não é estar no grupo.
    for (const sala of salas) sala.onPeerJoin?.('outro-observador')

    expect(vistos).toEqual([])
    // E o observador não pode ter anunciado nada de volta.
    for (const sala of salas) {
      expect(sala.canais.get('aqui')!.send).not.toHaveBeenCalled()
    }
  })

  it('quem está no grupo declara para cada pessoa que chega', () => {
    anunciarPresenca('CODIGO01')

    for (const sala of salas) sala.onPeerJoin?.('quem-chegou')

    for (const sala of salas) {
      expect(sala.canais.get('aqui')!.send).toHaveBeenCalledWith(1, ['quem-chegou'])
    }
  })

  it('só a declaração conta, e uma pessoa em duas redes conta uma vez', () => {
    const observador = abrirSalaDeFundo('CODIGO01')
    const vistos: string[] = []
    observador.aoEntrarPeer((id) => vistos.push(id))

    // A mesma pessoa declara pelas três redes: `selfId` é o mesmo nas três.
    for (const sala of salas) {
      const canal = sala.canais.get('aqui') as unknown as {
        onMessage: (d: unknown, c: { peerId: string }) => void
      }
      canal.onMessage(1, { peerId: 'esta-mesmo-la' })
    }

    expect(vistos).toEqual(['esta-mesmo-la'])
  })

  it('quem declarou e sai deixa de contar', () => {
    const observador = abrirSalaDeFundo('CODIGO01')
    const saíram: string[] = []
    observador.aoSairPeer((id) => saíram.push(id))
    const canal = salas[0]!.canais.get('aqui') as unknown as {
      onMessage: (d: unknown, c: { peerId: string }) => void
    }
    canal.onMessage(1, { peerId: 'esta-mesmo-la' })

    for (const sala of salas) sala.onPeerLeave?.('esta-mesmo-la')

    expect(saíram).toEqual(['esta-mesmo-la'])
  })

  it('quem nunca declarou e sai não avisa ninguém', () => {
    const observador = abrirSalaDeFundo('CODIGO01')
    const saíram: string[] = []
    observador.aoSairPeer((id) => saíram.push(id))

    for (const sala of salas) sala.onPeerLeave?.('so-observava')

    expect(saíram).toEqual([])
  })
})
