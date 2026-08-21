// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { criarVideoRemoto, ROTULO_EXPANDIR, ROTULO_RECOLHER } from './video-remoto'

function comSuportePiP(suportado: boolean): void {
  Object.defineProperty(document, 'pictureInPictureEnabled', {
    value: suportado, configurable: true,
  })
}

const streamFalso = () => new MediaStream()

describe('criarVideoRemoto', () => {
  it('guarda de quem é a tela, para poder ser substituída depois', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.dataset['de']).toBe('pa')
  })

  it('o vídeo nasce mudo — a voz já vem pelo microfone', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.querySelector('video')!.muted).toBe(true)
  })

  it('nasce recolhido', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.dataset['expandido']).toBe('0')
    expect(caixa.querySelector('[data-video="expandir"]')!.textContent).toBe(ROTULO_EXPANDIR)
  })

  it('o botão alterna entre expandido e recolhido', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())
    const botao = caixa.querySelector<HTMLButtonElement>('[data-video="expandir"]')!

    botao.click()
    expect(caixa.dataset['expandido']).toBe('1')
    expect(botao.textContent).toBe(ROTULO_RECOLHER)

    botao.click()
    expect(caixa.dataset['expandido']).toBe('0')
    expect(botao.textContent).toBe(ROTULO_EXPANDIR)
  })

  it('oferece Picture-in-Picture quando o navegador suporta', () => {
    comSuportePiP(true)

    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.querySelector('[data-video="pip"]')).not.toBeNull()
  })

  it('não oferece PiP quando o navegador não suporta, em vez de falhar no clique', () => {
    comSuportePiP(false)

    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.querySelector('[data-video="pip"]')).toBeNull()
  })

  it('o botão de PiP pede a janela flutuante ao próprio vídeo', () => {
    comSuportePiP(true)
    const caixa = criarVideoRemoto('pa', streamFalso())
    const video = caixa.querySelector<HTMLVideoElement>('video')!
    const pedir = vi.fn().mockResolvedValue({})
    Object.defineProperty(video, 'requestPictureInPicture', { value: pedir, configurable: true })

    caixa.querySelector<HTMLButtonElement>('[data-video="pip"]')!.click()

    expect(pedir).toHaveBeenCalled()
  })

  it('mostra de quem é a tela', () => {
    const caixa = criarVideoRemoto('pa', streamFalso(), 'Alex')

    expect(caixa.textContent).toContain('Alex')
  })

  it('nunca interpreta o apelido como HTML', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'

    const caixa = criarVideoRemoto('pa', streamFalso(), malicioso)

    expect(caixa.querySelector('img')).toBeNull()
    expect(caixa.textContent).toContain(malicioso)
  })
})

describe('tela cheia', () => {
  it('oferece tela cheia', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.querySelector('[data-video="tela-cheia"]')).not.toBeNull()
  })

  it('pede tela cheia à caixa inteira, não só ao vídeo', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())
    const pedir = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(caixa, 'requestFullscreen', { value: pedir, configurable: true })

    caixa.querySelector<HTMLButtonElement>('[data-video="tela-cheia"]')!.click()

    // A caixa, e não o `<video>`: assim a barra de controles continua
    // acessível em tela cheia, que é o que Discord e afins fazem.
    expect(pedir).toHaveBeenCalled()
  })

  it('sai da tela cheia quando já está nela', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())
    const sair = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document, 'fullscreenElement', { value: caixa, configurable: true })
    Object.defineProperty(document, 'exitFullscreen', { value: sair, configurable: true })

    caixa.querySelector<HTMLButtonElement>('[data-video="tela-cheia"]')!.click()

    expect(sair).toHaveBeenCalled()
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
  })
})

describe('som do compartilhamento', () => {
  function streamComAudio(): MediaStream {
    const stream = new MediaStream()
    Object.defineProperty(stream, 'getAudioTracks', {
      value: () => [{ kind: 'audio' }], configurable: true,
    })
    return stream
  }

  it('sem áudio na tela, o vídeo continua mudo', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.querySelector('video')!.muted).toBe(true)
  })

  it('com áudio na tela, o vídeo toca o som', () => {
    const caixa = criarVideoRemoto('pa', streamComAudio())

    // Não duplica a voz: este elemento carrega só as faixas da TELA. A voz
    // dele chega por outro caminho, o do microfone.
    expect(caixa.querySelector('video')!.muted).toBe(false)
  })

  it('oferece um botão de som quando a tela tem áudio', () => {
    const caixa = criarVideoRemoto('pa', streamComAudio())

    // Serve para dois casos de uma vez: silenciar o que o outro compartilha,
    // e destravar o áudio quando o navegador recusou tocar sozinho — o clique
    // é o gesto que a política de autoplay exige.
    expect(caixa.querySelector('[data-video="som"]')).not.toBeNull()
  })

  it('não oferece botão de som quando não há áudio nenhum', () => {
    const caixa = criarVideoRemoto('pa', streamFalso())

    expect(caixa.querySelector('[data-video="som"]')).toBeNull()
  })

  it('o botão de som alterna o mudo', () => {
    const caixa = criarVideoRemoto('pa', streamComAudio())
    const video = caixa.querySelector<HTMLVideoElement>('video')!
    const botao = caixa.querySelector<HTMLButtonElement>('[data-video="som"]')!

    botao.click()
    expect(video.muted).toBe(true)

    botao.click()
    expect(video.muted).toBe(false)
  })

})
