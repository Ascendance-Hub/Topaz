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
 * Fechar UM grupo, e só ele.
 *
 * Entrar num grupo que a presença observava é o único ponto em que os dois
 * usos colidem: o Trystero devolve a MESMA sala quando se entra num id já
 * aberto, e a saída dele só desregistra depois de um envio e mais 99ms. Sem
 * esperar, a sala "nova" seria a passiva — que não anuncia.
 *
 * Um grupo, e nunca todos: enquanto as outras salas continuam registradas, a
 * piscina de relays do Trystero sobrevive. Esperar tudo foi o que deixou a
 * troca de sala lenta e falhando.
 */
describe('fecharUm', () => {
  it('fecha só a sala pedida', async () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa', 'bbb'], abrir)

    await p.fecharUm('aaa')

    expect(abertas.get('aaa')!.fechada).toBe(true)
    expect(abertas.get('bbb')!.fechada).toBe(false)
  })

  it('espera a saída terminar antes de devolver', async () => {
    let soltar = (): void => {}
    const abrir = (): SalaDeFundo => ({
      aoEntrarPeer: () => {},
      aoSairPeer: () => {},
      sair: () => new Promise<void>((res) => { soltar = res }),
    })
    const p = observarGrupos(['aaa'], abrir)
    let terminou = false

    const fim = p.fecharUm('aaa').then(() => { terminou = true })
    await Promise.resolve()
    expect(terminou).toBe(false)

    soltar()
    await fim
    expect(terminou).toBe(true)
  })

  it('o grupo fechado deixa de ser contado', async () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    abertas.get('aaa')!.chega('pa')

    await p.fecharUm('aaa')

    expect(p.quantos('aaa')).toBe(0)
  })

  it('fechar um grupo que não observo não estoura', async () => {
    const { abrir } = fabrica()
    const p = observarGrupos(['aaa'], abrir)

    await expect(p.fecharUm('nunca-visto')).resolves.toBeUndefined()
  })

  it('uma saída que falha não trava quem esperava', async () => {
    const abrir = (): SalaDeFundo => ({
      aoEntrarPeer: () => {},
      aoSairPeer: () => {},
      sair: () => Promise.reject(new Error('relay caiu')),
    })
    const p = observarGrupos(['aaa'], abrir)

    await expect(p.fecharUm('aaa')).resolves.toBeUndefined()
  })
})

/**
 * A mesma pessoa, achada por duas redes.
 *
 * A sala de fundo observa nostr E mqtt, e as duas chamam o mesmo ouvinte —
 * porque foi só assim que a presença passou a enxergar alguém: o diagnóstico
 * do app mostrou `nostr=0 mqtt=1`, ou seja, as máquinas se acham por mqtt e o
 * observador de nostr esperava numa rede vazia.
 *
 * O preço disso é o anúncio em dobro, e quem conta tem de aguentar.
 */
describe('duas redes, uma pessoa', () => {
  it('achada nas duas redes, conta uma vez', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)

    // Duas entregas do mesmo peerId, como se viessem de redes diferentes.
    abertas.get('aaa')!.chega('pa')
    abertas.get('aaa')!.chega('pa')

    expect(p.quantos('aaa')).toBe(1)
  })

  it('e avisa quem desenha uma vez só', () => {
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    const mudou = vi.fn()
    p.aoMudar(mudou)

    abertas.get('aaa')!.chega('pa')
    abertas.get('aaa')!.chega('pa')

    expect(mudou).toHaveBeenCalledTimes(1)
  })

  it('saindo de uma rede, some da conta', () => {
    // Presença é melhor-esforço: se a pessoa continuar visível pela outra
    // rede, o próximo anúncio a traz de volta. Errar para menos é melhor que
    // mostrar gente que já foi embora.
    const { abrir, abertas } = fabrica()
    const p = observarGrupos(['aaa'], abrir)
    abertas.get('aaa')!.chega('pa')

    abertas.get('aaa')!.vaiEmbora('pa')

    expect(p.quantos('aaa')).toBe(0)
  })
})

/**
 * A saída precisa ser esperável DE VERDADE.
 *
 * `fecharUm` existe para fechar a observação de um grupo antes de entrar nele,
 * porque o Trystero devolve a MESMA sala num id já aberto. Isso só funciona se
 * a promessa esperar mesmo — e houve uma versão em que `sair` devolvia `void`,
 * o `await` resolvia na hora, e a proteção não protegia nada.
 *
 * Com três redes por grupo, uma só delas demorando basta para o defeito voltar.
 */
describe('a espera do fecharUm não pode ser de mentira', () => {
  it('espera a rede mais LENTA das que a sala abriu', async () => {
    let soltarLenta = (): void => {}
    const abrir = (): SalaDeFundo => ({
      aoEntrarPeer: () => {},
      aoSairPeer: () => {},
      // Como a sala de fundo real: várias redes, e a promessa só fecha quando
      // todas fecharem.
      sair: () => Promise.all([
        Promise.resolve(),
        new Promise<void>((res) => { soltarLenta = res }),
      ]).then(() => undefined),
    })
    const p = observarGrupos(['aaa'], abrir)
    let terminou = false

    const fim = p.fecharUm('aaa').then(() => { terminou = true })
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(terminou).toBe(false)
    soltarLenta()
    await fim
    expect(terminou).toBe(true)
  })
})

/**
 * Sair do caminho de quem está conectando.
 *
 * Abrir salas de fundo no mesmo instante em que a sala de verdade se forma é
 * competir com ela — são três redes por grupo, todas assinando tópicos ao
 * mesmo tempo. E pior: a sala que se acabou de deixar ainda está registrada no
 * Trystero por ~100ms, então observar o grupo anterior nesse intervalo devolve
 * a sala ATIVA agonizando em vez de abrir uma passiva.
 *
 * Recarregar a página sempre funcionou justamente porque lá não há sala
 * nenhuma morrendo.
 */
describe('as salas de fundo entram espaçadas', () => {
  it('com pausa, nenhuma abre no mesmo instante do pedido', () => {
    vi.useFakeTimers()
    try {
      const { abrir, abertas } = fabrica()

      observarGrupos(['aaa', 'bbb'], abrir, 900)

      expect(abertas.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('elas abrem uma de cada vez', () => {
    vi.useFakeTimers()
    try {
      const { abrir, abertas } = fabrica()
      observarGrupos(['aaa', 'bbb'], abrir, 900)

      vi.advanceTimersByTime(900)
      expect([...abertas.keys()]).toEqual(['aaa'])

      vi.advanceTimersByTime(900)
      expect([...abertas.keys()]).toEqual(['aaa', 'bbb'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('encerrar cancela o que ainda não abriu', () => {
    // Uma abertura agendada que dispara depois do encerramento abriria uma
    // sala que ninguém mais vai fechar.
    vi.useFakeTimers()
    try {
      const { abrir, abertas } = fabrica()
      const p = observarGrupos(['aaa', 'bbb'], abrir, 900)

      p.encerrar()
      vi.advanceTimersByTime(5000)

      expect(abertas.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fecharUm impede a abertura que estava na fila', () => {
    // É o caso que quebrava: entrar num grupo que a presença ia observar. Sem
    // isto, a abertura dispararia logo depois e devolveria a sala ativa.
    vi.useFakeTimers()
    try {
      const { abrir, abertas } = fabrica()
      const p = observarGrupos(['aaa'], abrir, 900)

      void p.fecharUm('aaa')
      vi.advanceTimersByTime(5000)

      expect(abertas.has('aaa')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('um grupo tirado da lista antes da vez não abre', () => {
    vi.useFakeTimers()
    try {
      const { abrir, abertas } = fabrica()
      const p = observarGrupos(['aaa', 'bbb'], abrir, 900)

      p.sincronizar(['aaa'])
      vi.advanceTimersByTime(5000)

      expect([...abertas.keys()]).toEqual(['aaa'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('sem pausa, abre na hora — é o que os testes de lógica usam', () => {
    const { abrir, abertas } = fabrica()

    observarGrupos(['aaa'], abrir)

    expect(abertas.size).toBe(1)
  })
})

/**
 * O diagnóstico nasceu na caçada do Capítulo 13 — foi ele que revelou que a
 * presença ouvia só o nostr enquanto as máquinas se achavam por mqtt — e ficou
 * ligado depois dela. Um retrato a cada 10 s, para sempre, no console de quem
 * só quer jogar.
 *
 * O instrumento continua valendo, então ele não é apagado: é desligado por
 * padrão e volta com `?diag=presenca` na URL, do mesmo jeito que a sonda de
 * voz já fazia com `?diag=voz`.
 */
describe('o diagnóstico da presença não fala sozinho', () => {
  it('sem ?diag=presenca, observar um grupo não imprime nada', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { abrir } = fabrica()

    const p = observarGrupos(['aaa'], abrir)

    expect(info).not.toHaveBeenCalled()
    p.encerrar()
    info.mockRestore()
  })

  it('e o retrato periódico também não é agendado', () => {
    vi.useFakeTimers()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const { abrir } = fabrica()
      const p = observarGrupos(['aaa'], abrir)

      vi.advanceTimersByTime(60_000)

      expect(info).not.toHaveBeenCalled()
      p.encerrar()
    } finally {
      info.mockRestore()
      vi.useRealTimers()
    }
  })
})
