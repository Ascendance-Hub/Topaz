// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderizarConfiguracoes } from './configuracoes'
import { CONFIG_PADRAO } from '../../game/rules'

const CODIGO = 'K7X2QW9FM3PRTVN4'

const acoes = () => ({
  configurarPartida: vi.fn(),
  renomear: vi.fn(),
  salvarGrupo: vi.fn(),
  esquecerGrupo: vi.fn(),
  identidade: { entrarComSegredo: vi.fn(), sair: vi.fn(), guardei: vi.fn() },
})

const dados = (extras = {}) => ({
  apelido: 'Alex',
  codigo: CODIGO,
  grupo: null,
  identidade: null,
  partida: { config: { ...CONFIG_PADRAO }, souHost: true, emAndamento: false },
  ...extras,
})

const campo = (a: HTMLElement, chave: string) =>
  a.querySelector<HTMLInputElement>(`[data-config="${chave}"]`)!

beforeEach(() => localStorage.clear())

describe('você', () => {
  it('mostra o apelido atual, editável', () => {
    // Antes disto, o apelido só dava para escolher na porta de entrada.
    const area = renderizarConfiguracoes(dados(), acoes())

    expect(campo(area, 'apelido').value).toBe('Alex')
  })

  it('trocar o nome avisa quem monta', () => {
    const a = acoes()
    const area = renderizarConfiguracoes(dados(), a)
    campo(area, 'apelido').value = '  Bruno  '

    area.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.renomear).toHaveBeenCalledWith('Bruno')
  })

  it('nome em branco é recusado e o campo volta ao que era', () => {
    // Apelido vazio deixaria a pessoa sem nome para todo mundo na sala.
    const a = acoes()
    const area = renderizarConfiguracoes(dados(), a)
    const entrada = campo(area, 'apelido')
    entrada.value = '   '

    area.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.renomear).not.toHaveBeenCalled()
    expect(entrada.value).toBe('Alex')
  })

  it('traz o seletor de foto junto', () => {
    const area = renderizarConfiguracoes(dados(), acoes())

    expect(area.querySelector('[data-perfil="escolher"]')).not.toBeNull()
  })
})

describe('esta sala', () => {
  it('mostra o código agrupado, como no link', () => {
    const area = renderizarConfiguracoes(dados(), acoes())

    expect(area.querySelector('.config-codigo')!.textContent).toBe('K7X2-QW9F-M3PR-TVN4')
  })

  it('salvar avisa com o nome digitado', () => {
    const a = acoes()
    const area = renderizarConfiguracoes(dados(), a)
    campo(area, 'nome-grupo').value = 'Os manos'

    area.querySelectorAll('form')[1]!
      .dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.salvarGrupo).toHaveBeenCalledWith('Os manos')
  })

  it('nome vazio é aceito — o código vira o rótulo', () => {
    // Obrigar a batizar antes de salvar seria atrito num caminho de um clique.
    const a = acoes()
    const area = renderizarConfiguracoes(dados(), a)

    area.querySelectorAll('form')[1]!
      .dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.salvarGrupo).toHaveBeenCalledWith('')
  })

  it('sala ainda não salva não oferece tirar da tela inicial', () => {
    const area = renderizarConfiguracoes(dados(), acoes())

    expect(area.querySelector('[data-config="esquecer-grupo"]')).toBeNull()
    expect(area.querySelector('[data-config="salvar-grupo"]')!.textContent)
      .toBe('Salvar grupo')
  })

  it('sala já salva mostra o nome e vira renomear', () => {
    const area = renderizarConfiguracoes(
      dados({ grupo: { codigo: CODIGO, nome: 'Os manos' } }), acoes())

    expect(campo(area, 'nome-grupo').value).toBe('Os manos')
    expect(area.querySelector('[data-config="salvar-grupo"]')!.textContent).toBe('Renomear')
  })

  it('tirar da tela inicial deixa claro que a sala continua existindo', () => {
    const a = acoes()
    const area = renderizarConfiguracoes(
      dados({ grupo: { codigo: CODIGO, nome: 'Os manos' } }), a)
    const botao = area.querySelector<HTMLButtonElement>('[data-config="esquecer-grupo"]')!

    expect(botao.title).toContain('continua existindo')
    botao.click()

    expect(a.esquecerGrupo).toHaveBeenCalled()
  })

  it('diz que o grupo fica só neste navegador', () => {
    // A limitação dita na cara: um grupo é um atalho SEU, não um cadastro que
    // acompanha a pessoa.
    const area = renderizarConfiguracoes(dados(), acoes())

    expect(area.querySelector('.config-texto')!.textContent).toContain('navegador')
  })
})

describe('ordem das seções', () => {
  it('você, depois a sala, e a identidade por último', () => {
    // "Sair desta máquina" é destrutivo e não merece ficar no caminho de quem
    // só queria trocar a foto.
    const area = renderizarConfiguracoes(dados(), acoes())

    expect([...area.querySelectorAll('.config-titulo')].map((t) => t.textContent))
      .toEqual(['Você', 'Esta sala', 'A partida', 'Sua identidade'])
  })
})
