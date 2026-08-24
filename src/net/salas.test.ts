import { describe, it, expect, vi } from 'vitest'
import { fundirSalas } from './salas'
import type { SalaNomeada } from './salas'

/** Sala do Trystero de mentira, com os ganchos que a fusão usa. */
function salaFalsa(nome: string) {
  const canais = new Map<string, { send: ReturnType<typeof vi.fn>; onMessage: unknown }>()
  const bruta = {
    makeAction: (n: string) => {
      const canal = { send: vi.fn(), onMessage: null }
      canais.set(n, canal)
      return canal
    },
    getPeers: () => ({}),
    leave: vi.fn(),
    onPeerJoin: null as ((id: string) => void) | null,
    onPeerLeave: null as ((id: string) => void) | null,
  }
  return { nomeada: { nome, sala: bruta } as unknown as SalaNomeada, bruta, canais }
}

function tresRedes() {
  const a = salaFalsa('nostr')
  const b = salaFalsa('mqtt')
  const c = salaFalsa('torrent')
  return { a, b, c, salas: fundirSalas([a.nomeada, b.nomeada, c.nomeada]) }
}

describe('fundirSalas — quem é dono de cada peer', () => {
  it('a primeira rede que trouxer a pessoa fica com ela', () => {
    const { a, b, salas } = tresRedes()

    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p1')

    expect(salas.donoDe('p1')).toBe(a.nomeada.sala)
  })

  it('avisa a entrada UMA vez, mesmo descoberta pelas três', () => {
    const { a, b, c, salas } = tresRedes()
    const entrou = vi.fn()
    salas.aoEntrarPeer(entrou)

    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p1')
    c.bruta.onPeerJoin!('p1')

    // Avisar três vezes faria a `Sessao` tratar a mesma pessoa como três.
    expect(entrou).toHaveBeenCalledTimes(1)
  })

  it('lista cada peer uma vez só', () => {
    const { a, b, salas } = tresRedes()

    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p2')

    expect(salas.peers().sort()).toEqual(['p1', 'p2'])
  })

  it('a saída pela rede que NÃO é dona não derruba ninguém', () => {
    const { a, b, salas } = tresRedes()
    const saiu = vi.fn()
    salas.aoSairPeer(saiu)
    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p1')

    b.bruta.onPeerLeave!('p1')

    // A conexão que vale continua de pé; só a duplicata caiu.
    expect(saiu).not.toHaveBeenCalled()
    expect(salas.peers()).toEqual(['p1'])
  })

  it('a saída pela rede dona derruba, e outra rede pode readotar', () => {
    const { a, b, salas } = tresRedes()
    const saiu = vi.fn()
    const entrou = vi.fn()
    salas.aoSairPeer(saiu)
    salas.aoEntrarPeer(entrou)
    a.bruta.onPeerJoin!('p1')

    a.bruta.onPeerLeave!('p1')
    expect(saiu).toHaveBeenCalledWith('p1')

    b.bruta.onPeerJoin!('p1')
    expect(salas.donoDe('p1')).toBe(b.nomeada.sala)
    expect(entrou).toHaveBeenCalledTimes(2)
  })
})

describe('fundirSalas — envio dirigido', () => {
  it('manda só pela rede dona de cada peer', () => {
    const { a, b, salas } = tresRedes()
    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p2')
    const acao = salas.criarAcao<string>('teste')

    acao.send('oi')

    // Sem dirigir, a pessoa conectada em duas redes receberia duas vezes.
    expect(a.canais.get('teste')!.send).toHaveBeenCalledWith('oi', { target: ['p1'] })
    expect(b.canais.get('teste')!.send).toHaveBeenCalledWith('oi', { target: ['p2'] })
  })

  it('não manda nada por uma rede sem peers próprios', () => {
    const { a, c, salas } = tresRedes()
    a.bruta.onPeerJoin!('p1')
    const acao = salas.criarAcao<string>('teste')

    acao.send('oi')

    expect(c.canais.get('teste')!.send).not.toHaveBeenCalled()
  })

  it('envio a um destinatário usa só a rede dona dele', () => {
    const { a, b, salas } = tresRedes()
    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p2')
    const acao = salas.criarAcao<string>('teste')

    acao.send('oi', 'p2')

    expect(a.canais.get('teste')!.send).not.toHaveBeenCalled()
    expect(b.canais.get('teste')!.send).toHaveBeenCalledWith('oi', { target: ['p2'] })
  })
})

describe('fundirSalas — recebimento sem duplicata', () => {
  it('aceita o que vem da rede dona', () => {
    const { a, salas } = tresRedes()
    a.bruta.onPeerJoin!('p1')
    const acao = salas.criarAcao<string>('teste')
    const recebido = vi.fn()
    acao.onMessage(recebido)

    ;(a.canais.get('teste')! as { onMessage: (d: string, c: { peerId: string }) => void })
      .onMessage('oi', { peerId: 'p1' })

    expect(recebido).toHaveBeenCalledWith('oi', 'p1')
  })

  it('descarta o que vem por uma rede que não é dona daquele peer', () => {
    const { a, b, salas } = tresRedes()
    a.bruta.onPeerJoin!('p1')
    b.bruta.onPeerJoin!('p1')
    const acao = salas.criarAcao<string>('teste')
    const recebido = vi.fn()
    acao.onMessage(recebido)

    ;(b.canais.get('teste')! as { onMessage: (d: string, c: { peerId: string }) => void })
      .onMessage('oi', { peerId: 'p1' })

    // A mesma mensagem chegaria duas vezes, e a `Sessao` aplicaria a ação em
    // dobro — apostar duas vezes, sentar duas vezes.
    expect(recebido).not.toHaveBeenCalled()
  })
})
