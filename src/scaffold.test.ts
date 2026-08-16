import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('configuração do projeto', () => {
  it('define base como /Topaz/ para o GitHub Pages', () => {
    const config = readFileSync('vite.config.ts', 'utf-8')
    expect(config).toContain("base: '/Topaz/'")
  })

  it('mantém o modo strict do TypeScript ligado', () => {
    const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8'))
    expect(tsconfig.compilerOptions.strict).toBe(true)
  })
})
