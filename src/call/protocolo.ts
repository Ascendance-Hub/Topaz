/**
 * A mensagem de estado é um RETRATO completo, não um incremento. Reenviar
 * para quem chega depois basta para sincronizar, e uma mensagem perdida se
 * conserta sozinha no próximo reenvio — não há sequência para dessincronizar.
 */
export type MensagemCall =
  | { tipo: 'estado'; naCall: boolean; compartilhando: boolean }
  | { tipo: 'quero-tela'; quero: boolean }

export interface CanalCall {
  meuId(): string
  /** Sem `para`, vai para todos os peers da sala. */
  enviar(msg: MensagemCall, para?: string): void
  aoReceber(cb: (msg: MensagemCall, de: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
}

export interface EstadoCall {
  euNaCall: boolean
  euCompartilhando: boolean
  naCall: string[]
  compartilhando: string[]
  /** De quem eu pedi a tela. */
  assistindo: string[]
  /** Quem pediu a minha. Vazio = codificador desligado. */
  assistidoPor: string[]
}

interface Peer {
  naCall: boolean
  compartilhando: boolean
}

/**
 * Quem está na call, quem tem tela disponível, e quem pediu para assistir a
 * quem. Não toca em nenhuma API de navegador de propósito: é a metade da call
 * que dá para testar de verdade, e há um teste de isolamento garantindo que
 * continue assim.
 */
export class ProtocoloCall {
  private euNaCall = false
  private euCompartilhando = false
  private peers = new Map<string, Peer>()
  private assistindo = new Set<string>()
  private assistidoPor = new Set<string>()
  private ouvintes: (() => void)[] = []

  constructor(private canal: CanalCall) {
    this.canal.aoReceber((msg, de) => this.receber(msg, de))

    // Quem chega recebe o meu retrato. É isso que torna a entrada tardia
    // indistinguível da entrada no início.
    this.canal.aoEntrarPeer((peerId) => this.anunciar(peerId))

    this.canal.aoSairPeer((peerId) => {
      const tinha = this.peers.delete(peerId)
      const assistia = this.assistindo.delete(peerId)
      const eraAssistido = this.assistidoPor.delete(peerId)
      if (tinha || assistia || eraAssistido) this.notificar()
    })
  }

  private receber(msg: MensagemCall, de: string): void {
    if (msg.tipo === 'quero-tela') {
      // Só aceito espectador enquanto de fato compartilho: sem isso, um pedido
      // atrasado ligaria o codificador depois de eu já ter parado.
      const antes = this.assistidoPor.size
      if (msg.quero && this.euCompartilhando) this.assistidoPor.add(de)
      else this.assistidoPor.delete(de)
      if (this.assistidoPor.size !== antes) this.notificar()
      return
    }

    // Retrato idêntico ao que eu já tinha não é mudança. Sem este descarte, a
    // tela se redesenharia a cada peer que entra na sala, porque cada entrada
    // faz todo mundo reanunciar.
    const anterior = this.peers.get(de)
    if (anterior?.naCall === msg.naCall && anterior?.compartilhando === msg.compartilhando) {
      return
    }
    this.peers.set(de, { naCall: msg.naCall, compartilhando: msg.compartilhando })

    // Quem parou de compartilhar (ou saiu da call) deixa de ser assistido sem
    // que ninguém precise pedir: a tela dele não existe mais.
    if (!msg.compartilhando || !msg.naCall) this.assistindo.delete(de)
    this.notificar()
  }

  private anunciar(para?: string): void {
    this.canal.enviar(
      { tipo: 'estado', naCall: this.euNaCall, compartilhando: this.euCompartilhando },
      para,
    )
  }

  private notificar(): void {
    for (const cb of this.ouvintes) cb()
  }

  entrar(): void {
    if (this.euNaCall) return
    this.euNaCall = true
    this.anunciar()
    this.notificar()
  }

  sair(): void {
    if (!this.euNaCall) return
    this.euNaCall = false
    // Sair da call derruba o compartilhamento junto: uma tela publicada por
    // quem não está mais na conversa seria uma janela aberta sem dono.
    this.euCompartilhando = false
    this.assistidoPor.clear()
    this.assistindo.clear()
    this.anunciar()
    this.notificar()
  }

  definirCompartilhando(ligado: boolean): void {
    if (this.euCompartilhando === ligado) return
    this.euCompartilhando = ligado
    if (!ligado) this.assistidoPor.clear()
    this.anunciar()
    this.notificar()
  }

  assistir(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer?.compartilhando || !peer.naCall) return
    if (this.assistindo.has(peerId)) return
    this.assistindo.add(peerId)
    this.canal.enviar({ tipo: 'quero-tela', quero: true }, peerId)
    this.notificar()
  }

  pararDeAssistir(peerId: string): void {
    if (!this.assistindo.delete(peerId)) return
    this.canal.enviar({ tipo: 'quero-tela', quero: false }, peerId)
    this.notificar()
  }

  estado(): EstadoCall {
    const comFiltro = (teste: (p: Peer) => boolean) =>
      [...this.peers.entries()].filter(([, p]) => teste(p)).map(([id]) => id)

    return {
      euNaCall: this.euNaCall,
      euCompartilhando: this.euCompartilhando,
      naCall: comFiltro((p) => p.naCall),
      compartilhando: comFiltro((p) => p.naCall && p.compartilhando),
      assistindo: [...this.assistindo],
      assistidoPor: [...this.assistidoPor],
    }
  }

  aoMudar(cb: () => void): void {
    this.ouvintes.push(cb)
  }
}
