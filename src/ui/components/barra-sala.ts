import { montarLinkSala } from '../sala'

export const ROTULO_COPIAR = 'Copiar link'
export const ROTULO_COPIADO = 'Copiado!'
/** Sem clipboard (permissão negada, contexto não seguro), o link ainda está
 *  na barra de endereços — é para lá que mandamos o jogador. */
export const ROTULO_FALHA_COPIA = 'Copie da barra de endereços'

/**
 * Barra fixa acima da mesa: código da sala, quem é o anfitrião atual e um
 * botão para copiar o link de convite. Recriada a cada mudança de estado —
 * quem monta (`main.ts`) é responsável por trocar o nó antigo pelo novo no
 * DOM real a cada chamada, não só na primeira.
 */
export function renderizarBarraSala(codigo: string, souHost: boolean): HTMLElement {
  const barra = document.createElement('div')
  barra.className = 'barra-sala'

  // Construído por nó, não por innerHTML: `codigo` não é uma constante — em
  // teoria pode chegar aqui sem ter passado por `ehCodigoValido` (um chamador
  // futuro, um bug upstream). Montar os nós diretamente fecha a porta de XSS
  // por completo, independente do que qualquer validação anterior faça ou
  // deixe de fazer.
  const info = document.createElement('span')
  info.append('Sala ')

  const cod = document.createElement('span')
  cod.className = 'codigo'
  cod.textContent = codigo
  info.append(cod)

  if (souHost) info.append(' · você é o anfitrião')

  const copiar = document.createElement('button')
  copiar.className = 'botao'
  copiar.textContent = ROTULO_COPIAR
  // `navigator.clipboard` falha (ou nem existe) com permissão negada, em
  // http sem TLS ou em navegador antigo. Sem o catch isso virava uma
  // rejeição não tratada e um botão que simplesmente não faz nada — o
  // jogador fica sem o link e sem saber por quê.
  copiar.onclick = async () => {
    try {
      await navigator.clipboard.writeText(montarLinkSala(location.href, codigo))
      copiar.textContent = ROTULO_COPIADO
    } catch {
      copiar.textContent = ROTULO_FALHA_COPIA
    }
    setTimeout(() => { copiar.textContent = ROTULO_COPIAR }, 1600)
  }

  barra.append(info, copiar)
  return barra
}
