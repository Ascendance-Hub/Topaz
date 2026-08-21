// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarControlesCall } from './call'
import type { EstadoCall } from '../../call/protocolo'

function estado(extras: Partial<EstadoCall> = {}): EstadoCall {
  return {
    euNaCall: false, euCompartilhando: false, naCall: [],
    compartilhando: [], assistindo: [], assistidoPor: [], ...extras,
  }
}

const acoes = () => ({
  entrar: vi.fn(), sair: vi.fn(), compartilhar: vi.fn(),
  pararTela: vi.fn(), assistir: vi.fn(), pararDeAssistir: vi.fn(),
})

describe('controles da call', () => {
  it('fora da call, oferece entrar', () => {
    const controles = renderizarControlesCall(estado(), acoes())

    expect(controles.querySelector('[data-call="entrar"]')).not.toBeNull()
    expect(controles.querySelector('[data-call="sair"]')).toBeNull()
  })

  it('na call, oferece sair', () => {
    const controles = renderizarControlesCall(estado({ euNaCall: true }), acoes())

    expect(controles.querySelector('[data-call="sair"]')).not.toBeNull()
    expect(controles.querySelector('[data-call="entrar"]')).toBeNull()
  })

  it('entrar chama a ação', () => {
    const a = acoes()
    const controles = renderizarControlesCall(estado(), a)

    controles.querySelector<HTMLButtonElement>('[data-call="entrar"]')!.click()

    expect(a.entrar).toHaveBeenCalled()
  })

  it('sair chama a ação', () => {
    const a = acoes()
    const controles = renderizarControlesCall(estado({ euNaCall: true }), a)

    controles.querySelector<HTMLButtonElement>('[data-call="sair"]')!.click()

    expect(a.sair).toHaveBeenCalled()
  })

  it('mostra quantas pessoas estão na call, contando você', () => {
    const controles = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa', 'pb'] }), acoes())

    expect(controles.querySelector('.call-contagem')!.textContent).toContain('3')
  })

  it('fora da call, não anuncia contagem nenhuma', () => {
    const controles = renderizarControlesCall(estado({ naCall: ['pa'] }), acoes())

    expect(controles.querySelector('.call-contagem')).toBeNull()
  })
})

describe('controles de tela', () => {
  it('na call, oferece compartilhar a tela', () => {
    const c = renderizarControlesCall(estado({ euNaCall: true }), acoes())

    expect(c.querySelector('[data-call="compartilhar"]')).not.toBeNull()
  })

  it('fora da call, não oferece compartilhar', () => {
    const c = renderizarControlesCall(estado(), acoes())

    expect(c.querySelector('[data-call="compartilhar"]')).toBeNull()
  })

  it('compartilhando, oferece parar', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), acoes())

    expect(c.querySelector('[data-call="parar-tela"]')).not.toBeNull()
    expect(c.querySelector('[data-call="compartilhar"]')).toBeNull()
  })

  it('oferece assistir a tela de quem está compartilhando', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa'], compartilhando: ['pa'] }), acoes())

    expect(c.querySelector('[data-assistir="pa"]')).not.toBeNull()
  })

  it('clicar em assistir pede a tela daquele peer', () => {
    const a = acoes()
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa'], compartilhando: ['pa'] }), a)

    c.querySelector<HTMLButtonElement>('[data-assistir="pa"]')!.click()

    expect(a.assistir).toHaveBeenCalledWith('pa')
  })

  it('já assistindo, oferece parar de assistir', () => {
    const a = acoes()
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa'], compartilhando: ['pa'], assistindo: ['pa'] }), a)

    c.querySelector<HTMLButtonElement>('[data-parar-assistir="pa"]')!.click()

    expect(a.pararDeAssistir).toHaveBeenCalledWith('pa')
  })

  it('avisa quando ninguém está assistindo, porque aí o codificador está desligado', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true, assistidoPor: [] }), acoes())

    expect(c.querySelector('.call-sem-espectador')).not.toBeNull()
  })

  it('não avisa quando há espectador', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true, assistidoPor: ['pb'] }), acoes())

    expect(c.querySelector('.call-sem-espectador')).toBeNull()
  })
})
