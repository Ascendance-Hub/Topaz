import { gerarCodigoSala, lerCodigoDaUrl } from '../sala'

const CHAVE_APELIDO = 'topaz:apelido'

export function apelidoSalvo(): string {
  return localStorage.getItem(CHAVE_APELIDO) ?? ''
}

export function salvarApelido(apelido: string): void {
  localStorage.setItem(CHAVE_APELIDO, apelido)
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
  campoCodigo.maxLength = 8

  function entrar(codigo: string): void {
    const apelido = campoApelido.value.trim()
    if (!apelido) {
      campoApelido.focus()
      return
    }
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
      if (codigo.length === 8) {
        location.hash = `sala=${codigo}`
        entrar(codigo)
      }
    }

    lobby.append(criar, ou, campoCodigo, entrarBotao)
  }

  return lobby
}
