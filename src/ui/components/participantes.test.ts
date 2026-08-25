// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { inicialDe, renderizarParticipantes } from './participantes'

const alguem = (extras = {}) => ({ peerId: 'pa', nome: 'Alex', ...extras })

describe('inicialDe', () => {
  it('pega a primeira letra, em maiúscula', () => {
    expect(inicialDe('alex')).toBe('A')
  })

  it('não parte um emoji ao meio', () => {
    // `nome[0]` num emoji devolve meia dupla substituta e desenha o losango
    // preto de caractere inválido. O apelido vem de outra pessoa, e emoji em
    // apelido é comum.
    expect(inicialDe('🎩 Alex')).toBe('🎩')
  })

  it('nome vazio não vira um círculo em branco', () => {
    expect(inicialDe('')).toBe('?')
    expect(inicialDe('   ')).toBe('?')
  })
})

describe('renderizarParticipantes', () => {
  it('não mostra nada quando não há ninguém', () => {
    expect(renderizarParticipantes([]).querySelector('.participante')).toBeNull()
  })

  it('dá uma peça por pessoa, com nome e inicial', () => {
    const area = renderizarParticipantes([
      alguem(), alguem({ peerId: 'pb', nome: 'Bruno' }),
    ])

    const pecas = [...area.querySelectorAll('.participante')]
    expect(pecas).toHaveLength(2)
    expect(pecas[0]!.textContent).toContain('Alex')
    expect(pecas[0]!.querySelector('.participante-inicial')!.textContent).toBe('A')
  })

  it('marca quem está falando', () => {
    const area = renderizarParticipantes([
      alguem({ falando: true }), alguem({ peerId: 'pb', nome: 'Bruno' }),
    ])

    const pecas = [...area.querySelectorAll<HTMLElement>('.participante')]
    expect(pecas[0]!.dataset['falando']).toBe('1')
    expect(pecas[1]!.dataset['falando']).toBe('0')
  })

  it('marca você, para se achar na fileira', () => {
    const area = renderizarParticipantes([alguem({ euMesmo: true })])

    expect(area.querySelector<HTMLElement>('.participante')!.dataset['eu']).toBe('1')
  })

  it('mostra quem está mudo', () => {
    const area = renderizarParticipantes([alguem({ mudo: true })])

    expect(area.querySelector<HTMLElement>('.participante')!.dataset['mudo']).toBe('1')
  })

  it('mostra quem entrou só ouvindo, que é diferente de estar mudo', () => {
    // Mudo é escolha e se desfaz num clique. Sem microfone é impedimento, e
    // insistir em falar com essa pessoa não adianta.
    const area = renderizarParticipantes([alguem({ semMicrofone: true })])
    const peca = area.querySelector<HTMLElement>('.participante')!

    expect(peca.dataset['semMicrofone']).toBe('1')
    expect(peca.getAttribute('title')).toContain('ouvindo')
  })

  it('cada peça é identificável pelo peerId', () => {
    const area = renderizarParticipantes([alguem()])

    expect(area.querySelector<HTMLElement>('.participante')!.dataset['de']).toBe('pa')
  })

  it('nunca interpreta o apelido como HTML', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const area = renderizarParticipantes([alguem({ nome: malicioso })])

    expect(area.querySelector('img')).toBeNull()
    expect(area.textContent).toContain(malicioso)
  })

  it('quem lê por leitor de tela também sabe quem está falando', () => {
    // O anel é cor e movimento; sozinho ele não existe para quem não vê.
    const area = renderizarParticipantes([alguem({ falando: true })])

    expect(area.querySelector('.participante')!.getAttribute('aria-label'))
      .toContain('falando')
  })
})
