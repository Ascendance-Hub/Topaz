/**
 * A identidade de uma pessoa: um par de chaves gerado no próprio navegador.
 *
 * Existe porque o `selfId` do Trystero nasce a cada carregamento da página —
 * ele identifica uma aba, não uma pessoa. Sem identidade estável, "adicionar
 * amigo" não teria o que guardar, e o apelido continuaria sendo uma afirmação
 * que ninguém confere.
 *
 * **A chave pública é o ID; a privada é o que autentica.** Essa distinção é a
 * coisa mais importante daqui: o ID aparece para todo mundo na sala, então se
 * bastasse o ID para "entrar como fulano", qualquer um que te visse viraria
 * você.
 *
 * ## Por que P-256 e não Ed25519
 *
 * Ed25519 daria um segredo bem mais curto (64 contra 184 caracteres), mas só
 * chegou aos navegadores recentemente. O modo de falhar é péssimo: quem
 * estiver num navegador mais velho simplesmente não conseguiria criar
 * identidade. P-256 existe há uma década em todo lugar, e o segredo é copiado,
 * nunca digitado.
 */

/** O selo curto que aparece ao lado do nome. */
export const TAMANHO_SELO = 8

/**
 * Mesmo alfabeto sem ambiguidade do código de sala, e pelo mesmo motivo: o
 * selo existe para duas pessoas COMPARAREM — inclusive em voz alta — e O/0 ou
 * I/1 arruinariam justamente esse uso.
 *
 * Repetido aqui de propósito em vez de importado da camada de interface: esta
 * camada não deve depender daquela, e são duas decisões que por acaso
 * coincidem, não uma só.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const CURVA = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ASSINATURA = { name: 'ECDSA', hash: 'SHA-256' } as const

/** As três partes da chave numa curva P-256, em base64url. */
const PADRAO_SEGREDO = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

const texto = new TextEncoder()

function paraBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

/**
 * O `ArrayBuffer` é construído explicitamente porque o WebCrypto recusa um
 * `SharedArrayBuffer`, e desde o TypeScript 5.7 os arrays tipados carregam o
 * buffer no próprio tipo — `Uint8Array.from(...)` infere o genérico errado.
 */
function deBase64(valor: string): Uint8Array<ArrayBuffer> {
  const bruto = atob(valor)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

/**
 * O formato do segredo de recuperação: `d.x.y`, as três coordenadas da chave.
 *
 * Guardamos as três porque o WebCrypto não sabe derivar a parte pública a
 * partir da privada — ele exige `x` e `y` na importação. Sem elas, o segredo
 * reconstruiria uma chave que assina mas não tem identidade conhecida.
 */
export function ehSegredoValido(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  return PADRAO_SEGREDO.test(valor)
}

function jwkDoSegredo(segredo: string): JsonWebKey {
  const [d, x, y] = segredo.split('.')
  return { kty: 'EC', crv: 'P-256', d, x, y }
}

async function parDoJwk(jwk: JsonWebKey): Promise<CryptoKeyPair> {
  // A privada entra NÃO extraível: importar não pode ser a porta dos fundos
  // que devolve o material em texto. Quem cola o segredo numa máquina
  // emprestada deixaria a chave legível ali para sempre.
  const privateKey = await crypto.subtle.importKey('jwk', jwk, CURVA, false, ['sign'])
  // A pública sai do mesmo JWK, sem o `d` — ela é para ser lida e comparada.
  const { d: _, ...publica } = jwk
  const publicKey = await crypto.subtle.importKey(
    'jwk', { ...publica, key_ops: ['verify'] }, CURVA, true, ['verify'],
  )
  return { privateKey, publicKey }
}

/**
 * Cria uma identidade nova.
 *
 * Devolve o par já **não extraível** e, uma única vez, o segredo de
 * recuperação. O segredo NÃO é guardado por nós em lugar nenhum: quem chama
 * mostra para a pessoa e esquece. É o mesmo trato de carteira de cripto, e a
 * consequência precisa estar na tela — sem o segredo guardado, limpar o
 * navegador apaga a identidade para sempre.
 */
export async function gerarIdentidade(): Promise<{ par: CryptoKeyPair; segredo: string }> {
  // Extraível só aqui, e só para render o segredo. O que fica guardado é a
  // reimportação não extraível logo abaixo.
  const efemero = await crypto.subtle.generateKey(CURVA, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', efemero.privateKey)
  const segredo = `${jwk.d}.${jwk.x}.${jwk.y}`
  return { par: await parDoJwk(jwk), segredo }
}

/** Reconstrói a identidade a partir do segredo guardado pela pessoa. */
export async function importarSegredo(segredo: string): Promise<CryptoKeyPair> {
  if (!ehSegredoValido(segredo)) throw new Error('segredo de recuperação inválido')
  return parDoJwk(jwkDoSegredo(segredo))
}

/** A chave pública em texto, para viajar pela rede. */
export async function exportarPublica(chave: CryptoKey): Promise<string> {
  return paraBase64(await crypto.subtle.exportKey('spki', chave))
}

export async function importarPublica(valor: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', deBase64(valor), CURVA, true, ['verify'])
}

/**
 * O selo curto que representa a identidade para uma pessoa.
 *
 * Sai da chave pública inteira, não de parte dela: duas chaves diferentes com
 * o mesmo começo dariam o mesmo selo, e o selo serve exatamente para
 * distinguir.
 */
export async function impressaoDigital(chave: CryptoKey): Promise<string> {
  const bruta = await crypto.subtle.exportKey('spki', chave)
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bruta))
  let selo = ''
  for (let i = 0; i < TAMANHO_SELO; i++) {
    selo += ALFABETO[resumo[i]! % ALFABETO.length]
  }
  return selo
}

export async function assinar(chave: CryptoKey, dados: string): Promise<string> {
  return paraBase64(await crypto.subtle.sign(ASSINATURA, chave, texto.encode(dados)))
}

/**
 * Se esta assinatura foi mesmo feita por quem tem a privada desta pública.
 *
 * Devolve `false` em vez de estourar quando a assinatura é lixo: ela chega da
 * rede, e um erro solto aqui derrubaria o tratador que estiver conferindo.
 */
export async function verificar(
  chave: CryptoKey, dados: string, assinatura: unknown,
): Promise<boolean> {
  if (typeof assinatura !== 'string' || assinatura === '') return false
  try {
    return await crypto.subtle.verify(
      ASSINATURA, chave, deBase64(assinatura), texto.encode(dados),
    )
  } catch {
    return false
  }
}
