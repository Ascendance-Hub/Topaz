import type { CanalCall, MensagemCall } from './protocolo'

interface No {
  id: string
  aoReceber: ((msg: MensagemCall, de: string) => void)[]
  aoEntrar: ((peerId: string) => void)[]
  aoSair: ((peerId: string) => void)[]
}

/**
 * Rede em memória para o canal da call, com entrega síncrona. Mesma ideia da
 * `transport.fake.ts` do jogo, e pelo mesmo motivo: o protocolo precisa ser
 * testável sem navegador e sem relay.
 */
export function criarCanalFalso() {
  const nos = new Map<string, No>()

  function conectar(id: string): CanalCall {
    const no: No = { id, aoReceber: [], aoEntrar: [], aoSair: [] }

    nos.set(id, no)

    /**
     * A entrada só é anunciada quando o consumidor registra `aoEntrarPeer`.
     *
     * Anunciar dentro do `conectar` seria infiel e quebraria o caso mais
     * importante: quem chega depois. `conectar` roda ANTES do construtor do
     * `ProtocoloCall` terminar, então o retrato enviado por quem já estava
     * chegaria a um nó que ainda não tem ouvinte, e se perderia. O Trystero de
     * verdade dispara `onPeerJoin` depois, com os handlers já montados.
     */
    let anunciado = false
    function anunciarEntrada(): void {
      if (anunciado) return
      anunciado = true
      for (const outro of nos.values()) {
        if (outro.id === id) continue
        for (const cb of outro.aoEntrar) cb(id)
        for (const cb of no.aoEntrar) cb(outro.id)
      }
    }

    return {
      meuId: () => id,
      enviar: (msg, para) => {
        for (const outro of nos.values()) {
          if (outro.id === id) continue
          if (para !== undefined && outro.id !== para) continue
          for (const cb of outro.aoReceber) cb(structuredClone(msg), id)
        }
      },
      aoReceber: (cb) => { no.aoReceber.push(cb) },
      aoEntrarPeer: (cb) => { no.aoEntrar.push(cb); anunciarEntrada() },
      aoSairPeer: (cb) => { no.aoSair.push(cb) },
    }
  }

  function desconectar(id: string): void {
    nos.delete(id)
    for (const outro of nos.values()) {
      for (const cb of outro.aoSair) cb(id)
    }
  }

  return { conectar, desconectar }
}
