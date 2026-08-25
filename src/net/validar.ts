import type { EstadoJogo, Fase } from '../game/types'

/**
 * Os guardas do que chega pela rede.
 *
 * Numa sala sem servidor não existe árbitro: cada navegador recebe direto o
 * que o outro mandou, e o `Transporte` entrega um objeto já convertido de
 * JSON, com o TIPO que o TypeScript promete mas ninguém verificou. Um cliente
 * modificado — ou uma versão antiga do site — manda o que quiser.
 *
 * Isto aqui não impede trapaça: quem controla o próprio navegador pode
 * publicar um estado bem-formado e mentiroso, e sem servidor não há como
 * provar o contrário. O que estes guardas impedem é o pior caso, que é
 * DERRUBAR a sala dos outros: um campo com o tipo errado lança no meio do
 * desenho e apaga a página de quem recebeu.
 *
 * A regra é validar o que CHEGA, nunca confiar no limite aplicado por quem
 * enviou — o limite de quem envia só vale para quem é honesto.
 */

const FASES: readonly Fase[] = [
  'aguardando', 'apostas', 'distribuindo', 'seguro', 'turnos', 'dealer', 'acerto', 'fim',
]

/** Teto de rodada. Existe porque `mesaPrevalece` desempata por rodada: sem
 *  teto, alguém publica um número gigante e toda a sala adota a mesa dele. */
const MAX_RODADA = 1_000_000

/** Ninguém joga blackjack com mil pessoas na mesa; uma lista desse tamanho é
 *  ataque ou defeito, e desenhá-la trava o navegador. */
const MAX_JOGADORES = 64

const ehLista = (valor: unknown): boolean => Array.isArray(valor)

const ehInteiroEntre = (valor: unknown, minimo: number, maximo: number): boolean =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo

/**
 * Se o objeto tem a FORMA de um estado de jogo — não se ele é verdadeiro.
 * Só o suficiente para que adotá-lo e desenhá-lo não lance.
 */
export function ehEstadoPlausivel(valor: unknown): valor is EstadoJogo {
  if (typeof valor !== 'object' || valor === null) return false
  const e = valor as Record<string, unknown>

  if (typeof e['hostAtual'] !== 'string') return false
  if (!FASES.includes(e['fase'] as Fase)) return false
  if (!ehInteiroEntre(e['rodada'], 0, MAX_RODADA)) return false
  if (!ehLista(e['jogadores'])) return false
  if ((e['jogadores'] as unknown[]).length > MAX_JOGADORES) return false
  if (!ehLista(e['maoDealer'])) return false
  return true
}

/**
 * Um texto vindo da rede, cortado no limite. Qualquer coisa que não seja
 * string vira vazio — inclusive objetos com `toString`, que numa
 * concatenação virariam texto sem ninguém perceber.
 */
export function textoLimitado(valor: unknown, limite: number): string {
  if (typeof valor !== 'string') return ''
  return valor.slice(0, limite)
}
