import { montarLinkSala } from '../sala'

/**
 * Barra fixa acima da mesa: código da sala, quem é o anfitrião atual e um
 * botão para copiar o link de convite. Recriada a cada mudança de estado —
 * quem monta (`main.ts`) é responsável por trocar o nó antigo pelo novo no
 * DOM real a cada chamada, não só na primeira.
 */
export function renderizarBarraSala(codigo: string, souHost: boolean): HTMLElement {
  const barra = document.createElement('div')
  barra.className = 'barra-sala'

  const info = document.createElement('span')
  info.innerHTML = `Sala <span class="codigo">${codigo}</span>${souHost ? ' · você é o anfitrião' : ''}`

  const copiar = document.createElement('button')
  copiar.className = 'botao'
  copiar.textContent = 'Copiar link'
  copiar.onclick = async () => {
    await navigator.clipboard.writeText(montarLinkSala(location.href, codigo))
    copiar.textContent = 'Copiado!'
    setTimeout(() => { copiar.textContent = 'Copiar link' }, 1600)
  }

  barra.append(info, copiar)
  return barra
}
