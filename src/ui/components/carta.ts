import type { Carta, Naipe } from '../../game/types'

const SIMBOLOS: Record<Naipe, string> = {
  copas: '♥', ouros: '♦', paus: '♣', espadas: '♠',
}

export function simboloNaipe(naipe: Naipe): string {
  return SIMBOLOS[naipe]
}

export function elementoCarta(
  carta: Carta | null,
  opcoes: { grande?: boolean } = {},
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'carta'
  if (opcoes.grande) el.classList.add('grande')

  if (carta === null) {
    el.classList.add('verso')
    el.setAttribute('aria-label', 'carta virada para baixo')
    return el
  }

  const vermelha = carta.naipe === 'copas' || carta.naipe === 'ouros'
  if (vermelha) el.classList.add('vermelha')
  el.textContent = `${carta.valor}${simboloNaipe(carta.naipe)}`
  el.setAttribute('aria-label', `${carta.valor} de ${carta.naipe}`)
  return el
}
