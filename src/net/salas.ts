import type { SalaTrystero } from './transport'
import { criarEmissor } from './avisar'

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
 * As promessas de publicação de mídia, com o estouro registrado.
 *
 * `addStream` e `replaceTrack` do Trystero devolvem **uma promessa por peer**,
 * e dentro de cada uma o `applyMediaOp` faz `await sendMeta(...)` ANTES de
 * mexer na conexão (`media.ts:228`). Quando o `pc.addTrack` estoura — foi o
 * `InvalidAccessError: a sender already exists for the track` do defeito de
 * 2026-08-26 — o metadado **já foi enviado** e o erro cai numa promessa que
 * ninguém escuta. O receptor fica com um metadado órfão na fila FIFO por peer
 * e, dali em diante, toda mídia daquela pessoa chega com o rótulo da anterior.
 *
 * Registrar não conserta o defeito. Tira dele o silêncio, que é o que fez ele
 * durar — e neste projeto a assinatura de quase todo bug de mídia foi "nada no
 * console, só uma funcionalidade que não acontece".
 *
 * Uma falha não pode derrubar as outras: cada promessa é tratada sozinha, e o
 * `catch` devolve `undefined` em vez de propagar.
 */
function registrarFalhas(promessas: Promise<void>[], oQue: string): void {
  for (const promessa of promessas) {
    promessa.catch((erro: unknown) => {
      console.error(`${oQue}: falhou para um peer`, erro)
    })
  }
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
  const aoEntrar = criarEmissor<[peerId: string]>()
  const aoSair = criarEmissor<[peerId: string]>()

  for (const nomeada of salas) {
    nomeada.sala.onPeerJoin = (peerId) => {
      // Já temos caminho para essa pessoa: a duplicata fica de reserva
      // silenciosa. Não se fecha nada — a conexão extra não atrapalha
      // enquanto ninguém falar por ela.
      if (dono.has(peerId)) return
      dono.set(peerId, nomeada)
      aoEntrar.avisar(peerId)
    }

    nomeada.sala.onPeerLeave = (peerId) => {
      // Só a queda da rede DONA conta. Uma duplicata caindo não muda nada,
      // e tratar como saída derrubaria alguém que continua conectado.
      if (dono.get(peerId) !== nomeada) return
      dono.delete(peerId)
      aoSair.avisar(peerId)
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

  const aoStream = criarEmissor<[stream: MediaStream, de: string, meta?: unknown]>()
  for (const nomeada of salas) {
    nomeada.sala.onPeerStream = (stream, peerId, metadata) => {
      // Mesma regra das ações: só a rede dona entrega. Sem isto, quem estiver
      // alcançável por duas redes apareceria com a tela duplicada.
      if (dono.get(peerId) !== nomeada) return
      aoStream.avisar(stream, peerId, metadata)
    }
  }

  return {
    criarAcao<T>(nome: string): AcaoMulti<T> {
      const canais = new Map<SalaNomeada, CanalDaSala>()
      const ouvintes = criarEmissor<[dados: T, de: string]>()

      for (const nomeada of salas) {
        const canal = nomeada.sala.makeAction(nome) as unknown as CanalDaSala
        canais.set(nomeada, canal)
        canal.onMessage = (dados, contexto) => {
          // Chegou pela rede que não é dona: é a cópia da conexão reserva.
          // Entregar as duas faria a ação ser aplicada em dobro.
          if (dono.get(contexto.peerId) !== nomeada) return
          ouvintes.avisar(dados as T, contexto.peerId)
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
          ouvintes.ouvir(cb)
        },
      }
    },

    peers: () => [...dono.keys()],
    donoDe: (peerId) => dono.get(peerId)?.sala,
    porRede: () => [...agrupar()].map(([nomeada, peers]) => ({ sala: nomeada.sala, peers })),
    aoEntrarPeer: (cb) => { aoEntrar.ouvir(cb) },
    aoSairPeer: (cb) => { aoSair.ouvir(cb) },
    aoReceberStream: (cb) => { aoStream.ouvir(cb) },

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
        registrarFalhas(
          nomeada.sala.addStream(stream, { target: peers, metadata: metadata as never }),
          'publicar mídia',
        )
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
      // Sem alvo: a rede que não tem esse sender simplesmente não faz nada —
      // `peer.ts:588` devolve `undefined` em vez de rejeitar, então registrar
      // a falha aqui não vira ruído; só fala quando o `replaceTrack` do sender
      // falhou de verdade.
      for (const nomeada of salas) {
        registrarFalhas(nomeada.sala.replaceTrack(velha, nova), 'trocar a faixa')
      }
    },
    sair: () => {
      // FECHAR antes de sair, e não só sair.
      //
      // A Trystero 0.25 compartilha a `RTCPeerConnection` entre salas: sair de
      // uma e entrar em outra HERDA a conexão. Parece economia — e é o defeito
      // do "ninguém se escuta" depois de trocar de grupo.
      //
      // O que acontece ao herdar: o `removeTrack` do desmonte dispara uma
      // renegociação, e a SDF dela cai na janela em que o peer ainda não está
      // ATIVO na sala nova. O `room.ts` descarta SDP de renegociação nos dois
      // sentidos enquanto isso (`if (!activePeerMap[id]) return`), e como
      // `onnegotiationneeded` não dispara de novo, a conexão fica presa em
      // `have-local-offer` PARA SEMPRE. O canal de dados não depende de SDP
      // nova, então sala, chat e jogo continuam funcionando — só a mídia nunca
      // negocia. É por isso que o sintoma é "conectado, e ninguém se escuta".
      //
      // Medido com duas abas em 2026-08-27, mesmo roteiro nas duas:
      //
      //   herdando a conexão → silêncio dos dois lados, receivers: 2
      //   fechando a conexão → ouvindo e sendo ouvido, receivers: 1
      //
      // A janela é de tempo, e por isso o defeito é intermitente e pior na
      // máquina mais lenta ou na rede mais lenta: é ela que demora mais para o
      // peer ficar ativo na sala nova.
      //
      // O custo é um handshake novo por troca de grupo. A descoberta pelos
      // relays acontece de qualquer jeito, e a piscina de ofertas já está
      // quente — então o que se paga é ICE e DTLS, não a espera de achar a
      // pessoa.
      for (const nomeada of salas) {
        for (const conexao of Object.values(nomeada.sala.getPeers())) {
          // Uma conexão já morta não pode impedir as outras de fecharem.
          try { conexao.close() } catch { /* já estava fechada */ }
        }
      }
      for (const nomeada of salas) void nomeada.sala.leave()
    },
  }
}
