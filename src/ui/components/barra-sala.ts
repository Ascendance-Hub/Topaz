import { montarLinkSala } from '../codigo'

export const ROTULO_COPIAR = 'Copiar link'
export const ROTULO_COPIADO = 'Copiado!'
/** Sem clipboard (permissão negada, contexto não seguro), o link ainda está
 *  na barra de endereços — é para lá que mandamos o jogador. */
export const ROTULO_FALHA_COPIA = 'Copie da barra de endereços'

export interface OpcoesBarra {
  aoReconectar?: () => void
  /** Quantas pessoas o anfitrião diz que estão na sala, contando você. */
  naSala?: number
  /** Com quantas dessas eu tenho conexão direta, contando você. */
  conectados?: number
}

export const ROTULO_RECONECTAR = 'Reconectar'

/**
 * Barra fixa acima da mesa: código da sala, quem é o anfitrião atual, um botão
 * para copiar o link de convite, e o diagnóstico de conexão. Recriada a cada
 * mudança de estado — quem monta (`main.ts`) é responsável por trocar o nó
 * antigo pelo novo no DOM real a cada chamada, não só na primeira.
 *
 * O diagnóstico existe porque "não conectou" tem duas causas muito diferentes
 * e indistinguíveis a olho nu: ninguém achou a pessoa, ou acharam e a conexão
 * direta não fechou. A diferença entre quantos estão na sala e com quantos eu
 * falo é exatamente o segundo caso.
 */
export function renderizarBarraSala(
  codigo: string, souHost: boolean, opcoes: OpcoesBarra = {},
): HTMLElement {
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

  barra.append(info)

  if (opcoes.naSala !== undefined && opcoes.conectados !== undefined) {
    const faltando = Math.max(0, opcoes.naSala - opcoes.conectados)
    const diag = document.createElement('span')
    diag.className = 'barra-diagnostico'
    diag.dataset['faltando'] = String(faltando)
    diag.textContent = `${opcoes.conectados} de ${opcoes.naSala} conectados`
    if (faltando > 0) {
      diag.title = faltando === 1
        ? '1 pessoa está na sala mas sem conexão direta com você'
        : `${faltando} pessoas estão na sala mas sem conexão direta com você`
    }
    barra.append(diag)
  }

  if (opcoes.aoReconectar) {
    const reconectar = document.createElement('button')
    reconectar.className = 'botao fantasma'
    reconectar.dataset['sala'] = 'reconectar'
    reconectar.textContent = ROTULO_RECONECTAR
    // Refazer a conexão sem recarregar a página. Recarregar daria uma
    // identidade nova (o `selfId` do Trystero vive só enquanto a página vive),
    // e o anfitrião passaria a te ver como outra pessoa.
    reconectar.onclick = () => opcoes.aoReconectar?.()
    barra.append(reconectar)
  }

  barra.append(copiar)
  return barra
}
