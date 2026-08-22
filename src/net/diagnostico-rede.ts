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
 * O sinal é a porta externa que servidores STUN diferentes veem saindo do
 * MESMO socket local. Duas portas distintas provam que o NAT dá um mapeamento
 * por destino (simétrico) — e aí nenhum truque de STUN fecha a conexão, só um
 * servidor de retransmissão no meio.
 *
 * O detalhe que me enganou na primeira versão: **o navegador deduplica
 * candidatos idênticos**. Quando os servidores concordam — que é o caso bom —
 * sai UM candidato só, não dois. Ler candidato único como "só um respondeu"
 * fazia a rede saudável aparecer como indefinida.
 *
 * Para separar "concordaram" de "não responderam", entra `errosDeServidor`:
 * o navegador avisa cada servidor que falhou. Candidato único **sem** erro é
 * concordância; com erro, não dá para saber.
 */
export function analisarCandidatos(
  candidatos: CandidatoResumo[], errosDeServidor: number,
): Analise {
  const contagem: Record<string, number> = {}
  for (const c of candidatos) contagem[c.tipo] = (contagem[c.tipo] ?? 0) + 1

  const externos = candidatos.filter((c) => c.tipo === 'srflx')
  if (externos.length === 0) return { veredito: VEREDITOS.semUdp, contagem }

  const porSocket = new Map<number, Set<number>>()
  for (const c of externos) {
    if (!porSocket.has(c.portaLocal)) porSocket.set(c.portaLocal, new Set())
    porSocket.get(c.portaLocal)!.add(c.porta)
  }

  // Prova direta, e independe de algum servidor ter falhado.
  for (const portas of porSocket.values()) {
    if (portas.size > 1) return { veredito: VEREDITOS.simetrico, contagem }
  }

  // Nenhum socket com divergência. Só vale como "direto" se todos os
  // servidores tiverem respondido — senão o silêncio dos outros pode estar
  // escondendo uma divergência.
  if (errosDeServidor > 0) return { veredito: VEREDITOS.inconclusivo, contagem }
  return { veredito: VEREDITOS.direto, contagem }
}
