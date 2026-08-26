import { describe, it, expect, vi } from 'vitest'
import { avisarTodos } from './avisar'

describe('avisarTodos', () => {
  it('avisa todo mundo, na ordem', () => {
    const ordem: number[] = []

    avisarTodos([() => ordem.push(1), () => ordem.push(2), () => ordem.push(3)])

    expect(ordem).toEqual([1, 2, 3])
  })

  it('um ouvinte que estoura não impede os seguintes', () => {
    // É a propriedade inteira: quem entra na sala avisa o jogo, a call e as
    // fotos pelo mesmo laço. Sem isto, uma falha na primeira peça apaga as
    // outras em silêncio — e a pessoa entra na sala e fica sozinha.
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const depois = vi.fn()

    avisarTodos([() => { throw new Error('falhei') }, depois])

    expect(depois).toHaveBeenCalled()
    erro.mockRestore()
  })

  it('deixa o estouro registrado, para não sumir calado', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    avisarTodos([() => { throw new Error('falhei') }])

    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })

  it('leva os argumentos a cada ouvinte', () => {
    const um = vi.fn()
    const dois = vi.fn()

    avisarTodos([um, dois], 'pa', 7)

    expect(um).toHaveBeenCalledWith('pa', 7)
    expect(dois).toHaveBeenCalledWith('pa', 7)
  })

  it('um ouvinte que estoura não impede os DEMAIS de receber os argumentos', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const depois = vi.fn()

    avisarTodos([() => { throw new Error('falhei') }, depois], 'pa')

    expect(depois).toHaveBeenCalledWith('pa')
    erro.mockRestore()
  })
})
