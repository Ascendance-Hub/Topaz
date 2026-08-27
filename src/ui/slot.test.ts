// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { criarSlot } from './slot'

/**
 * O defeito que este arquivo existe para tornar impossível: `replaceWith` só
 * funciona uma vez sobre a mesma referência. A segunda chamada mexe num nó já
 * órfão — o que está na página nunca é tocado, e a tela para de acompanhar sem
 * erro nenhum. Foi assim que um "você é o anfitrião" ficou sem aparecer depois
 * de uma migração de host.
 */
describe('criarSlot', () => {
  it('troca o nó que está de fato na página, e não um órfão', () => {
    const pai = document.createElement('div')
    const primeiro = document.createElement('p')
    primeiro.textContent = 'um'
    const slot = criarSlot(primeiro)
    pai.append(slot.atual)

    const segundo = document.createElement('p')
    segundo.textContent = 'dois'
    slot.trocar(segundo)

    const terceiro = document.createElement('p')
    terceiro.textContent = 'três'
    slot.trocar(terceiro)

    // Sem o slot, a terceira troca mexeria no `primeiro`, que já saiu da
    // árvore — e a página continuaria mostrando "dois" para sempre.
    expect(pai.children).toHaveLength(1)
    expect(pai.textContent).toBe('três')
    expect(pai.contains(terceiro)).toBe(true)
  })

  it('`atual` acompanha a última troca', () => {
    const slot = criarSlot(document.createElement('span'))
    const novo = document.createElement('span')
    novo.dataset['marca'] = 'sim'

    slot.trocar(novo)

    expect(slot.atual).toBe(novo)
    expect(slot.atual.dataset['marca']).toBe('sim')
  })

  it('trocar antes de estar na página não estoura', () => {
    const slot = criarSlot(document.createElement('div'))
    const novo = document.createElement('div')

    expect(() => slot.trocar(novo)).not.toThrow()
    expect(slot.atual).toBe(novo)
  })
})
