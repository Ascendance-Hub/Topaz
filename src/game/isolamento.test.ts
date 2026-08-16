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

describe('isolamento da camada game/', () => {
  it('não importa nada de net/ nem de ui/', () => {
    const violacoes = arquivosTs('src/game').filter((caminho) => {
      const conteudo = readFileSync(caminho, 'utf-8')
      return /from\s+['"].*\/(net|ui)\//.test(conteudo)
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
