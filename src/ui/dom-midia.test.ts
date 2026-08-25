// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { elementosDe, limparMidia, removerMidiaDe, soltarMidia } from './dom-midia'

/** Uma caixa de vídeo como `criarVideoRemoto` monta: o `data-de` fica na
 *  caixa, e o elemento de mídia é filho dela. */
function caixaComVideo(de: string): HTMLElement {
  const caixa = document.createElement('div')
  caixa.dataset['de'] = de
  const video = document.createElement('video')
  // happy-dom traz MediaStream; só precisamos ver se foi limpo depois.
  video.srcObject = new MediaStream()
  caixa.append(video)
  return caixa
}

/** Um elemento de áudio como o da call: o `data-de` fica no próprio <audio>. */
function audioDe(de: string): HTMLAudioElement {
  const el = document.createElement('audio')
  el.dataset['de'] = de
  el.srcObject = new MediaStream()
  return el
}

describe('elementosDe', () => {
  it('acha pelo peerId exato', () => {
    const area = document.createElement('div')
    area.append(caixaComVideo('pa'), caixaComVideo('pb'))

    expect(elementosDe(area, 'pb')).toHaveLength(1)
    expect(elementosDe(area, 'pb')[0]!.dataset['de']).toBe('pb')
  })

  it('não acha ninguém quando o peerId não está lá', () => {
    const area = document.createElement('div')
    area.append(caixaComVideo('pa'))

    expect(elementosDe(area, 'pz')).toEqual([])
  })

  it('um peerId com aspas não quebra a busca nem acha o elemento de outra pessoa', () => {
    // O peerId chega da rede. Interpolá-lo num seletor CSS
    // (`[data-de="${peerId}"]`) fazia duas coisas ruins: com aspas o seletor
    // vira sintaxe inválida e `querySelector` LANÇA, matando o tratador de
    // saída no meio; e um seletor forjado pode casar com a caixa de outra
    // pessoa e remover o vídeo errado. Aqui a comparação é de string, então
    // não existe sintaxe para forjar.
    const area = document.createElement('div')
    area.append(caixaComVideo('pa'))
    const forjado = '" ], [data-de="pa'

    expect(() => elementosDe(area, forjado)).not.toThrow()
    expect(elementosDe(area, forjado)).toEqual([])
  })
})

describe('soltarMidia', () => {
  it('pausa e larga o stream', () => {
    const el = audioDe('pa')
    const pausar = vi.spyOn(el, 'pause').mockImplementation(() => {})

    soltarMidia(el)

    expect(pausar).toHaveBeenCalled()
    expect(el.srcObject).toBeNull()
  })
})

describe('removerMidiaDe', () => {
  it('tira do DOM e larga o stream do elemento de dentro', () => {
    // Só `remove()` não basta: enquanto o elemento segurar o srcObject, o
    // decodificador e o stream continuam vivos, e um <video> fora da árvore
    // ainda pode estar tocando som.
    const area = document.createElement('div')
    const caixa = caixaComVideo('pa')
    area.append(caixa)
    const video = caixa.querySelector('video')!

    removerMidiaDe(area, 'pa')

    expect(area.children).toHaveLength(0)
    expect(video.srcObject).toBeNull()
  })

  it('larga o stream quando o próprio elemento é a mídia', () => {
    const area = document.createElement('div')
    const el = audioDe('pa')
    area.append(el)

    removerMidiaDe(area, 'pa')

    expect(area.children).toHaveLength(0)
    expect(el.srcObject).toBeNull()
  })

  it('não encosta em quem não foi pedido', () => {
    const area = document.createElement('div')
    const outra = caixaComVideo('pb')
    area.append(caixaComVideo('pa'), outra)

    removerMidiaDe(area, 'pa')

    expect(area.children).toHaveLength(1)
    expect(outra.querySelector('video')!.srcObject).not.toBeNull()
  })

  it('esvaziar a área larga o stream de todo mundo', () => {
    // É o caminho de sair da call. `replaceChildren()` sozinho deixava os
    // elementos soltos ainda segurando os streams.
    const area = document.createElement('div')
    const caixa = caixaComVideo('pa')
    const audio = audioDe('pb')
    area.append(caixa, audio)
    const video = caixa.querySelector('video')!

    limparMidia(area)

    expect(area.children).toHaveLength(0)
    expect(video.srcObject).toBeNull()
    expect(audio.srcObject).toBeNull()
  })

  it('remover quem não está lá não faz nada nem lança', () => {
    const area = document.createElement('div')
    area.append(caixaComVideo('pa'))

    expect(() => removerMidiaDe(area, 'pz')).not.toThrow()
    expect(area.children).toHaveLength(1)
  })
})
