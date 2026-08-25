import { decidirFalando, rmsDe, TAMANHO_JANELA } from './nivel-voz'
import type { EstadoFala } from './nivel-voz'

/**
 * Quem está falando, medido no navegador.
 *
 * É o invólucro do `nivel-voz.ts`: aqui moram `AudioContext` e `AnalyserNode`,
 * lá mora a decisão. Uma passada de medição por `tique`, para que os testes
 * possam mover o tempo à mão em vez de esperar relógio.
 *
 * **Nada disso trafega.** O nível é medido localmente, sobre o áudio que já
 * chega pela call — ninguém publica "estou falando" para os outros.
 */

/**
 * A cada quanto medir. Dez vezes por segundo é bem mais barato que a cada
 * quadro e imperceptível para o olho: a janela de segurança já é de 320 ms.
 */
export const MS_AMOSTRAGEM = 100

/**
 * O buffer precisa ser sobre um `ArrayBuffer` de verdade, não sobre o
 * `ArrayBufferLike` que `new Float32Array(n)` infere: `getFloatTimeDomainData`
 * recusa `SharedArrayBuffer`, e desde o TypeScript 5.7 os arrays tipados
 * carregam o buffer no próprio tipo.
 */
function bufferDeAmostras(tamanho: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(tamanho * Float32Array.BYTES_PER_ELEMENT))
}

interface Observado {
  fonte: { disconnect: () => void }
  analisador: AnalyserNode
  buffer: Float32Array<ArrayBuffer>
  estado: EstadoFala
  /** Para reconhecer que o stream mudou sem recriar tudo à toa. */
  stream: MediaStream
}

export class MonitorDeVoz {
  private readonly criarContexto: () => AudioContext
  private contexto: AudioContext | null = null
  private readonly observados = new Map<string, Observado>()
  private readonly ouvintes: ((id: string, falando: boolean) => void)[] = []

  constructor(criarContexto: () => AudioContext = () => new AudioContext()) {
    this.criarContexto = criarContexto
  }

  aoMudar(cb: (id: string, falando: boolean) => void): void {
    this.ouvintes.push(cb)
  }

  /**
   * O contexto nasce na primeira pessoa observada, não no carregamento.
   *
   * Um `AudioContext` criado cedo demais fica suspenso à espera de gesto do
   * usuário e liga a placa de som de quem nem entrou numa call. Entrar na call
   * é um clique, então aqui já há gesto.
   */
  private contextoPronto(): AudioContext {
    this.contexto ??= this.criarContexto()
    // Alguns navegadores entregam suspenso mesmo com gesto; sem isto o
    // analisador devolve silêncio para sempre e ninguém acende.
    if (this.contexto.state === 'suspended') void this.contexto.resume()
    return this.contexto
  }

  /**
   * Passa a medir a voz desta pessoa. Idempotente para o mesmo stream —
   * chamar de novo com um stream NOVO troca o anterior, que é o caso de quem
   * sai e volta da call.
   */
  observar(id: string, stream: MediaStream): void {
    const atual = this.observados.get(id)
    if (atual?.stream === stream) return
    // `createMediaStreamSource` lança com um stream sem faixa de áudio, e uma
    // tela compartilhada sem som é exatamente isso. Ela também não é voz de
    // ninguém, então não há o que medir.
    if (stream.getAudioTracks().length === 0) return
    if (atual) this.esquecer(id)

    const contexto = this.contextoPronto()
    const analisador = contexto.createAnalyser()
    analisador.fftSize = TAMANHO_JANELA
    const fonte = contexto.createMediaStreamSource(stream)
    // Só até o analisador: ligar ao destino tocaria o áudio uma segunda vez,
    // por cima do `<audio>` que já toca — a voz sairia dobrada.
    fonte.connect(analisador)

    this.observados.set(id, {
      fonte,
      analisador,
      buffer: bufferDeAmostras(TAMANHO_JANELA),
      estado: { falando: false, quietoDesde: null },
      stream,
    })
  }

  /** Para de medir e SOLTA o analisador. Sem o disconnect é vazamento. */
  esquecer(id: string): void {
    const observado = this.observados.get(id)
    if (!observado) return
    observado.fonte.disconnect()
    observado.analisador.disconnect()
    this.observados.delete(id)
    // Quem sai da call no meio de uma frase deixaria o anel aceso para sempre.
    if (observado.estado.falando) this.avisar(id, false)
  }

  /** Quem está sendo medido agora. Serve para reconciliar contra a lista de
   *  quem deveria estar — quem saiu da call deixaria um analisador pendurado
   *  num stream morto, que é vazamento e anel congelado aceso. */
  observando(): string[] {
    return [...this.observados.keys()]
  }

  /** Uma passada de medição sobre todo mundo que está sendo observado. */
  tique(agora: number): void {
    for (const [id, observado] of this.observados) {
      observado.analisador.getFloatTimeDomainData(observado.buffer)
      const antes = observado.estado.falando
      observado.estado = decidirFalando(observado.estado, rmsDe(observado.buffer), agora)
      // Só a MUDANÇA avisa: avisar a cada tique redesenharia a lista de
      // participantes dez vezes por segundo, para sempre.
      if (observado.estado.falando !== antes) this.avisar(id, observado.estado.falando)
    }
  }

  encerrar(): void {
    for (const id of [...this.observados.keys()]) this.esquecer(id)
    void this.contexto?.close()
    this.contexto = null
  }

  private avisar(id: string, falando: boolean): void {
    for (const cb of this.ouvintes) cb(id, falando)
  }
}
