import { describe, it, expect } from 'vitest'
import { idDePresenca } from './id'

describe('o id da sala de presença', () => {
  /**
   * Esta é a linha que consertou a presença, e vale o teste porque um dia
   * alguém vai achar que o sufixo é enfeite.
   *
   * O Trystero indexa as salas abertas **só pelo `roomId`** e devolve a que já
   * existe, ignorando a config (`strategy.ts:213`):
   *
   *     if (occupiedRooms[appId]?.[roomId]) return occupiedRooms[appId][roomId]
   *
   * As quatro tentativas anteriores usavam o MESMO código nas duas salas.
   * Resultado medido, com o grupo observado no fundo e depois aberto:
   *
   *     mesmoObjeto: true · isPassive: true · conexões pré-fabricadas: 0
   *
   * Ou seja: entrar no grupo devolvia a sala de fundo PASSIVA. Passivo não
   * anuncia e não pré-fabrica ofertas — a pessoa entrava invisível e sem
   * munição, e só conectava se alguém a achasse primeiro. Era o "trocar de
   * grupo está lento e inconstante".
   *
   * Com id próprio, a mesma medição deu `mesmoObjeto: false` e a sala de
   * verdade ativa.
   */
  it('nunca é igual ao código do grupo', () => {
    expect(idDePresenca('AAAABBBBCCCCDDDD')).not.toBe('AAAABBBBCCCCDDDD')
  })

  it('deriva do código, para os dois lados chegarem no mesmo id', () => {
    expect(idDePresenca('AAAABBBBCCCCDDDD')).toBe('AAAABBBBCCCCDDDD#presenca')
  })

  it('grupos diferentes têm salas de presença diferentes', () => {
    expect(idDePresenca('AAAA')).not.toBe(idDePresenca('BBBB'))
  })

  it('o sufixo não é aplicado duas vezes por engano', () => {
    // Chamar de novo sobre o resultado seria um id que ninguém mais alcança.
    expect(idDePresenca(idDePresenca('AAAA'))).not.toBe(idDePresenca('AAAA'))
  })
})
