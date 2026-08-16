import { criarSapata, precisaReembaralhar } from './shoe'
import { avaliar, estourou } from './hand'
import { REGRAS, acoesDisponiveis, dealerDeveComprar, pagamento, resultadoDe } from './rules'
import type { Acao, Carta, EstadoJogo, Jogador, Mao, Rng } from './types'

export interface Contexto {
  estado: EstadoJogo
  sapata: Carta[]
  ocultaDealer: Carta | null
}

let sequenciaMao = 0
function novoIdMao(): string {
  sequenciaMao += 1
  return `m${sequenciaMao}`
}

function clonar(ctx: Contexto): Contexto {
  return {
    estado: structuredClone(ctx.estado),
    sapata: [...ctx.sapata],
    ocultaDealer: ctx.ocultaDealer,
  }
}

function comprar(ctx: Contexto, rng: Rng): Carta {
  if (ctx.sapata.length === 0) {
    ctx.sapata = criarSapata(REGRAS.numBaralhos, rng)
  }
  const carta = ctx.sapata.pop()!
  ctx.estado.cartasRestantes = ctx.sapata.length
  return carta
}

function sentados(estado: EstadoJogo): Jogador[] {
  return estado.jogadores
    .filter((j) => j.cadeira !== null)
    .sort((a, b) => a.cadeira! - b.cadeira!)
}

function maoNova(aposta: number, vindaDeSplit = false): Mao {
  return {
    id: novoIdMao(), cartas: [], aposta,
    dobrada: false, vindaDeSplit, encerrada: false,
  }
}

export function criarContexto(hostId: string, rng: Rng): Contexto {
  const sapata = criarSapata(REGRAS.numBaralhos, rng)
  return {
    sapata,
    ocultaDealer: null,
    estado: {
      fase: 'aguardando',
      jogadores: [],
      vezDe: null,
      prazoTurno: null,
      maoDealer: [],
      dealerTemOculta: false,
      cartasRestantes: sapata.length,
      hostAtual: hostId,
      rodada: 1,
    },
  }
}

export function cartasVisiveis(estado: EstadoJogo): Carta[] {
  const daMesa = estado.jogadores.flatMap((j) => j.maos.flatMap((m) => m.cartas))
  return [...daMesa, ...estado.maoDealer]
}

export function aplicar(
  ctx: Contexto, peerId: string, acao: Acao, agora: number, rng: Rng,
): Contexto {
  const novo = clonar(ctx)
  const estado = novo.estado
  const jogador = estado.jogadores.find((j) => j.peerId === peerId)

  switch (acao.tipo) {
    case 'entrar': {
      if (jogador) {
        jogador.apelido = acao.apelido
        jogador.desconectadoEm = null
        break
      }
      // Reconexão: um jogador ausente com o mesmo apelido recupera
      // cadeira, fichas e mãos, assumindo o novo peerId.
      const ausente = estado.jogadores.find(
        (j) => j.desconectadoEm !== null && j.apelido === acao.apelido,
      )
      if (ausente) {
        ausente.peerId = peerId
        ausente.desconectadoEm = null
        break
      }
      estado.jogadores.push({
        peerId, apelido: acao.apelido, cadeira: null,
        fichas: REGRAS.stackInicial, maos: [], maoAtiva: 0,
        seguro: 0, rodadasInativo: 0, desconectadoEm: null,
      })
      break
    }

    case 'sentar': {
      if (!jogador || jogador.cadeira !== null) break
      if (acao.cadeira < 0 || acao.cadeira >= REGRAS.maxCadeiras) break
      if (estado.jogadores.some((j) => j.cadeira === acao.cadeira)) break
      jogador.cadeira = acao.cadeira
      break
    }

    case 'levantar': {
      if (!jogador) break
      jogador.cadeira = null
      jogador.maos = []
      break
    }

    case 'apostar': {
      if (!jogador || estado.fase !== 'apostas') break
      if (jogador.cadeira === null || jogador.maos.length > 0) break
      if (acao.valor < REGRAS.apostaMin || acao.valor > REGRAS.apostaMax) break
      if (acao.valor > jogador.fichas) break
      jogador.fichas -= acao.valor
      jogador.maos = [maoNova(acao.valor)]
      jogador.maoAtiva = 0
      break
    }

    case 'seguro': {
      if (!jogador || estado.fase !== 'seguro') break
      if (!acao.aceitar) break
      const metade = Math.floor((jogador.maos[0]?.aposta ?? 0) / 2)
      if (metade > jogador.fichas) break
      jogador.fichas -= metade
      jogador.seguro = metade
      break
    }

    case 'pedir':
    case 'parar':
    case 'dobrar':
    case 'dividir': {
      if (!jogador || estado.fase !== 'turnos') break
      if (estado.vezDe !== peerId) break

      const mao = jogador.maos.find((m) => m.id === acao.maoId)
      if (!mao || mao.id !== jogador.maos[jogador.maoAtiva]?.id) break
      if (!acoesDisponiveis(mao, jogador).includes(acao.tipo)) break

      jogador.rodadasInativo = 0

      if (acao.tipo === 'pedir') {
        mao.cartas.push(comprar(novo, rng))
        if (estourou(mao.cartas)) mao.encerrada = true
      }

      if (acao.tipo === 'parar') {
        mao.encerrada = true
      }

      if (acao.tipo === 'dobrar') {
        jogador.fichas -= mao.aposta
        mao.aposta *= 2
        mao.dobrada = true
        mao.cartas.push(comprar(novo, rng))
        mao.encerrada = true
      }

      if (acao.tipo === 'dividir') {
        const movida = mao.cartas.pop()!
        jogador.fichas -= mao.aposta
        const filha = maoNova(mao.aposta, true)
        filha.cartas = [movida]
        mao.vindaDeSplit = true
        jogador.maos.splice(jogador.maoAtiva + 1, 0, filha)
        mao.cartas.push(comprar(novo, rng))
        filha.cartas.push(comprar(novo, rng))
        // Ás dividido recebe uma carta só e encerra imediatamente.
        if (movida.valor === 'A') {
          mao.encerrada = true
          filha.encerrada = true
        }
      }

      avancarTurnoSeNecessario(novo, agora)
      break
    }
  }

  return transicionar(novo, agora, rng)
}

function avancarTurnoSeNecessario(ctx: Contexto, agora: number): void {
  const estado = ctx.estado
  const jogador = estado.jogadores.find((j) => j.peerId === estado.vezDe)
  if (!jogador) return

  while (jogador.maoAtiva < jogador.maos.length) {
    const mao = jogador.maos[jogador.maoAtiva]!
    if (!mao.encerrada && !estourou(mao.cartas)) return
    jogador.maoAtiva += 1
  }

  passarVez(ctx, agora)
}

function passarVez(ctx: Contexto, agora: number): void {
  const estado = ctx.estado
  const naMesa = sentados(estado).filter((j) => j.maos.length > 0)
  const indice = naMesa.findIndex((j) => j.peerId === estado.vezDe)
  const proximo = naMesa[indice + 1]

  if (proximo) {
    estado.vezDe = proximo.peerId
    proximo.maoAtiva = 0
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
  } else {
    estado.vezDe = null
    estado.prazoTurno = null
    estado.fase = 'dealer'
  }
}

function distribuir(ctx: Contexto, agora: number, rng: Rng): void {
  const estado = ctx.estado
  const jogando = sentados(estado).filter((j) => j.maos.length > 0)

  for (let volta = 0; volta < 2; volta++) {
    for (const jogador of jogando) {
      jogador.maos[0]!.cartas.push(comprar(ctx, rng))
    }
    if (volta === 0) {
      estado.maoDealer = [comprar(ctx, rng)]
    } else {
      ctx.ocultaDealer = comprar(ctx, rng)
      estado.dealerTemOculta = true
    }
  }

  const mostraAs = estado.maoDealer[0]?.valor === 'A'
  estado.fase = mostraAs ? 'seguro' : 'turnos'
  estado.vezDe = jogando[0]?.peerId ?? null
  estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
}

function jogarDealer(ctx: Contexto, rng: Rng): void {
  const estado = ctx.estado
  if (ctx.ocultaDealer) {
    estado.maoDealer.push(ctx.ocultaDealer)
    ctx.ocultaDealer = null
    estado.dealerTemOculta = false
  }
  while (dealerDeveComprar(estado.maoDealer)) {
    estado.maoDealer.push(comprar(ctx, rng))
  }
  estado.fase = 'acerto'
}

function acertar(ctx: Contexto, agora: number, rng: Rng): void {
  const estado = ctx.estado
  const dealerBJ = estado.maoDealer.length === 2 && avaliar(estado.maoDealer).total === 21

  for (const jogador of estado.jogadores) {
    for (const mao of jogador.maos) {
      mao.resultado = resultadoDe(mao, estado.maoDealer)
      jogador.fichas += pagamento(mao, estado.maoDealer)
    }
    if (jogador.seguro > 0 && dealerBJ) {
      jogador.fichas += jogador.seguro * (1 + REGRAS.pagaSeguro)
    }
  }

  for (const jogador of estado.jogadores) {
    jogador.maos = []
    jogador.maoAtiva = 0
    jogador.seguro = 0
    if (jogador.fichas < REGRAS.apostaMin) jogador.fichas = REGRAS.stackInicial
  }

  estado.maoDealer = []
  estado.dealerTemOculta = false
  estado.rodada += 1
  estado.fase = sentados(estado).length >= 1 ? 'apostas' : 'aguardando'
  estado.prazoTurno = estado.fase === 'apostas'
    ? agora + REGRAS.segundosTurno * 1000
    : null

  if (precisaReembaralhar(ctx.sapata.length, REGRAS.numBaralhos)) {
    ctx.sapata = criarSapata(REGRAS.numBaralhos, rng)
    estado.cartasRestantes = ctx.sapata.length
  }
}

function transicionar(ctx: Contexto, agora: number, rng: Rng): Contexto {
  const estado = ctx.estado

  if (estado.fase === 'aguardando' && sentados(estado).length >= 1) {
    estado.fase = 'apostas'
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
  }

  if (estado.fase === 'apostas') {
    const naMesa = sentados(estado)
    if (naMesa.length > 0 && naMesa.every((j) => j.maos.length > 0)) {
      distribuir(ctx, agora, rng)
    }
  }

  if (estado.fase === 'dealer') {
    jogarDealer(ctx, rng)
  }

  if (estado.fase === 'acerto') {
    acertar(ctx, agora, rng)
  }

  return ctx
}

/** Chamado pelo host em intervalo curto: aplica prazos vencidos e transições pendentes. */
export function avancar(ctx: Contexto, agora: number, rng: Rng): Contexto {
  const novo = clonar(ctx)
  const estado = novo.estado
  const venceu = estado.prazoTurno !== null && agora >= estado.prazoTurno

  if (estado.fase === 'apostas' && venceu) {
    const semAposta = sentados(estado).filter((j) => j.maos.length === 0)
    if (sentados(estado).some((j) => j.maos.length > 0)) {
      distribuir(novo, agora, rng)
    } else {
      estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
    }
    for (const jogador of semAposta) jogador.rodadasInativo += 1
    return transicionar(novo, agora, rng)
  }

  if (estado.fase === 'seguro' && venceu) {
    estado.fase = 'turnos'
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
    return transicionar(novo, agora, rng)
  }

  if (estado.fase === 'turnos' && venceu) {
    const jogador = estado.jogadores.find((j) => j.peerId === estado.vezDe)
    if (jogador) {
      for (const mao of jogador.maos) mao.encerrada = true
      jogador.rodadasInativo += 1
      if (jogador.rodadasInativo >= REGRAS.rodadasParaEspectador) {
        jogador.cadeira = null
      }
      avancarTurnoSeNecessario(novo, agora)
    }
    return transicionar(novo, agora, rng)
  }

  return transicionar(novo, agora, rng)
}
