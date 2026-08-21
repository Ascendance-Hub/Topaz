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

const acoes = () => ({ entrar: vi.fn(), sair: vi.fn() })

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
