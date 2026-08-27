import type { Carta, Naipe } from '../../game/types'

const SIMBOLOS: Record<Naipe, string> = {
  copas: '♥', ouros: '♦', paus: '♣', espadas: '♠',
}

function simboloNaipe(naipe: Naipe): string {
  return SIMBOLOS[naipe]
}

export function elementoCarta(
  carta: Carta | null,
  opcoes: { grande?: boolean; nova?: boolean } = {},
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'carta'
  if (opcoes.grande) el.classList.add('grande')
  // Consumido por animarEntrada (src/ui/animate.ts), que remove o atributo
  // assim que dispara o voo — por isso não é módulo-nem-elemento-persistente,
  // é recalculado a cada render a partir de components/mesa.ts.
  if (opcoes.nova) el.dataset.nova = '1'

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
