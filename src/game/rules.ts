import { avaliar, ehBlackjackNatural, valorCarta } from './hand'
import type {
  Carta, ConfigPartida, EstadoJogo, Jogador, Mao, ResultadoMao, TipoAcao,
} from './types'

/**
 * O formato padrão de uma partida.
 *
 * São os mesmos números de sempre, com UMA mudança: o alvo saiu de 1500 para
 * 2500. Com 1000 iniciais e aposta máxima de 500, o alvo antigo fazia uma
 * única mão ganha encerrar a partida — a pessoa apostava 500 na primeira mão,
 * ganhava, chegava a 1500 e o jogo acabava. Com 2500 são necessárias umas três
 * vitórias cheias.
 */
export const CONFIG_PADRAO: ConfigPartida = Object.freeze({
  fichasIniciais: 1000,
  alvo: 2500,
  apostaMax: 500,
  segundosTurno: 30,
})

/** Limites do que o anfitrião pode escolher. Existem para que nenhuma escolha
 *  produza uma partida impossível de jogar ou de terminar. */
export const LIMITES = Object.freeze({
  fichasIniciais: { min: 100, max: 100_000 },
  alvo: { min: 200, max: 1_000_000 },
  apostaMax: { min: 25, max: 100_000 },
  segundosTurno: { min: 10, max: 300 },
})

export const REGRAS = Object.freeze({
  numBaralhos: 6,
  apostaMin: 25,
  fichas: [25, 100, 500] as const,
  maxCadeiras: 7,
  maxMaos: 3,
  segundosTurno: 30,
  segundosReconexao: 60,
  rodadasParaEspectador: 2,
  pagaBlackjack: 1.5,
  pagaVitoria: 1,
  pagaSeguro: 2,
  dealerParaEm: 17,
  msEntreCartasDealer: 700,
  msMostrarResultado: 2500,
})

/**
 * As fichas que a mesa oferece, dado o teto de aposta.
 *
 * A lista de `REGRAS.fichas` é fixa (25, 100, 500) e era usada crua nos
 * botões. Com o teto configurável isso ficou errado dos dois lados: baixar o
 * teto para 300 deixava um botão de 500 na tela que o motor recusava — a
 * pessoa clicava e nada acontecia —, e um teto de 800 não teria como ser
 * apostado de uma vez.
 *
 * O próprio teto entra na lista quando não é um dos valores padrão, para que
 * apostar tudo seja sempre um clique.
 */
export function fichasDisponiveis(apostaMax: number): number[] {
  const cabem: number[] = REGRAS.fichas.filter((v) => v <= apostaMax)
  return cabem.includes(apostaMax) ? cabem : [...cabem, apostaMax]
}

/** Encaixa um número entre um mínimo e um máximo. */
function entre(valor: unknown, min: number, max: number, padrao: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return padrao
  return Math.min(max, Math.max(min, Math.round(valor)))
}

/**
 * Põe uma configuração recebida em forma utilizável.
 *
 * Ela chega pela rede — de um cliente modificado, ou de uma versão do site que
 * não conhecemos — então nada aqui pode confiar no formato. O que não é número
 * vira o padrão, e o que é número é encaixado nos limites.
 *
 * Duas relações importam mais que os limites individuais, porque cada uma
 * produziria uma partida que não dá para jogar:
 *
 * - **Aposta máxima acima das fichas iniciais** deixaria a mesa apostando o
 *   que ninguém tem, com os botões nascendo desabilitados.
 * - **Alvo abaixo ou igual às fichas iniciais** encerraria a partida antes da
 *   primeira carta. É a versão extrema do defeito que motivou este trabalho:
 *   1000 iniciais com alvo 1500 e aposta 500 acabava numa mão.
 */
export function normalizarConfig(bruta: unknown): ConfigPartida {
  const c = (typeof bruta === 'object' && bruta !== null ? bruta : {}) as Record<string, unknown>

  const fichasIniciais = entre(
    c['fichasIniciais'], LIMITES.fichasIniciais.min, LIMITES.fichasIniciais.max,
    CONFIG_PADRAO.fichasIniciais,
  )
  const apostaMax = Math.min(
    fichasIniciais,
    entre(c['apostaMax'], Math.max(LIMITES.apostaMax.min, REGRAS.apostaMin),
      LIMITES.apostaMax.max, CONFIG_PADRAO.apostaMax),
  )
  const alvoBruto = c['alvo']
  const alvo = alvoBruto === null
    ? null
    : Math.max(
      fichasIniciais + REGRAS.apostaMin,
      entre(alvoBruto, LIMITES.alvo.min, LIMITES.alvo.max, CONFIG_PADRAO.alvo ?? 2500),
    )

  return {
    fichasIniciais,
    alvo,
    apostaMax,
    segundosTurno: entre(
      c['segundosTurno'], LIMITES.segundosTurno.min, LIMITES.segundosTurno.max,
      CONFIG_PADRAO.segundosTurno,
    ),
  }
}

/**
 * Ainda pode disputar: não foi eliminado e tem fichas para a aposta mínima
 * (spec §6, "apto" — sentado ou não). Mora aqui, num lugar só, porque o placar
 * e a regra de fim de partida precisam concordar sempre: com a regra escrita
 * duas vezes, mudar o limiar num lado fazia a tela de fim discordar em
 * silêncio de quem o motor considera vivo.
 */
export function aindaEmJogo(jogador: Jogador): boolean {
  return jogador.eliminadoEm === null && jogador.fichas >= REGRAS.apostaMin
}

/**
 * A mesa está parada esperando uma ação DESTE jogador agora?
 *
 * Existe porque a mesa deixou de ser a tela inteira: quem está na sala (ou,
 * mais tarde, numa call) não vê o painel e perde a vez em silêncio quando o
 * prazo vence — parando numa mão que ele nunca escolheu parar.
 *
 * As três condições espelham exatamente as que fazem `painelProprio` mostrar
 * botões. Ficam aqui, e não na camada de UI, para não haver duas respostas
 * possíveis à mesma pergunta: um aviso que aparece sem botão embaixo, ou um
 * botão esperando sem aviso nenhum, seriam os dois piores que não ter aviso.
 */
export function mesaEsperaPor(estado: EstadoJogo, peerId: string): boolean {
  const jogador = estado.jogadores.find((j) => j.peerId === peerId)
  // De pé não há o que responder: quem não tem cadeira não recebe painel.
  if (!jogador || jogador.cadeira === null) return false

  switch (estado.fase) {
    case 'apostas':
      // `aindaEmJogo` e não só `maos.length === 0`: sem fichas para a aposta
      // mínima os botões nascem desabilitados, e avisar seria mandar a pessoa
      // largar a conversa para olhar uma tela onde não há nada a fazer.
      return jogador.maos.length === 0 && aindaEmJogo(jogador)
    case 'seguro':
      return jogador.maos.length > 0 && !jogador.decidiuSeguro
    case 'turnos':
      return estado.vezDe === peerId && jogador.maos[jogador.maoAtiva] !== undefined
    default:
      return false
  }
}

export function dealerDeveComprar(cartas: Carta[]): boolean {
  return avaliar(cartas).total < REGRAS.dealerParaEm
}

export function acoesDisponiveis(mao: Mao, jogador: Jogador): TipoAcao[] {
  if (mao.encerrada) return []

  const { total } = avaliar(mao.cartas)
  // 21 não é uma regra da casa mas a própria definição do jogo; alterar quebraria avaliar.
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
      return mao.aposta + mao.aposta * REGRAS.pagaVitoria
    case 'empatou':
      return mao.aposta
    case 'perdeu':
      return 0
  }
}
