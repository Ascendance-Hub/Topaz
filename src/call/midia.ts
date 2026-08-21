import type { SalaTrystero } from '../net/transport'

/**
 * O supressor de ruído do próprio WebRTC, de graça. Não é Krisp, mas resolve
 * ventilador e teclado sem nenhuma dependência.
 */
export const RESTRICOES_MICROFONE: MediaStreamConstraints = {
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  video: false,
}

/**
 * Teto padrão. O probe de 2026-08-20 mostrou o custo de codificação saltando
 * cerca de 3× ao passar de 720p para 1080p, enquanto o número de espectadores
 * quase não pesa. Resolução é o botão que importa.
 */
export const ALTURA_PADRAO = 720
export const BITRATE_PADRAO = 3_000_000

export const RESTRICOES_TELA: DisplayMediaStreamOptions = {
  // Sem áudio nesta versão: a captura é irregular entre plataformas, e som do
  // sistema com microfone aberto cria eco de verdade. Custo assumido: assistir
  // vídeo junto entrega imagem sem som.
  video: { frameRate: { ideal: 30 } },
  audio: false,
}

/** O `addStream` com alvo só cria o sender depois de renegociar. */
const MS_ATE_O_SENDER_EXISTIR = 1500

/**
 * Escolher codec por encoding é mais novo que a lib de tipos do TypeScript,
 * mas existe no Chrome — a sonda de 2026-08-21 trocou VP8 por H.264 por aqui.
 * Estender o tipo, em vez de recorrer a `any`, mantém o compilador checando
 * todo o resto do objeto.
 */
type EncodingComCodec = RTCRtpEncodingParameters & { codec?: RTCRtpCodec }

/**
 * A casca que toca as APIs de mídia do navegador.
 *
 * Fina de propósito: nada aqui é testável sem navegador, então quanto menos
 * decisão morar neste arquivo, menos fica fora da suíte. Quem decide *quem
 * recebe o quê* é o `ProtocoloCall`, que é testado de verdade.
 */
export class Midia {
  private microfone: MediaStream | null = null
  private tela: MediaStream | null = null
  private aoFaixa: ((faixa: MediaStreamTrack, de: string) => void)[] = []

  constructor(private sala: SalaTrystero) {
    this.sala.onPeerTrack = (faixa, _stream, peerId) => {
      for (const cb of this.aoFaixa) cb(faixa, peerId)
    }
  }

  async ligarMicrofone(alvos: string[]): Promise<void> {
    if (this.microfone) return
    this.microfone = await navigator.mediaDevices.getUserMedia(RESTRICOES_MICROFONE)
    // O microfone é dirigido: estar na sala não é estar na call, e sem `target`
    // quem só queria jogar blackjack receberia a conversa sem ter pedido.
    // `target` aceita lista, então uma chamada só alcança todos os alvos.
    if (alvos.length > 0) {
      this.sala.addStream(this.microfone, { target: alvos, metadata: { tipo: 'microfone' } })
    }
  }

  /** Um peer que entrou na call depois de mim vira alvo novo. */
  publicarMicrofonePara(peerId: string): void {
    if (!this.microfone) return
    this.sala.addStream(this.microfone, { target: peerId, metadata: { tipo: 'microfone' } })
  }

  desligarMicrofone(): void {
    if (!this.microfone) return
    this.sala.removeStream(this.microfone)
    // Parar as faixas também: sem isso o indicador de microfone do navegador
    // fica aceso depois de sair da call, o que assusta com razão.
    for (const faixa of this.microfone.getTracks()) faixa.stop()
    this.microfone = null
  }

  /**
   * Pega a tela, mas NÃO publica para ninguém. Publicar é consequência de
   * alguém pedir para assistir — é a assinatura explícita, e é o que faz o
   * custo escalar com quem assiste em vez de com quem compartilha.
   */
  async compartilharTela(aoEncerrarPeloNavegador: () => void): Promise<void> {
    if (this.tela) return
    this.tela = await navigator.mediaDevices.getDisplayMedia(RESTRICOES_TELA)
    const faixa = this.tela.getVideoTracks()[0]
    if (!faixa) return
    // Diz ao codificador o que priorizar. Escolher errado aqui é a causa
    // clássica de "tela travando", e é o botão que Discord e Meet não expõem.
    faixa.contentHint = 'motion'
    // O Chrome mostra a barra dele com "Parar de compartilhar". Sem tratar o
    // fim por esse caminho, a interface continuaria dizendo que você
    // compartilha depois de você já ter parado.
    faixa.onended = () => aoEncerrarPeloNavegador()
  }

  publicarTelaPara(peerId: string): void {
    if (!this.tela) return
    this.sala.addStream(this.tela, { target: peerId, metadata: { tipo: 'tela' } })
    setTimeout(() => this.ajustarEnvio(peerId), MS_ATE_O_SENDER_EXISTIR)
  }

  despublicarTelaDe(peerId: string): void {
    if (!this.tela) return
    this.sala.removeStream(this.tela, { target: peerId })
  }

  pararTela(): void {
    if (!this.tela) return
    this.sala.removeStream(this.tela)
    for (const faixa of this.tela.getTracks()) faixa.stop()
    this.tela = null
  }

  /**
   * Qualidade e codec, aplicados DEPOIS da negociação.
   *
   * Medido em 2026-08-21, com duas abas ligadas por Trystero real:
   * `setCodecPreferences` não serve, porque logo após o `addStream` ainda não
   * existe transceiver nenhum para configurar. `setParameters` serve, porque
   * só escolhe entre o que já foi negociado — e o H.264 entra no SDP por
   * padrão mesmo sem ser o preferido. É ele que aciona o encoder de hardware.
   */
  private ajustarEnvio(peerId: string): void {
    const pc = this.sala.getPeers()[peerId]
    if (!pc) return
    const h264 = RTCRtpSender.getCapabilities?.('video')?.codecs
      .find((c) => c.mimeType.toLowerCase() === 'video/h264')

    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      const encoding: EncodingComCodec | undefined = params.encodings?.[0]
      if (!encoding) continue
      encoding.maxBitrate = BITRATE_PADRAO
      encoding.scaleResolutionDownBy = Math.max(1, 1080 / ALTURA_PADRAO)
      if (h264) encoding.codec = h264
      // Falhar aqui degrada a qualidade, não a conversa: um ajuste de
      // codificação nunca deve derrubar uma call que já está de pé.
      void sender.setParameters(params).catch(() => {})
    }
  }

  aoReceberFaixa(cb: (faixa: MediaStreamTrack, de: string) => void): void {
    this.aoFaixa.push(cb)
  }
}
