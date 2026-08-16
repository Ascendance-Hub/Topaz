import { elementoCarta } from './carta'
import { avaliar } from '../../game/hand'
import { REGRAS, acoesDisponiveis } from '../../game/rules'
import type { Acao, EstadoJogo, Jogador, TipoAcao } from '../../game/types'

const ROTULO_ACAO: Record<TipoAcao, string> = {
  entrar: 'Entrar', sentar: 'Sentar', levantar: 'Levantar',
  apostar: 'Apostar', seguro: 'Seguro',
  pedir: 'Pedir', parar: 'Parar', dobrar: 'Dobrar', dividir: 'Dividir',
}

function div(classe: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
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

function descreverEstado(jogador: Jogador, vezDele: boolean): string {
  const mao = jogador.maos[jogador.maoAtiva]
  if (!mao) return 'aguardando'
  const { total } = avaliar(mao.cartas)
  if (total > 21) return `${total} · estourou`
  if (mao.encerrada) return `${total} · parou`
  return vezDele ? `${total} · jogando…` : String(total)
}

function pecaJogador(jogador: Jogador, vezDele: boolean): HTMLElement {
  const peca = div('peca')
  if (vezDele) peca.classList.add('vez')

  const mao = jogador.maos[jogador.maoAtiva]
  if (mao && (mao.encerrada || avaliar(mao.cartas).total > 21)) {
    peca.classList.add('encerrada')
  }

  const cartas = div('mao-cartas')
  for (const carta of mao?.cartas ?? []) cartas.append(elementoCarta(carta))
  peca.append(cartas, div('nome', jogador.apelido),
    div('fichas', String(jogador.fichas)),
    div('total', descreverEstado(jogador, vezDele)))
  return peca
}

function areaDealer(estado: EstadoJogo): HTMLElement {
  const area = div('dealer')
  const cartas = div('mao-cartas')
  for (const carta of estado.maoDealer) cartas.append(elementoCarta(carta))
  if (estado.dealerTemOculta) cartas.append(elementoCarta(null))

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
  estado: EstadoJogo, eu: Jogador, aoAgir: (acao: Acao) => void,
): HTMLElement {
  const painel = div('painel-proprio')
  const mao = eu.maos[eu.maoAtiva]

  const cartas = div('mao-cartas')
  for (const carta of mao?.cartas ?? []) cartas.append(elementoCarta(carta, { grande: true }))

  const rotuloMaos = eu.maos.length > 1
    ? `Sua mão ${eu.maoAtiva + 1} de ${eu.maos.length}`
    : 'Sua mão'

  painel.append(
    div('rotulo', rotuloMaos),
    cartas,
    div('nome', `${eu.apelido} — ${eu.fichas} fichas`),
    div('total', mao ? `${avaliar(mao.cartas).total} · aposta ${mao.aposta}` : 'sem aposta'),
  )

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

  if (estado.fase === 'turnos' && estado.vezDe === eu.peerId && mao) {
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
): HTMLElement {
  const mesa = div('mesa')
  mesa.append(areaDealer(estado), div('separador'))

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
      grade.append(pecaJogador(jogador, estado.vezDe === jogador.peerId))
    }
    mesa.append(grade)
  }

  if (eu && eu.cadeira !== null) {
    mesa.append(painelProprio(estado, eu, aoAgir))
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
