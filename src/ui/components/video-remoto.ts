export const ROTULO_EXPANDIR = 'Expandir'
export const ROTULO_RECOLHER = 'Recolher'

/** Vídeos com PiP aberto ficam fora do fluxo da página; o tipo não é padrão. */
type VideoComPiP = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>
}

function botao(chave: string, rotulo: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'video-botao'
  el.dataset['video'] = chave
  el.textContent = rotulo
  return el
}

/**
 * A tela de um peer, com os controles que dão conta de onde ela fica na tela.
 *
 * O elemento é criado UMA vez por peer e trocado inteiro quando chega um
 * stream novo — nunca redesenhado por cima, porque recriar um `<video>`
 * reinicia o fluxo.
 *
 * Mover e redimensionar de verdade ficam por conta do **Picture-in-Picture**:
 * ele entrega uma janela do sistema operacional, que o usuário arrasta e
 * redimensiona com as ferramentas que já conhece, e que continua visível
 * mesmo fora do navegador. Reimplementar arrasto dentro da página daria menos
 * do que isso e custaria muito mais.
 */
export function criarVideoRemoto(
  de: string, stream: MediaStream, apelido?: string,
): HTMLElement {
  const caixa = document.createElement('div')
  caixa.className = 'video-remoto'
  caixa.dataset['de'] = de
  caixa.dataset['expandido'] = '0'

  const video = document.createElement('video') as VideoComPiP
  video.autoplay = true
  video.playsInline = true
  // Mudo de propósito: a voz dele já chega pelo microfone, e o elemento de
  // vídeo com som duplicaria a fala com um pequeno atraso.
  video.muted = true
  video.srcObject = stream

  const barra = document.createElement('div')
  barra.className = 'video-barra'

  if (apelido) {
    const nome = document.createElement('span')
    nome.className = 'video-nome'
    // `textContent`: o apelido vem de outro navegador.
    nome.textContent = apelido
    barra.append(nome)
  }

  const expandir = botao('expandir', ROTULO_EXPANDIR)
  expandir.onclick = () => {
    const expandido = caixa.dataset['expandido'] === '1'
    caixa.dataset['expandido'] = expandido ? '0' : '1'
    expandir.textContent = expandido ? ROTULO_EXPANDIR : ROTULO_RECOLHER
  }
  barra.append(expandir)

  // Só oferece o que o navegador tem: um botão que falha no clique é pior que
  // um botão ausente.
  if (document.pictureInPictureEnabled) {
    const pip = botao('pip', 'Janela flutuante')
    pip.onclick = () => {
      // Falhar aqui não pode derrubar nada: o vídeo em página continua lá.
      void video.requestPictureInPicture?.().catch((erro) => {
        console.warn('não foi possível abrir a janela flutuante:', erro)
      })
    }
    barra.append(pip)
  }

  caixa.append(video, barra)
  return caixa
}
