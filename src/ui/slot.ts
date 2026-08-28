/**
 * Um lugar na página cujo conteúdo é trocado inteiro.
 *
 * Existe por causa de um defeito que já aconteceu aqui: `Node.replaceWith` só
 * substitui o nó **uma vez**. Chamar de novo sobre a mesma referência mexe num
 * nó já órfão — o que está na página nunca é tocado, e a tela para de
 * acompanhar sem erro nenhum. Foi assim que um "você é o anfitrião" ficou sem
 * aparecer depois de uma migração de anfitrião.
 *
 * A defesa era lembrar de reatribuir a variável a cada troca:
 *
 *     barra.replaceWith(novaBarra)
 *     barra = novaBarra          // ← esquecer esta linha congela a tela
 *
 * Nove vezes, no `main.ts`. Aqui a variável não existe para quem chama:
 * `trocar` mexe sempre no nó que está de fato na árvore, e não há segunda linha
 * para esquecer.
 *
 * **Não guarda quem é o pai**, de propósito. Um slot recém-criado ainda não foi
 * anexado, e `replaceWith` num nó solto simplesmente não faz nada — que é o
 * comportamento certo, porque quem monta anexa `atual` logo em seguida.
 */
export interface Slot<T extends Element> {
  /** O nó que está na página agora. Serve para anexar e para consultar. */
  readonly atual: T
  trocar(novo: T): void
}

export function criarSlot<T extends Element>(inicial: T): Slot<T> {
  let atual = inicial
  return {
    get atual() {
      return atual
    },
    trocar(novo) {
      atual.replaceWith(novo)
      atual = novo
    },
  }
}
