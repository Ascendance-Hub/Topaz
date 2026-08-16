// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'

// `main.ts` importa o transporte real do Trystero; substituímos por uma
// fábrica controlável para poder ligar duas "sessões" (uma delas simulando
// outra aba/navegador) na mesma rede em memória usada pelos testes de
// `Sessao`. `vi.mock` é hoisted para antes dos imports abaixo.
vi.mock('./net/transport', () => ({
  criarTransporteTrystero: vi.fn(),
}))

import { criarTransporteTrystero } from './net/transport'
import { criarRedeFalsa } from './net/transport.fake'
import { MS_DESCOBERTA, MS_SEM_CONEXAO, Sessao } from './net/sessao'
import { TITULO_SEM_CONEXAO } from './ui/components/conexao'
import { rngSemente } from './game/shoe'
import { iniciarApp, iniciarPartida, MENSAGEM_ERRO_INICIAL } from './main'

describe('iniciarPartida — barra de sala continua atualizando o DOM real', () => {
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
    vi.mocked(criarTransporteTrystero).mockImplementation(() => rede.conectar('pb'))

    const app = document.createElement('div')
    iniciarPartida(app, 'Bruno', 'CODIGO01')

    rede.bombear()
    // O tique periódico de 'pb' vence a janela sem reivindicar nada ('pa'
    // tem o menor id); o tique de 'pa' faz ele assumir e publicar.
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())

    // Depois do primeiro round-trip (entrar + snapshot do host), 'pb' já
    // sabe que 'pa' manda — isso já passou por pelo menos duas trocas de
    // `desenhar()` (uma ao adotar o snapshot recebido, outra explícita ao
    // final de `iniciarPartida`). Sob o bug do `replaceWith` único, a barra
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

describe('iniciarPartida — estado da conexão em vez de mesa travada', () => {
  it('mostra "conectando" antes de a sala ter anfitrião e a mesa depois', () => {
    vi.useFakeTimers()
    try {
      const rede = criarRedeFalsa({ conexaoDiferida: true })
      vi.mocked(criarTransporteTrystero).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      iniciarPartida(app, 'Bruno', 'CODIGO01')

      // Sem anfitrião ainda: nada de mesa nem de "Aguardando jogadores…",
      // que seria a mesma tela de uma conexão que nunca vai acontecer.
      expect(app.querySelector('.conexao')?.getAttribute('data-status')).toBe('conectando')
      expect(app.querySelector('.mesa')).toBeNull()

      vi.advanceTimersByTime(MS_DESCOBERTA + 600)

      expect(app.querySelector('.conexao')).toBeNull()
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
      vi.mocked(criarTransporteTrystero).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      iniciarPartida(app, 'Bruno', 'CODIGO01')
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
