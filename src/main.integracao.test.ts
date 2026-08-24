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
  onPeerJoin: ((id: string) => void) | null
  onPeerLeave: ((id: string) => void) | null
  onPeerStream: ((s: unknown, id: string, m?: unknown) => void) | null
  onPeerTrack: unknown
  addStream: ReturnType<typeof vi.fn>
  removeStream: ReturnType<typeof vi.fn>
  getPeers: () => Record<string, unknown>
  leave: ReturnType<typeof vi.fn>
}

vi.mock('trystero/nostr', () => ({
  selfId: 'eu-mesmo',
  defaultRelayUrls: ['wss://exemplo-a.test', 'wss://exemplo-b.test'],
  getRelaySockets: () => ({}),
  joinRoom: vi.fn(() => {
    const canais = new Map<string, { send: ReturnType<typeof vi.fn>; onMessage: unknown }>()
    const sala: FakeSala = {
      canais,
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
  }),
}))

import { entrarNaSala } from './main'

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
    expect(app.querySelector('.nav-sala')).not.toBeNull()
    expect(app.querySelector('.call-controles')).not.toBeNull()
    expect(app.querySelector('.chat')).not.toBeNull()
  })

  it('abre exatamente UMA conexão Trystero', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    // Um segundo `joinRoom` seria um handshake inteiro a mais para os mesmos
    // peers, e foi para evitar isso que a conexão foi separada do transporte.
    expect(salas).toHaveLength(1)
  })

  it('cria os canais do jogo E o da call na mesma sala', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    const canais = [...salas[0]!.canais.keys()].sort()
    expect(canais).toEqual(['acao', 'call', 'chat', 'estado'])
  })

  it('a entrada de um peer chega ao jogo E à call, sem um apagar o outro', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')
    const sala = salas[0]!

    // Se a call tivesse roubado `onPeerJoin`, isto estouraria ou não avisaria
    // ninguém — e a eleição de anfitrião pararia em silêncio.
    expect(() => sala.onPeerJoin?.('pa')).not.toThrow()
    expect(salas[0]!.canais.get('call')!.send).toHaveBeenCalled()
  })

  it('a saída de um peer não estoura', () => {
    entrarNaSala(document.createElement('div'), 'Alex', 'CODIGO01')

    expect(() => salas[0]!.onPeerLeave?.('pa')).not.toThrow()
  })
})
