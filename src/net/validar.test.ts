import { describe, it, expect } from 'vitest'
import { ehEstadoPlausivel, textoLimitado } from './validar'
import { criarContexto } from '../game/machine'
import { rngSemente } from '../game/shoe'

const estadoReal = () => criarContexto('pa', rngSemente(1)).estado

const maoReal = () => ({
  id: 'm1', cartas: [{ naipe: 'copas', valor: 'A' }], aposta: 10,
  dobrada: false, vindaDeSplit: false, encerrada: false,
})

const jogadorReal = () => ({
  peerId: 'pa', apelido: 'Alex', cadeira: 0, fichas: 1000, maos: [],
  maoAtiva: 0, seguro: 0, rodadasInativo: 0, desconectadoEm: null,
  decidiuSeguro: false, eliminadoEm: null,
})

describe('ehEstadoPlausivel', () => {
  it('aceita um estado de verdade, saído da própria máquina do jogo', () => {
    // O teste que impede o guarda de virar rígido demais e recusar a mesa
    // legítima — falha que só apareceria com duas pessoas na sala.
    expect(ehEstadoPlausivel(estadoReal())).toBe(true)
  })

  it('recusa o que nem é objeto', () => {
    expect(ehEstadoPlausivel(null)).toBe(false)
    expect(ehEstadoPlausivel('mesa')).toBe(false)
    expect(ehEstadoPlausivel(42)).toBe(false)
    expect(ehEstadoPlausivel(undefined)).toBe(false)
  })

  it('recusa listas que não são listas', () => {
    // É o caso que derruba a sala inteira: `jogadores.map(...)` numa string
    // lança no meio do desenho, e a página some para quem recebeu.
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: 'ninguém' })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), maoDealer: null })).toBe(false)
  })

  it('recusa fase inventada', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), fase: 'roubar' })).toBe(false)
  })

  it('recusa campos com o tipo trocado', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), hostAtual: 7 })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: 'muitas' })).toBe(false)
  })

  it('recusa rodada absurda, que venceria qualquer desempate', () => {
    // `mesaPrevalece` usa a rodada para decidir qual mesa fica quando dois
    // anfitriões se encontram. Sem teto, alguém publica rodada gigante e
    // adota a sala inteira à mesa dele.
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: Number.MAX_SAFE_INTEGER })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: -1 })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), rodada: Number.NaN })).toBe(false)
  })

  it('recusa uma mesa com gente demais para caber numa sala', () => {
    const lotado = { ...estadoReal(), jogadores: Array.from({ length: 5000 }, () => ({})) }
    expect(ehEstadoPlausivel(lotado)).toBe(false)
  })
})

describe('textoLimitado', () => {
  it('deixa passar texto normal', () => {
    expect(textoLimitado('oi pessoal', 200)).toBe('oi pessoal')
  })

  it('corta o que passa do limite', () => {
    // O limite do chat vale para quem ENVIA. Quem recebe precisa aplicar o
    // dele: um cliente modificado manda o texto que quiser, e uma linha de
    // dez megabytes trava o navegador de todo mundo na sala.
    expect(textoLimitado('a'.repeat(10_000), 200)).toHaveLength(200)
  })

  it('vira string vazia quando não é texto', () => {
    expect(textoLimitado(null, 200)).toBe('')
    expect(textoLimitado({ toString: () => 'oi' }, 200)).toBe('')
    expect(textoLimitado(123, 200)).toBe('')
  })
})

describe('ehEstadoPlausivel — profundidade', () => {
  /**
   * `Array.isArray(jogadores)` não basta. `mesa.ts` faz `jogador.maos.forEach`
   * e `mao.cartas` logo em seguida: um item vazio dentro de uma lista
   * bem-formada lança no meio do desenho e apaga a página de quem recebeu —
   * exatamente o que este guarda existe para impedir.
   */
  it('recusa jogador sem as listas que o desenho percorre', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [{}] })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [null] })).toBe(false)
  })

  it('recusa jogador com peerId que não é texto', () => {
    const jogador = { ...jogadorReal(), peerId: 7 }
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [jogador] })).toBe(false)
  })

  it('recusa mão sem cartas', () => {
    const jogador = { ...jogadorReal(), maos: [{ id: 'm1', aposta: 10 }] }
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [jogador] })).toBe(false)
  })

  it('recusa carta nula, que lança ao ler o naipe', () => {
    const jogador = { ...jogadorReal(), maos: [{ ...maoReal(), cartas: [null] }] }
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [jogador] })).toBe(false)
    expect(ehEstadoPlausivel({ ...estadoReal(), maoDealer: [null] })).toBe(false)
  })

  it('aceita uma mesa de verdade, com jogador, mão e cartas', () => {
    // O contrapeso: um guarda fundo demais recusa a mesa legítima, e a falha
    // só aparece com duas pessoas jogando de verdade.
    const jogador = { ...jogadorReal(), maos: [maoReal()] }
    const estado = { ...estadoReal(), jogadores: [jogador], maoDealer: maoReal().cartas }
    expect(ehEstadoPlausivel(estado)).toBe(true)
  })
})

describe('ehEstadoPlausivel — tamanho das listas de dentro', () => {
  // Limitar só a lista de jogadores não fecha o buraco: um milhão de cartas
  // na mão do dealer trava o navegador de quem recebe do mesmo jeito.
  const muitas = (n: number) => Array.from({ length: n }, () => ({ naipe: 'copas', valor: 'A' }))

  it('recusa mão do dealer com mais cartas do que existe no sapato', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), maoDealer: muitas(100_000) })).toBe(false)
  })

  it('recusa mão de jogador com cartas demais', () => {
    const jogador = { ...jogadorReal(), maos: [{ ...maoReal(), cartas: muitas(100_000) }] }
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [jogador] })).toBe(false)
  })

  it('recusa jogador com mãos demais', () => {
    const jogador = { ...jogadorReal(), maos: Array.from({ length: 5000 }, maoReal) }
    expect(ehEstadoPlausivel({ ...estadoReal(), jogadores: [jogador] })).toBe(false)
  })

  it('aceita o sapato inteiro na mesa, que é o pior caso legítimo', () => {
    expect(ehEstadoPlausivel({ ...estadoReal(), maoDealer: muitas(21) })).toBe(true)
  })
})
