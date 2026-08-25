import { elementoCarta } from './carta'
import { botaoAjuda } from './ajuda'
import { avaliar } from '../../game/hand'
import { podeSentar } from '../../game/machine'
import { REGRAS, acoesDisponiveis, fichasDisponiveis } from '../../game/rules'
import type { Acao, EstadoJogo, Jogador, Mao, ResultadoMao } from '../../game/types'

/** As quatro ações de turno, as únicas cujo rótulo alguém lê daqui. */
type AcaoDeTurno = 'pedir' | 'parar' | 'dobrar' | 'dividir'

const ROTULO_ACAO: Record<AcaoDeTurno, string> = {
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
 * Selo de saldo — usado tanto na peça do adversário quanto no painel
 * próprio, para que o número de fichas tenha sempre o mesmo destaque
 * visual, fora de qualquer frase.
 */
function seloFichas(fichas: number): HTMLElement {
  const selo = document.createElement('div')
  selo.className = 'selo-fichas'
  selo.dataset['fichas'] = String(fichas)

  const valor = document.createElement('b')
  valor.textContent = fichas.toLocaleString('pt-BR')
  const rotulo = document.createElement('span')
  rotulo.textContent = 'fichas'

  selo.append(valor, rotulo)
  return selo
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
 * O painel de ajuda aberto/fechado, vindo de fora e devolvido para fora pelo
 * mesmo caminho da contagem de cartas: `render.ts` guarda no dataset da raiz,
 * porque a tela é reconstruída inteira a cada mudança de estado.
 */
export type EstadoAjuda = {
  aberta: boolean
  aoAlternar: (aberta: boolean) => void
}

const AJUDA_FECHADA: EstadoAjuda = { aberta: false, aoAlternar: () => {} }

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

/**
 * O convite para sentar: cadeira livre E elegibilidade, num lugar só.
 *
 * A sala de espera e o convite do espectador varriam as cadeiras com o mesmo
 * trecho copiado, e as duas cópias tinham passado a significar coisas
 * diferentes do motor. `podeSentar` recusa retardatário, eliminado e partida
 * encerrada; a tela não sabia de nada disso e oferecia o botão assim mesmo —
 * e esta rodada cria eliminados toda partida, por desenho. A spec §5 diz que
 * o eliminado assiste ao jogo, não que ele seja convidado de novo a cada
 * render para ser ignorado.
 */
function conviteParaSentar(
  estado: EstadoJogo, eu: Jogador,
): { cadeira: number | null; rotulo: string; desabilitado: boolean } {
  const livre = Array.from({ length: REGRAS.maxCadeiras }, (_, i) => i)
    .find((c) => !estado.jogadores.some((j) => j.cadeira === c)) ?? null

  if (!podeSentar(estado, eu.peerId)) {
    return {
      cadeira: null,
      rotulo: eu.eliminadoEm !== null
        ? 'Eliminado — aguarde a próxima partida'
        : 'Partida em andamento',
      desabilitado: true,
    }
  }

  if (livre === null) return { cadeira: null, rotulo: 'Mesa cheia', desabilitado: true }
  return { cadeira: livre, rotulo: 'Sentar à mesa', desabilitado: false }
}

function botaoSentar(
  estado: EstadoJogo, eu: Jogador, aoAgir: (acao: Acao) => void,
): HTMLButtonElement {
  const { cadeira, rotulo, desabilitado } = conviteParaSentar(estado, eu)
  return botao('botao', rotulo,
    () => { if (cadeira !== null) aoAgir({ tipo: 'sentar', cadeira }) },
    { desabilitado, dataset: { acao: 'sentar' } })
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
  peca.append(div('nome', jogador.apelido), seloFichas(jogador.fichas))
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

/**
 * Barra do relógio de turno (spec §7). `renderizar` só roda quando o estado
 * muda, e durante um turno nada muda — uma largura calculada na hora do
 * render ficava parada em 100% até o jogador ser parado automaticamente,
 * sem nenhum aviso de que o tempo estava correndo.
 *
 * Aqui a barra é uma animação CSS semeada pelo prazo: a duração é a do turno
 * inteiro e o atraso NEGATIVO pula direto para o ponto em que ela já está,
 * então ela anda sozinha, sem novo render e sem `setInterval` de UI. A
 * largura inline é o mesmo valor em forma estática — é o que sobra, e
 * continua correto, quando `prefers-reduced-motion` desliga a animação.
 */
function barraPrazo(prazoTurno: number, agora: number, segundosTurno: number): HTMLElement {
  // A duração vem da configuração da partida, não de uma constante: com o
  // anfitrião podendo mudar o tempo de jogada, uma barra fixa em 30s andaria
  // no ritmo errado — e o ritmo dela é a única pista de quanto falta.
  const total = segundosTurno * 1000
  const restante = Math.min(total, Math.max(0, prazoTurno - agora))
  const barra = div('barra-prazo')
  const preenchida = document.createElement('div')
  preenchida.style.width = `${(restante / total) * 100}%`
  preenchida.style.animationDuration = `${total}ms`
  preenchida.style.animationDelay = `${restante - total}ms`
  barra.append(preenchida)
  return barra
}

function painelProprio(
  estado: EstadoJogo, eu: Jogador, aoAgir: (acao: Acao) => void,
  anteriores: ContagensCartas, ajuda: EstadoAjuda,
): HTMLElement {
  const painel = div('painel-proprio')
  // A mão que recebe os botões continua sendo a ativa — só ela aceita ação.
  // O que se vê na tela, porém, são todas.
  const mao = eu.maos[eu.maoAtiva]
  const vezDele = estado.vezDe === eu.peerId

  painel.append(
    div('rotulo', eu.maos.length > 1 ? 'Suas mãos' : 'Sua mão'),
    blocoMaos(eu, vezDele, { grande: true, mostrarAposta: true }, anteriores),
    div('nome', eu.apelido),
    seloFichas(eu.fichas),
  )
  if (eu.maos.length === 0) painel.append(div('total', 'sem aposta'))

  const acoes = div('acoes')

  if (estado.fase === 'apostas' && eu.maos.length === 0) {
    for (const valor of fichasDisponiveis(estado.config.apostaMax)) {
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
      // `acoesDisponiveis` promete `TipoAcao[]` mas por construção só devolve
      // ações de turno. O guarda estreita de verdade: depois dele `tipo` é
      // `AcaoDeTurno`, o que faz `ROTULO_ACAO` indexar sem buraco e a ação
      // montada abaixo já ser uma `Acao` legítima, sem cast.
      if (tipo !== 'pedir' && tipo !== 'parar' && tipo !== 'dobrar' && tipo !== 'dividir') continue
      const classe = tipo === 'pedir' || tipo === 'parar' ? 'botao' : 'botao fantasma'
      acoes.append(botao(classe, ROTULO_ACAO[tipo], () => aoAgir({ tipo, maoId: mao.id }), {
        dataset: { acao: tipo },
      }))
    }
  }

  acoes.append(botaoAjuda(ajuda.aberta, ajuda.aoAlternar))

  painel.append(acoes)

  if (estado.prazoTurno !== null && vezDele) {
    painel.append(barraPrazo(estado.prazoTurno, Date.now(), estado.config.segundosTurno))
  }

  return painel
}

export function renderizarMesa(
  estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
  anteriores: ContagensCartas = {}, ajuda: EstadoAjuda = AJUDA_FECHADA,
): HTMLElement {
  const mesa = div('mesa')
  const eu = estado.jogadores.find((j) => j.peerId === meuId)

  // A sala de espera é uma tela só: nem mesa de dealer vazia, nem "aguardando
  // jogadores" (que o anfitrião já sentado lia ao lado de um "Iniciar
  // partida" habilitado). O que importa aqui é quem já está na mesa.
  if (estado.fase === 'aguardando') {
    const espera = div('painel-proprio espera')
    espera.append(div('rotulo', 'Sala de espera'))

    const naMesa = estado.jogadores
      .filter((j) => j.cadeira !== null)
      .sort((a, b) => a.cadeira! - b.cadeira!)

    if (naMesa.length === 0) {
      espera.append(div('aviso', 'Ninguém sentado ainda — compartilhe o link da sala.'))
    } else {
      const lista = div('lista-espera')
      for (const jogador of naMesa) {
        // Inclusive eu: sem me ver na lista, sentar não tem confirmação
        // nenhuma na tela de quem sentou.
        const linha = div('quem', jogador.peerId === meuId
          ? `${jogador.apelido} (você)`
          : jogador.apelido)
        linha.dataset['sentado'] = String(jogador.cadeira)
        lista.append(linha)
      }
      espera.append(lista)
    }

    if (eu && eu.cadeira === null) espera.append(botaoSentar(estado, eu, aoAgir))

    if (estado.hostAtual === meuId) {
      const sentados = estado.jogadores.filter((j) => j.cadeira !== null).length
      espera.append(botao('botao', 'Iniciar partida',
        () => aoAgir({ tipo: 'iniciar' }),
        { desabilitado: sentados === 0, dataset: { acao: 'iniciar' } }))
    } else {
      espera.append(div('aviso', 'Aguardando o anfitrião iniciar'))
    }

    mesa.append(espera)
    return mesa
  }

  mesa.append(areaDealer(estado, anteriores), div('separador'))

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
    mesa.append(painelProprio(estado, eu, aoAgir, anteriores, ajuda))
  } else if (eu) {
    const convite = div('painel-proprio')
    convite.append(div('rotulo', 'Espectador'), botaoSentar(estado, eu, aoAgir))
    mesa.append(convite)
  }

  return mesa
}
