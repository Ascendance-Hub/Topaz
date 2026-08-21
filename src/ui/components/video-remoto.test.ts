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
