import { describe, it, expect } from 'vitest'
import {
  assinar, ehSegredoValido, exportarPublica, gerarIdentidade, importarPublica,
  importarSegredo, impressaoDigital, TAMANHO_SELO, verificar,
} from './chaves'

describe('gerarIdentidade', () => {
  it('devolve um par utilizável e um segredo para guardar', async () => {
    const { par, segredo } = await gerarIdentidade()

    expect(par.privateKey.type).toBe('private')
    expect(par.publicKey.type).toBe('public')
    expect(ehSegredoValido(segredo)).toBe(true)
  })

  it('a chave guardada NÃO é extraível', async () => {
    // O ponto central do desenho. Um segredo em texto no navegador é lido por
    // qualquer script da origem — uma extensão basta. Uma chave não extraível
    // pode ser USADA para assinar, mas o material nunca pode ser lido: nem por
    // um script hostil, nem por nós.
    const { par } = await gerarIdentidade()

    expect(par.privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('jwk', par.privateKey)).rejects.toThrow()
  })

  it('duas identidades nunca coincidem', async () => {
    const a = await gerarIdentidade()
    const b = await gerarIdentidade()

    expect(await impressaoDigital(a.par.publicKey))
      .not.toBe(await impressaoDigital(b.par.publicKey))
  })
})

describe('segredo de recuperação', () => {
  it('reconstrói a MESMA identidade noutro dispositivo', async () => {
    // É isto que faz "entrar com o meu ID noutro computador" funcionar.
    const { par, segredo } = await gerarIdentidade()
    const selo = await impressaoDigital(par.publicKey)

    const recuperado = await importarSegredo(segredo)

    expect(await impressaoDigital(recuperado.publicKey)).toBe(selo)
  })

  it('a chave recuperada assina, e a original verifica', async () => {
    const { par, segredo } = await gerarIdentidade()
    const recuperado = await importarSegredo(segredo)

    const firma = await assinar(recuperado.privateKey, 'desafio')

    expect(await verificar(par.publicKey, 'desafio', firma)).toBe(true)
  })

  it('a chave recuperada também não é extraível', async () => {
    // Importar não pode ser a porta dos fundos que devolve o material em
    // texto: quem cola o segredo numa máquina emprestada deixaria a chave
    // legível ali.
    const { segredo } = await gerarIdentidade()

    const recuperado = await importarSegredo(segredo)

    expect(recuperado.privateKey.extractable).toBe(false)
  })

  it('recusa segredo malformado em vez de estourar', async () => {
    for (const ruim of ['', 'abc', 'a.b', 'a.b.c.d', 'não é base64!.x.y']) {
      expect(ehSegredoValido(ruim)).toBe(false)
      await expect(importarSegredo(ruim)).rejects.toThrow()
    }
  })

  it('recusa o que nem é texto', () => {
    for (const ruim of [null, undefined, 42, {}]) {
      expect(ehSegredoValido(ruim)).toBe(false)
    }
  })

  it('é copiável numa linha — ninguém digita isso à mão', async () => {
    const { segredo } = await gerarIdentidade()

    expect(segredo).not.toMatch(/\s/)
    expect(segredo.length).toBeLessThan(200)
  })
})

describe('impressão digital', () => {
  it('é curta e sem caracteres ambíguos', async () => {
    const { par } = await gerarIdentidade()

    const selo = await impressaoDigital(par.publicKey)

    expect(selo).toHaveLength(TAMANHO_SELO)
    // Mesmo alfabeto do código de sala: o selo existe para duas pessoas
    // COMPARAREM em voz alta, e O/0 e I/1 arruinariam isso.
    expect(selo).not.toMatch(/[O0I1L]/)
  })

  it('a mesma chave dá sempre o mesmo selo', async () => {
    const { par } = await gerarIdentidade()

    expect(await impressaoDigital(par.publicKey))
      .toBe(await impressaoDigital(par.publicKey))
  })

  it('sobrevive à ida e volta pela rede', async () => {
    // A chave pública viaja como texto. Se o selo mudasse no caminho, duas
    // pessoas comparando veriam valores diferentes para a mesma identidade.
    const { par } = await gerarIdentidade()

    const viajada = await importarPublica(await exportarPublica(par.publicKey))

    expect(await impressaoDigital(viajada)).toBe(await impressaoDigital(par.publicKey))
  })
})

describe('assinar e verificar', () => {
  it('a assinatura de quem tem a chave passa', async () => {
    const { par } = await gerarIdentidade()

    const firma = await assinar(par.privateKey, 'prove que é você')

    expect(await verificar(par.publicKey, 'prove que é você', firma)).toBe(true)
  })

  it('assinatura de OUTRA identidade não passa', async () => {
    // Sem isto, "provar quem sou" seria só afirmar.
    const eu = await gerarIdentidade()
    const impostor = await gerarIdentidade()

    const firma = await assinar(impostor.par.privateKey, 'desafio')

    expect(await verificar(eu.par.publicKey, 'desafio', firma)).toBe(false)
  })

  it('assinatura válida de OUTRO texto não passa', async () => {
    // Reaproveitar uma assinatura antiga para responder a um desafio novo é o
    // ataque óbvio contra este esquema.
    const { par } = await gerarIdentidade()

    const firma = await assinar(par.privateKey, 'desafio antigo')

    expect(await verificar(par.publicKey, 'desafio novo', firma)).toBe(false)
  })

  it('lixo no lugar da assinatura devolve falso, não explode', async () => {
    const { par } = await gerarIdentidade()

    for (const ruim of ['', 'não é base64!', 'AAAA', null, undefined, 42]) {
      expect(await verificar(par.publicKey, 'x', ruim)).toBe(false)
    }
  })

  it('chave pública malformada devolve falso, não explode', async () => {
    await expect(importarPublica('lixo')).rejects.toThrow()
  })
})
