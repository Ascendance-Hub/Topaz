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

/**
 * Botão "?" que abre e fecha o painel de regras. Pedir e Parar ficam de
 * fora de propósito — quem não sabe descobre no primeiro clique, e
 * explicar o óbvio faz ninguém ler o resto.
 */
export function botaoAjuda(): HTMLElement {
  const raiz = document.createElement('div')

  const gatilho = document.createElement('button')
  gatilho.className = 'ajuda-gatilho'
  gatilho.textContent = '?'
  gatilho.dataset.acao = 'ajuda'
  gatilho.setAttribute('aria-label', 'Explicação das jogadas')
  raiz.append(gatilho)

  gatilho.onclick = () => {
    const aberto = raiz.querySelector('[data-painel-ajuda]')
    if (aberto) {
      aberto.remove()
      return
    }
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
    raiz.append(painel)
  }

  return raiz
}
