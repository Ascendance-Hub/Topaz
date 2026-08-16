import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho)
    return caminho.endsWith('.ts') ? [caminho] : []
  })
}

// Pega o especificador de qualquer forma de import: nomeado, type-only,
// re-export, efeito colateral (import 'x') e dinamico (import('x')).
const ESPECIFICADOR = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g
const CAMADA_PROIBIDA = /(^|\/)(net|ui)(\/|$)/

function importaCamadaProibida(conteudo: string): boolean {
  for (const [, especificador] of conteudo.matchAll(ESPECIFICADOR)) {
    if (especificador && CAMADA_PROIBIDA.test(especificador)) return true
  }
  return false
}

describe('isolamento da camada game/', () => {
  it('a regra de importação rejeita formas de import de net/ e ui/', () => {
    expect(importaCamadaProibida("import { x } from '../net/foo'")).toBe(true)
    expect(importaCamadaProibida("import type { x } from '../ui/bar'")).toBe(true)
    expect(importaCamadaProibida("export { x } from '../net'")).toBe(true)
    expect(importaCamadaProibida("import '../ui/side-effect'")).toBe(true)
    expect(importaCamadaProibida("import('../net/dynamic')")).toBe(true)
    expect(importaCamadaProibida("import { x } from '../net'")).toBe(true)

    expect(importaCamadaProibida("import { x } from './types'")).toBe(false)
    expect(importaCamadaProibida("import { x } from '../network/x'")).toBe(false)
  })

  it('não importa nada de net/ nem de ui/', () => {
    const violacoes = arquivosTs('src/game').filter((caminho) => {
      if (caminho.endsWith('.test.ts')) return false
      const conteudo = readFileSync(caminho, 'utf-8')
      return importaCamadaProibida(conteudo)
    })
    expect(violacoes).toEqual([])
  })

  it('não referencia APIs de navegador', () => {
    const violacoes = arquivosTs('src/game').filter((caminho) => {
      if (caminho.endsWith('.test.ts')) return false
      const conteudo = readFileSync(caminho, 'utf-8')
      return /\b(document|window|localStorage)\b/.test(conteudo)
    })
    expect(violacoes).toEqual([])
  })
})
