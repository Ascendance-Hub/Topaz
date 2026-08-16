import type { Carta, Mao } from './types'

export function valorCarta(carta: Carta): number {
  if (carta.valor === 'A') return 1
  if (carta.valor === 'J' || carta.valor === 'Q' || carta.valor === 'K') return 10
  return Number(carta.valor)
}

/**
 * Soma tudo com Ás valendo 1 e promove um único Ás a 11 se couber.
 * Promover mais de um sempre estouraria (11 + 11 = 22), então um basta.
 * `soft` indica que há um Ás valendo 11 — ou seja, a mão não estoura
 * na próxima carta.
 */
export function avaliar(cartas: Carta[]): { total: number; soft: boolean } {
  const base = cartas.reduce((soma, carta) => soma + valorCarta(carta), 0)
  const temAs = cartas.some((carta) => carta.valor === 'A')

  if (temAs && base + 10 <= 21) {
    return { total: base + 10, soft: true }
  }
  return { total: base, soft: false }
}

export function estourou(cartas: Carta[]): boolean {
  return avaliar(cartas).total > 21
}

/**
 * Blackjack natural exige 21 nas duas cartas iniciais e mão que não
 * veio de split — 21 após split paga como vitória comum.
 */
export function ehBlackjackNatural(mao: Mao): boolean {
  return (
    !mao.vindaDeSplit &&
    mao.cartas.length === 2 &&
    avaliar(mao.cartas).total === 21
  )
}
