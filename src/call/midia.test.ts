// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { Midia } from './midia'
import { criarSalasFalsas } from '../net/salas.fake'

/**
 * Adaptador sobre a `Salas` falsa comum, preservando os nomes que esta suíte
 * já usava. A fusão das três redes assumiu o papel que a sala crua tinha, mas
 * as garantias testadas aqui não mudaram: publicar só para quem está ativo,
 * invólucro novo a cada publicação, e o codificador ligando e desligando.
 */
function criarSalaFalsa() {
  const ctx = criarSalasFalsas(['pa', 'pb'])
  const publicados = ctx.publicados.map((p) => ({ stream: p.stream, opcoes: { target: p.alvos } }))
  const espelho = {
    get length() { return ctx.publicados.length },
  }
  void espelho
  const bruta = {
    removeStream: (..._a: unknown[]) => { void _a },
    replaceTrack: (..._a: unknown[]) => { void _a },
    getPeers: () => ({}),
  }
  void publicados
  return {
    sala: ctx.salas,
    bruta,
    ctx,
    publicados: ctx.publicados,
    entregar: ctx.entregarStream,
    comSender: (peerId: string) => {
      const params: { encodings: Record<string, unknown>[] } = { encodings: [{}] }
      const faixa = { kind: 'video' }
      const sender = {
        track: faixa,
        getParameters: () => params,
        setParameters: vi.fn().mockResolvedValue(undefined),
      }
      ctx.definirSenders({ [peerId]: { getSenders: () => [sender] } })
      return { sender, params, faixa }
    },
  }
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
    expect(publicados[0]!.alvos).toEqual(['pa'])
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
    expect(publicados[1]!.alvos).toEqual(['pb'])
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
    const { sala, ctx, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])

    midia.sincronizarMicrofone([])

    expect(ctx.despublicados).toContainEqual(
      { stream: expect.anything(), alvos: ['pa'] })
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
    const { sala, ctx } = criarSalaFalsa()
    const params = { encodings: [{} as Record<string, unknown>] }
    const sender = {
      track: { kind: 'video' },
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    ctx.definirSenders({ pa: { getSenders: () => [sender] } })
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
    const { sala, ctx } = criarSalaFalsa()
    const sender = { track: { kind: 'video' }, getParameters: vi.fn(), setParameters: vi.fn() }
    ctx.definirSenders({ pa: { getSenders: () => [sender] } })
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
    const { midia, ctx, comSender } = await comTelaCompartilhada()
    comSender('pa')
    midia.sincronizarTela(['pa'])

    midia.sincronizarTela([])

    expect(ctx.despublicados).toHaveLength(0)
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
    const { midia, ctx, comSender } = await comTelaCompartilhada()
    comSender('pa')
    midia.sincronizarTela(['pa'])

    midia.pararTela()

    expect(ctx.despublicados.length).toBeGreaterThan(0)
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
    const { midia, ctx, faixaAudio } = await telaComSom()
    const params: { encodings: Record<string, unknown>[] } = { encodings: [{}] }
    const senderAudio = {
      // A MESMA faixa que está na tela: o ajuste é dirigido, para o microfone
      // (publicado por outro caminho) não ganhar bitrate de música.
      track: faixaAudio,
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    ctx.definirSenders({ pa: { getSenders: () => [senderAudio] } })

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
    contexto.ctx.definirSenders({ pa: { getSenders: () => [senderMicrofone] } })

    midia.sincronizarTela(['pa'])
    midia.definirQualidade(720)

    expect(senderMicrofone.setParameters).not.toHaveBeenCalled()
  })
})

describe('Midia — trocar de microfone', () => {
  function fingirMicrofones(faixas: Record<string, unknown>) {
    const capturado: string[] = []
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn((r: MediaStreamConstraints) => {
          const audio = r.audio as { deviceId?: { exact?: string } }
          const id = audio?.deviceId?.exact ?? 'padrao'
          capturado.push(id)
          const faixa = faixas[id] ?? { kind: 'audio', enabled: true, stop: vi.fn() }
          return Promise.resolve({
            id: `stream-${id}`,
            getTracks: () => [faixa],
            getAudioTracks: () => [faixa],
          } as unknown as MediaStream)
        }),
      },
      configurable: true,
    })
    return capturado
  }

  it('pede exatamente o dispositivo escolhido', async () => {
    const { sala } = criarSalaFalsa()
    const midia = new Midia(sala)
    const pedidos = fingirMicrofones({})
    await midia.ligarMicrofone()

    await midia.trocarMicrofone('fone-usb')

    expect(pedidos).toContain('fone-usb')
  })

  it('substitui a faixa em vez de republicar', async () => {
    const { sala, ctx, publicados } = criarSalaFalsa()
    
    const velha = { kind: 'audio', enabled: true, stop: vi.fn() }
    const nova = { kind: 'audio', enabled: true, stop: vi.fn() }
    const midia = new Midia(sala)
    fingirMicrofones({ padrao: velha, 'fone-usb': nova })
    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])
    const publicadosAntes = publicados.length

    await midia.trocarMicrofone('fone-usb')

    // `replaceTrack` troca a faixa sem renegociar: ninguém ouve corte. Uma
    // republicação faria o outro lado receber um stream novo e passar pelo
    // caminho de add/remove, que é onde os bugs moram.
    expect(ctx.substituicoes).toContainEqual({ velha, nova })
    expect(publicados).toHaveLength(publicadosAntes)
  })

  it('encerra a faixa antiga, para o indicador do navegador apagar', async () => {
    const { sala } = criarSalaFalsa()
    
    const velha = { kind: 'audio', enabled: true, stop: vi.fn() }
    const midia = new Midia(sala)
    fingirMicrofones({ padrao: velha, outro: { kind: 'audio', enabled: true, stop: vi.fn() } })
    await midia.ligarMicrofone()

    await midia.trocarMicrofone('outro')

    expect(velha.stop).toHaveBeenCalled()
  })

  it('o mudo sobrevive à troca de microfone', async () => {
    const { sala } = criarSalaFalsa()
    
    const nova = { kind: 'audio', enabled: true, stop: vi.fn() }
    const midia = new Midia(sala)
    fingirMicrofones({ 'fone-usb': nova })
    await midia.ligarMicrofone()
    midia.alternarMicrofone()

    await midia.trocarMicrofone('fone-usb')

    // Trocar de aparelho não pode reabrir um microfone que a pessoa fechou.
    expect(nova.enabled).toBe(false)
  })

  it('antes de entrar na call, só guarda a escolha', async () => {
    const { sala } = criarSalaFalsa()
    const midia = new Midia(sala)
    fingirMicrofones({})

    await midia.trocarMicrofone('fone-usb')

    expect(midia.microfoneAtual()).toBe('fone-usb')
  })
})

describe('Midia — peer que ainda não terminou de conectar', () => {
  /** `getPeers()` só lista quem já está ATIVO — é o mesmo critério que o
   *  Trystero usa para decidir a quem entregar. */
  function comAtivos(ctx: ReturnType<typeof criarSalaFalsa>['ctx'], ids: string[]) {
    ctx.definirAtivos(ids)
  }

  it('não marca como publicado quem o Trystero vai descartar', async () => {
    const { sala, ctx, publicados } = criarSalaFalsa()
    comAtivos(ctx, [])
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()

    midia.sincronizarMicrofone(['pa'])

    // Em `room.mjs`, publicar para um peer que ainda não está ativo é jogado
    // fora com um `console.warn`. Marcar como feito ali era o que fazia a
    // terceira e a quarta pessoa nunca serem ouvidas.
    expect(publicados).toHaveLength(0)
  })

  it('publica assim que o peer fica ativo, na sincronização seguinte', async () => {
    const { sala, ctx, publicados } = criarSalaFalsa()
    comAtivos(ctx, [])
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()
    midia.sincronizarMicrofone(['pa'])

    comAtivos(ctx, ['pa'])
    midia.sincronizarMicrofone(['pa'])

    expect(publicados).toHaveLength(1)
  })

  it('não republica para quem já recebeu', async () => {
    const { sala, ctx, publicados } = criarSalaFalsa()
    comAtivos(ctx, ['pa'])
    const midia = new Midia(sala)
    fingirMicrofone()
    await midia.ligarMicrofone()

    midia.sincronizarMicrofone(['pa'])
    midia.sincronizarMicrofone(['pa'])

    expect(publicados).toHaveLength(1)
  })
})
