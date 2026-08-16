import { avaliar, ehBlackjackNatural, valorCarta } from './hand'
import type { Carta, Jogador, Mao, ResultadoMao, TipoAcao } from './types'

export const REGRAS = Object.freeze({
  numBaralhos: 6,
  stackInicial: 1000,
  apostaMin: 25,
  apostaMax: 500,
  fichas: [25, 100, 500] as const,
  maxCadeiras: 7,
  maxMaos: 3,
  segundosTurno: 30,
  segundosReconexao: 60,
  rodadasParaEspectador: 2,
  pagaBlackjack: 1.5,
  pagaSeguro: 2,
})

export function dealerDeveComprar(cartas: Carta[]): boolean {
  return avaliar(cartas).total < 17
}

export function acoesDisponiveis(mao: Mao, jogador: Jogador): TipoAcao[] {
  if (mao.encerrada) return []

  const { total } = avaliar(mao.cartas)
  if (total > 21) return []

  // Ás dividido recebe exatamente uma carta e encerra.
  const asDividido =
    mao.vindaDeSplit && mao.cartas[0]?.valor === 'A' && mao.cartas.length >= 2
  if (asDividido) return []

  const acoes: TipoAcao[] = ['pedir', 'parar']

  const inicial = mao.cartas.length === 2
  const temFichas = jogador.fichas >= mao.aposta

  if (inicial && temFichas) acoes.push('dobrar')

  if (inicial && temFichas && jogador.maos.length < REGRAS.maxMaos) {
    const [a, b] = mao.cartas
    if (a && b && valorCarta(a) === valorCarta(b)) acoes.push('dividir')
  }

  return acoes
}

export function resultadoDe(mao: Mao, cartasDealer: Carta[]): ResultadoMao {
  const jogador = avaliar(mao.cartas).total
  if (jogador > 21) return 'perdeu'

  const dealer = avaliar(cartasDealer).total
  const jogadorBJ = ehBlackjackNatural(mao)
  const dealerBJ = cartasDealer.length === 2 && dealer === 21

  if (jogadorBJ && dealerBJ) return 'empatou'
  if (jogadorBJ) return 'blackjack'
  if (dealerBJ) return 'perdeu'

  if (dealer > 21) return 'ganhou'
  if (jogador > dealer) return 'ganhou'
  if (jogador < dealer) return 'perdeu'
  return 'empatou'
}

/** Total devolvido ao jogador em fichas, já incluindo a aposta original. */
export function pagamento(mao: Mao, cartasDealer: Carta[]): number {
  switch (resultadoDe(mao, cartasDealer)) {
    case 'blackjack':
      return mao.aposta + Math.floor(mao.aposta * REGRAS.pagaBlackjack)
    case 'ganhou':
      return mao.aposta * 2
    case 'empatou':
      return mao.aposta
    case 'perdeu':
      return 0
  }
}
