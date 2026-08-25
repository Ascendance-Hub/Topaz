export type Naipe = 'copas' | 'ouros' | 'paus' | 'espadas'

export type Valor =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export type Carta = {
  naipe: Naipe
  valor: Valor
}

export type Rng = () => number

export type ResultadoMao = 'ganhou' | 'perdeu' | 'empatou' | 'blackjack'

export type Mao = {
  id: string
  cartas: Carta[]
  aposta: number
  dobrada: boolean
  vindaDeSplit: boolean
  encerrada: boolean
  resultado?: ResultadoMao
}

export type Jogador = {
  peerId: string
  apelido: string
  cadeira: number | null
  fichas: number
  maos: Mao[]
  maoAtiva: number
  seguro: number
  rodadasInativo: number
  /** Timestamp da queda. `null` = conectado. Cadeira e fichas ficam
   *  reservadas até expirar `REGRAS.segundosReconexao`. */
  desconectadoEm: number | null
  /** Se já respondeu à oferta de seguro nesta rodada. */
  decidiuSeguro: boolean
  /** Rodada em que quebrou. `null` = nunca eliminado nesta partida. */
  eliminadoEm: number | null
}

export type Fase =
  | 'aguardando'
  | 'apostas'
  | 'distribuindo'
  | 'seguro'
  | 'turnos'
  | 'dealer'
  | 'acerto'
  | 'fim'

/**
 * O formato da partida, escolhido pelo anfitrião.
 *
 * Mora no `EstadoJogo` e não numa constante de módulo por um motivo só: assim
 * ele **viaja com o estado**. Todo mundo concorda sozinho, inclusive quem
 * entra no meio — e não existe o caso de dois navegadores jogarem com regras
 * diferentes sem ninguém perceber.
 *
 * O que NÃO está aqui continua constante em `REGRAS`: pagamentos, número de
 * baralhos, limite de cadeiras. Configurar tudo daria uma tela de ajustes que
 * ninguém lê e uma superfície de erro que ninguém precisa.
 */
export type ConfigPartida = {
  fichasIniciais: number
  /** Fichas para vencer, ou `null` para jogar até sobrar um. */
  alvo: number | null
  apostaMax: number
  segundosTurno: number
}

export type EstadoJogo = {
  /** O formato desta partida. Ver `ConfigPartida`. */
  config: ConfigPartida
  fase: Fase
  jogadores: Jogador[]
  vezDe: string | null
  prazoTurno: number | null
  maoDealer: Carta[]
  dealerTemOculta: boolean
  cartasRestantes: number
  hostAtual: string
  rodada: number
  /** Contador de ids de mão — vive no estado (não no módulo) para que uma
   *  migração de host nunca reinicie do zero e colida com mãos existentes. */
  proximoIdMao: number
  /** peerId de quem venceu. `null` fora de `fim`, ou quando ninguém venceu. */
  vencedor: string | null
  /** peerIds de quem estava sentado quando o anfitrião iniciou a partida. */
  naPartida: string[]
}

export type Acao =
  | { tipo: 'entrar'; apelido: string }
  | { tipo: 'sentar'; cadeira: number }
  | { tipo: 'levantar' }
  | { tipo: 'apostar'; valor: number }
  | { tipo: 'seguro'; aceitar: boolean }
  | { tipo: 'pedir'; maoId: string }
  | { tipo: 'parar'; maoId: string }
  | { tipo: 'dobrar'; maoId: string }
  | { tipo: 'dividir'; maoId: string }
  | { tipo: 'iniciar' }
  | { tipo: 'novaPartida' }
  /** Muda o formato da partida. Só o anfitrião, e só entre partidas. */
  | { tipo: 'configurar'; config: ConfigPartida }

export type TipoAcao = Acao['tipo']
