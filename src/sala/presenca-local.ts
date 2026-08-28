import { observarGrupos } from '../presenca/presenca'
import type { Presenca, SalaDeFundo } from '../presenca/presenca'

export interface DependenciasDePresencaLocal {
  /** O código DESTA sala. Fica de fora da observação: ver `acompanharGrupos`. */
  codigo: string
  /** Os códigos de todos os grupos salvos, lidos a cada chamada. */
  grupos(): readonly string[]
  /** A conexão da sala de verdade já deu certo? */
  conectado(): boolean
  /** Observar um grupo em que você NÃO está: passivo, e quase de graça. */
  abrir(codigo: string): SalaDeFundo
  /** Anunciar que você está NESTE grupo: ativo. */
  anunciar(codigo: string): SalaDeFundo
  /** Espaçamento entre abrir uma sala de fundo e a seguinte. */
  pausaMs: number
  /** A contagem mudou: a tira precisa se redesenhar. */
  aoMudar(): void
}

/**
 * A presença deste lado: quem está online nos OUTROS grupos, e o meu anúncio
 * neste.
 *
 * São duas metades de propósito. **Observar** os outros grupos é passivo — não
 * anuncia, não pré-fabrica conexões, e duas passivas nunca se conectam, então
 * um grupo em que ninguém está custa zero. **Anunciar** o grupo aberto é ativo,
 * e é o que faz os outros me verem: sem alguém ativo, os observadores ficam se
 * olhando e ninguém aparece para ninguém.
 *
 * Tudo aqui acontece numa sala de id PRÓPRIO (`codigo#presenca`), e é isso que
 * torna a peça segura: aconteça o que acontecer, ela não pode devolver a sala
 * errada para a call nem para o jogo.
 */
export interface PresencaLocal {
  /** Quantas OUTRAS pessoas estão neste grupo agora. */
  quantos(codigo: string): number
  /**
   * Sala primeiro, presença depois — e "depois" é uma **condição**, não um
   * relógio: numa rede lenta quatro segundos ainda pegariam a sala se
   * formando, e presença competindo com conectar foi o que atrapalhou as
   * quatro tentativas anteriores.
   */
  liberarSeConectou(): void
  /** Acompanha a lista de grupos salvos. Só faz algo depois de liberada. */
  acompanharGrupos(): void
  encerrar(): void
}

export function criarPresencaLocal(dep: DependenciasDePresencaLocal): PresencaLocal {
  /**
   * Nasce sem observar nada: a observação começa só depois de esta sala estar
   * de pé.
   */
  const presenca: Presenca = observarGrupos([], dep.abrir, dep.pausaMs)
  presenca.aoMudar(dep.aoMudar)

  /** O meu anúncio ativo neste grupo — a metade que faz os outros me verem. */
  let anuncio: SalaDeFundo | null = null
  let liberada = false

  /**
   * Esta sala já foi desmontada — e daqui não se abre mais nada.
   *
   * Não é zelo. O desenho é chamado de vários lugares, e alguns chegam
   * **depois** do encerramento (um `aoMudar` do protocolo em voo, por
   * exemplo). Sem esta tranca, o desenho atrasado reabria o anúncio de um
   * grupo que a pessoa acabou de deixar — e esse anúncio ficava vivo até a aba
   * fechar, porque o encerramento que o fecharia já tinha rodado.
   *
   * O sintoma, medido com duas abas: sair do Grupo Y e ir para o X deixava o Y
   * marcando "1 pessoa online" **para sempre**, do ponto de vista de todo
   * mundo. Recarregar a página limpava — que é a assinatura de sala órfã, e
   * não de contagem errada.
   */
  let desmontado = false

  return {
    quantos: presenca.quantos,

    liberarSeConectou: () => {
      if (desmontado || liberada) return
      if (!dep.conectado()) return
      // Uma vez liberada, não volta atrás. Uma reconexão momentânea fecharia e
      // reabriria as salas de fundo à toa, e reabrir é justamente o que colide.
      liberada = true
      // A tela inicial pode ter deixado ESTE grupo sendo observado em modo
      // passivo, e o `leave` do Trystero só desregistra depois de um envio e
      // mais 99 ms. Se colidisse, o anúncio receberia aquela sala passiva
      // agonizando e eu não seria anunciado.
      //
      // O pior caso é esse, e ele é aceitável de propósito: a sala de presença
      // é OUTRA sala, então uma colisão aqui custa "ninguém me vê online" e
      // nunca uma call quebrada. Na prática não acontece — conectar leva
      // segundos, e aqueles 99 ms já passaram muito antes.
      anuncio = dep.anunciar(dep.codigo)
    },

    /**
     * O grupo ATUAL fica de fora da observação: eu já estou nele, e observar a
     * si mesmo abriria uma segunda entrada no mesmo `codigo#presenca` — que o
     * Trystero devolveria como a MESMA sala, com o `onPeerJoin` (que é
     * propriedade, e não lista) sobrescrito por cima do anúncio.
     */
    acompanharGrupos: () => {
      if (!liberada) return
      presenca.sincronizar(dep.grupos().filter((c) => c !== dep.codigo))
    },

    encerrar: () => {
      // `desmontado`, e NÃO `liberada = false`: baixar a tranca a re-armaria, e
      // um desenho atrasado abriria um anúncio órfão.
      desmontado = true
      // Sem esperar, de propósito: a sala nova é aberta logo em seguida, e nada
      // do que ela faz depende destas fecharem. São salas de id próprio — não
      // há como uma delas ser devolvida no lugar da sala de verdade.
      void anuncio?.sair()
      anuncio = null
      presenca.encerrar()
    },
  }
}
