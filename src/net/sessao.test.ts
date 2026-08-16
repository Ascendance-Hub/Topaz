import { describe, it, expect, vi } from 'vitest'
import { criarRedeFalsa } from './transport.fake'
import { elegerHost, mesaPrevalece, Sessao, MS_DESCOBERTA, MS_SEM_CONEXAO } from './sessao'
import { rngSemente } from '../game/shoe'
import { REGRAS } from '../game/rules'
import type { EstadoJogo } from '../game/types'

const rng = () => rngSemente(99)

/**
 * A suíte inteira roda sobre a rede de conexão diferida — a única que modela
 * o navegador de verdade, em que `peers()` está vazio no construtor e o
 * handshake só termina segundos depois. Testar sobre a entrega síncrona era
 * o que escondia todo navegador se autodeclarando host.
 */
function redeDiferida() {
  return criarRedeFalsa({ conexaoDiferida: true })
}

/** Vence a janela de descoberta em todas as sessões, como o `setInterval`
 *  de main.ts faz na aplicação. Devolve o instante usado. */
function passarJanela(sessoes: Sessao[], agora = Date.now() + MS_DESCOBERTA + 1): number {
  for (const sessao of sessoes) sessao.tique(agora)
  return agora
}

/** Sala aberta como na vida real: todas as sessões construídas antes de
 *  qualquer uma enxergar as outras, handshake concluído depois e a janela de
 *  descoberta vencida pelo relógio. */
function abrirSala(ids: string[]) {
  const rede = redeDiferida()
  const transportes = ids.map((id) => rede.conectar(id))
  const sessoes = transportes.map((t) => new Sessao(t, rng))
  rede.bombear()
  passarJanela(sessoes)
  return { rede, transportes, sessoes }
}

function estadoFalso(over: Partial<EstadoJogo> = {}): EstadoJogo {
  return {
    fase: 'apostas', jogadores: [], vezDe: null, prazoTurno: null,
    maoDealer: [], dealerTemOculta: false, cartasRestantes: 312,
    hostAtual: 'px', rodada: 1, proximoIdMao: 1, ...over,
  }
}

describe('elegerHost', () => {
  it('escolhe o menor id em ordem lexicográfica', () => {
    expect(elegerHost(['pc', 'pa', 'pb'])).toBe('pa')
  })

  it('é estável independente da ordem de entrada', () => {
    expect(elegerHost(['pb', 'pa'])).toBe(elegerHost(['pa', 'pb']))
  })

  it('devolve o único id quando só há um', () => {
    expect(elegerHost(['pz'])).toBe('pz')
  })
})

describe('mesaPrevalece', () => {
  const jogadores = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      peerId: `p${i}`, apelido: `p${i}`, cadeira: null, fichas: 1000,
      maos: [], maoAtiva: 0, seguro: 0, rodadasInativo: 0,
      desconectadoEm: null, decidiuSeguro: false,
    }))

  it('a rodada mais alta vence', () => {
    const a = estadoFalso({ rodada: 3 })
    const b = estadoFalso({ rodada: 2, jogadores: jogadores(5) })
    expect(mesaPrevalece(a, 'pz', b, 'pa')).toBe(true)
  })

  it('empatando a rodada, vence quem tem mais jogadores', () => {
    const a = estadoFalso({ jogadores: jogadores(1) })
    const b = estadoFalso({ jogadores: jogadores(3) })
    expect(mesaPrevalece(a, 'pa', b, 'pz')).toBe(false)
  })

  it('empatando tudo, o menor peerId desempata — e a ordem é simétrica', () => {
    const a = estadoFalso()
    const b = estadoFalso()
    expect(mesaPrevalece(a, 'pa', b, 'pz')).toBe(true)
    expect(mesaPrevalece(b, 'pz', a, 'pa')).toBe(false)
  })
})

describe('descoberta de host', () => {
  it('ninguém se declara host no construtor, nem sozinho na sala', () => {
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)

    expect(a.souHost()).toBe(false)
    expect(a.statusConexao()).toBe('conectando')
  })

  it('duas sessões criadas antes de se enxergarem convergem para um host só e uma mesa só', () => {
    // Regressão do defeito central: com `peers()` vazio no construtor (a
    // realidade de qualquer navegador), os dois lados se declaravam host,
    // cada um montava um Contexto vazio e a sala virava duas mesas
    // solitárias e permanentes.
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    // O `entrar` sai antes de haver host, como em main.ts: fica guardado.
    a.entrar('Alex')
    b.entrar('Bruno')
    expect(a.souHost()).toBe(false)
    expect(b.souHost()).toBe(false)

    rede.bombear()
    passarJanela([a, b])

    expect([a.souHost(), b.souHost()]).toEqual([true, false])
    expect(a.estado().hostAtual).toBe('pa')
    expect(b.estado().hostAtual).toBe('pa')
    // Uma mesa só: as intenções guardadas escoaram para o host eleito.
    expect(a.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
    expect(b.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
  })

  it('quem chega e recebe snapshot de um host não reivindica o posto nem com id menor', () => {
    const { rede } = abrirSala(['pb'])
    // 'pa' ordena antes de 'pb', mas a mesa já tem dono: adotar o snapshot
    // resolve a descoberta antes de a janela vencer.
    const a = new Sessao(rede.conectar('pa'), rng)
    rede.bombear()
    passarJanela([a])

    expect(a.souHost()).toBe(false)
    expect(a.estado().hostAtual).toBe('pb')
  })

  it('um split-brain forçado resolve para a mesa com mais jogo, não para quem falou por último', () => {
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    // Sem bombear: cada um está sozinho na própria visão e assume a própria
    // mesa quando a janela vence.
    passarJanela([a, b])
    a.entrar('Alex')
    b.entrar('Bruno')
    expect(a.souHost()).toBe(true)
    expect(b.souHost()).toBe(true)

    // A mesa de 'pb' está mais adiantada, apesar do peerId maior — é ela que
    // tem de prevalecer, senão o desempate por id jogaria fora jogo real.
    b.estado().rodada = 4

    rede.bombear()

    expect(b.souHost()).toBe(true)
    expect(a.souHost()).toBe(false)
    expect(a.estado().rodada).toBe(4)
    expect(a.estado().hostAtual).toBe('pb')
    // Quem perdeu o split não some da partida: reanuncia o apelido na mesa
    // adotada.
    expect(b.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
    expect(a.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
  })

  it('status vai de conectando a conectado quando a descoberta resolve', () => {
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)
    expect(a.statusConexao()).toBe('conectando')

    passarJanela([a])

    expect(a.statusConexao()).toBe('conectado')
  })

  it('status vira sem-conexao quando a descoberta nunca resolve', () => {
    const rede = redeDiferida()
    // 'pa' é só um transporte, sem Sessao: nunca publica snapshot nenhum —
    // é o relay fora do ar / WebRTC bloqueado da spec §14.
    rede.conectar('pa')
    const z = new Sessao(rede.conectar('pz'), rng)
    rede.bombear()

    const inicio = Date.now()
    z.tique(inicio + MS_DESCOBERTA + 1)
    expect(z.souHost()).toBe(false)
    expect(z.statusConexao()).toBe('conectando')

    z.tique(inicio + MS_SEM_CONEXAO + 1)
    expect(z.statusConexao()).toBe('sem-conexao')
  })

  it('avisa os assinantes quando o status de conexão muda', () => {
    const rede = redeDiferida()
    rede.conectar('pa')
    const z = new Sessao(rede.conectar('pz'), rng)
    rede.bombear()
    const mudou = vi.fn()
    z.aoMudar(mudou)

    z.tique(Date.now() + MS_SEM_CONEXAO + 1)

    expect(mudou).toHaveBeenCalled()
  })

  it('a chegada de um peer reabre a janela: quem reivindicaria espera o tempo todo de novo', () => {
    // O relógio precisa ser controlado dos dois lados: a janela é SEMEADA
    // pelo `Date.now()` da construção e da chegada do peer, e AVALIADA
    // contra o `agora` do tique. Sem relógio falso, os dois instantes caem
    // no mesmo milissegundo e a reabertura fica invisível ao teste.
    vi.useFakeTimers()
    try {
      const inicio = Date.now()
      const rede = redeDiferida()
      // 'pa' é o menor id da sala: é ele quem reivindicaria o posto. Se a
      // reabertura não valesse, ele assumiria com a lista pela metade.
      const a = new Sessao(rede.conectar('pa'), rng)
      rede.conectar('pz')

      // Um segundo depois de 'pa' entrar, o handshake com 'pz' fecha.
      vi.setSystemTime(inicio + 1000)
      rede.bombear()

      // No instante em que a janela ORIGINAL venceria, ainda não pode ter
      // reivindicado nada: a chegada de 'pz' reabriu a contagem.
      a.tique(inicio + MS_DESCOBERTA + 1)
      expect(a.souHost()).toBe(false)
      expect(a.statusConexao()).toBe('conectando')

      // Vencida a janela reaberta, aí sim assume.
      a.tique(inicio + 1000 + MS_DESCOBERTA + 1)
      expect(a.souHost()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cliente de um host que se demitiu segue o host novo em vez de congelar', () => {
    // Caminho de três peers: o relay conecta 'pc' a 'pa' antes de 'pa' e
    // 'pb' se enxergarem. Quando 'pa' perde o conflito e se demite, ele
    // continua na sala — então, para 'pc', o host conhecido não sumiu (nada
    // reelege) e os snapshots de 'pb' vinham de um "estranho". A mesa de
    // 'pc' congelava com botões mortos, sem nem status para mostrar.
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    const c = new Sessao(rede.conectar('pc'), rng)

    // 'pa' e 'pc' formam uma mesa; 'pb' ainda não existe para ninguém.
    rede.bombear(['pa', 'pc'])
    passarJanela([a, c])
    a.entrar('Alex')
    c.entrar('Carla')
    expect(a.souHost()).toBe(true)
    expect(c.souHost()).toBe(false)
    expect(c.estado().hostAtual).toBe('pa')

    // 'pb' assume a própria mesa, mais adiantada que a de 'pa'.
    passarJanela([b])
    b.entrar('Bruno')
    b.estado().rodada = 7
    expect(b.souHost()).toBe(true)

    rede.bombear()

    // 'pa' perdeu e se demitiu — e 'pc' foi junto, pela MESMA ordem.
    expect(a.souHost()).toBe(false)
    expect(b.souHost()).toBe(true)
    expect(c.souHost()).toBe(false)
    expect(c.estado().hostAtual).toBe('pb')
    expect(c.estado().rodada).toBe(7)

    // E as ações de 'pc' chegam ao host novo, em vez de sumirem no antigo.
    c.despachar({ tipo: 'sentar', cadeira: 4 })

    const carlaNoHost = b.estado().jogadores.find((j) => j.peerId === 'pc')
    expect(carlaNoHost).toBeDefined()
    expect(carlaNoHost!.apelido).toBe('Carla')
    expect(carlaNoHost!.cadeira).toBe(4)
    expect(c.estado().jogadores.find((j) => j.peerId === 'pc')!.cadeira).toBe(4)
  })

  it('o cliente recusa a mesa que perde para a que ele já carrega', () => {
    // A outra metade da antissimetria: adotar "qualquer host que fale" faria
    // o cliente oscilar entre duas mesas em conflito.
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    const c = new Sessao(rede.conectar('pc'), rng)

    rede.bombear(['pb', 'pc'])
    passarJanela([b, c])
    b.entrar('Bruno')
    b.estado().rodada = 9
    expect(c.estado().hostAtual).toBe('pb')

    // 'pa' chega com uma mesa mais pobre e se declarando host.
    passarJanela([a])
    a.entrar('Alex')
    expect(a.souHost()).toBe(true)
    rede.bombear()

    expect(c.estado().hostAtual).toBe('pb')
    expect(c.estado().rodada).toBe(9)
    expect(a.souHost()).toBe(false)
  })
})

describe('Sessao', () => {
  it('o menor peerId se reconhece como host', () => {
    const { sessoes: [a, b] } = abrirSala(['pa', 'pb'])

    expect(a!.souHost()).toBe(true)
    expect(b!.souHost()).toBe(false)
  })

  it('propaga o estado do host para o cliente', () => {
    const { sessoes: [a, b] } = abrirSala(['pa', 'pb'])

    a!.entrar('Alex')
    b!.entrar('Bruno')

    expect(b!.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
  })

  it('o cliente não altera o próprio estado diretamente', () => {
    const rede = redeDiferida()
    const a = new Sessao(rede.conectar('pa'), rng)
    const tB = rede.conectar('pb')
    // O round-trip completo (cliente despacha -> host aplica -> host publica
    // -> cliente adota) termina antes da asserção rodar, então a forma final
    // do estado não distingue um cliente que também aplicasse localmente. O
    // que só o host legitimamente faz é publicar (`enviarEstado`).
    const enviarEstadoSpy = vi.spyOn(tB, 'enviarEstado')
    const b = new Sessao(tB, rng)
    rede.bombear()
    passarJanela([a, b])

    b.despachar({ tipo: 'entrar', apelido: 'Bruno' })

    expect(enviarEstadoSpy).not.toHaveBeenCalled()
    expect(b.estado().jogadores).toHaveLength(1)
    expect(b.estado().jogadores[0]!.peerId).toBe('pb')
  })

  it('o host descarta ação inválida em silêncio', () => {
    const { sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')

    b!.despachar({ tipo: 'apostar', valor: 999999 })

    expect(b!.estado().jogadores.find((j) => j.peerId === 'pb')!.maos).toHaveLength(0)
  })

  it('notifica os assinantes quando o estado muda', () => {
    const { sessoes: [a] } = abrirSala(['pa'])
    const mudou = vi.fn()
    a!.aoMudar(mudou)

    a!.entrar('Alex')

    expect(mudou).toHaveBeenCalled()
  })

  it('a entrada de um peer com id menor não derruba o host nem orfaniza a mesa', () => {
    // 'pb' e 'pc' abrem a sala: 'pb' é o host.
    const { rede, sessoes: [b, c] } = abrirSala(['pb', 'pc'])
    b!.entrar('Bruno')
    c!.entrar('Carla')
    b!.despachar({ tipo: 'sentar', cadeira: 0 })
    c!.despachar({ tipo: 'sentar', cadeira: 1 })

    // 'pa' ordena antes de 'pb' e 'pc' lexicograficamente, mas chega por
    // último — a entrada não deve reeleger ninguém.
    const a = new Sessao(rede.conectar('pa'), rng)
    rede.bombear()
    passarJanela([a, b!, c!])
    a.entrar('Ana')

    expect(b!.souHost()).toBe(true)
    expect(a.souHost()).toBe(false)
    expect(a.estado().hostAtual).toBe('pb')
    // o recém-chegado recebeu a mesa real (jogadores, cadeiras e fichas
    // já existentes), não um Contexto vazio orfanizado.
    expect(a.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Ana', 'Bruno', 'Carla'])
    const bruno = a.estado().jogadores.find((j) => j.apelido === 'Bruno')!
    expect(bruno.cadeira).toBe(0)
    expect(bruno.fichas).toBe(REGRAS.stackInicial)
  })
})

describe('migração de host', () => {
  it('o próximo peer assume quando o host sai', () => {
    const { transportes: [tA], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')

    expect(b!.souHost()).toBe(false)
    tA!.sair()

    expect(b!.souHost()).toBe(true)
    expect(b!.estado().hostAtual).toBe('pb')
  })

  it('o novo host preserva jogadores e fichas', () => {
    const { transportes: [tA], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')
    b!.despachar({ tipo: 'sentar', cadeira: 0 })

    tA!.sair()

    const bruno = b!.estado().jogadores.find((j) => j.peerId === 'pb')!
    expect(bruno.fichas).toBe(REGRAS.stackInicial)
    expect(bruno.cadeira).toBe(0)
  })

  it('o novo host reconstrói uma sapata sem as cartas já vistas', () => {
    const { transportes: [tA], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')
    a!.despachar({ tipo: 'sentar', cadeira: 0 })
    b!.despachar({ tipo: 'sentar', cadeira: 1 })
    a!.despachar({ tipo: 'apostar', valor: 100 })
    b!.despachar({ tipo: 'apostar', valor: 100 })

    const vistasAntes = b!.estado().jogadores.flatMap((j) =>
      j.maos.flatMap((m) => m.cartas),
    ).length

    tA!.sair()

    expect(b!.souHost()).toBe(true)
    // A sapata reconstruída desconta exatamente as cartas visíveis (mãos dos
    // jogadores + carta aberta do dealer). A carta oculta do dealer nunca foi
    // transmitida, então o novo host compra uma substituta — esse saque, como
    // qualquer outro, consome mais uma carta da sapata reconstruída.
    const cartasVistasTotais = vistasAntes + b!.estado().maoDealer.length
    expect(b!.estado().cartasRestantes)
      .toBe(REGRAS.numBaralhos * 52 - cartasVistasTotais - 1)
  })

  it('marca quem saiu como ausente em vez de remover na hora', () => {
    const { transportes: [tA], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')

    tA!.sair()

    const alex = b!.estado().jogadores.find((j) => j.apelido === 'Alex')
    expect(alex).toBeDefined()
    expect(alex!.desconectadoEm).not.toBeNull()
  })

  it('com três peers, os dois sobreviventes concordam sobre o novo host', () => {
    const { transportes: [tA], sessoes: [a, b, c] } = abrirSala(['pa', 'pb', 'pc'])
    a!.entrar('Alex')
    b!.entrar('Bruno')
    c!.entrar('Carla')

    // A rede falsa notifica os sobreviventes em sequência: 'pb' processa a
    // saída primeiro e publica de dentro do próprio handler, o que pode
    // alcançar 'pc' antes que ele tenha processado a saída de 'pa'. A
    // autodeclaração no payload precisa fechar essa corrida mesmo assim.
    tA!.sair()

    expect(b!.souHost()).toBe(true)
    expect(c!.souHost()).toBe(false)
    expect(c!.estado().hostAtual).toBe('pb')
    const alexParaC = c!.estado().jogadores.find((j) => j.apelido === 'Alex')
    expect(alexParaC).toBeDefined()
    expect(alexParaC!.desconectadoEm).not.toBeNull()
  })

  it('sobrevive a uma migração de host no meio da fase paceada do dealer', () => {
    const { transportes: [tA], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')
    a!.despachar({ tipo: 'sentar', cadeira: 0 })
    b!.despachar({ tipo: 'sentar', cadeira: 1 })
    a!.despachar({ tipo: 'apostar', valor: 100 })
    b!.despachar({ tipo: 'apostar', valor: 100 })

    // Se o dealer mostra Ás, resolve o seguro por ação explícita (não por
    // prazo): esperar os 30s do prazo do turno consumiria quase toda a
    // janela de 60s de reconexão do REGRAS.segundosReconexao, e o próprio
    // Alex (peerId do host que vai cair) seria expurgado antes da rodada
    // terminar — o que testaria expiração de ausência, não a migração.
    if (a!.estado().fase === 'seguro') {
      a!.despachar({ tipo: 'seguro', aceitar: false })
      b!.despachar({ tipo: 'seguro', aceitar: false })
    }

    const alex = a!.estado().jogadores.find((j) => j.peerId === 'pa')!
    const bruno = a!.estado().jogadores.find((j) => j.peerId === 'pb')!
    a!.despachar({ tipo: 'parar', maoId: alex.maos[0]!.id })
    b!.despachar({ tipo: 'parar', maoId: bruno.maos[0]!.id })
    expect(a!.estado().fase).toBe('dealer')

    // Força um total baixo para o dealer: garante várias compras antes de
    // resolver, para que a migração aconteça genuinamente no meio da série
    // (não só na borda entre fases). `estado()` devolve a referência viva
    // do Contexto do host, então a mutação direta é visível ao próprio host.
    a!.estado().maoDealer = [
      { valor: '2', naipe: 'copas' },
      { valor: '2', naipe: 'ouros' },
    ]

    // `despachar` usa Date.now() internamente, então `agora` parte daí e só
    // cresce por incrementos pequenos — grandes o bastante para vencer os
    // prazos paceados (700ms/2500ms), mas pequenos o bastante para não
    // esbarrar na janela de 60s de reconexão de Alex ao longo do teste.
    let agora = Date.now() + REGRAS.msEntreCartasDealer + 1
    a!.tique(agora)
    expect(a!.estado().fase).toBe('dealer')
    expect(a!.estado().maoDealer.length).toBeGreaterThan(2)

    tA!.sair()
    expect(b!.souHost()).toBe(true)
    expect(b!.estado().fase).toBe('dealer')

    // O novo host continua paceando a rodada sozinho até ela resolver e
    // voltar para apostas — sem travar, sem perder jogadores ou fichas.
    const incremento = REGRAS.msMostrarResultado + 1
    let guarda = 0
    while (b!.estado().fase !== 'apostas' && guarda++ < 20) {
      agora += incremento
      b!.tique(agora)
    }

    expect(b!.estado().fase).toBe('apostas')
    const alexDepois = b!.estado().jogadores.find((j) => j.peerId === 'pa')!
    const brunoDepois = b!.estado().jogadores.find((j) => j.peerId === 'pb')!
    expect(alexDepois.maos).toHaveLength(0)
    expect(brunoDepois.maos).toHaveLength(0)
  })
})

describe('reconexão', () => {
  it('devolve cadeira e fichas a quem volta dentro da janela', () => {
    const { rede, transportes: [, tBAntigo], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')
    b!.despachar({ tipo: 'sentar', cadeira: 2 })

    // Bruno cai...
    tBAntigo!.sair()
    // ...e volta com outro peerId, mesmo apelido.
    const bruno = new Sessao(rede.conectar('pb-novo'), rng)
    rede.conectar('pz') // um terceiro peer na mesa, sem efeito na eleição
    rede.bombear()
    passarJanela([a!, bruno])
    bruno.entrar('Bruno')

    const voltou = a!.estado().jogadores.find((j) => j.apelido === 'Bruno')!
    expect(voltou.cadeira).toBe(2)
    expect(voltou.fichas).toBe(REGRAS.stackInicial)
  })

  it('remove o ausente depois da janela de reconexão', () => {
    const { transportes: [, tB], sessoes: [a, b] } = abrirSala(['pa', 'pb'])
    a!.entrar('Alex')
    b!.entrar('Bruno')

    tB!.sair()
    expect(a!.estado().jogadores).toHaveLength(2)

    a!.tique(Date.now() + REGRAS.segundosReconexao * 1000 + 1)

    expect(a!.estado().jogadores.map((j) => j.apelido)).toEqual(['Alex'])
  })
})
