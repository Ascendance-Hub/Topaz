// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { Midia } from './midia'
import type { SalaTrystero } from '../net/transport'

/**
 * Sala falsa que espelha o pareamento REAL do Trystero, e é isso que dá valor
 * a este arquivo.
 *
 * Em `media.mjs`, quem publica com `addStream` alimenta `pendingStreamMetas`,
 * e essa fila é consumida por `receiveRemoteStream`, que dispara
 * `onPeerStream`. Já `onPeerTrack` é alimentado por `pendingTrackMetas`, que
 * só existe quando o remetente usou `addTrack`. Publicar de um jeito e escutar
 * do outro faz a mídia sumir em silêncio — foi exatamente o bug que os
 * jogadores encontraram: dados chegavam, áudio e vídeo não.
 */
function criarSalaFalsa() {
  const publicados: { stream: unknown; opcoes: unknown }[] = []
  const sala = {
    onPeerStream: null as ((stream: unknown, peerId: string, meta?: unknown) => void) | null,
    onPeerTrack: null as unknown,
    addStream: (stream: unknown, opcoes: unknown) => {
      publicados.push({ stream, opcoes })
    },
    removeStream: vi.fn(),
    getPeers: () => ({}),
  }

  /** Senders observáveis, para conferir o liga-desliga do codificador. */
  function comSender(peerId: string) {
    const params: { encodings: Record<string, unknown>[] } = { encodings: [{}] }
    const faixa = { kind: 'video' }
    const sender = {
      track: faixa,
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    sala.getPeers = (() => ({ [peerId]: { getSenders: () => [sender] } })) as never
    return { sender, params, faixa }
  }

  /** Entrega ao destinatário pelo MESMO caminho que o `addStream` alimenta. */
  function entregar(stream: unknown, de: string, meta?: unknown): void {
    sala.onPeerStream?.(stream, de, meta)
  }

  return { sala: sala as unknown as SalaTrystero, bruta: sala, publicados, entregar, comSender }
}

describe('Midia — recebimento', () => {
  it('entrega ao consumidor a mídia publicada com addStream', () => {
    const { sala, entregar } = criarSalaFalsa()
    const midia = new Midia(sala)
    const recebido = vi.fn()
    midia.aoReceberMidia(recebido)

    const stream = { id: 'stream-1' }
    entregar(stream, 'pa', { tipo: 'microfone' })

    expect(recebido).toHaveBeenCalledWith(stream, 'pa', { tipo: 'microfone' })
  })

  it('repassa a metadata, que é como se distingue microfone de tela', () => {
    const { sala, entregar } = criarSalaFalsa()
    const midia = new Midia(sala)
    const recebido = vi.fn()
    midia.aoReceberMidia(recebido)

    entregar({ id: 'tela-1' }, 'pa', { tipo: 'tela' })

    expect(recebido.mock.calls[0]![2]).toEqual({ tipo: 'tela' })
  })

  it('entrega a todos os consumidores registrados, não só ao último', () => {
    const { sala, entregar } = criarSalaFalsa()
    const midia = new Midia(sala)
    const primeiro = vi.fn()
    const segundo = vi.fn()
    midia.aoReceberMidia(primeiro)
    midia.aoReceberMidia(segundo)

    entregar({ id: 's' }, 'pa')

    expect(primeiro).toHaveBeenCalled()
    expect(segundo).toHaveBeenCalled()
  })
})

describe('Midia — publicação da tela', () => {
  it('não publica para ninguém antes de alguém pedir para assistir', () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)

    midia.sincronizarTela(['pa'])

    // Sem tela capturada, não há o que publicar — e é isso que garante que o
    // codificador só liga depois do pedido.
    expect(publicados).toHaveLength(0)
  })
})

/** Só o `getUserMedia` é falsificado; o resto do caminho é o de verdade. */
function fingirMicrofone(): MediaStream {
  const stream = { id: 'mic', getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
  })
  return stream
}

describe('Midia — sincronização do microfone', () => {
  it('publica para quem está na call assim que o microfone fica pronto', async () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()

    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])

    expect(publicados).toHaveLength(1)
    expect(publicados[0]!.opcoes).toMatchObject({ target: ['pa'] })
  })

  it('não publica duas vezes para o mesmo peer', async () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()

    midia.sincronizarMicrofone(['pa'])
    midia.sincronizarMicrofone(['pa'])

    expect(publicados).toHaveLength(1)
  })

  it('publica para quem entrou depois, sem repetir para quem já tinha', async () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])

    midia.sincronizarMicrofone(['pa', 'pb'])

    expect(publicados).toHaveLength(2)
    expect(publicados[1]!.opcoes).toMatchObject({ target: ['pb'] })
  })

  it('quem foi pedido ANTES do microfone existir ainda recebe depois', async () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()

    // É o caso real: os dois clicam "Entrar na call" juntos, e o anúncio do
    // outro chega durante a janela de permissão do microfone. Com detecção de
    // borda, esta publicação era descartada e nunca mais tentada — e ninguém
    // ouvia ninguém.
    midia.sincronizarMicrofone(['pa'])
    expect(publicados).toHaveLength(0)

    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])

    expect(publicados).toHaveLength(1)
  })

  it('para de mandar o microfone para quem saiu da call', async () => {
    const { sala, bruta, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])

    midia.sincronizarMicrofone([])

    expect(bruta.removeStream).toHaveBeenCalledWith(expect.anything(), { target: ['pa'] })
    // E se ele voltar, publica de novo em vez de achar que já mandou.
    midia.sincronizarMicrofone(['pa'])
    expect(publicados).toHaveLength(2)
  })
})

describe('Midia — republicar depois de sair e voltar', () => {
  it('publica um objeto de stream NOVO a cada republicação', async () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()

    midia.sincronizarMicrofone(['pa'])
    // O peer sai da call e volta — do lado de quem FICOU, o microfone é o
    // mesmo objeto o tempo todo.
    midia.sincronizarMicrofone([])
    midia.sincronizarMicrofone(['pa'])

    expect(publicados).toHaveLength(2)
    // O Trystero indexa o stream remoto por uma chave derivada do OBJETO do
    // stream, num WeakMap. Republicar o mesmo objeto faz o receptor achar que
    // já conhece aquele stream, reentregar o antigo — que morreu no
    // `removeStream` — e descartar o `ontrack` novo. O áudio some de um lado
    // só, que foi exatamente o relato.
    expect(publicados[0]!.stream).not.toBe(publicados[1]!.stream)
  })

  it('publica um MediaStream de verdade, não o objeto guardado', async () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    const mic = fingirMicrofone()
    await midia.ligarMicrofone()

    midia.sincronizarMicrofone(['pa'])

    // A identidade do objeto é o que importa aqui: é dela que sai a chave que
    // o receptor usa para cachear. (Que as faixas viajam junto não dá para
    // afirmar sob happy-dom, cujo `MediaStream` descarta faixas falsas.)
    expect(publicados[0]!.stream).toBeInstanceOf(MediaStream)
    expect(publicados[0]!.stream).not.toBe(mic)
  })
})

describe('Midia — qualidade', () => {
  it('começa em 720p, a altura que o probe mostrou barata', () => {
    const { sala } = criarSalaFalsa()

    expect(new Midia(sala).qualidade()).toBe(720)
  })

  it('lembra a altura escolhida', () => {
    const { sala } = criarSalaFalsa()
    const midia = new Midia(sala)

    midia.definirQualidade(1080)

    expect(midia.qualidade()).toBe(1080)
  })

  it('reaplica em quem já está assistindo, sem esperar republicação', async () => {
    const { sala, bruta } = criarSalaFalsa()
    const params = { encodings: [{} as Record<string, unknown>] }
    const sender = {
      track: { kind: 'video' },
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    bruta.getPeers = (() => ({ pa: { getSenders: () => [sender] } })) as never
    const midia = new Midia(sala)

    // Precisa haver tela publicada para alguém: sem espectador não há envio a
    // reajustar, e não fazer nada é o comportamento certo.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [],
          getVideoTracks: () => [{ contentHint: '', onended: null, getSettings: () => ({ height: 1080 }) }],
          getAudioTracks: () => [],
        }),
      },
      configurable: true,
    })
    await midia.compartilharTela(() => {})
    midia.sincronizarTela(['pa'])

    midia.definirQualidade(1080)

    expect(sender.setParameters).toHaveBeenCalled()
    expect(params.encodings[0]).toMatchObject({ scaleResolutionDownBy: 1 })
  })

  it('não mexe em nada quando ninguém está assistindo', () => {
    const { sala, bruta } = criarSalaFalsa()
    const sender = { track: { kind: 'video' }, getParameters: vi.fn(), setParameters: vi.fn() }
    bruta.getPeers = (() => ({ pa: { getSenders: () => [sender] } })) as never
    const midia = new Midia(sala)

    midia.definirQualidade(1080)

    expect(sender.setParameters).not.toHaveBeenCalled()
  })
})

describe('Midia — assistir, parar e assistir de novo', () => {
  async function comTelaCompartilhada() {
    const contexto = criarSalaFalsa()
    const midia = new Midia(contexto.sala)
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [],
          getVideoTracks: () => [{ contentHint: '', onended: null, getSettings: () => ({ height: 1080 }) }],
          getAudioTracks: () => [],
        }),
      },
      configurable: true,
    })
    await midia.compartilharTela(() => {})
    return { ...contexto, midia }
  }

  it('estabelece o envio uma vez só, mesmo assistindo várias vezes', async () => {
    const { midia, publicados, comSender } = await comTelaCompartilhada()
    comSender('pa')

    midia.sincronizarTela(['pa'])
    midia.sincronizarTela([])
    midia.sincronizarTela(['pa'])

    // Republicar faria o `ontrack` do outro lado não disparar de novo (o
    // transceiver é reaproveitado), e a tela nunca mais voltaria.
    expect(publicados).toHaveLength(1)
  })

  it('não desmonta o envio quando o espectador para de assistir', async () => {
    const { midia, bruta, comSender } = await comTelaCompartilhada()
    comSender('pa')
    midia.sincronizarTela(['pa'])

    midia.sincronizarTela([])

    expect(bruta.removeStream).not.toHaveBeenCalled()
  })

  it('desliga o codificador quando ninguém assiste', async () => {
    const { midia, comSender } = await comTelaCompartilhada()
    const { params } = comSender('pa')
    midia.sincronizarTela(['pa'])

    midia.sincronizarTela([])

    expect(params.encodings[0]!['active']).toBe(false)
  })

  it('religa o codificador quando voltam a assistir', async () => {
    const { midia, comSender } = await comTelaCompartilhada()
    const { params } = comSender('pa')
    midia.sincronizarTela(['pa'])
    midia.sincronizarTela([])

    midia.sincronizarTela(['pa'])

    expect(params.encodings[0]!['active']).toBe(true)
  })

  it('parar de compartilhar de vez desmonta o envio', async () => {
    const { midia, bruta, comSender } = await comTelaCompartilhada()
    comSender('pa')
    midia.sincronizarTela(['pa'])

    midia.pararTela()

    expect(bruta.removeStream).toHaveBeenCalled()
  })
})

describe('Midia — escala pela resolução real da fonte', () => {
  async function comFonteDe(alturaFonte: number) {
    const contexto = criarSalaFalsa()
    const midia = new Midia(contexto.sala)
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [],
          getVideoTracks: () => [
            { contentHint: '', onended: null, getSettings: () => ({ height: alturaFonte }) },
          ],
          getAudioTracks: () => [],
        }),
      },
      configurable: true,
    })
    await midia.compartilharTela(() => {})
    return { ...contexto, midia }
  }

  it('reduz uma tela 1440p para a altura escolhida', async () => {
    const { midia, comSender } = await comFonteDe(1440)
    const { params } = comSender('pa')

    midia.sincronizarTela(['pa'])
    midia.definirQualidade(720)

    expect(params.encodings[0]!['scaleResolutionDownBy']).toBe(2)
  })

  it('não reduz quando a fonte já é menor que o alvo', async () => {
    const { midia, comSender } = await comFonteDe(900)
    const { params } = comSender('pa')

    midia.sincronizarTela(['pa'])
    midia.definirQualidade(1080)

    // Sem o `Math.max(1, ...)`, isto viraria um aumento de escala: pixels
    // inventados, custando bitrate e sem ganhar nitidez nenhuma.
    expect(params.encodings[0]!['scaleResolutionDownBy']).toBe(1)
  })

  it('usa bitrate maior em 1080p que em 720p', async () => {
    const { midia, comSender } = await comFonteDe(1080)
    const { params } = comSender('pa')
    midia.sincronizarTela(['pa'])

    midia.definirQualidade(720)
    const em720 = params.encodings[0]!['maxBitrate'] as number
    midia.definirQualidade(1080)
    const em1080 = params.encodings[0]!['maxBitrate'] as number

    expect(em1080).toBeGreaterThan(em720)
  })
})

describe('Midia — áudio do compartilhamento', () => {
  async function telaComSom() {
    const contexto = criarSalaFalsa()
    const midia = new Midia(contexto.sala)
    const faixaAudio = { kind: 'audio', contentHint: '', getSettings: () => ({}) }
    const faixaVideo = { kind: 'video', contentHint: '', onended: null, getSettings: () => ({ height: 1080 }) }
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [faixaVideo, faixaAudio],
          getVideoTracks: () => [faixaVideo],
          getAudioTracks: () => [faixaAudio],
        }),
      },
      configurable: true,
    })
    await midia.compartilharTela(() => {})
    return { ...contexto, midia, faixaAudio, faixaVideo }
  }

  it('marca o áudio da tela como música, não como fala', async () => {
    const { faixaAudio } = await telaComSom()

    // Sem isto o codificador trata como voz: corta faixa de frequência, aplica
    // supressão e o som do jogo chega abafado. `music` diz para preservar.
    expect(faixaAudio.contentHint).toBe('music')
  })

  it('a faixa de vídeo continua com a dica de vídeo, não de música', async () => {
    const { faixaVideo } = await telaComSom()

    expect(faixaVideo.contentHint).toBe('motion')
  })

  it('dá bitrate de música ao áudio da tela', async () => {
    const { midia, bruta, faixaAudio } = await telaComSom()
    const params: { encodings: Record<string, unknown>[] } = { encodings: [{}] }
    const senderAudio = {
      // A MESMA faixa que está na tela: o ajuste é dirigido, para o microfone
      // (publicado por outro caminho) não ganhar bitrate de música.
      track: faixaAudio,
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    bruta.getPeers = (() => ({ pa: { getSenders: () => [senderAudio] } })) as never

    midia.sincronizarTela(['pa'])
    midia.definirQualidade(720)

    // O Opus padrão do WebRTC mira voz, com bitrate baixo. Som de jogo precisa
    // de mais para não virar chiado.
    expect(params.encodings[0]!['maxBitrate']).toBeGreaterThanOrEqual(128_000)
  })
})

describe('Midia — o microfone não vira música', () => {
  it('não aplica bitrate de tela ao microfone', async () => {
    const contexto = criarSalaFalsa()
    const midia = new Midia(contexto.sala)
    const faixaVideo = {
      contentHint: '', onended: null, getSettings: () => ({ height: 1080 }),
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [faixaVideo],
          getVideoTracks: () => [faixaVideo],
          getAudioTracks: () => [],
        }),
      },
      configurable: true,
    })
    await midia.compartilharTela(() => {})

    const params: { encodings: Record<string, unknown>[] } = { encodings: [{}] }
    const senderMicrofone = {
      track: { kind: 'audio' },
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    contexto.bruta.getPeers = (() => ({ pa: { getSenders: () => [senderMicrofone] } })) as never

    midia.sincronizarTela(['pa'])
    midia.definirQualidade(720)

    expect(senderMicrofone.setParameters).not.toHaveBeenCalled()
  })
})
