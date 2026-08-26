// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarSalasSalvas } from './salas-salvas'
import type { Grupo } from '../../grupos/grupos'

const lista: Grupo[] = [
  { codigo: 'AAAABBBBCCCCDDDD', nome: 'Os manos' },
  { codigo: 'EEEEFFFFGGGGHHHH', nome: 'Trabalho' },
]

const acoes = () => ({ ir: vi.fn(), outra: vi.fn() })
const icone = (a: HTMLElement, codigo: string) =>
  a.querySelector<HTMLButtonElement>(`[data-sala="${codigo}"]`)!

describe('renderizarSalasSalvas', () => {
  it('mostra uma sala salva por ícone', () => {
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, acoes())

    expect(area.querySelectorAll('[data-sala]')).toHaveLength(3) // duas + "outra"
  })

  it('o ícone leva a inicial do nome que a pessoa deu', () => {
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, acoes())

    expect(icone(area, lista[1]!.codigo).textContent).toBe('T')
  })

  it('o nome inteiro fica disponível, porque não cabe no ícone', () => {
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, acoes())

    expect(icone(area, lista[1]!.codigo).title).toBe('Trabalho')
    expect(icone(area, lista[1]!.codigo).getAttribute('aria-label')).toContain('Trabalho')
  })

  it('marca a sala em que estou', () => {
    // Sem isto, quem tem quatro salas salvas não saberia em qual está.
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, acoes())

    expect(icone(area, lista[0]!.codigo).getAttribute('aria-current')).toBe('true')
    expect(icone(area, lista[1]!.codigo).getAttribute('aria-current')).toBeNull()
  })

  it('clicar em outra sala troca para ela', () => {
    const a = acoes()
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, a)

    icone(area, lista[1]!.codigo).click()

    expect(a.ir).toHaveBeenCalledWith(lista[1]!.codigo)
  })

  it('clicar na sala em que já estou não faz nada', () => {
    // Trocar para onde já se está desmontaria e remontaria a sala inteira,
    // derrubando a call por nada.
    const a = acoes()
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, a)

    icone(area, lista[0]!.codigo).click()

    expect(a.ir).not.toHaveBeenCalled()
  })

  it('o botão de outra sala leva de volta à home', () => {
    const a = acoes()
    const area = renderizarSalasSalvas(lista, lista[0]!.codigo, a)

    icone(area, 'outra').click()

    expect(a.outra).toHaveBeenCalled()
  })

  it('sem nenhuma sala salva, sobra o caminho de entrar numa', () => {
    const area = renderizarSalasSalvas([], 'QUALQUER', acoes())

    expect(area.querySelectorAll('[data-sala]')).toHaveLength(1)
    expect(icone(area, 'outra')).not.toBeNull()
  })

  it('uma sala sem nome ainda tem ícone', () => {
    // O nome pode ter sido salvo vazio numa versão antiga, ou o armazenamento
    // pode ter sido mexido. Um ícone em branco pareceria defeito.
    const area = renderizarSalasSalvas(
      [{ codigo: 'AAAABBBBCCCCDDDD', nome: '' }], 'X', acoes())

    expect(icone(area, 'AAAABBBBCCCCDDDD').textContent).toBe('#')
  })
})
