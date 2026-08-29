/**
 * As dicas: o que fazer quando algo não funciona, e o que é limitação.
 *
 * Existe porque boa parte dos problemas aqui **não tem conserto** — são a rede
 * de alguém, o antivírus de alguém, ou o preço de não ter servidor. Dizer isso
 * em voz alta é melhor que deixar a pessoa achar que o site está quebrado e ir
 * embora.
 *
 * O texto é curto de propósito: dica que ninguém lê não ajuda ninguém. Cada
 * item responde "o que eu faço agora?" — e quando a resposta é "nada, é assim
 * mesmo", ele diz isso também.
 *
 * **O que NÃO entra aqui:** o que o site não protege. Explicar a própria
 * fraqueza para desconhecido não é transparência, é mapa. O que a home já diz
 * — que o código da sala é a chave dela — é o limite disso, e basta.
 */

interface Dica {
  titulo: string
  corpo: string
}

/** Quando alguma coisa não acontece. */
const QUANDO_NAO_FUNCIONA: Dica[] = [
  {
    titulo: 'Entrei na call e estou sozinho, mas sei que tem gente',
    corpo: 'Espere de 10 a 20 segundos: os navegadores levam esse tempo para se '
      + 'acharem, e o silêncio no começo é normal. Se depois disso continuar '
      + 'sozinho, aperte "Reconectar". Se ainda assim não for, feche a aba e '
      + 'abra o link de novo.',
  },
  {
    titulo: 'Uma pessoa específica nunca aparece, e as outras sim',
    corpo: 'Quase sempre é antivírus. Os navegadores se acham por servidores '
      + 'públicos, e antivírus bloqueia endereços diferentes em cada máquina — '
      + 'basta dois nomes bloqueados para duas pessoas nunca se cruzarem. '
      + 'Abram o "Testar minha rede" e comparem a lista lado a lado: se não '
      + 'houver nenhum servidor em comum, é isso. Liberar o site no antivírus '
      + 'resolve.',
  },
  {
    titulo: 'Não conecta na rede da empresa ou da faculdade',
    corpo: 'Essas redes costumam impedir que dois navegadores falem direto, e '
      + 'não há configuração do site que resolva — resolver exigiria um '
      + 'servidor no meio, que é justamente o que o Topaz não tem. De casa '
      + 'funciona.',
  },
]

/** O que é assim mesmo, e por quê. */
const O_QUE_E_ASSIM_MESMO: Dica[] = [
  {
    titulo: 'A tela compartilhada começa borrada',
    corpo: 'E se ajeita sozinha em 10 ou 15 segundos. O codificador precisa '
      + 'desse tempo para descobrir quanta banda tem. Não adianta mexer em '
      + 'nada — só esperar.',
  },
  {
    titulo: 'No celular a call não funciona',
    corpo: 'Voz e compartilhamento de tela são só no computador. O blackjack '
      + 'funciona no celular normalmente.',
  },
  {
    titulo: 'O chat some quando eu recarrego',
    corpo: 'E quem entra depois não vê o que já foi dito. Sem servidor não há '
      + 'onde guardar conversa — ela existe só entre quem está na sala naquela '
      + 'hora.',
  },
]

/** Para ficar melhor. */
const PARA_FICAR_MELHOR: Dica[] = [
  {
    titulo: 'Compartilhando código ou texto? Troque o tipo',
    corpo: 'No seletor ao lado de "Compartilhar tela" existe "código/texto" e '
      + '"jogo/vídeo". O codificador não consegue nitidez e fluidez ao mesmo '
      + 'tempo: "código/texto" é o que faz letra pequena parar de embolar.',
  },
  {
    titulo: 'Use fone se for compartilhar o som',
    corpo: 'Quando a tela vai com áudio, o som que sai da sua caixa volta pelo '
      + 'seu microfone e vira eco — e quem causa é justamente quem não escuta '
      + 'o resultado.',
  },
  {
    titulo: 'A internet está apertada? Baixe para 720p',
    corpo: 'O padrão é 1080p, que gasta cerca de 6 Mbps de subida por pessoa '
      + 'que está assistindo. Em 720p cai para menos da metade, e para conversa '
      + 'costuma bastar.',
  },
]

function secao(titulo: string, dicas: Dica[]): HTMLElement {
  const bloco = document.createElement('section')
  bloco.className = 'dicas-secao'

  const cabeca = document.createElement('h3')
  cabeca.className = 'dicas-titulo'
  cabeca.textContent = titulo
  bloco.append(cabeca)

  for (const dica of dicas) {
    const item = document.createElement('div')
    item.className = 'dica'

    const nome = document.createElement('p')
    nome.className = 'dica-nome'
    nome.textContent = dica.titulo

    const corpo = document.createElement('p')
    corpo.className = 'dica-corpo'
    corpo.textContent = dica.corpo

    item.append(nome, corpo)
    bloco.append(item)
  }
  return bloco
}

export function renderizarDicas(): HTMLElement {
  const dicas = document.createElement('div')
  dicas.className = 'dicas'

  const titulo = document.createElement('h2')
  titulo.className = 'dicas-cabeca'
  titulo.textContent = 'Dicas'
  dicas.append(titulo)

  dicas.append(
    secao('Quando não funciona', QUANDO_NAO_FUNCIONA),
    secao('O que é assim mesmo', O_QUE_E_ASSIM_MESMO),
    secao('Para ficar melhor', PARA_FICAR_MELHOR),
  )
  return dicas
}
