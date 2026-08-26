import { vi } from 'vitest'
import type { Salas } from './salas'
import type { SalaTrystero } from './transport'

/**
 * Uma `Salas` de mentira para os testes de call e mídia.
 *
 * Fica num arquivo próprio porque três suítes precisam dela, e porque duplicar
 * fake é como fakes começam a divergir do comportamento real — que já nos
 * custou um bug escondido antes.
 */
export function criarSalasFalsas(peers: string[] = ['pa', 'pb']) {
  const acoes = new Map<string, {
    send: (dados: unknown, para?: string) => void
    entregar?: (d: unknown, de: string) => void
  }>()
  const publicados: { stream: unknown; alvos: string[]; meta: unknown }[] = []
  const despublicados: { stream: unknown; alvos?: string[] }[] = []
  const substituicoes: { velha: unknown; nova: unknown }[] = []
  let aoStream: ((s: MediaStream, de: string, m?: unknown) => void) | null = null
  let ativos = [...peers]
  let senders: Record<string, unknown> = {}

  const salas: Salas = {
    criarAcao: <T,>(nome: string) => {
      const canal: {
        send: (dados: unknown, para?: string) => void
        entregar?: (d: unknown, de: string) => void
      } = { send: vi.fn() }
      acoes.set(nome, canal)
      return {
        send: (dados: T, para?: string) => canal.send(dados, para),
        onMessage: (cb: (dados: T, de: string) => void) => {
          canal.entregar = (d, de) => cb(d as T, de)
        },
      }
    },
    peers: () => ativos,
    donoDe: (peerId) =>
      (ativos.includes(peerId)
        ? ({ getPeers: () => senders } as unknown as SalaTrystero)
        : undefined),
    quemPorRede: () => ({}),
    porRede: () => [],
    aoEntrarPeer: () => {},
    aoSairPeer: () => {},
    aoReceberStream: (cb) => { aoStream = cb },
    publicarStream: (stream, alvos, meta) => {
      // Espelha o Trystero: alvo que não está ativo é descartado em silêncio.
      const alcancaveis = alvos.filter((a) => ativos.includes(a))
      if (alcancaveis.length === 0) return
      publicados.push({ stream, alvos: alcancaveis, meta })
    },
    despublicarStream: (stream, alvos) => { despublicados.push({ stream, alvos }) },
    substituirFaixa: (velha, nova) => { substituicoes.push({ velha, nova }) },
    sair: vi.fn(),
  }

  return {
    salas,
    acoes,
    publicados,
    despublicados,
    substituicoes,
    entregarStream: (s: unknown, de: string, m?: unknown) =>
      aoStream?.(s as MediaStream, de, m),
    definirAtivos: (ids: string[]) => { ativos = ids },
    definirSenders: (mapa: Record<string, unknown>) => { senders = mapa },
  }
}
