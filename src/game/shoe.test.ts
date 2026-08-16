import { describe, it, expect } from 'vitest'
import {
  criarBaralho, embaralhar, criarSapata,
  precisaReembaralhar, reconstruirSapata, rngSemente,
} from './shoe'
import type { Carta } from './types'

describe('criarBaralho', () => {
  it('produz 52 cartas', () => {
    expect(criarBaralho()).toHaveLength(52)
  })

  it('produz 13 cartas de cada naipe', () => {
    const baralho = criarBaralho()
    for (const naipe of ['copas', 'ouros', 'paus', 'espadas'] as const) {
      expect(baralho.filter((c) => c.naipe === naipe)).toHaveLength(13)
    }
  })

  it('não repete nenhuma carta', () => {
    const chaves = criarBaralho().map((c) => `${c.valor}-${c.naipe}`)
    expect(new Set(chaves).size).toBe(52)
  })
})

describe('embaralhar', () => {
  it('preserva todas as cartas', () => {
    const baralho = criarBaralho()
    const mexido = embaralhar(baralho, rngSemente(42))
    expect(mexido).toHaveLength(52)
    expect(new Set(mexido.map((c) => `${c.valor}-${c.naipe}`)).size).toBe(52)
  })

  it('não muta o array original', () => {
    const baralho = criarBaralho()
    const copia = [...baralho]
    embaralhar(baralho, rngSemente(1))
    expect(baralho).toEqual(copia)
  })

  it('é determinístico para a mesma semente', () => {
    const a = embaralhar(criarBaralho(), rngSemente(7))
    const b = embaralhar(criarBaralho(), rngSemente(7))
    expect(a).toEqual(b)
  })

  it('produz ordens diferentes para sementes diferentes', () => {
    const a = embaralhar(criarBaralho(), rngSemente(1))
    const b = embaralhar(criarBaralho(), rngSemente(2))
    expect(a).not.toEqual(b)
  })
})

describe('criarSapata', () => {
  it('junta 6 baralhos em 312 cartas', () => {
    expect(criarSapata(6, rngSemente(3))).toHaveLength(312)
  })

  it('contém exatamente 24 Ases numa sapata de 6', () => {
    const sapata = criarSapata(6, rngSemente(3))
    expect(sapata.filter((c) => c.valor === 'A')).toHaveLength(24)
  })
})

describe('precisaReembaralhar', () => {
  it('é falso acima de 25% restante', () => {
    expect(precisaReembaralhar(100, 6)).toBe(false)
  })

  it('é verdadeiro abaixo de 25% restante', () => {
    expect(precisaReembaralhar(70, 6)).toBe(true)
  })

  it('é verdadeiro exatamente no limiar', () => {
    expect(precisaReembaralhar(78, 6)).toBe(true)
  })
})

describe('reconstruirSapata', () => {
  it('remove as cartas já vistas da composição', () => {
    const vistas: Carta[] = [
      { valor: 'A', naipe: 'copas' },
      { valor: 'A', naipe: 'copas' },
      { valor: 'K', naipe: 'espadas' },
    ]
    const sapata = reconstruirSapata(6, vistas, rngSemente(9))
    expect(sapata).toHaveLength(312 - 3)
    expect(sapata.filter((c) => c.valor === 'A' && c.naipe === 'copas')).toHaveLength(4)
  })

  it('ignora cartas vistas além do que a sapata continha', () => {
    const vistas: Carta[] = Array.from({ length: 10 }, () => ({
      valor: 'A' as const, naipe: 'copas' as const,
    }))
    const sapata = reconstruirSapata(6, vistas, rngSemente(9))
    expect(sapata.filter((c) => c.valor === 'A' && c.naipe === 'copas')).toHaveLength(0)
    expect(sapata).toHaveLength(312 - 6)
  })
})
