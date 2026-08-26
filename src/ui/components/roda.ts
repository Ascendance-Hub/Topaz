import { inicialDe, type Participante } from './participantes'

/**
 * A roda de conversa: quem está no seu canal, em círculos grandes.
 *
 * O miolo da sala era uma lista de nomes. Numa conversa por voz, o que a
 * pessoa olha o tempo todo é *quem está aqui* — e nome escrito não é rosto.
 * Círculo grande com a foto resolve isso sem nenhuma legenda.
 *
 * **Dois modos, e o layout inteiro depende de qual:**
 *
 * - `grade` — ninguém compartilhando. Os círculos são o conteúdo do miolo, e
 *   ficam grandes e centrados, porque não há nada disputando a atenção.
 * - `faixa` — alguém compartilhando e você assistindo. Os círculos encolhem e
 *   vão para a lateral em coluna; a tela fica com o meio. Some seria pior:
 *   saber quem está falando importa MAIS quando se está olhando para uma tela,
 *   não menos.
 *
 * Quem decide o modo é quem monta, porque a informação é do estado da call —
 * o componente só desenha o que lhe disserem.
 */

export type ModoDaRoda = 'grade' | 'faixa'

function circulo(pessoa: Participante): HTMLElement {
  const area = document.createElement('div')
  area.className = 'roda-circulo'

  if (pessoa.foto) {
    const img = document.createElement('img')
    img.src = pessoa.foto
    // O nome está logo embaixo; repetir faria o leitor de tela dizer duas
    // vezes a mesma pessoa.
    img.alt = ''
    area.append(img)
  } else {
    const letra = document.createElement('span')
    letra.className = 'roda-inicial'
    letra.textContent = inicialDe(pessoa.nome)
    area.append(letra)
  }
  return area
}

export function renderizarRoda(
  pessoas: Participante[], modo: ModoDaRoda = 'grade',
): HTMLElement {
  const roda = document.createElement('div')
  roda.className = 'roda'
  roda.dataset['modo'] = modo
  roda.setAttribute('aria-label', 'Quem está no seu canal')

  for (const pessoa of pessoas) {
    const item = document.createElement('div')
    item.className = 'roda-pessoa'
    item.dataset['pessoa'] = pessoa.peerId
    if (pessoa.falando) item.dataset['falando'] = '1'
    if (pessoa.euMesmo) item.dataset['eu'] = '1'
    if (pessoa.mudo) item.dataset['mudo'] = '1'
    if (pessoa.semMicrofone) item.dataset['semMicrofone'] = '1'

    const nome = document.createElement('span')
    nome.className = 'roda-nome'
    // `textContent`: o apelido vem de outro navegador.
    nome.textContent = pessoa.nome

    item.append(circulo(pessoa), nome)
    roda.append(item)
  }

  return roda
}
