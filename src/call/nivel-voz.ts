/**
 * A decisão de "esta pessoa está falando", em números puros.
 *
 * Separado da captura pelo mesmo motivo que `protocolo.ts` é separado de
 * `midia.ts`: histerese se testa com números, não com microfone. Aqui não
 * existe `AudioContext`, `MediaStream` nem `window` — só nível e relógio.
 */

/**
 * Acima disto, começa a falar. Abaixo de `LIMIAR_DESLIGA`, para.
 *
 * São RMS de amostras em -1..1. Voz normal fica por volta de 0,03–0,15; sala
 * silenciosa com supressão de ruído ligada, abaixo de 0,01.
 *
 * ⚠️ Os dois valores nasceram estimados e precisam de ajuste com voz real, em
 * microfones diferentes — está na verificação manual. Errar para cima deixa
 * quem fala baixo sem anel; errar para baixo acende o anel com o ventilador.
 */
export const LIMIAR_LIGA = 0.04
export const LIMIAR_DESLIGA = 0.02

/**
 * Quanto tempo de silêncio antes de apagar o anel.
 *
 * A pausa entre palavras de uma frase normal fica bem abaixo disto. Sem essa
 * janela o anel pisca a cada respiração — e piscar chama mais atenção que o
 * próprio falar, que é o oposto do que o indicador serve para fazer.
 */
export const MS_SEGURA = 320

export interface EstadoFala {
  falando: boolean
  /** Desde quando o nível está baixo. `null` enquanto ainda está alto. */
  quietoDesde: number | null
}

/**
 * O próximo estado, a partir do nível medido agora.
 *
 * Dois limiares em vez de um: a faixa entre eles é fraca demais para ACENDER e
 * forte demais para afirmar que parou. Com um limiar só, qualquer som que
 * oscile em volta dele liga e desliga sem parar.
 */
export function decidirFalando(
  atual: EstadoFala, nivel: number, agora: number,
): EstadoFala {
  if (atual.falando) {
    // Já falando: só o silêncio abaixo do limiar BAIXO começa a contar.
    if (nivel > LIMIAR_DESLIGA) return { falando: true, quietoDesde: null }
    const desde = atual.quietoDesde ?? agora
    if (agora - desde >= MS_SEGURA) return { falando: false, quietoDesde: null }
    return { falando: true, quietoDesde: desde }
  }

  // Calado: só o limiar ALTO acende.
  if (nivel > LIMIAR_LIGA) return { falando: true, quietoDesde: null }
  return { falando: false, quietoDesde: null }
}

/**
 * A energia de um pedaço de onda (raiz da média dos quadrados).
 *
 * Energia, não pico: um estalo — clique de mouse, batida na mesa — tem pico
 * máximo e energia baixa. Medir pelo pico acenderia o anel com qualquer
 * barulho seco. E o quadrado é o que faz a metade negativa da onda contar
 * igual à positiva; somar direto daria quase zero para qualquer som.
 */
export function rmsDe(amostras: Float32Array): number {
  if (amostras.length === 0) return 0
  let soma = 0
  for (const amostra of amostras) soma += amostra * amostra
  return Math.sqrt(soma / amostras.length)
}

/**
 * Quantas amostras o analisador entrega por leitura (`fftSize`).
 *
 * Não é detalhe de implementação: um estalo isolado rende RMS de 1/√N, então
 * uma janela curta demais faz uma batida na mesa passar do `LIMIAR_LIGA`. Com
 * 2048 o estalo rende ~0,022, abaixo do limiar. Há teste amarrando os dois.
 *
 * Do outro lado, janela grande demais atrasa a reação: 2048 amostras a 48 kHz
 * são ~43 ms, imperceptível.
 */
export const TAMANHO_JANELA = 2048
