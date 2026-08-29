// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { criarSons, definirSons, sonsDaMudanca, sonsLigados } from './sons'
import type { InstanteDaCall } from './sons'

const fora: InstanteDaCall = {
  euNaCall: false, comigo: [], compartilhando: [],
  euCompartilhando: false, meuMicrofoneMudo: false,
}
const dentro: InstanteDaCall = { ...fora, euNaCall: true }
const com = (mudar: Partial<InstanteDaCall>): InstanteDaCall => ({ ...dentro, ...mudar })

describe('sonsDaMudanca — o silêncio que importa', () => {
  it('entrar numa call que já tem gente toca UM som, não um por pessoa', () => {
    // Quem entra numa conversa de três ouviria três "entrou" em sequência.
    // A entrada semeia a comparação e fica calada daí em diante.
    expect(sonsDaMudanca(fora, com({ comigo: ['pa', 'pb', 'pc'] }))).toEqual(['entrar'])
  })

  it('fora da call, silêncio absoluto', () => {
    // Quem não está lá não é avisado do que acontece lá.
    const antes = { ...fora, comigo: [] }
    const agora = { ...fora, comigo: ['pa'] }

    expect(sonsDaMudanca(antes, agora)).toEqual([])
  })

  it('sair toca um som só, o meu', () => {
    expect(sonsDaMudanca(com({ comigo: ['pa', 'pb'] }), fora)).toEqual(['sair'])
  })

  it('nada mudou, nada toca', () => {
    expect(sonsDaMudanca(com({ comigo: ['pa'] }), com({ comigo: ['pa'] }))).toEqual([])
  })
})

describe('sonsDaMudanca — quem chega e quem sai', () => {
  it('alguém entra no meu canal', () => {
    expect(sonsDaMudanca(dentro, com({ comigo: ['pa'] }))).toEqual(['entrar'])
  })

  it('alguém sai do meu canal', () => {
    expect(sonsDaMudanca(com({ comigo: ['pa'] }), dentro)).toEqual(['sair'])
  })

  it('trocar de canal soa como sair, para quem ficou', () => {
    // E é o certo: do ponto de vista de quem ficou, a pessoa foi embora.
    expect(sonsDaMudanca(com({ comigo: ['pa'] }), com({ comigo: ['pb'] })))
      .toEqual(['entrar', 'sair'])
  })
})

describe('sonsDaMudanca — tela e microfone', () => {
  it('uma tela nova ao alcance', () => {
    expect(sonsDaMudanca(com({ comigo: ['pa'] }), com({ comigo: ['pa'], compartilhando: ['pa'] })))
      .toEqual(['tela'])
  })

  it('a minha própria tela também avisa', () => {
    expect(sonsDaMudanca(dentro, com({ euCompartilhando: true }))).toEqual(['tela'])
  })

  it('parar de compartilhar não toca nada', () => {
    // Aviso serve para o que começa; o que acaba a pessoa já vê sumir.
    expect(sonsDaMudanca(com({ compartilhando: ['pa'] }), dentro)).toEqual([])
  })

  it('o meu mudo confirma, nos dois sentidos', () => {
    // O clique precisa de resposta, senão a pessoa fica olhando o botão.
    expect(sonsDaMudanca(dentro, com({ meuMicrofoneMudo: true }))).toEqual(['mudo'])
    expect(sonsDaMudanca(com({ meuMicrofoneMudo: true }), dentro)).toEqual(['desmudo'])
  })
})

/** Um contexto de áudio de mentira, que anota o que tocou. */
function contextoFalso() {
  const notas: number[] = []
  const ganho = () => ({
    gain: {
      setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  })
  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: () => ({
      type: '', frequency: { value: 0 }, connect: vi.fn(),
      start: vi.fn(), stop: vi.fn(),
      set _(_v: unknown) { /* nada */ },
    }),
    createGain: ganho,
  } as unknown as AudioContext
  // Anota a frequência de cada oscilador criado.
  const original = ctx.createOscillator.bind(ctx)
  ;(ctx as unknown as { createOscillator: () => OscillatorNode }).createOscillator = () => {
    const osc = original()
    Object.defineProperty(osc, 'frequency', {
      value: { set value(v: number) { notas.push(v) }, get value() { return 0 } },
    })
    return osc
  }
  return { ctx, notas }
}

describe('criarSons', () => {
  beforeEach(() => { localStorage.clear() })

  it('desligado não toca nada', () => {
    const { ctx, notas } = contextoFalso()
    const sons = criarSons({ ligado: () => false, criarContexto: () => ctx })

    sons.tocar('entrar')

    expect(notas).toEqual([])
  })

  it('entrar sobe e sair desce — a direção é o que se entende sem aprender', () => {
    const { ctx, notas } = contextoFalso()
    const sons = criarSons({ ligado: () => true, criarContexto: () => ctx })

    sons.tocar('entrar')
    expect(notas[1]).toBeGreaterThan(notas[0]!)

    notas.length = 0
    sons.tocar('sair')
    expect(notas[1]).toBeLessThan(notas[0]!)
  })

  it('um navegador sem áudio não derruba a call', () => {
    const sons = criarSons({
      ligado: () => true,
      criarContexto: () => { throw new Error('sem WebAudio') },
    })

    expect(() => sons.tocar('entrar')).not.toThrow()
  })

  it('cria o contexto UMA vez, e só quando toca', () => {
    // Navegador não deixa criar contexto de áudio sem gesto do usuário.
    const criar = vi.fn(() => contextoFalso().ctx)
    const sons = criarSons({ ligado: () => true, criarContexto: criar })

    expect(criar).not.toHaveBeenCalled()
    sons.tocar('entrar')
    sons.tocar('sair')
    expect(criar).toHaveBeenCalledTimes(1)
  })
})

describe('a preferência', () => {
  beforeEach(() => { localStorage.clear() })

  it('vem ligada por padrão', () => {
    expect(sonsLigados()).toBe(true)
  })

  it('desliga e lembra', () => {
    definirSons(false)
    expect(sonsLigados()).toBe(false)

    definirSons(true)
    expect(sonsLigados()).toBe(true)
  })
})
