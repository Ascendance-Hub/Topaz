import { classificacao } from '../../game/classificacao'
import type { Acao, EstadoJogo } from '../../game/types'

function div(classe: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

export function renderizarFim(
  estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): HTMLElement {
  const tela = div('fim')

  const titulo = document.createElement('h2')
  titulo.textContent = 'Fim de partida'
  tela.append(titulo)

  const campeao = estado.jogadores.find((j) => j.peerId === estado.vencedor)
  const sub = div('sub')
  if (campeao) {
    sub.textContent = `${campeao.apelido} venceu`
    sub.dataset.vencedor = campeao.peerId
  } else {
    sub.textContent = 'Ninguém sobrou com fichas — a mesa quebrou junto'
  }
  tela.append(sub)

  for (const grupo of classificacao(estado)) {
    for (const jogador of grupo.jogadores) {
      const linha = div('colocacao')
      linha.dataset.colocacao = String(grupo.posicao)
      if (jogador.peerId === estado.vencedor) linha.classList.add('campea')

      linha.append(
        div('pos', `${grupo.posicao}º`),
        div('quem', jogador.apelido),
        jogador.eliminadoEm === null
          ? div('saldo', String(jogador.fichas))
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
