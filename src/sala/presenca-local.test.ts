import { describe, it, expect, vi } from 'vitest'
import { criarPresencaLocal } from './presenca-local'
import type { DependenciasDePresencaLocal } from './presenca-local'
import type { SalaDeFundo } from '../presenca/presenca'

/** Uma sala de fundo controlável, para provocar entrada e saída na mão. */
function salaFalsa() {
  const estado = {
    chega: (_id: string) => {},
    vaiEmbora: (_id: string) => {},
    saiu: false,
  }
  const sala: SalaDeFundo = {
    aoEntrarPeer: (cb) => { estado.chega = cb },
    aoSairPeer: (cb) => { estado.vaiEmbora = cb },
    sair: () => { estado.saiu = true },
  }
  return { sala, estado }
}

function montar(sobrepor: Partial<DependenciasDePresencaLocal> = {}) {
  const abertas = new Map<string, ReturnType<typeof salaFalsa>>()
  const anunciadas: string[] = []
  let anuncio = salaFalsa()

  const base: DependenciasDePresencaLocal = {
    codigo: 'AQUI',
    grupos: () => ['AQUI', 'LA', 'ACOLA'],
    conectado: () => true,
    abrir: (codigo) => {
      const f = salaFalsa()
      abertas.set(codigo, f)
      return f.sala
    },
    anunciar: (codigo) => {
      anunciadas.push(codigo)
      anuncio = salaFalsa()
      return anuncio.sala
    },
    // Zero: os testes medem a lógica, não a espera.
    pausaMs: 0,
    aoMudar: () => {},
  }
  return {
    presencaLocal: criarPresencaLocal({ ...base, ...sobrepor }),
    abertas,
    anunciadas,
    anuncioAtual: () => anuncio,
  }
}

describe('criarPresencaLocal — a ordem: sala primeiro, presença depois', () => {
  it('não anuncia enquanto a conexão não deu certo', () => {
    // Presença competindo com conectar é o que atrapalhou as quatro
    // tentativas anteriores.
    const { presencaLocal, anunciadas } = montar({ conectado: () => false })

    presencaLocal.liberarSeConectou()

    expect(anunciadas).toEqual([])
  })

  it('anuncia quando a conexão dá certo', () => {
    const { presencaLocal, anunciadas } = montar()

    presencaLocal.liberarSeConectou()

    expect(anunciadas).toEqual(['AQUI'])
  })

  it('anuncia UMA vez, mesmo chamada a cada desenho', () => {
    // Uma vez liberada não volta atrás: reabrir é justamente o que colide.
    const { presencaLocal, anunciadas } = montar()

    presencaLocal.liberarSeConectou()
    presencaLocal.liberarSeConectou()
    presencaLocal.liberarSeConectou()

    expect(anunciadas).toEqual(['AQUI'])
  })

  it('não observa grupo nenhum antes de liberar', () => {
    const { presencaLocal, abertas } = montar({ conectado: () => false })

    presencaLocal.acompanharGrupos()

    expect([...abertas.keys()]).toEqual([])
  })
})

describe('criarPresencaLocal — quais grupos observa', () => {
  it('observa os outros, e NÃO o grupo em que já estou', () => {
    // Observar a si mesmo abriria uma segunda entrada no mesmo
    // `codigo#presenca`, que o Trystero devolveria como a MESMA sala — com o
    // `onPeerJoin` sobrescrito por cima do anúncio.
    const { presencaLocal, abertas } = montar()

    presencaLocal.liberarSeConectou()
    presencaLocal.acompanharGrupos()

    expect([...abertas.keys()]).toEqual(['LA', 'ACOLA'])
  })

  it('conta quem declarou estar lá', () => {
    const { presencaLocal, abertas } = montar()
    presencaLocal.liberarSeConectou()
    presencaLocal.acompanharGrupos()

    abertas.get('LA')!.estado.chega('alguem')

    expect(presencaLocal.quantos('LA')).toBe(1)
    expect(presencaLocal.quantos('ACOLA')).toBe(0)
  })

  it('avisa quem desenha quando a contagem muda', () => {
    const aoMudar = vi.fn()
    const { presencaLocal, abertas } = montar({ aoMudar })
    presencaLocal.liberarSeConectou()
    presencaLocal.acompanharGrupos()
    aoMudar.mockClear()

    abertas.get('LA')!.estado.chega('alguem')

    expect(aoMudar).toHaveBeenCalled()
  })
})

describe('criarPresencaLocal — a tranca do anúncio órfão', () => {
  /**
   * O sintoma, medido com duas abas: sair do Grupo Y e ir para o X deixava o Y
   * marcando "1 pessoa online" PARA SEMPRE, do ponto de vista de todo mundo.
   * Recarregar a página limpava — assinatura de sala órfã, não de contagem
   * errada.
   *
   * A causa era o encerramento baixar a tranca em vez de trancá-la de vez: o
   * desenho é chamado de vários lugares, e alguns chegam DEPOIS do
   * encerramento.
   */
  it('um desenho atrasado NÃO abre anúncio depois do encerramento', () => {
    const { presencaLocal, anunciadas } = montar()

    // Nunca chegou a liberar antes de encerrar — o pior caso.
    presencaLocal.encerrar()
    presencaLocal.liberarSeConectou()

    expect(anunciadas).toEqual([])
  })

  it('e nem depois de já ter anunciado uma vez', () => {
    const { presencaLocal, anunciadas } = montar()
    presencaLocal.liberarSeConectou()

    presencaLocal.encerrar()
    presencaLocal.liberarSeConectou()

    expect(anunciadas).toEqual(['AQUI'])
  })

  it('todo anúncio que nasce é fechado no encerramento', () => {
    const { presencaLocal, anuncioAtual } = montar()
    presencaLocal.liberarSeConectou()

    presencaLocal.encerrar()

    // Um `sair` não chamado é uma sala viva anunciando você num lugar onde
    // você não está.
    expect(anuncioAtual().estado.saiu).toBe(true)
  })

  it('encerrar sem nunca ter anunciado não estoura', () => {
    const { presencaLocal } = montar({ conectado: () => false })

    expect(() => presencaLocal.encerrar()).not.toThrow()
  })

  it('o encerramento fecha as salas observadas também', () => {
    const { presencaLocal, abertas } = montar()
    presencaLocal.liberarSeConectou()
    presencaLocal.acompanharGrupos()

    presencaLocal.encerrar()

    expect(abertas.get('LA')!.estado.saiu).toBe(true)
    expect(abertas.get('ACOLA')!.estado.saiu).toBe(true)
  })

  it('depois de encerrada, acompanhar não abre sala nova', () => {
    const { presencaLocal, abertas } = montar()
    presencaLocal.liberarSeConectou()

    presencaLocal.encerrar()
    presencaLocal.acompanharGrupos()

    expect([...abertas.keys()]).toEqual([])
  })
})
