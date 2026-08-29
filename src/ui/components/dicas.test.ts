// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderizarDicas } from './dicas'

describe('renderizarDicas', () => {
  it('a primeira dica é a de estar sozinho na call', () => {
    // É o problema mais comum e o que mais parece defeito para quem usa.
    const dicas = renderizarDicas()

    const primeira = dicas.querySelector('.dica-nome')

    expect(primeira?.textContent).toContain('sozinho')
  })

  it('diz o que fazer, e nessa ordem: esperar, reconectar, reabrir', () => {
    const texto = renderizarDicas().querySelector('.dica-corpo')!.textContent!

    expect(texto.indexOf('10 a 20 segundos')).toBeLessThan(texto.indexOf('Reconectar'))
    expect(texto.indexOf('Reconectar')).toBeLessThan(texto.indexOf('feche a aba'))
  })

  it('separa o que tem conserto do que é assim mesmo', () => {
    // Uma limitação apresentada como problema faz a pessoa procurar solução
    // que não existe.
    const dicas = renderizarDicas()

    const secoes = [...dicas.querySelectorAll('.dicas-titulo')].map((s) => s.textContent)

    expect(secoes).toEqual(['Quando não funciona', 'O que é assim mesmo', 'Para ficar melhor'])
  })

  it('NÃO fala do que o site não protege', () => {
    // "Não coloque o que não protege numa página pública" — descrever a
    // própria fraqueza para desconhecido não é transparência, é mapa.
    const texto = renderizarDicas().textContent ?? ''

    for (const proibido of ['IP', 'endereço de rede', 'rastrear', 'vazam']) {
      expect(texto).not.toContain(proibido)
    }
  })

  it('todo item tem título E corpo — dica sem resposta é ruído', () => {
    const dicas = renderizarDicas()

    for (const item of dicas.querySelectorAll('.dica')) {
      expect(item.querySelector('.dica-nome')?.textContent).toBeTruthy()
      expect(item.querySelector('.dica-corpo')?.textContent).toBeTruthy()
    }
    expect(dicas.querySelectorAll('.dica').length).toBeGreaterThanOrEqual(6)
  })
})
