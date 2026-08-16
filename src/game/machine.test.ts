import { describe, it, expect } from 'vitest'
import { criarContexto, aplicar, avancar, cartasVisiveis } from './machine'
import { rngSemente } from './shoe'
import { REGRAS } from './rules'
import type { Contexto } from './machine'

const RNG = () => rngSemente(1234)

function comDoisJogadores(): Contexto {
  let ctx = criarContexto('p1', RNG())
  ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
  ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
  ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
  ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
  return ctx
}

describe('criarContexto', () => {
  it('começa aguardando, sem jogadores', () => {
    const ctx = criarContexto('p1', RNG())
    expect(ctx.estado.fase).toBe('aguardando')
    expect(ctx.estado.jogadores).toEqual([])
  })

  it('começa com a sapata cheia', () => {
    const ctx = criarContexto('p1', RNG())
    expect(ctx.sapata).toHaveLength(REGRAS.numBaralhos * 52)
  })
})

describe('entrar e sentar', () => {
  it('adiciona o jogador como espectador', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    expect(ctx.estado.jogadores[0]).toMatchObject({
      peerId: 'p1', apelido: 'Alex', cadeira: null, fichas: REGRAS.stackInicial,
    })
  })

  it('senta o jogador na cadeira pedida', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 3 }, 0, RNG())
    expect(ctx.estado.jogadores[0]!.cadeira).toBe(3)
  })

  it('recusa cadeira já ocupada', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBe(1)
  })

  it('vai para apostas com dois jogadores sentados', () => {
    expect(comDoisJogadores().estado.fase).toBe('apostas')
  })
})

describe('apostas', () => {
  it('debita as fichas ao apostar', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    expect(p1.fichas).toBe(REGRAS.stackInicial - 100)
    expect(p1.maos[0]!.aposta).toBe(100)
  })

  it('recusa aposta abaixo do mínimo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 10 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.maos).toHaveLength(0)
  })

  it('recusa aposta acima do máximo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 900 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.maos).toHaveLength(0)
  })

  it('distribui quando todos apostaram', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    expect(ctx.estado.jogadores[0]!.maos[0]!.cartas).toHaveLength(2)
    expect(ctx.estado.maoDealer).toHaveLength(1)
    expect(ctx.estado.dealerTemOculta).toBe(true)
    expect(ctx.ocultaDealer).not.toBeNull()
  })

  it('deixa de fora quem não apostou até o prazo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.fase).not.toBe('apostas')
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.maos).toHaveLength(0)
  })
})

describe('sapata nunca vaza no estado', () => {
  it('EstadoJogo não contém a sapata nem a carta oculta', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    const serializado = JSON.stringify(ctx.estado)
    expect(serializado).not.toContain('sapata')
    expect(serializado).not.toContain('oculta')
    expect(ctx.estado.maoDealer).toHaveLength(1)
  })
})

describe('turnos', () => {
  function emTurnos(): Contexto {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    return avancar(ctx, 0, RNG())
  }

  it('dá a vez ao jogador da primeira cadeira', () => {
    expect(emTurnos().estado.vezDe).toBe('p1')
  })

  it('define prazo do turno', () => {
    const ctx = emTurnos()
    expect(ctx.estado.prazoTurno).toBe(REGRAS.segundosTurno * 1000)
  })

  it('adiciona carta ao pedir', () => {
    let ctx = emTurnos()
    const maoId = ctx.estado.jogadores[0]!.maos[0]!.id
    ctx = aplicar(ctx, 'p1', { tipo: 'pedir', maoId }, 0, RNG())
    expect(ctx.estado.jogadores[0]!.maos[0]!.cartas).toHaveLength(3)
  })

  it('ignora ação de quem não é a vez', () => {
    let ctx = emTurnos()
    const maoId = ctx.estado.jogadores[1]!.maos[0]!.id
    ctx = aplicar(ctx, 'p2', { tipo: 'pedir', maoId }, 0, RNG())
    expect(ctx.estado.jogadores[1]!.maos[0]!.cartas).toHaveLength(2)
  })

  it('passa a vez ao parar', () => {
    let ctx = emTurnos()
    const maoId = ctx.estado.jogadores[0]!.maos[0]!.id
    ctx = aplicar(ctx, 'p1', { tipo: 'parar', maoId }, 0, RNG())
    expect(ctx.estado.vezDe).toBe('p2')
  })

  it('para automaticamente quando o prazo expira', () => {
    let ctx = emTurnos()
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.vezDe).toBe('p2')
    expect(ctx.estado.jogadores[0]!.maos[0]!.encerrada).toBe(true)
    expect(ctx.estado.jogadores[0]!.rodadasInativo).toBe(1)
  })

  it('vira espectador após duas rodadas inativo', () => {
    let ctx = emTurnos()
    ctx.estado.jogadores[0]!.rodadasInativo = 1
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.jogadores[0]!.cadeira).toBeNull()
  })
})

describe('dividir', () => {
  it('cria duas mãos e debita a aposta extra', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    // força um par para tornar o teste determinístico
    const jogador = ctx.estado.jogadores[0]!
    jogador.maos[0]!.cartas = [
      { valor: '8', naipe: 'copas' },
      { valor: '8', naipe: 'paus' },
    ]
    const maoId = jogador.maos[0]!.id
    const fichasAntes = jogador.fichas

    ctx = aplicar(ctx, 'p1', { tipo: 'dividir', maoId }, 0, RNG())

    const depois = ctx.estado.jogadores[0]!
    expect(depois.maos).toHaveLength(2)
    expect(depois.maos[0]!.cartas).toHaveLength(2)
    expect(depois.maos[1]!.cartas).toHaveLength(2)
    expect(depois.maos[1]!.vindaDeSplit).toBe(true)
    expect(depois.fichas).toBe(fichasAntes - 100)
  })
})

describe('cartasVisiveis', () => {
  it('junta cartas de todas as mãos e do dealer', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    // 2 jogadores x 2 cartas + 1 do dealer
    expect(cartasVisiveis(ctx.estado)).toHaveLength(5)
  })
})

describe('acerto', () => {
  it('credita o pagamento e volta para apostas', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    let guarda = 0
    while (ctx.estado.fase !== 'apostas' && guarda++ < 50) {
      if (ctx.estado.vezDe) {
        const jogador = ctx.estado.jogadores.find((j) => j.peerId === ctx.estado.vezDe)!
        const m = jogador.maos[jogador.maoAtiva]!
        ctx = aplicar(ctx, jogador.peerId, { tipo: 'parar', maoId: m.id }, 0, RNG())
      }
      ctx = avancar(ctx, 0, RNG())
    }

    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.rodada).toBe(2)
    for (const j of ctx.estado.jogadores) {
      expect(j.maos).toHaveLength(0)
    }
  })
})
