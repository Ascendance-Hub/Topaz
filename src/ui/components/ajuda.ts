const JOGADAS: { titulo: string; texto: string }[] = [
  {
    titulo: 'Dobrar',
    texto: 'Dobra sua aposta e você recebe exatamente mais uma carta — '
      + 'depois dela a mão encerra. Costuma valer quando você tem 10 ou 11 '
      + 'e o dealer mostra uma carta fraca.',
  },
  {
    titulo: 'Dividir',
    texto: 'Se suas duas cartas têm o mesmo valor, separa em duas mãos '
      + 'independentes, cada uma com uma aposta igual à original. Um par de '
      + 'Ases recebe só uma carta em cada mão. Vale quase sempre dividir Ases '
      + 'e 8; um par de 10 já é uma mão forte e dividir costuma piorá-la.',
  },
  {
    titulo: 'Seguro',
    texto: 'Oferecido quando o dealer mostra um Ás. É uma aposta à parte, '
      + 'de metade do seu valor, que paga 2:1 se o dealer tiver blackjack. '
      + 'Na dúvida, dispense: a matemática favorece a casa.',
  },
]

function painelDeJogadas(): HTMLElement {
  const painel = document.createElement('div')
  painel.className = 'ajuda-painel'
  painel.dataset.painelAjuda = '1'
  for (const jogada of JOGADAS) {
    const titulo = document.createElement('h4')
    titulo.textContent = jogada.titulo
    const texto = document.createElement('p')
    texto.textContent = jogada.texto
    painel.append(titulo, texto)
  }
  return painel
}

/**
 * Botão "?" que abre e fecha o painel de regras. Pedir e Parar ficam de
 * fora de propósito — quem não sabe descobre no primeiro clique, e
 * explicar o óbvio faz ninguém ler o resto.
 *
 * `aberta` chega de fora, e `aoAlternar` devolve cada troca para fora, porque
 * a tela inteira é reconstruída a cada mudança de estado — num cliente, a
 * cada broadcast do host, o que durante a compra do dealer são 700ms. Um
 * painel que nascesse sempre fechado sumia no meio da leitura de quem abriu
 * para entender o que é Dividir, que é exatamente para quem ele existe.
 */
export function botaoAjuda(
  aberta = false, aoAlternar: (aberta: boolean) => void = () => {},
): HTMLElement {
  const raiz = document.createElement('div')

  const gatilho = document.createElement('button')
  gatilho.className = 'ajuda-gatilho'
  gatilho.textContent = '?'
  // `data-ajuda`, não `data-acao`: `data-acao` significa "este botão despacha
  // uma `Acao` deste `tipo`", e abrir a ajuda não é jogada nenhuma. Enquanto
  // o gatilho se disfarçava de ação, `button[data-acao]` deixava de contar só
  // os botões de jogada e os testes da mesa tiveram de recorrer a um seletor
  // estrutural.
  gatilho.dataset.ajuda = 'gatilho'
  gatilho.setAttribute('aria-label', 'Explicação das jogadas')
  gatilho.setAttribute('aria-expanded', String(aberta))
  raiz.append(gatilho)

  if (aberta) raiz.append(painelDeJogadas())

  gatilho.onclick = () => {
    const painel = raiz.querySelector('[data-painel-ajuda]')
    const agoraAberta = painel === null
    if (painel) painel.remove()
    else raiz.append(painelDeJogadas())
    gatilho.setAttribute('aria-expanded', String(agoraAberta))
    aoAlternar(agoraAberta)
  }

  return raiz
}
