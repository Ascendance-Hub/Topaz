import type { EstadoJogo } from '../../game/types'

export const AVISO_SOZINHO = 'Você é o único aqui. Mande o link para alguém.'

export const ROTULO_ESPERANDO = 'a mesa está esperando você'

function botaoNav(
  chave: string, rotulo: string, atual: boolean, aoClicar: () => void,
  esperando = false,
): HTMLElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'nav-sala-item'
  botao.dataset['nav'] = chave
  botao.textContent = rotulo
  // `aria-current` em vez de só uma classe: é o que um leitor de tela usa
  // para dizer onde a pessoa está, e a marcação visual sai dele no CSS.
  if (atual) botao.setAttribute('aria-current', 'page')

  if (esperando) {
    botao.dataset['espera'] = '1'
    // A bolinha é decorativa; quem não enxerga cor precisa do rótulo. Sem
    // isto, o aviso existiria só para parte das pessoas.
    botao.setAttribute('aria-label', `${rotulo} — ${ROTULO_ESPERANDO}`)
    const marca = document.createElement('span')
    marca.className = 'nav-sala-marca'
    marca.setAttribute('aria-hidden', 'true')
    botao.append(marca)
  }

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
 *
 * `mesaEspera` marca o botão da mesa. Poder sair de perto da mesa criou um
 * jeito novo de perder a vez em silêncio: o prazo do turno vence, o anfitrião
 * passa a vez, e quem estava na sala descobre depois que parou numa mão que
 * nunca escolheu parar. A marca é o aviso — e não abre a mesa sozinha, para
 * não arrancar ninguém da conversa sem pedir licença.
 */
export function renderizarNavSala(
  mesaAberta: boolean, aoAlternar: (aberta: boolean) => void, mesaEspera = false,
): HTMLElement {
  const nav = document.createElement('nav')
  nav.className = 'nav-sala'
  nav.append(
    botaoNav('sala', 'Sala', !mesaAberta, () => aoAlternar(false)),
    botaoNav('mesa', 'Mesa', mesaAberta, () => aoAlternar(true), mesaEspera),
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
export function renderizarSalaParada(
  estado: EstadoJogo, meuId: string, conectados?: string[],
): HTMLElement {
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
    const souEu = jogador.peerId === meuId
    if (souEu) quem.dataset['eu'] = '1'
    // Quem caiu fica visível e marcado em vez de sumir: a cadeira e as fichas
    // dele continuam reservadas durante a janela de reconexão, então some da
    // tela seria mentira.
    const caiu = jogador.desconectadoEm !== null
    if (caiu) quem.dataset['caiu'] = '1'

    // "Achou mas não conectou": o anfitrião sabe que essa pessoa está aqui, e
    // mesmo assim eu não tenho conexão direta com ela. Não se acusa quem já
    // caiu — a queda já explica a ausência, e as duas marcas juntas
    // confundiriam dois diagnósticos diferentes na mesma ficha.
    if (conectados && !souEu && !caiu && !conectados.includes(jogador.peerId)) {
      quem.dataset['semConexao'] = '1'
      quem.title = 'Está na sala, mas sem conexão direta com você'
    }
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
