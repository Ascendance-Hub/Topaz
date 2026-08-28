import type { EstadoCall } from '../call/protocolo'
import { EU } from '../ui/components/participantes'

/** De quanto em quanto tempo a sala reconcilia tudo. */
export const MS_TIQUE = 500

export interface MidiaParaSincronizar {
  sincronizarMicrofone(alvos: string[]): void
  sincronizarTela(alvos: string[]): void
  microfoneLocal(): MediaStream | null
  telaLocal(): MediaStream | null
}

export interface AreaParaSincronizar {
  ajustar(assistindo: string[], compartilhando: string[], comigo: string[]): void
  previaDaMinhaTela(tela: MediaStream | null): void
}

export interface VozesParaSincronizar {
  observar(id: string, stream: MediaStream): void
  esquecer(id: string): void
  observando(): string[]
  tique(agora: number): void
  niveis(): { id: string; nivel: number; falando: boolean }[]
  encerrar(): void
}

export interface DependenciasDeSincronizacao {
  estadoCall(): EstadoCall
  midia: MidiaParaSincronizar
  area: AreaParaSincronizar
  vozes: VozesParaSincronizar
  /** O tique do jogo: prazos de turno e de reconexão, e a descoberta de host. */
  aoTique(agora: number): void
  /** Ritmo do medidor de voz. Dez vezes mais rápido que o da sala. */
  msAmostragemDeVoz: number
  /** `?diag=voz` na URL. Parâmetro em vez de leitura direta para o teste não
   *  precisar de navegador. */
  diagnosticoDeVoz?: boolean
}

export interface Sincronizacao {
  /**
   * Descreve o que deveria estar publicado AGORA — não o que mudou.
   *
   * Idempotente por construção, e é isso que a torna segura: chamar de novo
   * com o mesmo estado não faz nada, e chamar cedo demais não perde o pedido.
   *
   * A versão anterior detectava borda e marcava como feito mesmo quando a
   * publicação era descartada por a captura ainda não existir — e como as duas
   * pessoas clicam "Entrar na call" quase juntas, o caso comum era cada uma
   * receber o anúncio da outra durante a própria janela de permissão e nunca
   * mais tentar.
   */
  sincronizarMidia(): void
  encerrar(): void
}

/**
 * O pulso da sala.
 *
 * Um tique de meio segundo que faz três coisas que precisam do mesmo ritmo: o
 * anfitrião avalia prazos vencidos, o cliente resolve a descoberta e se
 * reanuncia, e a mídia reconcilia.
 *
 * **A mídia entra no mesmo ritmo porque é idempotente** e porque a publicação
 * para um peer que ainda não completou o handshake é descartada **em silêncio**
 * pelo Trystero: sem uma nova tentativa periódica, quem entrou na call enquanto
 * o par ainda se formava nunca seria ouvido. Quando está tudo em dia, a chamada
 * não faz nada.
 *
 * O medidor de voz tem ritmo próprio, dez vezes mais rápido: o anel precisa
 * acompanhar a fala, e meio segundo de atraso para acender seria pior que não
 * ter anel — e ainda assim é bem mais barato que medir a cada quadro.
 */
export function criarSincronizacao(dep: DependenciasDeSincronizacao): Sincronizacao {
  /**
   * Deixa o medidor observando exatamente quem está na call.
   *
   * Reconciliação, não detecção de borda — a mesma regra do resto da mídia.
   * Quem sai da call deixaria para trás um analisador pendurado num stream
   * morto: vazamento, e o anel dele congelado aceso.
   *
   * O meu microfone entra aqui porque ele NUNCA chega pelo caminho de mídia
   * recebida — sai daqui direto para a rede. Sem isto eu seria o único da roda
   * sem anel, que é justamente quem mais precisa dele: ver o próprio anel
   * acender é como a pessoa descobre que o microfone funciona sem perguntar
   * "tá me ouvindo?".
   */
  function sincronizarMedidorDeVoz(naCall: string[], euNaCall: boolean): void {
    const meu = dep.midia.microfoneLocal()
    if (euNaCall && meu) dep.vozes.observar(EU, meu)
    else dep.vozes.esquecer(EU)

    const devem = new Set(euNaCall ? naCall : [])
    for (const id of dep.vozes.observando()) {
      if (id !== EU && !devem.has(id)) dep.vozes.esquecer(id)
    }
  }

  function sincronizarMidia(): void {
    const atual = dep.estadoCall()
    // `comigo` e não `naCall`: o microfone vai só para quem está no MEU canal.
    // É esta linha que faz dois grupos conversarem na mesma sala sem se
    // atrapalhar — e ela sozinha, porque a conexão com todos continua de pé.
    dep.midia.sincronizarMicrofone(atual.comigo)
    // A assinatura vira efeito: sem espectador nenhum, a `Midia` despublica do
    // último e o codificador desliga — que é o ponto de todo o desenho.
    dep.midia.sincronizarTela(atual.assistidoPor)

    dep.area.ajustar(atual.assistindo, atual.compartilhando, atual.comigo)
    dep.area.previaDaMinhaTela(atual.euCompartilhando ? dep.midia.telaLocal() : null)
    sincronizarMedidorDeVoz(atual.comigo, atual.euNaCall)
  }

  const tique = setInterval(() => {
    dep.aoTique(Date.now())
    sincronizarMidia()
  }, MS_TIQUE)

  const tiqueVoz = setInterval(() => dep.vozes.tique(Date.now()), dep.msAmostragemDeVoz)

  /**
   * A sonda de voz, ligada por `?diag=voz` e desligada para todo mundo por
   * padrão.
   *
   * Existe porque os limiares nasceram estimados e só se acertam com voz real
   * — e porque "o anel não acende" tem três causas indistinguíveis a olho: o
   * áudio não chega ao analisador, o limiar está alto demais, ou o desenho não
   * atualiza. O número separa as três em dez segundos.
   *
   * Reporta o PICO desde a última linha, além do nível instantâneo: falar é
   * intermitente, e uma amostra tirada no meio de uma sílaba fechada mede
   * silêncio. É o pico que diz qual limiar serviria.
   */
  const tiquesDeDiagnostico: ReturnType<typeof setInterval>[] = []
  if (dep.diagnosticoDeVoz) {
    const picos = new Map<string, number>()
    tiquesDeDiagnostico.push(setInterval(() => {
      const lidos = dep.vozes.niveis()
      if (lidos.length === 0) {
        console.log('[voz] ninguém sendo medido — o microfone não chegou ao analisador')
        return
      }
      console.log('[voz] ' + lidos.map((l) => {
        const pico = Math.max(picos.get(l.id) ?? 0, l.nivel)
        picos.set(l.id, 0)
        return `${l.id}: agora=${l.nivel.toFixed(4)} pico=${pico.toFixed(4)}`
          + (l.falando ? ' FALANDO' : '')
      }).join('   '))
    }, 900))
    // Amostra mais fina que a linha impressa, senão o pico seria só uma
    // fotografia a cada 0,9 s — que é justamente o que perde a sílaba.
    tiquesDeDiagnostico.push(setInterval(() => {
      for (const l of dep.vozes.niveis()) {
        picos.set(l.id, Math.max(picos.get(l.id) ?? 0, l.nivel))
      }
    }, dep.msAmostragemDeVoz))
  }

  return {
    sincronizarMidia,
    encerrar: () => {
      // Trocar de sala desmonta esta e monta outra, e um intervalo esquecido
      // continua medindo um monitor morto — um por troca, para sempre.
      clearInterval(tique)
      clearInterval(tiqueVoz)
      for (const t of tiquesDeDiagnostico) clearInterval(t)
      dep.vozes.encerrar()
    },
  }
}
