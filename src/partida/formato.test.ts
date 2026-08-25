// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHAVE_FORMATO, deJson, esquecerFormato, formatoLembrado, lembrarFormato,
  MAX_JSON, paraJson,
} from './formato'
import { CONFIG_PADRAO } from '../game/rules'

const meu = { ...CONFIG_PADRAO, fichasIniciais: 3000, alvo: 9000 }

beforeEach(() => localStorage.clear())

describe('lembrar o formato', () => {
  it('sem nada guardado, não há formato lembrado', () => {
    expect(formatoLembrado()).toBeNull()
  })

  it('lembra e devolve', () => {
    lembrarFormato(meu)

    expect(formatoLembrado()).toEqual(meu)
  })

  it('esquecer apaga', () => {
    lembrarFormato(meu)
    esquecerFormato()

    expect(formatoLembrado()).toBeNull()
  })

  it('lixo no armazenamento é como não ter nada', () => {
    localStorage.setItem(CHAVE_FORMATO, 'isto não é JSON')

    expect(formatoLembrado()).toBeNull()
  })

  it('valores impossíveis guardados são encaixados na leitura', () => {
    // O localStorage é editável por qualquer script desta origem, e pode ter
    // sido escrito por uma versão do site que não conhecemos.
    localStorage.setItem(CHAVE_FORMATO, JSON.stringify({
      fichasIniciais: 500, apostaMax: 99_999, alvo: 1, segundosTurno: 0,
    }))

    const lido = formatoLembrado()!
    expect(lido.apostaMax).toBeLessThanOrEqual(lido.fichasIniciais)
    expect(lido.alvo!).toBeGreaterThan(lido.fichasIniciais)
  })
})

describe('exportar e importar', () => {
  it('a volta completa devolve o mesmo formato', () => {
    expect(deJson(paraJson(meu))).toEqual(meu)
  })

  it('o texto é legível — alguém vai olhar antes de mandar', () => {
    expect(paraJson(meu)).toContain('\n')
    expect(paraJson(meu)).toContain('fichasIniciais')
  })

  it('aceita colado com espaço em volta', () => {
    expect(deJson(`\n  ${paraJson(meu)}  \n`)).toEqual(meu)
  })

  it('recusa o que não é JSON', () => {
    for (const ruim of ['', '   ', 'oi', '{', '[1,2]', null, undefined, 42]) {
      expect(deJson(ruim)).toBeNull()
    }
  })

  it('recusa JSON de OUTRA coisa', () => {
    // Aceitar devolveria o padrão como se a importação tivesse dado certo — e
    // a pessoa acharia que importou um formato que nunca existiu.
    expect(deJson('{"nome":"Alex","codigo":"X"}')).toBeNull()
  })

  it('recusa texto gigante', () => {
    expect(deJson(`{"alvo":${'9'.repeat(MAX_JSON)}}`)).toBeNull()
  })

  it('encaixa números impossíveis em vez de recusar', () => {
    // Um formato vindo de outra pessoa não precisa ser perfeito para servir.
    const lido = deJson('{"fichasIniciais":500,"apostaMax":99999}')!

    expect(lido.apostaMax).toBeLessThanOrEqual(500)
  })

  it('formato com campos a mais continua servindo', () => {
    // Uma versão futura pode acrescentar campos; recusar por isso quebraria a
    // troca entre pessoas em versões diferentes.
    const lido = deJson('{"alvo":4000,"algoNovo":true}')!

    expect(lido.alvo).toBe(4000)
    expect(lido.fichasIniciais).toBe(CONFIG_PADRAO.fichasIniciais)
  })
})
