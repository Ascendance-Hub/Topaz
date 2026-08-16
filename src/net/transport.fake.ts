import type { Acao, EstadoJogo } from '../game/types'
import type { Transporte } from './transport'

interface No {
  id: string
  aoAcao: ((acao: Acao, peerId: string) => void)[]
  aoEstado: ((estado: EstadoJogo, peerId: string) => void)[]
  aoEntrar: ((peerId: string) => void)[]
  aoSair: ((peerId: string) => void)[]
}

export interface OpcoesRedeFalsa {
  /**
   * Modela o que o Trystero de verdade faz: `joinRoom` volta imediatamente e
   * a sala fica *vazia* por alguns segundos, até o relay Nostr e o ICE
   * fecharem o handshake. Com isto ligado, `conectar` registra o nó mas ele
   * não aparece em `peers()` de ninguém, não recebe nada e não dispara
   * `aoEntrarPeer` — só quando `bombear()` é chamado explicitamente.
   *
   * É a única configuração em que a lista de peers está vazia no construtor
   * da `Sessao`, que é exatamente a condição que existe em qualquer
   * navegador real. O modo imediato (padrão) é uma conveniência de teste,
   * não um modelo fiel.
   */
  conexaoDiferida?: boolean
}

/**
 * Rede em memória com entrega síncrona. Substitui o Trystero nos testes,
 * permitindo testar eleição, migração e validação sem navegador.
 */
export function criarRedeFalsa(opcoes: OpcoesRedeFalsa = {}) {
  const nos = new Map<string, No>()
  const visiveis = new Set<string>()

  /**
   * Torna um nó visível para os demais e avisa os dois lados — o Trystero
   * dispara `onPeerJoin` em quem já estava e em quem chegou.
   */
  function tornarVisivel(id: string): void {
    const no = nos.get(id)
    if (!no || visiveis.has(id)) return
    visiveis.add(id)
    for (const outro of nos.values()) {
      if (outro.id === id || !visiveis.has(outro.id)) continue
      for (const cb of outro.aoEntrar) cb(id)
      for (const cb of no.aoEntrar) cb(outro.id)
    }
  }

  /** Conclui o handshake de todos os nós ainda pendentes (modo diferido). */
  function bombear(): void {
    for (const id of [...nos.keys()]) tornarVisivel(id)
  }

  function conectar(id: string): Transporte {
    const no: No = { id, aoAcao: [], aoEstado: [], aoEntrar: [], aoSair: [] }

    // Insere primeiro, depois avisa — assim `peers()` já enxerga o novo
    // peer de dentro do próprio callback `aoEntrarPeer`, igual ao Trystero
    // real (cujo `getPeers()` já inclui o peer recém-conectado). Simétrico
    // ao `sair()`, que remove antes de avisar os que ficaram.
    nos.set(id, no)
    if (!opcoes.conexaoDiferida) tornarVisivel(id)

    /** Destinatários de um envio: só quem já completou o handshake. */
    function destinatarios(): No[] {
      if (!visiveis.has(id)) return []
      return [...nos.values()].filter((o) => o.id !== id && visiveis.has(o.id))
    }

    return {
      meuId: () => id,
      peers: () => (visiveis.has(id) ? [...visiveis].filter((k) => k !== id) : []),
      enviarAcao: (acao) => {
        for (const outro of destinatarios()) {
          for (const cb of outro.aoAcao) cb(structuredClone(acao), id)
        }
      },
      aoReceberAcao: (cb) => {
        no.aoAcao.push(cb)
      },
      enviarEstado: (estado) => {
        for (const outro of destinatarios()) {
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
        visiveis.delete(id)
        for (const outro of nos.values()) {
          if (!visiveis.has(outro.id)) continue
          for (const cb of outro.aoSair) cb(id)
        }
      },
    }
  }

  return { conectar, bombear }
}
