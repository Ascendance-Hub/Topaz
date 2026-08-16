// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  renderizarConexao, TITULO_CONECTANDO, TITULO_SEM_CONEXAO,
} from './conexao'

describe('renderizarConexao', () => {
  it('mostra o estado de busca enquanto a sala não resolve quem manda', () => {
    const caixa = renderizarConexao('conectando')
    expect(caixa.dataset['status']).toBe('conectando')
    expect(caixa.querySelector('.conexao-titulo')!.textContent).toBe(TITULO_CONECTANDO)
    expect(caixa.classList.contains('falhou')).toBe(false)
  })

  it('mostra falha explícita, com o que fazer, quando a conexão não se estabelece', () => {
    const caixa = renderizarConexao('sem-conexao')
    expect(caixa.dataset['status']).toBe('sem-conexao')
    expect(caixa.querySelector('.conexao-titulo')!.textContent).toBe(TITULO_SEM_CONEXAO)
    expect(caixa.classList.contains('falhou')).toBe(true)
    // A mensagem precisa dizer o que houve e o que tentar — não só "erro".
    const detalhe = caixa.querySelector('.conexao-detalhe')!.textContent!
    expect(detalhe).toContain('bloqueando')
    expect(detalhe).toContain('recarregue')
  })

  it('as duas mensagens são distintas entre si', () => {
    expect(renderizarConexao('conectando').textContent)
      .not.toBe(renderizarConexao('sem-conexao').textContent)
  })
})
