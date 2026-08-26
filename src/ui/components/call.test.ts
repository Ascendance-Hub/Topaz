// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarControlesCall } from './call'
import type { EstadoCall } from '../../call/protocolo'
import { CANAL_PADRAO } from '../../call/protocolo'

function estado(extras: Partial<EstadoCall> = {}): EstadoCall {
  return {
    euNaCall: false, euCompartilhando: false, naCall: [],
    meuCanal: CANAL_PADRAO, comigo: [], porCanal: [], podeAbrirCanal: false,
    compartilhando: [], assistindo: [], assistidoPor: [], ...extras,
  }
}

const acoes = () => ({
  entrar: vi.fn(), sair: vi.fn(), compartilhar: vi.fn(),
  pararTela: vi.fn(), assistir: vi.fn(), pararDeAssistir: vi.fn(),
  definirQualidade: vi.fn(), definirTipoConteudo: vi.fn(),
  alternarMeuMicrofone: vi.fn(), alternarSilenciarTodos: vi.fn(),
  trocarMicrofone: vi.fn(), tentarMicrofone: vi.fn(), trocarSaida: vi.fn(),
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

  it('conta quem está NO MEU CANAL, contando você', () => {
    // O número descreve a conversa de que eu faço parte. Quem está noutro
    // canal continua na sala, e aparece na lista de canais.
    const controles = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa', 'pb', 'pc'], comigo: ['pa', 'pb'] }),
      acoes())

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

describe('seletor de microfone', () => {
  const doisMicrofones = [
    { id: 'padrao', nome: 'Padrão do sistema' },
    { id: 'fone', nome: 'Fone USB' },
  ]

  it('aparece na call quando há mais de um microfone', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true }), acoes(), 720, 'motion',
      { apelidoDe: (i) => i, microfones: doisMicrofones })

    expect(c.querySelector('[data-call="microfone"]')).not.toBeNull()
  })

  it('não aparece com um microfone só, que não há o que escolher', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true }), acoes(), 720, 'motion',
      { apelidoDe: (i) => i, microfones: [doisMicrofones[0]!] })

    expect(c.querySelector('[data-call="microfone"]')).toBeNull()
  })

  it('não aparece fora da call', () => {
    const c = renderizarControlesCall(
      estado(), acoes(), 720, 'motion',
      { apelidoDe: (i) => i, microfones: doisMicrofones })

    expect(c.querySelector('[data-call="microfone"]')).toBeNull()
  })

  it('mostra os nomes dos aparelhos', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true }), acoes(), 720, 'motion',
      { apelidoDe: (i) => i, microfones: doisMicrofones })

    const opcoes = [...c.querySelectorAll('[data-call="microfone"] option')]
    expect(opcoes.map((o) => o.textContent)).toEqual(['Padrão do sistema', 'Fone USB'])
  })

  it('nasce no aparelho em uso', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true }), acoes(), 720, 'motion',
      { apelidoDe: (i) => i, microfones: doisMicrofones, microfoneAtual: 'fone' })

    expect(c.querySelector<HTMLSelectElement>('[data-call="microfone"]')!.value).toBe('fone')
  })

  it('trocar pede o aparelho novo', () => {
    const a = acoes()
    const c = renderizarControlesCall(
      estado({ euNaCall: true }), a, 720, 'motion',
      { apelidoDe: (i) => i, microfones: doisMicrofones, microfoneAtual: 'padrao' })
    const select = c.querySelector<HTMLSelectElement>('[data-call="microfone"]')!

    select.value = 'fone'
    select.dispatchEvent(new Event('change'))

    expect(a.trocarMicrofone).toHaveBeenCalledWith('fone')
  })
})

describe('microfone que não abriu', () => {
  const semMic = 'O navegador bloqueou o microfone.'
  const naCall = () => estado({ euNaCall: true })
  const ctx = (extras = {}) => ({ apelidoDe: (id: string) => id, ...extras })

  it('diz o motivo em vez de deixar a pessoa no escuro', () => {
    // O defeito que isto conserta: negar a permissão matava o botão em
    // silêncio. Entrar sem microfone é aceitável; entrar sem saber, não.
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion', ctx({ semMicrofone: semMic }))

    expect(barra.querySelector('.call-sem-microfone')!.textContent).toContain(semMic)
  })

  it('oferece tentar de novo, que é a ação que resolve', () => {
    const a = acoes()
    const barra = renderizarControlesCall(
      naCall(), a, 1080, 'motion', ctx({ semMicrofone: semMic }))

    barra.querySelector<HTMLButtonElement>('[data-call="tentar-microfone"]')!.click()

    expect(a.tentarMicrofone).toHaveBeenCalled()
  })

  it('esconde o botão de mutar, que não tem o que mutar', () => {
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion', ctx({ semMicrofone: semMic }))

    expect(barra.querySelector('[data-call="meu-microfone"]')).toBeNull()
  })

  it('com microfone funcionando, nada disso aparece', () => {
    const barra = renderizarControlesCall(naCall(), acoes(), 1080, 'motion', ctx())

    expect(barra.querySelector('.call-sem-microfone')).toBeNull()
    expect(barra.querySelector('[data-call="meu-microfone"]')).not.toBeNull()
  })

  it('quem está sem microfone continua podendo sair e ouvir', () => {
    // Entrar só ouvindo tem que ser uma call de verdade, não uma tela morta.
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion', ctx({ semMicrofone: semMic }))

    expect(barra.querySelector('[data-call="sair"]')).not.toBeNull()
    expect(barra.querySelector('[data-call="silenciar-todos"]')).not.toBeNull()
  })
})

describe('seletor de saída de áudio', () => {
  const duas = [{ id: 'a', nome: 'Alto-falante' }, { id: 'b', nome: 'Fone' }]
  const naCall = () => estado({ euNaCall: true })
  const ctx = (extras = {}) => ({ apelidoDe: (id: string) => id, ...extras })

  it('não aparece com uma saída só — não há o que escolher', () => {
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion', ctx({ saidas: [duas[0]] }))

    expect(barra.querySelector('[data-call="saida"]')).toBeNull()
  })

  it('não aparece quando o navegador não sabe trocar', () => {
    // `main.ts` simplesmente não passa a lista nesse caso. Um seletor que a
    // pessoa mexe e não muda nada faz ela achar que o site quebrou.
    const barra = renderizarControlesCall(naCall(), acoes(), 1080, 'motion', ctx())

    expect(barra.querySelector('[data-call="saida"]')).toBeNull()
  })

  it('lista as saídas e marca a atual', () => {
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion', ctx({ saidas: duas, saidaAtual: 'b' }))
    const seletor = barra.querySelector<HTMLSelectElement>('[data-call="saida"]')!

    expect([...seletor.options].map((o) => o.textContent)).toEqual(['Alto-falante', 'Fone'])
    expect(seletor.value).toBe('b')
  })

  it('escolher avisa quem monta', () => {
    const a = acoes()
    const barra = renderizarControlesCall(
      naCall(), a, 1080, 'motion', ctx({ saidas: duas, saidaAtual: 'a' }))
    const seletor = barra.querySelector<HTMLSelectElement>('[data-call="saida"]')!

    seletor.value = 'b'
    seletor.dispatchEvent(new Event('change'))

    expect(a.trocarSaida).toHaveBeenCalledWith('b')
  })

  it('nunca interpreta o nome do aparelho como HTML', () => {
    // O nome vem do sistema operacional, não de nós.
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion',
      ctx({ saidas: [{ id: 'a', nome: malicioso }, duas[1]] }))

    expect(barra.querySelector('img')).toBeNull()
    expect(barra.querySelector<HTMLSelectElement>('[data-call="saida"]')!
      .options[0]!.textContent).toBe(malicioso)
  })

  it('aparece mesmo para quem está sem microfone', () => {
    // É justamente quem entrou só ouvindo que mais precisa escolher para ONDE
    // está ouvindo.
    const barra = renderizarControlesCall(
      naCall(), acoes(), 1080, 'motion',
      ctx({ saidas: duas, semMicrofone: 'bloqueado' }))

    expect(barra.querySelector('[data-call="saida"]')).not.toBeNull()
  })
})
