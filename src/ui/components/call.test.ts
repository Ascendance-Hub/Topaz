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
  definirQualidade: vi.fn(), definirTipoConteudo: vi.fn(),
  alternarMeuMicrofone: vi.fn(), alternarSilenciarTodos: vi.fn(),
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

describe('seletor de qualidade da tela', () => {
  it('só aparece quando você está compartilhando', () => {
    const semTela = renderizarControlesCall(estado({ euNaCall: true }), acoes())
    const comTela = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), acoes())

    expect(semTela.querySelector('[data-call="qualidade"]')).toBeNull()
    expect(comTela.querySelector('[data-call="qualidade"]')).not.toBeNull()
  })

  it('nasce na altura que está em uso', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), acoes(), 1080)

    expect(c.querySelector<HTMLSelectElement>('[data-call="qualidade"]')!.value).toBe('1080')
  })

  it('trocar a opção pede a nova altura', () => {
    const a = acoes()
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), a, 720)
    const select = c.querySelector<HTMLSelectElement>('[data-call="qualidade"]')!

    select.value = '1080'
    select.dispatchEvent(new Event('change'))

    expect(a.definirQualidade).toHaveBeenCalledWith(1080)
  })
})

describe('seletor de tipo de conteúdo', () => {
  it('só aparece para quem está compartilhando', () => {
    const semTela = renderizarControlesCall(estado({ euNaCall: true }), acoes())
    const comTela = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), acoes())

    expect(semTela.querySelector('[data-call="conteudo"]')).toBeNull()
    expect(comTela.querySelector('[data-call="conteudo"]')).not.toBeNull()
  })

  it('trocar pede o novo tipo', () => {
    const a = acoes()
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), a, 720, 'motion')
    const select = c.querySelector<HTMLSelectElement>('[data-call="conteudo"]')!

    select.value = 'detail'
    select.dispatchEvent(new Event('change'))

    expect(a.definirTipoConteudo).toHaveBeenCalledWith('detail')
  })

  it('nasce no tipo em uso', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), acoes(), 720, 'detail')

    expect(c.querySelector<HTMLSelectElement>('[data-call="conteudo"]')!.value).toBe('detail')
  })
})

describe('quem é quem nos botões de assistir', () => {
  const nomes = (id: string) => ({ pa: 'Zozizo', pb: 'Hadryanns' }[id] ?? id)

  it('diz de quem é a tela, para dois botões não ficarem idênticos', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa', 'pb'], compartilhando: ['pa', 'pb'] }),
      acoes(), 720, 'motion', { apelidoDe: nomes })

    expect(c.querySelector('[data-assistir="pa"]')!.textContent).toContain('Zozizo')
    expect(c.querySelector('[data-assistir="pb"]')!.textContent).toContain('Hadryanns')
  })

  it('diz de quem é ao parar de assistir também', () => {
    const c = renderizarControlesCall(
      estado({
        euNaCall: true, naCall: ['pa', 'pb'],
        compartilhando: ['pa', 'pb'], assistindo: ['pa', 'pb'],
      }),
      acoes(), 720, 'motion', { apelidoDe: nomes })

    expect(c.querySelector('[data-parar-assistir="pa"]')!.textContent).toContain('Zozizo')
    expect(c.querySelector('[data-parar-assistir="pb"]')!.textContent).toContain('Hadryanns')
  })
})

describe('controles de mudo', () => {
  it('na call, oferece mutar o próprio microfone', () => {
    const c = renderizarControlesCall(estado({ euNaCall: true }), acoes())

    expect(c.querySelector('[data-call="meu-microfone"]')).not.toBeNull()
  })

  it('fora da call, não oferece', () => {
    const c = renderizarControlesCall(estado(), acoes())

    expect(c.querySelector('[data-call="meu-microfone"]')).toBeNull()
  })

  it('o botão do microfone reflete o estado', () => {
    const mudo = renderizarControlesCall(
      estado({ euNaCall: true }), acoes(), 720, 'motion',
      { apelidoDe: (i) => i, meuMicrofoneMudo: true })

    expect(mudo.querySelector<HTMLElement>('[data-call="meu-microfone"]')!.dataset['mudo'])
      .toBe('1')
  })

  it('clicar alterna o próprio microfone', () => {
    const a = acoes()
    const c = renderizarControlesCall(estado({ euNaCall: true }), a)

    c.querySelector<HTMLButtonElement>('[data-call="meu-microfone"]')!.click()

    expect(a.alternarMeuMicrofone).toHaveBeenCalled()
  })

  it('oferece silenciar todo mundo', () => {
    const a = acoes()
    const c = renderizarControlesCall(estado({ euNaCall: true }), a)

    c.querySelector<HTMLButtonElement>('[data-call="silenciar-todos"]')!.click()

    expect(a.alternarSilenciarTodos).toHaveBeenCalled()
  })
})
