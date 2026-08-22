import type { CandidatoResumo } from './diagnostico-rede'

/** Os mesmos STUN que o Trystero usa por padrão. */
export const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

const MS_LIMITE = 9000

/**
 * Junta os candidatos ICE de uma conexão descartável.
 *
 * Dois servidores STUN numa conexão só, de propósito: é o mesmo socket local
 * perguntando a dois destinos diferentes, que é exatamente o que revela se o
 * NAT dá um mapeamento por destino.
 */
export function coletarCandidatos(): Promise<CandidatoResumo[]> {
  return new Promise((resolve) => {
    const candidatos: CandidatoResumo[] = []
    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({ iceServers: STUN })
    } catch {
      resolve(candidatos)
      return
    }

    const encerrar = () => {
      clearTimeout(prazo)
      try { pc.close() } catch { /* já fechada */ }
      resolve(candidatos)
    }
    const prazo = setTimeout(encerrar, MS_LIMITE)

    pc.onicecandidate = (evento) => {
      if (!evento.candidate) { encerrar(); return }
      candidatos.push({
        tipo: evento.candidate.type ?? '?',
        porta: evento.candidate.port ?? 0,
        // O Chrome zera isto para não vazar o endereço local. Quando zerado,
        // todos os candidatos caem no mesmo grupo — o que é justamente o que
        // se quer aqui, já que há uma conexão só.
        portaLocal: evento.candidate.relatedPort ?? 0,
      })
    }

    // O canal existe só para forçar a coleta: sem mídia nem dados a conexão
    // não junta candidato nenhum.
    pc.createDataChannel('sonda')
    void pc.createOffer()
      .then((oferta) => pc.setLocalDescription(oferta))
      .catch(encerrar)
  })
}
