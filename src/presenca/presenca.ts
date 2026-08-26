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
  sair(): void | Promise<void>
}

export interface Presenca {
  /** Quantas OUTRAS pessoas estão neste grupo agora. */
  quantos(codigo: string): number
  /** Acompanha a lista de grupos salvos: abre os novos, fecha os que saíram. */
  sincronizar(codigos: readonly string[]): void
  /**
   * Fecha a observação de UM grupo, e espera terminar.
   *
   * Chamado antes de entrar nesse grupo de verdade. O Trystero devolve a
   * MESMA sala quando se entra num id já aberto (`strategy.mjs:79`), e o
   * `leave` dele só desregistra depois de um envio e mais 99ms. Sem esperar,
   * a sala "nova" seria a passiva — que não anuncia, e a pessoa entraria sem
   * ninguém a ver.
   *
   * UM grupo, e não todos: enquanto as outras salas continuam registradas, a
   * piscina de relays do Trystero sobrevive. Esperar TUDO foi o que fez a
   * troca de sala ficar lenta e falhar — `hasActiveRooms()` virava falso e ele
   * destruía as vinte conexões de relay e as vinte ofertas pré-fabricadas.
   */
  fecharUm(codigo: string): Promise<void>
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

/**
 * Quanto esperar entre abrir a sala de fundo de um grupo e a do seguinte.
 *
 * Abrir todas de uma vez põe presença competindo com o que importa. Cada
 * grupo são três salas (nostr, mqtt, torrent), e o Trystero assina tópicos e
 * pré-fabrica conexões ao entrar em cada uma — tudo no mesmo momento em que a
 * sala de verdade está tentando conectar.
 *
 * Presença é melhor-esforço e ninguém repara se ela chega alguns segundos
 * depois. Ficar sozinho numa sala porque a máquina estava ocupada procurando
 * gente noutro grupo, isso repara.
 */
export const PAUSA_ENTRE_SALAS_MS = 900

export function observarGrupos(
  codigos: readonly string[],
  abrir: (codigo: string) => SalaDeFundo,
  /** Zero nos testes: eles medem a lógica, não a espera. */
  pausaMs = 0,
): Presenca {
  /** código → sala aberta e quem foi visto lá. */
  const salas = new Map<string, { sala: SalaDeFundo; gente: Set<string> }>()
  const ouvintes: (() => void)[] = []
  /** Aberturas ainda na fila, para o encerramento poder cancelá-las. */
  const pendentes = new Set<ReturnType<typeof setTimeout>>()
  /** Salas agendadas mas ainda não abertas, para não agendar duas vezes. */
  const agendadas = new Set<string>()
  let ultimaLista: string[] = []
  let viva = true

  function avisar(): void {
    if (!viva) return
    relatar('mudou')
    for (const cb of [...ouvintes]) {
      try {
        cb()
      } catch (erro) {
        console.error('um ouvinte de presença estourou', erro)
      }
    }
  }

  /**
   * O retrato do que a presença está fazendo.
   *
   * A primeira versão deste diagnóstico só falava quando alguém entrava ou
   * saía — então "não vi nada no console" não distinguia "não achou ninguém"
   * de "nem abriu sala nenhuma". Um instrumento que não separa as duas coisas
   * não vale a viagem, e é a segunda vez que erro isso.
   *
   * Agora ele diz sempre: quantas salas, quais, e quanta gente em cada.
   */
  function relatar(porque: string): void {
    const retrato = salas.size === 0
      ? 'NENHUMA sala de fundo aberta'
      : [...salas].map(([c, s]) => `${c}=${s.gente.size}`).join(' ')
    console.info(`presença (${porque}): ${retrato}`)
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
    ultimaLista = [...querer]
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
    // Uma de cada vez, espaçadas. Abrir todas juntas era competir com a sala
    // de verdade — três salas por grupo, todas assinando tópicos no mesmo
    // instante em que a conexão que importa está se formando.
    let ordem = 0
    for (const codigo of querer) {
      if (salas.has(codigo) || agendadas.has(codigo)) continue
      if (pausaMs === 0) {
        abrirUm(codigo)
        continue
      }
      agendadas.add(codigo)
      const quando = setTimeout(() => {
        agendadas.delete(codigo)
        pendentes.delete(quando)
        // A lista pode ter mudado — ou a presença ter sido encerrada — no
        // tempo em que esta abertura esperou a vez.
        if (!viva || !ultimaLista.includes(codigo)) return
        abrirUm(codigo)
        // `ordem + 1`, e não `ordem`: até a PRIMEIRA sala espera. Voltar para
        // a tela inicial recria a presença enquanto a sala que se acabou de
        // deixar ainda está saindo do registro do Trystero — abrir na hora
        // devolveria aquela sala em vez de uma passiva.
      }, (ordem + 1) * pausaMs)
      pendentes.add(quando)
      ordem += 1
    }
    relatar(`observando ${querer.length} de ${novos.length} grupos salvos`)
  }

  sincronizar(codigos)

  // Um retrato periódico: sem ele, "o console não disse nada" pode significar
  // tanto silêncio da rede quanto código que nunca rodou.
  const tique = setInterval(() => relatar('a cada 10s'), 10_000)

  return {
    quantos: (codigo) => salas.get(codigo)?.gente.size ?? 0,
    sincronizar,
    fecharUm: async (codigo) => {
      // Tirar da lista primeiro: se a abertura deste grupo ainda estiver na
      // fila, ela precisa desistir em vez de abrir logo depois de eu fechar.
      ultimaLista = ultimaLista.filter((c) => c !== codigo)
      agendadas.delete(codigo)
      const aberta = salas.get(codigo)
      if (!aberta) return
      salas.delete(codigo)
      await Promise.resolve(aberta.sala.sair()).catch(() => {})
    },
    aoMudar: (cb) => { ouvintes.push(cb) },
    encerrar: () => {
      viva = false
      // Uma abertura agendada que dispara depois do encerramento abriria uma
      // sala que ninguém mais vai fechar.
      for (const quando of pendentes) clearTimeout(quando)
      pendentes.clear()
      agendadas.clear()
      clearInterval(tique)
      for (const { sala } of salas.values()) void sala.sair()
      salas.clear()
    },
  }
}
