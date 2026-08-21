import { describe, it, expect, vi } from 'vitest'
import { criarCanalCall } from './canal'
import { criarTransporte } from '../net/transport'
import type { SalaTrystero } from '../net/transport'
import type { MensagemCall } from './protocolo'

type AcaoFalsa = {
  send: ReturnType<typeof vi.fn>
  onMessage: ((dados: never, contexto: { peerId: string }) => void) | null
}

function criarSalaFalsa() {
  const canais = new Map<string, AcaoFalsa>()
  const bruta = {
    makeAction: (nome: string) => {
      const canal: AcaoFalsa = { send: vi.fn(), onMessage: null }
      canais.set(nome, canal)
      return canal
    },
    getPeers: () => ({ p2: {} }),
    leave: vi.fn(),
    onPeerJoin: null as ((id: string) => void) | null,
    onPeerLeave: null as ((id: string) => void) | null,
  }
  return { sala: bruta as unknown as SalaTrystero, canais, bruta }
}

describe('criarCanalCall', () => {
  it('usa um canal próprio, sem encostar nos canais do jogo', () => {
    const { sala, canais } = criarSalaFalsa()

    criarCanalCall(sala, criarTransporte(sala))

    expect(canais.has('call')).toBe(true)
    // O transporte cria os do jogo; o que importa é a call não mandar nada por
    // eles.
    expect(canais.get('acao')!.send).not.toHaveBeenCalled()
    expect(canais.get('estado')!.send).not.toHaveBeenCalled()
  })

  it('envia para todos quando não há destinatário', () => {
    const { sala, canais } = criarSalaFalsa()
    const msg: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: false }

    criarCanalCall(sala, criarTransporte(sala)).enviar(msg)

    expect(canais.get('call')!.send).toHaveBeenCalledWith(msg, undefined)
  })

  it('envia só para o destinatário quando há um', () => {
    const { sala, canais } = criarSalaFalsa()
    const msg: MensagemCall = { tipo: 'quero-tela', quero: true }

    criarCanalCall(sala, criarTransporte(sala)).enviar(msg, 'p2')

    expect(canais.get('call')!.send).toHaveBeenCalledWith(msg, { target: 'p2' })
  })

  it('entrega o que chega, com o peerId do remetente', () => {
    const { sala, canais } = criarSalaFalsa()
    const recebido = vi.fn()
    criarCanalCall(sala, criarTransporte(sala)).aoReceber(recebido)
    const msg: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: true }

    canais.get('call')!.onMessage!(msg as never, { peerId: 'p2' })

    expect(recebido).toHaveBeenCalledWith(msg, 'p2')
  })

  it('repassa entrada e saída de peers sem roubar os handlers do jogo', () => {
    const { sala, bruta } = criarSalaFalsa()
    const transporte = criarTransporte(sala)
    const entrouNoJogo = vi.fn()
    transporte.aoEntrarPeer(entrouNoJogo)

    const entrouNaCall = vi.fn()
    const saiuNaCall = vi.fn()
    const canal = criarCanalCall(sala, transporte)
    canal.aoEntrarPeer(entrouNaCall)
    canal.aoSairPeer(saiuNaCall)

    bruta.onPeerJoin!('p2')
    bruta.onPeerLeave!('p2')

    expect(entrouNaCall).toHaveBeenCalledWith('p2')
    expect(saiuNaCall).toHaveBeenCalledWith('p2')
    // O Trystero guarda UM handler para `onPeerJoin`. Se a call atribuísse o
    // dela, a eleição de anfitrião parava de receber avisos e a sala quebrava
    // em silêncio — este é o teste que impede isso de voltar.
    expect(entrouNoJogo).toHaveBeenCalledWith('p2')
  })
})
