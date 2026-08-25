/**
 * A mensagem de estado é um RETRATO completo, não um incremento. Reenviar
 * para quem chega depois basta para sincronizar, e uma mensagem perdida se
 * conserta sozinha no próximo reenvio — não há sequência para dessincronizar.
 */
export type MensagemCall =
  | { tipo: 'estado'; naCall: boolean; compartilhando: boolean; canal: string }
  | { tipo: 'quero-tela'; quero: boolean }

/**
 * Os canais de voz da sala.
 *
 * Uma sala só, e cada pessoa anuncia em que canal está — o microfone vai
 * apenas para quem está no mesmo. Uma sala do Trystero por canal seria pior em
 * tudo: novo handshake a cada troca, e ninguém enxergaria quem está nos outros.
 *
 * A lista é FIXA e não viaja pela rede. Deixar criar canais exigiria
 * sincronizar nomes entre navegadores, resolver quem criou primeiro e limpar
 * os vazios — muita máquina para um grupo de amigos que precisa de "um canto
 * para conversar sem atrapalhar". Canais com nome ficam registrados como
 * evolução possível.
 *
 * **Só existem os canais que têm gente.** Um canal custa zero — é um campo de
 * texto, não uma conexão —, então nada impede sete deles; o que os cria é
 * haver alguém em cada um. Quem quiser um novo abre; quando o último sai, ele
 * deixa de existir.
 *
 * A alternativa que eu tinha feito era mostrar sempre um canal vazio de
 * reserva. Ficava errado no nome: "Canal 3 · vazio" descreve uma coisa que
 * existe e está sem ninguém, quando o que a pessoa quer é CRIAR uma.
 *
 * O teto de oito é backstop, não produto: uma sala com oito conversas
 * paralelas já não é uma sala.
 */
export const CANAIS = [
  { id: 'principal', nome: 'Principal' },
  { id: 'segundo', nome: 'Canal 2' },
  { id: 'terceiro', nome: 'Canal 3' },
  { id: 'quarto', nome: 'Canal 4' },
  { id: 'quinto', nome: 'Canal 5' },
  { id: 'sexto', nome: 'Canal 6' },
  { id: 'setimo', nome: 'Canal 7' },
  { id: 'oitavo', nome: 'Canal 8' },
] as const

export const CANAL_PADRAO = CANAIS[0].id

/**
 * Um canal que não conhecemos vira o padrão.
 *
 * Vem da rede: uma versão futura com mais canais, ou um cliente modificado.
 * Jogar a pessoa no principal a mantém visível e audível — descartá-la a
 * deixaria num canal fantasma, presente para si mesma e invisível para todos.
 */
export function canalConhecido(bruto: unknown): string {
  return CANAIS.some((c) => c.id === bruto) ? (bruto as string) : CANAL_PADRAO
}

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
  /** Em que canal eu estou. */
  meuCanal: string
  /** Todo mundo na call, em qualquer canal. Serve à contagem por canal. */
  naCall: string[]
  /** Quem está no MEU canal — é com essas pessoas que eu falo. */
  comigo: string[]
  /** Os canais que existem — os que têm gente. Contando eu no meu. */
  porCanal: { id: string; nome: string; pessoas: number }[]
  /** Ainda há id livre para abrir mais um. */
  podeAbrirCanal: boolean
  /** Quem compartilha tela NO MEU CANAL: de outro canal não se assiste. */
  compartilhando: string[]
  /** De quem eu pedi a tela. */
  assistindo: string[]
  /** Quem pediu a minha. Vazio = codificador desligado. */
  assistidoPor: string[]
}

interface Peer {
  naCall: boolean
  compartilhando: boolean
  canal: string
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
  private meuCanal: string = CANAL_PADRAO
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
    const canal = canalConhecido(msg.canal)
    const anterior = this.peers.get(de)
    if (
      anterior?.naCall === msg.naCall
      && anterior.compartilhando === msg.compartilhando
      && anterior.canal === canal
    ) {
      return
    }
    this.peers.set(de, { naCall: msg.naCall, compartilhando: msg.compartilhando, canal })

    // Quem parou de compartilhar, saiu da call OU foi para outro canal deixa
    // de ser assistido sem ninguém precisar pedir: a tela dele não está mais
    // ao alcance.
    this.reconciliarTelas()
    this.notificar()
  }

  private anunciar(para?: string): void {
    this.canal.enviar({
      tipo: 'estado',
      naCall: this.euNaCall,
      compartilhando: this.euCompartilhando,
      canal: this.meuCanal,
    }, para)
  }

  /** Está ao alcance da minha voz e da minha tela? */
  private comigo(peer: Peer | undefined): boolean {
    return peer !== undefined && peer.naCall && peer.canal === this.meuCanal
  }

  /**
   * Deixa de assistir — e de ser assistido por — quem saiu do meu alcance.
   *
   * Reconciliação e não detecção de borda, como no resto da mídia: quem trocou
   * de canal, parou de compartilhar ou saiu da call some daqui pela MESMA
   * regra, e rodar duas vezes tem o mesmo efeito de rodar uma.
   */
  private reconciliarTelas(): void {
    for (const id of [...this.assistindo]) {
      const peer = this.peers.get(id)
      if (!this.comigo(peer) || !peer?.compartilhando) this.assistindo.delete(id)
    }
    for (const id of [...this.assistidoPor]) {
      if (!this.comigo(this.peers.get(id))) this.assistidoPor.delete(id)
    }
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

  /**
   * Muda de canal.
   *
   * Não há handshake novo: a conexão com todo mundo da sala continua de pé, e
   * o que muda é para quem o microfone é publicado. Por isso trocar é
   * instantâneo, e por isso dá para ver quem está nos outros canais.
   */
  mudarCanal(canal: string): void {
    const destino = canalConhecido(canal)
    if (destino === this.meuCanal) return
    this.meuCanal = destino
    // As telas do canal antigo ficam para trás — inclusive a minha, para quem
    // ficou lá. Sem isto, alguém continuaria recebendo a minha tela de um
    // canal em que não estou mais.
    this.reconciliarTelas()
    this.anunciar()
    this.notificar()
  }

  /**
   * Abre um canal novo e vai para ele.
   *
   * "Abrir" é ir para um id livre: o canal passa a existir porque alguém está
   * nele. Quando o último sair, ele deixa de existir sozinho — não há o que
   * apagar nem quem precise apagar.
   */
  abrirCanal(): void {
    const comFiltro = (teste: (p: Peer) => boolean) =>
      [...this.peers.entries()].filter(([, p]) => teste(p)).map(([id]) => id)
    const livre = this.primeiroLivre(comFiltro)
    if (livre === undefined) return
    this.mudarCanal(livre)
  }

  assistir(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!this.comigo(peer) || !peer?.compartilhando) return
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
      meuCanal: this.meuCanal,
      naCall: comFiltro((p) => p.naCall),
      comigo: comFiltro((p) => p.naCall && p.canal === this.meuCanal),
      porCanal: this.canaisVisiveis(comFiltro),
      podeAbrirCanal: this.euNaCall && this.primeiroLivre(comFiltro) !== undefined,
      compartilhando: comFiltro(
        (p) => p.naCall && p.compartilhando && p.canal === this.meuCanal,
      ),
      assistindo: [...this.assistindo],
      assistidoPor: [...this.assistidoPor],
    }
  }

  /**
   * Os canais que valem aparecer: os que têm gente, mais o primeiro vago.
   *
   * A ordem é sempre a de `CANAIS`, e não "usados primeiro, vago no fim": o
   * vago pode ser o Principal, quando todo mundo migrou para outro lugar, e
   * jogá-lo para o fim faria as pílulas trocarem de posição conforme as
   * pessoas andam — clicar num canal e acertar outro é o pior desfecho.
   *
   * Todo mundo calcula isto a partir do MESMO estado, então a lista é a mesma
   * em todas as telas sem nada precisar ser combinado.
   */
  private quantosEm(
    comFiltro: (teste: (p: Peer) => boolean) => string[], id: string,
  ): number {
    return comFiltro((p) => p.naCall && p.canal === id).length
      // Eu conto no meu: a lista descreve onde as pessoas estão, e eu sou uma
      // delas — ver "0" no canal em que se está seria absurdo.
      + (this.euNaCall && this.meuCanal === id ? 1 : 0)
  }

  private primeiroLivre(
    comFiltro: (teste: (p: Peer) => boolean) => string[],
  ): string | undefined {
    return CANAIS.find((c) => this.quantosEm(comFiltro, c.id) === 0)?.id
  }

  /**
   * Os canais que existem: os que têm gente.
   *
   * A ordem é sempre a de `CANAIS`, e não a de criação: um canal esvaziado no
   * meio da fileira some, e se os outros escorregassem para preencher o buraco
   * as pílulas trocariam de posição enquanto as pessoas andam — clicar num
   * canal e acertar outro é o pior desfecho.
   *
   * Todo mundo calcula isto a partir do MESMO estado, então a lista é idêntica
   * em todas as telas sem nada precisar ser combinado.
   */
  private canaisVisiveis(
    comFiltro: (teste: (p: Peer) => boolean) => string[],
  ): { id: string; nome: string; pessoas: number }[] {
    return CANAIS
      .map((c) => ({ id: c.id, nome: c.nome, pessoas: this.quantosEm(comFiltro, c.id) }))
      .filter((c) => c.pessoas > 0)
  }

  aoMudar(cb: () => void): void {
    this.ouvintes.push(cb)
  }
}
