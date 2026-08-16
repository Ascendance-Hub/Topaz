import { describe, it, expect } from 'vitest'
import { classificacao } from './classificacao'
import { REGRAS } from './rules'
import type { EstadoJogo, Jogador } from './types'

/**
 * Cadeira derivada do id, uma por jogador: `cadeira: 0` para todos punha três
 * sobreviventes na mesma cadeira, estado que o motor nunca produz. Nenhuma
 * das funções aqui lê `cadeira` — mas é esse hábito de fixture impossível que
 * escondeu dois defeitos críticos por 199 testes na entrega anterior.
 */
function jogador(peerId: string, fichas: number, eliminadoEm: number | null): Jogador {
  return {
    peerId, apelido: peerId.toUpperCase(),
    cadeira: eliminadoEm === null ? Number(peerId.slice(1)) - 1 : null,
    fichas, maos: [], maoAtiva: 0, seguro: 0, rodadasInativo: 0,
    desconectadoEm: null, decidiuSeguro: false, eliminadoEm,
  }
}

function estadoCom(jogadores: Jogador[], vencedor: string | null): EstadoJogo {
  return {
    fase: 'fim', jogadores, vezDe: null, prazoTurno: null, maoDealer: [],
    dealerTemOculta: false, cartasRestantes: 0, hostAtual: 'p1', rodada: 20,
    proximoIdMao: 1, vencedor, naPartida: jogadores.map((j) => j.peerId),
  }
}

describe('classificacao', () => {
  it('põe o vencedor em primeiro', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 400, null), jogador('p2', 1520, null),
    ], 'p2'))
    expect(r[0]!.posicao).toBe(1)
    expect(r[0]!.jogadores.map((j) => j.peerId)).toEqual(['p2'])
  })

  it('ordena sobreviventes por saldo decrescente', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 300, null), jogador('p2', 900, null), jogador('p3', 600, null),
    ], null))
    expect(r.map((c) => c.jogadores[0]!.peerId)).toEqual(['p2', 'p3', 'p1'])
  })

  it('ordena eliminados por rodada de queda decrescente', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 0, 6), jogador('p2', 0, 14),
    ], null))
    expect(r.map((c) => c.jogadores[0]!.peerId)).toEqual(['p2', 'p1'])
  })

  it('empata quem caiu na mesma rodada e pula a numeração', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 0, 20), jogador('p2', 0, 20), jogador('p3', 0, 20),
      jogador('p4', 0, 6),
    ], null))
    expect(r).toHaveLength(2)
    expect(r[0]!.posicao).toBe(1)
    expect(r[0]!.jogadores.map((j) => j.peerId).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(r[1]!.posicao).toBe(4)
    expect(r[1]!.jogadores.map((j) => j.peerId)).toEqual(['p4'])
  })

  it('empata sobreviventes com o mesmo saldo', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 500, null), jogador('p2', 500, null), jogador('p3', 200, null),
    ], null))
    expect(r[0]!.jogadores).toHaveLength(2)
    expect(r[1]!.posicao).toBe(3)
  })

  it('sobreviventes vêm sempre antes de eliminados', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 0, 19), jogador('p2', REGRAS.apostaMin, null),
    ], null))
    expect(r[0]!.jogadores[0]!.peerId).toBe('p2')
  })

  it('quem está em jogadores mas não em naPartida fica de fora', () => {
    const estado = estadoCom([jogador('p1', 500, null)], null)
    // Espectador de verdade: entrou na sala, nunca sentou nem entrou na
    // partida.
    const forasteiro = jogador('p5', 1000, null)
    forasteiro.cadeira = null
    estado.jogadores.push(forasteiro)
    const r = classificacao(estado)
    expect(r.flatMap((c) => c.jogadores).map((j) => j.peerId)).toEqual(['p1'])
  })
})
