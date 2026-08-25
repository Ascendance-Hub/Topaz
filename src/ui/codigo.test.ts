import { describe, it, expect, vi } from 'vitest'
import {
  ehCodigoValido, formatarCodigo, gerarCodigoSala, haCodigoNaUrl, lerCodigoDaUrl,
  montarHashSala, montarLinkSala, normalizarCodigo, TAMANHO_CODIGO, TAMANHO_FORMATADO,
} from './codigo'
import type { FonteBytes } from './codigo'
import { rngSemente } from '../game/shoe'

/** Um código canônico de exemplo, no tamanho corrente. */
const EXEMPLO = 'K7X2QW9FM3PRTVN4'

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
  it('tem TAMANHO_CODIGO caracteres', () => {
    expect(gerarCodigoSala(fonteDeSemente(1))).toHaveLength(TAMANHO_CODIGO)
  })

  it('mantém o piso de entropia que torna a adivinhação inviável', () => {
    // O código não é só um identificador: é a senha da sala. Quem descobre
    // adivinha entra, ouve a call e vê as telas. Este teste existe para que
    // encurtar o código volte a ser uma decisão consciente e não um ajuste
    // de conveniência: com 8 caracteres eram ~40 bits, faixa que uma GPU
    // varre em minutos.
    const bits = TAMANHO_CODIGO * Math.log2(31)
    expect(bits).toBeGreaterThanOrEqual(75)
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

  it('não repete em muitos sorteios seguidos', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 500; i++) vistos.add(gerarCodigoSala())
    expect(vistos.size).toBe(500)
  })
})

describe('formatarCodigo', () => {
  it('agrupa de quatro em quatro com hífen', () => {
    // Dezesseis caracteres seguidos são ilegíveis para conferir a olho ou
    // ditar por voz. O hífen é só apresentação — o código canônico, que vai
    // para a rede, continua sem ele.
    expect(formatarCodigo(EXEMPLO)).toBe('K7X2-QW9F-M3PR-TVN4')
  })

  it('o tamanho formatado bate com TAMANHO_FORMATADO', () => {
    // O campo de digitação usa essa constante como maxLength; se ela
    // divergir, colar um código com hífens trunca e nada entra.
    expect(formatarCodigo(EXEMPLO)).toHaveLength(TAMANHO_FORMATADO)
  })
})

describe('normalizarCodigo', () => {
  it('tira hífens, espaços e passa para maiúsculas', () => {
    expect(normalizarCodigo(' k7x2-qw9f m3pr-tvn4 ')).toBe(EXEMPLO)
  })

  it('desfaz exatamente o que formatarCodigo faz', () => {
    const codigo = gerarCodigoSala(fonteDeSemente(7))
    expect(normalizarCodigo(formatarCodigo(codigo))).toBe(codigo)
  })
})

describe('lerCodigoDaUrl', () => {
  it('extrai o código do hash', () => {
    expect(lerCodigoDaUrl(`#sala=${EXEMPLO}`)).toBe(EXEMPLO)
  })

  it('aceita o código agrupado e devolve a forma canônica', () => {
    // É essa a forma que aparece no link copiado, então é a que mais chega.
    expect(lerCodigoDaUrl('#sala=K7X2-QW9F-M3PR-TVN4')).toBe(EXEMPLO)
  })

  it('devolve null sem hash', () => {
    expect(lerCodigoDaUrl('')).toBeNull()
  })

  it('devolve null para hash de outro assunto', () => {
    expect(lerCodigoDaUrl('#outra-coisa')).toBeNull()
  })

  it('normaliza para maiúsculas', () => {
    expect(lerCodigoDaUrl(`#sala=${EXEMPLO.toLowerCase()}`)).toBe(EXEMPLO)
  })

  it('devolve null para código mais curto que TAMANHO_CODIGO (link truncado)', () => {
    expect(lerCodigoDaUrl(`#sala=${EXEMPLO.slice(0, TAMANHO_CODIGO - 1)}`)).toBeNull()
  })

  it('devolve null para código mais longo que TAMANHO_CODIGO', () => {
    expect(lerCodigoDaUrl(`#sala=${EXEMPLO}A`)).toBeNull()
  })
})

describe('ehCodigoValido', () => {
  it('aceita um código de fato gerado por gerarCodigoSala', () => {
    expect(ehCodigoValido(gerarCodigoSala(fonteDeSemente(1)))).toBe(true)
  })

  it('rejeita comprimento errado', () => {
    expect(ehCodigoValido(EXEMPLO.slice(0, -1))).toBe(false)
    expect(ehCodigoValido(`${EXEMPLO}F`)).toBe(false)
    expect(ehCodigoValido('')).toBe(false)
  })

  it('rejeita a forma agrupada — o portão só conhece a forma canônica', () => {
    // Quem lê da URL ou do campo normaliza antes. Deixar o hífen passar aqui
    // criaria duas formas válidas do mesmo código, e duas salas diferentes.
    expect(ehCodigoValido(formatarCodigo(EXEMPLO))).toBe(false)
  })

  it('rejeita caracteres fora do alfabeto, inclusive os ambíguos excluídos de propósito', () => {
    expect(ehCodigoValido('K7X2QW9OM3PRTVN4')).toBe(false)
    expect(ehCodigoValido('K7X2QW91M3PRTVN4')).toBe(false)
    expect(ehCodigoValido('K7X2QWILM3PRTVN4')).toBe(false)
    expect(ehCodigoValido('K7X2QW90M3PRTVN4')).toBe(false)
  })

  it('rejeita marcação disfarçada de código (mesmo comprimento por acaso não muda o veredito)', () => {
    expect(ehCodigoValido('<img/onerror=x>!')).toBe(false)
  })

  it('minúsculas não passam sem normalização prévia — só maiúsculas do alfabeto são válidas', () => {
    expect(ehCodigoValido(EXEMPLO.toLowerCase())).toBe(false)
  })
})

describe('montarHashSala', () => {
  it('escreve o código agrupado, para o que está na barra de endereços ser o mesmo que se copia', () => {
    expect(montarHashSala(EXEMPLO)).toBe('#sala=K7X2-QW9F-M3PR-TVN4')
  })

  it('o que ele escreve, lerCodigoDaUrl lê de volta', () => {
    expect(lerCodigoDaUrl(montarHashSala(EXEMPLO))).toBe(EXEMPLO)
  })
})

describe('montarLinkSala', () => {
  it('põe o código no hash, nunca no path', () => {
    // No fragmento o código não é enviado ao servidor: não entra em log de
    // acesso nem vaza por cabeçalho Referer.
    const link = montarLinkSala('https://ascendance-hub.github.io/Topaz/', EXEMPLO)
    expect(link).toBe('https://ascendance-hub.github.io/Topaz/#sala=K7X2-QW9F-M3PR-TVN4')
  })

  it('não duplica o hash quando a base já tem um', () => {
    const link = montarLinkSala('https://exemplo.com/Topaz/#sala=ANTIGO', EXEMPLO)
    expect(link).toBe('https://exemplo.com/Topaz/#sala=K7X2-QW9F-M3PR-TVN4')
  })
})

describe('haCodigoNaUrl', () => {
  it('reconhece um hash de sala mesmo com código inválido — é o que distingue link truncado de porta da frente', () => {
    expect(haCodigoNaUrl(`#sala=${EXEMPLO}`)).toBe(true)
    expect(haCodigoNaUrl('#sala=K7X2')).toBe(true)
    expect(haCodigoNaUrl('#sala=')).toBe(true)
  })

  it('não reconhece hash de outro assunto nem ausência de hash', () => {
    expect(haCodigoNaUrl('')).toBe(false)
    expect(haCodigoNaUrl('#outra-coisa')).toBe(false)
  })
})
