import { describe, it, expect } from 'vitest'
import { criarContexto, aplicar, avancar, cartasVisiveis, decidirFim } from './machine'
import { rngSemente } from './shoe'
import { REGRAS, CONFIG_PADRAO } from './rules'
import type { Contexto } from './machine'
import type { EstadoJogo, Jogador } from './types'

const RNG = () => rngSemente(1234)

function comDoisJogadores(): Contexto {
  let ctx = criarContexto('p1', RNG())
  ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
  ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
  ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
  ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
  // 'p1' é o hostId passado a criarContexto: só ele pode tirar a mesa da
  // sala de espera.
  ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
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
      peerId: 'p1', apelido: 'Alex', cadeira: null, fichas: CONFIG_PADRAO.fichasIniciais,
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

  it('vai para apostas quando o anfitrião inicia com dois jogadores sentados', () => {
    expect(comDoisJogadores().estado.fase).toBe('apostas')
  })
})

describe('sala de espera', () => {
  it('sentar não inicia mais a partida sozinho', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
  })

  it('o anfitrião inicia e a partida vai para apostas', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.naPartida).toEqual(['p1'])
  })

  it('quem não é anfitrião não consegue iniciar', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
  })

  it('não inicia com a mesa vazia', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
  })

  it('naPartida registra todos os sentados no momento do início', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p3', { tipo: 'entrar', apelido: 'Carla' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    // Carla entrou na sala mas não sentou antes do início.
    expect(ctx.estado.naPartida.sort()).toEqual(['p1', 'p2'])
  })

  it('quem não entrou na partida não consegue sentar depois que ela começa', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBeNull()
  })

  it('quem estava na partida e perdeu a cadeira consegue voltar a sentar', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'levantar' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBe(1)
  })

  it('quem reconecta com peerId novo depois do início consegue voltar a sentar ao perder a cadeira', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())

    // 'p2' cai da sala — a rede marca a ausência; isso acontece fora do
    // alcance do motor (ver sessao.ts), então simulamos a marca aqui.
    const p2 = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    p2.desconectadoEm = 500

    // Volta com um peerId novo, mesmo apelido: recupera cadeira e identidade.
    ctx = aplicar(ctx, 'p2-novo', { tipo: 'entrar', apelido: 'Bruno' }, 1000, RNG())

    // Perde a cadeira por inatividade — 'levantar' modela a perda.
    ctx = aplicar(ctx, 'p2-novo', { tipo: 'levantar' }, 1000, RNG())

    // Sem atualizar naPartida no reconecte, o peerId novo não consta como
    // participante e esta sentada seria recusada.
    ctx = aplicar(ctx, 'p2-novo', { tipo: 'sentar', cadeira: 1 }, 1000, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2-novo')!.cadeira).toBe(1)
  })

  it('iniciar de novo no meio da partida não muda nada', () => {
    let ctx = comDoisJogadores()
    const antes = { naPartida: [...ctx.estado.naPartida], prazo: ctx.estado.prazoTurno }
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 999, RNG())
    expect(ctx.estado.naPartida).toEqual(antes.naPartida)
    expect(ctx.estado.prazoTurno).toBe(antes.prazo)
  })

  it('ninguém senta com a partida acabada', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'levantar' }, 0, RNG())
    ctx.estado.fase = 'fim'
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.cadeira).toBeNull()
  })
})

describe('apostas', () => {
  it('debita as fichas ao apostar', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    expect(p1.fichas).toBe(CONFIG_PADRAO.fichasIniciais - 100)
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
    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.fase).not.toBe('apostas')
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.maos).toHaveLength(0)
  })

  it('não distribui e reinicia o prazo quando o prazo expira sem nenhuma aposta', () => {
    let ctx = comDoisJogadores()
    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.maoDealer).toHaveLength(0)
    expect(ctx.estado.jogadores.every((j) => j.maos.length === 0)).toBe(true)
    expect(ctx.estado.prazoTurno).toBe(
      CONFIG_PADRAO.segundosTurno * 1000 + 1 + CONFIG_PADRAO.segundosTurno * 1000,
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
      // `config` viaja no estado de propósito: é assim que todo mundo joga com
      // o mesmo formato sem precisar combinar nada.
      'config', 'cartasRestantes', 'dealerTemOculta', 'fase', 'hostAtual',
      'maoDealer', 'jogadores', 'prazoTurno', 'proximoIdMao',
      'rodada', 'vezDe', 'vencedor', 'naPartida',
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
    expect(ctx.estado.prazoTurno).toBe(CONFIG_PADRAO.segundosTurno * 1000)
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
    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.vezDe).toBe('p2')
    expect(ctx.estado.jogadores[0]!.maos[0]!.encerrada).toBe(true)
    expect(ctx.estado.jogadores[0]!.rodadasInativo).toBe(1)
  })

  it('vira espectador após duas rodadas inativo', () => {
    let ctx = emTurnos()
    ctx.estado.jogadores[0]!.rodadasInativo = 1
    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())
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
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
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
    expect(p1.fichas).toBe(CONFIG_PADRAO.fichasIniciais)
    // p2: -100 (aposta), sem seguro, mão perdida
    expect(p2.fichas).toBe(CONFIG_PADRAO.fichasIniciais - 100)
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
    expect(p1.fichas).toBe(CONFIG_PADRAO.fichasIniciais - 150)
    expect(p2.fichas).toBe(CONFIG_PADRAO.fichasIniciais - 100)
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
    expect(recuperado.fichas).toBe(CONFIG_PADRAO.fichasIniciais - 100)
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
      agora += CONFIG_PADRAO.segundosTurno * 1000 + 1
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
    // 'p1' é o hostId passado a criarContexto.
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
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

    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())

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
    expect(ctx.estado.prazoTurno).toBe(CONFIG_PADRAO.segundosTurno * 1000)
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
    const prazo = CONFIG_PADRAO.segundosTurno * 1000

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

  it('quem volta a sentar recomeça com a inatividade zerada', () => {
    let ctx = comDoisJogadores()
    const p2 = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    p2.rodadasInativo = REGRAS.rodadasParaEspectador
    p2.cadeira = null

    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 3 }, 0, RNG())

    // Sem zerar, ele perderia a cadeira já na primeira janela de apostas em
    // que não apostasse — a spec §7 diz que ele pode voltar a sentar.
    const depois = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(depois.cadeira).toBe(3)
    expect(depois.rodadasInativo).toBe(0)
  })

  it('não libera a cadeira de quem apostou nessa janela', () => {
    let ctx = comDoisJogadores()
    ctx.estado.jogadores[0]!.rodadasInativo = REGRAS.rodadasParaEspectador - 1
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())

    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())

    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    const p2 = ctx.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(p1.cadeira).toBe(0)
    expect(p1.rodadasInativo).toBe(0)
    // 'p2' deixou a janela passar: é ele quem acumula inatividade.
    expect(p2.rodadasInativo).toBe(1)
  })
})

/** Leva a rodada até o fim usando só a API pública, avançando o relógio. */
function limparRodadaParaTeste(inicial: Contexto): Contexto {
  let ctx = inicial
  let agora = 0
  const passo = REGRAS.msEntreCartasDealer + 1
  for (const jogador of ctx.estado.jogadores) {
    if (jogador.cadeira !== null && jogador.fichas >= REGRAS.apostaMin) {
      ctx = aplicar(ctx, jogador.peerId, { tipo: 'apostar', valor: REGRAS.apostaMin }, agora, RNG())
    }
  }
  let guarda = 0
  while (ctx.estado.rodada === inicial.estado.rodada && ctx.estado.fase !== 'fim' && guarda++ < 200) {
    if (ctx.estado.fase === 'turnos' && ctx.estado.vezDe) {
      const jogador = ctx.estado.jogadores.find((j) => j.peerId === ctx.estado.vezDe)!
      const mao = jogador.maos[jogador.maoAtiva]
      if (mao) {
        ctx = aplicar(ctx, jogador.peerId, { tipo: 'parar', maoId: mao.id }, agora, RNG())
        continue
      }
    }
    if (ctx.estado.fase === 'seguro') {
      for (const jogador of ctx.estado.jogadores) {
        if (!jogador.decidiuSeguro && jogador.maos.length > 0) {
          ctx = aplicar(ctx, jogador.peerId, { tipo: 'seguro', aceitar: false }, agora, RNG())
        }
      }
      continue
    }
    agora += passo
    ctx = avancar(ctx, agora, RNG())
  }
  return ctx
}

describe('eliminação', () => {
  function mesaIniciada(fichasP2: number): Contexto {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas = fichasP2
    return ctx
  }

  it('não repõe mais fichas de quem quebrou no acerto', () => {
    const ctx = mesaIniciada(10)
    const depois = limparRodadaParaTeste(ctx)
    expect(depois.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas).toBe(10)
  })

  it('elimina quem fica abaixo da aposta mínima', () => {
    const ctx = mesaIniciada(10)
    const depois = limparRodadaParaTeste(ctx)
    const p2 = depois.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(p2.cadeira).toBeNull()
    expect(p2.eliminadoEm).toBe(1)
  })

  it('não elimina quem tem exatamente a aposta mínima', () => {
    const ctx = mesaIniciada(REGRAS.apostaMin)
    const depois = limparRodadaParaTeste(ctx)
    const p2 = depois.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(p2.cadeira).toBe(1)
    expect(p2.eliminadoEm).toBeNull()
  })

  it('eliminado não consegue sentar de novo na mesma partida', () => {
    let ctx = mesaIniciada(10)
    ctx = limparRodadaParaTeste(ctx)
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBeNull()
  })

  it('sentar não repõe mais fichas', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx.estado.jogadores[0]!.fichas = 10
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.jogadores[0]!.fichas).toBe(10)
  })
})

/**
 * Joga a partida inteira, rodada após rodada, só pela API pública: aposta o
 * máximo que cada um pode, dispensa seguro e para em todas as mãos, deixando
 * o relógio andar entre os passos. É o que faltava para que qualquer coisa
 * atravessasse uma fronteira de rodada — `limparRodadaParaTeste` para na
 * primeira, e era por isso que ninguém via a mesa entrar em `apostas` sem
 * jogador nenhum sentado.
 */
function jogarPartidaInteira(
  inicial: Contexto,
  aposta: (jogador: Jogador) => number = (j) => Math.min(CONFIG_PADRAO.apostaMax, j.fichas),
): Contexto {
  let ctx = inicial
  let agora = 0
  let guarda = 0
  const passo = REGRAS.msEntreCartasDealer + 1

  while (ctx.estado.fase !== 'fim' && guarda++ < 3000) {
    const estado = ctx.estado

    if (estado.fase === 'apostas') {
      const semAposta = estado.jogadores.filter(
        (j) => j.cadeira !== null && j.maos.length === 0 && j.fichas >= REGRAS.apostaMin,
      )
      if (semAposta.length > 0) {
        for (const jogador of semAposta) {
          ctx = aplicar(ctx, jogador.peerId, { tipo: 'apostar', valor: aposta(jogador) }, agora, RNG())
        }
        continue
      }
    }

    if (estado.fase === 'seguro') {
      const indecisos = estado.jogadores.filter((j) => j.maos.length > 0 && !j.decidiuSeguro)
      if (indecisos.length > 0) {
        for (const jogador of indecisos) {
          ctx = aplicar(ctx, jogador.peerId, { tipo: 'seguro', aceitar: false }, agora, RNG())
        }
        continue
      }
    }

    if (estado.fase === 'turnos' && estado.vezDe !== null) {
      const jogador = estado.jogadores.find((j) => j.peerId === estado.vezDe)!
      const mao = jogador.maos[jogador.maoAtiva]
      if (mao) {
        ctx = aplicar(ctx, jogador.peerId, { tipo: 'parar', maoId: mao.id }, agora, RNG())
        continue
      }
    }

    agora += passo
    ctx = avancar(ctx, agora, RNG())
  }
  return ctx
}

describe('partida inteira e partida seguinte', () => {
  function mesaDeDois(): Contexto {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    return ctx
  }

  it('atravessa várias rodadas até a eliminação encerrar a partida', () => {
    let ctx = mesaDeDois()
    // Pilhas curtas e aposta mínima: a partida termina por eliminação (spec
    // §6 regra 2) em poucas rodadas, sem ninguém chegar perto do alvo.
    ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.fichas = 300
    ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas = 100

    ctx = jogarPartidaInteira(ctx, () => REGRAS.apostaMin)
    const estado = ctx.estado

    expect(estado.fase).toBe('fim')
    // Várias rodadas de verdade: a fronteira de rodada foi atravessada mais
    // de uma vez, coisa que nenhum teste fazia antes.
    expect(estado.rodada).toBeGreaterThan(2)
    expect(estado.vezDe).toBeNull()
    expect(estado.prazoTurno).toBeNull()

    const eliminados = estado.jogadores.filter((j) => j.eliminadoEm !== null)
    expect(eliminados).toHaveLength(1)
    expect(estado.vencedor).not.toBeNull()

    const campeao = estado.jogadores.find((j) => j.peerId === estado.vencedor)!
    expect(campeao.eliminadoEm).toBeNull()
    expect(campeao.fichas).toBeGreaterThanOrEqual(REGRAS.apostaMin)
    // Ninguém joga mais nada em `fim`: as mãos da última rodada já foram
    // limpas por `limparRodada`.
    expect(estado.jogadores.every((j) => j.maos.length === 0)).toBe(true)
  })

  it('novaPartida devolve a mesa à sala de espera e a partida seguinte começa na rodada 1', () => {
    let ctx = jogarPartidaInteira(mesaDeDois())
    expect(ctx.estado.fase).toBe('fim')

    ctx = aplicar(ctx, 'p1', { tipo: 'novaPartida' }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
    expect(ctx.estado.naPartida).toEqual([])
    for (const jogador of ctx.estado.jogadores) {
      expect(jogador.fichas).toBe(CONFIG_PADRAO.fichasIniciais)
      expect(jogador.eliminadoEm).toBeNull()
      expect(jogador.cadeira).toBeNull()
    }

    // Quem foi eliminado na partida anterior volta a sentar normalmente.
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.every((j) => j.cadeira !== null)).toBe(true)

    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.rodada).toBe(1)
    expect([...ctx.estado.naPartida].sort()).toEqual(['p1', 'p2'])
    expect(ctx.estado.vencedor).toBeNull()
    expect(ctx.estado.jogadores.every((j) => j.maos.length === 0)).toBe(true)

    // E a partida nova roda de verdade: a primeira rodada distribui cartas.
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: REGRAS.apostaMin }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: REGRAS.apostaMin }, 0, RNG())
    expect(ctx.estado.jogadores.every((j) => j.maos[0]!.cartas.length === 2)).toBe(true)
  })
})

describe('nenhuma fase gira para sempre sem ninguém que possa jogar', () => {
  /** Leva a mesa até `turnos` com os dois jogadores apostados. */
  function emTurnosComDois(): Contexto {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    if (ctx.estado.fase === 'seguro') {
      ctx = aplicar(ctx, 'p1', { tipo: 'seguro', aceitar: false }, 0, RNG())
      ctx = aplicar(ctx, 'p2', { tipo: 'seguro', aceitar: false }, 0, RNG())
    }
    return ctx
  }

  /** A purga de desconectados de `sessao.ts` some com quem passou da janela
   *  de reconexão — do ponto de vista do motor, o jogador simplesmente
   *  desaparece de `jogadores`. */
  function purgar(ctx: Contexto, ...peerIds: string[]): void {
    ctx.estado.jogadores = ctx.estado.jogadores.filter((j) => !peerIds.includes(j.peerId))
  }

  it('apostas sem nenhum participante restante acaba em fim, com saída para quem sobrou na sala', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p3', { tipo: 'entrar', apelido: 'Carla' }, 0, RNG())

    // Os dois participantes somem; sobra quem entrou depois do início e, por
    // isso, não pode sentar (spec §4). Sem fim de partida, `apostas` reatava
    // o próprio prazo para sempre: `iniciar` exige `aguardando` e
    // `novaPartida` exige `fim`, então a sala ficava sem nenhuma saída.
    purgar(ctx, 'p1', 'p2')
    ctx.estado.hostAtual = 'p3'

    let agora = 0
    for (let i = 0; i < 200; i++) {
      agora += CONFIG_PADRAO.segundosTurno * 1000 + 1
      ctx = avancar(ctx, agora, RNG())
    }

    expect(ctx.estado.fase).toBe('fim')
    expect(ctx.estado.vencedor).toBeNull()
    expect(ctx.estado.prazoTurno).toBeNull()

    ctx = aplicar(ctx, 'p3', { tipo: 'novaPartida' }, agora, RNG())
    ctx = aplicar(ctx, 'p3', { tipo: 'sentar', cadeira: 0 }, agora, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p3')!.cadeira).toBe(0)
  })

  it('a vez de quem foi purgado passa para quem ainda tem mão para jogar', () => {
    let ctx = emTurnosComDois()
    expect(ctx.estado.fase).toBe('turnos')
    expect(ctx.estado.vezDe).toBe('p1')

    purgar(ctx, 'p1')
    ctx = avancar(ctx, CONFIG_PADRAO.segundosTurno * 1000 + 1, RNG())

    // Antes, o `if (jogador)` simplesmente não fazia nada: o prazo continuava
    // vencido e todo tique seguinte caía no mesmo nada, com a mesa parada.
    expect(ctx.estado.vezDe).toBe('p2')
    expect(ctx.estado.prazoTurno).toBe(CONFIG_PADRAO.segundosTurno * 1000 * 2 + 1)
  })

  it('turnos com todo mundo purgado chega a fim em vez de girar', () => {
    let ctx = emTurnosComDois()
    purgar(ctx, 'p1', 'p2')

    let agora = 0
    for (let i = 0; i < 200; i++) {
      agora += CONFIG_PADRAO.segundosTurno * 1000 + 1
      ctx = avancar(ctx, agora, RNG())
    }

    expect(ctx.estado.fase).toBe('fim')
    expect(ctx.estado.vencedor).toBeNull()
  })
})

describe('decidirFim', () => {
  /**
   * Cadeira derivada do id, uma por jogador: `cadeira: 0` para todos sentava
   * a mesa inteira na mesma cadeira, estado que o motor nunca produz.
   * `decidirFim` não lê `cadeira` — mas é essa mesma fixture impossível que
   * já deixou defeitos passarem por centenas de testes.
   */
  function jogador(peerId: string, fichas: number, eliminadoEm: number | null): Jogador {
    return {
      peerId, apelido: peerId,
      cadeira: eliminadoEm === null ? Number(peerId.slice(1)) - 1 : null,
      fichas, maos: [], maoAtiva: 0, seguro: 0, rodadasInativo: 0,
      desconectadoEm: null, decidiuSeguro: false, eliminadoEm,
    }
  }

  function estado(jogadores: Jogador[], naPartida?: string[]): EstadoJogo {
    return {
      fase: 'acerto', jogadores, vezDe: null, prazoTurno: null, maoDealer: [],
      dealerTemOculta: false, cartasRestantes: 100, hostAtual: 'p1', rodada: 5,
      config: { ...CONFIG_PADRAO },
      proximoIdMao: 1, vencedor: null,
      naPartida: naPartida ?? jogadores.map((j) => j.peerId),
    }
  }

  it('quem atinge o alvo vence', () => {
    expect(decidirFim(estado([
      jogador('p1', (CONFIG_PADRAO.alvo ?? 0), null), jogador('p2', 400, null),
    ]))).toEqual({ acabou: true, vencedor: 'p1' })
  })

  it('entre dois no alvo, vence quem tem mais fichas', () => {
    expect(decidirFim(estado([
      jogador('p1', (CONFIG_PADRAO.alvo ?? 0) + 200, null),
      jogador('p2', (CONFIG_PADRAO.alvo ?? 0) + 50, null),
    ]))).toEqual({ acabou: true, vencedor: 'p1' })
  })

  it('empate exato no alvo acaba a partida sem vencedor', () => {
    expect(decidirFim(estado([
      jogador('p1', (CONFIG_PADRAO.alvo ?? 0), null), jogador('p2', (CONFIG_PADRAO.alvo ?? 0), null),
    ]))).toEqual({ acabou: true, vencedor: null })
  })

  it('sobrando um único apto, ele vence', () => {
    expect(decidirFim(estado([
      jogador('p1', 600, null), jogador('p2', 0, 4),
    ]))).toEqual({ acabou: true, vencedor: 'p1' })
  })

  it('ninguém apto acaba sem vencedor', () => {
    expect(decidirFim(estado([
      jogador('p1', 0, 5), jogador('p2', 0, 5),
    ]))).toEqual({ acabou: true, vencedor: null })
  })

  it('com dois aptos a partida continua', () => {
    expect(decidirFim(estado([
      jogador('p1', 600, null), jogador('p2', 400, null),
    ]))).toEqual({ acabou: false, vencedor: null })
  })

  it('jogando sozinho, a regra do último sobrevivente não dispara', () => {
    expect(decidirFim(estado([jogador('p1', 600, null)]))).toEqual({
      acabou: false, vencedor: null,
    })
  })

  it('jogando sozinho, quebrar encerra pela regra de ninguém apto', () => {
    expect(decidirFim(estado([jogador('p1', 0, 5)]))).toEqual({
      acabou: true, vencedor: null,
    })
  })

  it('quem perdeu a cadeira mas tem fichas continua apto', () => {
    const semCadeira = jogador('p2', 600, null)
    semCadeira.cadeira = null
    expect(decidirFim(estado([
      jogador('p1', 600, null), semCadeira,
    ]))).toEqual({ acabou: false, vencedor: null })
  })

  it('quem está na sala mas não entrou na partida não conta', () => {
    expect(decidirFim(estado([
      jogador('p1', 600, null),
      jogador('p2', 900, null), // na sala, fora da partida
      jogador('p3', 0, 3), // entrou na partida e foi eliminado
    ], ['p1', 'p3']))).toEqual({ acabou: true, vencedor: 'p1' })
  })

  it('espectador entrando na sala não encerra uma partida solo', () => {
    expect(decidirFim(estado([
      jogador('p1', 600, null),
      jogador('p2', 900, null), // só entrou na sala, nunca na partida
    ], ['p1']))).toEqual({ acabou: false, vencedor: null })
  })
})

describe('fim de partida ligado à rodada', () => {
  it('uma rodada que zera o único adversário leva a fase para fim', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    // Bruno entra na rodada com o mínimo; perdendo ou empatando ele fica
    // abaixo do mínimo e é eliminado no acerto.
    ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas = REGRAS.apostaMin

    const depois = limparRodadaParaTeste(ctx)

    const bruno = depois.estado.jogadores.find((j) => j.peerId === 'p2')!
    if (bruno.eliminadoEm !== null) {
      expect(depois.estado.fase).toBe('fim')
      expect(depois.estado.vencedor).toBe('p1')
    } else {
      // Bruno ganhou a mão e segue no jogo — a partida continua.
      expect(depois.estado.fase).not.toBe('fim')
    }
  })

  it('novaPartida devolve todo mundo à sala de espera com o stack cheio', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx.estado.fase = 'fim'
    ctx.estado.vencedor = 'p1'
    ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.eliminadoEm = 3

    ctx = aplicar(ctx, 'p1', { tipo: 'novaPartida' }, 0, RNG())

    expect(ctx.estado.fase).toBe('aguardando')
    expect(ctx.estado.vencedor).toBeNull()
    expect(ctx.estado.naPartida).toEqual([])
    expect(ctx.estado.rodada).toBe(1)
    for (const jogador of ctx.estado.jogadores) {
      expect(jogador.fichas).toBe(CONFIG_PADRAO.fichasIniciais)
      expect(jogador.eliminadoEm).toBeNull()
      expect(jogador.cadeira).toBeNull()
    }
  })

  it('quem não é anfitrião não reinicia', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx.estado.fase = 'fim'

    ctx = aplicar(ctx, 'p2', { tipo: 'novaPartida' }, 0, RNG())

    expect(ctx.estado.fase).toBe('fim')
  })
})

describe('configurar a partida', () => {
  const config = (extras = {}) => ({ ...CONFIG_PADRAO, ...extras })

  /**
   * Dois sentados, mas a mesa AINDA na sala de espera.
   *
   * `comDoisJogadores` já chama `iniciar`, e configurar só vale em
   * `aguardando` — usá-lo aqui testaria a recusa, não a mudança.
   */
  function aguardando(): Contexto {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    return ctx
  }

  it('o anfitrião muda o formato antes de a partida começar', () => {
    let ctx = aguardando()

    ctx = aplicar(ctx, ctx.estado.hostAtual, {
      tipo: 'configurar', config: config({ alvo: 5000 }),
    }, 0, RNG())

    expect(ctx.estado.config.alvo).toBe(5000)
  })

  it('quem NÃO é anfitrião não muda nada', () => {
    // Sem isto, qualquer pessoa na sala mudaria o alvo da partida dos outros.
    let ctx = aguardando()
    const antes = ctx.estado.config.alvo

    ctx = aplicar(ctx, 'p2', { tipo: 'configurar', config: config({ alvo: 5000 }) }, 0, RNG())

    expect(ctx.estado.config.alvo).toBe(antes)
  })

  it('não muda com a partida em andamento', () => {
    // Trocaria a regra com dinheiro na mesa: quem estivesse na frente pela
    // regra antiga perderia sem ter feito nada errado.
    let ctx = comDoisJogadores()
    const antes = ctx.estado.config.alvo

    ctx = aplicar(ctx, ctx.estado.hostAtual, {
      tipo: 'configurar', config: config({ alvo: 5000 }),
    }, 0, RNG())

    expect(ctx.estado.fase).not.toBe('aguardando')
    expect(ctx.estado.config.alvo).toBe(antes)
  })

  it('configuração inválida é encaixada, não aceita crua', () => {
    let ctx = aguardando()

    ctx = aplicar(ctx, ctx.estado.hostAtual, {
      tipo: 'configurar',
      config: config({ fichasIniciais: 500, apostaMax: 99_999 }),
    }, 0, RNG())

    expect(ctx.estado.config.apostaMax).toBeLessThanOrEqual(500)
  })

  it('quem chega DEPOIS recebe as fichas iniciais novas', () => {
    let ctx = aguardando()

    ctx = aplicar(ctx, ctx.estado.hostAtual, {
      tipo: 'configurar', config: config({ fichasIniciais: 3000 }),
    }, 0, RNG())
    ctx = aplicar(ctx, 'p3', { tipo: 'entrar', apelido: 'Carla' }, 0, RNG())

    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p3')!.fichas).toBe(3000)
  })

  it('com a mesa parada, as fichas novas valem JÁ para quem está lá', () => {
    // Relato de uso: o anfitrião trocava para 3000, começava a partida, e todo
    // mundo jogava com 1000 — sem nada dizer por quê. Em `aguardando` ninguém
    // tem ficha em jogo (todos estão no valor inicial), então mudar o valor
    // inicial precisa valer agora.
    let ctx = aguardando()

    ctx = aplicar(ctx, ctx.estado.hostAtual, {
      tipo: 'configurar', config: config({ fichasIniciais: 3000 }),
    }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())

    expect(ctx.estado.jogadores.every((j) => j.fichas === 3000)).toBe(true)
  })

  it('com a partida encerrada, o formato muda mas o PLACAR fica', () => {
    // Em `fim` as fichas são o resultado da partida que acabou: reescrevê-las
    // apagaria o placar antes de as pessoas verem. O valor novo entra na
    // redistribuição de `novaPartida`.
    const base = comDoisJogadores().estado
    const emFim = {
      sapata: [], ocultaDealer: null,
      estado: {
        ...base, fase: 'fim' as const,
        jogadores: base.jogadores.map((j, i) => ({ ...j, fichas: 1700 + i })),
      },
    }

    const ctx = aplicar(emFim, base.hostAtual, {
      tipo: 'configurar', config: config({ fichasIniciais: 3000 }),
    }, 0, RNG())

    expect(ctx.estado.config.fichasIniciais).toBe(3000)
    expect(ctx.estado.jogadores.map((j) => j.fichas)).toEqual([1700, 1701])
  })

  it('encerrada, dá para configurar sem recarregar a página', () => {
    // Antes, `fim` contava como "em andamento" e o anfitrião ficava preso.
    const base = comDoisJogadores().estado
    const emFim = {
      sapata: [], ocultaDealer: null,
      estado: { ...base, fase: 'fim' as const },
    }

    const ctx = aplicar(emFim, base.hostAtual, {
      tipo: 'configurar', config: config({ alvo: 9000 }),
    }, 0, RNG())

    expect(ctx.estado.config.alvo).toBe(9000)
  })

  it('a partida seguinte redistribui com o valor novo', () => {
    const base = comDoisJogadores().estado
    const ctx = aplicar(
      {
        sapata: [], ocultaDealer: null,
        estado: {
          ...base, fase: 'fim',
          config: { ...CONFIG_PADRAO, fichasIniciais: 3000 },
        },
      },
      base.hostAtual, { tipo: 'novaPartida' }, 0, RNG(),
    )

    expect(ctx.estado.jogadores.every((j) => j.fichas === 3000)).toBe(true)
  })
})

describe('fim de partida com o alvo configurado', () => {
  it('sem alvo, ninguém vence por fichas — vai até sobrar um', () => {
    const base = comDoisJogadores().estado
    const estado = {
      ...base,
      config: { ...CONFIG_PADRAO, alvo: null },
      naPartida: ['p1', 'p2'],
      jogadores: base.jogadores.map((j) => ({ ...j, fichas: 999_999 })),
    }

    expect(decidirFim(estado).acabou).toBe(false)
  })

  it('sem alvo, sobrar um encerra', () => {
    const base = comDoisJogadores().estado
    const estado = {
      ...base,
      config: { ...CONFIG_PADRAO, alvo: null },
      naPartida: ['p1', 'p2'],
      jogadores: [
        { ...base.jogadores[0]!, fichas: 2000 },
        { ...base.jogadores[1]!, fichas: 0, eliminadoEm: 3 },
      ],
    }

    expect(decidirFim(estado)).toEqual({ acabou: true, vencedor: 'p1' })
  })

  it('com alvo, chegar nele encerra', () => {
    const base = comDoisJogadores().estado
    const estado = {
      ...base,
      config: { ...CONFIG_PADRAO, alvo: 2000 },
      naPartida: ['p1', 'p2'],
      jogadores: [
        { ...base.jogadores[0]!, fichas: 2000 },
        { ...base.jogadores[1]!, fichas: 500 },
      ],
    }

    expect(decidirFim(estado)).toEqual({ acabou: true, vencedor: 'p1' })
  })
})
