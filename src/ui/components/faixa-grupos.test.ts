// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarFaixaGrupos } from './faixa-grupos'
import { corDoGrupo } from '../../grupos/grupos'

const A = 'K7X2QW9FM3PRTVN4'
const B = 'M3PRTVN4K7X2QW9F'

describe('renderizarFaixaGrupos', () => {
  it('sem grupos, não há faixa nenhuma', () => {
    // Um título sozinho em cima de nada é pior do que não ter seção.
    expect(renderizarFaixaGrupos([], vi.fn(), vi.fn()).textContent).toBe('')
  })

  it('um cartão por grupo, com nome e código legível', () => {
    const faixa = renderizarFaixaGrupos(
      [{ codigo: A, nome: 'Os manos' }], vi.fn(), vi.fn())

    expect(faixa.querySelector('.grupo-nome')!.textContent).toBe('Os manos')
    expect(faixa.querySelector('.grupo-codigo')!.textContent).toBe('K7X2-QW9F-M3PR-TVN4')
  })

  it('clicar entra na sala daquele grupo', () => {
    const entrar = vi.fn()
    const faixa = renderizarFaixaGrupos([{ codigo: A, nome: 'Os manos' }], entrar, vi.fn())

    faixa.querySelector<HTMLButtonElement>(`[data-entrar="${A}"]`)!.click()

    expect(entrar).toHaveBeenCalledWith(A)
  })

  it('remover deixa claro que a sala continua existindo', () => {
    const remover = vi.fn()
    const faixa = renderizarFaixaGrupos([{ codigo: A, nome: 'Os manos' }], vi.fn(), remover)
    const botao = faixa.querySelector<HTMLButtonElement>(`[data-remover="${A}"]`)!

    expect(botao.title).toContain('continua existindo')
    botao.click()

    expect(remover).toHaveBeenCalledWith(A)
  })

  it('a cor do cartão vem do código', () => {
    // A mesma em qualquer máquina, sem nada a sincronizar.
    const faixa = renderizarFaixaGrupos([{ codigo: A, nome: 'Um' }], vi.fn(), vi.fn())
    const cartao = faixa.querySelector<HTMLElement>('.grupo-cartao')!

    expect(cartao.style.getPropertyValue('--cor-grupo')).toBe(corDoGrupo(A))
  })

  it('nunca interpreta o nome como HTML', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const faixa = renderizarFaixaGrupos(
      [{ codigo: A, nome: malicioso }, { codigo: B, nome: 'ok' }], vi.fn(), vi.fn())

    expect(faixa.querySelector('img')).toBeNull()
    expect(faixa.querySelector('.grupo-nome')!.textContent).toBe(malicioso)
  })

  it('quem usa leitor de tela sabe o que o × faz', () => {
    const faixa = renderizarFaixaGrupos([{ codigo: A, nome: 'Os manos' }], vi.fn(), vi.fn())

    expect(faixa.querySelector(`[data-remover="${A}"]`)!.getAttribute('aria-label'))
      .toContain('Os manos')
  })
})
