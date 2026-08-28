import { describe, it, expect, vi } from 'vitest'

vi.mock('./atual', () => ({
  entrarComSegredo: vi.fn(),
  sairDaIdentidade: vi.fn(),
  identidadeAtual: vi.fn(),
}))

import { entrarComSegredo, identidadeAtual, sairDaIdentidade } from './atual'
import { criarAcoesIdentidade } from './acoes'

const identidadeFalsa = (selo: string) => ({ par: {} as CryptoKeyPair, selo })

describe('criarAcoesIdentidade', () => {
  it('guardei: para de mostrar o segredo, sem apagá-lo de lugar nenhum', () => {
    // Ele nunca foi guardado: só existia numa variável. "Guardei" é a pessoa
    // afirmando que copiou, e a única consequência é a tela parar de mostrar.
    const adotar = vi.fn()
    const acoes = criarAcoesIdentidade(
      () => ({ ...identidadeFalsa('AAA'), segredoNovo: 'segredo' }), adotar)

    acoes.guardei()

    expect(adotar).toHaveBeenCalledWith(
      expect.objectContaining({ selo: 'AAA', segredoNovo: undefined }))
  })

  it('guardei: sem identidade ainda, não faz nada', () => {
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).guardei()

    expect(adotar).not.toHaveBeenCalled()
  })

  it('entrarComSegredo: adota a identidade que voltou', async () => {
    const nova = identidadeFalsa('BBB')
    vi.mocked(entrarComSegredo).mockResolvedValue(nova)
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).entrarComSegredo('sem')

    await vi.waitFor(() => expect(adotar).toHaveBeenCalledWith(nova))
  })

  it('entrarComSegredo: um segredo que não abre nada não derruba a tela', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(entrarComSegredo).mockRejectedValue(new Error('torto'))
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).entrarComSegredo('torto')

    await vi.waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(adotar).not.toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('sair: apaga a daqui e adota a nova que nasce no lugar', async () => {
    const nova = identidadeFalsa('CCC')
    vi.mocked(sairDaIdentidade).mockResolvedValue(undefined)
    vi.mocked(identidadeAtual).mockResolvedValue(nova)
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).sair()

    await vi.waitFor(() => expect(adotar).toHaveBeenCalledWith(nova))
  })
})
