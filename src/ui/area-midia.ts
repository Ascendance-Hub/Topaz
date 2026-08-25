import { criarVideoRemoto, mostrarVideo } from './components/video-remoto'
import { chaveTela, chaveVoz } from './components/mixer'
import type { CanalAudio } from './components/mixer'
import { aplicarSaida, limparMidia, removerMidiaDe, soltarMidia } from './dom-midia'
import { ehTela } from '../call/classificar'

/**
 * A área de mídia da sala: os `<video>` das telas e os `<audio>` das vozes.
 *
 * Vive fora do palco que `renderizar` reconstrói, e é criada UMA vez — recriar
 * um elemento de mídia reinicia o fluxo, e a mesa é redesenhada a cada anúncio
 * do anfitrião (durante a compra do dealer, a cada 700 ms).
 *
 * Estava espalhada pelo `main.ts` em dois elementos soltos, dois mapas e seis
 * funções que se chamavam entre si. Junta, ela passa a ser testável com
 * streams de mentira em vez de só através de uma sala inteira montada.
 */

export interface DependenciasDaArea {
  apelidoDe: (peerId: string) => string
  /** A saída de áudio escolhida, ou `null` se não há escolha. */
  saidaAtual: () => string | null
  /** Passa a medir a voz desta pessoa (para o anel de quem fala). */
  aoOuvirVoz: (peerId: string, stream: MediaStream) => void
  /** Para de medir. Precisa acontecer junto com a remoção: um analisador
   *  esquecido é vazamento, e o anel ficaria aceso para sempre. */
  aoPerderVoz: (peerId: string) => void
}

export class AreaDeMidia {
  /** As telas dos outros, e a prévia da minha. */
  readonly videos = document.createElement('div')
  /** As vozes. Separado dos vídeos porque some e volta por regras diferentes. */
  readonly audios = document.createElement('div')

  private readonly dep: DependenciasDaArea
  /** Volume por canal, de 0 a 1. Ausente = 1, que é o padrão de mídia. */
  private readonly volumes = new Map<string, number>()
  private silenciouTodos = false

  constructor(dep: DependenciasDaArea) {
    this.dep = dep
    this.videos.className = 'call-videos'
    this.audios.className = 'call-audios'
  }

  /**
   * Mídia nova de alguém.
   *
   * A classificação sai das FAIXAS do stream, nunca do metadado: a fila que
   * pareia metadado e faixa no Trystero desalinha, e o rótulo passa a mentir —
   * era isso que fazia alguém sumir do áudio.
   */
  receber(stream: MediaStream, de: string, assistindo: boolean): void {
    if (ehTela(stream)) {
      // Sessão de compartilhamento nova: troca a caixa inteira, para não
      // ficar um quadro congelado da sessão anterior.
      removerMidiaDe(this.videos, de)
      const caixa = criarVideoRemoto(de, stream, this.dep.apelidoDe(de))
      this.videos.append(caixa)
      mostrarVideo(caixa, assistindo)
      this.aplicarSaidaNosNovos()
      return
    }

    // Um elemento por peer. Cada republicação (sair e voltar da call) traz um
    // stream novo, e sem trocar o elemento os antigos se acumulavam segurando
    // streams mortos.
    this.removerVozDe(de)
    const el = document.createElement('audio')
    el.autoplay = true
    el.dataset['de'] = de
    el.srcObject = stream
    el.muted = this.silenciouTodos
    // O navegador pode recusar tocar sem gesto do usuário. Entrar na call é um
    // clique, então quase sempre há permissão — mas engolir a rejeição faria a
    // call ficar muda sem nenhuma pista do motivo.
    void el.play().catch((erro: unknown) => {
      console.warn('áudio da call bloqueado pelo navegador:', erro)
    })
    this.audios.append(el)
    this.aplicarSaidaNosNovos()
    // Idempotente, e trocar o stream (sair e voltar da call) troca o
    // analisador junto — senão o anel dela nunca mais acenderia, porque o
    // stream antigo está morto.
    this.dep.aoOuvirVoz(de, stream)
  }

  /**
   * Deixa as telas visíveis conforme quem está sendo assistido.
   *
   * O elemento é ESCONDIDO, não removido, enquanto a pessoa continua
   * compartilhando: o stream chega uma vez por sessão, e depois disso assistir
   * e parar só ligam e desligam o codificador do outro lado. Removê-lo faria a
   * tela não voltar, porque não haveria stream novo para recriá-la.
   */
  ajustar(assistindo: string[], compartilhando: string[]): void {
    for (const caixa of this.videos.querySelectorAll<HTMLElement>('[data-de]')) {
      const de = caixa.dataset['de'] ?? ''
      if (!compartilhando.includes(de)) {
        removerMidiaDe(this.videos, de)
        continue
      }
      mostrarVideo(caixa, assistindo.includes(de) && !this.silenciouTodos)
    }
    for (const el of this.audios.querySelectorAll<HTMLAudioElement>('audio')) {
      el.muted = this.silenciouTodos
    }
  }

  /**
   * Aplica os volumes aos elementos que existem AGORA.
   *
   * Roda a cada desenho porque elementos aparecem e somem conforme a call
   * muda, e um volume ajustado antes precisa valer para o elemento novo.
   */
  aplicarVolumes(): void {
    for (const el of this.audios.querySelectorAll<HTMLAudioElement>('audio[data-de]')) {
      el.volume = this.volumeDe(chaveVoz(el.dataset['de'] ?? ''))
    }
    for (const caixa of this.videos.querySelectorAll<HTMLElement>('[data-de]')) {
      const video = caixa.querySelector('video')
      if (video) video.volume = this.volumeDe(chaveTela(caixa.dataset['de'] ?? ''))
    }
  }

  definirVolume(chave: string, volume: number): void {
    this.volumes.set(chave, volume)
    this.aplicarVolumes()
  }

  volumeDe(chave: string): number {
    return this.volumes.get(chave) ?? 1
  }

  /** Um canal de voz por pessoa na call, e um de tela por quem se assiste. */
  canais(naCall: string[], assistindo: string[]): CanalAudio[] {
    const vozes = naCall.map((peerId) => ({
      chave: chaveVoz(peerId),
      nome: this.dep.apelidoDe(peerId),
      volume: this.volumeDe(chaveVoz(peerId)),
    }))
    const telas = assistindo.map((peerId) => ({
      chave: chaveTela(peerId),
      nome: `Tela de ${this.dep.apelidoDe(peerId)}`,
      volume: this.volumeDe(chaveTela(peerId)),
    }))
    return [...vozes, ...telas]
  }

  alternarSilenciarTodos(): boolean {
    this.silenciouTodos = !this.silenciouTodos
    return this.silenciouTodos
  }

  silenciados(): boolean {
    return this.silenciouTodos
  }

  /**
   * A prévia da minha própria tela.
   *
   * Fica FORA do `[data-de]` de propósito: `ajustar` e `aplicarVolumes`
   * percorrem esse atributo pensando em telas de OUTRAS pessoas, e a minha
   * apareceria como se alguém estivesse compartilhando duas vezes.
   *
   * Sempre MUDA. O áudio do sistema que vai junto com a tela voltaria pela
   * minha própria caixa de som e realimentaria o microfone — microfonia, e das
   * ruins, porque quem a causa é justamente quem não ouve o resultado.
   */
  previaDaMinhaTela(tela: MediaStream | null): void {
    const atual = this.videos.querySelector<HTMLVideoElement>('.video-local')

    if (!tela) {
      if (atual) {
        soltarMidia(atual)
        atual.parentElement?.remove()
      }
      return
    }
    // Idempotente: com a mesma captura já na tela, não há o que fazer.
    if (atual?.srcObject === tela) return
    if (atual) atual.parentElement?.remove()

    const caixa = document.createElement('div')
    caixa.className = 'video-local-caixa'

    const rotulo = document.createElement('span')
    rotulo.className = 'video-nome'
    rotulo.textContent = 'Sua tela'

    const video = document.createElement('video')
    video.className = 'video-local'
    video.autoplay = true
    video.playsInline = true
    video.muted = true
    video.srcObject = tela
    void video.play().catch(() => {
      console.warn('a prévia da própria tela não começou a tocar')
    })

    caixa.append(video, rotulo)
    this.videos.append(caixa)
  }

  /** Tira a tela desta pessoa. */
  removerTelaDe(peerId: string): void {
    removerMidiaDe(this.videos, peerId)
  }

  /** Tira a voz desta pessoa, e para de medir junto. */
  removerVozDe(peerId: string): void {
    removerMidiaDe(this.audios, peerId)
    this.dep.aoPerderVoz(peerId)
  }

  /** Manda tudo que existe agora para a saída escolhida. */
  aplicarSaidaNosNovos(): void {
    const saida = this.dep.saidaAtual()
    if (!saida) return
    aplicarSaida(this.audios, saida)
    aplicarSaida(this.videos, saida)
  }

  /**
   * Sair da call: cala tudo de verdade.
   *
   * `limparMidia` também larga os `srcObject` — tirar da árvore sem soltar
   * deixava stream e decodificador vivos, e um `<video>` fora da árvore ainda
   * pode estar tocando o áudio da tela de alguém.
   */
  limpar(): void {
    limparMidia(this.videos)
    limparMidia(this.audios)
  }
}
