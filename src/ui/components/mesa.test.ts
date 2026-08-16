// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarMesa } from './mesa'
import { REGRAS } from '../../game/rules'
import type { Carta, EstadoJogo, Jogador, Mao, Naipe, Valor } from '../../game/types'

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

function outrosSentados(n: number): Jogador[] {
  return Array.from({ length: n }, (_, i) =>
    criarJogador({
      peerId: `p${i + 2}`,
      cadeira: i + 1,
      maos: [criarMao({ id: `m${i + 2}`, cartas: [carta('9', 'copas'), carta('8', 'paus')] })],
    }),
  )
}

const semAcao = () => {}

describe('grade de outros jogadores', () => {
  it('renderiza exatamente os jogadores sentados que não sou eu, sem espectadores nem cadeiras vazias', () => {
    const estado = criarEstado({
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
        criarJogador({
          peerId: 'p2', apelido: 'Bruno', cadeira: 1,
          maos: [criarMao({ id: 'm2', cartas: [carta('7', 'ouros'), carta('8', 'espadas')] })],
        }),
        criarJogador({ peerId: 'p3', apelido: 'Espectador' }), // cadeira null: não sentado
      ],
    })

    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const pecas = mesa.querySelectorAll('.grade .peca')

    expect(pecas).toHaveLength(1)
    expect(pecas[0]!.querySelector('.nome')?.textContent).toBe('Bruno')
  })
})

describe('classe "poucos" na grade', () => {
  it.each([1, 2, 3])('com %i outro(s) jogador(es), a grade recebe a classe "poucos"', (n) => {
    const estado = criarEstado({
      jogadores: [criarJogador({ peerId: 'eu', cadeira: 0 }), ...outrosSentados(n)],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelector('.grade')?.classList.contains('poucos')).toBe(true)
  })

  it.each([4, 5, 6])('com %i outros jogadores, a grade não recebe a classe "poucos"', (n) => {
    const estado = criarEstado({
      jogadores: [criarJogador({ peerId: 'eu', cadeira: 0 }), ...outrosSentados(n)],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelector('.grade')?.classList.contains('poucos')).toBe(false)
  })
})

describe('mesa sem outros jogadores', () => {
  it('mostra a mensagem de espera em vez da grade', () => {
    const estado = criarEstado({
      fase: 'aguardando',
      jogadores: [criarJogador({ peerId: 'eu', cadeira: 0 })],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelector('.grade')).toBeNull()
    expect(mesa.querySelector('.vazio')).not.toBeNull()
  })
})

describe('destaque de turno', () => {
  it('marca apenas o jogador da vez com a classe "vez", ninguém mais', () => {
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'p3',
      jogadores: [
        criarJogador({ peerId: 'eu', cadeira: 0 }),
        criarJogador({
          peerId: 'p2', cadeira: 1,
          maos: [criarMao({ id: 'm2', cartas: [carta('9', 'copas'), carta('8', 'paus')] })],
        }),
        criarJogador({
          peerId: 'p3', cadeira: 2,
          maos: [criarMao({ id: 'm3', cartas: [carta('7', 'copas'), carta('6', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const comDestaque = mesa.querySelectorAll('.grade .peca.vez')
    expect(comDestaque).toHaveLength(1)
    expect(comDestaque[0]!.querySelector('.nome')?.textContent).toBe('p3')
  })
})

describe('marcação de mão encerrada', () => {
  it('marca como encerrada quem parou', () => {
    const estado = criarEstado({
      jogadores: [
        criarJogador({ peerId: 'eu', cadeira: 0 }),
        criarJogador({
          peerId: 'p2', cadeira: 1,
          maos: [criarMao({
            id: 'm2', cartas: [carta('10', 'copas'), carta('8', 'paus')], encerrada: true,
          })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelector('.peca')?.classList.contains('encerrada')).toBe(true)
  })

  it('marca como encerrada quem estourou, mesmo com a mão não marcada como encerrada', () => {
    const estado = criarEstado({
      jogadores: [
        criarJogador({ peerId: 'eu', cadeira: 0 }),
        criarJogador({
          peerId: 'p2', cadeira: 1,
          maos: [criarMao({
            id: 'm2',
            cartas: [carta('10', 'copas'), carta('9', 'paus'), carta('5', 'espadas')],
            encerrada: false,
          })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelector('.peca')?.classList.contains('encerrada')).toBe(true)
  })

  it('não marca quem ainda está jogando normalmente', () => {
    const estado = criarEstado({
      jogadores: [
        criarJogador({ peerId: 'eu', cadeira: 0 }),
        criarJogador({
          peerId: 'p2', cadeira: 1,
          maos: [criarMao({
            id: 'm2', cartas: [carta('10', 'copas'), carta('8', 'paus')], encerrada: false,
          })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelector('.peca')?.classList.contains('encerrada')).toBe(false)
  })
})

describe('botões de ação do próprio jogador', () => {
  it('não mostra nenhum botão de ação de mão quando não é minha vez', () => {
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'p2',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
        criarJogador({
          peerId: 'p2', cadeira: 1,
          maos: [criarMao({ id: 'm2', cartas: [carta('7', 'ouros'), carta('8', 'espadas')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelectorAll('.painel-proprio .acoes button')).toHaveLength(0)
  })

  it('mostra apenas as ações permitidas pelas regras, sem oferecer Dividir numa mão que não pode dividir', () => {
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'eu',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const acoes = [...mesa.querySelectorAll('.painel-proprio .acoes button')]
      .map((b) => (b as HTMLElement).dataset['acao'])
    expect(acoes.sort()).toEqual(['dobrar', 'parar', 'pedir'])
    expect(acoes).not.toContain('dividir')
  })

  it('oferece Dividir quando a mão realmente pode dividir', () => {
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'eu',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('8', 'copas'), carta('8', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const acoes = [...mesa.querySelectorAll('.painel-proprio .acoes button')]
      .map((b) => (b as HTMLElement).dataset['acao'])
    expect(acoes).toContain('dividir')
  })

  it('não mostra ações quando a mão já está encerrada, mesmo sendo minha vez', () => {
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'eu',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({
            id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')], encerrada: true,
          })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelectorAll('.painel-proprio .acoes button')).toHaveLength(0)
  })

  it('chama aoAgir com a ação e a mão certas ao clicar em Pedir', () => {
    const aoAgir = vi.fn()
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'eu',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', aoAgir)
    const botaoPedir = mesa.querySelector<HTMLButtonElement>('[data-acao="pedir"]')!
    botaoPedir.click()
    expect(aoAgir).toHaveBeenCalledWith({ tipo: 'pedir', maoId: 'm1' })
  })
})

describe('botões de aposta', () => {
  it('aparecem na fase de apostas e ficam desabilitados acima do saldo disponível', () => {
    const estado = criarEstado({
      fase: 'apostas',
      jogadores: [criarJogador({ peerId: 'eu', cadeira: 0, fichas: 50 })],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const botoesAposta = [...mesa.querySelectorAll<HTMLButtonElement>('[data-acao="apostar"]')]

    expect(botoesAposta.map((b) => b.dataset['valor'])).toEqual(REGRAS.fichas.map(String))
    for (const botao of botoesAposta) {
      const valor = Number(botao.dataset['valor'])
      expect(botao.disabled).toBe(valor > 50)
    }
  })

  it('não aparecem fora da fase de apostas', () => {
    const estado = criarEstado({
      fase: 'turnos', vezDe: 'eu',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelectorAll('[data-acao="apostar"]')).toHaveLength(0)
  })
})

describe('espectador', () => {
  it('vê um convite para sentar em vez do painel de mão', () => {
    const estado = criarEstado({
      fase: 'apostas',
      jogadores: [criarJogador({ peerId: 'eu', cadeira: null })],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const painel = mesa.querySelector('.painel-proprio')!

    expect(painel.querySelector('.mao-cartas')).toBeNull()
    const botaoSentar = painel.querySelector<HTMLButtonElement>('[data-acao="sentar"]')!
    expect(botaoSentar).not.toBeNull()
    expect(botaoSentar.disabled).toBe(false)
  })

  it('desabilita o convite quando a mesa está cheia', () => {
    const jogadores = Array.from({ length: REGRAS.maxCadeiras }, (_, i) =>
      criarJogador({ peerId: `p${i}`, cadeira: i }))
    const estado = criarEstado({
      fase: 'apostas',
      jogadores: [...jogadores, criarJogador({ peerId: 'eu', cadeira: null })],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const botaoSentar = mesa.querySelector<HTMLButtonElement>('[data-acao="sentar"]')!
    expect(botaoSentar.disabled).toBe(true)
  })
})

describe('carta oculta do dealer', () => {
  it('renderiza a carta oculta virada para baixo e o total mostrado cobre só a carta visível', () => {
    const estado = criarEstado({
      maoDealer: [carta('K', 'espadas')],
      dealerTemOculta: true,
      jogadores: [criarJogador({ peerId: 'eu', cadeira: 0 })],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const cartasDealer = mesa.querySelectorAll('.dealer .mao-cartas .carta')

    expect(cartasDealer).toHaveLength(2)
    expect(cartasDealer[0]!.classList.contains('verso')).toBe(false)
    expect(cartasDealer[1]!.classList.contains('verso')).toBe(true)

    const totalEl = mesa.querySelector<HTMLElement>('.dealer .total')!
    expect(totalEl.dataset['total']).toBe('10')
  })

  it('quando a oculta é revelada, nenhuma carta fica virada e o total cobre a mão inteira', () => {
    const estado = criarEstado({
      maoDealer: [carta('K', 'espadas'), carta('7', 'copas')],
      dealerTemOculta: false,
      jogadores: [criarJogador({ peerId: 'eu', cadeira: 0 })],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    const cartasDealer = mesa.querySelectorAll('.dealer .mao-cartas .carta')

    expect(cartasDealer).toHaveLength(2)
    expect([...cartasDealer].every((c) => !c.classList.contains('verso'))).toBe(true)

    const totalEl = mesa.querySelector<HTMLElement>('.dealer .total')!
    expect(totalEl.dataset['total']).toBe('17')
  })
})

describe('seguro', () => {
  it('mostra os botões de seguro apenas para quem ainda não decidiu', () => {
    const estado = criarEstado({
      fase: 'seguro',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0, decidiuSeguro: false,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelectorAll('[data-acao="seguro"]')).toHaveLength(2)
  })

  it('some com os botões de seguro depois que o jogador já decidiu, mesmo sem ter comprado seguro', () => {
    // Regressão: usar `seguro === 0` como gatilho reexibiria os botões
    // para quem decidiu e dispensou, já que dispensar também deixa `seguro` em 0.
    const estado = criarEstado({
      fase: 'seguro',
      jogadores: [
        criarJogador({
          peerId: 'eu', cadeira: 0, decidiuSeguro: true, seguro: 0,
          maos: [criarMao({ id: 'm1', cartas: [carta('10', 'copas'), carta('9', 'paus')] })],
        }),
      ],
    })
    const mesa = renderizarMesa(estado, 'eu', semAcao)
    expect(mesa.querySelectorAll('[data-acao="seguro"]')).toHaveLength(0)
  })
})
