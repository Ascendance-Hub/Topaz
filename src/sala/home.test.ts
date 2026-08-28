// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** As salas de presença abrem conexão de verdade; nenhum caso aqui é sobre
 *  isso, e um teste que abre socket é lento quando funciona e intermitente
 *  quando não. */
const fechadas: string[] = []
vi.mock('../presenca/sala-de-fundo', () => ({
  abrirSalaDeFundo: vi.fn((codigo: string) => ({
    aoEntrarPeer: () => {}, aoSairPeer: () => {},
    sair: () => { fechadas.push(codigo) },
  })),
}))

vi.mock('../identidade/atual', () => ({
  identidadeAtual: vi.fn(() => Promise.resolve({ par: {}, selo: 'AAAA1111' })),
  entrarComSegredo: vi.fn(),
  sairDaIdentidade: vi.fn(),
}))

import { montarHome } from './home'
import { CHAVE_GRUPOS } from '../grupos/grupos'

const CODIGO_A = 'AAAABBBBCCCCDDDD'
const CODIGO_B = 'EEEEFFFFGGGGHHHH'

beforeEach(() => {
  fechadas.length = 0
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers() })

/**
 * As salas de fundo abrem ESPAÇADAS, uma a cada 900 ms — abrir todas de uma vez
 * trava a página de quem tem vários grupos. Sem avançar o relógio, nenhuma
 * chega a existir, e um teste de "fechou" mediria o nada.
 */
function deixarAsSalasAbrirem(): void {
  vi.advanceTimersByTime(10_000)
}

function comGrupos(...codigos: string[]) {
  localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(
    codigos.map((codigo, i) => ({ codigo, nome: `Grupo ${i}` }))))
}

describe('montarHome — a porta', () => {
  it('desenha a tela inicial', () => {
    const app = document.createElement('div')

    montarHome(app, () => {})

    expect(app.querySelector('.lobby')).not.toBeNull()
  })

  it('entrar numa sala fecha a observação da home ANTES de montar a sala', () => {
    // A ordem importa: as salas de presença têm id próprio, então isto não
    // protege contra colisão — protege contra pagar por uma contagem que
    // ninguém mais vê.
    vi.useFakeTimers()
    comGrupos(CODIGO_A)
    const ordem: string[] = []
    const app = document.createElement('div')
    montarHome(app, () => ordem.push('montou a sala'))
    deixarAsSalasAbrirem()

    const campo = app.querySelector<HTMLInputElement>('input[placeholder="Seu apelido"]')!
    campo.value = 'Alex'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
    ;[...app.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Criar sala')!.click()

    expect(ordem).toEqual(['montou a sala'])
    expect(fechadas).toContain(CODIGO_A)
  })
})

describe('montarHome — os grupos salvos', () => {
  it('observa todos eles já na abertura', () => {
    // Aqui pode começar na hora: não há sala se formando para competir.
    comGrupos(CODIGO_A, CODIGO_B)
    const app = document.createElement('div')

    montarHome(app, () => {})

    expect(app.querySelectorAll('[data-grupo]')).toHaveLength(2)
  })

  it('clicar num cartão sem apelido guardado leva o foco ao campo', () => {
    // O armazenamento pode ter sido limpo pela metade. O cartão não pode
    // simplesmente não fazer nada em silêncio.
    comGrupos(CODIGO_A)
    const app = document.createElement('div')
    document.body.replaceChildren(app)
    const entrou = vi.fn()
    montarHome(app, entrou)

    app.querySelector<HTMLButtonElement>(`[data-entrar="${CODIGO_A}"]`)!.click()

    expect(entrou).not.toHaveBeenCalled()
    expect(document.activeElement)
      .toBe(app.querySelector('input[placeholder="Seu apelido"]'))
  })

  it('com apelido guardado, o cartão entra direto', () => {
    // Quem tem grupos salvos já passou pela porta da frente pelo menos uma vez.
    comGrupos(CODIGO_A)
    // A mesma chave que o lobby usa.
    localStorage.setItem('topaz:apelido', 'Alex')
    const app = document.createElement('div')
    const entrou = vi.fn()
    montarHome(app, entrou)

    app.querySelector<HTMLButtonElement>(`[data-entrar="${CODIGO_A}"]`)!.click()

    expect(entrou).toHaveBeenCalledWith('Alex', CODIGO_A)
  })

  it('remover um grupo para de observá-lo na hora', () => {
    // Continuar segurando a sala dele seria pagar por uma contagem que ninguém
    // mais vê.
    vi.useFakeTimers()
    comGrupos(CODIGO_A, CODIGO_B)
    const app = document.createElement('div')
    montarHome(app, () => {})
    deixarAsSalasAbrirem()

    app.querySelector<HTMLButtonElement>(`[data-remover="${CODIGO_A}"]`)!.click()

    expect(fechadas).toContain(CODIGO_A)
    expect(fechadas).not.toContain(CODIGO_B)
    expect(app.querySelectorAll('[data-grupo]')).toHaveLength(1)
  })
})
