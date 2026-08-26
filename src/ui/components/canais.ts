import { ehFotoValida } from '../../perfil/foto'
import { inicialDe, type Participante } from './participantes'

/**
 * Os canais de voz da sala, na coluna da esquerda.
 *
 * Uma sala só: trocar de canal muda para quem o seu microfone é publicado, não
 * a conexão. Por isso a troca é instantânea — e por isso dá para VER quem está
 * nos outros canais, que é metade do motivo de ser uma sala só.
 *
 * Só existem os canais que têm gente. Para sair de perto dos outros, o botão
 * de abrir cria um: mostrar um "Canal 3 · vazio" descreveria uma coisa que
 * existe e está sem ninguém, quando o que a pessoa quer é criar uma.
 *
 * **Lista vertical com as pessoas embaixo**, e não uma fileira de pílulas com
 * um número. O número dizia quantos; o que se quer saber é *quem* — decidir
 * para qual canal ir é decidir com quem falar. É a forma que todo aplicativo
 * de voz usa, e a memória muscular vale mais do que a nossa originalidade
 * aqui; a diferença fica no material.
 */

export interface CanalNaTela {
  id: string
  nome: string
  /** Já resolvido em nome e foto por quem monta. */
  gente: Participante[]
}

export interface AcoesDeCanal {
  mudar: (id: string) => void
  /** Só chega preenchida quando ainda há id livre. */
  abrir?: (() => void) | undefined
}

/** O círculo pequeno de alguém na lista: foto se houver, inicial se não. */
function retratinho(pessoa: Participante): HTMLElement {
  const circulo = document.createElement('span')
  circulo.className = 'canal-pessoa-circulo'

  // Mesma guarda da roda, e pelo mesmo motivo: um `src` de terceiro entrega
  // o IP de quem olha a lista.
  if (pessoa.foto && ehFotoValida(pessoa.foto)) {
    const img = document.createElement('img')
    img.src = pessoa.foto
    // A foto já se explica pelo nome ao lado; repetir seria o leitor de tela
    // dizendo o mesmo nome duas vezes.
    img.alt = ''
    circulo.append(img)
  } else {
    circulo.textContent = inicialDe(pessoa.nome)
  }
  return circulo
}

function linhaDePessoa(pessoa: Participante): HTMLElement {
  const linha = document.createElement('li')
  linha.className = 'canal-pessoa'
  linha.dataset['pessoa'] = pessoa.peerId
  if (pessoa.falando) linha.dataset['falando'] = '1'
  if (pessoa.euMesmo) linha.dataset['eu'] = '1'
  if (pessoa.mudo) linha.dataset['mudo'] = '1'

  const nome = document.createElement('span')
  nome.className = 'canal-pessoa-nome'
  // `textContent`: o apelido vem de outro navegador.
  nome.textContent = pessoa.nome

  linha.append(retratinho(pessoa), nome)
  return linha
}

function blocoDeCanal(
  canal: CanalNaTela, meuCanal: string, acoes: AcoesDeCanal,
): HTMLElement {
  const bloco = document.createElement('div')
  bloco.className = 'canal-bloco'

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
  // Já estar aqui não desabilita: um botão apagado some da ordem de tabulação,
  // e a pessoa perde a referência de onde está ao navegar por teclado. Clicar
  // de novo simplesmente não faz nada.
  item.onclick = () => acoes.mudar(canal.id)

  const nome = document.createElement('span')
  nome.className = 'canal-nome'
  nome.textContent = canal.nome

  const quantos = document.createElement('span')
  quantos.className = 'canal-quantos'
  // Sempre um número: um canal sem gente não existe, então zero nunca chega
  // aqui. Continua ao lado do nome porque a lista embaixo pode estar rolada
  // fora de vista numa coluna curta.
  quantos.textContent = String(canal.gente.length)

  item.append(nome, quantos)
  const situacao = `${canal.gente.length} ${canal.gente.length === 1 ? 'pessoa' : 'pessoas'}`
  item.setAttribute(
    'aria-label',
    `${canal.nome} — ${situacao}${aqui ? ' — você está aqui' : ''}`,
  )

  const gente = document.createElement('ul')
  gente.className = 'canal-gente'
  gente.append(...canal.gente.map(linhaDePessoa))

  bloco.append(item, gente)
  return bloco
}

export function renderizarCanais(
  canais: CanalNaTela[], meuCanal: string, acoes: AcoesDeCanal,
): HTMLElement {
  const area = document.createElement('nav')
  area.className = 'canais'
  area.setAttribute('aria-label', 'Canais de voz')

  for (const canal of canais) area.append(blocoDeCanal(canal, meuCanal, acoes))

  if (acoes.abrir) {
    const abrir = document.createElement('button')
    abrir.type = 'button'
    abrir.className = 'canal canal-abrir'
    abrir.dataset['canal'] = 'novo'
    abrir.textContent = '+ Novo canal'
    // O símbolo sozinho não diria o que acontece — e o que acontece é ir para
    // lá, não só criar.
    abrir.title = 'Abrir um canal novo e ir para ele'
    abrir.setAttribute('aria-label', 'Abrir um canal novo e ir para ele')
    abrir.onclick = () => acoes.abrir?.()
    area.append(abrir)
  }

  return area
}
