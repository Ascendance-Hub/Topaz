import { elementoCarta } from './carta'
import { avaliar } from '../../game/hand'
import { REGRAS, acoesDisponiveis } from '../../game/rules'
import type { Acao, EstadoJogo, Jogador, Mao, ResultadoMao, TipoAcao } from '../../game/types'

const ROTULO_ACAO: Record<TipoAcao, string> = {
  entrar: 'Entrar', sentar: 'Sentar', levantar: 'Levantar',
  apostar: 'Apostar', seguro: 'Seguro',
  pedir: 'Pedir', parar: 'Parar', dobrar: 'Dobrar', dividir: 'Dividir',
}

const ROTULO_RESULTADO: Record<ResultadoMao, string> = {
  ganhou: 'ganhou', perdeu: 'perdeu', empatou: 'empatou', blackjack: 'blackjack!',
}

function div(classe: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

/**
 * Quantas cartas cada "entidade" (uma mão, pelo id, ou o dealer) tinha na
 * tela da última vez que essa raiz renderizou. Vem de fora (render.ts a lê
 * do próprio elemento raiz) — mesa.ts não guarda nada entre chamadas, só
 * decide, a partir do que recebeu, quais cartas de agora ficam além do que
 * já existia.
 */
export type ContagensCartas = Record<string, number>

/**
 * Chave da entidade "dealer" em `ContagensCartas`, e o formatador da chave
 * de mão — exportados porque render.ts monta o `ContagensCartas` do lado de
 * fora (comparando com a renderização anterior) e precisa gerar exatamente
 * as mesmas chaves que este módulo usa para consultar.
 *
 * A chave é por mão, não por jogador: com split, um jogador tem até 3 mãos
 * na tela ao mesmo tempo e uma contagem só por jogador não saberia qual
 * delas cresceu.
 */
export const CHAVE_DEALER = 'dealer'

export function chaveMao(maoId: string): string {
  return `mao:${maoId}`
}

function cartaEhNova(chave: string, indice: number, anteriores: ContagensCartas): boolean {
  return indice >= (anteriores[chave] ?? 0)
}

/**
 * `data-acao` (e afins) existe só para que os testes localizem o botão
 * certo por estrutura em vez de depender do texto em português.
 */
function botao(
  classe: string, texto: string, aoClicar: () => void,
  opcoes: { desabilitado?: boolean; dataset?: Record<string, string> } = {},
): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = classe
  el.textContent = texto
  el.disabled = opcoes.desabilitado ?? false
  if (opcoes.dataset) {
    for (const [chave, valor] of Object.entries(opcoes.dataset)) el.dataset[chave] = valor
  }
  el.onclick = aoClicar
  return el
}

function maoEncerrada(mao: Mao): boolean {
  return mao.encerrada || avaliar(mao.cartas).total > 21
}

/** Situação da mão em uma palavra: o resultado quando já houve acerto,
 *  senão como ela terminou (ou que está sendo jogada agora). */
function situacaoDaMao(mao: Mao, ativa: boolean, vezDele: boolean): string {
  if (mao.resultado) return ROTULO_RESULTADO[mao.resultado]
  if (avaliar(mao.cartas).total > 21) return 'estourou'
  if (mao.encerrada) return 'parou'
  return ativa && vezDele ? 'jogando…' : ''
}

/**
 * Uma mão na tela. Renderizada para TODAS as mãos do jogador, não só para a
 * de índice `maoAtiva`: assim que uma mão encerra, o motor deixa `maoAtiva`
 * apontando para além do fim do array (é o cursor de "já terminei"), então
 * usar esse índice como "a mão a mostrar" apagava as cartas da tela no
 * instante em que o jogador parava, estourava ou dobrava. E com split são 2
 * ou 3 mãos simultâneas, todas com direito a aparecer.
 */
function blocoMao(
  mao: Mao, ativa: boolean, vezDele: boolean,
  opcoes: { grande?: boolean; mostrarAposta?: boolean },
  anteriores: ContagensCartas,
): HTMLElement {
  const bloco = div('mao')
  bloco.dataset['mao'] = mao.id
  if (ativa) bloco.classList.add('ativa')
  if (maoEncerrada(mao)) bloco.classList.add('encerrada')
  if (mao.resultado) bloco.dataset['resultado'] = mao.resultado

  const cartas = div('mao-cartas')
  const chave = chaveMao(mao.id)
  mao.cartas.forEach((carta, indice) => {
    cartas.append(elementoCarta(carta, {
      grande: opcoes.grande, nova: cartaEhNova(chave, indice, anteriores),
    }))
  })

  const partes = [String(avaliar(mao.cartas).total)]
  if (opcoes.mostrarAposta) partes.push(`aposta ${mao.aposta}`)
  const situacao = situacaoDaMao(mao, ativa, vezDele)
  if (situacao) partes.push(situacao)

  bloco.append(cartas, div('total', partes.join(' · ')))
  return bloco
}

/** Todas as mãos do jogador lado a lado, com a ativa marcada quando o
 *  cursor `maoAtiva` ainda aponta para dentro do array. */
function blocoMaos(
  jogador: Jogador, vezDele: boolean,
  opcoes: { grande?: boolean; mostrarAposta?: boolean },
  anteriores: ContagensCartas,
): HTMLElement {
  const maos = div('maos')
  jogador.maos.forEach((mao, indice) => {
    maos.append(blocoMao(mao, indice === jogador.maoAtiva, vezDele, opcoes, anteriores))
  })
  return maos
}

function pecaJogador(jogador: Jogador, vezDele: boolean, anteriores: ContagensCartas): HTMLElement {
  const peca = div('peca')
  if (vezDele) peca.classList.add('vez')

  // Esmaecida quando não sobrou nada para ele fazer nesta rodada.
  if (jogador.maos.length > 0 && jogador.maos.every(maoEncerrada)) {
    peca.classList.add('encerrada')
  }

  peca.append(blocoMaos(jogador, vezDele, {}, anteriores))
  peca.append(div('nome', jogador.apelido), div('fichas', String(jogador.fichas)))
  if (jogador.maos.length === 0) peca.append(div('total', 'aguardando'))
  return peca
}

function areaDealer(estado: EstadoJogo, anteriores: ContagensCartas): HTMLElement {
  const area = div('dealer')
  const cartas = div('mao-cartas')
  estado.maoDealer.forEach((carta, indice) => {
    cartas.append(elementoCarta(carta, { nova: cartaEhNova(CHAVE_DEALER, indice, anteriores) }))
  })
  if (estado.dealerTemOculta) {
    const indice = estado.maoDealer.length
    cartas.append(elementoCarta(null, { nova: cartaEhNova(CHAVE_DEALER, indice, anteriores) }))
  }

  const visivel = estado.maoDealer[0]
  const totalMostrado = estado.dealerTemOculta && visivel
    ? avaliar([visivel]).total
    : estado.maoDealer.length > 0
      ? avaliar(estado.maoDealer).total
      : null

  const legenda = estado.dealerTemOculta && visivel
    ? `mostra ${totalMostrado}`
    : totalMostrado !== null
      ? `total ${totalMostrado}`
      : ''

  const totalEl = div('total', legenda)
  // Valor estrutural do total mostrado — cobre só a carta visível enquanto
  // a oculta não é revelada, sem depender da frase em português.
  if (totalMostrado !== null) totalEl.dataset['total'] = String(totalMostrado)

  area.append(div('rotulo', 'Dealer'), cartas, totalEl)
  return area
}

function painelProprio(
  estado: EstadoJogo, eu: Jogador, aoAgir: (acao: Acao) => void, anteriores: ContagensCartas,
): HTMLElement {
  const painel = div('painel-proprio')
  // A mão que recebe os botões continua sendo a ativa — só ela aceita ação.
  // O que se vê na tela, porém, são todas.
  const mao = eu.maos[eu.maoAtiva]
  const vezDele = estado.vezDe === eu.peerId

  painel.append(
    div('rotulo', eu.maos.length > 1 ? 'Suas mãos' : 'Sua mão'),
    blocoMaos(eu, vezDele, { grande: true, mostrarAposta: true }, anteriores),
    div('nome', `${eu.apelido} — ${eu.fichas} fichas`),
  )
  if (eu.maos.length === 0) painel.append(div('total', 'sem aposta'))

  const acoes = div('acoes')

  if (estado.fase === 'apostas' && eu.maos.length === 0) {
    for (const valor of REGRAS.fichas) {
      acoes.append(botao('botao', `Apostar ${valor}`, () => aoAgir({ tipo: 'apostar', valor }), {
        desabilitado: valor > eu.fichas,
        dataset: { acao: 'apostar', valor: String(valor) },
      }))
    }
  }

  // Gatilho é "ainda não respondeu à oferta" — não "não comprou seguro",
  // que também vale para quem respondeu e dispensou.
  if (estado.fase === 'seguro' && eu.maos.length > 0 && !eu.decidiuSeguro) {
    for (const [rotulo, aceitar] of [['Fazer seguro', true], ['Dispensar', false]] as const) {
      const classe = aceitar ? 'botao' : 'botao fantasma'
      acoes.append(botao(classe, rotulo, () => aoAgir({ tipo: 'seguro', aceitar }), {
        dataset: { acao: 'seguro', aceitar: String(aceitar) },
      }))
    }
  }

  if (estado.fase === 'turnos' && vezDele && mao) {
    for (const tipo of acoesDisponiveis(mao, eu)) {
      const classe = tipo === 'pedir' || tipo === 'parar' ? 'botao' : 'botao fantasma'
      acoes.append(botao(classe, ROTULO_ACAO[tipo], () => aoAgir({ tipo, maoId: mao.id } as Acao), {
        dataset: { acao: tipo },
      }))
    }
  }

  painel.append(acoes)

  if (estado.prazoTurno !== null && estado.vezDe === eu.peerId) {
    const barra = div('barra-prazo')
    const preenchida = document.createElement('div')
    const restante = Math.max(0, estado.prazoTurno - Date.now())
    preenchida.style.width = `${(restante / (REGRAS.segundosTurno * 1000)) * 100}%`
    barra.append(preenchida)
    painel.append(barra)
  }

  return painel
}

export function renderizarMesa(
  estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
  anteriores: ContagensCartas = {},
): HTMLElement {
  const mesa = div('mesa')
  mesa.append(areaDealer(estado, anteriores), div('separador'))

  const eu = estado.jogadores.find((j) => j.peerId === meuId)
  const outros = estado.jogadores
    .filter((j) => j.peerId !== meuId && j.cadeira !== null)
    .sort((a, b) => a.cadeira! - b.cadeira!)

  if (outros.length === 0) {
    mesa.append(div('vazio', 'Aguardando jogadores… compartilhe o link da sala.'))
  } else {
    const grade = div('grade')
    if (outros.length <= 3) grade.classList.add('poucos')
    for (const jogador of outros) {
      grade.append(pecaJogador(jogador, estado.vezDe === jogador.peerId, anteriores))
    }
    mesa.append(grade)
  }

  if (eu && eu.cadeira !== null) {
    mesa.append(painelProprio(estado, eu, aoAgir, anteriores))
  } else if (eu) {
    const convite = div('painel-proprio')
    const livre = Array.from({ length: REGRAS.maxCadeiras }, (_, i) => i)
      .find((c) => !estado.jogadores.some((j) => j.cadeira === c))
    convite.append(
      div('rotulo', 'Espectador'),
      botao('botao', livre === undefined ? 'Mesa cheia' : 'Sentar à mesa',
        () => { if (livre !== undefined) aoAgir({ tipo: 'sentar', cadeira: livre }) },
        { desabilitado: livre === undefined, dataset: { acao: 'sentar' } }),
    )
    mesa.append(convite)
  }

  return mesa
}
