import type { EstadoCall } from '../../call/protocolo'

export interface AcoesCall {
  entrar(): void
  sair(): void
  compartilhar(): void
  pararTela(): void
  assistir(peerId: string): void
  pararDeAssistir(peerId: string): void
}

export const AVISO_SEM_ESPECTADOR =
  'ninguém está assistindo — sua tela não está sendo codificada'

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

  if (estado.euCompartilhando) {
    barra.append(botao('parar-tela', 'Parar de compartilhar', () => acoes.pararTela()))
    if (estado.assistidoPor.length === 0) {
      const aviso = document.createElement('span')
      aviso.className = 'call-sem-espectador'
      // Não é erro: é a assinatura funcionando. Dizer isso em voz alta evita a
      // pessoa achar que o compartilhamento falhou e ficar clicando de novo.
      aviso.textContent = AVISO_SEM_ESPECTADOR
      barra.append(aviso)
    }
  } else {
    barra.append(botao('compartilhar', 'Compartilhar tela', () => acoes.compartilhar()))
  }

  for (const peerId of estado.compartilhando) {
    const assistindo = estado.assistindo.includes(peerId)
    const el = botao(
      assistindo ? 'parar-assistir' : 'assistir',
      assistindo ? 'Parar de assistir' : 'Assistir tela',
      () => (assistindo ? acoes.pararDeAssistir(peerId) : acoes.assistir(peerId)),
    )
    el.dataset[assistindo ? 'pararAssistir' : 'assistir'] = peerId
    barra.append(el)
  }

  return barra
}
