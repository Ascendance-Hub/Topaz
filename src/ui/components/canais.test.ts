// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarCanais } from './canais'

const canais = [
  { id: 'principal', nome: 'Principal', pessoas: 3 },
  { id: 'segundo', nome: 'Canal 2', pessoas: 1 },
  { id: 'terceiro', nome: 'Canal 3', pessoas: 0 },
]

const item = (a: HTMLElement, id: string) =>
  a.querySelector<HTMLButtonElement>(`[data-canal="${id}"]`)!

describe('renderizarCanais', () => {
  it('mostra todos os canais, com quantas pessoas há em cada', () => {
    const area = renderizarCanais(canais, 'principal', vi.fn())

    expect(area.querySelectorAll('[data-canal]')).toHaveLength(3)
    expect(item(area, 'principal').textContent).toContain('3')
  })

  it('mostra os canais VAZIOS também', () => {
    // É o canal vazio que serve para dois saírem de perto dos outros —
    // escondê-lo tiraria o uso principal da coisa.
    const area = renderizarCanais(canais, 'principal', vi.fn())

    expect(item(area, 'terceiro')).not.toBeNull()
    expect(item(area, 'terceiro').textContent).toContain('vazio')
  })

  it('marca onde eu estou', () => {
    const area = renderizarCanais(canais, 'segundo', vi.fn())

    expect(item(area, 'segundo').getAttribute('aria-current')).toBe('true')
    expect(item(area, 'principal').getAttribute('aria-current')).toBeNull()
  })

  it('clicar avisa para qual canal ir', () => {
    const mudar = vi.fn()
    const area = renderizarCanais(canais, 'principal', mudar)

    item(area, 'segundo').click()

    expect(mudar).toHaveBeenCalledWith('segundo')
  })

  it('o canal em que estou continua clicável', () => {
    // Um botão desabilitado some da ordem de tabulação, e quem navega por
    // teclado perde a referência de onde está.
    const area = renderizarCanais(canais, 'principal', vi.fn())

    expect(item(area, 'principal').disabled).toBe(false)
  })

  it('quem lê por leitor de tela recebe as três informações', () => {
    // A pílula diz visualmente: qual canal, quantos, e se é onde eu estou.
    const area = renderizarCanais(canais, 'segundo', vi.fn())

    const rotulo = item(area, 'segundo').getAttribute('aria-label')!
    expect(rotulo).toContain('Canal 2')
    expect(rotulo).toContain('1 pessoa')
    expect(rotulo).toContain('você está aqui')
  })

  it('canal vazio é anunciado como sem ninguém, não como zero', () => {
    const area = renderizarCanais(canais, 'principal', vi.fn())

    expect(item(area, 'terceiro').getAttribute('aria-label')).toContain('ninguém')
  })

  it('o plural acompanha a contagem', () => {
    const area = renderizarCanais(canais, 'principal', vi.fn())

    expect(item(area, 'principal').getAttribute('aria-label')).toContain('3 pessoas')
  })
})
