/**
 * A galeria de jogos da sala.
 *
 * Existe porque o botão "Mesa" pressupunha um jogo só, e vão existir mais. Com
 * apenas um disponível hoje, a galeria corre um risco: parecer uma prateleira
 * vazia. Por isso o cartão do que existe é generoso — nome, o que é, quanta
 * gente cabe — e o que ainda não existe aparece como promessa declarada, com
 * borda tracejada e sem ação nenhuma.
 *
 * Inventar cartões clicáveis de jogos que não existem seria a saída fácil e a
 * pior: a pessoa clica, nada acontece, e ela conclui que o site está quebrado.
 */

export interface JogoDisponivel {
  chave: string
  nome: string
  descricao: string
  detalhe: string
}

export const JOGOS: JogoDisponivel[] = [
  {
    chave: 'blackjack',
    nome: 'Blackjack',
    descricao:
      'Vinte e um contra a banca, com seguro, split e dobra. O anfitrião passa '
      + 'sozinho para outra pessoa se quem estava conduzindo cair.',
    detalhe: 'Até 7 na mesa',
  },
]

/** O que está por vir. Declarado como promessa, nunca como cartão clicável. */
export const POR_VIR = ['Truco', 'Dominó', 'Poker']

export interface AcoesDaGaleria {
  abrir: (chave: string) => void
  /** Só chega preenchida para o anfitrião. */
  ajustar?: ((chave: string) => void) | undefined
}

/**
 * A tela de ajustes de UM jogo, dentro da aba de Jogos.
 *
 * O formato da partida vivia numa seção solta em "Ajustes". Ficava errado por
 * antecipação: com mais jogos vindo, cada um terá suas próprias escolhas, e
 * uma seção única teria de virar várias — ou pior, misturar tudo. Aqui ele
 * pertence ao cartão de onde saiu.
 */
export function renderizarAjustesDoJogo(
  nome: string, painel: HTMLElement, aoVoltar: () => void,
): HTMLElement {
  const area = document.createElement('div')
  area.className = 'jogos'

  const voltar = document.createElement('button')
  voltar.type = 'button'
  voltar.className = 'botao fantasma jogos-voltar'
  voltar.dataset['jogos'] = 'voltar'
  voltar.textContent = '← Jogos'
  voltar.onclick = aoVoltar

  const titulo = document.createElement('h2')
  titulo.className = 'jogos-titulo'
  titulo.textContent = nome

  area.append(voltar, titulo, painel)
  return area
}

export function renderizarJogos(acoes: AcoesDaGaleria): HTMLElement {
  const area = document.createElement('div')
  area.className = 'jogos'

  const titulo = document.createElement('h2')
  titulo.className = 'jogos-titulo'
  titulo.textContent = 'Jogos'
  area.append(titulo)

  const grade = document.createElement('div')
  grade.className = 'jogos-grade'

  for (const jogo of JOGOS) {
    const cartao = document.createElement('article')
    cartao.className = 'jogo'
    cartao.dataset['jogo'] = jogo.chave

    const nome = document.createElement('h3')
    nome.className = 'jogo-nome'
    nome.textContent = jogo.nome

    const detalhe = document.createElement('span')
    detalhe.className = 'jogo-detalhe'
    detalhe.textContent = jogo.detalhe

    const descricao = document.createElement('p')
    descricao.className = 'jogo-descricao'
    descricao.textContent = jogo.descricao

    const rodape = document.createElement('div')
    rodape.className = 'jogo-rodape'

    const abrir = document.createElement('button')
    abrir.type = 'button'
    abrir.className = 'botao'
    abrir.dataset['abrir'] = jogo.chave
    abrir.textContent = 'Abrir mesa'
    abrir.onclick = () => acoes.abrir(jogo.chave)
    rodape.append(abrir)

    // A engrenagem só existe para quem pode mexer. Mostrá-la a todos e barrar
    // no clique seria um botão que engana — e o rodapé fica ao lado de "Abrir
    // mesa" para não brigar com o título no topo do cartão.
    if (acoes.ajustar) {
      const ajustar = document.createElement('button')
      ajustar.type = 'button'
      ajustar.className = 'botao fantasma jogo-ajustar'
      ajustar.dataset['ajustar'] = jogo.chave
      ajustar.textContent = '⚙'
      // O símbolo sozinho não é lido por leitor de tela nem entendido por
      // quem nunca viu esta engrenagem específica.
      ajustar.title = `Formato de ${jogo.nome}`
      ajustar.setAttribute('aria-label', `Formato de ${jogo.nome}`)
      ajustar.onclick = () => acoes.ajustar?.(jogo.chave)
      rodape.append(ajustar)
    }

    cartao.append(nome, detalhe, descricao, rodape)
    grade.append(cartao)
  }

  for (const nome of POR_VIR) {
    const cartao = document.createElement('article')
    // Sem `data-jogo`: ele não é um jogo, é um aviso. Marcá-lo como jogo faria
    // qualquer código futuro que percorra a galeria tropeçar nele.
    cartao.className = 'jogo jogo-por-vir'
    cartao.setAttribute('aria-disabled', 'true')

    const titulo = document.createElement('h3')
    titulo.className = 'jogo-nome'
    titulo.textContent = nome

    const aviso = document.createElement('span')
    aviso.className = 'jogo-detalhe'
    aviso.textContent = 'em breve'

    cartao.append(titulo, aviso)
    grade.append(cartao)
  }

  area.append(grade)
  return area
}
