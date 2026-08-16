import { describe, it, expect, vi } from 'vitest'
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
})
