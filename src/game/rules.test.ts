import { describe, it, expect } from 'vitest'
import {
  REGRAS, acoesDisponiveis, aindaEmJogo, mesaEsperaPor, pagamento, resultadoDe,
  dealerDeveComprar,
} from './rules'
import type { Carta, EstadoJogo, Jogador, Mao } from './types'

const c = (valor: Carta['valor']): Carta => ({ valor, naipe: 'copas' })
const c2 = (valor: Carta['valor']): Carta => ({ valor, naipe: 'paus' })

function mao(cartas: Carta[], extras: Partial<Mao> = {}): Mao {
  return {
    id: 'm1', cartas, aposta: 100, dobrada: false,
    vindaDeSplit: false, encerrada: false, ...extras,
  }
}

function jogador(extras: Partial<Jogador> = {}): Jogador {
  return {
    peerId: 'p1', apelido: 'Alex', cadeira: 0, fichas: 1000,
    maos: [], maoAtiva: 0, seguro: 0, rodadasInativo: 0,
    desconectadoEm: null, decidiuSeguro: false, eliminadoEm: null, ...extras,
  }
}

describe('REGRAS', () => {
  it('reflete os valores fixados no spec', () => {
    expect(REGRAS.numBaralhos).toBe(6)
    expect(REGRAS.stackInicial).toBe(1000)
    expect(REGRAS.apostaMin).toBe(25)
    expect(REGRAS.apostaMax).toBe(500)
    expect(REGRAS.maxCadeiras).toBe(7)
    expect(REGRAS.maxMaos).toBe(3)
    expect(REGRAS.segundosTurno).toBe(30)
    expect(REGRAS.fichas).toEqual([25, 100, 500])
  })
})

describe('aindaEmJogo', () => {
  it('vale para quem tem exatamente a aposta mínima', () => {
    expect(aindaEmJogo(jogador({ fichas: REGRAS.apostaMin }))).toBe(true)
  })

  it('não vale para quem está abaixo da aposta mínima', () => {
    expect(aindaEmJogo(jogador({ fichas: REGRAS.apostaMin - 1 }))).toBe(false)
  })

  it('não vale para eliminado, mesmo com fichas de sobra', () => {
    expect(aindaEmJogo(jogador({ fichas: 1000, eliminadoEm: 4 }))).toBe(false)
  })

  it('vale para quem perdeu a cadeira mas continua com fichas (spec §6)', () => {
    expect(aindaEmJogo(jogador({ cadeira: null, fichas: 600 }))).toBe(true)
  })
})

describe('dealerDeveComprar', () => {
  it('compra com 16', () => {
    expect(dealerDeveComprar([c('10'), c('6')])).toBe(true)
  })

  it('para com 17 duro', () => {
    expect(dealerDeveComprar([c('10'), c('7')])).toBe(false)
  })

  it('para com 17 soft — a casa para em soft 17', () => {
    expect(dealerDeveComprar([c('A'), c('6')])).toBe(false)
  })

  it('para com 21', () => {
    expect(dealerDeveComprar([c('A'), c('K')])).toBe(false)
  })

  it('para no limite definido em REGRAS', () => {
    const abaixo = REGRAS.dealerParaEm - 1
    expect(dealerDeveComprar([c('10'), c(String(abaixo - 10) as Carta['valor'])])).toBe(true)
    expect(dealerDeveComprar([c('10'), c(String(REGRAS.dealerParaEm - 10) as Carta['valor'])])).toBe(false)
  })
})

describe('acoesDisponiveis', () => {
  it('oferece pedir, parar, dobrar e dividir num par inicial', () => {
    const m = mao([c('8'), c2('8')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] })).sort())
      .toEqual(['dividir', 'dobrar', 'parar', 'pedir'])
  })

  it('não oferece dividir quando as cartas têm valores diferentes', () => {
    const m = mao([c('8'), c('9')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).not.toContain('dividir')
  })

  it('oferece dividir para figuras distintas de mesmo valor', () => {
    const m = mao([c('K'), c2('Q')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toContain('dividir')
  })

  it('não oferece dobrar nem dividir com três cartas', () => {
    const m = mao([c('5'), c('3'), c('4')])
    const acoes = acoesDisponiveis(m, jogador({ maos: [m] }))
    expect(acoes).not.toContain('dobrar')
    expect(acoes).not.toContain('dividir')
  })

  it('não oferece dividir ao atingir o limite de 3 mãos', () => {
    const m = mao([c('8'), c2('8')])
    const j = jogador({ maos: [m, mao([c('2'), c('3')]), mao([c('4'), c('5')])] })
    expect(acoesDisponiveis(m, j)).not.toContain('dividir')
  })

  it('não oferece dobrar sem fichas suficientes', () => {
    const m = mao([c('5'), c('6')], { aposta: 500 })
    expect(acoesDisponiveis(m, jogador({ fichas: 100, maos: [m] }))).not.toContain('dobrar')
  })

  it('permite dobrar depois de split', () => {
    const m = mao([c('5'), c('6')], { vindaDeSplit: true })
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toContain('dobrar')
  })

  it('não oferece nada para mão encerrada', () => {
    const m = mao([c('K'), c('9')], { encerrada: true })
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toEqual([])
  })

  it('não oferece nada para mão estourada', () => {
    const m = mao([c('K'), c('9'), c('5')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toEqual([])
  })

  it('trava Ases divididos em exatamente uma carta', () => {
    const m = mao([c('A'), c('7')], { vindaDeSplit: true })
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toEqual([])
  })
})

describe('resultadoDe', () => {
  it('marca blackjack natural', () => {
    expect(resultadoDe(mao([c('A'), c('K')]), [c('10'), c('8')])).toBe('blackjack')
  })

  it('empata blackjack contra blackjack', () => {
    expect(resultadoDe(mao([c('A'), c('K')]), [c('A'), c('Q')])).toBe('empatou')
  })

  it('marca derrota quando o jogador estoura, mesmo com dealer estourado', () => {
    expect(resultadoDe(mao([c('K'), c('Q'), c('5')]), [c('K'), c('Q'), c('5')])).toBe('perdeu')
  })

  it('marca vitória quando o dealer estoura', () => {
    expect(resultadoDe(mao([c('K'), c('8')]), [c('K'), c('Q'), c('5')])).toBe('ganhou')
  })

  it('compara totais quando ninguém estoura', () => {
    expect(resultadoDe(mao([c('K'), c('9')]), [c('K'), c('8')])).toBe('ganhou')
    expect(resultadoDe(mao([c('K'), c('7')]), [c('K'), c('8')])).toBe('perdeu')
    expect(resultadoDe(mao([c('K'), c('8')]), [c('K'), c('8')])).toBe('empatou')
  })

  it('não trata 21 pós-split como blackjack', () => {
    const m = mao([c('A'), c('K')], { vindaDeSplit: true })
    expect(resultadoDe(m, [c('10'), c('8')])).toBe('ganhou')
  })
})

describe('pagamento', () => {
  it('paga blackjack a 3:2 mais a aposta', () => {
    expect(pagamento(mao([c('A'), c('K')], { aposta: 100 }), [c('10'), c('8')])).toBe(250)
  })

  it('paga vitória comum 1:1 mais a aposta', () => {
    expect(pagamento(mao([c('K'), c('9')], { aposta: 100 }), [c('K'), c('8')])).toBe(200)
  })

  it('devolve a aposta no empate', () => {
    expect(pagamento(mao([c('K'), c('8')], { aposta: 100 }), [c('K'), c('8')])).toBe(100)
  })

  it('não devolve nada na derrota', () => {
    expect(pagamento(mao([c('K'), c('7')], { aposta: 100 }), [c('K'), c('8')])).toBe(0)
  })

  it('paga sobre a aposta dobrada', () => {
    const m = mao([c('5'), c('6'), c('K')], { aposta: 200, dobrada: true })
    expect(pagamento(m, [c('K'), c('8')])).toBe(400)
  })

  it('nao produz fichas fracionarias na aposta minima', () => {
    const pago = pagamento(mao([c('A'), c('K')], { aposta: 25 }), [c('10'), c('8')])
    expect(pago).toBe(62)
    expect(Number.isInteger(pago)).toBe(true)
  })
})

describe('mesaEsperaPor', () => {
  function estado(extras: Partial<EstadoJogo> = {}): EstadoJogo {
    return {
      fase: 'apostas', jogadores: [], vezDe: null, prazoTurno: null,
      maoDealer: [], dealerTemOculta: false, cartasRestantes: 312,
      hostAtual: 'p1', rodada: 1, proximoIdMao: 1, vencedor: null,
      naPartida: ['p1'], ...extras,
    }
  }

  it('espera na fase de apostas quem está sentado e ainda não apostou', () => {
    const eu = jogador({ maos: [] })

    expect(mesaEsperaPor(estado({ jogadores: [eu] }), 'p1')).toBe(true)
  })

  it('não espera mais depois que a aposta entrou', () => {
    const eu = jogador({ maos: [mao([c('5')])] })

    expect(mesaEsperaPor(estado({ jogadores: [eu] }), 'p1')).toBe(false)
  })

  it('não espera de quem está de pé, porque ele não tem o que responder', () => {
    const espectador = jogador({ cadeira: null })

    expect(mesaEsperaPor(estado({ jogadores: [espectador] }), 'p1')).toBe(false)
  })

  it('não espera de quem não tem fichas para a aposta mínima', () => {
    const quebrado = jogador({ fichas: REGRAS.apostaMin - 1 })

    expect(mesaEsperaPor(estado({ jogadores: [quebrado] }), 'p1')).toBe(false)
  })

  it('espera na fase de seguro de quem ainda não respondeu à oferta', () => {
    const eu = jogador({ maos: [mao([c('5')])], decidiuSeguro: false })

    expect(mesaEsperaPor(estado({ fase: 'seguro', jogadores: [eu] }), 'p1')).toBe(true)
  })

  it('não espera de quem já dispensou o seguro', () => {
    const eu = jogador({ maos: [mao([c('5')])], decidiuSeguro: true })

    expect(mesaEsperaPor(estado({ fase: 'seguro', jogadores: [eu] }), 'p1')).toBe(false)
  })

  it('espera na fase de turnos quando é a vez dele', () => {
    const eu = jogador({ maos: [mao([c('5'), c2('9')])] })
    const agora = estado({ fase: 'turnos', jogadores: [eu], vezDe: 'p1' })

    expect(mesaEsperaPor(agora, 'p1')).toBe(true)
  })

  it('não espera na fase de turnos quando a vez é de outro', () => {
    const eu = jogador({ maos: [mao([c('5'), c2('9')])] })
    const agora = estado({ fase: 'turnos', jogadores: [eu], vezDe: 'p2' })

    expect(mesaEsperaPor(agora, 'p1')).toBe(false)
  })

  it('não espera nas fases em que ninguém age', () => {
    const eu = jogador({ maos: [mao([c('5')])] })

    for (const fase of ['aguardando', 'distribuindo', 'dealer', 'acerto', 'fim'] as const) {
      expect(mesaEsperaPor(estado({ fase, jogadores: [eu], vezDe: 'p1' }), 'p1')).toBe(false)
    }
  })

  it('não espera de quem nem está na mesa', () => {
    expect(mesaEsperaPor(estado({ jogadores: [] }), 'p1')).toBe(false)
  })
})
