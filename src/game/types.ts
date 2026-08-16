export type Naipe = 'copas' | 'ouros' | 'paus' | 'espadas'

export type Valor =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Carta {
  naipe: Naipe
  valor: Valor
}

export type Rng = () => number

export type ResultadoMao = 'ganhou' | 'perdeu' | 'empatou' | 'blackjack'

export interface Mao {
  id: string
  cartas: Carta[]
  aposta: number
  dobrada: boolean
  vindaDeSplit: boolean
  encerrada: boolean
  resultado?: ResultadoMao
}

export interface Jogador {
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
}

export type Fase =
  | 'aguardando'
  | 'apostas'
  | 'distribuindo'
  | 'seguro'
  | 'turnos'
  | 'dealer'
  | 'acerto'

export interface EstadoJogo {
  fase: Fase
  jogadores: Jogador[]
  vezDe: string | null
  prazoTurno: number | null
  maoDealer: Carta[]
  dealerTemOculta: boolean
  cartasRestantes: number
  hostAtual: string
  rodada: number
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

export type TipoAcao = Acao['tipo']
