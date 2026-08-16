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

export type EstadoJogo = {
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

export type TipoAcao = Acao['tipo']
