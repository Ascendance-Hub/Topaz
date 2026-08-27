// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A armadilha que este arquivo guarda.
 *
 * `onPeerJoin` do Trystero é um slot de handler ÚNICO — atribuir de novo apaga
 * o anterior, em silêncio, sem erro no console. A sala de fundo copiava esse
 * formato (`aoEntrarPeer: (cb) => { aoEntrar = cb }`), e `net/salas.ts` já
 * tinha resolvido o mesmo problema com lista de ouvintes.
 *
 * Hoje não dói: só existe um consumidor da sala de presença, que é a contagem
 * de quem está online no grupo.
 *
 * **A feature de amigos põe um segundo.** A `Apresentacao` — que prova quem é
 * quem assinando um desafio — recebe uma interface estreita
 * (`aoEntrarPeer`/`aoSairPeer`/`enviarIdentidade`/`aoReceberIdentidade`) e é
 * exatamente o que vai escutar essa sala para dizer *quem* está no grupo, e não
 * só *quantos*. Com slot único, o segundo inscrito apagaria o primeiro e a
 * contagem pararia de funcionar sem nenhuma pista — o sintoma mais caro de
 * diagnosticar deste projeto.
 *
 * Estes testes falham antes da correção e passam depois. Eles não mudam nada
 * do comportamento de hoje: com um ouvinte só, lista e slot fazem o mesmo.
 */

interface CanalFalso {
  send: ReturnType<typeof vi.fn>
  onMessage: ((dados: unknown, contexto: { peerId: string }) => void) | null
}

interface SalaFalsa {
  onPeerJoin: ((id: string) => void) | null
  onPeerLeave: ((id: string) => void) | null
  canal: CanalFalso
  leave: ReturnType<typeof vi.fn>
}

const salas: SalaFalsa[] = []

function fabricarSala(): SalaFalsa {
  const canal: CanalFalso = { send: vi.fn(), onMessage: null }
  const sala = {
    onPeerJoin: null,
    onPeerLeave: null,
    canal,
    makeAction: () => canal,
    leave: vi.fn().mockResolvedValue(undefined),
  } as unknown as SalaFalsa
  salas.push(sala)
  return sala
}

// As três redes: a sala de fundo abre uma em cada, e a contagem desduplica por
// pessoa entre elas.
vi.mock('@trystero-p2p/nostr', () => ({
  selfId: 'eu-mesmo',
  defaultRelayUrls: ['wss://exemplo-a.test', 'wss://exemplo-b.test'],
  getRelaySockets: () => ({}),
  joinRoom: vi.fn(() => fabricarSala()),
}))
vi.mock('@trystero-p2p/mqtt', () => ({ joinRoom: vi.fn(() => fabricarSala()) }))
vi.mock('@trystero-p2p/torrent', () => ({ joinRoom: vi.fn(() => fabricarSala()) }))

import { abrirSalaDeFundo, anunciarPresenca } from './sala-de-fundo'

const CODIGO = 'AAAABBBBCCCCDDDD'

/** A declaração `aqui` chegando pela primeira rede. */
function alguemDeclara(peerId: string, rede = 0): void {
  salas[rede]!.canal.onMessage?.(1, { peerId })
}

describe('a sala de fundo avisa TODOS os ouvintes', () => {
  beforeEach(() => { salas.length = 0 })

  it('abre uma sala por rede', () => {
    abrirSalaDeFundo(CODIGO)

    expect(salas).toHaveLength(3)
  })

  it('dois inscritos em aoEntrarPeer: os dois são chamados', () => {
    const fundo = abrirSalaDeFundo(CODIGO)
    const primeiro = vi.fn()
    const segundo = vi.fn()

    fundo.aoEntrarPeer(primeiro)
    fundo.aoEntrarPeer(segundo)
    // Só a DECLARAÇÃO conta: quem apenas observa fica calado, e é isso que
    // impede dois observadores de contarem um ao outro.
    alguemDeclara('pa')

    expect(primeiro).toHaveBeenCalledWith('pa')
    expect(segundo).toHaveBeenCalledWith('pa')
  })

  it('dois inscritos em aoSairPeer: os dois são chamados', () => {
    const fundo = abrirSalaDeFundo(CODIGO)
    const primeiro = vi.fn()
    const segundo = vi.fn()

    fundo.aoEntrarPeer(() => {})
    fundo.aoSairPeer(primeiro)
    fundo.aoSairPeer(segundo)
    alguemDeclara('pa')
    salas[0]!.onPeerLeave?.('pa')

    expect(primeiro).toHaveBeenCalledWith('pa')
    expect(segundo).toHaveBeenCalledWith('pa')
  })

  it('um ouvinte que estoura não impede o outro de ser avisado', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const fundo = abrirSalaDeFundo(CODIGO)
      const segundo = vi.fn()

      fundo.aoEntrarPeer(() => { throw new Error('estourei') })
      fundo.aoEntrarPeer(segundo)
      alguemDeclara('pa')

      expect(segundo).toHaveBeenCalledWith('pa')
      expect(erro).toHaveBeenCalled()
    } finally {
      erro.mockRestore()
    }
  })

  it('a mesma pessoa declarando por duas redes conta uma vez só', () => {
    const fundo = abrirSalaDeFundo(CODIGO)
    const visto = vi.fn()
    fundo.aoEntrarPeer(visto)

    alguemDeclara('pa', 0)
    alguemDeclara('pa', 1)

    expect(visto).toHaveBeenCalledTimes(1)
  })

  it('quem anuncia (ativo) declara para cada pessoa que chega', () => {
    anunciarPresenca(CODIGO)

    salas[0]!.onPeerJoin?.('pa')

    expect(salas[0]!.canal.send).toHaveBeenCalledWith(1, ['pa'])
  })

  it('quem só observa (passivo) nunca declara', () => {
    abrirSalaDeFundo(CODIGO)

    salas[0]!.onPeerJoin?.('pa')

    expect(salas[0]!.canal.send).not.toHaveBeenCalled()
  })
})
