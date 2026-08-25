// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarTesteRede, TEXTOS } from './teste-rede'
import { VEREDITOS } from '../../net/diagnostico-rede'

describe('renderizarTesteRede', () => {
  it('começa oferecendo o teste', () => {
    const painel = renderizarTesteRede(null, false, vi.fn())

    expect(painel.querySelector('[data-teste="rodar"]')).not.toBeNull()
    expect(painel.textContent).not.toContain(TEXTOS.direto)
  })

  it('enquanto roda, avisa e não deixa clicar de novo', () => {
    const painel = renderizarTesteRede(null, true, vi.fn())

    expect(painel.querySelector<HTMLButtonElement>('[data-teste="rodar"]')!.disabled).toBe(true)
    expect(painel.textContent).toContain(TEXTOS.rodando)
  })

  it('clicar pede o teste', () => {
    const rodar = vi.fn()
    renderizarTesteRede(null, false, rodar)
      .querySelector<HTMLButtonElement>('[data-teste="rodar"]')!.click()

    expect(rodar).toHaveBeenCalled()
  })

  it('explica em português o que cada veredito significa', () => {
    for (const [veredito, texto] of [
      [VEREDITOS.direto, TEXTOS.direto],
      [VEREDITOS.simetrico, TEXTOS.simetrico],
      [VEREDITOS.semUdp, TEXTOS.semUdp],
      [VEREDITOS.inconclusivo, TEXTOS.inconclusivo],
    ] as const) {
      const painel = renderizarTesteRede({ veredito, contagem: {} }, false, vi.fn())
      expect(painel.textContent).toContain(texto)
    }
  })

  it('marca o resultado ruim para dar destaque', () => {
    const painel = renderizarTesteRede(
      { veredito: VEREDITOS.simetrico, contagem: {} }, false, vi.fn())

    expect(painel.querySelector<HTMLElement>('.teste-rede-veredito')!.dataset['ruim'])
      .toBe('1')
  })

  it('resultado bom não é marcado como ruim', () => {
    const painel = renderizarTesteRede(
      { veredito: VEREDITOS.direto, contagem: {} }, false, vi.fn())

    expect(painel.querySelector<HTMLElement>('.teste-rede-veredito')!.dataset['ruim'])
      .toBe('0')
  })
})

describe('lista de servidores de descoberta', () => {
  const relays = [
    { url: 'wss://a.com', nome: 'a.com', conectado: true },
    { url: 'wss://b.com', nome: 'b.com', conectado: false },
    { url: 'wss://c.com', nome: 'c.com', conectado: true },
  ]

  it('mostra todos, marcando quais estão conectados', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays)

    const itens = [...painel.querySelectorAll('.teste-rede-relay')]
    expect(itens).toHaveLength(3)
    expect(itens.map((i) => (i as HTMLElement).dataset['conectado']))
      .toEqual(['1', '0', '1'])
  })

  it('mostra o nome curto, que é o que se compara entre duas telas', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays)

    expect(painel.querySelector('.teste-rede-relay')!.textContent).toBe('a.com')
  })

  it('resume quantos de quantos', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays)

    expect(painel.querySelector('.teste-rede-relays-resumo')!.textContent)
      .toContain('2 de 3')
  })

  it('sem lista, não mostra a seção', () => {
    const painel = renderizarTesteRede(null, false, vi.fn())

    expect(painel.querySelector('.teste-rede-relay')).toBeNull()
  })
})

describe('aviso de antivírus bloqueando servidores', () => {
  const comConectados = (quantos: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({
      url: `wss://r${i}.test`, nome: `r${i}.test`, conectado: i < quantos,
    }))

  it('avisa quando poucos servidores respondem', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), comConectados(4, 20))

    expect(painel.textContent).toContain(TEXTOS.poucosRelays)
  })

  it('não avisa quando a maioria responde', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), comConectados(18, 20))

    expect(painel.textContent).not.toContain(TEXTOS.poucosRelays)
  })

  it('não avisa antes de os servidores terem tido tempo de conectar', () => {
    // Zero conectados logo na abertura é o estado normal de quem acabou de
    // entrar, não sintoma de bloqueio. Acusar antivírus aí seria alarme falso
    // em toda visita.
    const painel = renderizarTesteRede(null, false, vi.fn(), comConectados(0, 20))

    expect(painel.textContent).not.toContain(TEXTOS.poucosRelays)
  })
})

describe('os detalhes de conexão ficam dobrados', () => {
  const relays = (vivos: number, total = 20) =>
    Array.from({ length: total }, (_, i) => ({
      url: `wss://r${i}`, nome: `r${i}.exemplo`, conectado: i < vivos,
    }))

  it('com a rede saudável, a lista nasce FECHADA', () => {
    // São vinte nomes e dois parágrafos de explicação. Abertos, tomavam a tela
    // inteira de quem estava só esperando alguém entrar.
    const painel = renderizarTesteRede(null, false, vi.fn(), relays(18))

    expect(painel.querySelector<HTMLDetailsElement>('details')!.open).toBe(false)
  })

  it('com poucos servidores, ela nasce ABERTA', () => {
    // Quem está com problema não deveria precisar descobrir que existe um
    // clique para ver o diagnóstico.
    const painel = renderizarTesteRede(null, false, vi.fn(), relays(3))

    expect(painel.querySelector<HTMLDetailsElement>('details')!.open).toBe(true)
  })

  it('o aviso aparece no resumo, mesmo dobrado', () => {
    // Foi este aviso que encontrou o antivírus bloqueando endereços. Enterrá-lo
    // atrás de um clique desperdiçaria a única pista que aquele caso deixava.
    const painel = renderizarTesteRede(null, false, vi.fn(), relays(3))

    const resumo = painel.querySelector('summary')!.textContent!
    expect(resumo).toContain('poucos servidores')
    expect(resumo).toContain('3 de 20')
  })

  it('com a rede saudável, o resumo é neutro', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays(18))

    expect(painel.querySelector('summary')!.textContent).toBe('Ver detalhes de conexão')
  })

  it('a lista inteira continua lá dentro, para comparar com a outra pessoa', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays(18))

    expect(painel.querySelectorAll('details .teste-rede-relay')).toHaveLength(20)
  })

  it('sem lista de servidores, não há bloco nenhum', () => {
    // É o caso da home: fora de uma sala não há socket aberto, e a contagem
    // sairia "0 de 20".
    const painel = renderizarTesteRede(null, false, vi.fn())

    expect(painel.querySelector('details')).toBeNull()
  })
})

describe('a escolha de abrir os detalhes sobrevive ao redesenho', () => {
  const relays = (vivos: number, total = 20) =>
    Array.from({ length: total }, (_, i) => ({
      url: `wss://r${i}`, nome: `r${i}.exemplo`, conectado: i < vivos,
    }))

  it('a escolha da pessoa manda sobre o padrão', () => {
    // O defeito que isto conserta: a sala é redesenhada a cada clique nos
    // controles da call, e o bloco reabria toda vez — parecia que compartilhar
    // tela ou silenciar alguém abria o diagnóstico sozinho.
    const painel = renderizarTesteRede(
      null, false, vi.fn(), relays(3), { aberto: false })

    expect(painel.querySelector<HTMLDetailsElement>('details')!.open).toBe(false)
  })

  it('quem quis abrir continua com ele aberto, mesmo com a rede saudável', () => {
    const painel = renderizarTesteRede(
      null, false, vi.fn(), relays(18), { aberto: true })

    expect(painel.querySelector<HTMLDetailsElement>('details')!.open).toBe(true)
  })

  it('sem escolha registrada, o padrão continua valendo', () => {
    const painel = renderizarTesteRede(null, false, vi.fn(), relays(3), {})

    expect(painel.querySelector<HTMLDetailsElement>('details')!.open).toBe(true)
  })

  it('mexer no bloco avisa quem guarda a escolha', () => {
    const aoAlternar = vi.fn()
    const painel = renderizarTesteRede(
      null, false, vi.fn(), relays(18), { aoAlternar })
    const bloco = painel.querySelector<HTMLDetailsElement>('details')!

    bloco.open = true
    bloco.dispatchEvent(new Event('toggle'))

    expect(aoAlternar).toHaveBeenCalledWith(true)
  })
})
