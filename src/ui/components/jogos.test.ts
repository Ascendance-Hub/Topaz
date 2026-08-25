// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { JOGOS, POR_VIR, renderizarJogos } from './jogos'

describe('renderizarJogos', () => {
  it('mostra o que dá para jogar, com o que a pessoa precisa saber antes', () => {
    const area = renderizarJogos(vi.fn())
    const cartao = area.querySelector('[data-jogo="blackjack"]')!

    expect(cartao.querySelector('.jogo-nome')!.textContent).toBe('Blackjack')
    expect(cartao.textContent).toContain('7')
  })

  it('abrir a mesa avisa qual jogo', () => {
    const abrir = vi.fn()
    const area = renderizarJogos(abrir)

    area.querySelector<HTMLButtonElement>('[data-abrir="blackjack"]')!.click()

    expect(abrir).toHaveBeenCalledWith('blackjack')
  })

  it('o que ainda não existe NÃO é clicável', () => {
    // A saída fácil seria cartões clicáveis de jogos que não existem. A pessoa
    // clica, nada acontece, e conclui que o site está quebrado.
    const area = renderizarJogos(vi.fn())
    const porVir = area.querySelectorAll('.jogo-por-vir')

    expect(porVir).toHaveLength(POR_VIR.length)
    for (const cartao of porVir) {
      expect(cartao.querySelector('button')).toBeNull()
      expect(cartao.getAttribute('aria-disabled')).toBe('true')
    }
  })

  it('o que ainda não existe não conta como jogo', () => {
    // Sem `data-jogo`, nenhum código futuro que percorra a galeria tropeça
    // num aviso achando que é jogo.
    const area = renderizarJogos(vi.fn())

    expect(area.querySelectorAll('[data-jogo]')).toHaveLength(JOGOS.length)
  })

  it('cada promessa diz que é promessa', () => {
    const area = renderizarJogos(vi.fn())

    expect(area.querySelector('.jogo-por-vir')!.textContent).toContain('em breve')
  })
})
