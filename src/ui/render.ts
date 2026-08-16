import { renderizarMesa, CHAVE_DEALER, chaveJogador } from './components/mesa'
import { animarEntrada, origemSapata } from './animate'
import type { ContagensCartas } from './components/mesa'
import type { Acao, EstadoJogo } from '../game/types'

const CHAVE_DATASET = 'contagensCartas'

/**
 * Quantas cartas cada entidade (jogador, pelo peerId, ou dealer) tem na mão
 * mostrada agora — mesma contagem que `renderizarMesa` usa para decidir
 * quais cartas marcar como novas, calculada aqui porque é `render.ts` quem
 * compara "antes" com "agora".
 */
function contarCartas(estado: EstadoJogo): ContagensCartas {
  const contagens: ContagensCartas = {}
  for (const jogador of estado.jogadores) {
    contagens[chaveJogador(jogador.peerId)] = jogador.maos[jogador.maoAtiva]?.cartas.length ?? 0
  }
  contagens[CHAVE_DEALER] = estado.maoDealer.length + (estado.dealerTemOculta ? 1 : 0)
  return contagens
}

function somar(contagens: ContagensCartas): number {
  return Object.values(contagens).reduce((soma, n) => soma + n, 0)
}

/**
 * Lê a contagem da renderização anterior do próprio elemento raiz, não de
 * uma variável de módulo — assim `renderizar` não guarda nenhum estado
 * compartilhado entre chamadas, e duas raízes (duas mesas, ou uma raiz
 * recriada) nunca se confundem.
 */
function lerContagensAnteriores(raiz: HTMLElement): ContagensCartas {
  const bruto = raiz.dataset[CHAVE_DATASET]
  if (!bruto) return {}
  try {
    return JSON.parse(bruto) as ContagensCartas
  } catch {
    return {}
  }
}

/**
 * Re-render completo a cada mudança. O estado é pequeno o bastante
 * para isso ser imperceptível, e elimina divergência entre DOM e estado.
 *
 * A contagem de cartas anterior fica guardada no dataset da própria raiz
 * (não em `let` de módulo), para que a decisão de animar só dependa do que
 * já esteve nessa mesa — nunca de uma chamada anterior em outra raiz.
 */
export function renderizar(
  raiz: HTMLElement, estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): void {
  const anteriores = lerContagensAnteriores(raiz)
  const atuais = contarCartas(estado)
  // Cresceu = alguém recebeu carta nesta rodada. Uma rodada nova zera as
  // mãos (contagem cai) — isso nunca deve disparar o voo de entrada.
  const houveDistribuicao = somar(atuais) > somar(anteriores)

  raiz.replaceChildren(renderizarMesa(estado, meuId, aoAgir, anteriores))
  raiz.dataset[CHAVE_DATASET] = JSON.stringify(atuais)

  if (houveDistribuicao) {
    animarEntrada(raiz, origemSapata(raiz))
  }
}
