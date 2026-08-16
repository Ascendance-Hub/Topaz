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

// Ligado a TAMANHO_CODIGO em vez de um `8` solto: um código curto demais ou
// truncado (link cortado ao colar, por exemplo) não deve parecer válido —
// isso levaria a lobby a mostrar "Entrando na sala X" com botão de entrar
// para um código que nunca vai bater com o de ninguém.
const PADRAO_HASH_SALA = new RegExp(`^#sala=([A-Za-z0-9]{${TAMANHO_CODIGO}})$`)

export function lerCodigoDaUrl(hash: string): string | null {
  const encontrado = PADRAO_HASH_SALA.exec(hash)
  return encontrado ? encontrado[1]!.toUpperCase() : null
}

export function montarLinkSala(base: string, codigo: string): string {
  const semHash = base.split('#')[0]!
  return `${semHash}#sala=${codigo}`
}
