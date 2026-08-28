import { describe, it, expect, vi } from 'vitest'
import { avisarTodos, criarEmissor } from './avisar'

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

/**
 * A lista de ouvintes com nome.
 *
 * O padrão — declarar `((...) => void)[]`, empurrar em `aoX(cb)` e chamar
 * `avisarTodos` — aparecia em vinte declarações por dez arquivos, e em TRÊS
 * implementações diferentes de "avisar". Uma delas percorria a lista viva e sem
 * isolamento. Estes casos fixam a semântica num lugar só.
 */
describe('criarEmissor', () => {
  it('avisa todos os inscritos, na ordem', () => {
    const emissor = criarEmissor<[string]>()
    const vistos: string[] = []
    emissor.ouvir((x) => vistos.push(`a:${x}`))
    emissor.ouvir((x) => vistos.push(`b:${x}`))

    emissor.avisar('oi')

    expect(vistos).toEqual(['a:oi', 'b:oi'])
  })

  it('um que estoura não impede os outros, e o estouro fica registrado', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const emissor = criarEmissor<[]>()
      const segundo = vi.fn()
      emissor.ouvir(() => { throw new Error('estourei') })
      emissor.ouvir(segundo)

      emissor.avisar()

      expect(segundo).toHaveBeenCalled()
      expect(erro).toHaveBeenCalled()
    } finally {
      erro.mockRestore()
    }
  })

  it('inscrever-se durante o aviso não pula o vizinho', () => {
    const emissor = criarEmissor<[]>()
    const tardio = vi.fn()
    const segundo = vi.fn()
    emissor.ouvir(() => emissor.ouvir(tardio))
    emissor.ouvir(segundo)

    emissor.avisar()

    // Quem entra durante o aviso só é chamado no PRÓXIMO — mas quem já estava
    // não pode ser pulado por a lista ter mudado no meio do laço.
    expect(segundo).toHaveBeenCalledTimes(1)
    expect(tardio).not.toHaveBeenCalled()
  })

  it('`ouvir` pode ser passado como referência, sem perder o `this`', () => {
    // É assim que os consumidores o expõem: `aoReceberAcao: aoAcao.ouvir`.
    const emissor = criarEmissor<[string]>()
    const registrar = emissor.ouvir
    const visto = vi.fn()

    registrar(visto)
    emissor.avisar('pa')

    expect(visto).toHaveBeenCalledWith('pa')
  })
})
