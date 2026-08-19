/** Teto de uma mensagem. Papo de mesa, não redação. */
export const LIMITE_TEXTO = 200

/**
 * Quantas linhas ficam na tela. Não existe histórico do lado de fora: quem
 * entra depois começa em branco e recarregar a página zera. Sem um teto, uma
 * sala aberta a tarde toda acumularia nós até engasgar o navegador.
 */
export const MAX_LINHAS = 100

export interface Chat {
  raiz: HTMLElement
  /** Põe uma linha no fim do log. `apelido` já resolvido por quem chama. */
  receber(apelido: string, texto: string): void
}

/**
 * Painel de conversa da sala.
 *
 * Devolve um objeto com a raiz em vez de só o elemento porque este painel é
 * criado UMA vez e nunca substituído: `renderizar` troca todos os filhos da
 * mesa a cada mudança de estado — num cliente, a cada broadcast do host, o
 * que durante a compra do dealer são 700ms. Um campo de texto reconstruído
 * nesse ritmo perderia o foco e apagaria o que a pessoa está escrevendo
 * várias vezes por segundo.
 */
export function criarChat(aoEnviar: (texto: string) => void): Chat {
  const raiz = document.createElement('div')
  raiz.className = 'chat'
  raiz.dataset['aberto'] = '0'

  const gatilho = document.createElement('button')
  gatilho.type = 'button'
  gatilho.className = 'chat-gatilho'
  gatilho.setAttribute('aria-expanded', 'false')

  const rotulo = document.createElement('span')
  rotulo.textContent = 'Chat'
  gatilho.append(rotulo)

  const log = document.createElement('div')
  log.className = 'chat-log'
  log.setAttribute('role', 'log')
  log.setAttribute('aria-live', 'polite')

  const form = document.createElement('form')
  form.className = 'chat-form'

  const campo = document.createElement('input')
  campo.type = 'text'
  campo.className = 'chat-campo'
  campo.maxLength = LIMITE_TEXTO
  campo.placeholder = 'Falar com a mesa…'
  campo.setAttribute('aria-label', 'Mensagem para a mesa')

  const botao = document.createElement('button')
  botao.type = 'submit'
  botao.className = 'chat-enviar'
  botao.textContent = 'Enviar'

  form.append(campo, botao)
  raiz.append(gatilho, log, form)

  let aberto = false
  let naoLidas = 0

  /** Selo com o número de mensagens perdidas; some quando não há nenhuma. */
  function desenharNaoLidas(): void {
    gatilho.querySelector('.chat-nao-lidas')?.remove()
    if (naoLidas === 0) return
    const selo = document.createElement('span')
    selo.className = 'chat-nao-lidas'
    selo.textContent = String(naoLidas)
    gatilho.append(selo)
  }

  /** Conversa é lida de baixo para cima: sem isto a gaveta abre no começo. */
  function rolarAoFim(): void {
    log.scrollTop = log.scrollHeight
  }

  gatilho.onclick = () => {
    aberto = !aberto
    raiz.dataset['aberto'] = aberto ? '1' : '0'
    gatilho.setAttribute('aria-expanded', String(aberto))
    if (aberto) {
      naoLidas = 0
      desenharNaoLidas()
      rolarAoFim()
    }
  }

  function receber(apelido: string, texto: string): void {
    const linha = document.createElement('div')
    linha.className = 'chat-linha'

    // `textContent` nos dois, nunca `innerHTML`: apelido e texto chegam de
    // outro navegador, e ninguém na sala escolheu executar o que o outro
    // digitou. Vale para o apelido também — ele vem do `EstadoJogo`, que é
    // preenchido por quem entrou, não por nós.
    const autor = document.createElement('span')
    autor.className = 'chat-autor'
    autor.textContent = apelido

    const corpo = document.createElement('span')
    corpo.className = 'chat-texto'
    corpo.textContent = texto

    linha.append(autor, corpo)
    log.append(linha)

    while (log.childElementCount > MAX_LINHAS) log.firstElementChild?.remove()

    if (!aberto) {
      naoLidas += 1
      desenharNaoLidas()
    }
    rolarAoFim()
  }

  form.onsubmit = (evento) => {
    evento.preventDefault()
    // `maxLength` só limita a digitação; colar texto por script (ou um
    // navegador que ignore o atributo) passaria batido. O corte de verdade
    // é aqui.
    const texto = campo.value.trim().slice(0, LIMITE_TEXTO)
    campo.value = ''
    if (!texto) return
    aoEnviar(texto)
  }

  return { raiz, receber }
}
