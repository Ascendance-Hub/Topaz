// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarBarraSala, ROTULO_FALHA_COPIA } from './barra-sala'
import { montarLinkSala } from '../codigo'

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

  it('nunca interpreta o código como HTML — mesmo se ele contiver marcação', () => {
    // Não presume que `codigo` já passou por ehCodigoValido: o componente
    // precisa ser seguro por construção, não por confiar em quem chama.
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const barra = renderizarBarraSala(malicioso, false)

    expect(barra.querySelector('img')).toBeNull()
    expect(barra.querySelector('.codigo')!.textContent).toBe(malicioso)
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

describe('falha ao copiar o link', () => {
  it('avisa o jogador em vez de deixar uma rejeição não tratada e um botão inerte', async () => {
    const escrito = vi.fn().mockRejectedValue(new Error('permissão negada'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrito },
      configurable: true,
    })

    const barra = renderizarBarraSala('CODIGO01', false)
    const botao = barra.querySelector('button')!

    await expect(botao.onclick?.(new PointerEvent('click'))).resolves.not.toThrow()

    expect(escrito).toHaveBeenCalled()
    expect(botao.textContent).toBe(ROTULO_FALHA_COPIA)
  })

  it('avisa também quando a API de clipboard nem existe', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })

    const barra = renderizarBarraSala('CODIGO01', false)
    const botao = barra.querySelector('button')!

    await expect(botao.onclick?.(new PointerEvent('click'))).resolves.not.toThrow()

    expect(botao.textContent).toBe(ROTULO_FALHA_COPIA)
  })
})
