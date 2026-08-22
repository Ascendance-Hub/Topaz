export interface CandidatoResumo {
  tipo: string
  porta: number
  /** A porta local de onde ele saiu. `0` quando o navegador a esconde. */
  portaLocal: number
}

export const VEREDITOS = {
  semUdp: 'sem-udp',
  direto: 'direto',
  simetrico: 'simetrico',
  inconclusivo: 'inconclusivo',
} as const

export type Veredito = (typeof VEREDITOS)[keyof typeof VEREDITOS]

export interface Analise {
  veredito: Veredito
  contagem: Record<string, number>
}

/**
 * Decide, a partir dos candidatos ICE, se esta rede consegue conexão direta.
 *
 * O teste é comparar a porta externa que DOIS servidores STUN diferentes viram
 * saindo do MESMO socket local. Se for a mesma, o NAT mantém o mapeamento
 * independentemente do destino e o P2P direto funciona. Se mudar, o NAT dá um
 * mapeamento por destino (simétrico) e nenhum truque de STUN fecha a conexão —
 * só um servidor TURN no meio.
 *
 * Agrupar por porta local importa: portas locais distintas são interfaces
 * distintas (wifi, VPN), e portas externas diferentes aí são normais.
 */
export function analisarCandidatos(candidatos: CandidatoResumo[]): Analise {
  const contagem: Record<string, number> = {}
  for (const c of candidatos) contagem[c.tipo] = (contagem[c.tipo] ?? 0) + 1

  const externos = candidatos.filter((c) => c.tipo === 'srflx')
  if (externos.length === 0) return { veredito: VEREDITOS.semUdp, contagem }

  const porSocket = new Map<number, Set<number>>()
  for (const c of externos) {
    if (!porSocket.has(c.portaLocal)) porSocket.set(c.portaLocal, new Set())
    porSocket.get(c.portaLocal)!.add(c.porta)
  }

  for (const portas of porSocket.values()) {
    // Duas portas externas do mesmo socket é prova direta de NAT simétrico.
    if (portas.size > 1) return { veredito: VEREDITOS.simetrico, contagem }
  }

  const comparaveis = [...porSocket.values()].some((p) => p.size >= 1) && externos.length >= 2
  const mesmoSocket = porSocket.size === 1 && externos.length >= 2
  if (mesmoSocket) return { veredito: VEREDITOS.direto, contagem }
  void comparaveis
  return { veredito: VEREDITOS.inconclusivo, contagem }
}
