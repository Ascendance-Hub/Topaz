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

describe('lista de servidores de descoberta', () => {
  const relays = [
    { url: 'wss://a.com', nome: 'a.com', conectado: true },
    { url: 'wss://b.com', nome: 'b.com', conectado: false },
    { url: 'wss://c.com', nome: 'c.com', conectado: true },
  ]

  it('mostra todos, marcando quais estão conectados', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays)

    const itens = [...painel.querySelectorAll('.teste-rede-relay')]
    expect(itens).toHaveLength(3)
    expect(itens.map((i) => (i as HTMLElement).dataset['conectado']))
      .toEqual(['1', '0', '1'])
  })

  it('mostra o nome curto, que é o que se compara entre duas telas', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays)

    expect(painel.querySelector('.teste-rede-relay')!.textContent).toBe('a.com')
  })

  it('resume quantos de quantos', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays)

    expect(painel.querySelector('.teste-rede-relays-resumo')!.textContent)
      .toContain('2 de 3')
  })

  it('sem lista, não mostra a seção', () => {
    const painel = renderizarTesteRede(null, false, vi.fn())

    expect(painel.querySelector('.teste-rede-relay')).toBeNull()
  })
})
