import { exportarPublica } from './chaves'
import { conferir, criarDesafio, responder } from './prova'
import { criarEmissor } from '../net/avisar'

/**
 * A troca de identidade entre duas pessoas que acabaram de se conectar.
 *
 * Duas mensagens, e o fluxo termina sozinho:
 *
 * 1. **`ola`** — assim que alguém aparece, mando minha chave pública e um
 *    desafio novo, sorteado agora.
 * 2. **`prova`** — quem recebe um `ola` devolve a assinatura daquele desafio.
 *
 * Como os dois lados mandam `ola` ao se verem, os dois acabam provando. E como
 * `prova` não carrega desafio, ela não gera resposta — não há ping-pong.
 *
 * O desafio é guardado POR PESSOA. Um desafio único para todos deixaria a
 * prova dada por um servir para outro se passar por ele.
 */

interface CanalIdentidade {
  enviarIdentidade(mensagem: unknown, para?: string): void
  aoReceberIdentidade(cb: (mensagem: unknown, peerId: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
}

interface Pendente {
  /** O desafio que EU sorteei para esta pessoa. */
  meuDesafio: string
  /** Já respondi ao desafio dela? Evita responder duas vezes ao mesmo `ola`. */
  respondi: boolean
  selo?: string
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * Dispara trabalho assíncrono a partir de um tratador que não pode esperar.
 *
 * `void promessa` engoliria a falha em silêncio — e "não aconteceu nada, sem
 * erro nenhum" é a classe de defeito que mais custou tempo neste projeto.
 */
function solta(promessa: Promise<void>, oQue: string): void {
  promessa.catch((erro: unknown) => {
    console.warn(`identidade: ${oQue} falhou`, erro)
  })
}

export class Apresentacao {
  private readonly canal: CanalIdentidade
  private readonly par: CryptoKeyPair
  private readonly sala: string
  private readonly porPeer = new Map<string, Pendente>()
  /**
   * Quem quer saber que alguém provou a identidade.
   *
   * Era um `for` cru sobre a lista viva: um ouvinte que estourasse impedia
   * todos os seguintes de saberem — a forma do defeito do Capítulo 9. Hoje há
   * um consumidor só; amigos põe outro, porque é aqui que mora o *quem*.
   */
  private readonly aoVerificado = criarEmissor<[peerId: string, selo: string]>()

  constructor(canal: CanalIdentidade, par: CryptoKeyPair, sala: string) {
    this.canal = canal
    this.par = par
    this.sala = sala

    canal.aoEntrarPeer((peerId) => solta(this.cumprimentar(peerId), 'cumprimentar'))
    canal.aoReceberIdentidade(
      (mensagem, peerId) => solta(this.receber(mensagem, peerId), 'receber'),
    )
    canal.aoSairPeer((peerId) => {
      // O selo não sobrevive à saída: o `peerId` é da conexão, não da pessoa, e
      // quem entrar depois com o mesmo id herdaria uma verificação que não fez.
      this.porPeer.delete(peerId)
    })
  }

  aoVerificar(cb: (peerId: string, selo: string) => void): void {
    this.aoVerificado.ouvir(cb)
  }

  /** O selo já PROVADO desta pessoa, ou `undefined` enquanto não provou. */
  seloDe(peerId: string): string | undefined {
    return this.porPeer.get(peerId)?.selo
  }

  private async cumprimentar(peerId: string): Promise<void> {
    const meuDesafio = criarDesafio()
    this.porPeer.set(peerId, { meuDesafio, respondi: false })
    this.canal.enviarIdentidade({
      tipo: 'ola',
      publica: await exportarPublica(this.par.publicKey),
      desafio: meuDesafio,
    }, peerId)
  }

  private async receber(mensagem: unknown, peerId: string): Promise<void> {
    if (!ehObjeto(mensagem)) return
    const estado = this.porPeer.get(peerId)
    // Chegou de quem já saiu, ou antes de o `onPeerJoin` correr. Sem estado
    // não há desafio meu para conferir contra, e responder às cegas seria
    // assinar o que qualquer um mandar.
    if (!estado) return

    if (mensagem['tipo'] === 'ola') {
      if (estado.respondi) return
      if (typeof mensagem['desafio'] !== 'string') return
      estado.respondi = true
      this.canal.enviarIdentidade({
        tipo: 'prova',
        publica: await exportarPublica(this.par.publicKey),
        assinatura: await responder(this.par.privateKey, mensagem['desafio'], this.sala),
      }, peerId)
      return
    }

    if (mensagem['tipo'] === 'prova') {
      if (estado.selo) return
      const selo = await conferir(
        mensagem['publica'], estado.meuDesafio, this.sala, mensagem['assinatura'],
      )
      // Prova que não fecha é simplesmente ignorada: a pessoa continua na sala
      // sem selo, que é exatamente o que "não verificado" quer dizer.
      if (!selo) return
      estado.selo = selo
      this.aoVerificado.avisar(peerId, selo)
    }
  }
}
