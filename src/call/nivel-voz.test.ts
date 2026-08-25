import { describe, it, expect } from 'vitest'
import {
  decidirFalando, LIMIAR_DESLIGA, LIMIAR_LIGA, MS_SEGURA, rmsDe, TAMANHO_JANELA,
} from './nivel-voz'
import type { EstadoFala } from './nivel-voz'

const calado = (): EstadoFala => ({ falando: false, quietoDesde: null })

describe('decidirFalando', () => {
  it('acende assim que o nível passa do limiar de liga', () => {
    const depois = decidirFalando(calado(), LIMIAR_LIGA + 0.01, 1000)

    expect(depois.falando).toBe(true)
  })

  it('não acende com ruído de sala abaixo do limiar', () => {
    const depois = decidirFalando(calado(), LIMIAR_LIGA - 0.001, 1000)

    expect(depois.falando).toBe(false)
  })

  it('não apaga na pausa entre palavras', () => {
    // O ponto inteiro da histerese. Com um limiar só, o anel pisca a cada
    // respiração de quem fala — e piscar chama mais atenção que falar.
    let estado = decidirFalando(calado(), LIMIAR_LIGA + 0.02, 1000)

    estado = decidirFalando(estado, 0, 1100)

    expect(estado.falando).toBe(true)
  })

  it('apaga depois de MS_SEGURA em silêncio', () => {
    let estado = decidirFalando(calado(), LIMIAR_LIGA + 0.02, 1000)
    // A contagem começa na PRIMEIRA leitura baixa (1100), não em quando a
    // pessoa acendeu — senão uma frase longa apagaria no meio.
    estado = decidirFalando(estado, 0, 1100)

    estado = decidirFalando(estado, 0, 1100 + MS_SEGURA + 1)

    expect(estado.falando).toBe(false)
  })

  it('falar de novo dentro da janela reinicia a contagem', () => {
    let estado = decidirFalando(calado(), LIMIAR_LIGA + 0.02, 1000)
    estado = decidirFalando(estado, 0, 1200)
    // Voltou a falar antes de a janela fechar.
    estado = decidirFalando(estado, LIMIAR_LIGA + 0.02, 1250)

    // Agora MS_SEGURA conta a partir de 1250, não de 1200.
    estado = decidirFalando(estado, 0, 1250 + MS_SEGURA - 1)

    expect(estado.falando).toBe(true)
  })

  it('entre os dois limiares, quem já fala continua falando', () => {
    // A faixa do meio é a histerese propriamente dita: som fraco demais para
    // ACENDER, forte demais para dizer que parou.
    const meio = (LIMIAR_LIGA + LIMIAR_DESLIGA) / 2
    let estado = decidirFalando(calado(), LIMIAR_LIGA + 0.02, 1000)

    estado = decidirFalando(estado, meio, 1000 + MS_SEGURA * 3)

    expect(estado.falando).toBe(true)
  })

  it('entre os dois limiares, quem está calado continua calado', () => {
    const meio = (LIMIAR_LIGA + LIMIAR_DESLIGA) / 2

    expect(decidirFalando(calado(), meio, 1000).falando).toBe(false)
  })

  it('os limiares não se cruzam — desliga tem que ser menor que liga', () => {
    // Invertê-los por engano faria o anel acender e apagar sem parar.
    expect(LIMIAR_DESLIGA).toBeLessThan(LIMIAR_LIGA)
  })
})

describe('rmsDe', () => {
  it('silêncio absoluto é zero', () => {
    expect(rmsDe(new Float32Array([0, 0, 0, 0]))).toBe(0)
  })

  it('mede a energia, não o pico — um estalo não é fala', () => {
    // Uma amostra alta no meio do silêncio (clique de mouse, batida na mesa)
    // tem pico máximo e energia baixa. Usar o pico faria o anel acender com
    // qualquer barulho seco.
    //
    // A janela real importa aqui, e por isso o teste usa TAMANHO_JANELA em vez
    // de um número qualquer: um estalo isolado rende RMS de 1/√N, então numa
    // janela curta demais ele PASSA do limiar. Encolher a janela sem olhar
    // isto traria o problema de volta.
    const estalo = new Float32Array(TAMANHO_JANELA)
    estalo[TAMANHO_JANELA / 2] = 1

    expect(rmsDe(estalo)).toBeLessThan(LIMIAR_LIGA)
  })

  it('a janela é grande o bastante para o estalo não passar do limiar', () => {
    // A relação entre os dois, dita como regra e não como acidente.
    expect(1 / Math.sqrt(TAMANHO_JANELA)).toBeLessThan(LIMIAR_LIGA)
  })

  it('sinal constante tem RMS igual ao próprio valor', () => {
    expect(rmsDe(new Float32Array([0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(0.5, 5)
  })

  it('o sinal negativo conta igual ao positivo', () => {
    // Onda sonora oscila em torno de zero; somar sem elevar ao quadrado daria
    // quase zero para qualquer som.
    expect(rmsDe(new Float32Array([-0.5, 0.5, -0.5, 0.5]))).toBeCloseTo(0.5, 5)
  })

  it('array vazio não vira NaN', () => {
    expect(rmsDe(new Float32Array([]))).toBe(0)
  })
})
