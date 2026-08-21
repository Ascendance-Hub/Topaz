import { describe, it, expect, vi } from 'vitest'
import { criarTransporte } from './transport'
import type { SalaTrystero } from './transport'
import type { Acao } from '../game/types'

type AcaoFalsa = {
  send: ReturnType<typeof vi.fn>
  onMessage: ((dados: never, contexto: { peerId: string }) => void) | null
}

/**
 * Uma sala do Trystero de mentira: guarda os canais criados por `makeAction`
 * para que o teste possa disparar mensagens de fora, como o relay faria.
 *
 * Só é possível porque `criarTransporte` passou a receber a sala em vez de
 * abri-la — antes disso este arquivo exigiria um navegador.
 */
function criarSalaFalsa() {
  const canais = new Map<string, AcaoFalsa>()
  const bruta = {
    makeAction: (nome: string) => {
      const canal: AcaoFalsa = { send: vi.fn(), onMessage: null }
      canais.set(nome, canal)
      return canal
    },
    getPeers: () => ({ p2: {}, p3: {} }),
    leave: vi.fn(),
    onPeerJoin: null as ((id: string) => void) | null,
    onPeerLeave: null as ((id: string) => void) | null,
  }
  return { sala: bruta as unknown as SalaTrystero, canais, bruta }
}

describe('criarTransporte', () => {
  it('envia a ação pelo canal "acao" da sala que recebeu', () => {
    const { sala, canais } = criarSalaFalsa()
    const transporte = criarTransporte(sala)

    transporte.enviarAcao({ tipo: 'levantar' })

    expect(canais.get('acao')!.send).toHaveBeenCalledWith({ tipo: 'levantar' })
  })

  it('entrega ao ouvinte o que chega pelo canal, com o peerId do remetente', () => {
    const { sala, canais } = criarSalaFalsa()
    const transporte = criarTransporte(sala)
    const recebido = vi.fn()
    transporte.aoReceberAcao(recebido)

    const acao: Acao = { tipo: 'entrar', apelido: 'Alex' }
    canais.get('acao')!.onMessage!(acao as never, { peerId: 'p1' })

    expect(recebido).toHaveBeenCalledWith(acao, 'p1')
  })

  it('lista os peers a partir do getPeers da sala', () => {
    const { sala } = criarSalaFalsa()

    expect(criarTransporte(sala).peers().sort()).toEqual(['p2', 'p3'])
  })

  it('sair() encerra a sala que recebeu', () => {
    const { sala, bruta } = criarSalaFalsa()

    criarTransporte(sala).sair()

    expect(bruta.leave).toHaveBeenCalled()
  })

  it('mensagem de chat sai pelo canal "chat", separado do canal do jogo', () => {
    const { sala, canais } = criarSalaFalsa()

    criarTransporte(sala).enviarMensagem('boa mão')

    expect(canais.get('chat')!.send).toHaveBeenCalledWith('boa mão')
    expect(canais.get('acao')!.send).not.toHaveBeenCalled()
  })
})

describe('convivência com outros consumidores da mesma sala', () => {
  it('continua avisando entrada de peer a todos os ouvintes, não só ao último', () => {
    const { sala, bruta } = criarSalaFalsa()
    const transporte = criarTransporte(sala)
    const entrouNoJogo = vi.fn()
    transporte.aoEntrarPeer(entrouNoJogo)

    // Um segundo módulo (a call) pede a mesma notificação.
    const entrouNaCall = vi.fn()
    transporte.aoEntrarPeer(entrouNaCall)

    bruta.onPeerJoin!('p2')

    expect(entrouNoJogo).toHaveBeenCalledWith('p2')
    expect(entrouNaCall).toHaveBeenCalledWith('p2')
  })
})
