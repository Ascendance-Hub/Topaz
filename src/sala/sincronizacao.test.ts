import { describe, it, expect, vi, afterEach } from 'vitest'
import { criarSincronizacao, MS_TIQUE } from './sincronizacao'
import type { DependenciasDeSincronizacao } from './sincronizacao'
import type { EstadoCall } from '../call/protocolo'
import { EU } from '../ui/components/participantes'

const callParada: EstadoCall = {
  euNaCall: false,
  euCompartilhando: false,
  meuCanal: 'principal',
  naCall: [],
  comigo: [],
  porCanal: [],
  podeAbrirCanal: false,
  compartilhando: [],
  assistindo: [],
  assistidoPor: [],
}

function montar(call: Partial<EstadoCall> = {}, sobrepor: Partial<DependenciasDeSincronizacao> = {}) {
  let observados: string[] = []
  const midia = {
    sincronizarMicrofone: vi.fn(),
    sincronizarTela: vi.fn(),
    microfoneLocal: vi.fn(() => ({ id: 'meu-mic' } as unknown as MediaStream)),
    telaLocal: vi.fn(() => ({ id: 'minha-tela' } as unknown as MediaStream)),
  }
  const area = { ajustar: vi.fn(), previaDaMinhaTela: vi.fn() }
  const vozes = {
    observar: vi.fn((id: string, _stream: MediaStream) => {
      if (!observados.includes(id)) observados.push(id)
    }),
    esquecer: vi.fn((id: string) => { observados = observados.filter((x) => x !== id) }),
    observando: () => [...observados],
    tique: vi.fn(),
    niveis: () => [],
    encerrar: vi.fn(),
  }
  const aoTique = vi.fn()
  const s = criarSincronizacao({
    estadoCall: () => ({ ...callParada, ...call }),
    midia, area, vozes, aoTique,
    msAmostragemDeVoz: 50,
    ...sobrepor,
  })
  return { s, midia, area, vozes, aoTique, observados: () => [...observados] }
}

afterEach(() => { vi.useRealTimers() })

describe('criarSincronizacao — o que deveria estar publicado agora', () => {
  it('o microfone vai para quem está no MEU canal, não para a call inteira', () => {
    // É esta linha que faz dois grupos conversarem na mesma sala sem se
    // atrapalhar.
    const { s, midia } = montar({ euNaCall: true, naCall: ['pa', 'pb'], comigo: ['pa'] })

    s.sincronizarMidia()

    expect(midia.sincronizarMicrofone).toHaveBeenCalledWith(['pa'])
  })

  it('a tela vai para quem PEDIU, e é isso que liga o codificador', () => {
    const { s, midia } = montar({ assistidoPor: ['pb'] })

    s.sincronizarMidia()

    expect(midia.sincronizarTela).toHaveBeenCalledWith(['pb'])
  })

  it('sem espectador, a tela não vai para ninguém — o codificador desliga', () => {
    const { s, midia } = montar({ euCompartilhando: true, assistidoPor: [] })

    s.sincronizarMidia()

    expect(midia.sincronizarTela).toHaveBeenCalledWith([])
  })

  it('a prévia da própria tela só existe enquanto eu compartilho', () => {
    const parado = montar({ euCompartilhando: false })
    parado.s.sincronizarMidia()
    expect(parado.area.previaDaMinhaTela).toHaveBeenCalledWith(null)

    const ativo = montar({ euCompartilhando: true })
    ativo.s.sincronizarMidia()
    expect(ativo.area.previaDaMinhaTela).toHaveBeenCalledWith({ id: 'minha-tela' })
  })

  it('chamar duas vezes com o mesmo estado é o mesmo que chamar uma', () => {
    // Idempotente por construção: é o que a torna segura no tique.
    const { s, midia } = montar({ euNaCall: true, comigo: ['pa'] })

    s.sincronizarMidia()
    s.sincronizarMidia()

    expect(midia.sincronizarMicrofone).toHaveBeenNthCalledWith(1, ['pa'])
    expect(midia.sincronizarMicrofone).toHaveBeenNthCalledWith(2, ['pa'])
  })
})

describe('criarSincronizacao — o medidor de voz', () => {
  it('mede o MEU microfone: ele nunca chega pelo caminho de mídia recebida', () => {
    const { s, observados } = montar({ euNaCall: true, comigo: [] })

    s.sincronizarMidia()

    expect(observados()).toContain(EU)
  })

  it('fora da call, ninguém é medido — nem eu', () => {
    const { s, vozes, observados } = montar({ euNaCall: false })

    s.sincronizarMidia()

    expect(observados()).not.toContain(EU)
    expect(vozes.esquecer).toHaveBeenCalledWith(EU)
  })

  it('esquece quem saiu da call, para não deixar analisador em stream morto', () => {
    // Vazamento, e o anel dele congelado aceso.
    const dentro = montar({ euNaCall: true, comigo: ['pa', 'pb'] })
    dentro.vozes.observar('pa', {} as MediaStream)
    dentro.vozes.observar('pb', {} as MediaStream)

    const saiu = montar({ euNaCall: true, comigo: ['pa'] })
    saiu.vozes.observar('pa', {} as MediaStream)
    saiu.vozes.observar('pb', {} as MediaStream)
    saiu.s.sincronizarMidia()

    expect(saiu.observados()).toContain('pa')
    expect(saiu.observados()).not.toContain('pb')
  })
})

describe('criarSincronizacao — o pulso', () => {
  it('bate a cada meio segundo, avançando o jogo E reconciliando a mídia', () => {
    vi.useFakeTimers()
    const { s, aoTique, midia } = montar()

    vi.advanceTimersByTime(MS_TIQUE * 3)

    expect(aoTique).toHaveBeenCalledTimes(3)
    expect(midia.sincronizarMicrofone).toHaveBeenCalledTimes(3)
    s.encerrar()
  })

  it('a voz tem ritmo próprio, mais rápido que o da sala', () => {
    vi.useFakeTimers()
    const { s, vozes } = montar({}, { msAmostragemDeVoz: 50 })

    vi.advanceTimersByTime(MS_TIQUE)

    // 500 / 50 = 10 batidas de voz para uma da sala.
    expect(vozes.tique).toHaveBeenCalledTimes(10)
    s.encerrar()
  })

  it('encerrar para os dois tiques — um intervalo esquecido mede sala morta', () => {
    vi.useFakeTimers()
    const { s, aoTique, vozes } = montar()

    s.encerrar()
    vi.advanceTimersByTime(MS_TIQUE * 5)

    expect(aoTique).not.toHaveBeenCalled()
    expect(vozes.tique).not.toHaveBeenCalled()
    expect(vozes.encerrar).toHaveBeenCalled()
  })

  it('a sonda de voz fica desligada por padrão', () => {
    vi.useFakeTimers()
    const registro = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { s } = montar()

    vi.advanceTimersByTime(5_000)

    expect(registro).not.toHaveBeenCalled()
    s.encerrar()
    registro.mockRestore()
  })

  it('e fala quando ligada por ?diag=voz', () => {
    vi.useFakeTimers()
    const registro = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { s } = montar({}, { diagnosticoDeVoz: true })

    vi.advanceTimersByTime(1_000)

    expect(registro).toHaveBeenCalled()
    s.encerrar()
    registro.mockRestore()
  })
})
