import { describe, it, expect, vi } from 'vitest'
import { criarCanalCall } from './canal'
import { criarTransporte } from '../net/transport'
import { criarSalasFalsas } from '../net/salas.fake'
import type { MensagemCall } from './protocolo'

describe('criarCanalCall', () => {
  it('usa um canal próprio, sem encostar nos canais do jogo', () => {
    const { salas, acoes } = criarSalasFalsas()

    criarCanalCall(salas, criarTransporte(salas))

    expect(acoes.has('call')).toBe(true)
    expect(acoes.get('acao')!.send).not.toHaveBeenCalled()
    expect(acoes.get('estado')!.send).not.toHaveBeenCalled()
  })

  it('envia para todos quando não há destinatário', () => {
    const { salas, acoes } = criarSalasFalsas()
    const msg: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: false }

    criarCanalCall(salas, criarTransporte(salas)).enviar(msg)

    expect(acoes.get('call')!.send).toHaveBeenCalledWith(msg, undefined)
  })

  it('envia só para o destinatário quando há um', () => {
    const { salas, acoes } = criarSalasFalsas()
    const msg: MensagemCall = { tipo: 'quero-tela', quero: true }

    criarCanalCall(salas, criarTransporte(salas)).enviar(msg, 'pa')

    expect(acoes.get('call')!.send).toHaveBeenCalledWith(msg, 'pa')
  })

  it('entrega o que chega, com o peerId do remetente', () => {
    const { salas, acoes } = criarSalasFalsas()
    const recebido = vi.fn()
    criarCanalCall(salas, criarTransporte(salas)).aoReceber(recebido)
    const msg: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: true }

    acoes.get('call')!.entregar!(msg, 'pa')

    expect(recebido).toHaveBeenCalledWith(msg, 'pa')
  })

  it('a entrada de peers vem do Transporte, não das salas cruas', () => {
    const { salas } = criarSalasFalsas()
    const transporte = criarTransporte(salas)
    const entrouNoJogo = vi.fn()
    transporte.aoEntrarPeer(entrouNoJogo)

    const canal = criarCanalCall(salas, transporte)
    const entrouNaCall = vi.fn()
    canal.aoEntrarPeer(entrouNaCall)

    // O `Transporte` mantém uma LISTA de ouvintes. Se a call pegasse o gancho
    // cru de cada sala, o segundo consumidor apagaria o primeiro e a eleição
    // de anfitrião pararia de receber avisos, em silêncio.
    expect(typeof canal.aoEntrarPeer).toBe('function')
    expect(entrouNoJogo).not.toHaveBeenCalled()
    expect(entrouNaCall).not.toHaveBeenCalled()
  })
})
