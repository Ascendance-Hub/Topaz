import type { SalaTrystero } from './transport'
import { avisarTodos } from './avisar'

export interface SalaNomeada {
  /** `nostr`, `mqtt`, `torrent` — aparece no diagnóstico. */
  nome: string
  sala: SalaTrystero
}

/**
 * O canal de mensagens de uma sala.
 *
 * Escrito à mão porque `makeAction` tem duas sobrecargas — mensagem e
 * requisição — e a inferência escolhe a de requisição, que não tem `send`.
 */
interface CanalDaSala {
  send: (dados: never, opcoes?: { target?: string[] }) => unknown
  onMessage: ((dados: unknown, contexto: { peerId: string }) => void) | null
}

export interface AcaoMulti<T> {
  /** Sem `para`, vai a todos os peers — cada um pela rede que o trouxe. */
  send(dados: T, para?: string): void
  onMessage(cb: (dados: T, de: string) => void): void
}

export interface Salas {
  criarAcao<T>(nome: string): AcaoMulti<T>
  peers(): string[]
  /** A rede pela qual falamos com este peer. */
  donoDe(peerId: string): SalaTrystero | undefined
  /** Os peers de cada rede, para publicar mídia sem duplicar. */
  porRede(): { sala: SalaTrystero; peers: string[] }[]
  /**
   * Quantos peers cada rede de descoberta trouxe, por NOME.
   *
   * Existe para uma pergunta só, e ela é a que a caçada da presença não
   * conseguia responder: o app está conectado por qual rede? A presença é só
   * nostr — se as pessoas chegam por mqtt ou torrent e o nostr está mudo,
   * ninguém observando por nostr acharia esta sala, e todo o resto da
   * investigação seria ruído.
   */
  quemPorRede(): Record<string, number>
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
  /** Mídia que chega, já sem a cópia da conexão reserva. */
  aoReceberStream(cb: (stream: MediaStream, de: string, meta?: unknown) => void): void
  /** Publica para os alvos indicados, cada um pela rede que o trouxe. */
  publicarStream(stream: MediaStream, alvos: string[], metadata: unknown): void
  despublicarStream(stream: MediaStream, alvos?: string[]): void
  /** Troca a faixa sem renegociar; a rede sem esse sender ignora. */
  substituirFaixa(velha: MediaStreamTrack, nova: MediaStreamTrack): void
  sair(): void
}

/**
 * Junta várias redes de descoberta numa só, deduplicando por pessoa.
 *
 * O motivo é redundância de INFRAESTRUTURA, não de servidor: antivírus e
 * filtros de DNS bloqueiam endereços por reputação, e a lista inteira do nostr
 * cai na mesma categoria. Uma máquina que alcança 5 de 20 relays nostr pode
 * alcançar o MQTT inteiro, porque é outra rede, outro protocolo, outras
 * portas.
 *
 * A regra é "primeiro que chega, ganha", por pessoa. O `selfId` do Trystero é
 * o mesmo nas três estratégias, então a mesma pessoa descoberta duas vezes tem
 * o mesmo identificador — e a segunda descoberta é simplesmente ignorada.
 *
 * Sem isso, cada pessoa alcançável por duas redes teria DUAS conexões P2P: a
 * `Sessao` veria a mesma ação duas vezes (apostar duas vezes, sentar duas
 * vezes) e a mídia seria publicada em dobro.
 */
export function fundirSalas(salas: SalaNomeada[]): Salas {
  /** peerId → a rede que o trouxe primeiro. */
  const dono = new Map<string, SalaNomeada>()
  const aoEntrar: ((peerId: string) => void)[] = []
  const aoSair: ((peerId: string) => void)[] = []

  for (const nomeada of salas) {
    nomeada.sala.onPeerJoin = (peerId) => {
      // Já temos caminho para essa pessoa: a duplicata fica de reserva
      // silenciosa. Não se fecha nada — a conexão extra não atrapalha
      // enquanto ninguém falar por ela.
      if (dono.has(peerId)) return
      dono.set(peerId, nomeada)
      avisarTodos(aoEntrar, peerId)
    }

    nomeada.sala.onPeerLeave = (peerId) => {
      // Só a queda da rede DONA conta. Uma duplicata caindo não muda nada,
      // e tratar como saída derrubaria alguém que continua conectado.
      if (dono.get(peerId) !== nomeada) return
      dono.delete(peerId)
      avisarTodos(aoSair, peerId)
    }
  }

  /** Os peers de cada rede, na forma que o `target` do Trystero espera. */
  function agrupar(): Map<SalaNomeada, string[]> {
    const grupos = new Map<SalaNomeada, string[]>()
    for (const [peerId, nomeada] of dono) {
      const atual = grupos.get(nomeada)
      if (atual) atual.push(peerId)
      else grupos.set(nomeada, [peerId])
    }
    return grupos
  }

  const aoStream: ((stream: MediaStream, de: string, meta?: unknown) => void)[] = []
  for (const nomeada of salas) {
    nomeada.sala.onPeerStream = (stream, peerId, metadata) => {
      // Mesma regra das ações: só a rede dona entrega. Sem isto, quem estiver
      // alcançável por duas redes apareceria com a tela duplicada.
      if (dono.get(peerId) !== nomeada) return
      avisarTodos(aoStream, stream, peerId, metadata)
    }
  }

  return {
    criarAcao<T>(nome: string): AcaoMulti<T> {
      const canais = new Map<SalaNomeada, CanalDaSala>()
      const ouvintes: ((dados: T, de: string) => void)[] = []

      for (const nomeada of salas) {
        const canal = nomeada.sala.makeAction(nome) as unknown as CanalDaSala
        canais.set(nomeada, canal)
        canal.onMessage = (dados, contexto) => {
          // Chegou pela rede que não é dona: é a cópia da conexão reserva.
          // Entregar as duas faria a ação ser aplicada em dobro.
          if (dono.get(contexto.peerId) !== nomeada) return
          avisarTodos(ouvintes, dados as T, contexto.peerId)
        }
      }

      return {
        send: (dados, para) => {
          if (para !== undefined) {
            const nomeada = dono.get(para)
            if (!nomeada) return
            void canais.get(nomeada)?.send(dados as never, { target: [para] })
            return
          }
          for (const [nomeada, peers] of agrupar()) {
            void canais.get(nomeada)?.send(dados as never, { target: peers })
          }
        },
        onMessage: (cb) => {
          ouvintes.push(cb)
        },
      }
    },

    peers: () => [...dono.keys()],
    donoDe: (peerId) => dono.get(peerId)?.sala,
    porRede: () => [...agrupar()].map(([nomeada, peers]) => ({ sala: nomeada.sala, peers })),
    quemPorRede: () => {
      // Todas as redes aparecem, inclusive com zero: uma rede ausente da lista
      // não se distingue de uma rede sem ninguém, e é justamente essa a
      // distinção que interessa.
      const conta: Record<string, number> = {}
      for (const nomeada of salas) conta[nomeada.nome] = 0
      for (const [, nomeada] of dono) conta[nomeada.nome] = (conta[nomeada.nome] ?? 0) + 1
      return conta
    },
    aoEntrarPeer: (cb) => { aoEntrar.push(cb) },
    aoSairPeer: (cb) => { aoSair.push(cb) },
    aoReceberStream: (cb) => { aoStream.push(cb) },

    publicarStream: (stream, alvos, metadata) => {
      // Agrupa por rede: publicar a lista inteira em todas mandaria a mesma
      // tela por caminhos duplicados e ligaria codificador a mais.
      const grupos = new Map<SalaNomeada, string[]>()
      for (const alvo of alvos) {
        const nomeada = dono.get(alvo)
        if (!nomeada) continue
        const atual = grupos.get(nomeada)
        if (atual) atual.push(alvo)
        else grupos.set(nomeada, [alvo])
      }
      for (const [nomeada, peers] of grupos) {
        nomeada.sala.addStream(stream, { target: peers, metadata: metadata as never })
      }
    },

    despublicarStream: (stream, alvos) => {
      if (!alvos) {
        for (const nomeada of salas) nomeada.sala.removeStream(stream)
        return
      }
      for (const alvo of alvos) {
        dono.get(alvo)?.sala.removeStream(stream, { target: [alvo] })
      }
    },
    substituirFaixa: (velha, nova) => {
      // Sem alvo: a rede que não tem esse sender simplesmente não faz nada.
      for (const nomeada of salas) nomeada.sala.replaceTrack(velha, nova)
    },
    sair: () => {
      for (const nomeada of salas) void nomeada.sala.leave()
    },
  }
}
