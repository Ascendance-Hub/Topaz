import type { EstadoCall } from '../../call/protocolo'

export interface AcoesCall {
  entrar(): void
  sair(): void
}

function botao(chave: string, rotulo: string, aoClicar: () => void): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'call-botao'
  el.dataset['call'] = chave
  el.textContent = rotulo
  el.onclick = aoClicar
  return el
}

/**
 * Barra de controles da call. Vive fora do palco que `renderizar` reconstrói —
 * um botão que sumisse e voltasse a cada broadcast do host seria impossível de
 * acertar com o mouse.
 *
 * Entrar na call é um ato explícito, separado de entrar na sala: é o que
 * impede um microfone aberto sem a pessoa ter pedido.
 */
export function renderizarControlesCall(estado: EstadoCall, acoes: AcoesCall): HTMLElement {
  const barra = document.createElement('div')
  barra.className = 'call-controles'

  if (!estado.euNaCall) {
    barra.append(botao('entrar', 'Entrar na call', () => acoes.entrar()))
    return barra
  }

  const contagem = document.createElement('span')
  contagem.className = 'call-contagem'
  // Eu conto: "2 na call" descreve a conversa, enquanto "1 na call" com alguém
  // do outro lado descreveria uma lista de terceiros que ninguém pediu.
  contagem.textContent = `${estado.naCall.length + 1} na call`

  barra.append(contagem, botao('sair', 'Sair da call', () => acoes.sair()))
  return barra
}
