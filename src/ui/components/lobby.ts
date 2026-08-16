import { gerarCodigoSala, lerCodigoDaUrl, TAMANHO_CODIGO } from '../sala'

const CHAVE_APELIDO = 'topaz:apelido'

/** Em janela anônima ou sob certas políticas corporativas, localStorage
 * pode estar bloqueado e lançar em qualquer acesso. Como o lobby inteiro
 * roda no topo de main.ts sem nada capturando exceções, deixar isso
 * escapar apagaria a página inteira por causa de um apelido não salvo. */
export function apelidoSalvo(): string {
  try {
    return localStorage.getItem(CHAVE_APELIDO) ?? ''
  } catch {
    return ''
  }
}

export function salvarApelido(apelido: string): void {
  try {
    localStorage.setItem(CHAVE_APELIDO, apelido)
  } catch {
    // Armazenamento indisponível: só não lembramos o apelido da próxima vez.
  }
}

/** Remove espaços e normaliza para maiúsculas um código digitado à mão. */
function normalizarCodigoDigitado(bruto: string): string {
  return bruto.replace(/\s+/g, '').toUpperCase()
}

export function renderizarLobby(
  aoEntrar: (apelido: string, codigo: string) => void,
): HTMLElement {
  const codigoDaUrl = lerCodigoDaUrl(location.hash)

  const lobby = document.createElement('div')
  lobby.className = 'lobby'

  const titulo = document.createElement('h1')
  titulo.textContent = 'Topaz'

  const sub = document.createElement('p')
  sub.className = 'sub'
  sub.textContent = codigoDaUrl
    ? `Entrando na sala ${codigoDaUrl}`
    : 'Blackjack com os amigos'

  const campoApelido = document.createElement('input')
  campoApelido.className = 'campo'
  campoApelido.placeholder = 'Seu apelido'
  campoApelido.maxLength = 16
  campoApelido.value = apelidoSalvo()

  lobby.append(titulo, sub, campoApelido)

  const campoCodigo = document.createElement('input')
  campoCodigo.className = 'campo'
  campoCodigo.placeholder = 'Código da sala'
  campoCodigo.maxLength = TAMANHO_CODIGO

  /** Devolve o apelido digitado, ou `null` e foca o campo se estiver
   * vazio. Verificado antes de qualquer efeito colateral (gerar código,
   * mudar o hash) para não desperdiçar um código de sala nem reescrever a
   * URL só para depois barrar por falta de apelido. */
  function apelidoValido(): string | null {
    const apelido = campoApelido.value.trim()
    if (!apelido) {
      campoApelido.focus()
      return null
    }
    return apelido
  }

  function entrar(codigo: string): void {
    const apelido = apelidoValido()
    if (!apelido) return
    salvarApelido(apelido)
    aoEntrar(apelido, codigo)
  }

  if (codigoDaUrl) {
    const botao = document.createElement('button')
    botao.className = 'botao'
    botao.textContent = 'Entrar na sala'
    botao.onclick = () => entrar(codigoDaUrl)
    lobby.append(botao)
  } else {
    const criar = document.createElement('button')
    criar.className = 'botao'
    criar.textContent = 'Criar sala'
    criar.onclick = () => {
      if (!apelidoValido()) return
      const codigo = gerarCodigoSala()
      location.hash = `sala=${codigo}`
      entrar(codigo)
    }

    const ou = document.createElement('div')
    ou.className = 'ou'
    ou.textContent = 'OU ENTRAR COM CÓDIGO'

    const entrarBotao = document.createElement('button')
    entrarBotao.className = 'botao fantasma'
    entrarBotao.textContent = 'Entrar'
    entrarBotao.onclick = () => {
      const codigo = normalizarCodigoDigitado(campoCodigo.value)
      if (codigo.length !== TAMANHO_CODIGO) return
      // Mesma ordem do caminho de criar sala: valida o apelido antes de
      // qualquer efeito colateral. Sem isso, digitar um código válido com o
      // apelido em branco reescrevia o hash e só depois barrava por falta
      // de apelido — a URL mudava para nada.
      if (!apelidoValido()) return
      location.hash = `sala=${codigo}`
      entrar(codigo)
    }

    lobby.append(criar, ou, campoCodigo, entrarBotao)
  }

  return lobby
}
