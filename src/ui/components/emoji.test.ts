// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { criarSeletorDeEmoji, ROTULO_ABRIR } from './emoji'

function montar() {
  const escolhidas: string[] = []
  const seletor = criarSeletorDeEmoji((e) => escolhidas.push(e))
  const raiz = document.createElement('div')
  raiz.append(seletor.botao, seletor.painel)
  document.body.replaceChildren(raiz)
  return { ...seletor, escolhidas }
}

describe('criarSeletorDeEmoji', () => {
  it('nasce fechado', () => {
    const { painel, botao } = montar()

    expect(painel.hidden).toBe(true)
    expect(botao.getAttribute('aria-expanded')).toBe('false')
  })

  it('o gatilho abre e fecha', () => {
    const { painel, botao } = montar()

    botao.click()
    expect(painel.hidden).toBe(false)
    expect(botao.getAttribute('aria-expanded')).toBe('true')

    botao.click()
    expect(painel.hidden).toBe(true)
  })

  it('escolher entrega a emoji e fecha', () => {
    // Manter aberto exigiria decidir quando fechar; duas emoji seguidas são
    // dois cliques no gatilho, e isso é barato.
    const { painel, botao, escolhidas } = montar()
    botao.click()

    painel.querySelector('button')!.click()

    expect(escolhidas).toHaveLength(1)
    expect(painel.hidden).toBe(true)
  })

  it('Esc fecha e devolve o foco ao gatilho', () => {
    const { painel, botao } = montar()
    botao.click()

    painel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(painel.hidden).toBe(true)
    expect(document.activeElement).toBe(botao)
  })

  it('o gatilho tem nome para quem não vê a carinha', () => {
    expect(montar().botao.getAttribute('aria-label')).toBe(ROTULO_ABRIR)
  })

  it('NÃO registra ouvinte no document', () => {
    // A tentação era fechar no clique fora, e isso pediria um ouvinte global
    // que ninguém remove quando a sala é desmontada — um por troca, para
    // sempre. Já aconteceu aqui com o `devicechange`.
    const registrar = vi.spyOn(document, 'addEventListener')
    try {
      montar()
      expect(registrar).not.toHaveBeenCalled()
    } finally {
      registrar.mockRestore()
    }
  })

  it('toda emoji é um botão com rótulo', () => {
    const { painel } = montar()

    const itens = [...painel.querySelectorAll('button')]

    expect(itens.length).toBeGreaterThanOrEqual(24)
    for (const item of itens) {
      expect(item.type).toBe('button')
      expect(item.getAttribute('aria-label')).toBe(item.textContent)
    }
  })
})
