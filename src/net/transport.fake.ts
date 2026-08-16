import type { Acao, EstadoJogo } from '../game/types'
import type { Transporte } from './transport'

interface No {
  id: string
  aoAcao: ((acao: Acao, peerId: string) => void)[]
  aoEstado: ((estado: EstadoJogo, peerId: string) => void)[]
  aoEntrar: ((peerId: string) => void)[]
  aoSair: ((peerId: string) => void)[]
}

/**
 * Rede em memória com entrega síncrona. Substitui o Trystero nos testes,
 * permitindo testar eleição, migração e validação sem navegador.
 */
export function criarRedeFalsa() {
  const nos = new Map<string, No>()

  function conectar(id: string): Transporte {
    const no: No = { id, aoAcao: [], aoEstado: [], aoEntrar: [], aoSair: [] }

    // Insere primeiro, depois avisa — assim `peers()` já enxerga o novo
    // peer de dentro do próprio callback `aoEntrarPeer`, igual ao Trystero
    // real (cujo `getPeers()` já inclui o peer recém-conectado). Simétrico
    // ao `sair()`, que remove antes de avisar os que ficaram.
    nos.set(id, no)
    for (const outro of nos.values()) {
      if (outro.id === id) continue
      for (const cb of outro.aoEntrar) cb(id)
    }

    return {
      meuId: () => id,
      peers: () => [...nos.keys()].filter((k) => k !== id),
      enviarAcao: (acao) => {
        for (const outro of nos.values()) {
          if (outro.id === id) continue
          for (const cb of outro.aoAcao) cb(structuredClone(acao), id)
        }
      },
      aoReceberAcao: (cb) => {
        no.aoAcao.push(cb)
      },
      enviarEstado: (estado) => {
        for (const outro of nos.values()) {
          if (outro.id === id) continue
          for (const cb of outro.aoEstado) cb(structuredClone(estado), id)
        }
      },
      aoReceberEstado: (cb) => {
        no.aoEstado.push(cb)
      },
      aoEntrarPeer: (cb) => {
        no.aoEntrar.push(cb)
      },
      aoSairPeer: (cb) => {
        no.aoSair.push(cb)
      },
      sair: () => {
        nos.delete(id)
        for (const outro of nos.values()) {
          for (const cb of outro.aoSair) cb(id)
        }
      },
    }
  }

  return { conectar }
}
