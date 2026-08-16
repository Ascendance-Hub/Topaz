import { describe, it, expect, vi } from 'vitest'
import {
  ehCodigoValido, gerarCodigoSala, haCodigoNaUrl, lerCodigoDaUrl,
  montarLinkSala, TAMANHO_CODIGO,
} from './sala'
import type { FonteBytes } from './sala'
import { rngSemente } from '../game/shoe'

/**
 * Traduz um `Rng` semeado (mulberry32, já usado no jogo) numa `FonteBytes`
 * determinística, para os testes poderem fixar a saída de `gerarCodigoSala`
 * sem depender de `crypto.getRandomValues`.
 */
function fonteDeSemente(semente: number): FonteBytes {
  const rng = rngSemente(semente)
  return (quantidade: number) => {
    const bytes = new Uint8Array(quantidade)
    for (let i = 0; i < quantidade; i++) {
      bytes[i] = Math.floor(rng() * 256)
    }
    return bytes
  }
}

describe('gerarCodigoSala', () => {
  it('tem 8 caracteres', () => {
    expect(gerarCodigoSala(fonteDeSemente(1))).toHaveLength(8)
  })

  it('evita caracteres ambíguos com uma fonte determinística', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoSala(fonteDeSemente(i))).not.toMatch(/[O0I1L]/)
    }
  })

  it('produz códigos diferentes para fontes determinísticas diferentes', () => {
    expect(gerarCodigoSala(fonteDeSemente(1))).not.toBe(gerarCodigoSala(fonteDeSemente(2)))
  })

  it('é determinístico: a mesma fonte produz sempre o mesmo código', () => {
    expect(gerarCodigoSala(fonteDeSemente(42))).toBe(gerarCodigoSala(fonteDeSemente(42)))
  })

  it('sem argumento, evita caracteres ambíguos usando a fonte criptográfica real', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoSala()).not.toMatch(/[O0I1L]/)
    }
  })

  it('sem argumento, chama de fato crypto.getRandomValues', () => {
    // Sem isto, trocar fonteBytesPadrao por Math.random() continuaria
    // passando em todos os outros testes — eles só olham o formato da
    // saída, não a fonte. Este é o único que pinaria essa regressão.
    const espia = vi.spyOn(crypto, 'getRandomValues')
    try {
      gerarCodigoSala()
      expect(espia).toHaveBeenCalled()
    } finally {
      espia.mockRestore()
    }
  })

  it('sem argumento, duas chamadas consecutivas produzem códigos diferentes', () => {
    expect(gerarCodigoSala()).not.toBe(gerarCodigoSala())
  })
})

describe('lerCodigoDaUrl', () => {
  it('extrai o código do hash', () => {
    expect(lerCodigoDaUrl('#sala=K7X2QW9F')).toBe('K7X2QW9F')
  })

  it('devolve null sem hash', () => {
    expect(lerCodigoDaUrl('')).toBeNull()
  })

  it('devolve null para hash de outro assunto', () => {
    expect(lerCodigoDaUrl('#outra-coisa')).toBeNull()
  })

  it('normaliza para maiúsculas', () => {
    expect(lerCodigoDaUrl('#sala=k7x2qw9f')).toBe('K7X2QW9F')
  })

  it('devolve null para código mais curto que TAMANHO_CODIGO (link truncado)', () => {
    const curto = 'K7X2QW9F'.slice(0, TAMANHO_CODIGO - 1)
    expect(lerCodigoDaUrl(`#sala=${curto}`)).toBeNull()
  })

  it('devolve null para código mais longo que TAMANHO_CODIGO', () => {
    const longo = 'K7X2QW9F' + 'A'.repeat(TAMANHO_CODIGO)
    expect(lerCodigoDaUrl(`#sala=${longo}`)).toBeNull()
  })
})

describe('ehCodigoValido', () => {
  it('aceita um código de fato gerado por gerarCodigoSala', () => {
    expect(ehCodigoValido(gerarCodigoSala(fonteDeSemente(1)))).toBe(true)
  })

  it('rejeita comprimento errado', () => {
    expect(ehCodigoValido('K7X2QW9')).toBe(false)
    expect(ehCodigoValido('K7X2QW9FF')).toBe(false)
    expect(ehCodigoValido('')).toBe(false)
  })

  it('rejeita caracteres fora do alfabeto, inclusive os ambíguos excluídos de propósito', () => {
    // O, I, 1, L: comprimento certo (8), mas fora do alfabeto.
    expect(ehCodigoValido('K7X2QW9O')).toBe(false)
    expect(ehCodigoValido('K7X2QW91')).toBe(false)
    expect(ehCodigoValido('K7X2QWIL')).toBe(false)
    expect(ehCodigoValido('K7X2QW90')).toBe(false)
  })

  it('rejeita marcação disfarçada de código (mesmo comprimento por acaso não muda o veredito)', () => {
    expect(ehCodigoValido('<img/on>')).toBe(false)
  })

  it('minúsculas não passam sem normalização prévia — só maiúsculas do alfabeto são válidas', () => {
    expect(ehCodigoValido('k7x2qw9f')).toBe(false)
  })
})

describe('montarLinkSala', () => {
  it('põe o código no hash, nunca no path', () => {
    const link = montarLinkSala('https://ascendance-hub.github.io/Topaz/', 'K7X2QW9F')
    expect(link).toBe('https://ascendance-hub.github.io/Topaz/#sala=K7X2QW9F')
  })

  it('não duplica o hash quando a base já tem um', () => {
    const link = montarLinkSala('https://exemplo.com/Topaz/#sala=ANTIGO', 'NOVO1234')
    expect(link).toBe('https://exemplo.com/Topaz/#sala=NOVO1234')
  })
})

describe('haCodigoNaUrl', () => {
  it('reconhece um hash de sala mesmo com código inválido — é o que distingue link truncado de porta da frente', () => {
    expect(haCodigoNaUrl('#sala=K7X2QW9F')).toBe(true)
    expect(haCodigoNaUrl('#sala=K7X2')).toBe(true)
    expect(haCodigoNaUrl('#sala=')).toBe(true)
  })

  it('não reconhece hash de outro assunto nem ausência de hash', () => {
    expect(haCodigoNaUrl('')).toBe(false)
    expect(haCodigoNaUrl('#outra-coisa')).toBe(false)
  })
})
