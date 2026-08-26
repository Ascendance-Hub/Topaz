import { describe, it, expect, vi } from 'vitest'
import type { Acao } from '../game/types'
import { criarRedeFalsa } from './transport.fake'

describe('rede falsa', () => {
  it('entrega ação de um peer a outro', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const recebido = vi.fn()
    b.aoReceberAcao(recebido)

    a.enviarAcao({ tipo: 'entrar', apelido: 'Alex' })

    expect(recebido).toHaveBeenCalledWith({ tipo: 'entrar', apelido: 'Alex' }, 'p1')
  })

  it('não entrega a mensagem de volta ao remetente', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    rede.conectar('p2')
    const recebido = vi.fn()
    a.aoReceberAcao(recebido)

    a.enviarAcao({ tipo: 'levantar' })

    expect(recebido).not.toHaveBeenCalled()
  })

  it('entrega mensagem de chat de um peer a outro', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const recebido = vi.fn()
    b.aoReceberMensagem(recebido)

    a.enviarMensagem('boa mão', 'geral')

    expect(recebido).toHaveBeenCalledWith('boa mão', 'p1', 'geral')
  })

  it('não entrega a própria mensagem de chat de volta ao remetente', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    rede.conectar('p2')
    const recebido = vi.fn()
    a.aoReceberMensagem(recebido)

    a.enviarMensagem('boa mão', 'geral')

    expect(recebido).not.toHaveBeenCalled()
  })

  it('avisa os existentes quando um peer entra', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const entrou = vi.fn()
    a.aoEntrarPeer(entrou)

    rede.conectar('p2')

    expect(entrou).toHaveBeenCalledWith('p2')
  })

  it('avisa os restantes quando um peer sai', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const saiu = vi.fn()
    a.aoSairPeer(saiu)

    b.sair()

    expect(saiu).toHaveBeenCalledWith('p2')
    expect(a.peers()).toEqual([])
  })

  it('lista os peers conectados sem incluir a si mesmo', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    rede.conectar('p2')
    rede.conectar('p3')

    expect(a.peers().sort()).toEqual(['p2', 'p3'])
  })

  it('o peer recém-entrado já aparece em peers() dentro do próprio callback aoEntrarPeer', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    let peersNoMomentoDoEvento: string[] = []
    a.aoEntrarPeer(() => {
      peersNoMomentoDoEvento = a.peers()
    })

    rede.conectar('p2')

    expect(peersNoMomentoDoEvento).toEqual(['p2'])
  })

  it('não entrega a mesma referência: mutar a ação recebida não afeta o original do remetente', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const original: Acao = { tipo: 'entrar', apelido: 'Alex' }
    let recebida: Acao | undefined
    b.aoReceberAcao((acao) => {
      recebida = acao
    })

    a.enviarAcao(original)
    if (recebida?.tipo === 'entrar') recebida.apelido = 'Adulterado'

    expect(original.tipo === 'entrar' && original.apelido).toBe('Alex')
  })

  it('não entrega a mesma referência a dois peers: mutar a cópia de um não afeta a do outro', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const c = rede.conectar('p3')
    let recebidaPorB: Acao | undefined
    let recebidaPorC: Acao | undefined
    b.aoReceberAcao((acao) => {
      recebidaPorB = acao
    })
    c.aoReceberAcao((acao) => {
      recebidaPorC = acao
    })

    a.enviarAcao({ tipo: 'entrar', apelido: 'Alex' })
    if (recebidaPorB?.tipo === 'entrar') recebidaPorB.apelido = 'Adulterado'

    expect(recebidaPorC?.tipo === 'entrar' && recebidaPorC.apelido).toBe('Alex')
  })
})

describe('rede falsa com conexão diferida', () => {
  it('peers() começa vazio para todo mundo, como no Trystero real', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')

    expect(a.peers()).toEqual([])
    expect(b.peers()).toEqual([])
  })

  it('não dispara aoEntrarPeer na conexão, só no bombeamento', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('p1')
    const entrouEmA = vi.fn()
    a.aoEntrarPeer(entrouEmA)

    const b = rede.conectar('p2')
    const entrouEmB = vi.fn()
    b.aoEntrarPeer(entrouEmB)
    expect(entrouEmA).not.toHaveBeenCalled()

    rede.bombear()

    // Os dois lados são avisados: o Trystero dispara `onPeerJoin` em quem já
    // estava e em quem chegou.
    expect(entrouEmA).toHaveBeenCalledWith('p2')
    expect(entrouEmB).toHaveBeenCalledWith('p1')
    expect(a.peers()).toEqual(['p2'])
  })

  it('mensagem enviada antes do bombeamento não chega a ninguém', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const recebido = vi.fn()
    b.aoReceberAcao(recebido)

    a.enviarAcao({ tipo: 'levantar' })
    expect(recebido).not.toHaveBeenCalled()

    rede.bombear()
    a.enviarAcao({ tipo: 'levantar' })
    expect(recebido).toHaveBeenCalledWith({ tipo: 'levantar' }, 'p1')
  })

  it('bombear é idempotente: não redispara aoEntrarPeer para quem já se conhece', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('p1')
    const entrou = vi.fn()
    a.aoEntrarPeer(entrou)
    rede.conectar('p2')

    rede.bombear()
    rede.bombear()

    expect(entrou).toHaveBeenCalledTimes(1)
  })

  it('um peer que conecta depois do bombeamento só aparece no bombeamento seguinte', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('p1')
    rede.bombear()

    rede.conectar('p3')
    expect(a.peers()).toEqual([])

    rede.bombear()
    expect(a.peers()).toEqual(['p3'])
  })

  it('bombear com lista conecta só os pedidos, deixando um terceiro invisível', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('pa')
    const b = rede.conectar('pb')
    const c = rede.conectar('pc')

    rede.bombear(['pa', 'pc'])

    expect(a.peers()).toEqual(['pc'])
    expect(c.peers()).toEqual(['pa'])
    // 'pb' não existe para ninguém ainda, e não enxerga ninguém.
    expect(b.peers()).toEqual([])

    rede.bombear()
    expect(b.peers().sort()).toEqual(['pa', 'pc'])
    expect(a.peers().sort()).toEqual(['pb', 'pc'])
  })

  it('quem ainda não foi bombeado não recebe o que os conectados trocam', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('pa')
    rede.conectar('pb')
    const c = rede.conectar('pc')
    rede.bombear(['pa', 'pc'])
    const recebidoPorC = vi.fn()
    c.aoReceberAcao(recebidoPorC)

    a.enviarAcao({ tipo: 'levantar' })

    expect(recebidoPorC).toHaveBeenCalledWith({ tipo: 'levantar' }, 'pa')
  })

  it('quem sai deixa de aparecer em peers() e avisa os que ficaram', () => {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    rede.bombear()
    const saiu = vi.fn()
    a.aoSairPeer(saiu)

    b.sair()

    expect(saiu).toHaveBeenCalledWith('p2')
    expect(a.peers()).toEqual([])
  })
})

describe('mensagem de canal', () => {
  it('chega só a quem foi endereçada', () => {
    // É isto que faz o chat do canal ser DO canal. Mandar a todos e esconder
    // na tela deixaria o texto viajando para quem não devia recebê-lo, e
    // bastaria abrir o console para ler.
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const c = rede.conectar('p3')
    const paraB = vi.fn()
    const paraC = vi.fn()
    b.aoReceberMensagem(paraB)
    c.aoReceberMensagem(paraC)

    a.enviarMensagem('só para você', 'canal', ['p2'])

    expect(paraB).toHaveBeenCalledWith('só para você', 'p1', 'canal')
    expect(paraC).not.toHaveBeenCalled()
  })

  it('a da sala chega a todo mundo', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const c = rede.conectar('p3')
    const paraB = vi.fn()
    const paraC = vi.fn()
    b.aoReceberMensagem(paraB)
    c.aoReceberMensagem(paraC)

    a.enviarMensagem('oi todos', 'geral')

    expect(paraB).toHaveBeenCalled()
    expect(paraC).toHaveBeenCalled()
  })

  it('sozinho no canal, a mensagem não vira broadcast', () => {
    // Lista vazia de destinatários significa "não há ninguém comigo". Enviar
    // sem alvo faria virar geral, que é o oposto do pedido.
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const paraB = vi.fn()
    b.aoReceberMensagem(paraB)

    a.enviarMensagem('falando sozinho', 'canal', [])

    expect(paraB).not.toHaveBeenCalled()
  })
})
