import type { CandidatoResumo } from './diagnostico-rede'

/**
 * Três servidores, e não dois: a comparação precisa de mais de uma resposta, e
 * com dois um único servidor fora do ar já tornava o teste inconclusivo — foi
 * o que aconteceu no primeiro uso real.
 */
export const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.nextcloud.com:3478' },
]

const MS_LIMITE = 9000

/**
 * Junta os candidatos ICE de uma conexão descartável.
 *
 * Dois servidores STUN numa conexão só, de propósito: é o mesmo socket local
 * perguntando a dois destinos diferentes, que é exatamente o que revela se o
 * NAT dá um mapeamento por destino.
 */
export interface Coleta {
  candidatos: CandidatoResumo[]
  /** Quantos servidores STUN falharam — o navegador avisa cada um. */
  erros: number
}

export function coletarCandidatos(): Promise<Coleta> {
  return new Promise((resolve) => {
    const candidatos: CandidatoResumo[] = []
    const urlsComErro = new Set<string>()
    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({ iceServers: STUN })
    } catch {
      resolve({ candidatos, erros: 0 })
      return
    }

    const encerrar = () => {
      clearTimeout(prazo)
      try { pc.close() } catch { /* já fechada */ }
      resolve({ candidatos, erros: urlsComErro.size })
    }
    const prazo = setTimeout(encerrar, MS_LIMITE)

    // Contado por URL: o navegador pode avisar o mesmo servidor mais de uma
    // vez (IPv4 e IPv6, por exemplo), e isso não são duas falhas.
    pc.onicecandidateerror = (evento) => {
      const url = (evento as RTCPeerConnectionIceErrorEvent).url
      if (url) urlsComErro.add(url)
    }

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
