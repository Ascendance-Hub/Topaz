import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { esquecerIdentidade, guardarIdentidade, identidadeGuardada } from './cofre'
import { assinar, gerarIdentidade, impressaoDigital, verificar } from './chaves'

beforeEach(() => {
  // Banco limpo por teste: um resto de outro teste faria "primeira visita"
  // passar por engano.
  indexedDB = new IDBFactory()
})

describe('cofre da identidade', () => {
  it('sem nada guardado, é a primeira visita', async () => {
    expect(await identidadeGuardada()).toBeNull()
  })

  it('guarda e devolve a MESMA identidade', async () => {
    const { par } = await gerarIdentidade()
    const selo = await impressaoDigital(par.publicKey)

    await guardarIdentidade(par)
    const lido = await identidadeGuardada()

    expect(await impressaoDigital(lido!.publicKey)).toBe(selo)
  })

  it('a chave lida ainda assina — sobreviveu de verdade, não só de forma', async () => {
    // Guardar um objeto que volta inutilizável seria pior que não guardar: o
    // defeito só apareceria no dia seguinte, ao tentar provar quem se é.
    const { par } = await gerarIdentidade()
    await guardarIdentidade(par)

    const lido = await identidadeGuardada()
    const firma = await assinar(lido!.privateKey, 'desafio')

    expect(await verificar(lido!.publicKey, 'desafio', firma)).toBe(true)
  })

  it('a chave lida CONTINUA não extraível', async () => {
    // É a razão de o cofre ser IndexedDB e não localStorage. Se a ida e volta
    // pelo banco devolvesse uma chave legível, todo o desenho cairia.
    const { par } = await gerarIdentidade()
    await guardarIdentidade(par)

    const lido = await identidadeGuardada()

    expect(lido!.privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('jwk', lido!.privateKey)).rejects.toThrow()
  })

  it('guardar de novo substitui, não acumula', async () => {
    const primeira = await gerarIdentidade()
    const segunda = await gerarIdentidade()

    await guardarIdentidade(primeira.par)
    await guardarIdentidade(segunda.par)

    const lido = await identidadeGuardada()
    expect(await impressaoDigital(lido!.publicKey))
      .toBe(await impressaoDigital(segunda.par.publicKey))
  })

  it('esquecer apaga — é o "sair" de quem usou máquina emprestada', async () => {
    const { par } = await gerarIdentidade()
    await guardarIdentidade(par)

    await esquecerIdentidade()

    expect(await identidadeGuardada()).toBeNull()
  })

  it('esquecer sem nada guardado não estoura', async () => {
    await expect(esquecerIdentidade()).resolves.toBeUndefined()
  })

  it('lixo no banco é tratado como primeira visita', async () => {
    // O banco é do navegador da pessoa e pode ter sido mexido por uma versão
    // antiga do site ou por uma extensão. Confiar sem olhar traria de volta a
    // mesma classe de defeito que os guardas de rede resolveram.
    await guardarIdentidade({ nada: true } as unknown as CryptoKeyPair)

    expect(await identidadeGuardada()).toBeNull()
  })
})
