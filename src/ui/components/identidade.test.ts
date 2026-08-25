// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { AVISO_GUARDE, renderizarIdentidade } from './identidade'
import type { Identidade } from '../../identidade/atual'

const SEGREDO = 'ZC1kZW1v.eC1kZW1v.eS1kZW1v'

const acoes = () => ({
  entrarComSegredo: vi.fn(), sair: vi.fn(), guardei: vi.fn(),
})

/** Um par de mentira: este componente só lê `selo` e `segredoNovo`. */
const identidade = (extras: Partial<Identidade> = {}): Identidade => ({
  par: {} as CryptoKeyPair, selo: 'K7X2QW9F', ...extras,
})

describe('enquanto carrega', () => {
  it('não mostra nada — nem "criar identidade" piscando', () => {
    // Sem isto, quem já tem identidade veria por um instante a tela de criar
    // uma, e concluiria que perdeu a dela.
    const area = renderizarIdentidade(null, acoes())

    expect(area.textContent).toBe('')
  })
})

describe('identidade recém-criada', () => {
  const nova = () => identidade({ segredoNovo: SEGREDO })

  it('mostra o segredo, uma vez', () => {
    const area = renderizarIdentidade(nova(), acoes())

    expect(area.querySelector<HTMLTextAreaElement>('[data-id="segredo"]')!.value)
      .toBe(SEGREDO)
  })

  it('diz que não dá para mostrar de novo', () => {
    // O trato inteiro depende de a pessoa entender isto na hora: a chave é
    // não extraível, então o segredo não existe em lugar nenhum depois daqui.
    const area = renderizarIdentidade(nova(), acoes())

    expect(area.querySelector('.identidade-aviso')!.textContent).toBe(AVISO_GUARDE)
    expect(AVISO_GUARDE).toContain('não pode ser mostrado de novo')
  })

  it('o campo é só-leitura mas selecionável', () => {
    // `disabled` impediria selecionar, que é justamente o que se faz aqui.
    const campo = renderizarIdentidade(nova(), acoes())
      .querySelector<HTMLTextAreaElement>('[data-id="segredo"]')!

    expect(campo.readOnly).toBe(true)
    expect(campo.disabled).toBe(false)
  })

  it('"já guardei" avisa quem monta', () => {
    const a = acoes()
    const area = renderizarIdentidade(nova(), a)

    area.querySelector<HTMLButtonElement>('[data-id="guardei"]')!.click()

    expect(a.guardei).toHaveBeenCalled()
  })

  it('não oferece sair nem trocar antes de a pessoa guardar', () => {
    // Sair aqui apagaria uma identidade cujo segredo ela ainda não copiou.
    const area = renderizarIdentidade(nova(), acoes())

    expect(area.querySelector('[data-id="sair"]')).toBeNull()
    expect(area.querySelector('[data-id="entrar"]')).toBeNull()
  })
})

describe('identidade já existente', () => {
  it('mostra o selo, discreto', () => {
    const area = renderizarIdentidade(identidade(), acoes())

    expect(area.querySelector('.identidade-selo-valor')!.textContent).toBe('K7X2QW9F')
  })

  it('não mostra segredo nenhum', () => {
    const area = renderizarIdentidade(identidade(), acoes())

    expect(area.querySelector('[data-id="segredo"]')).toBeNull()
  })

  it('entra com um ID colado', () => {
    const a = acoes()
    const area = renderizarIdentidade(identidade(), a)
    area.querySelector<HTMLInputElement>('[data-id="entrar-campo"]')!.value = SEGREDO

    area.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.entrarComSegredo).toHaveBeenCalledWith(SEGREDO)
  })

  it('aceita ID colado com espaço em volta', () => {
    const a = acoes()
    const area = renderizarIdentidade(identidade(), a)
    area.querySelector<HTMLInputElement>('[data-id="entrar-campo"]')!.value = `  ${SEGREDO}\n`

    area.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.entrarComSegredo).toHaveBeenCalledWith(SEGREDO)
  })

  it('ID malformado avisa e NÃO troca nada', () => {
    // Trocar e falhar apagaria a identidade que está funcionando por causa de
    // um "copiar" incompleto.
    const a = acoes()
    const area = renderizarIdentidade(identidade(), a)
    area.querySelector<HTMLInputElement>('[data-id="entrar-campo"]')!.value = 'metade-do-id'

    area.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

    expect(a.entrarComSegredo).not.toHaveBeenCalled()
    expect(area.querySelector<HTMLElement>('.identidade-erro')!.hidden).toBe(false)
  })

  it('sair avisa quem monta, e explica o risco antes', () => {
    const a = acoes()
    const area = renderizarIdentidade(identidade(), a)
    const sair = area.querySelector<HTMLButtonElement>('[data-id="sair"]')!

    expect(sair.title).toContain('não dá para voltar')
    sair.click()

    expect(a.sair).toHaveBeenCalled()
  })
})
