import { describe, it, expect } from 'vitest'
import { ehEstadoPlausivel, textoLimitado } from './validar'
import { criarContexto } from '../game/machine'
import { rngSemente } from '../game/shoe'

const estadoReal = () => criarContexto('pa', rngSemente(1)).estado

describe('ehEstadoPlausivel', () => {
  it('aceita um estado de verdade, saído da própria máquina do jogo', () => {
    // O teste que impede o guarda de virar rígido demais e recusar a mesa
    // legítima — falha que só apareceria com duas pessoas na sala.
    expect(ehEstadoPlausivel(estadoReal())).toBe(true)
  })

  it('recusa o que nem é objeto', () => {
    expect(ehEstadoPlausivel(null)).toBe(false)
    expect(ehEstadoPlausivel('mesa')).toBe(false)
    expect(ehEstadoPlausivel(42)).toBe(false)
    expect(ehEstadoPlausivel(undefined)).toBe(false)
  })

  it('recusa listas que não são listas', () => {
    // É o caso que derruba a sala inteira: `jogadores.map(...)` numa string
    // lança no meio do desenho, e a página some para quem recebeu.
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: 'ninguém' })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), maoDealer: null })).toBe(false)
  })

  it('recusa fase inventada', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), fase: 'roubar' })).toBe(false)
  })

  it('recusa campos com o tipo trocado', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), hostAtual: 7 })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: 'muitas' })).toBe(false)
  })

  it('recusa rodada absurda, que venceria qualquer desempate', () => {
    // `mesaPrevalece` usa a rodada para decidir qual mesa fica quando dois
    // anfitriões se encontram. Sem teto, alguém publica rodada gigante e
    // adota a sala inteira à mesa dele.
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: Number.MAX_SAFE_INTEGER })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: -1 })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: Number.NaN })).toBe(false)
  })

  it('recusa uma mesa com gente demais para caber numa sala', () => {
    const lotado = { ...estadoReal(), jogadores: Array.from({ length: 5000 }, () => ({})) }
    expect(ehEstadoPlausivel(lotado)).toBe(false)
  })
})

describe('textoLimitado', () => {
  it('deixa passar texto normal', () => {
    expect(textoLimitado('oi pessoal', 200)).toBe('oi pessoal')
  })

  it('corta o que passa do limite', () => {
    // O limite do chat vale para quem ENVIA. Quem recebe precisa aplicar o
    // dele: um cliente modificado manda o texto que quiser, e uma linha de
    // dez megabytes trava o navegador de todo mundo na sala.
    expect(textoLimitado('a'.repeat(10_000), 200)).toHaveLength(200)
  })

  it('vira string vazia quando não é texto', () => {
    expect(textoLimitado(null, 200)).toBe('')
    expect(textoLimitado({ toString: () => 'oi' }, 200)).toBe('')
    expect(textoLimitado(123, 200)).toBe('')
  })
})
