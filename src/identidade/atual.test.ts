import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  entrarComSegredo, esquecerCache, identidadeAtual, sairDaIdentidade,
} from './atual'
import { ehSegredoValido } from './chaves'

beforeEach(() => {
  indexedDB = new IDBFactory()
  esquecerCache()
})

describe('identidadeAtual', () => {
  it('na primeira visita, cria e entrega o segredo para guardar', async () => {
    const eu = await identidadeAtual()

    expect(eu.selo).toHaveLength(8)
    expect(ehSegredoValido(eu.segredoNovo)).toBe(true)
  })

  it('na segunda visita, é a MESMA pessoa e NÃO repete o segredo', async () => {
    // Repetir o segredo depois seria mentira: a chave guardada é não
    // extraível, então ele não existe mais em lugar nenhum para ser mostrado.
    const primeira = await identidadeAtual()
    esquecerCache()

    const segunda = await identidadeAtual()

    expect(segunda.selo).toBe(primeira.selo)
    expect(segunda.segredoNovo).toBeUndefined()
  })

  it('dois pedidos ao mesmo tempo dão UMA identidade só', async () => {
    // Sem o cache da promessa, duas partes da interface pedindo juntas
    // criariam duas identidades. A segunda sobrescreveria a primeira no cofre,
    // e quem tivesse guardado o primeiro segredo ficaria com um papel que não
    // abre mais nada.
    const [a, b] = await Promise.all([identidadeAtual(), identidadeAtual()])

    expect(a.selo).toBe(b.selo)
  })
})

describe('entrarComSegredo', () => {
  it('recupera a identidade noutra máquina', async () => {
    const original = await identidadeAtual()
    // Outra máquina: cofre vazio, cache limpo.
    indexedDB = new IDBFactory()
    esquecerCache()

    const recuperada = await entrarComSegredo(original.segredoNovo!)

    expect(recuperada.selo).toBe(original.selo)
  })

  it('a identidade recuperada sobrevive à próxima visita', async () => {
    const original = await identidadeAtual()
    indexedDB = new IDBFactory()
    esquecerCache()
    await entrarComSegredo(original.segredoNovo!)

    esquecerCache()
    const depois = await identidadeAtual()

    expect(depois.selo).toBe(original.selo)
    expect(depois.segredoNovo).toBeUndefined()
  })

  it('substitui quem estava nesta máquina', async () => {
    const outra = await identidadeAtual()
    indexedDB = new IDBFactory()
    esquecerCache()
    const daMaquina = await identidadeAtual()

    await entrarComSegredo(outra.segredoNovo!)
    esquecerCache()

    expect((await identidadeAtual()).selo).not.toBe(daMaquina.selo)
  })

  it('segredo inválido é recusado sem estragar a identidade atual', async () => {
    const eu = await identidadeAtual()

    await expect(entrarComSegredo('lixo')).rejects.toThrow()

    esquecerCache()
    expect((await identidadeAtual()).selo).toBe(eu.selo)
  })
})

describe('sairDaIdentidade', () => {
  it('a próxima visita é uma pessoa nova, com segredo novo', async () => {
    const antes = await identidadeAtual()

    await sairDaIdentidade()
    const depois = await identidadeAtual()

    expect(depois.selo).not.toBe(antes.selo)
    expect(ehSegredoValido(depois.segredoNovo)).toBe(true)
  })

  it('quem guardou o segredo consegue voltar depois de sair', async () => {
    // É o que separa "sair" de "perder a conta".
    const antes = await identidadeAtual()
    await sairDaIdentidade()
    await identidadeAtual()

    const devolta = await entrarComSegredo(antes.segredoNovo!)

    expect(devolta.selo).toBe(antes.selo)
  })
})
