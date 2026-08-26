import { describe, it, expect, vi } from 'vitest'
import { observarGrupos, MAX_OBSERVADOS } from './presenca'
import type { SalaDeFundo } from './presenca'

/** Uma sala de fundo controlável, para provocar entrada e saída na mão. */
function fabrica() {
  const abertas = new Map<string, {
    chega: (id: string) => void
    vaiEmbora: (id: string) => void
    fechada: boolean
  }>()

  const abrir = (codigo: string): SalaDeFundo => {
    const estado = {
      chega: (_id: string) => {},
      vaiEmbora: (_id: string) => {},
      fechada: false,
    }
    abertas.set(codigo, estado)
    return {
      aoEntrarPeer: (cb) => { estado.chega = cb },
      aoSairPeer: (cb) => { estado.vaiEmbora = cb },
      sair: () => { estado.fechada = true },
    }
  }

  return { abrir, abertas }
}

describe('observarGrupos', () => {
  it('abre uma sala de fundo por grupo salvo', () => {
    const { abrir, abertas } = fabrica()

    observarGrupos(['aaa', 'bbb'], abrir)

    expect([...abertas.keys()]).toEqual(['aaa', 'bbb'])
  })

  it('sem ninguém, um grupo tem zero', () => {
    const { abrir } = fabrica()

    const p = observarGrupos(['aaa'], abrir)

    expect(p.quantos('aaa')).toBe(0)
  })

  it('quem chega é contado', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)

    abertas.get('aaa')!.chega('pa')

    expect(p.quantos('aaa')).toBe(1)
  })

  it('não conto eu mesmo — sou passivo lá, não estou lá', () => {
    // "3 online" precisa significar três OUTRAS pessoas. Contar a si mesmo
    // faria todo grupo salvo parecer ocupado.
    const { abrir } = fabrica()

    const p = observarGrupos(['aaa'], abrir)

    expect(p.quantos('aaa')).toBe(0)
  })

  it('a mesma pessoa duas vezes conta uma', () => {
    // O Trystero pode reanunciar; contar duas vezes inflaria a sala.
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)

    abertas.get('aaa')!.chega('pa')
    abertas.get('aaa')!.chega('pa')

    expect(p.quantos('aaa')).toBe(1)
  })

  it('quem sai deixa de ser contado', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    abertas.get('aaa')!.chega('pa')

    abertas.get('aaa')!.vaiEmbora('pa')

    expect(p.quantos('aaa')).toBe(0)
  })

  it('cada grupo tem a sua conta', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa', 'bbb'], abrir)

    abertas.get('aaa')!.chega('pa')

    expect(p.quantos('aaa')).toBe(1)
    expect(p.quantos('bbb')).toBe(0)
  })

  it('um grupo que não observo tem zero, e não estoura', () => {
    const { abrir } = fabrica()

    const p = observarGrupos(['aaa'], abrir)

    expect(p.quantos('nunca-visto')).toBe(0)
  })

  it('avisa quem desenha quando a conta muda', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    const mudou = vi.fn()
    p.aoMudar(mudou)

    abertas.get('aaa')!.chega('pa')

    expect(mudou).toHaveBeenCalled()
  })

  it('não avisa quando nada mudou', () => {
    // A mesma pessoa reanunciando redesenharia a tela inicial à toa.
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    abertas.get('aaa')!.chega('pa')
    const mudou = vi.fn()
    p.aoMudar(mudou)

    abertas.get('aaa')!.chega('pa')

    expect(mudou).not.toHaveBeenCalled()
  })
})

describe('acompanhar a lista de grupos', () => {
  it('um grupo novo ganha sala de fundo', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)

    p.sincronizar(['aaa', 'bbb'])

    expect([...abertas.keys()]).toEqual(['aaa', 'bbb'])
  })

  it('um grupo removido tem a sala fechada', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa', 'bbb'], abrir)

    p.sincronizar(['aaa'])

    expect(abertas.get('bbb')!.fechada).toBe(true)
  })

  it('quem continua não é reaberto', () => {
    // Reabrir custa handshake e zeraria a contagem por um instante.
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    abertas.get('aaa')!.chega('pa')

    p.sincronizar(['aaa', 'bbb'])

    expect(p.quantos('aaa')).toBe(1)
    expect(abertas.get('aaa')!.fechada).toBe(false)
  })
})

describe('encerrar', () => {
  it('fecha todas as salas de fundo', () => {
    // Elas seguram assinatura em relay; deixar abertas ao trocar de sala
    // acumularia uma cópia por navegação.
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa', 'bbb'], abrir)

    p.encerrar()

    expect([...abertas.values()].every((s) => s.fechada)).toBe(true)
  })

  it('depois de encerrada, ninguém mais é avisado', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    const mudou = vi.fn()
    p.aoMudar(mudou)
    p.encerrar()

    abertas.get('aaa')!.chega('pa')

    expect(mudou).not.toHaveBeenCalled()
  })
})

describe('o teto de grupos observados', () => {
  it('observa até o teto, e diz o que deixou de fora', () => {
    // Cada sala de fundo assina relays. Um teto silencioso faria a pessoa
    // achar que o grupo está vazio quando ele só não está sendo olhado.
    const aviso = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { abrir, abertas } = fabrica()
    const muitos = Array.from({ length: MAX_OBSERVADOS + 3 }, (_, i) => `g${i}`)

    observarGrupos(muitos, abrir)

    expect(abertas.size).toBe(MAX_OBSERVADOS)
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('o teto é folgado para um grupo de amigos', () => {
    expect(MAX_OBSERVADOS).toBeGreaterThanOrEqual(6)
  })
})

/**
 * Por que encerrar precisa ser esperado.
 *
 * O `leave` do Trystero envia um aviso aos peers e ainda espera 99ms antes de
 * desregistrar a sala. Enquanto isso não termina, `joinRoom` no mesmo código
 * devolve a MESMA sala (`strategy.mjs`: `if (occupiedRooms[appId]?.[roomId])
 * return ...`). E a sala de fundo é PASSIVA: ela não anuncia.
 *
 * Sem a espera, entrar num grupo que a presença observava dava uma sala que
 * não anuncia. A pessoa entrava e ninguém a via.
 */
describe('encerrar é esperável', () => {
  function fabricaLenta() {
    const soltar: (() => void)[] = []
    const abrir = (): SalaDeFundo => ({
      aoEntrarPeer: () => {},
      aoSairPeer: () => {},
      sair: () => new Promise<void>((res) => soltar.push(res)),
    })
    return { abrir, soltar }
  }

  it('só termina quando todas as salas terminaram', async () => {
    const { abrir, soltar } = fabricaLenta()
    const p = observarGrupos(['aaa', 'bbb'], abrir)
    let terminou = false

    const fim = p.encerrar().then(() => { terminou = true })
    await Promise.resolve()

    expect(terminou).toBe(false)
    for (const solta of soltar) solta()
    await fim
    expect(terminou).toBe(true)
  })

  it('uma sala que falha ao sair não trava as outras', async () => {
    // O que importa é a sala sair do registro. Um aviso que não chegou a
    // ninguém não pode impedir a pessoa de trocar de sala.
    const abrir = (codigo: string): SalaDeFundo => ({
      aoEntrarPeer: () => {},
      aoSairPeer: () => {},
      sair: () => (codigo === 'aaa'
        ? Promise.reject(new Error('relay caiu'))
        : Promise.resolve()),
    })
    const p = observarGrupos(['aaa', 'bbb'], abrir)

    await expect(p.encerrar()).resolves.toBeUndefined()
  })

  it('uma sala que fecha sem promessa continua valendo', async () => {
    const { abrir } = fabrica()
    const p = observarGrupos(['aaa'], abrir)

    await expect(p.encerrar()).resolves.toBeUndefined()
  })
})
