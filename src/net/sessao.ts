import { aplicar, avancar, cartasVisiveis, criarContexto } from '../game/machine'
import type { Contexto } from '../game/machine'
import { reconstruirSapata } from '../game/shoe'
import { REGRAS } from '../game/rules'
import type { Acao, EstadoJogo, Rng } from '../game/types'
import type { Transporte } from './transport'

/** Determinística: todo cliente com a mesma lista chega ao mesmo host. */
export function elegerHost(ids: string[]): string {
  return [...ids].sort()[0]!
}

export class Sessao {
  private ctx: Contexto
  private hostId: string
  private ouvintes: (() => void)[] = []

  constructor(
    private transporte: Transporte,
    private rng: () => Rng,
  ) {
    // Sozinho na sala, eu sou o host. Entrando numa sala que já existe, não
    // presumo nada: fico com o sentinela '' ("ainda não sei quem manda") até
    // que o primeiro snapshot de alguém se declarando host me diga quem é.
    // A entrada de um peer NUNCA reelege — só a saída do host muda quem
    // manda — senão um terceiro amigo com id menor derrubaria a mesa real
    // e assumiria com um Contexto vazio.
    this.hostId = this.transporte.peers().length === 0 ? this.transporte.meuId() : ''
    this.ctx = criarContexto(this.hostId, this.rng())

    this.transporte.aoReceberAcao((acao, peerId) => {
      if (!this.souHost()) return
      this.ctx = aplicar(this.ctx, peerId, acao, Date.now(), this.rng())
      this.publicar()
    })

    this.transporte.aoReceberEstado((estado, peerId) => {
      if (this.souHost()) return
      // O remetente precisa se declarar host no próprio payload — não
      // decidimos por um id em cache, porque numa saída com 3+ peers um
      // sobrevivente pode publicar antes que eu tenha processado a saída
      // do host antigo. Aceitamos se for o host que eu já conhecia, ou se
      // o host que eu conhecia já sumiu da lista (inclusive quando eu
      // ainda não conheço ninguém: o sentinela '' nunca aparece em
      // todosIds(), então essa condição também cobre o primeiro snapshot).
      if (estado.hostAtual !== peerId) return
      const hostConhecidoSumiu = !this.todosIds().includes(this.hostId)
      if (peerId !== this.hostId && !hostConhecidoSumiu) return
      this.hostId = peerId
      this.ctx = { ...this.ctx, estado }
      this.notificar()
    })

    this.transporte.aoEntrarPeer(() => {
      // Só atualiza o recém-chegado; nunca reelege. É esse snapshot que
      // ensina ao recém-chegado quem é o host.
      if (this.souHost()) this.publicar()
    })

    this.transporte.aoSairPeer((peerId) => {
      const eraHost = peerId === this.hostId
      // Só reelege se o host que eu conhecia de fato sumiu da lista — a
      // saída de qualquer outro peer não deve mexer em quem manda.
      if (!this.todosIds().includes(this.hostId)) {
        this.hostId = elegerHost(this.todosIds())
      }

      if (this.souHost()) {
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

  private publicar(): void {
    // Declara o próprio id, não o `hostId` em cache — é essa autodeclaração
    // que um cliente usa para aceitar (ou não) o snapshot.
    this.ctx.estado.hostAtual = this.transporte.meuId()
    this.transporte.enviarEstado(this.ctx.estado)
    this.notificar()
  }

  private notificar(): void {
    for (const cb of this.ouvintes) cb()
  }

  souHost(): boolean {
    return this.hostId === this.transporte.meuId()
  }

  estado(): EstadoJogo {
    return this.ctx.estado
  }

  meuId(): string {
    return this.transporte.meuId()
  }

  aoMudar(cb: () => void): void {
    this.ouvintes.push(cb)
  }

  entrar(apelido: string): void {
    this.despachar({ tipo: 'entrar', apelido })
  }

  /** Cliente envia intenção; host aplica localmente e transmite. */
  despachar(acao: Acao): void {
    if (this.souHost()) {
      this.ctx = aplicar(this.ctx, this.transporte.meuId(), acao, Date.now(), this.rng())
      this.publicar()
    } else {
      this.transporte.enviarAcao(acao)
    }
  }

  /** Chamado em intervalo curto pela UI; só o host faz efeito. */
  tique(agora: number): void {
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
