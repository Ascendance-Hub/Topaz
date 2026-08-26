// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderizarRoda } from './roda'
import type { Participante } from './participantes'

const pessoa = (nome: string, extra: Partial<Participante> = {}): Participante =>
  ({ peerId: nome.toLowerCase(), nome, ...extra })

describe('renderizarRoda', () => {
  it('mostra um círculo por pessoa do canal', () => {
    const roda = renderizarRoda([pessoa('Ana'), pessoa('Bia')])

    expect(roda.querySelectorAll('.roda-pessoa')).toHaveLength(2)
  })

  it('quem tem foto aparece com ela', () => {
    const foto = 'data:image/png;base64,AAAA'
    const roda = renderizarRoda([pessoa('Ana', { foto })])

    expect(roda.querySelector('img')!.src).toBe(foto)
  })

  it('quem não tem foto aparece com a inicial', () => {
    const roda = renderizarRoda([pessoa('Ana')])

    expect(roda.querySelector('.roda-inicial')!.textContent).toBe('A')
    expect(roda.querySelector('img')).toBeNull()
  })

  it('o nome fica embaixo, porque foto sem nome vira adivinhação', () => {
    const roda = renderizarRoda([pessoa('Ana')])

    expect(roda.querySelector('.roda-nome')!.textContent).toBe('Ana')
  })

  it('a foto não é anunciada duas vezes por leitor de tela', () => {
    const roda = renderizarRoda([pessoa('Ana', { foto: 'data:image/png;base64,A' })])

    expect(roda.querySelector('img')!.alt).toBe('')
  })
})

describe('o que cada pessoa carrega', () => {
  it('quem fala fica marcado', () => {
    const roda = renderizarRoda([pessoa('Ana', { falando: true })])

    expect(roda.querySelector('.roda-pessoa')!.getAttribute('data-falando')).toBe('1')
  })

  it('eu fico marcado, para me achar', () => {
    const roda = renderizarRoda([pessoa('Eu', { euMesmo: true })])

    expect(roda.querySelector('.roda-pessoa')!.getAttribute('data-eu')).toBe('1')
  })

  it('mudo e sem microfone são coisas diferentes', () => {
    // Mudo é escolha; sem microfone é o aparelho que não abriu. Confundir os
    // dois faria alguém achar que o outro está ignorando.
    const roda = renderizarRoda([
      pessoa('Ana', { mudo: true }), pessoa('Bia', { semMicrofone: true }),
    ])
    const [ana, bia] = [...roda.querySelectorAll('.roda-pessoa')]

    expect(ana!.getAttribute('data-mudo')).toBe('1')
    expect(ana!.getAttribute('data-sem-microfone')).toBeNull()
    expect(bia!.getAttribute('data-sem-microfone')).toBe('1')
  })
})

describe('os dois modos', () => {
  it('sem ninguém compartilhando, os círculos são o conteúdo do miolo', () => {
    const roda = renderizarRoda([pessoa('Ana')], 'grade')

    expect(roda.getAttribute('data-modo')).toBe('grade')
  })

  it('com tela compartilhada, viram faixa e cedem o meio', () => {
    const roda = renderizarRoda([pessoa('Ana')], 'faixa')

    expect(roda.getAttribute('data-modo')).toBe('faixa')
  })

  it('as pessoas continuam as mesmas nos dois modos', () => {
    // Saber quem fala importa MAIS com uma tela na frente, não menos: sumir
    // com a roda seria perder o rastro justamente quando ele é útil.
    const gente = [pessoa('Ana'), pessoa('Bia')]

    expect(renderizarRoda(gente, 'faixa').querySelectorAll('.roda-pessoa'))
      .toHaveLength(2)
  })

  it('grade é o padrão', () => {
    expect(renderizarRoda([]).getAttribute('data-modo')).toBe('grade')
  })
})
