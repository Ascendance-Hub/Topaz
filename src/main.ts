import { Sessao } from './net/sessao'
import { criarTransporteTrystero } from './net/transport'
import { renderizarLobby } from './ui/components/lobby'
import { renderizarBarraSala } from './ui/components/barra-sala'
import { renderizar } from './ui/render'
import { rngSemente } from './game/shoe'

function rngDaSessao() {
  return rngSemente(Date.now() ^ Math.floor(Math.random() * 1e9))
}

/**
 * Monta a partida dentro de `app` e mantém tudo em dia: a mesa via
 * `renderizar` e a barra de sala via `renderizarBarraSala`.
 *
 * `Node.replaceWith` só substitui o nó no DOM uma vez — chamar de novo sobre
 * a MESMA referência antiga mexe num nó já órfão, e a tela para de
 * acompanhar (é assim que passaria batido um "você é o anfitrião" que nunca
 * atualiza após uma migração de host). Por isso `barra` é reatribuída a
 * cada troca: cada `desenhar()` sempre substitui o nó que está de fato na
 * página, nunca um órfão de uma rodada anterior.
 */
export function iniciarPartida(app: HTMLElement, apelido: string, codigo: string): void {
  const sessao = new Sessao(criarTransporteTrystero(codigo), rngDaSessao)

  let barra = renderizarBarraSala(codigo, sessao.souHost())
  const palco = document.createElement('div')
  app.replaceChildren(barra, palco)

  function desenhar(): void {
    const novaBarra = renderizarBarraSala(codigo, sessao.souHost())
    barra.replaceWith(novaBarra)
    barra = novaBarra
    renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
  }

  sessao.aoMudar(desenhar)
  sessao.entrar(apelido)
  desenhar()

  // O host avalia prazos vencidos (turno, reconexão); nos clientes o tique
  // não faz nada — só o host tem efeito colateral (ver Sessao.tique).
  setInterval(() => sessao.tique(Date.now()), 500)

  window.addEventListener('beforeunload', () => sessao.encerrar())
}

export const MENSAGEM_ERRO_INICIAL = 'Não foi possível carregar o Topaz. Recarregue a página.'

/**
 * `renderizarLobby` roda antes de qualquer clique do usuário; um erro
 * inesperado aqui (sem isso) deixaria a página em branco, sem nenhuma pista
 * do que houve. Não é um sistema de relato de erros — é uma mensagem legível
 * de fallback, o suficiente para o usuário saber que algo falhou e recarregar.
 */
export function iniciarApp(app: HTMLElement): void {
  try {
    app.replaceChildren(renderizarLobby((apelido, codigo) => iniciarPartida(app, apelido, codigo)))
  } catch {
    app.textContent = MENSAGEM_ERRO_INICIAL
  }
}

const raiz = document.querySelector<HTMLDivElement>('#app')
if (raiz) iniciarApp(raiz)
