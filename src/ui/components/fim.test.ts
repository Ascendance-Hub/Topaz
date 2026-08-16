// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarFim } from './fim'
import { REGRAS } from '../../game/rules'
import type { EstadoJogo, Jogador } from '../../game/types'

function jogador(peerId: string, apelido: string, fichas: number, eliminadoEm: number | null): Jogador {
  return {
    peerId, apelido, cadeira: null, fichas, maos: [], maoAtiva: 0, seguro: 0,
    rodadasInativo: 0, desconectadoEm: null, decidiuSeguro: false, eliminadoEm,
  }
}

function estadoFim(vencedor: string | null, hostAtual = 'p1'): EstadoJogo {
  const jogadores = [
    jogador('p1', 'Alex', 480, null),
    jogador('p2', 'Bruno', 1520, null),
    jogador('p3', 'Carla', 0, 14),
  ]
  return {
    fase: 'fim', jogadores, vezDe: null, prazoTurno: null, maoDealer: [],
    dealerTemOculta: false, cartasRestantes: 0, hostAtual, rodada: 20,
    proximoIdMao: 1, vencedor, naPartida: ['p1', 'p2', 'p3'],
  }
}

describe('tela de fim', () => {
  it('lista todos os jogadores da partida com a posição', () => {
    const el = renderizarFim(estadoFim('p2'), 'p1', vi.fn())
    const linhas = el.querySelectorAll('[data-colocacao]')
    expect(linhas).toHaveLength(3)
    expect(linhas[0]!.textContent).toContain('Bruno')
  })

  it('só o anfitrião vê Nova partida', () => {
    const doHost = renderizarFim(estadoFim('p2', 'p1'), 'p1', vi.fn())
    expect(doHost.querySelector('[data-acao="novaPartida"]')).not.toBeNull()

    const doCliente = renderizarFim(estadoFim('p2', 'p1'), 'p2', vi.fn())
    expect(doCliente.querySelector('[data-acao="novaPartida"]')).toBeNull()
  })

  it('despacha novaPartida ao clicar', () => {
    const aoAgir = vi.fn()
    const el = renderizarFim(estadoFim('p2'), 'p1', aoAgir)
    el.querySelector<HTMLButtonElement>('[data-acao="novaPartida"]')!.click()
    expect(aoAgir).toHaveBeenCalledWith({ tipo: 'novaPartida' })
  })

  it('sem vencedor, não anuncia ninguém como vencedor', () => {
    const el = renderizarFim(estadoFim(null), 'p1', vi.fn())
    expect(el.querySelector('[data-vencedor]')).toBeNull()
  })

  it('anuncia empate no alvo em vez de dizer que a mesa quebrou', () => {
    // Spec §6: dois cruzando o alvo com fichas idênticas é empate de verdade,
    // `vencedor` fica `null` — o mesmo `null` de "ninguém sobrou". A tela
    // tratava só o segundo caso e dizia que a mesa quebrou junto logo acima
    // de um placar com dois jogadores de 1600 fichas.
    const estado = estadoFim(null)
    estado.jogadores = [
      jogador('p1', 'Alex', REGRAS.alvoVitoria + 100, null),
      jogador('p2', 'Bruno', REGRAS.alvoVitoria + 100, null),
      jogador('p3', 'Carla', 0, 12),
    ]
    const el = renderizarFim(estado, 'p1', vi.fn())
    const sub = el.querySelector('.sub')!

    expect(sub.textContent).not.toContain('quebrou')
    expect(sub.textContent).toContain('Alex')
    expect(sub.textContent).toContain('Bruno')
    expect(sub.textContent).toContain('1.600')
    expect(el.querySelector('[data-vencedor]')).toBeNull()
  })

  it('continua dizendo que a mesa quebrou quando ninguém sobrou com fichas', () => {
    const estado = estadoFim(null)
    estado.jogadores = [
      jogador('p1', 'Alex', 0, 20), jogador('p2', 'Bruno', 0, 20),
    ]
    const el = renderizarFim(estado, 'p1', vi.fn())
    expect(el.querySelector('.sub')!.textContent).toContain('quebrou')
  })

  it('formata o saldo como a mesa formata, com separador de milhar', () => {
    const el = renderizarFim(estadoFim('p2'), 'p1', vi.fn())
    const saldos = [...el.querySelectorAll('.saldo')].map((s) => s.textContent)
    expect(saldos).toContain('1.520')
  })

  it('marca os empatados com a mesma posição', () => {
    const estado = estadoFim(null)
    estado.jogadores = [
      jogador('p1', 'Alex', 0, 20), jogador('p2', 'Bruno', 0, 20),
      jogador('p3', 'Carla', 0, 6),
    ]
    const el = renderizarFim(estado, 'p1', vi.fn())
    const posicoes = [...el.querySelectorAll('[data-colocacao]')]
      .map((l) => l.getAttribute('data-colocacao'))
    expect(posicoes).toEqual(['1', '1', '3'])
  })
})
