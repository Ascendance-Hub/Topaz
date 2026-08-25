export interface Participante {
  peerId: string
  nome: string
  /** Você. Marcado para a pessoa se achar na fileira. */
  euMesmo?: boolean
  falando?: boolean
  /** Microfone desligado por escolha — sua ou de quem silenciou. */
  mudo?: boolean
  /** Entrou só ouvindo: o microfone não abriu. Diferente de estar mudo. */
  semMicrofone?: boolean
}

/**
 * A inicial que vai dentro do círculo.
 *
 * `nome[0]` não serve: num emoji ele devolve meia dupla substituta e o
 * navegador desenha o losango preto de caractere inválido. O apelido vem de
 * outra pessoa, e emoji em apelido é comum.
 */
export function inicialDe(nome: string): string {
  const limpo = nome.trim()
  if (!limpo) return '?'
  return [...limpo][0]!.toUpperCase()
}

/**
 * A fileira de quem está na call.
 *
 * Existe porque antes a call dizia "3 na call" — um número, não gente. E
 * porque o anel de quem fala precisa de algo em volta de que brilhar.
 *
 * A forma é deliberadamente convencional: círculo com inicial, nome embaixo,
 * anel em quem fala. É a Lei de Jakob — as pessoas passam a maior parte do
 * tempo em outros aplicativos de call, e reconhecer isto sem aprender nada é
 * mais valioso do que ser original aqui. A diferença fica no material (latão,
 * feltro, topázio), não na disposição.
 */
export function renderizarParticipantes(lista: Participante[]): HTMLElement {
  const area = document.createElement('div')
  area.className = 'participantes'
  // Sem ninguém na call não há o que mostrar, e uma faixa vazia é só ruído.
  if (lista.length === 0) return area

  for (const pessoa of lista) {
    const peca = document.createElement('div')
    peca.className = 'participante'
    peca.dataset['de'] = pessoa.peerId
    // Atributos em vez de classes: o CSS anima a partir deles, e o teste lê a
    // mesma coisa que a folha de estilo — não duas representações do mesmo.
    peca.dataset['falando'] = pessoa.falando ? '1' : '0'
    if (pessoa.euMesmo) peca.dataset['eu'] = '1'
    if (pessoa.mudo) peca.dataset['mudo'] = '1'
    if (pessoa.semMicrofone) peca.dataset['semMicrofone'] = '1'

    // O anel é cor e movimento: sozinho, ele não existe para quem usa leitor
    // de tela. O estado precisa estar no texto também.
    const situacao = pessoa.semMicrofone
      ? 'só ouvindo'
      : pessoa.mudo ? 'mudo' : pessoa.falando ? 'falando' : 'na call'
    peca.setAttribute('aria-label', `${pessoa.nome} — ${situacao}`)
    if (pessoa.semMicrofone) peca.title = `${pessoa.nome} está só ouvindo`

    const circulo = document.createElement('div')
    circulo.className = 'participante-circulo'

    const inicial = document.createElement('span')
    inicial.className = 'participante-inicial'
    // `textContent`: o apelido vem de outro navegador.
    inicial.textContent = inicialDe(pessoa.nome)
    circulo.append(inicial)

    const nome = document.createElement('span')
    nome.className = 'participante-nome'
    nome.textContent = pessoa.nome

    peca.append(circulo, nome)
    area.append(peca)
  }

  return area
}
