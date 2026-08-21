import type { EstadoJogo } from '../../game/types'

export const AVISO_SOZINHO = 'Você é o único aqui. Mande o link para alguém.'

function botaoNav(
  chave: string, rotulo: string, atual: boolean, aoClicar: () => void,
): HTMLElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'nav-sala-item'
  botao.dataset['nav'] = chave
  botao.textContent = rotulo
  // `aria-current` em vez de só uma classe: é o que um leitor de tela usa
  // para dizer onde a pessoa está, e a marcação visual sai dele no CSS.
  if (atual) botao.setAttribute('aria-current', 'page')
  botao.onclick = aoClicar
  return botao
}

/**
 * Alterna entre a sala e a mesa.
 *
 * Abrir a mesa é escolha local de visualização, não estado compartilhado: a
 * mesa está sempre disponível na sala, e quem decide se ela ocupa a tela é
 * cada um. Sentar, esse sim, é compartilhado — e já era antes desta tela
 * existir.
 */
export function renderizarNavSala(
  mesaAberta: boolean, aoAlternar: (aberta: boolean) => void,
): HTMLElement {
  const nav = document.createElement('nav')
  nav.className = 'nav-sala'
  nav.append(
    botaoNav('sala', 'Sala', !mesaAberta, () => aoAlternar(false)),
    botaoNav('mesa', 'Mesa', mesaAberta, () => aoAlternar(true)),
  )
  return nav
}

/**
 * A sala sem a mesa aberta: quem está aqui.
 *
 * A lista sai de `estado.jogadores`, que já recebe quem entra mesmo sem
 * sentar — presença não precisou ser inventada para esta tela, e por isso ela
 * nasce sincronizada e testada.
 */
export function renderizarSalaParada(estado: EstadoJogo, meuId: string): HTMLElement {
  const tela = document.createElement('div')
  tela.className = 'sala-parada'

  const titulo = document.createElement('h2')
  titulo.className = 'sala-titulo'
  titulo.textContent = 'Na sala'
  tela.append(titulo)

  const lista = document.createElement('div')
  lista.className = 'sala-lista'
  for (const jogador of estado.jogadores) {
    const quem = document.createElement('span')
    quem.className = 'sala-quem'
    // `textContent`: o apelido vem de outro navegador, e ninguém aqui
    // escolheu executar o que o outro digitou.
    quem.textContent = jogador.apelido
    if (jogador.peerId === meuId) quem.dataset['eu'] = '1'
    // Quem caiu fica visível e marcado em vez de sumir: a cadeira e as fichas
    // dele continuam reservadas durante a janela de reconexão, então some da
    // tela seria mentira.
    if (jogador.desconectadoEm !== null) quem.dataset['caiu'] = '1'
    lista.append(quem)
  }
  tela.append(lista)

  if (estado.jogadores.length <= 1) {
    const aviso = document.createElement('p')
    aviso.className = 'sala-aviso'
    aviso.textContent = AVISO_SOZINHO
    tela.append(aviso)
  }

  return tela
}
