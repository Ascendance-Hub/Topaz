// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { EU, inicialDe, montarParticipantes, renderizarParticipantes } from './participantes'

const alguem = (extras = {}) => ({ peerId: 'pa', nome: 'Alex', ...extras })

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

describe('renderizarParticipantes', () => {
  it('não mostra nada quando não há ninguém', () => {
    expect(renderizarParticipantes([]).querySelector('.participante')).toBeNull()
  })

  it('dá uma peça por pessoa, com nome e inicial', () => {
    const area = renderizarParticipantes([
      alguem(), alguem({ peerId: 'pb', nome: 'Bruno' }),
    ])

    const pecas = [...area.querySelectorAll('.participante')]
    expect(pecas).toHaveLength(2)
    expect(pecas[0]!.textContent).toContain('Alex')
    expect(pecas[0]!.querySelector('.participante-inicial')!.textContent).toBe('A')
  })

  it('marca quem está falando', () => {
    const area = renderizarParticipantes([
      alguem({ falando: true }), alguem({ peerId: 'pb', nome: 'Bruno' }),
    ])

    const pecas = [...area.querySelectorAll<HTMLElement>('.participante')]
    expect(pecas[0]!.dataset['falando']).toBe('1')
    expect(pecas[1]!.dataset['falando']).toBe('0')
  })

  it('marca você, para se achar na fileira', () => {
    const area = renderizarParticipantes([alguem({ euMesmo: true })])

    expect(area.querySelector<HTMLElement>('.participante')!.dataset['eu']).toBe('1')
  })

  it('mostra quem está mudo', () => {
    const area = renderizarParticipantes([alguem({ mudo: true })])

    expect(area.querySelector<HTMLElement>('.participante')!.dataset['mudo']).toBe('1')
  })

  it('mostra quem entrou só ouvindo, que é diferente de estar mudo', () => {
    // Mudo é escolha e se desfaz num clique. Sem microfone é impedimento, e
    // insistir em falar com essa pessoa não adianta.
    const area = renderizarParticipantes([alguem({ semMicrofone: true })])
    const peca = area.querySelector<HTMLElement>('.participante')!

    expect(peca.dataset['semMicrofone']).toBe('1')
    expect(peca.getAttribute('title')).toContain('ouvindo')
  })

  it('cada peça é identificável pelo peerId', () => {
    const area = renderizarParticipantes([alguem()])

    expect(area.querySelector<HTMLElement>('.participante')!.dataset['de']).toBe('pa')
  })

  it('nunca interpreta o apelido como HTML', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const area = renderizarParticipantes([alguem({ nome: malicioso })])

    expect(area.querySelector('img')).toBeNull()
    expect(area.textContent).toContain(malicioso)
  })

  it('quem lê por leitor de tela também sabe quem está falando', () => {
    // O anel é cor e movimento; sozinho ele não existe para quem não vê.
    const area = renderizarParticipantes([alguem({ falando: true })])

    expect(area.querySelector('.participante')!.getAttribute('aria-label'))
      .toContain('falando')
  })
})

describe('foto de perfil', () => {
  const foto = 'data:image/jpeg;base64,AAAA'

  it('mostra a foto no lugar da inicial', () => {
    const area = renderizarParticipantes([alguem({ foto })])

    expect(area.querySelector<HTMLImageElement>('.participante-foto')!.src).toBe(foto)
    expect(area.querySelector('.participante-inicial')).toBeNull()
  })

  it('sem foto, continua a inicial — ninguém fica com um círculo vazio', () => {
    const area = renderizarParticipantes([alguem()])

    expect(area.querySelector('.participante-inicial')!.textContent).toBe('A')
    expect(area.querySelector('.participante-foto')).toBeNull()
  })

  it('a foto tem texto alternativo com o nome', () => {
    const area = renderizarParticipantes([alguem({ foto })])

    expect(area.querySelector('.participante-foto')!.getAttribute('alt'))
      .toContain('Alex')
  })

  it('recusa foto que não passou pelo portão', () => {
    // Segunda linha de defesa. `main.ts` já valida o que chega da rede, mas
    // este componente não deve confiar em quem o chama: basta um caminho novo
    // esquecer a validação para virar `<img src>` com endereço de terceiro.
    const area = renderizarParticipantes([alguem({ foto: 'https://exemplo.com/x.png' })])

    expect(area.querySelector('.participante-foto')).toBeNull()
    expect(area.querySelector('.participante-inicial')!.textContent).toBe('A')
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
