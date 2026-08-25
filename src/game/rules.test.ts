import { describe, it, expect } from 'vitest'
import {
  REGRAS, acoesDisponiveis, aindaEmJogo, mesaEsperaPor, pagamento, resultadoDe,
  dealerDeveComprar, CONFIG_PADRAO, LIMITES, normalizarConfig, fichasDisponiveis,
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
    expect(CONFIG_PADRAO.fichasIniciais).toBe(1000)
    expect(REGRAS.apostaMin).toBe(25)
    expect(CONFIG_PADRAO.apostaMax).toBe(500)
    expect(REGRAS.maxCadeiras).toBe(7)
    expect(REGRAS.maxMaos).toBe(3)
    expect(CONFIG_PADRAO.segundosTurno).toBe(30)
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
      config: { ...CONFIG_PADRAO },
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

describe('normalizarConfig', () => {
  it('o padrão passa intacto', () => {
    expect(normalizarConfig(CONFIG_PADRAO)).toEqual(CONFIG_PADRAO)
  })

  it('o alvo padrão exige mais de uma mão ganha', () => {
    // O defeito que motivou tudo: com 1000 iniciais, alvo 1500 e aposta máxima
    // 500, apostar o máximo e ganhar a primeira mão encerrava a partida.
    const { fichasIniciais, alvo, apostaMax } = CONFIG_PADRAO
    expect(fichasIniciais + apostaMax).toBeLessThan(alvo!)
  })

  it('lixo no lugar da configuração vira o padrão', () => {
    // Ela chega pela rede, de um cliente modificado ou de uma versão que não
    // conhecemos.
    for (const ruim of [null, undefined, 42, 'texto', [], {}]) {
      expect(normalizarConfig(ruim)).toEqual(CONFIG_PADRAO)
    }
  })

  it('campo solto inválido não estraga os outros', () => {
    const c = normalizarConfig({ ...CONFIG_PADRAO, apostaMax: 'muito' })

    expect(c.apostaMax).toBe(CONFIG_PADRAO.apostaMax)
    expect(c.fichasIniciais).toBe(CONFIG_PADRAO.fichasIniciais)
  })

  it('aposta máxima nunca passa das fichas iniciais', () => {
    // Passar deixaria a mesa apostando o que ninguém tem, com os botões
    // nascendo desabilitados.
    const c = normalizarConfig({ ...CONFIG_PADRAO, fichasIniciais: 500, apostaMax: 5000 })

    expect(c.apostaMax).toBeLessThanOrEqual(c.fichasIniciais)
  })

  it('alvo nunca fica abaixo das fichas iniciais', () => {
    // Seria uma partida encerrada antes da primeira carta.
    const c = normalizarConfig({ ...CONFIG_PADRAO, fichasIniciais: 5000, alvo: 100 })

    expect(c.alvo!).toBeGreaterThan(c.fichasIniciais)
  })

  it('alvo nulo é aceito — é o "até sobrar um"', () => {
    expect(normalizarConfig({ ...CONFIG_PADRAO, alvo: null }).alvo).toBeNull()
  })

  it('valores absurdos são encaixados nos limites', () => {
    const alto = normalizarConfig({
      fichasIniciais: 1e12, alvo: 1e12, apostaMax: 1e12, segundosTurno: 1e6,
    })
    expect(alto.fichasIniciais).toBeLessThanOrEqual(LIMITES.fichasIniciais.max)
    expect(alto.segundosTurno).toBeLessThanOrEqual(LIMITES.segundosTurno.max)

    const baixo = normalizarConfig({
      fichasIniciais: -5, alvo: -5, apostaMax: -5, segundosTurno: 0,
    })
    expect(baixo.fichasIniciais).toBeGreaterThanOrEqual(LIMITES.fichasIniciais.min)
    expect(baixo.segundosTurno).toBeGreaterThanOrEqual(LIMITES.segundosTurno.min)
  })

  it('aposta máxima nunca fica abaixo da mínima da mesa', () => {
    // Abaixo dela não existiria aposta possível: todo botão nasceria morto.
    expect(normalizarConfig({ ...CONFIG_PADRAO, apostaMax: 1 }).apostaMax)
      .toBeGreaterThanOrEqual(REGRAS.apostaMin)
  })

  it('arredonda para inteiro — fichas quebradas não existem', () => {
    expect(normalizarConfig({ ...CONFIG_PADRAO, fichasIniciais: 1000.7 }).fichasIniciais)
      .toBe(1001)
  })
})

describe('fichasDisponiveis', () => {
  it('com o teto padrão, são as fichas de sempre', () => {
    expect(fichasDisponiveis(CONFIG_PADRAO.apostaMax)).toEqual([...REGRAS.fichas])
  })

  it('teto menor tira a ficha que não cabe, e oferece o teto', () => {
    // O defeito: baixar o teto para 300 deixava um botão de 500 na tela que o
    // motor recusava — a pessoa clicava e nada acontecia.
    expect(fichasDisponiveis(300)).toEqual([25, 100, 300])
  })

  it('teto maior permite apostar tudo de uma vez', () => {
    expect(fichasDisponiveis(800)).toEqual([25, 100, 500, 800])
  })

  it('nenhuma ficha oferecida passa do teto', () => {
    for (const teto of [25, 26, 99, 100, 101, 499, 500, 501, 5000]) {
      expect(fichasDisponiveis(teto).every((v) => v <= teto)).toBe(true)
    }
  })

  it('sempre há pelo menos uma ficha para apostar', () => {
    for (const teto of [25, 60, 300, 10_000]) {
      expect(fichasDisponiveis(teto).length).toBeGreaterThan(0)
    }
  })

  it('o teto nunca aparece duas vezes', () => {
    const lista = fichasDisponiveis(500)
    expect(new Set(lista).size).toBe(lista.length)
  })
})
