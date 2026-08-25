import {
  escolherMicrofone, escolherSaida, lembrarMicrofone, lembrarSaida,
  microfoneLembrado, microfones, motivoSemMicrofone, saidaLembrada, saidasDeAudio,
} from './dispositivos'
import type { Dispositivo } from './dispositivos'

/**
 * Quais aparelhos de áudio estão em uso, e por que o microfone não abriu.
 *
 * Estava espalhado pelo `main.ts` em quatro variáveis soltas e quatro funções
 * que se chamavam entre si. Junto, vira uma coisa só com nome — e passa a ser
 * testável com aparelhos de mentira, em vez de só através de uma sala montada.
 *
 * A classe **não desenha nada**. Quem chama decide quando redesenhar, e é por
 * isso que `reler` devolve uma promessa em vez de chamar a tela por dentro.
 */

/** Só o que esta peça precisa da `Midia`. */
export interface MidiaDeAparelhos {
  ligarMicrofone(): Promise<void>
  trocarMicrofone(deviceId: string): Promise<void>
  microfoneAtual(): string | null
}

/** Se este navegador sabe mandar áudio para uma saída específica. */
export type SabeTrocarSaida = () => boolean

export class AparelhosEmUso {
  private readonly midia: MidiaDeAparelhos
  private readonly sabeTrocarSaida: SabeTrocarSaida
  private readonly aoEscolherSaida: (deviceId: string) => void

  private entradas: Dispositivo[] = []
  private saidasDisponiveis: Dispositivo[] = []
  private saidaEscolhida: string | null = null
  private motivo: string | null = null

  constructor(
    midia: MidiaDeAparelhos,
    sabeTrocarSaida: SabeTrocarSaida,
    aoEscolherSaida: (deviceId: string) => void,
  ) {
    this.midia = midia
    this.sabeTrocarSaida = sabeTrocarSaida
    this.aoEscolherSaida = aoEscolherSaida
  }

  microfones(): Dispositivo[] {
    return this.entradas
  }

  saidas(): Dispositivo[] {
    return this.saidasDisponiveis
  }

  saidaAtual(): string | null {
    return this.saidaEscolhida
  }

  /** O motivo de o microfone não ter aberto, ou `null` se abriu. Preenchido
   *  significa que a pessoa está na call **só ouvindo**. */
  semMicrofone(): string | null {
    return this.motivo
  }

  /**
   * Abre o microfone, guardando o motivo se não der.
   *
   * **Nunca rejeita.** Quem chama segue o fluxo de qualquer jeito, porque
   * entrar na call sem microfone é um desfecho válido — o inválido era não
   * entrar e não dizer nada, que foi o defeito que isto veio consertar.
   */
  async abrir(): Promise<void> {
    try {
      await this.midia.ligarMicrofone()
      this.motivo = null
    } catch (erro: unknown) {
      this.motivo = motivoSemMicrofone(erro)
    }
  }

  /**
   * Relê a lista de aparelhos e escolhe os que devem estar em uso.
   *
   * Chamada ao entrar na call e sempre que o sistema avisa que algo mudou — um
   * fone plugado ou arrancado no meio da conversa deixaria a lista velha, e a
   * pessoa escolheria um aparelho que não existe mais.
   *
   * Os NOMES só aparecem depois da permissão concedida, então isto só rende de
   * verdade depois de entrar na call.
   */
  async reler(): Promise<void> {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices()
      this.entradas = microfones(lista)
      // Sem `setSinkId` a lista de saídas fica vazia de propósito: um seletor
      // que a pessoa mexe e não muda nada faz ela achar que o site quebrou.
      this.saidasDisponiveis = this.sabeTrocarSaida() ? saidasDeAudio(lista) : []
    } catch {
      this.entradas = []
      this.saidasDisponiveis = []
    }

    const saida = escolherSaida(this.saidasDisponiveis, this.saidaEscolhida ?? saidaLembrada())
    if (saida && saida !== this.saidaEscolhida) {
      this.saidaEscolhida = saida
      this.aoEscolherSaida(saida)
    }

    const microfone = escolherMicrofone(
      this.entradas, this.midia.microfoneAtual() ?? microfoneLembrado(),
    )
    if (microfone && microfone !== this.midia.microfoneAtual()) {
      await this.trocar(microfone)
    }
  }

  /** Troca o microfone por escolha da pessoa, e lembra a escolha. */
  async usarMicrofone(deviceId: string): Promise<void> {
    lembrarMicrofone(deviceId)
    await this.trocar(deviceId)
  }

  usarSaida(deviceId: string): void {
    this.saidaEscolhida = deviceId
    lembrarSaida(deviceId)
    this.aoEscolherSaida(deviceId)
  }

  /**
   * Sair da call: o motivo descrevia o estado "entrei sem microfone", que fora
   * da call não descreve mais nada — e ficaria pendurado na próxima entrada.
   */
  esquecerFalha(): void {
    this.motivo = null
  }

  /**
   * Trocar de microfone também abre um `getUserMedia`, e ele rejeita pelos
   * mesmos motivos do primeiro. Sem este `catch`, um fone arrancado no meio da
   * conversa deixava a interface parada em silêncio.
   */
  private async trocar(deviceId: string): Promise<void> {
    try {
      await this.midia.trocarMicrofone(deviceId)
      this.motivo = null
    } catch (erro: unknown) {
      this.motivo = motivoSemMicrofone(erro)
    }
  }
}
