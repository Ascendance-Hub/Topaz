import { aindaEmJogo } from './rules'
import type { EstadoJogo, Jogador } from './types'

/** Uma posição do placar. Mais de um jogador significa empate real. */
export type Colocacao = {
  posicao: number
  jogadores: Jogador[]
}

/**
 * Ordena por chave decrescente e agrupa os iguais na mesma posição, com
 * numeração de competição: depois de um empate triplo em 1º, o próximo é 4º.
 */
function agrupar(jogadores: Jogador[], chave: (j: Jogador) => number): Colocacao[] {
  const ordenados = [...jogadores].sort((a, b) => chave(b) - chave(a))
  const grupos: Colocacao[] = []
  for (const jogador of ordenados) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && chave(ultimo.jogadores[0]!) === chave(jogador)) {
      ultimo.jogadores.push(jogador)
    } else {
      grupos.push({ posicao: 0, jogadores: [jogador] })
    }
  }
  return grupos
}

/**
 * Placar final: vencedor, depois sobreviventes por saldo, depois eliminados
 * pela rodada em que caíram. Empate é empate — sem critério de desempate.
 */
export function classificacao(estado: EstadoJogo): Colocacao[] {
  const daPartida = estado.jogadores.filter((j) => estado.naPartida.includes(j.peerId))

  const vencedor = daPartida.filter((j) => j.peerId === estado.vencedor)
  const restantes = daPartida.filter((j) => j.peerId !== estado.vencedor)

  // Mesmo predicado que decide o fim da partida em `machine.ts`: o placar
  // nunca pode discordar do motor sobre quem ainda está vivo.
  const sobreviventes = restantes.filter(aindaEmJogo)
  const eliminados = restantes.filter((j) => !sobreviventes.includes(j))

  const grupos: Colocacao[] = [
    ...(vencedor.length > 0 ? [{ posicao: 0, jogadores: vencedor }] : []),
    ...agrupar(sobreviventes, (j) => j.fichas),
    ...agrupar(eliminados, (j) => j.eliminadoEm ?? 0),
  ]

  let acumulado = 0
  for (const grupo of grupos) {
    grupo.posicao = acumulado + 1
    acumulado += grupo.jogadores.length
  }
  return grupos
}
