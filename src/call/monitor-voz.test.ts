// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { MonitorDeVoz } from './monitor-voz'
import { LIMIAR_LIGA, MS_SEGURA, TAMANHO_JANELA } from './nivel-voz'

/** Um analisador que devolve sempre o mesmo nível, que o teste controla. */
class AnalisadorFalso {
  fftSize = 0
  nivel = 0
  desconectado = false

  getFloatTimeDomainData(alvo: Float32Array): void {
    alvo.fill(this.nivel)
  }

  disconnect(): void {
    this.desconectado = true
  }
}

class ContextoFalso {
  state = 'running'
  analisadores: AnalisadorFalso[] = []
  fontes: { stream: MediaStream; desconectado: boolean }[] = []
  fechado = false

  createMediaStreamSource(stream: MediaStream) {
    const fonte = { stream, desconectado: false, connect: () => {}, disconnect: () => { fonte.desconectado = true } }
    this.fontes.push(fonte)
    return fonte
  }

  createAnalyser() {
    const analisador = new AnalisadorFalso()
    this.analisadores.push(analisador)
    return analisador
  }

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.fechado = true
    return Promise.resolve()
  }
}

/** Um stream com faixa de áudio, que é o que o monitor aceita observar. */
function streamComVoz(): MediaStream {
  const stream = new MediaStream()
  // happy-dom não gera faixas; fingimos o que o monitor consulta.
  stream.getAudioTracks = () => [{} as MediaStreamTrack]
  return stream
}

function streamSemAudio(): MediaStream {
  const stream = new MediaStream()
  stream.getAudioTracks = () => []
  return stream
}

function montar() {
  const ctx = new ContextoFalso()
  const monitor = new MonitorDeVoz(() => ctx as unknown as AudioContext)
  const mudancas: [string, boolean][] = []
  monitor.aoMudar((id, falando) => mudancas.push([id, falando]))
  return { ctx, monitor, mudancas }
}

describe('MonitorDeVoz', () => {
  it('avisa quando alguém começa a falar', () => {
    const { ctx, monitor, mudancas } = montar()
    monitor.observar('pa', streamComVoz())

    ctx.analisadores[0]!.nivel = LIMIAR_LIGA + 0.05
    monitor.tique(1000)

    expect(mudancas).toEqual([['pa', true]])
  })

  it('avisa uma vez só enquanto a pessoa continua falando', () => {
    // Sem isto, cada tique redesenharia a lista de participantes — 10 vezes
    // por segundo, para sempre.
    const { ctx, monitor, mudancas } = montar()
    monitor.observar('pa', streamComVoz())
    ctx.analisadores[0]!.nivel = LIMIAR_LIGA + 0.05

    monitor.tique(1000)
    monitor.tique(1100)
    monitor.tique(1200)

    expect(mudancas).toEqual([['pa', true]])
  })

  it('avisa quando a pessoa para, depois da janela de segurança', () => {
    const { ctx, monitor, mudancas } = montar()
    monitor.observar('pa', streamComVoz())
    ctx.analisadores[0]!.nivel = LIMIAR_LIGA + 0.05
    monitor.tique(1000)

    ctx.analisadores[0]!.nivel = 0
    monitor.tique(1100)
    monitor.tique(1100 + MS_SEGURA + 1)

    expect(mudancas).toEqual([['pa', true], ['pa', false]])
  })

  it('separa as pessoas — o nível de uma não acende a outra', () => {
    const { ctx, monitor, mudancas } = montar()
    monitor.observar('pa', streamComVoz())
    monitor.observar('pb', streamComVoz())

    ctx.analisadores[1]!.nivel = LIMIAR_LIGA + 0.05
    monitor.tique(1000)

    expect(mudancas).toEqual([['pb', true]])
  })

  it('usa a janela combinada com o módulo puro', () => {
    // Se o fftSize divergisse de TAMANHO_JANELA, a rejeição de estalo que o
    // teste de `rmsDe` garante não valeria na prática.
    const { ctx, monitor } = montar()
    monitor.observar('pa', streamComVoz())

    expect(ctx.analisadores[0]!.fftSize).toBe(TAMANHO_JANELA)
  })

  it('observar duas vezes a mesma pessoa não cria dois analisadores', () => {
    const { ctx, monitor } = montar()
    const stream = streamComVoz()

    monitor.observar('pa', stream)
    monitor.observar('pa', stream)

    expect(ctx.analisadores).toHaveLength(1)
  })

  it('um stream novo da mesma pessoa substitui o anterior', () => {
    // Sair e voltar da call traz um MediaStream novo. Sem trocar, o monitor
    // continuaria medindo o stream morto e a pessoa nunca mais acenderia.
    const { ctx, monitor } = montar()
    monitor.observar('pa', streamComVoz())

    monitor.observar('pa', streamComVoz())

    expect(ctx.analisadores).toHaveLength(2)
    expect(ctx.fontes[0]!.desconectado).toBe(true)
  })

  it('ignora stream sem áudio — a tela compartilhada não é voz de ninguém', () => {
    // `createMediaStreamSource` LANÇA com um stream sem faixa de áudio.
    const { ctx, monitor } = montar()

    expect(() => monitor.observar('tela', streamSemAudio())).not.toThrow()
    expect(ctx.analisadores).toHaveLength(0)
  })

  it('esquecer solta o analisador — senão é vazamento', () => {
    const { ctx, monitor } = montar()
    monitor.observar('pa', streamComVoz())

    monitor.esquecer('pa')

    expect(ctx.analisadores[0]!.desconectado).toBe(true)
    expect(ctx.fontes[0]!.desconectado).toBe(true)
  })

  it('quem foi esquecido para de ser medido', () => {
    const { ctx, monitor, mudancas } = montar()
    monitor.observar('pa', streamComVoz())
    monitor.esquecer('pa')

    ctx.analisadores[0]!.nivel = LIMIAR_LIGA + 0.05
    monitor.tique(1000)

    expect(mudancas).toEqual([])
  })

  it('esquecer quem falava avisa que parou', () => {
    // Quem sai da call no meio de uma frase deixaria o anel aceso para sempre.
    const { ctx, monitor, mudancas } = montar()
    monitor.observar('pa', streamComVoz())
    ctx.analisadores[0]!.nivel = LIMIAR_LIGA + 0.05
    monitor.tique(1000)

    monitor.esquecer('pa')

    expect(mudancas).toEqual([['pa', true], ['pa', false]])
  })

  it('só cria o contexto de áudio quando há alguém para ouvir', () => {
    // Um AudioContext criado no carregamento da página fica suspenso à espera
    // de gesto, e liga a placa de som de quem nem entrou numa call.
    const criar = vi.fn(() => new ContextoFalso() as unknown as AudioContext)
    const monitor = new MonitorDeVoz(criar)

    expect(criar).not.toHaveBeenCalled()

    monitor.observar('pa', streamComVoz())
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it('encerrar fecha o contexto e esquece todo mundo', () => {
    const { ctx, monitor } = montar()
    monitor.observar('pa', streamComVoz())
    monitor.observar('pb', streamComVoz())

    monitor.encerrar()

    expect(ctx.fechado).toBe(true)
    expect(ctx.analisadores.every((a) => a.desconectado)).toBe(true)
  })

  it('tique sem ninguém observado não quebra', () => {
    const { monitor } = montar()

    expect(() => monitor.tique(1000)).not.toThrow()
  })
})
