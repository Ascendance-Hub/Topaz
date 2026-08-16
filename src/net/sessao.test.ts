import { describe, it, expect, vi } from 'vitest'
import { criarRedeFalsa } from './transport.fake'
import { elegerHost, Sessao } from './sessao'
import { rngSemente } from '../game/shoe'
import { REGRAS } from '../game/rules'

const rng = () => rngSemente(99)

describe('elegerHost', () => {
  it('escolhe o menor id em ordem lexicográfica', () => {
    expect(elegerHost(['pc', 'pa', 'pb'])).toBe('pa')
  })

  it('é estável independente da ordem de entrada', () => {
    expect(elegerHost(['pb', 'pa'])).toBe(elegerHost(['pa', 'pb']))
  })

  it('devolve o único id quando só há um', () => {
    expect(elegerHost(['pz'])).toBe('pz')
  })
})

describe('Sessao', () => {
  it('o menor peerId se reconhece como host', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    expect(a.souHost()).toBe(true)
    expect(b.souHost()).toBe(false)
  })

  it('propaga o estado do host para o cliente', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    a.entrar('Alex')
    b.entrar('Bruno')

    expect(b.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
  })

  it('o cliente não altera o próprio estado diretamente', () => {
    const rede = criarRedeFalsa()
    new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    b.despachar({ tipo: 'entrar', apelido: 'Bruno' })

    // o estado do cliente só muda quando o snapshot do host chega
    expect(b.estado().jogadores).toHaveLength(1)
    expect(b.estado().jogadores[0]!.peerId).toBe('pb')
  })

  it('o host descarta ação inválida em silêncio', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    b.despachar({ tipo: 'apostar', valor: 999999 })

    expect(b.estado().jogadores.find((j) => j.peerId === 'pb')!.maos).toHaveLength(0)
  })

  it('notifica os assinantes quando o estado muda', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const mudou = vi.fn()
    a.aoMudar(mudou)

    a.entrar('Alex')

    expect(mudou).toHaveBeenCalled()
  })
})

describe('migração de host', () => {
  it('o próximo peer assume quando o host sai', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    expect(b.souHost()).toBe(false)
    tA.sair()

    expect(b.souHost()).toBe(true)
    expect(b.estado().hostAtual).toBe('pb')
  })

  it('o novo host preserva jogadores e fichas', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    b.despachar({ tipo: 'sentar', cadeira: 0 })

    tA.sair()

    const bruno = b.estado().jogadores.find((j) => j.peerId === 'pb')!
    expect(bruno.fichas).toBe(REGRAS.stackInicial)
    expect(bruno.cadeira).toBe(0)
  })

  it('o novo host reconstrói uma sapata sem as cartas já vistas', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    a.despachar({ tipo: 'sentar', cadeira: 0 })
    b.despachar({ tipo: 'sentar', cadeira: 1 })
    a.despachar({ tipo: 'apostar', valor: 100 })
    b.despachar({ tipo: 'apostar', valor: 100 })

    const vistasAntes = b.estado().jogadores.flatMap((j) =>
      j.maos.flatMap((m) => m.cartas),
    ).length

    tA.sair()

    expect(b.souHost()).toBe(true)
    // A sapata reconstruída desconta exatamente as cartas visíveis (mãos dos
    // jogadores + carta aberta do dealer). A carta oculta do dealer nunca foi
    // transmitida, então o novo host compra uma substituta — esse saque, como
    // qualquer outro, consome mais uma carta da sapata reconstruída.
    const cartasVistasTotais = vistasAntes + b.estado().maoDealer.length
    expect(b.estado().cartasRestantes)
      .toBe(REGRAS.numBaralhos * 52 - cartasVistasTotais - 1)
  })

  it('marca quem saiu como ausente em vez de remover na hora', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    tA.sair()

    const alex = b.estado().jogadores.find((j) => j.apelido === 'Alex')
    expect(alex).toBeDefined()
    expect(alex!.desconectadoEm).not.toBeNull()
  })
})

describe('reconexão', () => {
  it('devolve cadeira e fichas a quem volta dentro da janela', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const tBAntigo = rede.conectar('pb')
    const b = new Sessao(tBAntigo, rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    b.despachar({ tipo: 'sentar', cadeira: 2 })

    // Bruno cai...
    tBAntigo.sair()
    // ...e volta com outro peerId, mesmo apelido.
    const tB = rede.conectar('pb-novo')
    rede.conectar('pz') // um terceiro peer na mesa, sem efeito na eleição ('pa' continua o menor)
    const bruno = new Sessao(tB, rng)
    bruno.entrar('Bruno')

    const voltou = a.estado().jogadores.find((j) => j.apelido === 'Bruno')!
    expect(voltou.cadeira).toBe(2)
    expect(voltou.fichas).toBe(REGRAS.stackInicial)
  })

  it('remove o ausente depois da janela de reconexão', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const tB = rede.conectar('pb')
    const b = new Sessao(tB, rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    tB.sair()
    expect(a.estado().jogadores).toHaveLength(2)

    a.tique(Date.now() + REGRAS.segundosReconexao * 1000 + 1)

    expect(a.estado().jogadores.map((j) => j.apelido)).toEqual(['Alex'])
  })
})
