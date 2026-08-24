// Sem O, 0, I, 1 e L — pares que as pessoas confundem ao digitar.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * Dezesseis caracteres — cerca de 79 bits.
 *
 * O código não é apenas um identificador: é a única credencial da sala. Quem
 * o descobre entra, ouve a call e vê as telas compartilhadas. E ele é
 * atacável offline: o relay enxerga o tópico como `SHA-256(...:codigo)`, um
 * hash rápido de passada única, então adivinhar é varrer o espaço inteiro
 * sem falar com ninguém. Com os 8 caracteres originais eram ~40 bits — uma
 * GPU cobre isso em minutos. Com 16, a mesma varredura leva mais tempo do
 * que a idade do universo.
 *
 * A tentação era imitar o `_id` do MongoDB (timestamp + aleatório +
 * contador), que resolve unicidade sem coordenação. Mas para um segredo essa
 * estrutura trabalha contra: o atacante sabe aproximadamente quando a sala
 * nasceu e que o contador anda em sequência, então boa parte dos bytes deixa
 * de ser imprevisível. Sorteio uniforme e puro serve aos dois objetivos ao
 * mesmo tempo — colisão fica desprezível e adivinhação, inviável.
 */
export const TAMANHO_CODIGO = 16

/** De quantos em quantos caracteres o código é agrupado para leitura. */
const TAMANHO_GRUPO = 4

/** O comprimento com os hífens — usado como `maxLength` do campo, para que
 *  colar um código agrupado não trunque. */
export const TAMANHO_FORMATADO =
  TAMANHO_CODIGO + Math.ceil(TAMANHO_CODIGO / TAMANHO_GRUPO) - 1

/**
 * Fonte de bytes aleatórios: recebe quantos bytes quer e devolve exatamente
 * essa quantidade. Existe como parâmetro isolado (em vez de embutir
 * `crypto.getRandomValues` direto em `gerarCodigoSala`) só para que os
 * testes possam fixar a saída sem depender de aleatoriedade real.
 */
export type FonteBytes = (quantidade: number) => Uint8Array

function fonteBytesPadrao(quantidade: number): Uint8Array {
  const bytes = new Uint8Array(quantidade)
  crypto.getRandomValues(bytes)
  return bytes
}

// 256 não é múltiplo de ALFABETO.length (31): 256 = 8*31 + 8. Os 248
// primeiros valores de um byte (0..247) cobrem os 31 caracteres exatamente
// 8 vezes cada — uniforme. Os 8 valores restantes (248..255) são o resto
// que sobra sem parceiro; se fossem mapeados via módulo, os primeiros 8
// caracteres do alfabeto sairiam com probabilidade levemente maior que os
// outros 23. Por isso eles são descartados e o byte é sorteado de novo
// (rejection sampling) em vez de usar `byte % ALFABETO.length` direto.
const LIMITE_REJEICAO = Math.floor(256 / ALFABETO.length) * ALFABETO.length

/** Código de sala: 8 caracteres do alfabeto sem ambiguidade, sorteados de
 * forma criptograficamente segura por padrão (`crypto.getRandomValues`).
 * Curto demais e um estranho adivinha a sala, o que expõe o IP dos
 * jogadores via WebRTC — por isso o cuidado com a fonte e com o viés. */
export function gerarCodigoSala(fonte: FonteBytes = fonteBytesPadrao): string {
  let codigo = ''
  while (codigo.length < TAMANHO_CODIGO) {
    const bytes = fonte(TAMANHO_CODIGO - codigo.length)
    for (const byte of bytes) {
      if (byte >= LIMITE_REJEICAO) continue
      codigo += ALFABETO[byte % ALFABETO.length]
      if (codigo.length === TAMANHO_CODIGO) break
    }
  }
  return codigo
}

/**
 * Único portão de validação de código de sala — usado tanto para o código
 * lido da URL quanto para o digitado à mão, para que os dois caminhos nunca
 * divirjam. Verificado contra `ALFABETO` (não uma classe de caracteres
 * escrita à mão) para continuar correto se o alfabeto mudar, e porque um
 * código com caracteres fora dele (inclusive os ambíguos que o alfabeto
 * exclui de propósito, como O/0/I/1/L) não pode bater com nenhuma sala real
 * — aceitá-lo só manda o jogador para uma sala que nunca vai ter ninguém.
 */
export function ehCodigoValido(codigo: string): boolean {
  if (codigo.length !== TAMANHO_CODIGO) return false
  return [...codigo].every((caractere) => ALFABETO.includes(caractere))
}

/**
 * A forma legível: `K7X2-QW9F-M3PR-TVN4`. Dezesseis caracteres seguidos são
 * difíceis de conferir a olho e piores ainda de ditar por voz.
 *
 * Só apresentação. O código canônico — o que identifica a sala na rede — é
 * sempre o sem hífen, e `ehCodigoValido` recusa a forma agrupada de
 * propósito: duas grafias válidas do mesmo código dariam duas salas
 * diferentes, e as pessoas ficariam sozinhas cada uma na sua.
 */
export function formatarCodigo(codigo: string): string {
  const grupos = codigo.match(new RegExp(`.{1,${TAMANHO_GRUPO}}`, 'g'))
  return grupos ? grupos.join('-') : codigo
}

/**
 * Traz qualquer grafia de volta à forma canônica: sem hífen, sem espaço,
 * maiúscula. Único ponto de normalização — a URL e o campo digitado passam
 * os dois por aqui, para que nunca divirjam.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto.replace(/[\s-]+/g, '').toUpperCase()
}

// O regex só isola o que vem depois de "#sala="; o formato em si (tamanho e
// alfabeto) é responsabilidade de ehCodigoValido, para não duplicar essa
// regra aqui.
const PADRAO_HASH_SALA = /^#sala=(.*)$/

export function lerCodigoDaUrl(hash: string): string | null {
  const encontrado = PADRAO_HASH_SALA.exec(hash)
  if (!encontrado) return null
  const codigo = normalizarCodigo(encontrado[1]!)
  return ehCodigoValido(codigo) ? codigo : null
}

/**
 * Se a URL tenta apontar para uma sala, valendo o código ou não. Serve para
 * distinguir "chegou pela porta da frente" de "clicou num link de convite
 * que veio truncado": no segundo caso `lerCodigoDaUrl` devolve null e, sem
 * essa distinção, o jogador cai na tela de criar sala achando que entrou —
 * e acaba criando uma sala vazia diferente.
 */
export function haCodigoNaUrl(hash: string): boolean {
  return PADRAO_HASH_SALA.test(hash)
}

/**
 * O fragmento da URL para uma sala. Existe como função única para que a
 * barra de endereços e o link copiado mostrem exatamente a mesma coisa —
 * duas grafias do mesmo código confundem quem compara os dois.
 */
export function montarHashSala(codigo: string): string {
  return `#sala=${formatarCodigo(codigo)}`
}

export function montarLinkSala(base: string, codigo: string): string {
  const semHash = base.split('#')[0]!
  return `${semHash}${montarHashSala(codigo)}`
}
