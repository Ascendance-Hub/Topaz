// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarTrilho, ROTULO_ESPERANDO } from './trilho'

const item = (t: HTMLElement, chave: string) =>
  t.querySelector<HTMLElement>(`[data-nav="${chave}"]`)!

describe('renderizarTrilho', () => {
  it('tem os três destinos, nesta ordem', () => {
    const trilho = renderizarTrilho('sala', vi.fn())

    expect([...trilho.querySelectorAll('[data-nav]')].map((b) => b.textContent))
      .toEqual(['Sala', 'Jogos', 'Ajustes'])
  })

  it('marca onde a pessoa está', () => {
    const trilho = renderizarTrilho('config', vi.fn())

    expect(item(trilho, 'config').getAttribute('aria-current')).toBe('page')
    expect(item(trilho, 'sala').getAttribute('aria-current')).toBeNull()
  })

  it('com a mesa aberta, "Jogos" continua aceso', () => {
    // Foi por ali que se chegou na mesa. Apagar tudo deixaria a pessoa sem
    // saber por onde voltar.
    const trilho = renderizarTrilho('mesa', vi.fn())

    expect(item(trilho, 'jogos').getAttribute('aria-current')).toBe('page')
  })

  it('clicar avisa para onde ir', () => {
    const ir = vi.fn()
    const trilho = renderizarTrilho('sala', ir)

    item(trilho, 'jogos').click()

    expect(ir).toHaveBeenCalledWith('jogos')
  })

  it('a mesa não é destino do trilho — chega-se por dentro de Jogos', () => {
    const trilho = renderizarTrilho('sala', vi.fn())

    expect(trilho.querySelector('[data-nav="mesa"]')).toBeNull()
  })
})

describe('a mesa esperando por você', () => {
  it('marca "Jogos" quando a mesa espera', () => {
    const trilho = renderizarTrilho('sala', vi.fn(), { mesaEspera: true })

    expect(item(trilho, 'jogos').dataset['espera']).toBe('1')
  })

  it('não marca quando a mesa já está na tela', () => {
    // Os botões que a bolinha anunciaria já estão à vista; ela viraria ruído
    // em cima de algo que a pessoa está olhando.
    const trilho = renderizarTrilho('mesa', vi.fn(), { mesaEspera: true })

    expect(item(trilho, 'jogos').dataset['espera']).toBeUndefined()
  })

  it('quem não enxerga a bolinha ouve o aviso', () => {
    // A marca é decorativa; sem o rótulo, o aviso existiria só para parte das
    // pessoas.
    const trilho = renderizarTrilho('sala', vi.fn(), { mesaEspera: true })

    expect(item(trilho, 'jogos').getAttribute('aria-label')).toContain(ROTULO_ESPERANDO)
  })

  it('sem espera, nenhuma marca', () => {
    const trilho = renderizarTrilho('sala', vi.fn())

    expect(trilho.querySelector('.trilho-marca')).toBeNull()
  })
})
