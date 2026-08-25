// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import {
  AVISO_EM_ANDAMENTO, AVISO_SO_ANFITRIAO, renderizarConfigPartida,
} from './config-partida'
import { CONFIG_PADRAO } from '../../game/rules'

const dados = (extras = {}) => ({
  config: { ...CONFIG_PADRAO }, souHost: true, emAndamento: false, ...extras,
})

const campo = (a: HTMLElement, chave: string) =>
  a.querySelector<HTMLInputElement>(`[data-partida="${chave}"]`)!

const enviar = (a: HTMLElement) =>
  a.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

describe('quem pode mexer', () => {
  it('o anfitrião, com a mesa parada, edita tudo', () => {
    const area = renderizarConfigPartida(dados(), vi.fn())

    expect(campo(area, 'fichasIniciais').disabled).toBe(false)
    expect(area.querySelector('[data-partida="salvar"]')).not.toBeNull()
  })

  it('quem não é anfitrião VÊ os valores, mas não muda', () => {
    // Esconder faria a mesa parecer arbitrária: a pessoa precisa saber com que
    // regras está jogando.
    const area = renderizarConfigPartida(dados({ souHost: false }), vi.fn())

    expect(campo(area, 'fichasIniciais').value).toBe(String(CONFIG_PADRAO.fichasIniciais))
    expect(campo(area, 'fichasIniciais').disabled).toBe(true)
    expect(area.querySelector('[data-partida="salvar"]')).toBeNull()
  })

  it('diz POR QUE não pode, não só que não pode', () => {
    // "Não pode" sem porquê parece capricho.
    const naoHost = renderizarConfigPartida(dados({ souHost: false }), vi.fn())
    expect(campo(naoHost, 'aviso').textContent).toBe(AVISO_SO_ANFITRIAO)

    const jogando = renderizarConfigPartida(dados({ emAndamento: true }), vi.fn())
    expect(campo(jogando, 'aviso').textContent).toBe(AVISO_EM_ANDAMENTO)
  })

  it('com a partida em andamento, nem o anfitrião muda', () => {
    const area = renderizarConfigPartida(dados({ emAndamento: true }), vi.fn())

    expect(campo(area, 'alvo').disabled).toBe(true)
    expect(area.querySelector('[data-partida="salvar"]')).toBeNull()
  })

  it('enviar sem poder mexer não avisa ninguém', () => {
    const salvar = vi.fn()
    const area = renderizarConfigPartida(dados({ souHost: false }), salvar)

    enviar(area)

    expect(salvar).not.toHaveBeenCalled()
  })
})

describe('salvar o formato', () => {
  it('entrega os quatro valores', () => {
    const salvar = vi.fn()
    const area = renderizarConfigPartida(dados(), salvar)
    campo(area, 'fichasIniciais').value = '2000'
    campo(area, 'apostaMax').value = '400'
    campo(area, 'segundosTurno').value = '45'
    campo(area, 'alvo').value = '6000'

    enviar(area)

    expect(salvar).toHaveBeenCalledWith({
      fichasIniciais: 2000, apostaMax: 400, segundosTurno: 45, alvo: 6000,
    })
  })

  it('valor impossível é encaixado antes de sair da tela', () => {
    // Sem isto o campo aceitaria algo que o motor recusaria, e a tela mostraria
    // uma coisa enquanto a partida usa outra.
    const salvar = vi.fn()
    const area = renderizarConfigPartida(dados(), salvar)
    campo(area, 'fichasIniciais').value = '500'
    campo(area, 'apostaMax').value = '99999'

    enviar(area)

    expect(salvar.mock.calls[0]![0].apostaMax).toBeLessThanOrEqual(500)
  })
})

describe('jogar até sobrar um', () => {
  it('marcar apaga o campo de alvo', () => {
    // O campo não some: some o sentido dele. Deixá-lo visível mostra ao que se
    // volta ao desmarcar.
    const area = renderizarConfigPartida(dados(), vi.fn())
    const semAlvo = campo(area, 'sem-alvo')

    semAlvo.checked = true
    semAlvo.dispatchEvent(new Event('change'))

    expect(campo(area, 'alvo').disabled).toBe(true)
  })

  it('marcado, o alvo sai nulo', () => {
    const salvar = vi.fn()
    const area = renderizarConfigPartida(dados(), salvar)
    const semAlvo = campo(area, 'sem-alvo')
    semAlvo.checked = true
    semAlvo.dispatchEvent(new Event('change'))

    enviar(area)

    expect(salvar.mock.calls[0]![0].alvo).toBeNull()
  })

  it('já configurado sem alvo, a caixa nasce marcada', () => {
    const area = renderizarConfigPartida(
      dados({ config: { ...CONFIG_PADRAO, alvo: null } }), vi.fn())

    expect(campo(area, 'sem-alvo').checked).toBe(true)
    expect(campo(area, 'alvo').disabled).toBe(true)
  })
})

describe('o que a tela avisa', () => {
  it('diz que mudar fichas não dá dinheiro a ninguém agora', () => {
    // Seria uma forma de o anfitrião premiar quem ele quisesse.
    const area = renderizarConfigPartida(dados(), vi.fn())

    expect(area.textContent).toContain('próxima partida')
  })
})
