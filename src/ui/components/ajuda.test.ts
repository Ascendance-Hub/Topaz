// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { botaoAjuda } from './ajuda'

describe('painel de ajuda', () => {
  it('começa fechado', () => {
    const el = botaoAjuda()
    expect(el.querySelector('[data-painel-ajuda]')).toBeNull()
  })

  it('nasce aberto quando quem monta diz que ele estava aberto', () => {
    const el = botaoAjuda(true)
    expect(el.querySelector('[data-painel-ajuda]')).not.toBeNull()
    expect(el.querySelector('[data-ajuda]')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('avisa quem monta a cada abertura e fechamento', () => {
    const aoAlternar = vi.fn()
    const el = botaoAjuda(false, aoAlternar)
    const gatilho = el.querySelector<HTMLButtonElement>('[data-ajuda]')!

    gatilho.click()
    expect(aoAlternar).toHaveBeenLastCalledWith(true)
    gatilho.click()
    expect(aoAlternar).toHaveBeenLastCalledWith(false)
  })

  it('abre ao clicar e fecha ao clicar de novo', () => {
    const el = botaoAjuda()
    const gatilho = el.querySelector<HTMLButtonElement>('[data-ajuda]')!
    gatilho.click()
    expect(el.querySelector('[data-painel-ajuda]')).not.toBeNull()
    gatilho.click()
    expect(el.querySelector('[data-painel-ajuda]')).toBeNull()
  })

  it('explica as três jogadas que não são autoexplicativas', () => {
    const el = botaoAjuda()
    el.querySelector<HTMLButtonElement>('[data-ajuda]')!.click()
    const texto = el.textContent ?? ''
    expect(texto).toContain('Dobrar')
    expect(texto).toContain('Dividir')
    expect(texto).toContain('Seguro')
  })

  it('não explica Pedir nem Parar', () => {
    const el = botaoAjuda()
    el.querySelector<HTMLButtonElement>('[data-ajuda]')!.click()
    const titulos = [...el.querySelectorAll('[data-painel-ajuda] h4')].map((h) => h.textContent)
    expect(titulos).toEqual(['Dobrar', 'Dividir', 'Seguro'])
  })
})
