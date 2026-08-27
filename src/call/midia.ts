import type { Salas } from '../net/salas'
import { escolherH264 } from './codec'
import { avisarTodos } from '../net/avisar'

/**
 * O supressor de ruído do próprio WebRTC, de graça. Não é Krisp, mas resolve
 * ventilador e teclado sem nenhuma dependência.
 */
const RESTRICOES_MICROFONE: MediaStreamConstraints = {
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  video: false,
}

/**
 * Teto padrão.
 *
 * O probe de 2026-08-20 mostrou o custo de codificação saltando cerca de 3× ao
 * passar de 720p para 1080p, enquanto o número de espectadores quase não pesa:
 * resolução é o botão que importa. Ainda assim o padrão é 1080p, e isso é uma
 * escolha deliberada contra a economia — o uso real é ler texto e ver detalhe
 * na tela do outro, e aí a resolução é o que decide se a coisa serve.
 *
 * O que ela custa, para quem for reavaliar depois: ~3× de CPU (com folga, já
 * que o codificador é de hardware) e 6 Mbps de upload POR ESPECTADOR, contra
 * 2,5 em 720p. Como a topologia é malha, quatro pessoas assistindo são 24 Mbps
 * de subida. Quem tiver upload curto ou sentir a máquina pesar troca no
 * seletor de qualidade, que continua ali.
 */
export const ALTURA_PADRAO = 1080

/**
 * Bitrate por altura. Um teto único servia mal aos dois casos: 3 Mbps aperta
 * 1080p (a tela chega borrada, que foi o relato) e sobra em 720p.
 */
const BITRATE_POR_ALTURA: Record<number, number> = {
  720: 2_500_000,
  1080: 6_000_000,
}
const BITRATE_FALLBACK = 4_000_000

/**
 * O Opus do WebRTC nasce mirando voz: bitrate baixo, mono, banda estreita.
 * Para o som de um jogo ou de um vídeo isso chega abafado e chiado — foi o
 * relato. Este teto, somado ao `contentHint = 'music'` na faixa, é o que faz o
 * codificador parar de tratar aquilo como fala.
 */
const BITRATE_AUDIO_TELA = 192_000

const RESTRICOES_TELA: DisplayMediaStreamOptions = {
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
  private micPara = new Map<string, MediaStream>()
  private telaPara = new Map<string, MediaStream>()
  /**
   * Quem pediu a minha tela na última sincronização.
   *
   * `telaPara` responde outra pergunta — "para quem o envio já foi
   * ESTABELECIDO" —, e as duas divergem de propósito: o envio é estabelecido
   * uma vez e nunca desmontado (`removeTrack` não encerra o transceiver, e o
   * `ontrack` do outro lado não dispararia de novo), então quem para de
   * assistir continua em `telaPara` com o codificador desligado.
   *
   * Sem este segundo conjunto não há como reaplicar qualidade — nem resolver
   * um ajuste adiado — sem reacender todo mundo que um dia assistiu.
   */
  private assistindoAgora = new Set<string>()
  private altura: number = ALTURA_PADRAO
  /**
   * `motion` por padrão.
   *
   * Cheguei a trocar para `detail` achando que resolveria a tela borrada. Não
   * era isso: a tela nasce ruim e se ajeita sozinha em dez ou quinze segundos,
   * porque o codificador precisa de tempo para achar o bitrate. `detail`
   * trocava esse ajuste por uma perda de fluidez que ficava para sempre.
   *
   * Quem for mostrar uma tela parada de texto troca no seletor, que existe
   * justamente por isso.
   */
  private conteudo: TipoConteudo = 'motion'
  private mudo = false
  private idMicrofone: string | null = null
  /**
   * O ajuste de envio que JÁ está valendo em cada peer.
   *
   * O tique de `main.ts` chama a sincronização duas vezes por segundo. Sem
   * esta guarda, cada passagem refazia `getSenders()` + `getParameters()` +
   * `setParameters()` para cada espectador com nada tendo mudado — e
   * `setParameters` não é leitura: é a API que remexe no codificador.
   *
   * Só é gravado quando o ajuste ENCOSTOU num sender de verdade. Marcar sem
   * aplicar seria pior que não ter guarda: o sender só existe depois da
   * renegociação, e uma marca prematura faria a qualidade nunca ser aplicada.
   */
  private envioAplicado = new Map<string, string>()
  /**
   * As capacidades do navegador não mudam durante a sessão, e
   * `getCapabilities` devolve uma lista nova a cada chamada. Por instância, e
   * não por módulo, para que um teste não veja o cache de outro.
   */
  private h264: RTCRtpCodec | undefined
  private perguntouH264 = false

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
  constructor(private salas: Salas) {
    this.salas.aoReceberStream((stream, peerId, metadata) => {
      avisarTodos(this.aoMidia, stream, peerId, metadata)
    })
  }

  /** Restrições do microfone, respeitando o aparelho escolhido. */
  private restricoesDoMicrofone(): MediaStreamConstraints {
    const audio = RESTRICOES_MICROFONE.audio as MediaTrackConstraints
    return {
      video: false,
      audio: this.idMicrofone
        ? { ...audio, deviceId: { exact: this.idMicrofone } }
        : audio,
    }
  }

  microfoneAtual(): string | null {
    return this.idMicrofone
  }

  /**
   * Troca o aparelho de captura sem cortar a conversa.
   *
   * `replaceTrack` substitui a faixa nos senders que já existem, **sem
   * renegociar** — ninguém do outro lado ouve corte. Republicar faria o outro
   * lado passar de novo pelo caminho de add/remove, que é justamente onde os
   * bugs de mídia moraram até aqui.
   */
  async trocarMicrofone(deviceId: string): Promise<void> {
    this.idMicrofone = deviceId
    // Fora da call ainda não há o que trocar: a escolha fica guardada e vale
    // no próximo `ligarMicrofone`.
    if (!this.microfone) return

    const velha = this.microfone.getAudioTracks()[0]
    const novoStream = await navigator.mediaDevices.getUserMedia(this.restricoesDoMicrofone())
    const nova = novoStream.getAudioTracks()[0]
    if (!nova) return

    // O mudo é do usuário, não do aparelho: trocar de microfone não pode
    // reabrir um que ele fechou.
    nova.enabled = !this.mudo
    if (velha) {
      this.salas.substituirFaixa(velha, nova)
      // Encerrar a antiga apaga o indicador daquele aparelho no navegador.
      velha.stop()
    }
    this.microfone = novoStream
  }

  /** Só captura. Quem recebe é decidido depois, por `sincronizarMicrofone`. */
  async ligarMicrofone(): Promise<void> {
    if (this.microfone) return
    this.microfone = await navigator.mediaDevices.getUserMedia(this.restricoesDoMicrofone())
    // O mudo sobrevive a sair e voltar da call: se a pessoa se mutou, não é
    // para o microfone voltar aberto sozinho.
    for (const faixa of this.microfone.getAudioTracks()) faixa.enabled = !this.mudo
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

  microfoneMudo(): boolean {
    return this.mudo
  }

  /**
   * O meu microfone, para quem precisa MEDIR o que ele capta.
   *
   * O medidor de voz é o único caso: o áudio dos outros chega por
   * `aoReceberMidia`, mas o meu nunca passa por ali — ele sai daqui direto
   * para a rede. Sem este acesso, eu seria o único da fileira sem anel, que é
   * justamente quem mais precisa dele: ver o próprio anel acender é como a
   * pessoa descobre que o microfone funciona sem perguntar "tá me ouvindo?".
   *
   * Devolve o stream vivo, não uma cópia: analisar exige as faixas de
   * verdade.
   */
  microfoneLocal(): MediaStream | null {
    return this.microfone
  }

  /**
   * A minha tela, para eu mesmo poder assisti-la.
   *
   * Pedido de quem usa: conferir o que está mostrando sem perguntar aos
   * outros. Não passa por WebRTC nenhum — é a captura crua ligada a um
   * `<video>` local, e por isso não liga codificador nem conta como
   * espectador. Ver a própria tela continua não acordando o encoder.
   */
  telaLocal(): MediaStream | null {
    return this.tela
  }

  /**
   * `enabled = false` continua enviando a faixa, mas em silêncio — é o mudo
   * que todo app de call usa. Desligar a captura acenderia e apagaria o
   * indicador do navegador a cada clique, e obrigaria a renegociar.
   */
  alternarMicrofone(): boolean {
    this.mudo = !this.mudo
    for (const faixa of this.microfone?.getAudioTracks() ?? []) faixa.enabled = !this.mudo
    return this.mudo
  }

  desligarMicrofone(): void {
    if (!this.microfone) return
    this.despublicarInvolucros(this.micPara, [...this.micPara.keys()])
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
    stream: MediaStream | null, publicado: Map<string, MediaStream>, alvos: string[], tipo: string,
  ): void {
    const sobrando = [...publicado.keys()].filter((id) => !alvos.includes(id))
    if (sobrando.length > 0) this.despublicarInvolucros(publicado, sobrando)
    // Esquece mesmo sem stream: se ele voltar, precisa ser publicado de novo.
    for (const id of sobrando) publicado.delete(id)

    if (!stream) return
    // Só quem já está ATIVO. Em `room.mjs`, publicar para um peer que ainda
    // não terminou o handshake é descartado com um `console.warn` — e marcar
    // como feito ali era o que fazia a terceira e a quarta pessoa da call
    // nunca serem ouvidas: a publicação sumia e nunca era tentada de novo.
    // Quem ficar de fora é pego na sincronização seguinte.
    const ativos = this.peersAtivos()
    const faltando = alvos.filter((id) => !publicado.has(id) && ativos.has(id))
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
    // E o invólucro fica GUARDADO, porque remover também é pelo objeto desde
    // a 0.25 — ver `despublicarInvolucros`. O comentário que existia aqui
    // dizia o contrário, e estava certo na versão anterior.
    const involucro = new MediaStream(stream.getTracks())
    this.salas.publicarStream(involucro, faltando, { tipo })
    // Guardado POR PEER, e não uma vez só: publicações diferentes usam
    // invólucros diferentes, e quem despublica precisa saber qual foi o de
    // cada um. Ver `despublicarInvolucros`.
    for (const id of faltando) publicado.set(id, involucro)
  }

  /**
   * Despublica de cada peer exatamente o invólucro que ELE recebeu.
   *
   * O Trystero 0.25.3 embrulha todo peer num proxy que multiplexa várias salas
   * numa conexão só (`shared-peer.ts`). Esse proxy guarda o que foi publicado
   * num `Map` indexado pelo OBJETO do stream (`streamOwners`) — então
   * `removeStream` com qualquer outro objeto, ainda que com as mesmas faixas,
   * simplesmente não acha nada e retorna sem fazer nada.
   *
   * Isto mudou sem aviso: até a versão anterior a remoção casava os senders
   * pelas FAIXAS, e passar a captura original funcionava. Medido com duas abas
   * de verdade em 2026-08-26: depois de `removeStream(captura)`, o
   * `getSenders()` continuava com o sender no ar; a republicação seguinte
   * estourava `InvalidAccessError: a sender already exists for the track`
   * dentro de uma promessa que ninguém escuta, e o metadado já tinha sido
   * enviado. O receptor ficava com um metadado órfão na fila FIFO por peer, e
   * dali em diante toda mídia daquela pessoa chegava com o rótulo da anterior
   * — a última simplesmente sumia. Era o "ninguém se escuta" intermitente.
   */
  private despublicarInvolucros(
    publicado: Map<string, MediaStream>, ids: string[],
  ): void {
    // Agrupado por invólucro: um objeto pode ter ido para vários peers de uma
    // vez, e o `despublicarStream` aceita a lista inteira.
    const porInvolucro = new Map<MediaStream, string[]>()
    for (const id of ids) {
      const involucro = publicado.get(id)
      if (!involucro) continue
      const atual = porInvolucro.get(involucro)
      if (atual) atual.push(id)
      else porInvolucro.set(involucro, [id])
    }
    for (const [involucro, alvos] of porInvolucro) {
      this.salas.despublicarStream(involucro, alvos)
    }
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
    // A faixa de áudio da tela recebe dica PRÓPRIA: `music` diz ao codificador
    // para preservar a faixa de frequência inteira, em vez de otimizar para
    // voz como faria por padrão.
    for (const audio of this.tela.getAudioTracks()) audio.contentHint = 'music'
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
    // Antes de qualquer publicação: é esta lista que o ajuste adiado e o
    // `definirQualidade` consultam para saber quem quer a tela AGORA.
    this.assistindoAgora = new Set(alvos)
    const ativos = this.peersAtivos()
    const novos = alvos.filter((id) => !this.telaPara.has(id) && ativos.has(id))
    if (novos.length > 0) {
      const involucro = new MediaStream(this.tela.getTracks())
      this.salas.publicarStream(involucro, novos, { tipo: 'tela' })
      for (const id of novos) this.telaPara.set(id, involucro)
    }
    // Calculada uma vez, e não por espectador: a fonte é a mesma para todos.
    const alturaFonte = this.tela.getVideoTracks()[0]?.getSettings().height
    const comum = `${this.altura}|${this.conteudo}|${alturaFonte ?? ''}`

    for (const id of this.telaPara.keys()) {
      const ativo = alvos.includes(id)
      const desejado = `${ativo}|${comum}`
      // Quem acabou de ser publicado precisa esperar o sender existir; quem já
      // estava é imediato.
      if (novos.includes(id)) {
        setTimeout(() => {
          // Lido AGORA, e não capturado lá atrás: em 1500 ms a pessoa pode ter
          // desistido de assistir, e acender o codificador por um pedido já
          // retirado é o mesmo defeito que o `definirQualidade` tinha.
          const querAgora = this.assistindoAgora.has(id)
          if (this.ajustarEnvio(id, querAgora)) {
            this.envioAplicado.set(id, `${querAgora}|${comum}`)
          }
        }, MS_ATE_O_SENDER_EXISTIR)
        continue
      }
      if (this.envioAplicado.get(id) === desejado) continue
      if (this.ajustarEnvio(id, ativo)) this.envioAplicado.set(id, desejado)
    }
  }

  pararTela(): void {
    if (!this.tela) return
    this.despublicarInvolucros(this.telaPara, [...this.telaPara.keys()])
    this.telaPara.clear()
    this.envioAplicado.clear()
    this.assistindoAgora.clear()
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
  private ajustarEnvio(peerId: string, ativo: boolean): boolean {
    const pc = this.salas.donoDe(peerId)?.getPeers()[peerId]
    if (!pc) return false
    const h264 = this.codecH264()
    let aplicou = false

    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === 'audio') {
        // Só o áudio que veio junto da tela passa por aqui: o microfone é
        // publicado por outro caminho e não deve ganhar bitrate de música.
        if (!this.faixaDaTela(sender.track)) continue
        const params = sender.getParameters()
        const encoding = params.encodings?.[0]
        if (!encoding) continue
        encoding.active = ativo
        encoding.maxBitrate = BITRATE_AUDIO_TELA
        void sender.setParameters(params).catch(() => {})
        aplicou = true
        continue
      }
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      const encoding: EncodingComCodec | undefined = params.encodings?.[0]
      if (!encoding) continue
      encoding.active = ativo
      encoding.maxBitrate = BITRATE_POR_ALTURA[this.altura] ?? BITRATE_FALLBACK
      // Sob aperto de banda ou de CPU, o que sacrificar. O padrão do navegador
      // é `balanced`, que derruba a RESOLUÇÃO — e resolução derrubada numa
      // tela de texto é texto ilegível, que é a única coisa que não pode
      // acontecer aqui.
      //
      // Anda junto com o `contentHint`, e tem de andar: dizer "priorize
      // nitidez" e deixar o navegador escolher derrubar nitidez seriam duas
      // ordens contrárias. Quem escolheu `motion` está mostrando vídeo, e aí
      // é o inverso — perder quadro é pior que perder pixel.
      params.degradationPreference = this.conteudo === 'detail'
        ? 'maintain-resolution'
        : 'maintain-framerate'
      // A escala sai da altura REAL da captura, não de um 1080 presumido.
      // Numa tela 1440p ou 4K, presumir 1080 dava fator 1: mandava resolução
      // nativa com bitrate de tela pequena, e o resultado era exatamente o
      // "mesmo em 1080p não parece boa".
      const alturaFonte = this.tela?.getVideoTracks()[0]?.getSettings().height
      encoding.scaleResolutionDownBy = Math.max(1, (alturaFonte ?? this.altura) / this.altura)
      // (a leitura fica aqui de propósito: `ajustarEnvio` também é chamado
      // fora do laço de sincronização, e não pode depender do valor de lá)
      if (h264) encoding.codec = h264
      // Falhar aqui degrada a qualidade, não a conversa: um ajuste de
      // codificação nunca deve derrubar uma call que já está de pé.
      void sender.setParameters(params).catch(() => {})
      aplicou = true
    }

    return aplicou
  }

  /**
   * O H.264 do navegador, perguntado uma vez só.
   *
   * `RTCRtpSender` pode não existir (navegador antigo), e uma exceção aqui
   * derrubaria o compartilhamento inteiro por causa de um ajuste opcional.
   */
  private codecH264(): RTCRtpCodec | undefined {
    if (this.perguntouH264) return this.h264
    this.perguntouH264 = true
    this.h264 = typeof RTCRtpSender === 'undefined'
      ? undefined
      : escolherH264(RTCRtpSender.getCapabilities?.('video')?.codecs ?? [])
    return this.h264
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
    // `envioAplicado` guarda a altura junto do `ativo`, então limpar aqui faz
    // a reaplicação valer para todo mundo — e cada um com o `ativo` CERTO.
    //
    // A versão anterior passava `true` para todo peer já publicado, inclusive
    // quem tinha parado de assistir. O tique de 500 ms corrigia logo depois,
    // mas nessa janela o codificador voltava a trabalhar por quem não pediu
    // nada — que é exatamente o que a assinatura explícita existe para
    // impedir.
    this.envioAplicado.clear()
    for (const peerId of this.telaPara.keys()) {
      this.ajustarEnvio(peerId, this.assistindoAgora.has(peerId))
    }
  }

  /** Quem já completou o handshake — o mesmo critério que o Trystero usa. */
  private peersAtivos(): Set<string> {
    try {
      return new Set(this.salas.peers())
    } catch {
      return new Set()
    }
  }

  private faixaDaTela(faixa: MediaStreamTrack): boolean {
    return this.tela?.getTracks().includes(faixa) ?? false
  }

  aoReceberMidia(cb: (stream: MediaStream, de: string, meta?: unknown) => void): void {
    this.aoMidia.push(cb)
  }
}
