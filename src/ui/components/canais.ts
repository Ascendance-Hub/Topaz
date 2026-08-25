/**
 * Os canais de voz da sala.
 *
 * Uma sala só: trocar de canal muda para quem o seu microfone é publicado, não
 * a conexão. Por isso a troca é instantânea — e por isso dá para VER quem está
 * nos outros canais, que é metade do motivo de ser uma sala só.
 *
 * Todos os canais aparecem, inclusive os vazios: é o canal vazio que serve
 * para dois saírem de perto dos outros, e escondê-lo tiraria justamente o uso
 * principal da coisa.
 */

export interface CanalNaTela {
  id: string
  nome: string
  pessoas: number
}

export function renderizarCanais(
  canais: CanalNaTela[], meuCanal: string, aoMudar: (id: string) => void,
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
    item.onclick = () => aoMudar(canal.id)

    const nome = document.createElement('span')
    nome.className = 'canal-nome'
    nome.textContent = canal.nome

    const quantos = document.createElement('span')
    quantos.className = 'canal-quantos'
    // "vazio" em vez de "0": o zero convida a pessoa a ler um número, e o que
    // ela precisa saber é se há alguém lá.
    quantos.textContent = canal.pessoas === 0 ? 'vazio' : String(canal.pessoas)

    item.append(nome, quantos)
    // O rótulo lido em voz alta precisa dizer as três coisas que a pílula diz
    // visualmente: qual canal, quantos, e se é onde eu estou.
    const situacao = canal.pessoas === 0
      ? 'ninguém'
      : `${canal.pessoas} ${canal.pessoas === 1 ? 'pessoa' : 'pessoas'}`
    item.setAttribute(
      'aria-label',
      `${canal.nome} — ${situacao}${aqui ? ' — você está aqui' : ''}`,
    )

    area.append(item)
  }

  return area
}
