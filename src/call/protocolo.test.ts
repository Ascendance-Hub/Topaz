import { describe, it, expect, vi } from 'vitest'
import { ProtocoloCall } from './protocolo'
import type { CanalCall, MensagemCall } from './protocolo'
import { criarCanalFalso } from './canal.fake'

function doisPares() {
  const rede = criarCanalFalso()
  const a = new ProtocoloCall(rede.conectar('pa'))
  const b = new ProtocoloCall(rede.conectar('pb'))
  return { rede, a, b }
}

describe('entrar e sair da call', () => {
  it('quem entra aparece na call para o outro', () => {
    const { a, b } = doisPares()

    a.entrar()

    expect(b.estado().naCall).toEqual(['pa'])
    expect(a.estado().euNaCall).toBe(true)
  })

  it('estar na sala não é estar na call', () => {
    const { a, b } = doisPares()

    expect(b.estado().naCall).toEqual([])
    expect(a.estado().euNaCall).toBe(false)
  })

  it('quem sai some da call do outro', () => {
    const { a, b } = doisPares()
    a.entrar()

    a.sair()

    expect(b.estado().naCall).toEqual([])
  })

  it('quem chega depois é informado de quem já está na call', () => {
    const rede = criarCanalFalso()
    const a = new ProtocoloCall(rede.conectar('pa'))
    a.entrar()

    const b = new ProtocoloCall(rede.conectar('pb'))

    expect(b.estado().naCall).toEqual(['pa'])
  })

  it('quem fecha a aba some da call sem precisar avisar', () => {
    const { rede, a, b } = doisPares()
    a.entrar()
    b.entrar()

    rede.desconectar('pa')

    expect(b.estado().naCall).toEqual([])
  })
})

describe('compartilhar tela', () => {
  it('anuncia a tela disponível para os outros', () => {
    const { a, b } = doisPares()
    a.entrar()

    a.definirCompartilhando(true)

    expect(b.estado().compartilhando).toEqual(['pa'])
  })

  it('sair da call também derruba o compartilhamento', () => {
    const { a, b } = doisPares()
    a.entrar()
    a.definirCompartilhando(true)

    a.sair()

    expect(b.estado().compartilhando).toEqual([])
    expect(a.estado().euCompartilhando).toBe(false)
  })
})

describe('assinatura explícita', () => {
  it('compartilhar sozinho não faz ninguém assistir', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()

    a.definirCompartilhando(true)

    expect(a.estado().assistidoPor).toEqual([])
    expect(b.estado().assistindo).toEqual([])
  })

  it('pedir para assistir aparece do lado de quem compartilha', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)

    b.assistir('pa')

    expect(a.estado().assistidoPor).toEqual(['pb'])
    expect(b.estado().assistindo).toEqual(['pa'])
  })

  it('parar de assistir libera quem compartilhava', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)
    b.assistir('pa')

    b.pararDeAssistir('pa')

    expect(a.estado().assistidoPor).toEqual([])
  })

  it('quem para de compartilhar deixa de ser assistido, sem ninguém pedir', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)
    b.assistir('pa')

    a.definirCompartilhando(false)

    expect(b.estado().assistindo).toEqual([])
    expect(a.estado().assistidoPor).toEqual([])
  })

  it('quem sai da sala some da lista de quem me assiste', () => {
    const { rede, a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)
    b.assistir('pa')

    rede.desconectar('pb')

    expect(a.estado().assistidoPor).toEqual([])
  })

  it('não dá para assistir quem não está compartilhando', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()

    b.assistir('pa')

    expect(b.estado().assistindo).toEqual([])
    expect(a.estado().assistidoPor).toEqual([])
  })
})

describe('aviso de mudança', () => {
  it('avisa quando alguém entra na call', () => {
    const { a, b } = doisPares()
    const mudou = vi.fn()
    b.aoMudar(mudou)

    a.entrar()

    expect(mudou).toHaveBeenCalled()
  })

  it('entrar duas vezes não reanuncia nada', () => {
    const { a, b } = doisPares()
    a.entrar()
    const mudou = vi.fn()
    b.aoMudar(mudou)

    a.entrar()

    expect(mudou).not.toHaveBeenCalled()
  })

  it('receber um retrato idêntico não conta como mudança', () => {
    // Canal sob controle direto, porque este é o caminho que roda toda vez que
    // alguém entra na sala: quem já estava reenvia o próprio retrato, e sem
    // este descarte a tela se redesenharia à toa a cada chegada.
    let entregar: ((msg: MensagemCall, de: string) => void) | null = null
    const canal: CanalCall = {
      meuId: () => 'eu',
      enviar: () => {},
      aoReceber: (cb) => { entregar = cb },
      aoEntrarPeer: () => {},
      aoSairPeer: () => {},
    }
    const protocolo = new ProtocoloCall(canal)
    const retrato: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: false }
    entregar!(retrato, 'pa')

    const mudou = vi.fn()
    protocolo.aoMudar(mudou)
    entregar!(retrato, 'pa')

    expect(mudou).not.toHaveBeenCalled()
    expect(protocolo.estado().naCall).toEqual(['pa'])
  })
})
