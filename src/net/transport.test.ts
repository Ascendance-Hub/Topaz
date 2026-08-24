import { describe, it, expect, vi } from 'vitest'
import { criarTransporte, RELAYS, REDUNDANCIA, relaysDetalhados } from './transport'
import type { Acao } from '../game/types'
import { criarSalasFalsas } from './salas.fake'

describe('criarTransporte', () => {
  it('envia a ação pelo canal "acao"', () => {
    const { salas, acoes } = criarSalasFalsas()
    criarTransporte(salas).enviarAcao({ tipo: 'levantar' })

    expect(acoes.get('acao')!.send).toHaveBeenCalledWith({ tipo: 'levantar' }, undefined)
  })

  it('entrega ao ouvinte o que chega, com o peerId do remetente', () => {
    const { salas, acoes } = criarSalasFalsas()
    const transporte = criarTransporte(salas)
    const recebido = vi.fn()
    transporte.aoReceberAcao(recebido)

    const acao: Acao = { tipo: 'entrar', apelido: 'Alex' }
    acoes.get('acao')!.entregar!(acao, 'p1')

    expect(recebido).toHaveBeenCalledWith(acao, 'p1')
  })

  it('lista os peers a partir da fusão das redes', () => {
    const { salas } = criarSalasFalsas(['p2', 'p3'])

    expect(criarTransporte(salas).peers().sort()).toEqual(['p2', 'p3'])
  })

  it('sair() encerra todas as redes', () => {
    const { salas } = criarSalasFalsas()
    criarTransporte(salas).sair()

    expect(salas.sair).toHaveBeenCalled()
  })

  it('mensagem de chat sai pelo canal "chat", separado do canal do jogo', () => {
    const { salas, acoes } = criarSalasFalsas()
    criarTransporte(salas).enviarMensagem('boa mão')

    expect(acoes.get('chat')!.send).toHaveBeenCalledWith('boa mão', undefined)
    expect(acoes.get('acao')!.send).not.toHaveBeenCalled()
  })
})

describe('relays de sinalização', () => {
  it('usa a lista padrão do Trystero, sem curadoria nossa', () => {
    // Recuo deliberado. Três listas curadas por nós, cada uma com critério
    // melhor que a anterior, e a conexão piorou mesmo assim.
    expect(RELAYS.length).toBe(REDUNDANCIA)
  })

  it('usa MUITO mais que os cinco padrão', () => {
    // Cinco é a omissão da biblioteca, e é pouco quando antivírus bloqueiam
    // endereços diferentes em cada máquina: a interseção entre duas pessoas
    // desmorona. O que faltava não era escolher melhor, era ter mais de onde
    // escolher.
    expect(REDUNDANCIA).toBeGreaterThanOrEqual(15)
  })

  it('só aceita endereços wss', () => {
    // Página em https não abre socket ws sem TLS: o navegador barra antes de
    // chegar à rede.
    for (const url of RELAYS) expect(url.startsWith('wss://')).toBe(true)
  })

  it('não repete endereço', () => {
    expect(new Set(RELAYS).size).toBe(RELAYS.length)
  })
})

describe('detalhe dos relays', () => {
  it('lista todos os relays configurados, conectados ou não', () => {
    // Sem `getRelaySockets` real (fora do navegador), o detalhe cai para
    // "nenhum conectado" — mas a lista precisa continuar completa, senão
    // comparar dois computadores fica impossível.
    const detalhe = relaysDetalhados()

    expect(detalhe).toHaveLength(RELAYS.length)
    expect(detalhe.map((d) => d.url).sort()).toEqual([...RELAYS].sort())
  })

  it('cada item diz se está conectado', () => {
    for (const item of relaysDetalhados()) {
      expect(typeof item.conectado).toBe('boolean')
    }
  })

  it('o nome curto é o host, sem o wss://', () => {
    // É esse nome que duas pessoas vão comparar entre si na tela; a URL
    // inteira ocuparia espaço sem acrescentar nada.
    for (const item of relaysDetalhados()) {
      expect(item.nome.startsWith('wss://')).toBe(false)
      expect(item.url).toContain(item.nome)
    }
  })
})
