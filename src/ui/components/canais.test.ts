// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarCanais } from './canais'

const canais = [
  { id: 'principal', nome: 'Principal', pessoas: 3 },
  { id: 'segundo', nome: 'Canal 2', pessoas: 1 },
]

const item = (a: HTMLElement, id: string) =>
  a.querySelector<HTMLButtonElement>(`[data-canal="${id}"]`)!

describe('renderizarCanais', () => {
  it('mostra os canais que existem, com quantas pessoas há em cada', () => {
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn() })

    expect(area.querySelectorAll('[data-canal]')).toHaveLength(2)
    expect(item(area, 'principal').textContent).toContain('3')
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
    // A pílula diz visualmente: qual canal, quantos, e se é onde eu estou.
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

  it('o "+" sozinho não diz o que acontece — o rótulo diz', () => {
    // E o que acontece é ir para lá, não só criar.
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn(), abrir: vi.fn() })

    expect(item(area, 'novo').getAttribute('aria-label')).toContain('ir para ele')
  })

  it('nenhum canal vazio aparece na fileira', () => {
    // Um canal sem gente não existe: quem quiser um novo abre.
    const area = renderizarCanais(canais, 'principal', { mudar: vi.fn(), abrir: vi.fn() })

    expect(area.textContent).not.toContain('vazio')
  })
})
