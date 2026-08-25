import {
  ehCodigoValido, formatarCodigo, gerarCodigoSala, haCodigoNaUrl, lerCodigoDaUrl,
  montarHashSala, normalizarCodigo, TAMANHO_FORMATADO,
} from '../codigo'
import { encolherImagem, esquecerFoto, fotoLembrada, lembrarFoto } from '../../perfil/foto-navegador'
import { inicialDe } from './participantes'

const CHAVE_APELIDO = 'topaz:apelido'

export const MENSAGEM_LINK_INVALIDO =
  'O código do convite está incompleto ou inválido — o link pode ter sido ' +
  'cortado ao ser enviado. Peça o link de novo, ou digite o código abaixo.'

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

export function renderizarLobby(
  aoEntrar: (apelido: string, codigo: string) => void,
): HTMLElement {
  const codigoDaUrl = lerCodigoDaUrl(location.hash)
  // A URL apontava para uma sala, mas o código não sobreviveu ao caminho
  // (link truncado no mensageiro, por exemplo). Cair calado na tela de criar
  // sala é o pior desfecho possível: o jogador acha que entrou na sala do
  // amigo, cria outra vazia e conclui que o jogo não funciona.
  const linkInvalido = !codigoDaUrl && haCodigoNaUrl(location.hash)

  const lobby = document.createElement('div')
  lobby.className = 'lobby'

  const titulo = document.createElement('h1')
  titulo.textContent = 'Topaz'

  const sub = document.createElement('p')
  sub.className = 'sub'
  sub.textContent = codigoDaUrl
    ? `Entrando na sala ${formatarCodigo(codigoDaUrl)}`
    // O cartão vive dentro da home, que já diz o que o site é. Aqui a linha
    // serve para instruir, não para apresentar: quem chegou até este cartão
    // quer saber o que fazer agora.
    : 'Crie uma sala e mande o link para quem você quer chamar.'

  const aviso = document.createElement('p')
  aviso.className = 'aviso'
  aviso.textContent = MENSAGEM_LINK_INVALIDO

  const campoApelido = document.createElement('input')
  campoApelido.className = 'campo'
  campoApelido.placeholder = 'Seu apelido'
  campoApelido.maxLength = 16
  campoApelido.value = apelidoSalvo()

  lobby.append(titulo, sub)
  if (linkInvalido) lobby.append(aviso)
  // O apelido vem ANTES do retrato no DOM. Não é só ordem visual: o campo de
  // arquivo escondido do retrato passaria a ser o primeiro `input` do lobby, e
  // qualquer código que procure "o campo" pegaria o errado.
  lobby.append(campoApelido, montarPerfil(campoApelido))

  const campoCodigo = document.createElement('input')
  campoCodigo.className = 'campo'
  campoCodigo.placeholder = 'Código da sala'
  // O limite conta os hífens: colar `K7X2-QW9F-M3PR-TVN4` num campo limitado
  // ao tamanho canônico cortaria o fim e nada entraria.
  campoCodigo.maxLength = TAMANHO_FORMATADO

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
      location.hash = montarHashSala(codigo)
      entrar(codigo)
    }

    const ou = document.createElement('div')
    ou.className = 'ou'
    ou.textContent = 'OU ENTRAR COM CÓDIGO'

    const entrarBotao = document.createElement('button')
    entrarBotao.className = 'botao fantasma'
    entrarBotao.textContent = 'Entrar'
    entrarBotao.onclick = () => {
      const codigo = normalizarCodigo(campoCodigo.value)
      // Mesmo portão que a URL usa (ehCodigoValido), não só o comprimento:
      // um código com caracteres fora do alfabeto nunca vai bater com uma
      // sala real, e deixá-lo passar é como esse texto acabava indo parar
      // sem tratamento no hash e na barra de sala.
      if (!ehCodigoValido(codigo)) return
      // Mesma ordem do caminho de criar sala: valida o apelido antes de
      // qualquer efeito colateral. Sem isso, digitar um código válido com o
      // apelido em branco reescrevia o hash e só depois barrava por falta
      // de apelido — a URL mudava para nada.
      if (!apelidoValido()) return
      location.hash = montarHashSala(codigo)
      entrar(codigo)
    }

    lobby.append(criar, ou, campoCodigo, entrarBotao)
  }

  return lobby
}

/**
 * O retrato de perfil: prévia redonda, botão de escolher e botão de tirar.
 *
 * Fica ao lado do apelido de propósito — apelido e foto são a mesma coisa,
 * quem você é. Empurrar a foto para uma tela de ajustes a transformaria num
 * canto escondido que ninguém acha.
 *
 * A foto escolhida NÃO é o arquivo: `encolherImagem` decodifica e redesenha
 * num canvas, e o que fica guardado são os pixels que nós desenhamos. É por
 * isso que um executável renomeado não passa daqui — ele falha ao decodificar
 * e a função rejeita.
 */
function montarPerfil(campoApelido: HTMLInputElement): HTMLElement {
  const area = document.createElement('div')
  area.className = 'perfil'

  const previa = document.createElement('div')
  previa.className = 'perfil-circulo'

  const arquivo = document.createElement('input')
  arquivo.type = 'file'
  // Dica ao seletor do sistema, não segurança: o portão de verdade é o
  // redesenho no canvas. Serve para a pessoa não escolher um PDF e levar um
  // erro que não explica nada.
  arquivo.accept = 'image/*'
  arquivo.hidden = true

  const escolher = document.createElement('button')
  escolher.type = 'button'
  escolher.className = 'botao fantasma perfil-botao'
  escolher.dataset['perfil'] = 'escolher'
  escolher.textContent = 'Escolher foto'
  escolher.onclick = () => arquivo.click()

  const remover = document.createElement('button')
  remover.type = 'button'
  remover.className = 'botao fantasma perfil-botao'
  remover.dataset['perfil'] = 'remover'
  remover.textContent = 'Tirar foto'
  remover.onclick = () => {
    esquecerFoto()
    desenharPrevia()
  }

  const erro = document.createElement('p')
  erro.className = 'perfil-erro'
  erro.hidden = true

  function desenharPrevia(): void {
    const foto = fotoLembrada()
    previa.replaceChildren()
    if (foto) {
      const img = document.createElement('img')
      img.className = 'perfil-previa'
      img.src = foto
      img.alt = 'Sua foto de perfil'
      previa.append(img)
    } else {
      const inicial = document.createElement('span')
      inicial.className = 'perfil-inicial'
      inicial.textContent = inicialDe(campoApelido.value)
      previa.append(inicial)
    }
    // O botão de tirar só existe quando há o que tirar.
    remover.hidden = !foto
  }

  arquivo.onchange = () => {
    const escolhido = arquivo.files?.[0]
    // Limpa o valor para escolher o MESMO arquivo de novo disparar `change`
    // — sem isto, tentar de novo depois de um erro não faria nada.
    arquivo.value = ''
    if (!escolhido) return
    erro.hidden = true
    void encolherImagem(escolhido)
      .then((foto) => {
        lembrarFoto(foto)
        desenharPrevia()
      })
      .catch(() => {
        // Um arquivo que não decodifica como imagem chega aqui — inclusive um
        // executável renomeado. Dizer o que houve importa: sem isto, escolher
        // um arquivo e nada acontecer parece o site quebrado.
        erro.hidden = false
        erro.textContent = 'Não deu para ler essa imagem. Escolha um arquivo de foto.'
      })
  }

  // A inicial acompanha o apelido enquanto a pessoa digita, para a prévia não
  // ficar mostrando a letra de um nome que ela já trocou.
  campoApelido.addEventListener('input', () => {
    if (!fotoLembrada()) desenharPrevia()
  })

  desenharPrevia()
  area.append(previa, escolher, remover, arquivo, erro)
  return area
}
