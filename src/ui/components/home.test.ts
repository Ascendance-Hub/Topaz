// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderizarHome } from './home'

beforeEach(() => {
  location.hash = ''
  localStorage.clear()
})

describe('renderizarHome', () => {
  it('mantém o caminho de entrar funcionando — é o trabalho da página', () => {
    // A home é apresentação, mas quem chega para usar precisa entrar sem
    // procurar. O cartão de ação vem antes de qualquer explicação.
    const aoEntrar = vi.fn()
    const home = renderizarHome(aoEntrar)

    expect(home.querySelector('.lobby')).not.toBeNull()
    expect(home.querySelector('.home-acao')).not.toBeNull()
  })

  it('a ação aparece antes das explicações', () => {
    const home = renderizarHome(vi.fn())
    const secoes = [...home.querySelectorAll('.home-acao, .home-recursos')]

    expect(secoes[0]!.className).toContain('home-acao')
  })

  it('diz o que está protegido', () => {
    const home = renderizarHome(vi.fn())
    const texto = home.querySelector('.home-seguranca')!.textContent!

    expect(texto).toContain('ponta a ponta')
  })

  it('avisa que o código da sala é a chave dela', () => {
    // A única coisa sobre a qual a pessoa pode agir.
    const home = renderizarHome(vi.fn())

    expect(home.querySelector('.home-seguranca')!.textContent).toContain('chave')
  })

  it('não publica o que NÃO protegemos', () => {
    // Decisão do dono do projeto, e correta: uma vitrine não é lugar de modelo
    // de ameaça. Listar a superfície de ataque numa página pública é entregar
    // mapa. O levantamento completo vive em docs/diario-de-bordo.md.
    const texto = renderizarHome(vi.fn()).textContent!

    // Com limite de palavra: procurar "ip" solto reprovaria "equipamento" ou
    // "múltiplas" numa revisão de texto futura, e o teste falharia pelo motivo
    // errado — que é como um guarda vira ruído e acaba desligado.
    for (const proibido of [
      /\bIPs?\b/i, /força bruta/i, /adivinh\w*/i, /vulnerab\w*/i, /\bataques?\b/i,
    ]) {
      expect(texto).not.toMatch(proibido)
    }
  })

  it('apresenta as duas coisas que dá para fazer', () => {
    const home = renderizarHome(vi.fn())
    const cartoes = [...home.querySelectorAll('.home-recurso')]

    expect(cartoes).toHaveLength(2)
    expect(home.querySelector('.home-recursos')!.textContent).toContain('tela')
    expect(home.querySelector('.home-recursos')!.textContent).toContain('Blackjack')
  })

  it('recebe o painel de teste de rede sem saber montá-lo', () => {
    // O teste depende de estado que vive no main.ts. A home só abre espaço.
    const painel = document.createElement('div')
    painel.className = 'teste-rede'

    const home = renderizarHome(vi.fn(), { testeRede: painel })

    expect(home.querySelector('.home-rede .teste-rede')).toBe(painel)
  })

  it('sem painel de teste, a seção de rede não fica pela metade', () => {
    const home = renderizarHome(vi.fn())

    expect(home.querySelector('.home-rede')).toBeNull()
  })

  it('explica que os servidores de busca só apresentam as pessoas', () => {
    const painel = document.createElement('div')
    const home = renderizarHome(vi.fn(), { testeRede: painel })

    expect(home.querySelector('.home-rede')!.textContent).toContain('nada do que')
  })

  it('com código no link, ainda é o caminho de entrar na sala', () => {
    // Quem clica num convite cai aqui. A apresentação não pode atrapalhar.
    location.hash = '#sala=K7X2-QW9F-M3PR-TVN4'

    const home = renderizarHome(vi.fn())

    expect(home.querySelector('.lobby')!.textContent).toContain('Entrando na sala')
  })
})

describe('quem chega por convite', () => {
  it('a página se encolhe para o botão de entrar não ficar abaixo da dobra', () => {
    // Quem clicou num convite não veio ler a apresentação: veio entrar. O
    // herói inteiro empurrando o cartão para fora da tela transformaria um
    // clique em "rolar até achar".
    location.hash = '#sala=K7X2-QW9F-M3PR-TVN4'

    const home = renderizarHome(vi.fn())

    expect(home.dataset['convite']).toBe('1')
  })

  it('sem convite, a apresentação fica inteira', () => {
    expect(renderizarHome(vi.fn()).dataset['convite']).toBeUndefined()
  })

  it('um link truncado também encolhe — a pessoa precisa ver o aviso', () => {
    // `haCodigoNaUrl` é verdadeiro mesmo com o código quebrado, e é justamente
    // essa pessoa que precisa ver o aviso e o campo, não o herói.
    location.hash = '#sala=K7X2'

    expect(renderizarHome(vi.fn()).dataset['convite']).toBe('1')
  })
})
