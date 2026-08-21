// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  renderizarConexao, TITULO_CONECTANDO, TITULO_SEM_CONEXAO,
  DETALHE_SEM_CONEXAO, DETALHE_SEM_RELAY,
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

describe('quando a sinalização está bloqueada', () => {
  it('com relays conectados, mantém a explicação de sempre', () => {
    const caixa = renderizarConexao('sem-conexao', 4)

    expect(caixa.textContent).toContain(DETALHE_SEM_CONEXAO)
    expect(caixa.textContent).not.toContain(DETALHE_SEM_RELAY)
  })

  it('com ZERO relays, diz que o problema é a sinalização', () => {
    const caixa = renderizarConexao('sem-conexao', 0)

    // Antivírus e firewall bloqueiam em silêncio. Sem esta distinção, a pessoa
    // procura o problema na sala, no código ou no amigo — nunca na própria
    // máquina, que é onde ele está.
    expect(caixa.textContent).toContain(DETALHE_SEM_RELAY)
  })

  it('sem informação de relay, não inventa diagnóstico', () => {
    const caixa = renderizarConexao('sem-conexao')

    expect(caixa.textContent).toContain(DETALHE_SEM_CONEXAO)
    expect(caixa.textContent).not.toContain(DETALHE_SEM_RELAY)
  })

  it('enquanto ainda está conectando, não acusa nada', () => {
    const caixa = renderizarConexao('conectando', 0)

    expect(caixa.textContent).not.toContain(DETALHE_SEM_RELAY)
  })
})
