import { ehFotoValida } from '../../perfil/foto'

export interface Participante {
  peerId: string
  nome: string
  /** `data:` de imagem gerado no próprio navegador de quem escolheu. */
  foto?: string
  /** O selo da identidade, presente só depois de a pessoa PROVAR quem é. */
  selo?: string
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

    // Segunda linha de defesa. Quem monta a lista já validou o que veio da
    // rede, mas este componente não confia em quem o chama: bastaria um
    // caminho novo esquecer a validação para isto virar um `<img src>` com
    // endereço de terceiro — exatamente o que o desenho evita.
    if (ehFotoValida(pessoa.foto)) {
      const foto = document.createElement('img')
      foto.className = 'participante-foto'
      foto.src = pessoa.foto
      // Sem `alt`, um leitor de tela anuncia "imagem" e não diz de quem.
      foto.alt = `Foto de ${pessoa.nome}`
      circulo.append(foto)
    } else {
      const inicial = document.createElement('span')
      inicial.className = 'participante-inicial'
      // `textContent`: o apelido vem de outro navegador.
      inicial.textContent = inicialDe(pessoa.nome)
      circulo.append(inicial)
    }

    const nome = document.createElement('span')
    nome.className = 'participante-nome'
    nome.textContent = pessoa.nome

    peca.append(circulo, nome)

    // O selo só aparece depois da prova. Sem prova não existe marca nenhuma —
    // um selo "não verificado" seria pior que nada, porque a maior parte das
    // pessoas leria a presença do selo, não o adjetivo.
    if (pessoa.selo) {
      const selo = document.createElement('span')
      selo.className = 'participante-selo'
      selo.textContent = pessoa.selo
      selo.title = `Identidade verificada: ${pessoa.selo}`
      peca.append(selo)
    }
    area.append(peca)
  }

  return area
}

/** Tudo que decide quem aparece na fileira e como. */
export interface FonteDeParticipantes {
  euNaCall: boolean
  naCall: string[]
  meuApelido: string
  minhaFoto?: string | undefined
  meuMicrofoneMudo: boolean
  euSemMicrofone: boolean
  falantes: ReadonlySet<string>
  fotos: ReadonlyMap<string, string>
  selos: ReadonlyMap<string, string>
  apelidoDe: (peerId: string) => string
}

/**
 * A chave de "eu" na fileira.
 *
 * O `selfId` não serve: o meu microfone é local e nunca chega pelo caminho de
 * mídia recebida, então o medidor de voz me registra sob uma chave própria.
 * Uma chave separada evita confundir os dois.
 */
export const EU = 'eu'

/**
 * Monta a lista da fileira a partir do estado da call.
 *
 * Vive aqui, fora do `main.ts`, porque é decisão e não desenho: quem aparece,
 * em que ordem, e o que se sabe de cada um. Separada, ela se testa com dados
 * em vez de com uma sala montada.
 *
 * Eu venho primeiro de propósito — é o rosto que a pessoa procura para se
 * achar, e procurar a si mesmo no meio de uma lista que muda de ordem é o tipo
 * de atrito que ninguém sabe nomear.
 */
export function montarParticipantes(fonte: FonteDeParticipantes): Participante[] {
  // Fora da call não há fileira: os outros continuam na SALA, mas mostrar
  // gente numa fileira de call de quem não está nela mentiria sobre o que
  // aquele espaço representa.
  if (!fonte.euNaCall) return []

  const eu: Participante = {
    peerId: EU,
    nome: fonte.meuApelido,
    euMesmo: true,
    falando: fonte.falantes.has(EU),
    // Só o MEU estado de microfone é conhecido: o dos outros não trafega, e
    // deduzi-lo do silêncio mentiria sobre quem está apenas calado.
    mudo: fonte.meuMicrofoneMudo,
    semMicrofone: fonte.euSemMicrofone,
    // A minha foto sai do armazenamento local: eu nunca recebo a minha
    // própria foto pela rede.
    foto: fonte.minhaFoto,
  }

  const outros = fonte.naCall.map((peerId): Participante => ({
    peerId,
    nome: fonte.apelidoDe(peerId),
    falando: fonte.falantes.has(peerId),
    foto: fonte.fotos.get(peerId),
    selo: fonte.selos.get(peerId),
  }))

  return [eu, ...outros]
}
