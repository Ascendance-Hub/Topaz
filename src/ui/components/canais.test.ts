// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarCanais } from './canais'
import type { Participante } from './participantes'

const pessoa = (nome: string, extra: Partial<Participante> = {}): Participante =>
  ({ peerId: nome.toLowerCase(), nome, ...extra })

const canais = [
  { id: 'principal', nome: 'Principal', gente: [pessoa('Ana'), pessoa('Bia'), pessoa('Caio')] },
  { id: 'segundo', nome: 'Canal 2', gente: [pessoa('Dan')] },
]

const item = (a: HTMLElement, id: string) =>
  a.querySelector<HTMLButtonElement>(`[data-canal="${id}"]`)!

describe('renderizarCanais', () => {
  it('mostra os canais que existem, com quantas pessoas há em cada', () => {
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    expect(area.querySelectorAll('[data-canal]')).toHaveLength(2)
    expect(item(area, 'principal').textContent).toContain('3')
  })

  it('lista QUEM está em cada canal, que é o que decide para onde ir', () => {
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    const nomes = [...area.querySelectorAll('.canal-pessoa-nome')].map((n) => n.textContent)
    expect(nomes).toEqual(['Ana', 'Bia', 'Caio', 'Dan'])
  })

  it('mostra as pessoas de um canal em que eu NÃO estou', () => {
    // É metade do motivo de a sala ser uma só: dá para ver com quem se vai
    // falar antes de trocar.
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })
    const outro = area.querySelector('[data-canal="segundo"]')!.parentElement!

    expect(outro.querySelector('.canal-pessoa-nome')!.textContent).toBe('Dan')
  })

  it('marca onde eu estou', () => {
    const area = renderizarCanais(canais, 'segundo', { mudar: vi.fn() })

    expect(item(area, 'segundo').getAttribute('aria-current')).toBe('true')
    expect(item(area, 'principal').getAttribute('aria-current')).toBeNull()
  })

  it('clicar avisa para qual canal ir', () => {
    const mudar = vi.fn()
    const area = renderizarCanais(canais, 'principal', { mudar })

    item(area, 'segundo').click()

    expect(mudar).toHaveBeenCalledWith('segundo')
  })

  it('o canal em que estou continua clicável', () => {
    // Um botão desabilitado some da ordem de tabulação, e quem navega por
    // teclado perde a referência de onde está.
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    expect(item(area, 'principal').disabled).toBe(false)
  })

  it('quem lê por leitor de tela recebe as três informações', () => {
    const area = renderizarCanais(canais, 'segundo', { mudar: vi.fn() })

    const rotulo = item(area, 'segundo').getAttribute('aria-label')!
    expect(rotulo).toContain('Canal 2')
    expect(rotulo).toContain('1 pessoa')
    expect(rotulo).toContain('você está aqui')
  })

  it('o plural acompanha a contagem', () => {
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    expect(item(area, 'principal').getAttribute('aria-label')).toContain('3 pessoas')
  })
})

describe('as pessoas na lista', () => {
  it('quem tem foto aparece com ela', () => {
    const foto = 'data:image/png;base64,AAAA'
    const area = renderizarCanais(
      [{ id: 'principal', nome: 'Principal', gente: [pessoa('Ana', { foto })] }],
      'principal', { mudar: vi.fn() },
    )

    expect(area.querySelector('img')!.src).toBe(foto)
  })

  it('quem não tem foto aparece com a inicial', () => {
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    expect(area.querySelector('.canal-pessoa-circulo')!.textContent).toBe('A')
  })

  it('a foto não é anunciada duas vezes por leitor de tela', () => {
    // O nome está logo ao lado; um `alt` com o nome faria o leitor repetir.
    const area = renderizarCanais(
      [{ id: 'principal', nome: 'Principal', gente: [pessoa('Ana', { foto: 'data:image/png;base64,A' })] }],
      'principal', { mudar: vi.fn() },
    )

    expect(area.querySelector('img')!.alt).toBe('')
  })

  it('quem está falando fica marcado', () => {
    const area = renderizarCanais(
      [{ id: 'principal', nome: 'Principal', gente: [pessoa('Ana', { falando: true })] }],
      'principal', { mudar: vi.fn() },
    )

    expect(area.querySelector('.canal-pessoa')!.getAttribute('data-falando')).toBe('1')
  })

  it('eu fico marcado, para me achar na lista', () => {
    const area = renderizarCanais(
      [{ id: 'principal', nome: 'Principal', gente: [pessoa('Eu', { euMesmo: true })] }],
      'principal', { mudar: vi.fn() },
    )

    expect(area.querySelector('.canal-pessoa')!.getAttribute('data-eu')).toBe('1')
  })
})

describe('abrir um canal novo', () => {
  it('o botão aparece quando ainda há espaço', () => {
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn(), abrir: vi.fn() })

    expect(item(area, 'novo')).not.toBeNull()
  })

  it('clicar abre e vai para lá', () => {
    const abrir = vi.fn()
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn(), abrir })

    item(area, 'novo').click()

    expect(abrir).toHaveBeenCalled()
  })

  it('sem espaço, o botão não existe', () => {
    // Um "+" que não abre nada seria um botão que engana.
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    expect(area.querySelector('[data-canal="novo"]')).toBeNull()
  })

  it('nenhum canal vazio aparece na lista', () => {
    // Um canal sem gente não existe: quem quiser um novo abre.
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn(), abrir: vi.fn() })

    expect(area.textContent).not.toContain('vazio')
  })
})

describe('a foto na lista passa pelo mesmo portão', () => {
  it('recusa endereço que não é foto nossa', () => {
    const area = renderizarCanais(
      [{ id: 'principal', nome: 'Principal', gente: [pessoa('Ana', { foto: 'https://exemplo.com/x.png' })] }],
      'principal', { mudar: vi.fn() },
    )

    expect(area.querySelector('img')).toBeNull()
    expect(area.querySelector('.canal-pessoa-circulo')!.textContent).toBe('A')
  })
})
