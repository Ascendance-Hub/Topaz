// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarTesteRede, TEXTOS } from './teste-rede'
import { VEREDITOS } from '../../net/diagnostico-rede'

describe('renderizarTesteRede', () => {
  it('começa oferecendo o teste', () => {
    const painel = renderizarTesteRede(null, false, vi.fn())

    expect(painel.querySelector('[data-teste="rodar"]')).not.toBeNull()
    expect(painel.textContent).not.toContain(TEXTOS.direto)
  })

  it('enquanto roda, avisa e não deixa clicar de novo', () => {
    const painel = renderizarTesteRede(null, true, vi.fn())

    expect(painel.querySelector<HTMLButtonElement>('[data-teste="rodar"]')!.disabled).toBe(true)
    expect(painel.textContent).toContain(TEXTOS.rodando)
  })

  it('clicar pede o teste', () => {
    const rodar = vi.fn()
    renderizarTesteRede(null, false, rodar)
      .querySelector<HTMLButtonElement>('[data-teste="rodar"]')!.click()

    expect(rodar).toHaveBeenCalled()
  })

  it('explica em português o que cada veredito significa', () => {
    for (const [veredito, texto] of [
      [VEREDITOS.direto, TEXTOS.direto],
      [VEREDITOS.simetrico, TEXTOS.simetrico],
      [VEREDITOS.semUdp, TEXTOS.semUdp],
      [VEREDITOS.inconclusivo, TEXTOS.inconclusivo],
    ] as const) {
      const painel = renderizarTesteRede({ veredito, contagem: {} }, false, vi.fn())
      expect(painel.textContent).toContain(texto)
    }
  })

  it('marca o resultado ruim para dar destaque', () => {
    const painel = renderizarTesteRede(
      { veredito: VEREDITOS.simetrico, contagem: {} }, false, vi.fn())

    expect(painel.querySelector<HTMLElement>('.teste-rede-veredito')!.dataset['ruim'])
      .toBe('1')
  })

  it('resultado bom não é marcado como ruim', () => {
    const painel = renderizarTesteRede(
      { veredito: VEREDITOS.direto, contagem: {} }, false, vi.fn())

    expect(painel.querySelector<HTMLElement>('.teste-rede-veredito')!.dataset['ruim'])
      .toBe('0')
  })
})
