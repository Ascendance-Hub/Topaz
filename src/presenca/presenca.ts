/**
 * Quem está online em cada sala que você salvou.
 *
 * A ideia parece cara — carregar todos os grupos salvos para ver quem está em
 * cada um —, e seria, não fosse o **modo passivo** do Trystero. Quem entra
 * passivo não anuncia e não pré-fabrica conexões: só escuta. E dois passivos
 * nunca se conectam (`signal-handler.mjs`: `if (ctx.isPassive &&
 * remoteIsPassive) return`).
 *
 * Disso saem três propriedades que fazem a conta fechar:
 *
 * - Um grupo em que ninguém está custa **zero conexões**. Só há conexão quando
 *   alguém de verdade abriu aquela sala.
 * - O tráfego de anúncio não multiplica pelo número de grupos salvos, porque
 *   passivo não anuncia.
 * - "Online no grupo X" passa a significar *está no grupo X* — mais honesto
 *   que "está no site, em algum lugar".
 *
 * O custo que sobra é assinatura em relay: cada sala de fundo assina os seus.
 * Por isso elas entram só no nostr e com menos relays, e por isso há um teto.
 * Presença é melhor-esforço; a sala em que a pessoa está não é. O relay foi a
 * peça que mais custou para funcionar neste projeto, e ela não pode ser
 * ameaçada por um enfeite.
 *
 * Este arquivo não conhece o Trystero: quem abre a sala chega por parâmetro.
 * É o que permite testar entrada, saída e reconciliação sem rede nenhuma.
 */

/** O mínimo que uma sala de fundo precisa oferecer. */
export interface SalaDeFundo {
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
  sair(): void
}

export interface Presenca {
  /** Quantas OUTRAS pessoas estão neste grupo agora. */
  quantos(codigo: string): number
  /** Acompanha a lista de grupos salvos: abre os novos, fecha os que saíram. */
  sincronizar(codigos: readonly string[]): void
  aoMudar(cb: () => void): void
  encerrar(): void
}

/**
 * Quantos grupos são observados ao mesmo tempo.
 *
 * Não é gosto: cada sala de fundo assina relays, e a lista de grupos salvos
 * vai até 24. Oito cobre com folga um grupo de amigos, que é para quem isto
 * existe.
 */
export const MAX_OBSERVADOS = 8

export function observarGrupos(
  codigos: readonly string[],
  abrir: (codigo: string) => SalaDeFundo,
): Presenca {
  /** código → sala aberta e quem foi visto lá. */
  const salas = new Map<string, { sala: SalaDeFundo; gente: Set<string> }>()
  const ouvintes: (() => void)[] = []
  let viva = true

  function avisar(): void {
    if (!viva) return
    for (const cb of [...ouvintes]) {
      try {
        cb()
      } catch (erro) {
        console.error('um ouvinte de presença estourou', erro)
      }
    }
  }

  function abrirUm(codigo: string): void {
    if (salas.has(codigo)) return
    const gente = new Set<string>()
    const sala = abrir(codigo)
    // Eu não entro nesta conta. Sou passivo lá, o que quer dizer que não estou
    // lá — e "3 online" precisa significar três OUTRAS pessoas, senão todo
    // grupo salvo pareceria ocupado.
    sala.aoEntrarPeer((peerId) => {
      // `Set` já deduplica, mas o aviso não pode sair sem mudança: o Trystero
      // reanuncia, e redesenhar a tela inicial a cada reanúncio seria piscar
      // de graça.
      if (gente.has(peerId)) return
      gente.add(peerId)
      avisar()
    })
    sala.aoSairPeer((peerId) => {
      if (!gente.delete(peerId)) return
      avisar()
    })
    salas.set(codigo, { sala, gente })
  }

  function sincronizar(novos: readonly string[]): void {
    if (!viva) return
    const querer = novos.slice(0, MAX_OBSERVADOS)
    // Sem silêncio sobre o que ficou de fora: um teto invisível faria a pessoa
    // achar que o grupo está vazio quando ele só não está sendo olhado.
    if (novos.length > MAX_OBSERVADOS) {
      console.info(
        `presença: observando ${MAX_OBSERVADOS} de ${novos.length} grupos salvos;`
        + ` fora: ${novos.slice(MAX_OBSERVADOS).join(', ')}`,
      )
    }

    for (const [codigo, aberta] of [...salas]) {
      if (querer.includes(codigo)) continue
      aberta.sala.sair()
      salas.delete(codigo)
    }
    // Quem continua NÃO é reaberto: reabrir custa handshake e zeraria a
    // contagem por um instante, fazendo a tela piscar sem motivo.
    for (const codigo of querer) abrirUm(codigo)
  }

  sincronizar(codigos)

  return {
    quantos: (codigo) => salas.get(codigo)?.gente.size ?? 0,
    sincronizar,
    aoMudar: (cb) => { ouvintes.push(cb) },
    encerrar: () => {
      viva = false
      for (const { sala } of salas.values()) sala.sair()
      salas.clear()
    },
  }
}
