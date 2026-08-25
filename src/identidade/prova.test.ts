import { describe, it, expect, vi } from 'vitest'
import { conferir, criarDesafio, responder, textoDoDesafio } from './prova'
import { exportarPublica, gerarIdentidade, impressaoDigital } from './chaves'

const SALA = 'K7X2QW9FM3PRTVN4'

async function pessoa() {
  const { par } = await gerarIdentidade()
  return {
    par,
    publica: await exportarPublica(par.publicKey),
    selo: await impressaoDigital(par.publicKey),
  }
}

describe('criarDesafio', () => {
  it('nunca repete', () => {
    const vistos = new Set(Array.from({ length: 500 }, () => criarDesafio()))
    expect(vistos.size).toBe(500)
  })

  it('vem da fonte criptográfica, não de Math.random', () => {
    // Um desafio previsível deixaria alguém preparar a resposta antes da
    // pergunta, e a prova inteira viraria enfeite.
    const espia = vi.spyOn(crypto, 'getRandomValues')
    try {
      criarDesafio()
      expect(espia).toHaveBeenCalled()
    } finally {
      espia.mockRestore()
    }
  })
})

describe('textoDoDesafio', () => {
  it('amarra o desafio à sala', () => {
    expect(textoDoDesafio('abc', 'SALA-A')).not.toBe(textoDoDesafio('abc', 'SALA-B'))
  })

  it('tem prefixo próprio, para não colidir com outra coisa assinada', () => {
    expect(textoDoDesafio('abc', 'S')).toContain('topaz:identidade:')
  })
})

describe('responder e conferir', () => {
  it('quem tem a chave prova, e o selo bate', async () => {
    const alex = await pessoa()
    const desafio = criarDesafio()

    const firma = await responder(alex.par.privateKey, desafio, SALA)

    expect(await conferir(alex.publica, desafio, SALA, firma)).toBe(alex.selo)
  })

  it('impostor com a chave pública de outro NÃO prova', async () => {
    // O caso que motiva tudo: a chave pública circula na sala, então afirmar
    // uma identidade é trivial. Provar não é.
    const alex = await pessoa()
    const impostor = await pessoa()
    const desafio = criarDesafio()

    const firma = await responder(impostor.par.privateKey, desafio, SALA)

    expect(await conferir(alex.publica, desafio, SALA, firma)).toBeNull()
  })

  it('resposta a OUTRO desafio não vale', async () => {
    // Sem isto, uma assinatura capturada uma vez valeria para sempre.
    const alex = await pessoa()

    const firma = await responder(alex.par.privateKey, criarDesafio(), SALA)

    expect(await conferir(alex.publica, criarDesafio(), SALA, firma)).toBeNull()
  })

  it('prova dada NOUTRA sala não vale aqui', async () => {
    // Sem a amarra da sala, quem só assistiu a uma conversa poderia repetir a
    // prova alheia noutro lugar.
    const alex = await pessoa()
    const desafio = criarDesafio()

    const firma = await responder(alex.par.privateKey, desafio, 'OUTRA-SALA-AQUI')

    expect(await conferir(alex.publica, desafio, SALA, firma)).toBeNull()
  })

  it('lixo no lugar da assinatura devolve null, não estoura', async () => {
    const alex = await pessoa()
    const desafio = criarDesafio()

    for (const ruim of ['', 'não é base64!', 'AAAA', null, undefined, 42, {}]) {
      expect(await conferir(alex.publica, desafio, SALA, ruim)).toBeNull()
    }
  })

  it('lixo no lugar da chave pública devolve null, não estoura', async () => {
    const desafio = criarDesafio()

    for (const ruim of ['', 'lixo', null, undefined, 42, {}]) {
      expect(await conferir(ruim, desafio, SALA, 'AAAA')).toBeNull()
    }
  })

  it('a prova continua valendo depois de a chave ir e voltar pela rede', async () => {
    // Quem confere recebe a chave como texto, nunca o objeto.
    const alex = await pessoa()
    const desafio = criarDesafio()
    const firma = await responder(alex.par.privateKey, desafio, SALA)

    const comoChegaNaRede = JSON.parse(JSON.stringify({ p: alex.publica })).p

    expect(await conferir(comoChegaNaRede, desafio, SALA, firma)).toBe(alex.selo)
  })
})
