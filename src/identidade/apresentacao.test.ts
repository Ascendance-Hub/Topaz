import { describe, it, expect, vi } from 'vitest'
import { Apresentacao } from './apresentacao'
import { gerarIdentidade, impressaoDigital } from './chaves'

const SALA = 'K7X2QW9FM3PRTVN4'

/** Duas pontas ligadas por um canal falso: o que uma envia, a outra recebe. */
function ligar(sala = SALA) {
  const lados = new Map<string, {
    aoMsg: ((m: unknown, de: string) => void)[]
    aoEntrar: ((p: string) => void)[]
    aoSair: ((p: string) => void)[]
  }>()

  const canalDe = (eu: string) => {
    const meu = { aoMsg: [], aoEntrar: [], aoSair: [] } as never as NonNullable<
      ReturnType<typeof lados.get>
    >
    lados.set(eu, meu)
    return {
      enviarIdentidade(mensagem: unknown, para?: string) {
        for (const [id, lado] of lados) {
          if (id === eu) continue
          if (para !== undefined && id !== para) continue
          // Como na rede: o payload passa por JSON e chega como dado cru.
          for (const cb of lado.aoMsg) cb(JSON.parse(JSON.stringify(mensagem)), eu)
        }
      },
      aoReceberIdentidade: (cb: (m: unknown, de: string) => void) => { meu.aoMsg.push(cb) },
      aoEntrarPeer: (cb: (p: string) => void) => { meu.aoEntrar.push(cb) },
      aoSairPeer: (cb: (p: string) => void) => { meu.aoSair.push(cb) },
    }
  }

  return {
    canalDe,
    sala,
    apresentar(a: string, b: string) {
      for (const cb of lados.get(a)!.aoEntrar) cb(b)
      for (const cb of lados.get(b)!.aoEntrar) cb(a)
    },
    sair(quem: string, para: string) {
      for (const cb of lados.get(para)!.aoSair) cb(quem)
    },
  }
}

/**
 * Deixa a troca assentar.
 *
 * `setTimeout` e não `Promise.resolve()`: as operações do `crypto.subtle` NÃO
 * resolvem em microtarefa, então drenar a fila de promessas nunca dá a vez
 * para elas terminarem. Foi assim que este arquivo me convenceu de que o
 * código estava quebrado quando o quebrado era o teste.
 */
async function assentar(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('Apresentacao', () => {
  it('as duas pessoas provam quem são, uma para a outra', async () => {
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    const ladoB = new Apresentacao(rede.canalDe('b'), bruno.par, SALA)

    rede.apresentar('a', 'b')
    await assentar()

    expect(ladoA.seloDe('b')).toBe(await impressaoDigital(bruno.par.publicKey))
    expect(ladoB.seloDe('a')).toBe(await impressaoDigital(alex.par.publicKey))
  })

  it('avisa quando alguém foi verificado', async () => {
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const verificados: [string, string][] = []
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    ladoA.aoVerificar((peerId, selo) => verificados.push([peerId, selo]))
    new Apresentacao(rede.canalDe('b'), bruno.par, SALA)

    rede.apresentar('a', 'b')
    await assentar()

    expect(verificados).toEqual([['b', await impressaoDigital(bruno.par.publicKey)]])
  })

  it('mensagem repetida não gera aviso novo nem resposta nova', async () => {
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const canalA = rede.canalDe('a')
    const ladoA = new Apresentacao(canalA, alex.par, SALA)
    const avisos = vi.fn()
    ladoA.aoVerificar(avisos)
    const canalB = rede.canalDe('b')
    new Apresentacao(canalB, bruno.par, SALA)
    rede.apresentar('a', 'b')
    await assentar()
    const enviosAntes = vi.spyOn(canalA, 'enviarIdentidade')

    // O mesmo `ola` chegando de novo — duplicata da rede, ou repetição de
    // alguém tentando arrancar assinaturas nossas de graça.
    canalB.enviarIdentidade({ tipo: 'ola', publica: 'x', desafio: 'outro' }, 'a')
    await assentar()

    expect(avisos).toHaveBeenCalledTimes(1)
    expect(enviosAntes).not.toHaveBeenCalled()
  })

  it('reconectar prova de novo — o selo antigo não vale para a conexão nova', async () => {
    // Comportamento de propósito, e não descuido: `onPeerJoin` disparar outra
    // vez significa OUTRA conexão. Herdar o selo da anterior seria confiar num
    // handshake que esta conexão não fez.
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    const avisos = vi.fn()
    ladoA.aoVerificar(avisos)
    new Apresentacao(rede.canalDe('b'), bruno.par, SALA)

    rede.apresentar('a', 'b')
    await assentar()
    rede.apresentar('a', 'b')
    await assentar()

    expect(avisos).toHaveBeenCalledTimes(2)
    expect(ladoA.seloDe('b')).toBe(await impressaoDigital(bruno.par.publicKey))
  })

  it('a troca termina — não fica um respondendo ao outro para sempre', async () => {
    // `prova` não carrega desafio justamente para não gerar resposta. Se
    // gerasse, dois navegadores ficariam trocando mensagens sem parar.
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const canalA = rede.canalDe('a')
    const espia = vi.spyOn(canalA, 'enviarIdentidade')
    new Apresentacao(canalA, alex.par, SALA)
    new Apresentacao(rede.canalDe('b'), bruno.par, SALA)

    rede.apresentar('a', 'b')
    await assentar()

    // Um `ola` e uma `prova`. Mais que isso é conversa que não acaba.
    expect(espia).toHaveBeenCalledTimes(2)
  })

  it('quem sai perde o selo — o peerId é da conexão, não da pessoa', async () => {
    // Sem isto, quem entrasse depois reaproveitando o mesmo id herdaria uma
    // verificação que nunca fez.
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    new Apresentacao(rede.canalDe('b'), bruno.par, SALA)
    rede.apresentar('a', 'b')
    await assentar()

    rede.sair('b', 'a')

    expect(ladoA.seloDe('b')).toBeUndefined()
  })

  it('mensagem de quem nunca entrou é ignorada', async () => {
    // Sem estado não há desafio meu para conferir contra, e responder às cegas
    // seria assinar o que qualquer um mandar.
    const rede = ligar()
    const alex = await gerarIdentidade()
    const canalA = rede.canalDe('a')
    const ladoA = new Apresentacao(canalA, alex.par, SALA)
    const espia = vi.spyOn(canalA, 'enviarIdentidade')
    const intruso = rede.canalDe('z')

    intruso.enviarIdentidade({ tipo: 'ola', publica: 'x', desafio: 'y' })
    await assentar()

    expect(espia).not.toHaveBeenCalled()
    expect(ladoA.seloDe('z')).toBeUndefined()
  })

  it('impostor que copia a chave pública alheia não ganha selo', async () => {
    // O ataque que a prova existe para impedir: a chave pública circula na
    // sala, então afirmar uma identidade é trivial.
    const rede = ligar()
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    const canalZ = rede.canalDe('z')
    rede.apresentar('a', 'z')
    await assentar()

    const { exportarPublica } = await import('./chaves')
    canalZ.enviarIdentidade({
      tipo: 'prova',
      publica: await exportarPublica(bruno.par.publicKey),
      assinatura: 'YWFhYQ==',
    }, 'a')
    await assentar()

    expect(ladoA.seloDe('z')).toBeUndefined()
  })

  it('lixo no lugar da mensagem não derruba nada', async () => {
    const rede = ligar()
    const alex = await gerarIdentidade()
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    const canalZ = rede.canalDe('z')
    rede.apresentar('a', 'z')
    await assentar()

    for (const ruim of [null, 42, 'texto', [], { tipo: 'ola' }, { tipo: 'prova' }]) {
      canalZ.enviarIdentidade(ruim, 'a')
    }
    await assentar()

    expect(ladoA.seloDe('z')).toBeUndefined()
  })

  it('prova feita para OUTRA sala não vale nesta', async () => {
    const alex = await gerarIdentidade()
    const bruno = await gerarIdentidade()
    const rede = ligar()
    const ladoA = new Apresentacao(rede.canalDe('a'), alex.par, SALA)
    // O outro lado acha que está noutra sala: a assinatura sai amarrada lá.
    new Apresentacao(rede.canalDe('b'), bruno.par, 'OUTRASALAAQUI999')

    rede.apresentar('a', 'b')
    await assentar()

    expect(ladoA.seloDe('b')).toBeUndefined()
  })
})
