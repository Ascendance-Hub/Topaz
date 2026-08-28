// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../net/coletar-candidatos', () => ({ coletarCandidatos: vi.fn() }))
vi.mock('../net/transport', () => ({
  relaysDetalhados: vi.fn(() => [
    { url: 'wss://relay-um.test', nome: 'relay-um.test', conectado: true },
  ]),
}))

import { coletarCandidatos } from '../net/coletar-candidatos'
import { criarPainelDeRede } from './painel-rede'

const nuncaResolve = () => new Promise(() => {}) as ReturnType<typeof coletarCandidatos>

describe('criarPainelDeRede', () => {
  // Sem isto a contagem de chamadas vem somada dos casos anteriores.
  beforeEach(() => { vi.mocked(coletarCandidatos).mockClear() })

  it('na home NÃO lista servidores: fora da sala não há socket aberto', () => {
    const painel = criarPainelDeRede(() => {})

    const el = painel.desenhar(false)

    // "0 de 20" lê como falha catastrófica para quem acabou de abrir a página.
    expect(el.textContent).not.toContain('relay-um.test')
  })

  it('na sala lista, porque lá o número quer dizer alguma coisa', () => {
    const painel = criarPainelDeRede(() => {})

    const el = painel.desenhar(true)

    expect(el.textContent).toContain('relay-um.test')
  })

  it('testar avisa quem desenha no começo E no fim', async () => {
    type Coleta = Awaited<ReturnType<typeof coletarCandidatos>>
    let resolver: (v: Coleta) => void = () => {}
    vi.mocked(coletarCandidatos).mockReturnValue(
      new Promise<Coleta>((r) => { resolver = r }))
    const avisou = vi.fn()
    const painel = criarPainelDeRede(avisou)

    painel.testar()
    // No começo, senão o botão não mostra que está rodando.
    expect(avisou).toHaveBeenCalledTimes(1)

    resolver({ candidatos: [], erros: 0 })
    await vi.waitFor(() => expect(avisou).toHaveBeenCalledTimes(2))
  })

  it('clicar duas vezes não dispara dois testes', () => {
    vi.mocked(coletarCandidatos).mockReturnValue(nuncaResolve())
    const painel = criarPainelDeRede(() => {})

    painel.testar()
    painel.testar()

    expect(vi.mocked(coletarCandidatos)).toHaveBeenCalledTimes(1)
  })

  it('o <details> aberto sobrevive ao redesenho', () => {
    vi.mocked(coletarCandidatos).mockReturnValue(nuncaResolve())
    const painel = criarPainelDeRede(() => {})

    const antes = painel.desenhar(true)
    const detalhes = antes.querySelector('details')
    expect(detalhes).not.toBeNull()
    detalhes!.open = true
    detalhes!.dispatchEvent(new Event('toggle'))

    // Dentro da sala este painel é refeito a cada clique na call.
    const depois = painel.desenhar(true)

    expect(depois.querySelector('details')!.open).toBe(true)
  })
})
