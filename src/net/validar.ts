import type { EstadoJogo, Fase } from '../game/types'
import { LIMITES } from '../game/rules'

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

/** Um sapato de 6 baralhos tem 312 cartas; nenhuma mão chega perto. O teto
 *  existe porque desenhar cem mil cartas trava o navegador de quem recebe —
 *  limitar só a lista de jogadores não fecha esse buraco. */
const MAX_CARTAS = 512

/** Splits sucessivos, com folga. */
const MAX_MAOS = 16

const ehInteiroEntre = (valor: unknown, minimo: number, maximo: number): boolean =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null

/**
 * `Array.isArray` na lista de fora não basta: o desenho percorre o que está
 * DENTRO. `mesa.ts` faz `jogador.maos.forEach(...)` e lê `mao.cartas` logo
 * depois, então um item vazio numa lista bem-formada lança no meio do
 * desenho — que é exatamente o caso que este arquivo existe para impedir.
 *
 * A validação vai só até onde o desenho vai: as listas percorridas e as
 * chaves lidas sem verificação. Ir mais fundo recusaria mesa legítima na
 * primeira mudança do jogo, e essa falha só apareceria com gente jogando.
 */
const ehListaDe = (
  valor: unknown, maximo: number, item: (x: unknown) => boolean,
): boolean =>
  // O teto vem ANTES do `every`: numa lista absurda, percorrer para validar já
  // é o próprio travamento.
  Array.isArray(valor) && valor.length <= maximo && valor.every(item)

const ehCarta = (valor: unknown): boolean => ehObjeto(valor)

const ehMao = (valor: unknown): boolean =>
  ehObjeto(valor) && ehListaDe(valor['cartas'], MAX_CARTAS, ehCarta)

/**
 * A configuração da partida, que agora viaja no estado.
 *
 * Recusa em vez de encaixar nos limites: encaixar deixaria a MINHA cópia do
 * estado diferente da do anfitrião, e a partir daí duas pessoas jogariam a
 * mesma partida com regras diferentes — que é exatamente o que pôr a
 * configuração no estado veio evitar.
 */
const ehConfig = (valor: unknown): boolean => {
  if (!ehObjeto(valor)) return false
  const c = valor
  if (!ehInteiroEntre(c['fichasIniciais'], LIMITES.fichasIniciais.min, LIMITES.fichasIniciais.max)) {
    return false
  }
  if (!ehInteiroEntre(c['apostaMax'], 1, LIMITES.apostaMax.max)) return false
  if (!ehInteiroEntre(c['segundosTurno'], LIMITES.segundosTurno.min, LIMITES.segundosTurno.max)) {
    return false
  }
  // `null` é "até sobrar um", e é um valor legítimo — não a ausência do campo.
  if (c['alvo'] === null) return true
  return ehInteiroEntre(c['alvo'], LIMITES.alvo.min, LIMITES.alvo.max)
}

const ehJogador = (valor: unknown): boolean =>
  ehObjeto(valor) &&
  typeof valor['peerId'] === 'string' &&
  ehListaDe(valor['maos'], MAX_MAOS, ehMao)

/**
 * Se o objeto tem a FORMA de um estado de jogo — não se ele é verdadeiro.
 * Só o suficiente para que adotá-lo e desenhá-lo não lance.
 */
export function ehEstadoPlausivel(valor: unknown): valor is EstadoJogo {
  if (typeof valor !== 'object' || valor === null) return false
  const e = valor as Record<string, unknown>

  if (typeof e['hostAtual'] !== 'string') return false
  if (!ehConfig(e['config'])) return false
  if (!FASES.includes(e['fase'] as Fase)) return false
  if (!ehInteiroEntre(e['rodada'], 0, MAX_RODADA)) return false
  if (!ehListaDe(e['jogadores'], MAX_JOGADORES, ehJogador)) return false
  if (!ehListaDe(e['maoDealer'], MAX_CARTAS, ehCarta)) return false
  return true
}

/**
 * Um texto vindo da rede, cortado no limite. Qualquer coisa que não seja
 * string vira vazio — inclusive objetos com `toString`, que numa concatenação
 * virariam texto sem ninguém perceber.
 *
 * **O corte é por ponto de código, e não por unidade UTF-16.** Uma emoji ocupa
 * duas unidades, e um `slice` que caia entre elas deixa metade de um par
 * substituto — que o navegador desenha como `�`. Enquanto o chat era só texto
 * isso era raro; com um seletor de emoji, acertar essa fronteira deixou de
 * ser.
 *
 * O `slice` de `limite * 2` antes de espalhar NÃO é otimização: é o que impede
 * a defesa de virar o ataque. Espalhar a string inteira alocaria um item por
 * caractere, e quem manda dez megabytes de texto passaria a derrubar quem
 * recebe pelo próprio código que existe para impedir isso. Como todo ponto de
 * código cabe em no máximo duas unidades, o dobro do limite sempre contém
 * caracteres suficientes.
 */
export function textoLimitado(valor: unknown, limite: number): string {
  if (typeof valor !== 'string') return ''
  return [...valor.slice(0, limite * 2)].slice(0, limite).join('')
}
