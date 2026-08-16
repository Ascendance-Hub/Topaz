import { renderizarMesa } from './components/mesa'
import type { Acao, EstadoJogo } from '../game/types'

/**
 * Re-render completo a cada mudança. O estado é pequeno o bastante
 * para isso ser imperceptível, e elimina divergência entre DOM e estado.
 */
export function renderizar(
  raiz: HTMLElement, estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): void {
  raiz.replaceChildren(renderizarMesa(estado, meuId, aoAgir))
}
