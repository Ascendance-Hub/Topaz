// Sem O, 0, I, 1 e L — pares que as pessoas confundem ao digitar.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TAMANHO_CODIGO = 8

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

// O regex só isola o que vem depois de "#sala="; o formato em si (tamanho e
// alfabeto) é responsabilidade de ehCodigoValido, para não duplicar essa
// regra aqui.
const PADRAO_HASH_SALA = /^#sala=(.+)$/

export function lerCodigoDaUrl(hash: string): string | null {
  const encontrado = PADRAO_HASH_SALA.exec(hash)
  if (!encontrado) return null
  const codigo = encontrado[1]!.toUpperCase()
  return ehCodigoValido(codigo) ? codigo : null
}

export function montarLinkSala(base: string, codigo: string): string {
  const semHash = base.split('#')[0]!
  return `${semHash}#sala=${codigo}`
}
