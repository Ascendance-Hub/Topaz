import { renderizarMesa, CHAVE_DEALER, chaveMao } from './components/mesa'
import { renderizarFim } from './components/fim'
import { animarEntrada, origemSapata } from './animate'
import type { ContagensCartas } from './components/mesa'
import type { Acao, EstadoJogo } from '../game/types'

const CHAVE_DATASET = 'contagensCartas'

/**
 * Quantas cartas cada entidade (cada mão, pelo id, ou o dealer) tem na tela
 * agora — mesma contagem que `renderizarMesa` usa para decidir quais cartas
 * marcar como novas, calculada aqui porque é `render.ts` quem compara
 * "antes" com "agora". Por mão, não por jogador: um split põe 2 ou 3 mãos
 * do mesmo jogador na tela ao mesmo tempo.
 */
function contarCartas(estado: EstadoJogo): ContagensCartas {
  const contagens: ContagensCartas = {}
  for (const jogador of estado.jogadores) {
    for (const mao of jogador.maos) contagens[chaveMao(mao.id)] = mao.cartas.length
  }
  contagens[CHAVE_DEALER] = estado.maoDealer.length + (estado.dealerTemOculta ? 1 : 0)
  return contagens
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

  if (estado.fase === 'fim') {
    raiz.replaceChildren(renderizarFim(estado, meuId, aoAgir))
    // Grava a contagem mesmo aqui: sem isto, uma volta à mesa (nova partida)
    // comparava com a contagem de antes do fim e disparava voo de cartas
    // que nunca existiram nesta tela.
    raiz.dataset[CHAVE_DATASET] = JSON.stringify(atuais)
    return
  }

  // Por entidade, não por soma: se uma mão encolhe e outra cresce no mesmo
  // render, as somas podem se cancelar e esconder uma distribuição real.
  // Uma rodada nova zera todas as mãos (todas encolhem) — isso nunca conta
  // como crescimento de ninguém, então nunca dispara o voo de entrada.
  const houveDistribuicao = Object.entries(atuais).some(
    ([chave, n]) => n > (anteriores[chave] ?? 0),
  )

  raiz.replaceChildren(renderizarMesa(estado, meuId, aoAgir, anteriores))
  raiz.dataset[CHAVE_DATASET] = JSON.stringify(atuais)

  if (houveDistribuicao) {
    animarEntrada(raiz, origemSapata(raiz))
  }
}
