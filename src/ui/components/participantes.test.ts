// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { EU, inicialDe, montarParticipantes } from './participantes'


describe('inicialDe', () => {
  it('pega a primeira letra, em maiúscula', () => {
    expect(inicialDe('alex')).toBe('A')
  })

  it('não parte um emoji ao meio', () => {
    // `nome[0]` num emoji devolve meia dupla substituta e desenha o losango
    // preto de caractere inválido. O apelido vem de outra pessoa, e emoji em
    // apelido é comum.
    expect(inicialDe('🎩 Alex')).toBe('🎩')
  })

  it('nome vazio não vira um círculo em branco', () => {
    expect(inicialDe('')).toBe('?')
    expect(inicialDe('   ')).toBe('?')
  })
})

describe('montarParticipantes', () => {
  const base = () => ({
    euNaCall: true,
    naCall: [] as string[],
    meuApelido: 'Alex',
    meuMicrofoneMudo: false,
    euSemMicrofone: false,
    falantes: new Set<string>(),
    fotos: new Map<string, string>(),
    selos: new Map<string, string>(),
    apelidoDe: (id: string) => `nome-${id}`,
  })

  it('fora da call, a fileira não existe', () => {
    // Os outros continuam na SALA. Mostrá-los numa fileira de call mentiria
    // sobre o que aquele espaço representa.
    expect(montarParticipantes({ ...base(), euNaCall: false, naCall: ['pa'] })).toEqual([])
  })

  it('eu venho primeiro — é o rosto que a pessoa procura para se achar', () => {
    const lista = montarParticipantes({ ...base(), naCall: ['pa', 'pb'] })

    expect(lista[0]!.euMesmo).toBe(true)
    expect(lista.map((p) => p.peerId)).toEqual([EU, 'pa', 'pb'])
  })

  it('cada pessoa leva o próprio apelido, foto, selo e fala', () => {
    const lista = montarParticipantes({
      ...base(),
      naCall: ['pa'],
      falantes: new Set(['pa']),
      fotos: new Map([['pa', 'data:image/png;base64,AA']]),
      selos: new Map([['pa', 'K7X2QW9F']]),
    })

    expect(lista[1]).toMatchObject({
      nome: 'nome-pa', falando: true, selo: 'K7X2QW9F',
      foto: 'data:image/png;base64,AA',
    })
  })

  it('só EU carrego estado de microfone', () => {
    // O estado dos outros não trafega, e deduzi-lo do silêncio mentiria sobre
    // quem está apenas calado.
    const lista = montarParticipantes({
      ...base(), naCall: ['pa'], meuMicrofoneMudo: true, euSemMicrofone: true,
    })

    expect(lista[0]).toMatchObject({ mudo: true, semMicrofone: true })
    expect(lista[1]!.mudo).toBeUndefined()
    expect(lista[1]!.semMicrofone).toBeUndefined()
  })

  it('a minha fala usa a chave própria, não o peerId', () => {
    const lista = montarParticipantes({ ...base(), falantes: new Set([EU]) })

    expect(lista[0]!.falando).toBe(true)
  })

  it('a minha foto vem de fora do mapa da rede', () => {
    // Eu nunca recebo a minha própria foto pela rede.
    const lista = montarParticipantes({ ...base(), minhaFoto: 'data:image/png;base64,BB' })

    expect(lista[0]!.foto).toBe('data:image/png;base64,BB')
  })
})
