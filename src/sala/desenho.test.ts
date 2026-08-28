import { describe, it, expect } from 'vitest'
import { oQueOPalcoMostra } from './desenho'
import type { EstadoDaSalaParaDesenhar } from './desenho'

const base: EstadoDaSalaParaDesenhar = {
  status: 'conectado',
  tela: 'sala',
  jogoEmAjuste: null,
  euNaCall: false,
  sozinho: false,
}
const com = (mudar: Partial<EstadoDaSalaParaDesenhar>) =>
  oQueOPalcoMostra({ ...base, ...mudar })

describe('oQueOPalcoMostra — a conexão vem antes de tudo', () => {
  it('conectando: mostra a conexão, e NÃO a mesa vazia', () => {
    // Mesa vazia com "Aguardando jogadores…" confundiria "ninguém entrou
    // ainda" com "a conexão falhou" (spec §14).
    expect(com({ status: 'conectando', tela: 'mesa' }))
      .toEqual({ tipo: 'conexao', status: 'conectando', comTesteDeRede: false })
  })

  it('sem conexão: mostra a conexão E o teste de rede', () => {
    expect(com({ status: 'sem-conexao' }))
      .toEqual({ tipo: 'conexao', status: 'sem-conexao', comTesteDeRede: true })
  })

  it('conectando ainda NÃO oferece o teste: seria ruído sobre algo em curso', () => {
    expect(com({ status: 'conectando' }))
      .toMatchObject({ comTesteDeRede: false })
  })

  it('a conexão ganha até de estar na call', () => {
    expect(com({ status: 'conectando', euNaCall: true }))
      .toMatchObject({ tipo: 'conexao' })
  })
})

describe('oQueOPalcoMostra — as telas', () => {
  it('mesa', () => {
    expect(com({ tela: 'mesa' })).toEqual({ tipo: 'mesa' })
  })

  it('jogos, sem formato aberto: a galeria', () => {
    expect(com({ tela: 'jogos' })).toEqual({ tipo: 'jogos' })
  })

  it('jogos, com formato aberto: o formato daquele jogo', () => {
    expect(com({ tela: 'jogos', jogoEmAjuste: 'blackjack' }))
      .toEqual({ tipo: 'formato', jogo: 'blackjack' })
  })

  it('config', () => {
    expect(com({ tela: 'config' })).toEqual({ tipo: 'config' })
  })

  it('o formato só vale dentro de Jogos', () => {
    // Sair da aba com um formato aberto não pode deixá-lo vazando na sala.
    expect(com({ tela: 'sala', jogoEmAjuste: 'blackjack' }))
      .toMatchObject({ tipo: 'convite' })
  })
})

describe('oQueOPalcoMostra — a sala', () => {
  it('dentro da call, o palco sai da frente: o miolo são os rostos', () => {
    expect(com({ euNaCall: true })).toEqual({ tipo: 'rostos' })
  })

  it('fora da call, convida a entrar', () => {
    // Vazio sem explicação lê como falha.
    expect(com({ euNaCall: false, sozinho: false }))
      .toEqual({ tipo: 'convite', comTesteDeRede: false })
  })

  it('sozinho, o convite vem com o teste de rede', () => {
    // Quem está sozinho é exatamente quem precisa dele: de dentro, a aplicação
    // não distingue "ninguém me achou" de "minha rede não deixa conectar".
    expect(com({ sozinho: true }))
      .toEqual({ tipo: 'convite', comTesteDeRede: true })
  })

  it('sozinho DENTRO da call não recebe teste: os rostos ganham', () => {
    expect(com({ sozinho: true, euNaCall: true })).toEqual({ tipo: 'rostos' })
  })
})
