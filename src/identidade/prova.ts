import { assinar, importarPublica, impressaoDigital, verificar } from './chaves'

/**
 * Provar quem se é, sem servidor no meio.
 *
 * O apelido sempre foi auto-declarado: quem entra escreve o nome que quiser e
 * ninguém confere. Com um par de chaves dá para fazer melhor — quem afirma uma
 * identidade **assina um desafio** que a outra pessoa acabou de sortear, e só
 * quem tem a chave privada consegue produzir aquela assinatura.
 *
 * Duas amarras importantes, e cada uma fecha um ataque:
 *
 * 1. **O desafio é sorteado por quem pergunta**, e é novo a cada conexão.
 *    Sem isso, uma assinatura capturada uma vez valeria para sempre.
 * 2. **A assinatura é amarrada à sala.** Sem isso, a prova dada numa sala
 *    poderia ser repetida noutra, por alguém que só assistiu.
 */

/** Bytes do desafio. 16 bytes sorteados não se repetem na prática. */
const BYTES_DESAFIO = 16

/** Sorteia um desafio novo. Criptograficamente seguro de propósito: um valor
 *  previsível deixaria alguém preparar a resposta antes da pergunta. */
export function criarDesafio(): string {
  const bytes = new Uint8Array(BYTES_DESAFIO)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * O texto que de fato é assinado.
 *
 * Junta o desafio à sala para que a prova só valha ali. O prefixo existe para
 * que esta assinatura nunca possa ser confundida com outra coisa que o
 * projeto venha a assinar no futuro.
 */
export function textoDoDesafio(desafio: string, sala: string): string {
  return `topaz:identidade:v1:${sala}:${desafio}`
}

/** Responde ao desafio de outra pessoa. */
export function responder(
  privada: CryptoKey, desafio: string, sala: string,
): Promise<string> {
  return assinar(privada, textoDoDesafio(desafio, sala))
}

/**
 * Confere a resposta e devolve o selo de quem provou — ou `null`.
 *
 * `null` para tudo que não fecha, sem distinguir "chave malformada" de
 * "assinatura errada": quem chama não tem o que fazer de diferente, e o
 * detalhe só serviria para quem estivesse testando ataques.
 */
export async function conferir(
  publicaTexto: unknown, desafio: string, sala: string, assinatura: unknown,
): Promise<string | null> {
  if (typeof publicaTexto !== 'string' || publicaTexto === '') return null
  try {
    const publica = await importarPublica(publicaTexto)
    const ok = await verificar(publica, textoDoDesafio(desafio, sala), assinatura)
    return ok ? await impressaoDigital(publica) : null
  } catch {
    // Chave que não importa: veio lixo, ou de uma versão que não conhecemos.
    return null
  }
}
