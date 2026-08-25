import { classificacao } from '../../game/classificacao'
import type { Colocacao } from '../../game/classificacao'
import type { Acao, EstadoJogo } from '../../game/types'

function div(classe: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

/** "Alex e Bruno"; "Alex, Bruno e Carla". */
function listar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

/**
 * A frase abaixo do título. `vencedor` nulo tem DOIS significados na spec §6:
 * ninguém sobrou apto (regra 3) e dois ou mais cruzaram o alvo com fichas
 * idênticas — empate de verdade. A tela só conhecia o primeiro, então uma
 * mesa com dois jogadores de 1600 fichas anunciava que "a mesa quebrou junto"
 * logo acima do placar que mostrava as 1600 de cada um.
 *
 * Por isso a decisão sai do vencedor sozinho e passa pelo placar, onde o
 * grupo empatado já vem em primeiro.
 */
function subtitulo(estado: EstadoJogo, grupos: Colocacao[]): string {
  const campeao = estado.jogadores.find((j) => j.peerId === estado.vencedor)
  if (campeao) return `${campeao.apelido} venceu`

  const topo = grupos[0]
  const empateNoAlvo = topo !== undefined
    && topo.jogadores.length > 1
    // Sem alvo não existe "empate no alvo": a partida vai até sobrar um, e
    // quem está no topo empatado simplesmente continua jogando.
    && estado.config.alvo !== null
    && topo.jogadores.every(
      (j) => j.eliminadoEm === null && j.fichas >= estado.config.alvo!,
    )

  if (empateNoAlvo) {
    const nomes = listar(topo.jogadores.map((j) => j.apelido))
    const fichas = topo.jogadores[0]!.fichas.toLocaleString('pt-BR')
    return `Empate no topo — ${nomes} chegaram juntos a ${fichas} fichas`
  }

  return 'Ninguém sobrou com fichas — a mesa quebrou junto'
}

export function renderizarFim(
  estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): HTMLElement {
  const tela = div('fim')

  const titulo = document.createElement('h2')
  titulo.textContent = 'Fim de partida'
  tela.append(titulo)

  const grupos = classificacao(estado)
  const campeao = estado.jogadores.find((j) => j.peerId === estado.vencedor)
  const sub = div('sub', subtitulo(estado, grupos))
  if (campeao) sub.dataset.vencedor = campeao.peerId
  tela.append(sub)

  for (const grupo of grupos) {
    for (const jogador of grupo.jogadores) {
      const linha = div('colocacao')
      linha.dataset.colocacao = String(grupo.posicao)
      if (jogador.peerId === estado.vencedor) linha.classList.add('campea')

      linha.append(
        div('pos', `${grupo.posicao}º`),
        div('quem', jogador.apelido),
        jogador.eliminadoEm === null
          // Mesmo formato do selo de fichas da mesa: a mesma pessoa que via
          // "1.520" na mesa via "1520" aqui.
          ? div('saldo', jogador.fichas.toLocaleString('pt-BR'))
          : div('caiu', `eliminado na rodada ${jogador.eliminadoEm}`),
      )
      tela.append(linha)
    }
  }

  if (estado.hostAtual === meuId) {
    const botao = document.createElement('button')
    botao.className = 'botao'
    botao.textContent = 'Nova partida'
    botao.dataset.acao = 'novaPartida'
    botao.style.marginTop = '18px'
    botao.onclick = () => aoAgir({ tipo: 'novaPartida' })
    tela.append(botao)
  } else {
    tela.append(div('sub', 'Aguardando o anfitrião iniciar uma nova partida'))
  }

  return tela
}
