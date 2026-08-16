// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderizar } from './render'
import { REGRAS } from '../game/rules'
import type { Carta, EstadoJogo, Jogador, Mao, Naipe, Valor } from '../game/types'

// `renderizar` só decide *se* anima; a geometria do voo em si (testada por
// coordenadas) não é o que happy-dom consegue simular — ele não faz layout,
// então getBoundingClientRect() sempre voltaria zero. Por isso mockamos
// animate.ts inteiro e observamos só a decisão de chamá-lo ou não.
// `vi.mock` é hoisted pelo vitest para antes dos imports acima, então
// `renderizar` já importa esta versão mockada de `./animate`.
const animarEntrada = vi.fn()
vi.mock('./animate', () => ({
  animarEntrada: (...args: unknown[]) => animarEntrada(...args),
  origemSapata: () => new DOMRect(0, 0, 0, 0),
}))

function carta(valor: Valor, naipe: Naipe): Carta {
  return { valor, naipe }
}

function criarMao(over: Partial<Mao> & Pick<Mao, 'id' | 'cartas'>): Mao {
  return { aposta: 100, dobrada: false, vindaDeSplit: false, encerrada: false, ...over }
}

function criarJogador(over: Partial<Jogador> & Pick<Jogador, 'peerId'>): Jogador {
  return {
    apelido: over.peerId,
    cadeira: null,
    fichas: REGRAS.stackInicial,
    maos: [],
    maoAtiva: 0,
    seguro: 0,
    rodadasInativo: 0,
    desconectadoEm: null,
    decidiuSeguro: false,
    ...over,
  }
}

function criarEstado(over: Partial<EstadoJogo> = {}): EstadoJogo {
  return {
    fase: 'turnos',
    jogadores: [],
    vezDe: null,
    prazoTurno: null,
    maoDealer: [],
    dealerTemOculta: false,
    cartasRestantes: 300,
    hostAtual: 'p1',
    rodada: 1,
    proximoIdMao: 1,
    ...over,
  }
}

const semAcao = () => {}

function estadoComMao(cartas: Carta[]): EstadoJogo {
  return criarEstado({
    jogadores: [
      criarJogador({
        peerId: 'p2', cadeira: 1,
        maos: [criarMao({ id: 'm2', cartas })],
      }),
    ],
  })
}

beforeEach(() => {
  animarEntrada.mockClear()
})

describe('decisão de animar', () => {
  it('anima quando a contagem de cartas cresce (primeira distribuição)', () => {
    const raiz = document.createElement('div')
    renderizar(raiz, estadoComMao([carta('9', 'copas'), carta('8', 'paus')]), 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)
  })

  it('não anima quando não há nenhuma carta em cena', () => {
    const raiz = document.createElement('div')
    renderizar(raiz, criarEstado(), 'eu', semAcao)
    expect(animarEntrada).not.toHaveBeenCalled()
  })

  it('não anima de novo numa segunda renderização com a mesma contagem', () => {
    const raiz = document.createElement('div')
    const estado = estadoComMao([carta('9', 'copas'), carta('8', 'paus')])
    renderizar(raiz, estado, 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)

    renderizar(raiz, estado, 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)
  })

  it('não anima quando a contagem cai (nova rodada limpando as mãos)', () => {
    const raiz = document.createElement('div')
    renderizar(raiz, estadoComMao([carta('9', 'copas'), carta('8', 'paus')]), 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)

    renderizar(raiz, estadoComMao([]), 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)
  })

  it('volta a animar quando uma nova carta chega depois da queda de uma rodada', () => {
    const raiz = document.createElement('div')
    renderizar(raiz, estadoComMao([carta('9', 'copas'), carta('8', 'paus')]), 'eu', semAcao)
    renderizar(raiz, estadoComMao([]), 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)

    renderizar(raiz, estadoComMao([carta('7', 'ouros')]), 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(2)
  })
})

describe('contagem isolada por raiz', () => {
  it('duas raízes diferentes não compartilham a contagem uma da outra', () => {
    const raiz1 = document.createElement('div')
    const raiz2 = document.createElement('div')
    const estado = estadoComMao([carta('9', 'copas'), carta('8', 'paus')])

    renderizar(raiz1, estado, 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(1)

    // Mesmo estado, raiz nova: se a contagem fosse de módulo (compartilhada),
    // isto não contaria como crescimento e não chamaria animarEntrada de novo.
    renderizar(raiz2, estado, 'eu', semAcao)
    expect(animarEntrada).toHaveBeenCalledTimes(2)
  })
})

describe('contagem guardada na raiz, não em módulo', () => {
  it('grava a contagem atual no dataset da própria raiz depois de renderizar', () => {
    const raiz = document.createElement('div')
    renderizar(raiz, estadoComMao([carta('9', 'copas'), carta('8', 'paus')]), 'eu', semAcao)

    const guardado = JSON.parse(raiz.dataset['contagensCartas']!) as Record<string, number>
    expect(guardado['jogador:p2']).toBe(2)
    expect(guardado['dealer']).toBe(0)
  })
})
