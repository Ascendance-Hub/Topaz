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

  it('não distribui e reinicia o prazo quando o prazo expira sem nenhuma aposta', () => {
    let ctx = comDoisJogadores()
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.maoDealer).toHaveLength(0)
    expect(ctx.estado.jogadores.every((j) => j.maos.length === 0)).toBe(true)
    expect(ctx.estado.prazoTurno).toBe(
      REGRAS.segundosTurno * 1000 + 1 + REGRAS.segundosTurno * 1000,
    )
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

  it('EstadoJogo expõe exatamente as chaves públicas esperadas', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    expect(Object.keys(ctx.estado).sort()).toEqual([
      'cartasRestantes', 'dealerTemOculta', 'fase', 'hostAtual',
      'maoDealer', 'jogadores', 'prazoTurno', 'proximoIdMao',
      'rodada', 'vezDe',
    ].sort())
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

  it('fecha as duas mãos após uma carta cada ao dividir um par de ases', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    const jogador = ctx.estado.jogadores[0]!
    jogador.maos[0]!.cartas = [
      { valor: 'A', naipe: 'copas' },
      { valor: 'A', naipe: 'paus' },
    ]
    const maoId = jogador.maos[0]!.id

    ctx = aplicar(ctx, 'p1', { tipo: 'dividir', maoId }, 0, RNG())

    const depois = ctx.estado.jogadores[0]!
    expect(depois.maos).toHaveLength(2)
    expect(depois.maos[0]!.cartas).toHaveLength(2)
    expect(depois.maos[0]!.encerrada).toBe(true)
    expect(depois.maos[1]!.cartas).toHaveLength(2)
    expect(depois.maos[1]!.encerrada).toBe(true)
    // as duas mãos já encerradas: a vez passa direto para o próximo jogador
    expect(ctx.estado.vezDe).toBe('p2')
  })
})

describe('dobrar', () => {
  it('dobra a aposta, compra exatamente uma carta e encerra a mão', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    const fichasAntes = ctx.estado.jogadores[0]!.fichas
    const maoId = ctx.estado.jogadores[0]!.maos[0]!.id

    ctx = aplicar(ctx, 'p1', { tipo: 'dobrar', maoId }, 0, RNG())

    const mao = ctx.estado.jogadores[0]!.maos[0]!
    expect(mao.aposta).toBe(200)
    expect(mao.dobrada).toBe(true)
    expect(mao.cartas).toHaveLength(3)
    expect(mao.encerrada).toBe(true)
    expect(ctx.estado.jogadores[0]!.fichas).toBe(fichasAntes - 100)
    expect(ctx.estado.vezDe).toBe('p2')
  })
})

describe('seguro', () => {
  it('avança para turnos assim que todos decidem, sem esperar o prazo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    // força a fase de seguro independentemente da carta do dealer sorteada
    ctx.estado.fase = 'seguro'

    ctx = aplicar(ctx, 'p1', { tipo: 'seguro', aceitar: true }, 1000, RNG())
    expect(ctx.estado.fase).toBe('seguro')

    ctx = aplicar(ctx, 'p2', { tipo: 'seguro', aceitar: false }, 1000, RNG())
    expect(ctx.estado.fase).toBe('turnos')
  })

  it('paga o seguro 2:1 quando o dealer tem blackjack', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    // cenário determinístico: mãos dos jogadores e do dealer forçadas
    ctx.estado.jogadores[0]!.maos[0]!.cartas = [
      { valor: '5', naipe: 'copas' }, { valor: '6', naipe: 'paus' },
    ]
    ctx.estado.jogadores[1]!.maos[0]!.cartas = [
      { valor: '5', naipe: 'ouros' }, { valor: '6', naipe: 'espadas' },
    ]
    ctx.estado.maoDealer = [{ valor: 'A', naipe: 'copas' }]
    ctx.ocultaDealer = { valor: 'K', naipe: 'espadas' }
    ctx.estado.fase = 'seguro'

    ctx = aplicar(ctx, 'p1', { tipo: 'seguro', aceitar: true }, 1000, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'seguro', aceitar: false }, 1000, RNG())
    expect(ctx.estado.fase).toBe('turnos')
    expect(ctx.estado.jogadores[0]!.seguro).toBe(50)

    const maoP1 = ctx.estado.jogadores[0]!.maos[0]!.id
    const maoP2 = ctx.estado.jogadores[1]!.maos[0]!.id
    ctx = aplicar(ctx, 'p1', { tipo: 'parar', maoId: maoP1 }, 2000, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'parar', maoId: maoP2 }, 3000, RNG())
    expect(ctx.estado.fase).toBe('dealer')

    ctx = avancar(ctx, ctx.estado.prazoTurno! + 1, RNG())
    expect(ctx.estado.fase).toBe('acerto')

    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    const p2 = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    // p1: -100 (aposta) -50 (seguro) +0 (mão perdida) +150 (seguro pago 2:1) = 1000
    expect(p1.fichas).toBe(REGRAS.stackInicial)
    // p2: -100 (aposta), sem seguro, mão perdida
    expect(p2.fichas).toBe(REGRAS.stackInicial - 100)
  })

  it('perde o seguro quando o dealer não tem blackjack', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    ctx.estado.jogadores[0]!.maos[0]!.cartas = [
      { valor: '5', naipe: 'copas' }, { valor: '6', naipe: 'paus' },
    ]
    ctx.estado.jogadores[1]!.maos[0]!.cartas = [
      { valor: '5', naipe: 'ouros' }, { valor: '6', naipe: 'espadas' },
    ]
    // dealer fecha em 17 (A + 6), sem blackjack — não compra mais nada
    ctx.estado.maoDealer = [{ valor: 'A', naipe: 'copas' }]
    ctx.ocultaDealer = { valor: '6', naipe: 'espadas' }
    ctx.estado.fase = 'seguro'

    ctx = aplicar(ctx, 'p1', { tipo: 'seguro', aceitar: true }, 1000, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'seguro', aceitar: false }, 1000, RNG())

    const maoP1 = ctx.estado.jogadores[0]!.maos[0]!.id
    const maoP2 = ctx.estado.jogadores[1]!.maos[0]!.id
    ctx = aplicar(ctx, 'p1', { tipo: 'parar', maoId: maoP1 }, 2000, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'parar', maoId: maoP2 }, 3000, RNG())

    ctx = avancar(ctx, ctx.estado.prazoTurno! + 1, RNG())
    expect(ctx.estado.fase).toBe('acerto')

    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    const p2 = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    // p1: -100 (aposta) -50 (seguro perdido) +0 (11 perde de 17) = 850
    expect(p1.fichas).toBe(REGRAS.stackInicial - 150)
    expect(p2.fichas).toBe(REGRAS.stackInicial - 100)
  })
})

describe('reconexão', () => {
  it('recupera cadeira e fichas com um novo peerId quando o apelido bate com um jogador ausente', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())

    const antes = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    antes.desconectadoEm = 500

    ctx = aplicar(ctx, 'p1-novo', { tipo: 'entrar', apelido: 'Alex' }, 1000, RNG())

    expect(ctx.estado.jogadores).toHaveLength(2)
    const recuperado = ctx.estado.jogadores.find((j) => j.apelido === 'Alex')!
    expect(recuperado.peerId).toBe('p1-novo')
    expect(recuperado.cadeira).toBe(0)
    expect(recuperado.fichas).toBe(REGRAS.stackInicial - 100)
    expect(recuperado.desconectadoEm).toBeNull()
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

    // O relógio precisa andar: seguro, dealer e acerto agora têm prazos
    // próprios que só vencem com o tempo passando de verdade.
    let agora = 0
    let guarda = 0
    while (ctx.estado.fase !== 'apostas' && guarda++ < 50) {
      agora += REGRAS.segundosTurno * 1000 + 1
      if (ctx.estado.vezDe) {
        const jogador = ctx.estado.jogadores.find((j) => j.peerId === ctx.estado.vezDe)!
        const m = jogador.maos[jogador.maoAtiva]!
        ctx = aplicar(ctx, jogador.peerId, { tipo: 'parar', maoId: m.id }, agora, RNG())
      }
      ctx = avancar(ctx, agora, RNG())
    }

    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.rodada).toBe(2)
    for (const j of ctx.estado.jogadores) {
      expect(j.maos).toHaveLength(0)
    }
  })
})

describe('a vez nunca volta para quem já jogou', () => {
  function comTresJogadores(): Contexto {
    let ctx = criarContexto('p1', RNG())
    const nomes: [string, string][] = [['p1', 'Alex'], ['p2', 'Bruno'], ['p3', 'Carla']]
    nomes.forEach(([id, apelido], cadeira) => {
      ctx = aplicar(ctx, id, { tipo: 'entrar', apelido }, 0, RNG())
      ctx = aplicar(ctx, id, { tipo: 'sentar', cadeira }, 0, RNG())
    })
    for (const [id] of nomes) {
      ctx = aplicar(ctx, id, { tipo: 'apostar', valor: 100 }, 0, RNG())
    }
    ctx = avancar(ctx, 0, RNG())
    if (ctx.estado.fase === 'seguro') {
      for (const [id] of nomes) {
        ctx = aplicar(ctx, id, { tipo: 'seguro', aceitar: false }, 0, RNG())
      }
    }
    return ctx
  }

  it('passa para o próximo da mesa quando o jogador da vez perde a cadeira por inatividade', () => {
    let ctx = comTresJogadores()
    expect(ctx.estado.fase).toBe('turnos')

    // 'p1' joga e passa a vez para 'p2', que está a um passo de virar
    // espectador.
    ctx = aplicar(ctx, 'p1', { tipo: 'parar', maoId: ctx.estado.jogadores[0]!.maos[0]!.id }, 0, RNG())
    expect(ctx.estado.vezDe).toBe('p2')
    ctx.estado.jogadores[1]!.rodadasInativo = REGRAS.rodadasParaEspectador - 1

    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())

    // 'p2' saiu da lista de sentados; a vez tem de seguir para 'p3'. Com o
    // findIndex devolvendo -1, `indice + 1` apontava para o primeiro da
    // mesa e devolvia a vez ao 'p1', que já tinha parado.
    expect(ctx.estado.jogadores[1]!.cadeira).toBeNull()
    expect(ctx.estado.vezDe).toBe('p3')
  })

  it('quem levanta no meio do próprio turno passa a vez em vez de congelar a mesa', () => {
    let ctx = comTresJogadores()
    expect(ctx.estado.vezDe).toBe('p1')

    ctx = aplicar(ctx, 'p1', { tipo: 'levantar' }, 0, RNG())

    // Antes, `levantar` limpava cadeira e mãos sem mexer na vez: a mesa
    // inteira esperava os 30s do prazo por alguém que já tinha saído.
    expect(ctx.estado.vezDe).toBe('p2')
    expect(ctx.estado.prazoTurno).toBe(REGRAS.segundosTurno * 1000)
  })

  it('o último da mesa levantando encerra os turnos em vez de dar a vez a alguém encerrado', () => {
    let ctx = comTresJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'parar', maoId: ctx.estado.jogadores[0]!.maos[0]!.id }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'parar', maoId: ctx.estado.jogadores[1]!.maos[0]!.id }, 0, RNG())
    expect(ctx.estado.vezDe).toBe('p3')

    ctx = aplicar(ctx, 'p3', { tipo: 'levantar' }, 0, RNG())

    expect(ctx.estado.vezDe).toBeNull()
    expect(ctx.estado.fase).toBe('dealer')
  })
})

describe('cadeira de quem não aposta', () => {
  it('libera a cadeira depois de duas janelas de aposta sem apostar', () => {
    let ctx = comDoisJogadores()
    const prazo = REGRAS.segundosTurno * 1000

    // Primeira janela vence sem nenhuma aposta: só conta inatividade.
    ctx = avancar(ctx, prazo + 1, RNG())
    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.jogadores.map((j) => j.rodadasInativo)).toEqual([1, 1])
    expect(ctx.estado.jogadores.every((j) => j.cadeira !== null)).toBe(true)

    // Segunda janela: spec §7 manda liberar a cadeira. Sem isto, uma aba
    // esquecida fazia toda rodada esperar os 30s inteiros, para sempre.
    ctx = avancar(ctx, prazo * 2 + 2, RNG())

    expect(ctx.estado.jogadores.every((j) => j.cadeira === null)).toBe(true)
  })

  it('não libera a cadeira de quem apostou nessa janela', () => {
    let ctx = comDoisJogadores()
    ctx.estado.jogadores[0]!.rodadasInativo = REGRAS.rodadasParaEspectador - 1
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())

    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())

    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    const p2 = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(p1.cadeira).toBe(0)
    expect(p1.rodadasInativo).toBe(0)
    // 'p2' deixou a janela passar: é ele quem acumula inatividade.
    expect(p2.rodadasInativo).toBe(1)
  })
})
