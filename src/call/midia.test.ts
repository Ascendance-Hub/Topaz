import { describe, it, expect, vi } from 'vitest'
import { Midia } from './midia'
import type { SalaTrystero } from '../net/transport'

/**
 * Sala falsa que espelha o pareamento REAL do Trystero, e é isso que dá valor
 * a este arquivo.
 *
 * Em `media.mjs`, quem publica com `addStream` alimenta `pendingStreamMetas`,
 * e essa fila é consumida por `receiveRemoteStream`, que dispara
 * `onPeerStream`. Já `onPeerTrack` é alimentado por `pendingTrackMetas`, que
 * só existe quando o remetente usou `addTrack`. Publicar de um jeito e escutar
 * do outro faz a mídia sumir em silêncio — foi exatamente o bug que os
 * jogadores encontraram: dados chegavam, áudio e vídeo não.
 */
function criarSalaFalsa() {
  const publicados: { stream: unknown; opcoes: unknown }[] = []
  const sala = {
    onPeerStream: null as ((stream: unknown, peerId: string, meta?: unknown) => void) | null,
    onPeerTrack: null as unknown,
    addStream: (stream: unknown, opcoes: unknown) => {
      publicados.push({ stream, opcoes })
    },
    removeStream: vi.fn(),
    getPeers: () => ({}),
  }

  /** Entrega ao destinatário pelo MESMO caminho que o `addStream` alimenta. */
  function entregar(stream: unknown, de: string, meta?: unknown): void {
    sala.onPeerStream?.(stream, de, meta)
  }

  return { sala: sala as unknown as SalaTrystero, bruta: sala, publicados, entregar }
}

describe('Midia — recebimento', () => {
  it('entrega ao consumidor a mídia publicada com addStream', () => {
    const { sala, entregar } = criarSalaFalsa()
    const midia = new Midia(sala)
    const recebido = vi.fn()
    midia.aoReceberMidia(recebido)

    const stream = { id: 'stream-1' }
    entregar(stream, 'pa', { tipo: 'microfone' })

    expect(recebido).toHaveBeenCalledWith(stream, 'pa', { tipo: 'microfone' })
  })

  it('repassa a metadata, que é como se distingue microfone de tela', () => {
    const { sala, entregar } = criarSalaFalsa()
    const midia = new Midia(sala)
    const recebido = vi.fn()
    midia.aoReceberMidia(recebido)

    entregar({ id: 'tela-1' }, 'pa', { tipo: 'tela' })

    expect(recebido.mock.calls[0]![2]).toEqual({ tipo: 'tela' })
  })

  it('entrega a todos os consumidores registrados, não só ao último', () => {
    const { sala, entregar } = criarSalaFalsa()
    const midia = new Midia(sala)
    const primeiro = vi.fn()
    const segundo = vi.fn()
    midia.aoReceberMidia(primeiro)
    midia.aoReceberMidia(segundo)

    entregar({ id: 's' }, 'pa')

    expect(primeiro).toHaveBeenCalled()
    expect(segundo).toHaveBeenCalled()
  })
})

describe('Midia — publicação da tela', () => {
  it('não publica para ninguém antes de alguém pedir para assistir', () => {
    const { sala, publicados } = criarSalaFalsa()
    const midia = new Midia(sala)

    midia.publicarTelaPara('pa')

    // Sem tela capturada, não há o que publicar — e é isso que garante que o
    // codificador só liga depois do pedido.
    expect(publicados).toHaveLength(0)
  })
})
