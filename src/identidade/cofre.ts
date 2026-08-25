/**
 * Onde a identidade fica guardada entre uma visita e outra.
 *
 * **IndexedDB e não localStorage**, e a diferença é o ponto central do
 * desenho: o `localStorage` guarda texto, então uma chave ali é legível por
 * qualquer script da origem — uma extensão do navegador basta. O IndexedDB
 * guarda o próprio objeto `CryptoKey`, e um objeto não extraível continua não
 * extraível depois de guardado e lido: dá para assinar com ele, não dá para
 * ler o material. Nem por um script hostil, nem por nós.
 *
 * O que um script hostil na página ainda conseguiria é fazer a pessoa assinar
 * enquanto ela estiver ali. O que ele NÃO consegue é levar a identidade para
 * usar amanhã, de outro lugar — que é a diferença entre um incidente e uma
 * conta perdida.
 */

const BANCO = 'topaz'
const DEPOSITO = 'identidade'
const CHAVE = 'atual'
const VERSAO = 1

/** Envolve uma requisição do IndexedDB numa promessa. */
function promessa<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    req.onsuccess = () => resolver(req.result)
    req.onerror = () => rejeitar(req.error ?? new Error('falha no IndexedDB'))
  })
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const req = indexedDB.open(BANCO, VERSAO)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DEPOSITO)) {
        req.result.createObjectStore(DEPOSITO)
      }
    }
    req.onsuccess = () => resolver(req.result)
    req.onerror = () => rejeitar(req.error ?? new Error('não deu para abrir o banco'))
  })
}

async function comDeposito<T>(
  modo: IDBTransactionMode, corpo: (d: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const banco = await abrir()
  try {
    return await corpo(banco.transaction(DEPOSITO, modo).objectStore(DEPOSITO))
  } finally {
    // Sem fechar, cada chamada deixa uma conexão aberta e uma futura mudança
    // de versão fica bloqueada esperando por elas.
    banco.close()
  }
}

export async function guardarIdentidade(par: CryptoKeyPair): Promise<void> {
  await comDeposito('readwrite', (d) => promessa(d.put(par, CHAVE)))
}

/**
 * A identidade desta máquina, ou `null` se ainda não há uma.
 *
 * Nunca estoura: navegador em janela anônima, IndexedDB bloqueado por política
 * ou banco corrompido devolvem `null`, e quem chama trata como "primeira
 * visita". Deixar escapar apagaria a página inteira por causa de algo que tem
 * um caminho perfeitamente normal — criar uma identidade nova.
 */
export async function identidadeGuardada(): Promise<CryptoKeyPair | null> {
  try {
    const guardado = await comDeposito(
      'readonly', (d) => promessa<unknown>(d.get(CHAVE)),
    )
    if (!ehPar(guardado)) return null
    return guardado
  } catch {
    return null
  }
}

export async function esquecerIdentidade(): Promise<void> {
  try {
    await comDeposito('readwrite', (d) => promessa(d.delete(CHAVE)))
  } catch {
    // Sem banco não havia o que apagar.
  }
}

/**
 * Confere a forma do que voltou do banco.
 *
 * O IndexedDB é do navegador da pessoa e pode ter sido mexido — por uma versão
 * antiga do site, por outra aba, por uma extensão. Confiar sem olhar traria de
 * volta a mesma classe de defeito que os guardas de rede resolveram.
 */
function ehPar(valor: unknown): valor is CryptoKeyPair {
  if (typeof valor !== 'object' || valor === null) return false
  const par = valor as Partial<CryptoKeyPair>
  return par.privateKey?.type === 'private' && par.publicKey?.type === 'public'
}
