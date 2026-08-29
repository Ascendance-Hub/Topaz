/**
 * O seletor de emoji do chat.
 *
 * Emoji é **texto**, não imagem: não entra byte nenhum no bundle, não há
 * arquivo para servir, e nada trafega além do que já trafegaria. Foi por isso
 * que este caminho ganhou dos outros dois — emotes de imagem exigiriam arte e
 * um jeito de distribuí-la sem servidor.
 *
 * A lista é curta de propósito. Um seletor com mil emoji é uma busca, e busca
 * é outra funcionalidade; trinta e seis cabem numa grade que se lê de relance,
 * e quem quiser outro usa o teclado de emoji do próprio sistema — que continua
 * funcionando, porque o campo é um `<input>` comum.
 */

/** Curadoria para o que este site é: conversa entre amigos e jogo de cartas. */
const EMOJI = [
  '😀', '😂', '🥲', '😅', '😉', '😍',
  '😎', '🤔', '😴', '🙃', '😱', '🤯',
  '👍', '👎', '👏', '🙏', '🤝', '💪',
  '👀', '❤️', '🔥', '⭐', '🎉', '💀',
  '🤡', '🙈', '🍀', '⏳', '✅', '❌',
  '🃏', '♠️', '♥️', '♦️', '♣️', '🎲',
] as const

export const ROTULO_ABRIR = 'Escolher emoji'

export interface SeletorDeEmoji {
  /** O botão que abre e fecha. Vai no formulário, ao lado do campo. */
  botao: HTMLButtonElement
  /** A grade. Nasce escondida; quem monta decide onde ela fica. */
  painel: HTMLElement
}

/**
 * Nasce fechado, e fecha ao escolher.
 *
 * **Não registra ouvinte no `document`.** A tentação seria fechar no clique
 * fora, e isso pediria um ouvinte global — que ninguém remove quando a sala é
 * desmontada, e vira um por troca de sala, para sempre. Já aconteceu aqui com
 * o `devicechange`. O fechamento sai do `focusout` do próprio invólucro, que
 * morre junto com ele.
 */
export function criarSeletorDeEmoji(aoEscolher: (emoji: string) => void): SeletorDeEmoji {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'chat-emoji-gatilho'
  botao.textContent = '🙂'
  botao.setAttribute('aria-label', ROTULO_ABRIR)
  botao.setAttribute('aria-expanded', 'false')

  const painel = document.createElement('div')
  painel.className = 'chat-emoji'
  painel.hidden = true
  painel.setAttribute('role', 'group')
  painel.setAttribute('aria-label', 'Emoji')

  function fechar(): void {
    painel.hidden = true
    botao.setAttribute('aria-expanded', 'false')
  }

  function alternar(): void {
    const abrindo = painel.hidden
    painel.hidden = !abrindo
    botao.setAttribute('aria-expanded', String(abrindo))
    if (abrindo) painel.querySelector('button')?.focus()
  }

  for (const emoji of EMOJI) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'chat-emoji-item'
    item.textContent = emoji
    item.setAttribute('aria-label', emoji)
    item.onclick = () => {
      aoEscolher(emoji)
      // Fecha ao escolher: manter aberto exigiria decidir quando fechar, e
      // duas emoji seguidas são dois cliques no gatilho — barato.
      fechar()
    }
    painel.append(item)
  }

  botao.onclick = alternar
  // Esc fecha de dentro da grade, que é onde o foco está com ela aberta.
  painel.onkeydown = (evento) => {
    if (evento.key !== 'Escape') return
    fechar()
    botao.focus()
  }

  return { botao, painel }
}
