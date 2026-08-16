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
