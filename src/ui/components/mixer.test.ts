// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarMixer, chaveVoz, chaveTela } from './mixer'

const canais = [
  { chave: chaveVoz('pa'), nome: 'Alex', volume: 1 },
  { chave: chaveTela('pa'), nome: 'Tela de Alex', volume: 0.4 },
]

describe('renderizarMixer', () => {
  it('não mostra nada quando não há o que ajustar', () => {
    const mixer = renderizarMixer([], vi.fn())

    // Um mixer vazio na tela é ruído: não há volume nenhum para mexer antes
    // de alguém entrar na call.
    expect(mixer.querySelector('input')).toBeNull()
  })

  it('dá um controle por canal, com o nome', () => {
    const mixer = renderizarMixer(canais, vi.fn())

    const linhas = [...mixer.querySelectorAll('.mixer-linha')]
    expect(linhas).toHaveLength(2)
    expect(linhas[0]!.textContent).toContain('Alex')
    expect(linhas[1]!.textContent).toContain('Tela de Alex')
  })

  it('separa voz e tela da mesma pessoa em canais diferentes', () => {
    // Assistir a tela de alguém com o som alto e a voz baixa é um caso real —
    // e o contrário também, quando o jogo está barulhento.
    expect(chaveVoz('pa')).not.toBe(chaveTela('pa'))
  })

  it('o controle nasce no volume atual', () => {
    const mixer = renderizarMixer(canais, vi.fn())

    const entradas = [...mixer.querySelectorAll<HTMLInputElement>('input')]
    expect(entradas[0]!.value).toBe('100')
    expect(entradas[1]!.value).toBe('40')
  })

  it('mexer no controle avisa com o volume de 0 a 1', () => {
    const mudou = vi.fn()
    const mixer = renderizarMixer(canais, mudou)
    const entrada = mixer.querySelector<HTMLInputElement>('input')!

    entrada.value = '25'
    entrada.dispatchEvent(new Event('input'))

    expect(mudou).toHaveBeenCalledWith(chaveVoz('pa'), 0.25)
  })

  it('nunca interpreta o nome como HTML', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const mixer = renderizarMixer([{ chave: chaveVoz('pa'), nome: malicioso, volume: 1 }], vi.fn())

    expect(mixer.querySelector('img')).toBeNull()
    expect(mixer.textContent).toContain(malicioso)
  })

  it('rotula cada controle para quem usa leitor de tela', () => {
    const mixer = renderizarMixer(canais, vi.fn())

    // Um `range` sem rótulo é anunciado como "controle deslizante, 100" e não
    // diz de quem é.
    expect(mixer.querySelector('input')!.getAttribute('aria-label')).toContain('Alex')
  })
})
