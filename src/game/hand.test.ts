import { describe, it, expect } from 'vitest'
import { avaliar, estourou, ehBlackjackNatural, valorCarta } from './hand'
import type { Carta, Mao } from './types'

const c = (valor: Carta['valor']): Carta => ({ valor, naipe: 'copas' })

function mao(cartas: Carta[], extras: Partial<Mao> = {}): Mao {
  return {
    id: 'm1', cartas, aposta: 100, dobrada: false,
    vindaDeSplit: false, encerrada: false, ...extras,
  }
}

describe('valorCarta', () => {
  it('dá 10 para todas as figuras', () => {
    expect(valorCarta(c('J'))).toBe(10)
    expect(valorCarta(c('Q'))).toBe(10)
    expect(valorCarta(c('K'))).toBe(10)
  })

  it('dá o valor numérico para cartas numeradas', () => {
    expect(valorCarta(c('7'))).toBe(7)
  })

  it('dá 1 para o Ás — a promoção a 11 é decidida em avaliar', () => {
    expect(valorCarta(c('A'))).toBe(1)
  })
})

describe('avaliar', () => {
  it('soma mão simples sem Ás', () => {
    expect(avaliar([c('9'), c('7')])).toEqual({ total: 16, soft: false })
  })

  it('conta o Ás como 11 quando cabe', () => {
    expect(avaliar([c('A'), c('6')])).toEqual({ total: 17, soft: true })
  })

  it('rebaixa o Ás para 1 quando 11 estouraria', () => {
    expect(avaliar([c('A'), c('6'), c('9')])).toEqual({ total: 16, soft: false })
  })

  it('promove apenas um Ás quando há dois', () => {
    expect(avaliar([c('A'), c('A')])).toEqual({ total: 12, soft: true })
  })

  it('rebaixa os dois Ases quando necessário', () => {
    expect(avaliar([c('A'), c('A'), c('9'), c('K')])).toEqual({ total: 21, soft: false })
  })

  it('reconhece 21 com Ás e figura', () => {
    expect(avaliar([c('A'), c('K')])).toEqual({ total: 21, soft: true })
  })

  it('avalia mão vazia como zero', () => {
    expect(avaliar([])).toEqual({ total: 0, soft: false })
  })
})

describe('estourou', () => {
  it('é falso em 21', () => {
    expect(estourou([c('K'), c('6'), c('5')])).toBe(false)
  })

  it('é verdadeiro acima de 21', () => {
    expect(estourou([c('K'), c('Q'), c('5')])).toBe(true)
  })

  it('é falso quando o Ás salva a mão', () => {
    expect(estourou([c('A'), c('K'), c('5')])).toBe(false)
  })
})

describe('ehBlackjackNatural', () => {
  it('reconhece Ás mais figura nas duas primeiras cartas', () => {
    expect(ehBlackjackNatural(mao([c('A'), c('K')]))).toBe(true)
  })

  it('recusa 21 formado com três cartas', () => {
    expect(ehBlackjackNatural(mao([c('7'), c('7'), c('7')]))).toBe(false)
  })

  it('recusa 21 numa mão vinda de split', () => {
    expect(ehBlackjackNatural(mao([c('A'), c('K')], { vindaDeSplit: true }))).toBe(false)
  })

  it('recusa mão de duas cartas que não soma 21', () => {
    expect(ehBlackjackNatural(mao([c('A'), c('9')]))).toBe(false)
  })
})
