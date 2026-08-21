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
 * A casca que toca as APIs de mídia do navegador.
 *
 * Fina de propósito: nada aqui é testável sem navegador, então quanto menos
 * decisão morar neste arquivo, menos fica fora da suíte. Quem decide *quem
 * recebe o quê* é o `ProtocoloCall`, que é testado de verdade.
 */
export class Midia {
  private microfone: MediaStream | null = null
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

  aoReceberFaixa(cb: (faixa: MediaStreamTrack, de: string) => void): void {
    this.aoFaixa.push(cb)
  }
}
