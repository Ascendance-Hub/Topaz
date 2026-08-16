import { criarSapata, precisaReembaralhar } from './shoe'
import { avaliar, estourou } from './hand'
import { REGRAS, acoesDisponiveis, dealerDeveComprar, pagamento, resultadoDe } from './rules'
import type { Acao, Carta, EstadoJogo, Jogador, Mao, Rng } from './types'

export interface Contexto {
  estado: EstadoJogo
  sapata: Carta[]
  ocultaDealer: Carta | null
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

/**
 * Na sala de espera qualquer um senta. Com a partida em andamento, só volta
 * a sentar quem já estava nela — assim quem perdeu a cadeira por inatividade
 * consegue voltar, mas um retardatário não entra com 1000 fichas numa mesa
 * onde os outros já lutaram até 400.
 */
function podeSentar(estado: EstadoJogo, jogador: Jogador): boolean {
  if (estado.fase === 'aguardando') return true
  if (estado.fase === 'fim') return false
  return estado.naPartida.includes(jogador.peerId)
    && jogador.eliminadoEm === null
    && jogador.fichas >= REGRAS.apostaMin
}

/**
 * Quem ainda pode disputar: entrou na partida, não foi eliminado e tem
 * fichas para apostar — sentado ou não. Quem perdeu a cadeira por
 * inatividade continua contando porque pode voltar; se fechar a aba, a
 * purga de desconectados o remove de `jogadores` e a contagem se resolve.
 */
function aptos(estado: EstadoJogo): Jogador[] {
  return estado.jogadores.filter(
    (j) => estado.naPartida.includes(j.peerId)
      && j.eliminadoEm === null
      && j.fichas >= REGRAS.apostaMin,
  )
}

/**
 * Spec §6 regra 3 aplicada fora do acerto: se ninguém mais pode disputar a
 * partida, ela acaba aqui mesmo. Sem isto, uma fase com prazo (`apostas`) só
 * sabia reatar o próprio prazo — e, com todos os participantes fora da sala,
 * reatava para sempre: `limparRodada` nunca rodava, `decidirFim` nunca era
 * consultado e nenhuma outra ação abria saída, porque `iniciar` exige
 * `aguardando` e `novaPartida` exige `fim`.
 *
 * Só é seguro consultar em fase sem aposta em jogo: durante a rodada as
 * fichas apostadas já saíram do saldo, e quem está all-in apareceria como
 * inapto sem estar.
 */
function encerrarSemNinguemApto(estado: EstadoJogo): boolean {
  if (aptos(estado).length > 0) return false
  estado.fase = 'fim'
  estado.vencedor = null
  estado.vezDe = null
  estado.prazoTurno = null
  return true
}

/**
 * A vez aponta para alguém que já não está em `jogadores` — a purga de
 * desconectados o levou embora no meio do turno dele. O prazo dele vence e
 * não há a quem aplicá-lo: sem esta recuperação, todo tique seguinte tornava
 * a cair no mesmo nada e a fase `turnos` ficava presa para sempre.
 *
 * A vez vai para o primeiro sentado, em ordem de cadeira, que ainda tem mão
 * por jogar (`maoAtiva` dentro do array). Quem já parou tem o cursor além do
 * fim e fica de fora, então a vez nunca volta para quem já jogou. Não
 * sobrando ninguém, os turnos encerram — `dealer` segue sozinho daí.
 */
function recuperarVezOrfa(ctx: Contexto, agora: number): void {
  const estado = ctx.estado
  const proximo = sentados(estado)
    .filter((j) => j.maos.length > 0)
    .find((j) => j.maoAtiva < j.maos.length)

  if (proximo) {
    estado.vezDe = proximo.peerId
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
  } else {
    estado.vezDe = null
    estado.prazoTurno = null
    estado.fase = 'dealer'
  }
}

/** Exportada para teste direto: a lógica é pura e não precisa de rodada. */
export function decidirFim(estado: EstadoJogo): { acabou: boolean; vencedor: string | null } {
  const emJogo = aptos(estado)

  const noAlvo = emJogo.filter((j) => j.fichas >= REGRAS.alvoVitoria)
  if (noAlvo.length > 0) {
    const maior = Math.max(...noAlvo.map((j) => j.fichas))
    const lideres = noAlvo.filter((j) => j.fichas === maior)
    return { acabou: true, vencedor: lideres.length === 1 ? lideres[0]!.peerId : null }
  }

  if (emJogo.length === 0) return { acabou: true, vencedor: null }

  // `naPartida`, não `jogadores`: só quem entrou na partida conta para decidir
  // se ela era solo. Um espectador que abriu o link no meio não transforma uma
  // partida de um jogador em partida de dois — usar `jogadores` aqui faria o
  // solitário vencer sozinho no instante em que alguém entrasse na sala.
  if (emJogo.length === 1 && estado.naPartida.length >= 2) {
    return { acabou: true, vencedor: emJogo[0]!.peerId }
  }

  return { acabou: false, vencedor: null }
}

/** Cunha um novo id de mão a partir do contador que viaja no próprio estado —
 *  assim uma migração de host (nova aba, contador de módulo zerado) nunca
 *  gera ids que colidem com mãos já existentes. */
function maoNova(estado: EstadoJogo, aposta: number, vindaDeSplit = false): Mao {
  const id = `m${estado.proximoIdMao}`
  estado.proximoIdMao += 1
  return {
    id, cartas: [], aposta,
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
      proximoIdMao: 1,
      vencedor: null,
      naPartida: [],
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
        // `naPartida` guarda quem estava sentado no início. Ao reconectar, o
        // jogador troca de peerId — sem atualizar aqui, ele deixa de constar
        // como participante e perde o direito de voltar a sentar.
        const iAntigo = estado.naPartida.indexOf(ausente.peerId)
        if (iAntigo !== -1) estado.naPartida[iAntigo] = peerId
        ausente.peerId = peerId
        ausente.desconectadoEm = null
        break
      }
      estado.jogadores.push({
        peerId, apelido: acao.apelido, cadeira: null,
        fichas: REGRAS.stackInicial, maos: [], maoAtiva: 0,
        seguro: 0, rodadasInativo: 0, desconectadoEm: null,
        decidiuSeguro: false,
        eliminadoEm: null,
      })
      break
    }

    case 'sentar': {
      if (!jogador || jogador.cadeira !== null) break
      if (acao.cadeira < 0 || acao.cadeira >= REGRAS.maxCadeiras) break
      if (estado.jogadores.some((j) => j.cadeira === acao.cadeira)) break
      if (!podeSentar(estado, jogador)) break
      jogador.cadeira = acao.cadeira
      // Sentar é ação manual e recomeço: sem zerar isto, quem foi rebaixado
      // por inatividade (contador já no limite) perderia a cadeira de novo
      // na primeira janela de apostas em que não apostasse. A spec §7 diz
      // que ele "pode voltar a sentar quando quiser".
      jogador.rodadasInativo = 0
      break
    }

    case 'levantar': {
      if (!jogador) break
      const cadeiraAnterior = jogador.cadeira
      const eraSuaVez = estado.vezDe === peerId
      jogador.cadeira = null
      jogador.maos = []
      jogador.maoAtiva = 0
      // Sem isto a vez ficava presa em quem acabou de sair: a mesa inteira
      // esperava os 30 segundos do prazo por alguém que já não está lá.
      if (eraSuaVez) passarVez(novo, agora, cadeiraAnterior)
      break
    }

    case 'iniciar': {
      if (estado.fase !== 'aguardando') break
      if (peerId !== estado.hostAtual) break
      const naMesa = sentados(estado)
      if (naMesa.length === 0) break
      estado.naPartida = naMesa.map((j) => j.peerId)
      estado.fase = 'apostas'
      estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
      break
    }

    case 'novaPartida': {
      if (estado.fase !== 'fim') break
      if (peerId !== estado.hostAtual) break
      for (const j of estado.jogadores) {
        j.fichas = REGRAS.stackInicial
        j.eliminadoEm = null
        // As cadeiras são liberadas de propósito: sentar de novo é o sinal
        // de que a pessoa quer jogar a próxima, em vez de ser arrastada
        // para uma partida que talvez não queira.
        j.cadeira = null
        j.maos = []
        j.maoAtiva = 0
        j.seguro = 0
        j.decidiuSeguro = false
        j.rodadasInativo = 0
      }
      estado.naPartida = []
      estado.vencedor = null
      estado.rodada = 1
      estado.vezDe = null
      estado.prazoTurno = null
      estado.maoDealer = []
      estado.dealerTemOculta = false
      estado.fase = 'aguardando'
      break
    }

    case 'apostar': {
      if (!jogador || estado.fase !== 'apostas') break
      if (jogador.cadeira === null || jogador.maos.length > 0) break
      if (acao.valor < REGRAS.apostaMin || acao.valor > REGRAS.apostaMax) break
      if (acao.valor > jogador.fichas) break
      jogador.fichas -= acao.valor
      jogador.maos = [maoNova(estado, acao.valor)]
      jogador.maoAtiva = 0
      // Apostar é ação manual: quem aposta não está com o celular bloqueado.
      jogador.rodadasInativo = 0
      break
    }

    case 'seguro': {
      if (!jogador || estado.fase !== 'seguro') break
      // Marca a decisão já tomada independentemente da resposta — é isso
      // que libera a fase antes do prazo quando todos já responderam.
      jogador.decidiuSeguro = true
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
        const filha = maoNova(estado, mao.aposta, true)
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

/**
 * `cadeiraAtual` é a cadeira de quem estava jogando. Passada explicitamente
 * porque quem acabou de levantar (ou de ser rebaixado a espectador por
 * inatividade) já não aparece na lista de sentados para ser encontrado ali.
 */
function avancarTurnoSeNecessario(
  ctx: Contexto, agora: number, cadeiraAtual?: number | null,
): void {
  const estado = ctx.estado
  const jogador = estado.jogadores.find((j) => j.peerId === estado.vezDe)
  if (!jogador) return

  while (jogador.maoAtiva < jogador.maos.length) {
    const mao = jogador.maos[jogador.maoAtiva]!
    if (!mao.encerrada && !estourou(mao.cartas)) return
    jogador.maoAtiva += 1
  }

  passarVez(ctx, agora, cadeiraAtual === undefined ? jogador.cadeira : cadeiraAtual)
}

/**
 * Passa a vez para o próximo em ordem de cadeira. Procura pela cadeira, não
 * pela posição de quem está jogando dentro da lista: quando esse jogador
 * perdeu o lugar (levantou, ou virou espectador por inatividade) ele não
 * está mais na lista, e um `findIndex` devolvendo -1 fazia `indice + 1`
 * apontar para o PRIMEIRO jogador — a vez voltava para alguém que já tinha
 * jogado, com a mão fechada, sem botões, até o prazo de 30s vencer e ainda
 * levar um incremento de inatividade.
 *
 * Sem cadeira conhecida não há "próximo" possível: a fase de turnos encerra,
 * que é seguro — nunca devolve a vez a quem já jogou.
 */
function passarVez(ctx: Contexto, agora: number, cadeiraAtual: number | null): void {
  const estado = ctx.estado
  const naMesa = sentados(estado).filter((j) => j.maos.length > 0)
  const proximo = cadeiraAtual === null
    ? undefined
    : naMesa.find((j) => j.cadeira! > cadeiraAtual)

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

  for (const jogador of estado.jogadores) jogador.decidiuSeguro = false

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

/** Revela a carta oculta do dealer ao entrar na fase `dealer` e arma o
 *  prazo da primeira compra — o próprio saque, daqui em diante, acontece
 *  uma carta por vez em `avancar`, para que a UI tenha o que animar. */
function revelarOculta(ctx: Contexto, agora: number): void {
  const estado = ctx.estado
  if (ctx.ocultaDealer) {
    estado.maoDealer.push(ctx.ocultaDealer)
    ctx.ocultaDealer = null
    estado.dealerTemOculta = false
  }
  estado.prazoTurno = agora + REGRAS.msEntreCartasDealer
}

/** Fixa o resultado e credita fichas de cada mão e do seguro. Não limpa
 *  nada — a mesa continua mostrando as mãos resolvidas por um tempo. */
function resolverResultados(ctx: Contexto): void {
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
}

/** Limpa a mesa depois que o resultado já foi mostrado e abre a rodada
 *  seguinte (ou volta a aguardar, se ninguém mais está sentado). */
function limparRodada(ctx: Contexto, agora: number, rng: Rng): void {
  const estado = ctx.estado

  for (const jogador of estado.jogadores) {
    jogador.maos = []
    jogador.maoAtiva = 0
    jogador.seguro = 0
    jogador.decidiuSeguro = false
    // Abaixo da aposta mínima o jogador não consegue mais apostar — está
    // fora na prática, mesmo sem estar exatamente em zero. `estado.rodada`
    // ainda é a rodada que acabou de ser jogada; o incremento vem depois.
    if (jogador.cadeira !== null && jogador.fichas < REGRAS.apostaMin) {
      jogador.cadeira = null
      jogador.eliminadoEm = estado.rodada
    }
  }

  estado.maoDealer = []
  estado.dealerTemOculta = false
  estado.rodada += 1

  const fim = decidirFim(estado)
  if (fim.acabou) {
    estado.fase = 'fim'
    estado.vencedor = fim.vencedor
    estado.vezDe = null
    estado.prazoTurno = null
  } else {
    estado.fase = sentados(estado).length >= 1 ? 'apostas' : 'aguardando'
    estado.prazoTurno = estado.fase === 'apostas'
      ? agora + REGRAS.segundosTurno * 1000
      : null
  }

  if (precisaReembaralhar(ctx.sapata.length, REGRAS.numBaralhos)) {
    ctx.sapata = criarSapata(REGRAS.numBaralhos, rng)
    estado.cartasRestantes = ctx.sapata.length
  }
}

function transicionar(ctx: Contexto, agora: number, rng: Rng): Contexto {
  const estado = ctx.estado

  if (estado.fase === 'apostas') {
    const naMesa = sentados(estado)
    if (naMesa.length > 0 && naMesa.every((j) => j.maos.length > 0)) {
      distribuir(ctx, agora, rng)
    }
  }

  if (estado.fase === 'seguro') {
    const comMao = sentados(estado).filter((j) => j.maos.length > 0)
    if (comMao.length > 0 && comMao.every((j) => j.decidiuSeguro)) {
      estado.fase = 'turnos'
      estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
    }
  }

  // Entrar na fase `dealer` só revela a carta oculta e arma o prazo da
  // próxima compra — não joga a mão inteira num único passo síncrono.
  if (estado.fase === 'dealer' && ctx.ocultaDealer !== null) {
    revelarOculta(ctx, agora)
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
      // Ninguém apostou: ou a mesa continua esperando, ou já não há mesa
      // nenhuma para esperar e a partida acaba.
      if (encerrarSemNinguemApto(estado)) return transicionar(novo, agora, rng)
      estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
    }
    for (const jogador of semAposta) {
      jogador.rodadasInativo += 1
      // Spec §7: duas rodadas seguidas sem ação manual liberam a cadeira.
      // Só o prazo de turno aplicava isso, e aquele caminho exige ter
      // apostado — então um celular bloqueado ficava sentado para sempre,
      // fazendo TODA rodada esperar os 30s inteiros da fase de apostas.
      if (jogador.rodadasInativo >= REGRAS.rodadasParaEspectador) {
        jogador.cadeira = null
      }
    }
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
      // A cadeira é lida ANTES de um eventual rebaixamento: é ela que diz
      // quem é o próximo, e quem perde o lugar some da lista de sentados.
      const cadeiraAtual = jogador.cadeira
      for (const mao of jogador.maos) mao.encerrada = true
      jogador.rodadasInativo += 1
      if (jogador.rodadasInativo >= REGRAS.rodadasParaEspectador) {
        jogador.cadeira = null
      }
      avancarTurnoSeNecessario(novo, agora, cadeiraAtual)
    } else {
      recuperarVezOrfa(novo, agora)
    }
    return transicionar(novo, agora, rng)
  }

  if (estado.fase === 'dealer' && venceu) {
    if (dealerDeveComprar(estado.maoDealer)) {
      estado.maoDealer.push(comprar(novo, rng))
      estado.prazoTurno = agora + REGRAS.msEntreCartasDealer
    } else {
      resolverResultados(novo)
      estado.fase = 'acerto'
      estado.prazoTurno = agora + REGRAS.msMostrarResultado
    }
    return transicionar(novo, agora, rng)
  }

  if (estado.fase === 'acerto' && venceu) {
    limparRodada(novo, agora, rng)
    return transicionar(novo, agora, rng)
  }

  return transicionar(novo, agora, rng)
}
