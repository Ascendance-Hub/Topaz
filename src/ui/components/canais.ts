/**
 * Os canais de voz da sala.
 *
 * Uma sala só: trocar de canal muda para quem o seu microfone é publicado, não
 * a conexão. Por isso a troca é instantânea — e por isso dá para VER quem está
 * nos outros canais, que é metade do motivo de ser uma sala só.
 *
 * Só existem os canais que têm gente. Para sair de perto dos outros, o botão
 * de abrir cria um: mostrar um "Canal 3 · vazio" descreveria uma coisa que
 * existe e está sem ninguém, quando o que a pessoa quer é criar uma.
 */

export interface CanalNaTela {
  id: string
  nome: string
  pessoas: number
}

export interface AcoesDeCanal {
  mudar: (id: string) => void
  /** Só chega preenchida quando ainda há id livre. */
  abrir?: (() => void) | undefined
}

export function renderizarCanais(
  canais: CanalNaTela[], meuCanal: string, acoes: AcoesDeCanal,
): HTMLElement {
  const area = document.createElement('nav')
  area.className = 'canais'
  area.setAttribute('aria-label', 'Canais de voz')

  for (const canal of canais) {
    const aqui = canal.id === meuCanal

    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'canal'
    item.dataset['canal'] = canal.id
    if (aqui) {
      item.dataset['aqui'] = '1'
      // `aria-current` em vez de só uma classe: é o que um leitor de tela usa
      // para dizer onde a pessoa está, e o desenho sai dele no CSS.
      item.setAttribute('aria-current', 'true')
    }
    // Já estar aqui não desabilita: um botão apagado some da ordem de
    // tabulação, e a pessoa perde a referência de onde está ao navegar por
    // teclado. Clicar de novo simplesmente não faz nada.
    item.onclick = () => acoes.mudar(canal.id)

    const nome = document.createElement('span')
    nome.className = 'canal-nome'
    nome.textContent = canal.nome

    const quantos = document.createElement('span')
    quantos.className = 'canal-quantos'
    // Sempre um número: um canal sem gente não existe, então zero nunca chega
    // aqui.
    quantos.textContent = String(canal.pessoas)

    item.append(nome, quantos)
    // O rótulo lido em voz alta precisa dizer as três coisas que a pílula diz
    // visualmente: qual canal, quantos, e se é onde eu estou.
    const situacao = `${canal.pessoas} ${canal.pessoas === 1 ? 'pessoa' : 'pessoas'}`
    item.setAttribute(
      'aria-label',
      `${canal.nome} — ${situacao}${aqui ? ' — você está aqui' : ''}`,
    )

    area.append(item)
  }

  if (acoes.abrir) {
    const abrir = document.createElement('button')
    abrir.type = 'button'
    abrir.className = 'canal canal-abrir'
    abrir.dataset['canal'] = 'novo'
    abrir.textContent = '+'
    // O símbolo sozinho não diz o que acontece — e o que acontece é ir para
    // lá, não só criar. Quem lê por leitor de tela precisa saber disso.
    abrir.title = 'Abrir um canal novo e ir para ele'
    abrir.setAttribute('aria-label', 'Abrir um canal novo e ir para ele')
    abrir.onclick = () => acoes.abrir?.()
    area.append(abrir)
  }

  return area
}
