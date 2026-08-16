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
    this.hostId = elegerHost(this.todosIds())
    this.ctx = criarContexto(this.hostId, this.rng())

    this.transporte.aoReceberAcao((acao, peerId) => {
      if (!this.souHost()) return
      this.ctx = aplicar(this.ctx, peerId, acao, Date.now(), this.rng())
      this.publicar()
    })

    this.transporte.aoReceberEstado((estado, peerId) => {
      if (this.souHost()) return
      if (peerId !== this.hostId) return
      this.ctx = { ...this.ctx, estado }
      this.notificar()
    })

    this.transporte.aoEntrarPeer(() => {
      this.reeleger()
      if (this.souHost()) this.publicar()
    })

    this.transporte.aoSairPeer((peerId) => {
      const eraHost = peerId === this.hostId
      this.reeleger()

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

  private reeleger(): void {
    this.hostId = elegerHost(this.todosIds())
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
    this.ctx.estado.hostAtual = this.hostId
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
