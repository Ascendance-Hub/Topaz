import type { SalaTrystero } from '../net/transport'
import { escolherH264 } from './codec'

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

/**
 * Bitrate por altura. Um teto único servia mal aos dois casos: 3 Mbps aperta
 * 1080p (a tela chega borrada, que foi o relato) e sobra em 720p.
 */
export const BITRATE_POR_ALTURA: Record<number, number> = {
  720: 2_500_000,
  1080: 6_000_000,
}
const BITRATE_FALLBACK = 4_000_000

export const RESTRICOES_TELA: DisplayMediaStreamOptions = {
  video: { frameRate: { ideal: 30 } },
  /**
   * Pede o áudio do que está sendo compartilhado. O navegador decide se
   * oferece: no Chrome vem para aba e, no Windows, para tela inteira; no Mac e
   * no Linux costuma não vir. Pedir e não receber é inofensivo — a tela vai
   * sem som, como antes.
   *
   * Quem compartilha usando alto-falante pode gerar eco, porque o áudio do
   * sistema inclui a voz de quem está do outro lado. Com fone, não acontece.
   */
  audio: true,
}

/** Como o codificador deve gastar o bitrate que tem. */
export type TipoConteudo = 'motion' | 'detail'

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
  private aoMidia: ((stream: MediaStream, de: string, meta?: unknown) => void)[] = []
  /**
   * Para quem cada mídia já foi publicada.
   *
   * Isto existe para a publicação ser RECONCILIAÇÃO e não detecção de borda.
   * Com borda ("mudou de fora para dentro da lista, publica"), um pedido que
   * chega enquanto o microfone ainda está na janela de permissão é descartado
   * e nunca mais tentado — e como os dois lados costumam clicar "Entrar na
   * call" ao mesmo tempo, o caso comum virava ninguém ouvir ninguém.
   */
  private micPara = new Set<string>()
  private telaPara = new Set<string>()
  private altura: number = ALTURA_PADRAO
  private conteudo: TipoConteudo = 'motion'

  /**
   * `onPeerStream` e NÃO `onPeerTrack`: em `media.mjs` do Trystero, quem
   * publica com `addStream` alimenta `pendingStreamMetas`, e essa fila só é
   * consumida por `receiveRemoteStream`, que dispara `onPeerStream`.
   * `onPeerTrack` vem de `pendingTrackMetas`, que só existe quando o remetente
   * usou `addTrack`.
   *
   * Publicar de um jeito e escutar do outro faz a mídia sumir sem erro nenhum:
   * os dados continuam chegando, e só áudio e vídeo somem. Foi assim que este
   * módulo nasceu quebrado, e por isso há teste espelhando esse pareamento.
   */
  constructor(private sala: SalaTrystero) {
    this.sala.onPeerStream = (stream, peerId, metadata) => {
      for (const cb of this.aoMidia) cb(stream, peerId, metadata)
    }
  }

  /** Só captura. Quem recebe é decidido depois, por `sincronizarMicrofone`. */
  async ligarMicrofone(): Promise<void> {
    if (this.microfone) return
    this.microfone = await navigator.mediaDevices.getUserMedia(RESTRICOES_MICROFONE)
  }

  /**
   * Deixa a publicação do microfone igual a `alvos`, seja qual for o estado
   * anterior. Chamar de novo com a mesma lista não faz nada; chamar antes de o
   * microfone existir não perde o pedido, porque a próxima chamada reconcilia.
   *
   * O microfone é dirigido: estar na sala não é estar na call, e sem `target`
   * quem só queria jogar blackjack receberia a conversa sem ter pedido.
   */
  sincronizarMicrofone(alvos: string[]): void {
    this.reconciliar(this.microfone, this.micPara, alvos, 'microfone')
  }

  desligarMicrofone(): void {
    if (!this.microfone) return
    this.sala.removeStream(this.microfone)
    this.micPara.clear()
    // Parar as faixas também: sem isso o indicador de microfone do navegador
    // fica aceso depois de sair da call, o que assusta com razão.
    for (const faixa of this.microfone.getTracks()) faixa.stop()
    this.microfone = null
  }

  /**
   * O laço comum de microfone e tela: publica para quem falta, despublica de
   * quem sobra, e não faz nada quando já está igual.
   */
  private reconciliar(
    stream: MediaStream | null, publicado: Set<string>, alvos: string[], tipo: string,
  ): void {
    const sobrando = [...publicado].filter((id) => !alvos.includes(id))
    if (stream && sobrando.length > 0) {
      this.sala.removeStream(stream, { target: sobrando })
    }
    // Esquece mesmo sem stream: se ele voltar, precisa ser publicado de novo.
    for (const id of sobrando) publicado.delete(id)

    if (!stream) return
    const faltando = alvos.filter((id) => !publicado.has(id))
    if (faltando.length === 0) return

    // Invólucro NOVO a cada publicação, e nunca o mesmo objeto duas vezes.
    //
    // O Trystero indexa o stream remoto por uma chave derivada do OBJETO do
    // stream, num WeakMap. Republicar o mesmo objeto depois de um
    // `removeStream` faz o receptor achar que já conhece aquele stream:
    // `receiveStreamMeta` acha no cache, reentrega o stream ANTIGO — que
    // morreu no remove — e o `ontrack` novo é descartado por não ter meta
    // pendente. O áudio some de um lado só.
    //
    // Foi assim que sair e voltar para a call quebrava a conversa de forma
    // assimétrica: quem saía criava captura nova (chave nova, funcionava),
    // quem ficava republicava o mesmo objeto (chave repetida, morria).
    //
    // Remover continua usando o stream original: o Trystero casa os senders
    // pelas FAIXAS, não pelo objeto.
    this.sala.addStream(new MediaStream(stream.getTracks()),
      { target: faltando, metadata: { tipo } })
    for (const id of faltando) publicado.add(id)
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
    faixa.contentHint = this.conteudo
    // O Chrome mostra a barra dele com "Parar de compartilhar". Sem tratar o
    // fim por esse caminho, a interface continuaria dizendo que você
    // compartilha depois de você já ter parado.
    faixa.onended = () => aoEncerrarPeloNavegador()
  }

  /**
   * `alvos` é quem pediu para assistir.
   *
   * O envio é ESTABELECIDO uma vez por peer e nunca desmontado enquanto a tela
   * existir — parar de assistir só desliga o codificador. O motivo é duro:
   * `removeStream` faz `pc.removeTrack`, que não encerra o transceiver. Ao
   * re-adicionar, o transceiver é reaproveitado, o `ontrack` do outro lado NÃO
   * dispara de novo, e a meta fica presa em `pendingStreamMetas` para sempre —
   * a tela nunca mais voltava, a menos que quem compartilha reiniciasse tudo
   * (aí a faixa era nova).
   *
   * `encoding.active` liga e desliga a codificação sem renegociar, então o
   * ganho de não codificar para quem não assiste continua valendo.
   */
  sincronizarTela(alvos: string[]): void {
    if (!this.tela) return
    const novos = alvos.filter((id) => !this.telaPara.has(id))
    if (novos.length > 0) {
      this.sala.addStream(new MediaStream(this.tela.getTracks()),
        { target: novos, metadata: { tipo: 'tela' } })
      for (const id of novos) this.telaPara.add(id)
    }
    for (const id of this.telaPara) {
      const ativo = alvos.includes(id)
      // Quem acabou de ser publicado precisa esperar o sender existir; quem já
      // estava é imediato.
      if (novos.includes(id)) setTimeout(() => this.ajustarEnvio(id, ativo), MS_ATE_O_SENDER_EXISTIR)
      else this.ajustarEnvio(id, ativo)
    }
  }

  pararTela(): void {
    if (!this.tela) return
    this.sala.removeStream(this.tela)
    this.telaPara.clear()
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
  private ajustarEnvio(peerId: string, ativo: boolean): void {
    const pc = this.sala.getPeers()[peerId]
    if (!pc) return
    // `RTCRtpSender` pode não existir (navegador antigo), e uma exceção aqui
    // derrubaria o compartilhamento inteiro por causa de um ajuste opcional.
    const h264 = typeof RTCRtpSender === 'undefined'
      ? undefined
      : escolherH264(RTCRtpSender.getCapabilities?.('video')?.codecs ?? [])

    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      const encoding: EncodingComCodec | undefined = params.encodings?.[0]
      if (!encoding) continue
      encoding.active = ativo
      encoding.maxBitrate = BITRATE_POR_ALTURA[this.altura] ?? BITRATE_FALLBACK
      // A escala sai da altura REAL da captura, não de um 1080 presumido.
      // Numa tela 1440p ou 4K, presumir 1080 dava fator 1: mandava resolução
      // nativa com bitrate de tela pequena, e o resultado era exatamente o
      // "mesmo em 1080p não parece boa".
      const alturaFonte = this.tela?.getVideoTracks()[0]?.getSettings().height
      encoding.scaleResolutionDownBy = Math.max(1, (alturaFonte ?? this.altura) / this.altura)
      if (h264) encoding.codec = h264
      // Falhar aqui degrada a qualidade, não a conversa: um ajuste de
      // codificação nunca deve derrubar uma call que já está de pé.
      void sender.setParameters(params).catch(() => {})
    }
  }

  qualidade(): number {
    return this.altura
  }

  tipoConteudo(): TipoConteudo {
    return this.conteudo
  }

  /**
   * `motion` prioriza fluidez e `detail` prioriza nitidez — o codificador não
   * consegue os dois com o mesmo bitrate. Para jogo, `motion`; para código ou
   * texto, `detail`, que é o que faz letra pequena parar de embolar.
   *
   * Vale na hora, sem renegociar: `contentHint` é propriedade da faixa.
   */
  definirTipoConteudo(tipo: TipoConteudo): void {
    this.conteudo = tipo
    const faixa = this.tela?.getVideoTracks()[0]
    if (faixa) faixa.contentHint = tipo
  }

  /**
   * Troca a altura e reaplica em quem já está recebendo. `setParameters` vale
   * na conexão de pé, então a mudança é imediata: não espera republicação nem
   * renegociação, e quem está assistindo vê a qualidade mudar sem corte.
   */
  definirQualidade(altura: number): void {
    this.altura = altura
    for (const peerId of this.telaPara) this.ajustarEnvio(peerId, true)
  }

  aoReceberMidia(cb: (stream: MediaStream, de: string, meta?: unknown) => void): void {
    this.aoMidia.push(cb)
  }
}
