import { describe, it, expect } from 'vitest'
import { APELIDO_DESCONHECIDO, criarPessoas } from './pessoas'
import type { DependenciasDePessoas } from './pessoas'

function montar(sobrepor: Partial<DependenciasDePessoas> = {}) {
  const base: DependenciasDePessoas = {
    jogadores: () => [{ peerId: 'pa', apelido: 'Alex' }],
    euNaCall: () => true,
    comigo: () => ['pa'],
    meuApelido: () => 'Bruno',
    minhaFoto: () => undefined,
    meuMicrofoneMudo: () => false,
    euSemMicrofone: () => false,
  }
  return criarPessoas({ ...base, ...sobrepor })
}

describe('criarPessoas — o nome', () => {
  it('tira o apelido do estado do jogo, e não do que o remetente escreveu', () => {
    // É isto que impede alguém de se passar por outro no chat.
    expect(montar().apelidoDe('pa')).toBe('Alex')
  })

  it('quem falou antes do primeiro retrato do anfitrião ganha um genérico', () => {
    // Mostrar um peerId cru seria pior: não diz nada e parece defeito.
    expect(montar().apelidoDe('desconhecido')).toBe(APELIDO_DESCONHECIDO)
  })

  it('jogador sem apelido também cai no genérico', () => {
    const p = montar({ jogadores: () => [{ peerId: 'pa', apelido: '' }] })

    expect(p.apelidoDe('pa')).toBe(APELIDO_DESCONHECIDO)
  })
})

describe('criarPessoas — foto e selo', () => {
  it('a foto guardada chega à fonte', () => {
    const p = montar()

    p.guardarFoto('pa', 'data:image/png;base64,zzz')

    expect(p.fonte().fotos.get('pa')).toBe('data:image/png;base64,zzz')
  })

  it('esquecer tira foto E selo', () => {
    // Sem isto, a foto de quem saiu ficaria guardada até a aba fechar — e
    // reapareceria se outra pessoa herdasse o mesmo id.
    const p = montar()
    p.guardarFoto('pa', 'data:image/png;base64,zzz')
    p.guardarSelo('pa', 'AAAA1111')

    p.esquecer('pa')

    expect(p.fonte().fotos.has('pa')).toBe(false)
    expect(p.fonte().selos.has('pa')).toBe(false)
  })

  it('esquecer quem nunca existiu não estoura', () => {
    expect(() => montar().esquecer('fantasma')).not.toThrow()
  })
})

describe('criarPessoas — quem está falando', () => {
  it('liga e desliga', () => {
    const p = montar()

    p.definirFalando('pa', true)
    expect(p.falando('pa')).toBe(true)

    p.definirFalando('pa', false)
    expect(p.falando('pa')).toBe(false)
  })

  it('sair da call apaga todo mundo', () => {
    // Ninguém está falando se ninguém está sendo medido — sem isto o anel de
    // alguém ficaria aceso para sempre.
    const p = montar()
    p.definirFalando('pa', true)
    p.definirFalando('pb', true)

    p.limparFalantes()

    expect(p.falando('pa')).toBe(false)
    expect(p.falando('pb')).toBe(false)
  })
})

describe('criarPessoas — a fonte', () => {
  it('lê o estado de AGORA, não o de quando foi montada', () => {
    // Ela é consultada no ritmo da fala, dez vezes por segundo.
    let naCall = false
    const p = montar({ euNaCall: () => naCall })

    expect(p.fonte().euNaCall).toBe(false)
    naCall = true
    expect(p.fonte().euNaCall).toBe(true)
  })

  it('leva o meu estado de microfone junto', () => {
    const p = montar({ meuMicrofoneMudo: () => true, euSemMicrofone: () => true })

    expect(p.fonte().meuMicrofoneMudo).toBe(true)
    expect(p.fonte().euSemMicrofone).toBe(true)
  })

  it('monta os participantes a partir dela', () => {
    const p = montar()

    const gente = p.participantes()

    // Eu e quem está comigo no canal.
    expect(gente.map((x) => x.nome)).toContain('Bruno')
    expect(gente.map((x) => x.nome)).toContain('Alex')
  })
})
