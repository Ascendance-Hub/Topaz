// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'

// `main.ts` importa o transporte real do Trystero; substituímos por uma
// fábrica controlável para poder ligar duas "sessões" (uma delas simulando
// outra aba/navegador) na mesma rede em memória usada pelos testes de
// `Sessao`. `vi.mock` é hoisted para antes dos imports abaixo.
vi.mock('./net/transport', () => ({
  criarSalasTrystero: vi.fn(),
  criarTransporte: vi.fn(),
  // Sinalização saudável por padrão: estes testes são sobre a sala, não sobre
  // rede bloqueada, e zero relays mudaria a mensagem de falha.
  relaysConectados: vi.fn(() => 3),
  // Como em produção: a lista existe sempre, e cada relay diz se o socket
  // dele está aberto AGORA. Fora de uma sala não há socket nenhum — devolver
  // `[]` aqui escondia justamente o caso que a home precisa tratar.
  relaysDetalhados: vi.fn(() => Array.from({ length: 20 }, (_, i) => ({
    url: `wss://relay-${i}.exemplo`, nome: `relay-${i}.exemplo`, conectado: i < 3,
  }))),
}))

import { criarSalasTrystero, criarTransporte } from './net/transport'
import { criarRedeFalsa } from './net/transport.fake'
import { MS_DESCOBERTA, MS_SEM_CONEXAO, Sessao } from './net/sessao'
import { TITULO_SEM_CONEXAO } from './ui/components/conexao'
import { rngSemente } from './game/shoe'
import { entrarNaSala, iniciarApp, MENSAGEM_ERRO_INICIAL } from './main'
import { criarSalasFalsas } from './net/salas.fake'

/**
 * Abre a mesa como uma pessoa abre: pelo trilho, e depois pela galeria.
 *
 * O botão "Mesa" deixou de existir — ele pressupunha um jogo só. A mesa passou
 * a ser um dos cartões de "Jogos", e este atalho mantém os testes falando de
 * intenção ("abrir a mesa") em vez de sequência de cliques.
 */
function abrirMesa(app: HTMLElement): void {
  app.querySelector<HTMLButtonElement>('[data-nav="jogos"]')!.click()
  app.querySelector<HTMLButtonElement>('[data-abrir="blackjack"]')!.click()
}

/**
 * A fusão das três redes, de mentira. Existe porque `criarTransporte` é
 * mockado para a rede falsa do jogo, mas o canal da call e a mídia recebem a
 * fusão — e dar `undefined` a elas obrigaria o código de produção a carregar
 * guardas que só o teste precisa.
 */
const salaFalsa = () => criarSalasFalsas([]).salas

describe('entrarNaSala — barra de sala continua atualizando o DOM real', () => {
  it('reflete a migração de anfitrião mesmo depois de vários desenhar()', () => {
    // Relógio falso: é o `setInterval` de main.ts que faz a janela de
    // descoberta de host vencer, exatamente como no navegador.
    vi.useFakeTimers()
    try {
      correrMigracao()
    } finally {
      vi.useRealTimers()
    }
  })

  function correrMigracao(): void {
    // Conexão diferida: nenhum dos dois enxerga o outro no construtor, que
    // é a condição real do Trystero.
    const rede = criarRedeFalsa({ conexaoDiferida: true })

    const outraAba = new Sessao(rede.conectar('pa'), () => rngSemente(1))
    outraAba.entrar('Alex')

    // 'pb' é a aba sob teste: nasce sem saber quem manda e só descobre pelo
    // primeiro snapshot do host — igual ao fluxo real.
    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

    const app = document.createElement('div')
    entrarNaSala(app, 'Bruno', 'CODIGO01')

    rede.bombear()
    // O tique periódico de 'pb' vence a janela sem reivindicar nada ('pa'
    // tem o menor id); o tique de 'pa' faz ele assumir e publicar.
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())

    // Depois do primeiro round-trip (entrar + snapshot do host), 'pb' já
    // sabe que 'pa' manda — isso já passou por pelo menos duas trocas de
    // `desenhar()` (uma ao adotar o snapshot recebido, outra explícita ao
    // final de `entrarNaSala`). Sob o bug do `replaceWith` único, a barra
    // já teria parado de acompanhar depois da primeira delas.
    const barraAntes = app.querySelector('.barra-sala')
    expect(barraAntes).not.toBeNull()
    expect(barraAntes!.textContent).not.toContain('anfitrião')

    // 'pa' (o host) sai da sala: 'pb' deve assumir como novo anfitrião, e é
    // essa terceira (ou mais) troca que o bug do `replaceWith` congelava —
    // o nó teoricamente substituído na verdade era um órfão, e o nó
    // realmente na página nunca chegava a mostrar "você é o anfitrião".
    outraAba.encerrar()

    const barrasNaPagina = app.querySelectorAll('.barra-sala')
    expect(barrasNaPagina).toHaveLength(1)
    const barraDepois = barrasNaPagina[0]!
    expect(app.contains(barraDepois)).toBe(true)
    expect(barraDepois.textContent).toContain('você é o anfitrião')
  }
})

describe('entrarNaSala — estado da conexão em vez de mesa travada', () => {
  it('mostra "conectando" antes de a sala ter anfitrião e a sala depois', () => {
    vi.useFakeTimers()
    try {
      const rede = criarRedeFalsa({ conexaoDiferida: true })
      vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
      vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      entrarNaSala(app, 'Bruno', 'CODIGO01')

      // Sem anfitrião ainda: nada de mesa nem de "Aguardando jogadores…",
      // que seria a mesma tela de uma conexão que nunca vai acontecer.
      expect(app.querySelector('.conexao')?.getAttribute('data-status')).toBe('conectando')
      expect(app.querySelector('.mesa')).toBeNull()

      vi.advanceTimersByTime(MS_DESCOBERTA + 600)

      // Conectado, o palco mostra a sala — a mesa passou a ser um clique de
      // distância, não o conteúdo automático de quem entra.
      expect(app.querySelector('.conexao')).toBeNull()
      expect(app.querySelector('.sala-parada')).not.toBeNull()

      abrirMesa(app)
      expect(app.querySelector('.mesa')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra falha de conexão quando a sala nunca resolve quem manda', () => {
    vi.useFakeTimers()
    try {
      const rede = criarRedeFalsa({ conexaoDiferida: true })
      // 'pa' é um transporte sem Sessao: existe na sala, ordena antes de
      // 'pb' na eleição e nunca publica nada — é o relay fora do ar / a rede
      // que bloqueia WebRTC da spec §14.
      rede.conectar('pa')
      vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
      vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      entrarNaSala(app, 'Bruno', 'CODIGO01')
      rede.bombear()

      vi.advanceTimersByTime(MS_SEM_CONEXAO + 600)

      const caixa = app.querySelector('.conexao')!
      expect(caixa.getAttribute('data-status')).toBe('sem-conexao')
      expect(caixa.textContent).toContain(TITULO_SEM_CONEXAO)
      expect(app.querySelector('.mesa')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('iniciarApp — fallback de erro na inicialização', () => {
  it('quando o render inicial do lobby lança, mostra uma mensagem em vez de deixar a página em branco', async () => {
    vi.resetModules()
    vi.doMock('./ui/components/lobby', () => ({
      renderizarLobby: () => {
        throw new Error('falha inesperada no lobby')
      },
    }))

    const { iniciarApp: iniciarAppComLobbyQuebrado } = await import('./main')
    const app = document.createElement('div')

    expect(() => iniciarAppComLobbyQuebrado(app)).not.toThrow()
    expect(app.textContent).toBe(MENSAGEM_ERRO_INICIAL)
    expect(app.children).toHaveLength(0)

    vi.doUnmock('./ui/components/lobby')
    vi.resetModules()
  })

  it('no caminho normal (sem falha), monta o lobby normalmente', () => {
    const app = document.createElement('div')
    iniciarApp(app)
    expect(app.querySelector('.lobby')).not.toBeNull()
  })
})

describe('entrarNaSala — chat da sala', () => {
  /**
   * Sobe 'pb' (a aba sob teste) numa sala onde 'pa' já é anfitrião com o
   * apelido Alex, e devolve o transporte de 'pa' para simular alguém falando.
   */
  function salaComDoisJogadores() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const transporteA = rede.conectar('pa')
    const outraAba = new Sessao(transporteA, () => rngSemente(1))
    outraAba.entrar('Alex')

    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))
    const app = document.createElement('div')
    entrarNaSala(app, 'Bruno', 'CODIGO01')

    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())

    return { app, transporteA, outraAba }
  }

  function digitar(app: HTMLElement, texto: string): HTMLInputElement {
    const campo = app.querySelector<HTMLInputElement>('.chat-campo')!
    campo.value = texto
    return campo
  }

  function submeter(app: HTMLElement): void {
    app.querySelector('.chat-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  }

  it('mostra na própria tela a mensagem que eu mandei', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaComDoisJogadores()

      digitar(app, 'boa mão')
      submeter(app)

      const linha = app.querySelector('.chat-linha')!
      expect(linha.textContent).toContain('Bruno')
      expect(linha.textContent).toContain('boa mão')
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra a mensagem de outro peer com o apelido dele, e não com o peerId', () => {
    vi.useFakeTimers()
    try {
      const { app, transporteA } = salaComDoisJogadores()

      transporteA.enviarMensagem('e aí')

      const linha = app.querySelector('.chat-linha')!
      expect(linha.textContent).toContain('Alex')
      expect(linha.textContent).not.toContain('pa')
      expect(linha.textContent).toContain('e aí')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sobrevive aos re-renders da mesa sem apagar o que estava sendo digitado', () => {
    vi.useFakeTimers()
    try {
      const { app, transporteA, outraAba } = salaComDoisJogadores()
      transporteA.enviarMensagem('e aí')
      const campo = digitar(app, 'ainda estou escrevend')

      // Cada despacho do host publica um snapshot novo, e cada snapshot
      // adotado redesenha a mesa inteira — no navegador isso acontece de
      // 700 em 700ms durante a compra do dealer. Se o chat morasse dentro da
      // árvore que `renderizar` substitui, era aqui que o texto sumia.
      for (let i = 0; i < 3; i++) outraAba.entrar('Alex')

      expect(app.querySelectorAll('.chat')).toHaveLength(1)
      expect(app.querySelector<HTMLInputElement>('.chat-campo')!.value)
        .toBe('ainda estou escrevend')
      expect(app.contains(campo)).toBe(true)
      expect(app.querySelector('.chat-linha')!.textContent).toContain('e aí')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('entrarNaSala — a sala é o espaço, a mesa é uma escolha', () => {
  function salaConectada() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const outraAba = new Sessao(rede.conectar('pa'), () => rngSemente(1))
    outraAba.entrar('Alex')

    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

    const app = document.createElement('div')
    entrarNaSala(app, 'Bruno', 'CODIGO01')

    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())
    return { app, outraAba }
  }

  function clicar(app: HTMLElement, alvo: string): void {
    if (alvo === 'mesa') abrirMesa(app)
    else app.querySelector<HTMLButtonElement>(`[data-nav="${alvo}"]`)!.click()
  }

  it('ao entrar, mostra a sala com quem está — não a mesa', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaConectada()

      expect(app.querySelector('.sala-parada')).not.toBeNull()
      expect(app.querySelector('.mesa')).toBeNull()
      expect(app.textContent).toContain('Alex')
    } finally {
      vi.useRealTimers()
    }
  })

  it('abrir a mesa troca o palco, e voltar devolve a sala', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaConectada()

      clicar(app, 'mesa')
      expect(app.querySelector('.mesa')).not.toBeNull()
      expect(app.querySelector('.sala-parada')).toBeNull()

      clicar(app, 'sala')
      expect(app.querySelector('.mesa')).toBeNull()
      expect(app.querySelector('.sala-parada')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('o chat sobrevive a alternar entre sala e mesa, com o que estava digitado', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaConectada()
      const campo = app.querySelector<HTMLInputElement>('.chat-campo')!
      campo.value = 'escrevendo ainda'

      clicar(app, 'mesa')
      clicar(app, 'sala')

      expect(app.querySelectorAll('.chat')).toHaveLength(1)
      expect(app.querySelector<HTMLInputElement>('.chat-campo')!.value)
        .toBe('escrevendo ainda')
    } finally {
      vi.useRealTimers()
    }
  })

  it('com a mesa aberta, um broadcast do host não devolve o palco para a sala', () => {
    vi.useFakeTimers()
    try {
      const { app, outraAba } = salaConectada()
      clicar(app, 'mesa')

      // Cada despacho do host publica um snapshot, e cada snapshot redesenha.
      // Se `mesaAberta` morasse no estado do jogo em vez de ser escolha local,
      // era aqui que a tela pularia de volta para a sala sozinha.
      for (let i = 0; i < 3; i++) outraAba.entrar('Alex')

      expect(app.querySelector('.mesa')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('entrarNaSala — várias pessoas na mesma sala', () => {
  /** Duas interfaces completas na mesma rede falsa. 'pa' vence a eleição. */
  function duasAbas() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const ids = ['pa', 'pb']
    let proximo = 0
    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar(ids[proximo++]!))

    const appA = document.createElement('div')
    const appB = document.createElement('div')
    entrarNaSala(appA, 'Alex', 'CODIGO01')
    entrarNaSala(appB, 'Bruno', 'CODIGO01')

    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    return { appA, appB }
  }

  const nav = (app: HTMLElement, alvo: string) => {
    if (alvo === 'mesa') abrirMesa(app)
    else app.querySelector<HTMLButtonElement>(`[data-nav="${alvo}"]`)!.click()
  }
  const agir = (app: HTMLElement, seletor: string) =>
    app.querySelector<HTMLButtonElement>(`[data-acao="${seletor}"]`)!.click()

  it('a lista da sala mostra as duas pessoas nas duas abas', () => {
    vi.useFakeTimers()
    try {
      const { appA, appB } = duasAbas()

      for (const app of [appA, appB]) {
        const nomes = [...app.querySelectorAll('.sala-quem')].map((n) => n.textContent)
        expect(nomes.sort()).toEqual(['Alex', 'Bruno'])
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('um abrir a mesa não arrasta o outro para ela', () => {
    vi.useFakeTimers()
    try {
      const { appA, appB } = duasAbas()

      nav(appA, 'mesa')

      expect(appA.querySelector('.mesa')).not.toBeNull()
      expect(appB.querySelector('.mesa')).toBeNull()
      expect(appB.querySelector('.sala-parada')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('quem senta e volta para a sala continua sentado para o outro', () => {
    vi.useFakeTimers()
    try {
      const { appA, appB } = duasAbas()

      nav(appB, 'mesa')
      agir(appB, 'sentar')
      nav(appB, 'sala')
      vi.advanceTimersByTime(600)

      nav(appA, 'mesa')
      expect(appA.querySelectorAll('[data-sentado]')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('voltar para a mesa mostra a partida como ela está agora, não como estava ao sair', () => {
    vi.useFakeTimers()
    try {
      const { appA, appB } = duasAbas()

      nav(appA, 'mesa'); agir(appA, 'sentar')
      nav(appB, 'mesa'); agir(appB, 'sentar')
      vi.advanceTimersByTime(600)

      // Bruno vai para a sala ANTES de a partida começar.
      nav(appB, 'sala')
      agir(appA, 'iniciar')
      vi.advanceTimersByTime(600)

      // E volta depois: precisa cair na fase corrente, não numa mesa parada.
      nav(appB, 'mesa')
      expect(appB.querySelector('[data-acao="apostar"]')).not.toBeNull()
      expect(appB.querySelector('[data-acao="iniciar"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})


describe('entrarNaSala — a sala avisa quando a mesa espera por você', () => {
  function mesaEmTurnos() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const ids = ['pa', 'pb']
    let proximo = 0
    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar(ids[proximo++]!))

    const appA = document.createElement('div')
    const appB = document.createElement('div')
    entrarNaSala(appA, 'Alex', 'CODIGO01')
    entrarNaSala(appB, 'Bruno', 'CODIGO01')
    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)

    const nav = (app: HTMLElement, alvo: string) => {
      if (alvo === 'mesa') abrirMesa(app)
      else app.querySelector<HTMLButtonElement>(`[data-nav="${alvo}"]`)!.click()
    }
    const agir = (app: HTMLElement, sel: string) =>
      app.querySelector<HTMLButtonElement>(`[data-acao="${sel}"]`)!.click()

    nav(appA, 'mesa'); agir(appA, 'sentar')
    nav(appB, 'mesa'); agir(appB, 'sentar')
    vi.advanceTimersByTime(600)
    agir(appA, 'iniciar')
    vi.advanceTimersByTime(600)
    return { appA, appB, nav, agir }
  }

  const marcado = (app: HTMLElement) =>
    app.querySelector<HTMLElement>('[data-nav="jogos"]')!.dataset['espera'] === '1'

  it('marca a mesa na fase de apostas para quem ainda não apostou', () => {
    vi.useFakeTimers()
    try {
      const { appB, nav } = mesaEmTurnos()

      nav(appB, 'sala')

      expect(marcado(appB)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a marca some assim que a aposta entra', () => {
    vi.useFakeTimers()
    try {
      const { appB, nav, agir } = mesaEmTurnos()

      agir(appB, 'apostar')
      nav(appB, 'sala')

      expect(marcado(appB)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('volta a marcar quando chega a vez dele nos turnos, mesmo com a sala aberta', () => {
    vi.useFakeTimers()
    try {
      const { appA, appB, nav, agir } = mesaEmTurnos()
      agir(appA, 'apostar'); agir(appB, 'apostar')
      vi.advanceTimersByTime(2000)

      nav(appB, 'sala')

      // Um dos dois tem a vez. Quem tiver, precisa estar marcado; e quem não
      // tiver, não pode estar — senão a marca vira ruído que ninguém olha.
      const vezDeB = appA.querySelector('[data-acao="pedir"]') === null
      expect(marcado(appB)).toBe(vezDeB)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('entrarNaSala — a call convive com o jogo', () => {
  function salaComCall() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const outraAba = new Sessao(rede.conectar('pa'), () => rngSemente(1))
    outraAba.entrar('Alex')

    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

    const app = document.createElement('div')
    entrarNaSala(app, 'Bruno', 'CODIGO01')
    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())
    return { app, outraAba }
  }

  it('montar a call não silencia a eleição de anfitrião', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaComCall()

      // Se a call tivesse roubado `onPeerJoin` do Trystero, a sala nunca
      // resolveria quem manda e o palco ficaria preso em "conectando" — em
      // silêncio, sem erro nenhum no console.
      expect(app.querySelector('.conexao')).toBeNull()
      expect(app.querySelector('.sala-parada')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra o botão de entrar na call, e ninguém entra sozinho', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaComCall()

      expect(app.querySelector('[data-call="entrar"]')).not.toBeNull()
      expect(app.querySelector('[data-call="sair"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('os controles da call sobrevivem a alternar entre sala e mesa', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaComCall()

      abrirMesa(app)
      app.querySelector<HTMLButtonElement>('[data-nav="sala"]')!.click()

      expect(app.querySelectorAll('.call-controles')).toHaveLength(1)
      expect(app.querySelector('[data-call="entrar"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a mesa continua funcionando com a call montada', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaComCall()

      abrirMesa(app)
      app.querySelector<HTMLButtonElement>('[data-acao="sentar"]')!.click()

      expect(app.querySelector('[data-sentado]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('entrarNaSala — diagnóstico de "achou mas não conectou"', () => {
  it('mostra quantos estão na sala e com quantos eu falo', () => {
    vi.useFakeTimers()
    try {
      const rede = criarRedeFalsa({ conexaoDiferida: true })
      const outraAba = new Sessao(rede.conectar('pa'), () => rngSemente(1))
      outraAba.entrar('Alex')
      vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
      vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      entrarNaSala(app, 'Bruno', 'CODIGO01')
      rede.bombear()
      vi.advanceTimersByTime(MS_DESCOBERTA + 600)
      outraAba.tique(Date.now())

      const diag = app.querySelector<HTMLElement>('.barra-diagnostico')!
      expect(diag.textContent).toContain('2 de 2')
      expect(diag.dataset['faltando']).toBe('0')
    } finally {
      vi.useRealTimers()
    }
  })

  it('oferece reconectar sem recarregar a página', () => {
    vi.useFakeTimers()
    try {
      const rede = criarRedeFalsa({ conexaoDiferida: true })
      vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
      vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      entrarNaSala(app, 'Bruno', 'CODIGO01')
      vi.advanceTimersByTime(MS_DESCOBERTA + 600)

      const botao = app.querySelector<HTMLButtonElement>('[data-sala="reconectar"]')!
      expect(botao).not.toBeNull()

      // Reconectar remonta a sala inteira; a tela precisa continuar de pé.
      expect(() => botao.click()).not.toThrow()
      vi.advanceTimersByTime(MS_DESCOBERTA + 600)
      expect(app.querySelectorAll('.barra-sala')).toHaveLength(1)
      expect(app.querySelectorAll('.call-controles')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('entrarNaSala — microfone negado não pode matar o botão', () => {
  /**
   * Troca `navigator.mediaDevices` por um que recusa a permissão, como o
   * navegador faz quando a pessoa clica em "Bloquear".
   */
  function microfoneNegado(): () => void {
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
        enumerateDevices: () => Promise.resolve([]),
        addEventListener: () => {},
      },
    })
    return () => {
      if (original) Object.defineProperty(navigator, 'mediaDevices', original)
      else Reflect.deleteProperty(navigator as unknown as object, 'mediaDevices')
    }
  }

  /** Deixa as promessas da cadeia de entrada resolverem, sem mexer no relógio
   *  falso — a cadeia é toda de microtarefas. */
  async function escoarPromessas(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }

  function salaComCall() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const outraAba = new Sessao(rede.conectar('pa'), () => rngSemente(1))
    outraAba.entrar('Alex')

    vi.mocked(criarSalasTrystero).mockImplementation(() => salaFalsa())
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

    const app = document.createElement('div')
    entrarNaSala(app, 'Bruno', 'CODIGO01')
    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())
    return { app }
  }

  it('entra na call mesmo assim, só ouvindo', async () => {
    // O defeito: `void midia.ligarMicrofone().then(...)` sem catch. A promessa
    // rejeitava, `protocolo.entrar()` nunca rodava, e clicar em "Entrar na
    // call" não fazia NADA — sem aviso, sem erro na tela.
    vi.useFakeTimers()
    const desfazer = microfoneNegado()
    try {
      const { app } = salaComCall()

      app.querySelector<HTMLButtonElement>('[data-call="entrar"]')!.click()
      await escoarPromessas()

      expect(app.querySelector('[data-call="sair"]')).not.toBeNull()
      expect(app.querySelector('[data-call="entrar"]')).toBeNull()
    } finally {
      desfazer()
      vi.useRealTimers()
    }
  })

  it('diz o motivo e oferece tentar de novo', async () => {
    vi.useFakeTimers()
    const desfazer = microfoneNegado()
    try {
      const { app } = salaComCall()

      app.querySelector<HTMLButtonElement>('[data-call="entrar"]')!.click()
      await escoarPromessas()

      // Entrar sem microfone é aceitável. Entrar sem saber, não.
      expect(app.querySelector('.call-sem-microfone')!.textContent).toContain('bloqueou')
      expect(app.querySelector('[data-call="tentar-microfone"]')).not.toBeNull()
    } finally {
      desfazer()
      vi.useRealTimers()
    }
  })
})

describe('iniciarApp — a home', () => {
  it('mostra a apresentação e o caminho de entrar', () => {
    const app = document.createElement('div')

    iniciarApp(app)

    expect(app.querySelector('.home')).not.toBeNull()
    expect(app.querySelector('.lobby')).not.toBeNull()
  })

  it('oferece o teste de rede antes mesmo de entrar numa sala', () => {
    // Quem recebeu um link e não consegue entrar nunca chega à sala para achar
    // o teste lá dentro.
    const app = document.createElement('div')

    iniciarApp(app)

    expect(app.querySelector('[data-teste="rodar"]')).not.toBeNull()
  })

  it('NÃO conta servidores de descoberta na home', () => {
    // Na home ninguém entrou em sala, então nenhum socket está aberto e a
    // contagem sairia "0 de 20" — que lê como falha catastrófica para quem
    // acabou de abrir a página. A lista só significa alguma coisa dentro da
    // sala, onde as conexões existem de verdade.
    const app = document.createElement('div')

    iniciarApp(app)

    expect(app.querySelector('.teste-rede-relays-resumo')).toBeNull()
    expect(app.textContent).not.toContain('Servidores de descoberta')
  })
})
