export const ROTULO_ESPERANDO = 'a mesa está esperando você'

/**
 * Onde a pessoa está dentro da sala.
 *
 * `mesa` não é um destino do trilho: chega-se a ela pela galeria de jogos. O
 * trilho marca `jogos` como atual enquanto a mesa está aberta, porque foi por
 * ali que ela entrou — e voltar para a galeria precisa ser um clique óbvio.
 */
export type Tela = 'sala' | 'jogos' | 'mesa' | 'config' | 'dicas'

/** Os destinos do trilho, na ordem em que aparecem. */
const DESTINOS = [
  { chave: 'sala', rotulo: 'Sala' },
  { chave: 'jogos', rotulo: 'Jogos' },
  { chave: 'config', rotulo: 'Ajustes' },
  // Por último de propósito: é o destino que se lê uma vez, não o que se usa.
  { chave: 'dicas', rotulo: 'Dicas' },
] as const

export type DestinoDoTrilho = (typeof DESTINOS)[number]['chave']

/**
 * O trilho de navegação da sala.
 *
 * Substitui o botão "Mesa", que pressupunha um jogo só. Fica à esquerda porque
 * é onde todo aplicativo de conversa põe a navegação — a pessoa passa a maior
 * parte do tempo em outros, e reconhecer isto sem aprender nada vale mais do
 * que ser original aqui. A diferença fica no material.
 *
 * **Rótulos de texto, não ícones**, e isso é uma escolha contra a convenção:
 * o trilho do Discord é só de ícone, mas ele apoia numa iconografia que as
 * pessoas já conhecem. Com três destinos e nenhuma iconografia nossa,
 * ícone seria charada — e charada num menu é o pior lugar possível.
 */
export function renderizarTrilho(
  atual: Tela,
  aoIr: (destino: DestinoDoTrilho) => void,
  opcoes: { mesaEspera?: boolean } = {},
): HTMLElement {
  const trilho = document.createElement('nav')
  trilho.className = 'trilho'
  trilho.setAttribute('aria-label', 'Seções da sala')

  for (const destino of DESTINOS) {
    // A mesa aberta mantém "Jogos" aceso: foi por ali que se chegou nela, e
    // apagar tudo deixaria a pessoa sem saber por onde voltar.
    const aceso = destino.chave === atual || (destino.chave === 'jogos' && atual === 'mesa')

    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'trilho-item'
    botao.dataset['nav'] = destino.chave
    botao.textContent = destino.rotulo
    // `aria-current` e não só uma classe: é o que um leitor de tela usa para
    // dizer onde a pessoa está, e a marcação visual sai dele no CSS.
    if (aceso) botao.setAttribute('aria-current', 'page')

    // A mesa esperando por você só interessa quando ela NÃO está na tela.
    if (destino.chave === 'jogos' && opcoes.mesaEspera && atual !== 'mesa') {
      botao.dataset['espera'] = '1'
      // A bolinha é decorativa; quem não enxerga cor precisa do rótulo. Sem
      // isto, o aviso existiria só para parte das pessoas.
      botao.setAttribute('aria-label', `${destino.rotulo} — ${ROTULO_ESPERANDO}`)
      const marca = document.createElement('span')
      marca.className = 'trilho-marca'
      marca.setAttribute('aria-hidden', 'true')
      botao.append(marca)
    }

    botao.onclick = () => aoIr(destino.chave)
    trilho.append(botao)
  }

  return trilho
}
