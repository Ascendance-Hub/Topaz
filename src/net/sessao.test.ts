import { describe, it, expect, vi } from 'vitest'
import { criarRedeFalsa } from './transport.fake'
import { elegerHost, Sessao } from './sessao'
import { rngSemente } from '../game/shoe'
import { REGRAS } from '../game/rules'

const rng = () => rngSemente(99)

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

describe('Sessao', () => {
  it('o menor peerId se reconhece como host', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    expect(a.souHost()).toBe(true)
    expect(b.souHost()).toBe(false)
  })

  it('propaga o estado do host para o cliente', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    a.entrar('Alex')
    b.entrar('Bruno')

    expect(b.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
  })

  it('o cliente não altera o próprio estado diretamente', () => {
    const rede = criarRedeFalsa()
    new Sessao(rede.conectar('pa'), rng)
    const tB = rede.conectar('pb')
    // A rede falsa entrega tudo de forma síncrona, então o round-trip
    // completo (cliente despacha -> host aplica -> host publica -> cliente
    // adota) termina antes da asserção rodar. Isso torna a forma final do
    // estado insuficiente para pegar um cliente que aplicasse a ação
    // localmente também: o resultado ficaria com a mesma cara. O que só o
    // host legitimamente faz é publicar (`enviarEstado`) — um cliente que
    // aplicasse localmente (bug) inevitavelmente chamaria isso também.
    const enviarEstadoSpy = vi.spyOn(tB, 'enviarEstado')
    const b = new Sessao(tB, rng)

    b.despachar({ tipo: 'entrar', apelido: 'Bruno' })

    expect(enviarEstadoSpy).not.toHaveBeenCalled()
    // o estado do cliente só muda quando o snapshot do host chega
    expect(b.estado().jogadores).toHaveLength(1)
    expect(b.estado().jogadores[0]!.peerId).toBe('pb')
  })

  it('o host descarta ação inválida em silêncio', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    b.despachar({ tipo: 'apostar', valor: 999999 })

    expect(b.estado().jogadores.find((j) => j.peerId === 'pb')!.maos).toHaveLength(0)
  })

  it('notifica os assinantes quando o estado muda', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const mudou = vi.fn()
    a.aoMudar(mudou)

    a.entrar('Alex')

    expect(mudou).toHaveBeenCalled()
  })

  it('a entrada de um peer com id menor não derruba o host nem orfaniza a mesa', () => {
    const rede = criarRedeFalsa()
    // 'pb' é o único peer quando a sala começa: ele é o host.
    const b = new Sessao(rede.conectar('pb'), rng)
    const c = new Sessao(rede.conectar('pc'), rng)
    b.entrar('Bruno')
    c.entrar('Carla')
    b.despachar({ tipo: 'sentar', cadeira: 0 })
    c.despachar({ tipo: 'sentar', cadeira: 1 })

    // 'pa' ordena antes de 'pb' e 'pc' lexicograficamente, mas chega por
    // último — a entrada não deve reeleger ninguém.
    const a = new Sessao(rede.conectar('pa'), rng)
    a.entrar('Ana')

    expect(b.souHost()).toBe(true)
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
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    expect(b.souHost()).toBe(false)
    tA.sair()

    expect(b.souHost()).toBe(true)
    expect(b.estado().hostAtual).toBe('pb')
  })

  it('o novo host preserva jogadores e fichas', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    b.despachar({ tipo: 'sentar', cadeira: 0 })

    tA.sair()

    const bruno = b.estado().jogadores.find((j) => j.peerId === 'pb')!
    expect(bruno.fichas).toBe(REGRAS.stackInicial)
    expect(bruno.cadeira).toBe(0)
  })

  it('o novo host reconstrói uma sapata sem as cartas já vistas', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    a.despachar({ tipo: 'sentar', cadeira: 0 })
    b.despachar({ tipo: 'sentar', cadeira: 1 })
    a.despachar({ tipo: 'apostar', valor: 100 })
    b.despachar({ tipo: 'apostar', valor: 100 })

    const vistasAntes = b.estado().jogadores.flatMap((j) =>
      j.maos.flatMap((m) => m.cartas),
    ).length

    tA.sair()

    expect(b.souHost()).toBe(true)
    // A sapata reconstruída desconta exatamente as cartas visíveis (mãos dos
    // jogadores + carta aberta do dealer). A carta oculta do dealer nunca foi
    // transmitida, então o novo host compra uma substituta — esse saque, como
    // qualquer outro, consome mais uma carta da sapata reconstruída.
    const cartasVistasTotais = vistasAntes + b.estado().maoDealer.length
    expect(b.estado().cartasRestantes)
      .toBe(REGRAS.numBaralhos * 52 - cartasVistasTotais - 1)
  })

  it('marca quem saiu como ausente em vez de remover na hora', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    tA.sair()

    const alex = b.estado().jogadores.find((j) => j.apelido === 'Alex')
    expect(alex).toBeDefined()
    expect(alex!.desconectadoEm).not.toBeNull()
  })

  it('com três peers, os dois sobreviventes concordam sobre o novo host', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    const c = new Sessao(rede.conectar('pc'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    c.entrar('Carla')

    // A rede falsa notifica os sobreviventes em sequência: 'pb' processa a
    // saída primeiro e publica de dentro do próprio handler, o que pode
    // alcançar 'pc' antes que ele tenha processado a saída de 'pa'. A
    // autodeclaração no payload (fix 2) precisa fechar essa corrida mesmo
    // assim.
    tA.sair()

    expect(b.souHost()).toBe(true)
    expect(c.souHost()).toBe(false)
    expect(c.estado().hostAtual).toBe('pb')
    const alexParaC = c.estado().jogadores.find((j) => j.apelido === 'Alex')
    expect(alexParaC).toBeDefined()
    expect(alexParaC!.desconectadoEm).not.toBeNull()
  })

  it('sobrevive a uma migração de host no meio da fase paceada do dealer', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    a.despachar({ tipo: 'sentar', cadeira: 0 })
    b.despachar({ tipo: 'sentar', cadeira: 1 })
    a.despachar({ tipo: 'apostar', valor: 100 })
    b.despachar({ tipo: 'apostar', valor: 100 })

    // Se o dealer mostra Ás, resolve o seguro por ação explícita (não por
    // prazo): esperar os 30s do prazo do turno consumiria quase toda a
    // janela de 60s de reconexão do REGRAS.segundosReconexao, e o próprio
    // Alex (peerId do host que vai cair) seria expurgado antes da rodada
    // terminar — o que testaria expiração de ausência, não a migração.
    if (a.estado().fase === 'seguro') {
      a.despachar({ tipo: 'seguro', aceitar: false })
      b.despachar({ tipo: 'seguro', aceitar: false })
    }

    const alex = a.estado().jogadores.find((j) => j.peerId === 'pa')!
    const bruno = a.estado().jogadores.find((j) => j.peerId === 'pb')!
    a.despachar({ tipo: 'parar', maoId: alex.maos[0]!.id })
    b.despachar({ tipo: 'parar', maoId: bruno.maos[0]!.id })
    expect(a.estado().fase).toBe('dealer')

    // Força um total baixo para o dealer: garante várias compras antes de
    // resolver, para que a migração aconteça genuinamente no meio da série
    // (não só na borda entre fases). `estado()` devolve a referência viva
    // do Contexto do host, então a mutação direta é visível ao próprio host.
    a.estado().maoDealer = [
      { valor: '2', naipe: 'copas' },
      { valor: '2', naipe: 'ouros' },
    ]

    // `despachar` usa Date.now() internamente, então `agora` parte daí e só
    // cresce por incrementos pequenos — grandes o bastante para vencer os
    // prazos paceados (700ms/2500ms), mas pequenos o bastante para não
    // esbarrar na janela de 60s de reconexão de Alex ao longo do teste.
    let agora = Date.now() + REGRAS.msEntreCartasDealer + 1
    a.tique(agora)
    expect(a.estado().fase).toBe('dealer')
    expect(a.estado().maoDealer.length).toBeGreaterThan(2)

    tA.sair()
    expect(b.souHost()).toBe(true)
    expect(b.estado().fase).toBe('dealer')

    // O novo host continua paceando a rodada sozinho até ela resolver e
    // voltar para apostas — sem travar, sem perder jogadores ou fichas.
    const incremento = REGRAS.msMostrarResultado + 1
    let guarda = 0
    while (b.estado().fase !== 'apostas' && guarda++ < 20) {
      agora += incremento
      b.tique(agora)
    }

    expect(b.estado().fase).toBe('apostas')
    const alexDepois = b.estado().jogadores.find((j) => j.peerId === 'pa')!
    const brunoDepois = b.estado().jogadores.find((j) => j.peerId === 'pb')!
    expect(alexDepois.maos).toHaveLength(0)
    expect(brunoDepois.maos).toHaveLength(0)
  })
})

describe('reconexão', () => {
  it('devolve cadeira e fichas a quem volta dentro da janela', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const tBAntigo = rede.conectar('pb')
    const b = new Sessao(tBAntigo, rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    b.despachar({ tipo: 'sentar', cadeira: 2 })

    // Bruno cai...
    tBAntigo.sair()
    // ...e volta com outro peerId, mesmo apelido.
    const tB = rede.conectar('pb-novo')
    rede.conectar('pz') // um terceiro peer na mesa, sem efeito na eleição ('pa' continua o menor)
    const bruno = new Sessao(tB, rng)
    bruno.entrar('Bruno')

    const voltou = a.estado().jogadores.find((j) => j.apelido === 'Bruno')!
    expect(voltou.cadeira).toBe(2)
    expect(voltou.fichas).toBe(REGRAS.stackInicial)
  })

  it('remove o ausente depois da janela de reconexão', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const tB = rede.conectar('pb')
    const b = new Sessao(tB, rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    tB.sair()
    expect(a.estado().jogadores).toHaveLength(2)

    a.tique(Date.now() + REGRAS.segundosReconexao * 1000 + 1)

    expect(a.estado().jogadores.map((j) => j.apelido)).toEqual(['Alex'])
  })
})
