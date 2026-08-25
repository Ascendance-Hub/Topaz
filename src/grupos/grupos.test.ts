// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHAVE_GRUPOS, corDoGrupo, grupoSalvo, grupos, MAX_GRUPOS, MAX_NOME,
  nomeLimpo, removerGrupo, salvarGrupo,
} from './grupos'

const A = 'K7X2QW9FM3PRTVN4'
const B = 'M3PRTVN4K7X2QW9F'

beforeEach(() => localStorage.clear())

describe('salvar e listar', () => {
  it('sem nada salvo, a lista é vazia', () => {
    expect(grupos()).toEqual([])
  })

  it('salva com nome e devolve a lista', () => {
    expect(salvarGrupo(A, 'Os manos')).toEqual([{ codigo: A, nome: 'Os manos' }])
  })

  it('sobrevive ao recarregar', () => {
    salvarGrupo(A, 'Os manos')

    expect(grupos()).toEqual([{ codigo: A, nome: 'Os manos' }])
  })

  it('salvar a mesma sala de novo RENOMEIA em vez de duplicar', () => {
    // Dois cartões que abrem o mesmo lugar, e a pessoa sem saber qual apagar.
    salvarGrupo(A, 'Primeiro nome')

    const lista = salvarGrupo(A, 'Segundo nome')

    expect(lista).toEqual([{ codigo: A, nome: 'Segundo nome' }])
  })

  it('o mais recente vem primeiro', () => {
    // Quem acabou de salvar procura ele primeiro.
    salvarGrupo(A, 'Antigo')
    const lista = salvarGrupo(B, 'Novo')

    expect(lista.map((g) => g.nome)).toEqual(['Novo', 'Antigo'])
  })

  it('recusa código inválido sem estragar a lista', () => {
    salvarGrupo(A, 'Bom')

    const lista = salvarGrupo('nao-e-codigo', 'Ruim')

    expect(lista).toEqual([{ codigo: A, nome: 'Bom' }])
  })

  it('não passa do teto de grupos', () => {
    // Não é limite de produto: é o que impede uma lista corrompida de virar
    // centenas de salas abertas ao mesmo tempo.
    for (let i = 0; i < MAX_GRUPOS + 5; i++) {
      // Códigos distintos e válidos: troca a primeira letra por uma do alfabeto.
      salvarGrupo(`${'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[i % 31]!}${A.slice(1)}`, `G${i}`)
    }

    expect(grupos().length).toBeLessThanOrEqual(MAX_GRUPOS)
  })
})

describe('remover', () => {
  it('tira só o pedido', () => {
    salvarGrupo(A, 'Um')
    salvarGrupo(B, 'Dois')

    const lista = removerGrupo(A)

    expect(lista).toEqual([{ codigo: B, nome: 'Dois' }])
  })

  it('remover quem não está lá não estraga nada', () => {
    salvarGrupo(A, 'Um')

    expect(removerGrupo(B)).toEqual([{ codigo: A, nome: 'Um' }])
  })
})

describe('grupoSalvo', () => {
  it('diz se esta sala já está guardada', () => {
    // É o que decide entre mostrar "Salvar" ou "Salvo".
    salvarGrupo(A, 'Um')

    expect(grupoSalvo(A)?.nome).toBe('Um')
    expect(grupoSalvo(B)).toBeNull()
  })
})

describe('nome', () => {
  it('nome vazio vira o próprio código', () => {
    // Nenhum grupo pode aparecer como um retângulo sem rótulo.
    expect(nomeLimpo('   ', A)).toBe(A)
  })

  it('corta no teto', () => {
    expect(nomeLimpo('x'.repeat(200), A)).toHaveLength(MAX_NOME)
  })

  it('junta espaços repetidos', () => {
    expect(nomeLimpo('  Os    manos  ', A)).toBe('Os manos')
  })
})

describe('cor', () => {
  it('a mesma sala tem sempre a mesma cor, em qualquer máquina', () => {
    // A cor sai do código e não de uma escolha guardada: assim não há nada a
    // sincronizar, e não há um campo a mais para corromper.
    expect(corDoGrupo(A)).toBe(corDoGrupo(A))
  })

  it('salas diferentes tendem a cores diferentes', () => {
    const cores = new Set(
      'ABCDEFGHJKMNPQ'.split('').map((c) => corDoGrupo(`${c}${A.slice(1)}`)),
    )
    expect(cores.size).toBeGreaterThan(1)
  })
})

describe('o que vem do armazenamento não é confiável', () => {
  it('lixo no lugar da lista começa vazio', () => {
    localStorage.setItem(CHAVE_GRUPOS, 'isto não é JSON')

    expect(grupos()).toEqual([])
  })

  it('JSON válido que não é lista começa vazio', () => {
    localStorage.setItem(CHAVE_GRUPOS, '{"codigo":"x"}')

    expect(grupos()).toEqual([])
  })

  it('descarta o item ruim e mantém o bom', () => {
    // Uma entrada corrompida — por versão antiga do site ou por extensão — não
    // pode apagar a lista inteira de quem confiou nela.
    localStorage.setItem(CHAVE_GRUPOS, JSON.stringify([
      { codigo: 'nao-e-codigo', nome: 'Ruim' },
      { codigo: A, nome: 'Bom' },
      { nome: 'Sem código' },
      null,
      'texto',
    ]))

    expect(grupos()).toEqual([{ codigo: A, nome: 'Bom' }])
  })

  it('descarta nome gigante, que estouraria o trilho', () => {
    localStorage.setItem(CHAVE_GRUPOS, JSON.stringify([
      { codigo: A, nome: 'x'.repeat(5000) },
    ]))

    expect(grupos()).toEqual([])
  })
})
