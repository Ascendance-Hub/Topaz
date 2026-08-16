// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarBarraSala } from './barra-sala'
import { montarLinkSala } from '../sala'

describe('renderizarBarraSala', () => {
  it('mostra o código da sala e nenhuma marca de anfitrião quando não sou host', () => {
    const barra = renderizarBarraSala('CODIGO01', false)
    expect(barra.querySelector('.codigo')!.textContent).toBe('CODIGO01')
    expect(barra.textContent).not.toContain('anfitrião')
  })

  it('mostra "você é o anfitrião" quando souHost reflete host verdadeiro', () => {
    const barra = renderizarBarraSala('CODIGO01', true)
    expect(barra.textContent).toContain('você é o anfitrião')
  })

  it('o botão de copiar usa montarLinkSala com a URL e o código atuais', async () => {
    const escrito = vi.fn().mockResolvedValue(undefined)
    // happy-dom expõe `navigator.clipboard` como getter só-leitura —
    // `Object.assign`/atribuição direta lançam. `defineProperty` substitui a
    // própria propriedade em vez de tentar escrever nela.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrito },
      configurable: true,
    })

    const barra = renderizarBarraSala('CODIGO01', false)
    const botao = barra.querySelector('button')!
    expect(botao.textContent).toBe('Copiar link')

    await botao.onclick?.(new PointerEvent('click'))

    expect(escrito).toHaveBeenCalledWith(montarLinkSala(location.href, 'CODIGO01'))
    expect(botao.textContent).toBe('Copiado!')
  })
})
