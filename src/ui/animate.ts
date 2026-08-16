/**
 * FLIP: depois que o DOM novo já está montado, medimos onde cada carta nova
 * ficou, aplicamos o deslocamento inverso instantaneamente — como se ela
 * ainda estivesse na sapata — e deixamos a transição definida em theme.css
 * (propriedade `.carta`) levá-la de volta à posição final.
 *
 * `--indice` é uma propriedade custom pura (um número, não um tempo): é o
 * CSS, via `--atraso-cascata`, quem decide quanto isso vale em ms. Nenhum
 * valor de duração ou atraso é escrito aqui.
 */
export function animarEntrada(raiz: HTMLElement, origem: DOMRect): void {
  const cartas = raiz.querySelectorAll<HTMLElement>('.carta[data-nova="1"]')

  cartas.forEach((carta, indice) => {
    const destino = carta.getBoundingClientRect()
    const dx = origem.left - destino.left
    const dy = origem.top - destino.top

    carta.style.setProperty('--indice', String(indice))
    carta.style.transition = 'none'
    carta.style.transform = `translate(${dx}px, ${dy}px) scale(0.85)`
    carta.style.opacity = '0'

    // A marcação é só para esta chamada: removida assim que o voo começa a
    // ser preparado, para que uma carta já em cena nunca seja pega de novo
    // por uma futura leitura deste mesmo seletor.
    carta.removeAttribute('data-nova')

    requestAnimationFrame(() => {
      carta.style.transition = ''
      carta.style.transform = ''
      carta.style.opacity = ''
    })
  })
}

/** Retângulo de onde as cartas "saem" — aproximação da sapata, no canto
 *  superior direito da mesa. */
export function origemSapata(raiz: HTMLElement): DOMRect {
  const mesa = raiz.querySelector('.mesa')
  if (!mesa) return new DOMRect(0, 0, 0, 0)
  const r = mesa.getBoundingClientRect()
  return new DOMRect(r.right - 60, r.top + 20, 42, 60)
}
