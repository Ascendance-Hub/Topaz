import { aplicar, avancar, cartasVisiveis, criarContexto } from '../game/machine'
import type { Contexto } from '../game/machine'
import { reconstruirSapata } from '../game/shoe'
import { REGRAS } from '../game/rules'
import type { Acao, EstadoJogo, Rng } from '../game/types'
import type { Transporte } from './transport'
import { ehEstadoPlausivel } from './validar'
import { criarEmissor } from './avisar'

/**
 * Quanto tempo esperamos, depois de entrar na sala (ou de ver um peer novo),
 * antes de concluir que ninguém está mandando e reivindicar o posto.
 *
 * Existe porque `peers()` é sempre uma foto incompleta logo após entrar: o
 * `joinRoom` do Trystero volta na hora e a lista só se preenche segundos
 * depois. Decidir na hora fazia *todo* navegador se declarar host e a sala
 * nunca virar multijogador.
 */
export const MS_DESCOBERTA = 2500

/**
 * Passado esse tempo sem descobrir host nenhum, a conexão é dada como falha
 * — relay fora do ar, WebRTC bloqueado, rede restritiva. Spec §14 pede
 * mensagem clara em vez de tela travada.
 */
export const MS_SEM_CONEXAO = 15000

/**
 * De quanto em quanto tempo um cliente que não se vê na mesa do anfitrião
 * volta a se anunciar.
 *
 * `enviarAcao` só alcança quem já está conectado, e o Trystero descarta em
 * silêncio o envio a um peer que ainda não terminou o handshake. Um `entrar`
 * despachado nessa janela some sem deixar rastro, e o jogador fica invisível
 * para todo mundo enquanto conversa normalmente na call — foi o relato.
 *
 * Espaçado o bastante para não virar tráfego constante, e curto o bastante
 * para a pessoa não ficar minutos sem aparecer.
 */
const MS_REANUNCIO = 3000

export type StatusConexao = 'conectando' | 'conectado' | 'sem-conexao'

/** Determinística: todo cliente com a mesma lista chega ao mesmo host. */
export function elegerHost(ids: string[]): string {
  return [...ids].sort()[0]!
}

/**
 * Ordem determinística entre duas mesas em conflito — dois navegadores que
 * se declararam host e só agora se enxergaram. Vence a que tem mais jogo de
 * verdade: rodada mais alta, depois mais jogadores, e por fim o menor peerId
 * como desempate. Os dois lados avaliam o mesmo par de snapshots e chegam à
 * mesma resposta, então um demite a si mesmo e adota a mesa do outro.
 *
 * É a rede de segurança que impede que uma divisão vire permanente, mesmo se
 * a janela de descoberta falhar por qualquer motivo.
 */
export function mesaPrevalece(
  estadoA: EstadoJogo, idA: string, estadoB: EstadoJogo, idB: string,
): boolean {
  if (estadoA.rodada !== estadoB.rodada) return estadoA.rodada > estadoB.rodada
  if (estadoA.jogadores.length !== estadoB.jogadores.length) {
    return estadoA.jogadores.length > estadoB.jogadores.length
  }
  return idA < idB
}

export class Sessao {
  private ctx: Contexto
  /** `null` = ainda não sei quem manda. Nunca colide com um peerId real. */
  private hostId: string | null = null
  private readonly ouvintes = criarEmissor<[]>()
  /** Ações despachadas antes de haver host: guardadas para não se perderem. */
  private pendentes: Acao[] = []
  /** Apelido com que eu entrei; `null` = ainda não me apresentei. */
  private meuApelido: string | null = null
  private ultimoReanuncio = 0
  private inicioSessao: number
  private inicioDescoberta: number
  private status: StatusConexao = 'conectando'

  constructor(
    private transporte: Transporte,
    private rng: () => Rng,
  ) {
    // Ninguém nasce host. `peers()` no construtor é sempre uma foto vazia no
    // navegador (o handshake ainda não aconteceu), então qualquer decisão
    // tirada dela declararia host quem só está sozinho *ainda*.
    //
    // Enquanto o host é desconhecido: adotamos o primeiro snapshot de quem se
    // declarar host; e, se a janela de descoberta vencer sem nenhum, aí sim
    // calculamos a eleição sobre a lista de peers já preenchida. A entrada de
    // um peer NUNCA reelege depois disso — só a saída do host muda quem
    // manda — senão um terceiro amigo com id menor derrubaria a mesa real e
    // assumiria com um Contexto vazio.
    this.inicioSessao = Date.now()
    this.inicioDescoberta = this.inicioSessao
    this.ctx = criarContexto('', this.rng())

    this.transporte.aoReceberAcao((acao, peerId) => {
      if (!this.souHost()) return
      this.ctx = aplicar(this.ctx, peerId, acao, Date.now(), this.rng())
      this.publicar()
    })

    this.transporte.aoReceberEstado((estado, peerId) => {
      // Antes de qualquer regra sobre QUEM mandou, uma sobre O QUE chegou. O
      // tipo aqui é uma promessa do TypeScript, não um fato: do outro lado
      // pode estar um cliente modificado, ou uma versão antiga do site. Um
      // campo com o tipo errado lança no meio do desenho e apaga a página de
      // quem recebeu — um peer não pode ter esse poder sobre os outros.
      if (!ehEstadoPlausivel(estado)) return

      // O remetente precisa se declarar host no próprio payload — não
      // decidimos por um id em cache, porque numa saída com 3+ peers um
      // sobrevivente pode publicar antes que eu tenha processado a saída
      // do host antigo.
      if (estado.hostAtual !== peerId) return

      if (this.souHost()) {
        // Dois hosts se encontraram. Resolver em vez de ignorar: ignorar é
        // o que tornava a divisão permanente, com cada lado jogando sozinho.
        if (mesaPrevalece(this.ctx.estado, this.transporte.meuId(), estado, peerId)) {
          // Minha mesa fica: reafirmo para o outro lado adotar e se demitir.
          this.publicar()
        } else {
          this.adotar(estado, peerId)
        }
        return
      }

      // Aceitamos se for o host que eu já conhecia, se o host que eu conhecia
      // já sumiu da lista, ou se eu ainda não conhecia ninguém.
      const hostConhecidoSumiu =
        this.hostId === null || !this.todosIds().includes(this.hostId)

      // E aceitamos também quando a mesa que chega vence a que eu carrego,
      // pela MESMA ordem que os hosts usam entre si. Sem isto, um cliente
      // fica órfão em silêncio: o host dele pode ter perdido um conflito e
      // se demitido continuando na sala, então nem sumiu da lista (para
      // reeleger) nem manda mais em nada — os snapshots do host novo eram
      // recusados e as ações do cliente caíam no vazio, com a mesa
      // congelada e os botões mortos. Reusar `mesaPrevalece` (antissimétrica)
      // garante que cliente e host nunca discordem sobre quem venceu.
      const outraMesaVence =
        this.hostId !== null && peerId !== this.hostId &&
        mesaPrevalece(estado, peerId, this.ctx.estado, this.hostId)

      if (peerId !== this.hostId && !hostConhecidoSumiu && !outraMesaVence) return
      this.adotar(estado, peerId)
    })

    this.transporte.aoEntrarPeer(() => {
      // Só atualiza o recém-chegado; nunca reelege. É esse snapshot que
      // ensina ao recém-chegado quem é o host.
      if (this.souHost()) {
        this.publicar()
        return
      }
      // Ainda não sei quem manda: cada peer que aparece reabre a janela, para
      // que a eleição nunca rode sobre uma lista pela metade.
      if (this.hostId === null) this.inicioDescoberta = Date.now()
    })

    this.transporte.aoSairPeer((peerId) => {
      // Ainda em descoberta: quem decide é a janela, não a saída. A eleição
      // do próximo tique já vai enxergar a lista sem quem saiu.
      if (this.hostId === null) return

      const eraHost = peerId === this.hostId
      // Só reelege se o host que eu conhecia de fato sumiu da lista — a
      // saída de qualquer outro peer não deve mexer em quem manda.
      if (!this.todosIds().includes(this.hostId)) {
        this.hostId = elegerHost(this.todosIds())
      }

      if (this.souHost()) {
        this.status = 'conectado'
        // Marca como ausente em vez de remover: cadeira e fichas ficam
        // reservadas durante a janela de reconexão.
        const caiu = this.ctx.estado.jogadores.find((j) => j.peerId === peerId)
        if (caiu) caiu.desconectadoEm = Date.now()
        this.ctx.estado.hostAtual = this.hostId
        if (eraHost) this.assumirSapata()
        this.publicar()
      }
    })
  }

  /** Remove quem passou da janela de reconexão. Só o host executa. */
  private purgarAusentes(agora: number): boolean {
    const limite = REGRAS.segundosReconexao * 1000
    const antes = this.ctx.estado.jogadores.length
    this.ctx.estado.jogadores = this.ctx.estado.jogadores.filter(
      (j) => j.desconectadoEm === null || agora - j.desconectadoEm < limite,
    )
    return this.ctx.estado.jogadores.length !== antes
  }

  private todosIds(): string[] {
    return [this.transporte.meuId(), ...this.transporte.peers()]
  }

  /**
   * Assumindo o posto: o host anterior levou a sapata embora.
   * Reconstruímos descontando as cartas visíveis. A carta oculta do dealer
   * nunca foi transmitida, então compramos uma nova — ninguém a viu.
   */
  private assumirSapata(): void {
    const vistas = cartasVisiveis(this.ctx.estado)
    const sapata = reconstruirSapata(REGRAS.numBaralhos, vistas, this.rng())
    this.ctx.sapata = sapata
    this.ctx.ocultaDealer = this.ctx.estado.dealerTemOculta
      ? (sapata.pop() ?? null)
      : null
    this.ctx.estado.cartasRestantes = this.ctx.sapata.length
  }

  /** Passo a ser cliente de `peerId`, adotando a mesa dele. */
  private adotar(estado: EstadoJogo, peerId: string): void {
    const eu = this.transporte.meuId()
    const meuAntigo = this.ctx.estado.jogadores.find((j) => j.peerId === eu)

    this.hostId = peerId
    this.ctx = { ...this.ctx, estado }
    this.status = 'conectado'

    // Ao adotar outra mesa (fim de um split-brain) eu posso simplesmente não
    // existir nela. Reanuncio o apelido para não sumir da partida.
    if (meuAntigo && !estado.jogadores.some((j) => j.peerId === eu)) {
      this.pendentes.push({ tipo: 'entrar', apelido: meuAntigo.apelido })
    }

    this.escoarPendentes()
    this.notificar()
  }

  /** Ninguém apareceu dentro da janela e a eleição caiu em mim. */
  private assumirPosto(): void {
    this.hostId = this.transporte.meuId()
    this.status = 'conectado'
    this.escoarPendentes()
    this.publicar()
  }

  /** Reenvia (ou aplica) o que ficou na fila enquanto não havia host. */
  private escoarPendentes(): void {
    const fila = this.pendentes
    this.pendentes = []
    for (const acao of fila) this.despachar(acao)
  }

  private publicar(): void {
    // Declara o próprio id, não o `hostId` em cache — é essa autodeclaração
    // que um cliente usa para aceitar (ou não) o snapshot.
    this.ctx.estado.hostAtual = this.transporte.meuId()
    this.transporte.enviarEstado(this.ctx.estado)
    this.notificar()
  }

  private notificar(): void {
    this.ouvintes.avisar()
  }

  souHost(): boolean {
    return this.hostId !== null && this.hostId === this.transporte.meuId()
  }

  /** `conectando` enquanto o host é desconhecido; `sem-conexao` quando isso
   *  se arrasta muito além da janela de descoberta. */
  statusConexao(): StatusConexao {
    return this.status
  }

  estado(): EstadoJogo {
    return this.ctx.estado
  }

  meuId(): string {
    return this.transporte.meuId()
  }

  aoMudar(cb: () => void): void {
    this.ouvintes.ouvir(cb)
  }

  entrar(apelido: string): void {
    this.meuApelido = apelido
    this.despachar({ tipo: 'entrar', apelido })
  }

  /**
   * Se eu me apresentei mas não estou na mesa que o anfitrião publica, meu
   * `entrar` se perdeu no caminho. Me reanuncio.
   *
   * A ação `entrar` é idempotente por construção — sobre um jogador que já
   * existe ela só atualiza o apelido —, então repetir não tem efeito colateral
   * nenhum. Quem nunca se apresentou não entra aqui: abrir o link não pode
   * transformar ninguém em jogador.
   */
  private repararPresenca(agora: number): void {
    if (this.meuApelido === null || this.souHost() || this.hostId === null) return
    if (agora - this.ultimoReanuncio < MS_REANUNCIO) return

    const eu = this.transporte.meuId()
    if (this.ctx.estado.jogadores.some((j) => j.peerId === eu)) return

    this.ultimoReanuncio = agora
    this.despachar({ tipo: 'entrar', apelido: this.meuApelido })
  }

  /** Cliente envia intenção; host aplica localmente e transmite. */
  despachar(acao: Acao): void {
    if (this.hostId === null) {
      // Sem host, não há para quem enviar nem quem aplique: a intenção fica
      // guardada e sai assim que a sala resolver quem manda. Sem isto, o
      // `entrar` disparado na abertura da partida se perderia no vazio e o
      // jogador nunca apareceria na mesa.
      this.pendentes.push(acao)
      return
    }
    if (this.souHost()) {
      this.ctx = aplicar(this.ctx, this.transporte.meuId(), acao, Date.now(), this.rng())
      this.publicar()
    } else {
      this.transporte.enviarAcao(acao)
    }
  }

  /**
   * A janela de descoberta é dirigida pelo relógio que chega aqui — não há
   * `setTimeout` interno, para que o teste controle o tempo do mesmo jeito
   * que já controla prazos de turno e de reconexão.
   */
  private avaliarDescoberta(agora: number): void {
    if (this.hostId !== null) return

    if (agora - this.inicioDescoberta >= MS_DESCOBERTA) {
      // Ninguém se declarou host dentro da janela: agora a lista de peers já
      // está formada e a eleição vale. Se não for eu, continuo esperando — o
      // host de verdade vai publicar.
      if (elegerHost(this.todosIds()) === this.transporte.meuId()) {
        this.assumirPosto()
        return
      }
    }

    const novo: StatusConexao =
      agora - this.inicioSessao >= MS_SEM_CONEXAO ? 'sem-conexao' : 'conectando'
    if (novo !== this.status) {
      this.status = novo
      this.notificar()
    }
  }

  /** Chamado em intervalo curto pela UI; resolve a descoberta de host e, no
   *  host, os prazos vencidos. */
  tique(agora: number): void {
    this.avaliarDescoberta(agora)
    this.repararPresenca(agora)
    if (!this.souHost()) return
    const antes = JSON.stringify(this.ctx.estado)
    const purgou = this.purgarAusentes(agora)
    this.ctx = avancar(this.ctx, agora, this.rng())
    if (purgou || JSON.stringify(this.ctx.estado) !== antes) this.publicar()
  }

  encerrar(): void {
    this.transporte.sair()
  }
}
