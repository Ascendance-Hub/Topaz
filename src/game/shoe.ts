import type { Carta, Naipe, Rng, Valor } from './types'

const NAIPES: readonly Naipe[] = ['copas', 'ouros', 'paus', 'espadas']
const VALORES: readonly Valor[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
]

const LIMIAR_REEMBARALHO = 0.25

/** Gerador determinístico (mulberry32) — usado nos testes e na semente da partida. */
export function rngSemente(semente: number): Rng {
  let estado = semente >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function criarBaralho(): Carta[] {
  return NAIPES.flatMap((naipe) => VALORES.map((valor) => ({ naipe, valor })))
}

/** Fisher-Yates sobre uma cópia — o array recebido nunca é mutado. */
export function embaralhar(cartas: Carta[], rng: Rng): Carta[] {
  const copia = [...cartas]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = copia[i]!
    const b = copia[j]!
    copia[i] = b
    copia[j] = a
  }
  return copia
}

export function criarSapata(numBaralhos: number, rng: Rng): Carta[] {
  const cartas = Array.from({ length: numBaralhos }, criarBaralho).flat()
  return embaralhar(cartas, rng)
}

export function precisaReembaralhar(restantes: number, numBaralhos: number): boolean {
  return restantes <= numBaralhos * 52 * LIMIAR_REEMBARALHO
}

/**
 * Monta uma sapata nova descontando as cartas já visíveis na mesa.
 * Usada quando um novo host assume: ele nunca viu a sapata do anterior,
 * mas sabe o que foi distribuído.
 */
export function reconstruirSapata(
  numBaralhos: number,
  cartasVistas: Carta[],
  rng: Rng,
): Carta[] {
  const restantes = Array.from({ length: numBaralhos }, criarBaralho).flat()
  for (const vista of cartasVistas) {
    const indice = restantes.findIndex(
      (c) => c.valor === vista.valor && c.naipe === vista.naipe,
    )
    if (indice !== -1) restantes.splice(indice, 1)
  }
  return embaralhar(restantes, rng)
}
