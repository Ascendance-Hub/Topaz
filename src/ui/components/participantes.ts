
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

/** Tudo que decide quem aparece entre os rostos e como. */
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
 * A chave de "eu" entre os rostos.
 *
 * O `selfId` não serve: o meu microfone é local e nunca chega pelo caminho de
 * mídia recebida, então o medidor de voz me registra sob uma chave própria.
 * Uma chave separada evita confundir os dois.
 */
export const EU = 'eu'

/**
 * Monta a lista de quem está no meu canal, a partir do estado da call.
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

  return [euNaLista(fonte), ...fonte.naCall.map((id) => outroNaLista(id, fonte))]
}

function euNaLista(fonte: FonteDeParticipantes): Participante {
  return {
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
}

function outroNaLista(peerId: string, fonte: FonteDeParticipantes): Participante {
  return {
    peerId,
    nome: fonte.apelidoDe(peerId),
    falando: fonte.falantes.has(peerId),
    foto: fonte.fotos.get(peerId),
    selo: fonte.selos.get(peerId),
  }
}

/**
 * As pessoas de UM canal, na ordem em que o protocolo as entrega.
 *
 * Diferente de `montarParticipantes`, que só monta o MEU canal: aqui a lista
 * pode ser de um canal em que eu não estou. Nesse caso `falando` fica sempre
 * falso, e isso é a verdade e não uma limitação — só chega áudio de quem está
 * comigo, então de fora não há como saber quem abriu a boca.
 *
 * O `meuId` é do transporte, não o `EU` da fileira: o protocolo fala em
 * peerIds, e é aqui que os dois vocabulários se encontram.
 */
export function montarDoCanal(
  quem: readonly string[], meuId: string, fonte: FonteDeParticipantes,
): Participante[] {
  return quem.map((peerId) =>
    peerId === meuId ? euNaLista(fonte) : outroNaLista(peerId, fonte))
}
