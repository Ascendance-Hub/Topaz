// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarNavSala, renderizarSalaParada, AVISO_SOZINHO, ROTULO_ESPERANDO } from './sala'
import type { EstadoJogo, Jogador } from '../../game/types'

function jogador(peerId: string, apelido: string): Jogador {
  return {
    peerId, apelido, cadeira: null, fichas: 1000, maos: [], maoAtiva: 0,
    seguro: 0, rodadasInativo: 0, desconectadoEm: null, decidiuSeguro: false,
    eliminadoEm: null,
  }
}

function estadoCom(...jogadores: Jogador[]): EstadoJogo {
  return {
    fase: 'aguardando', jogadores, vezDe: null, prazoTurno: null,
    maoDealer: [], dealerTemOculta: false, cartasRestantes: 312,
    hostAtual: 'eu', rodada: 0, proximoIdMao: 1, vencedor: null, naPartida: [],
  }
}

describe('renderizarNavSala', () => {
  it('marca a sala como atual quando a mesa está fechada', () => {
    const nav = renderizarNavSala(false, vi.fn())

    expect(nav.querySelector('[data-nav="sala"]')!.getAttribute('aria-current')).toBe('page')
    expect(nav.querySelector('[data-nav="mesa"]')!.getAttribute('aria-current')).toBeNull()
  })

  it('marca a mesa como atual quando ela está aberta', () => {
    const nav = renderizarNavSala(true, vi.fn())

    expect(nav.querySelector('[data-nav="mesa"]')!.getAttribute('aria-current')).toBe('page')
  })

  it('clicar em Mesa pede para abrir', () => {
    const alternar = vi.fn()
    const nav = renderizarNavSala(false, alternar)

    nav.querySelector<HTMLButtonElement>('[data-nav="mesa"]')!.click()

    expect(alternar).toHaveBeenCalledWith(true)
  })

  it('clicar em Sala pede para fechar a mesa', () => {
    const alternar = vi.fn()
    const nav = renderizarNavSala(true, alternar)

    nav.querySelector<HTMLButtonElement>('[data-nav="sala"]')!.click()

    expect(alternar).toHaveBeenCalledWith(false)
  })
})

describe('renderizarSalaParada', () => {
  it('lista quem está na sala', () => {
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), jogador('p2', 'Bruno')), 'eu')

    const nomes = [...tela.querySelectorAll('.sala-quem')].map((n) => n.textContent)
    expect(nomes).toEqual(['Alex', 'Bruno'])
  })

  it('avisa quando você está sozinho, em vez de mostrar uma lista de um', () => {
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex')), 'eu')

    expect(tela.textContent).toContain(AVISO_SOZINHO)
  })

  it('não avisa que está sozinho quando há mais gente', () => {
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), jogador('p2', 'Bruno')), 'eu')

    expect(tela.textContent).not.toContain(AVISO_SOZINHO)
  })

  it('não esconde quem está desconectado, mas marca', () => {
    const caido = { ...jogador('p2', 'Bruno'), desconectadoEm: 1000 }
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), caido), 'eu')

    const marcado = tela.querySelector('.sala-quem[data-caiu="1"]')
    expect(marcado!.textContent).toBe('Bruno')
  })

  it('nunca interpreta o apelido como HTML — ele vem de outro navegador', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const tela = renderizarSalaParada(estadoCom(jogador('p2', malicioso)), 'eu')

    expect(tela.querySelector('img')).toBeNull()
    expect(tela.textContent).toContain(malicioso)
  })
})

describe('a marca de "a mesa espera por você"', () => {
  it('não marca nada quando a mesa não precisa de você', () => {
    const nav = renderizarNavSala(false, vi.fn(), false)

    const mesa = nav.querySelector<HTMLElement>('[data-nav="mesa"]')!
    expect(mesa.dataset['espera']).toBeUndefined()
    expect(nav.querySelector('.nav-sala-marca')).toBeNull()
  })

  it('marca o botão da mesa quando ela está esperando você', () => {
    const nav = renderizarNavSala(false, vi.fn(), true)

    const mesa = nav.querySelector<HTMLElement>('[data-nav="mesa"]')!
    expect(mesa.dataset['espera']).toBe('1')
    expect(nav.querySelector('.nav-sala-marca')).not.toBeNull()
  })

  it('diz em texto o que a marca significa, para quem não vê a cor', () => {
    const nav = renderizarNavSala(false, vi.fn(), true)

    const mesa = nav.querySelector<HTMLElement>('[data-nav="mesa"]')!
    expect(mesa.getAttribute('aria-label')).toContain(ROTULO_ESPERANDO)
  })

  it('nunca marca a sala — só a mesa espera por alguém', () => {
    const nav = renderizarNavSala(false, vi.fn(), true)

    expect(nav.querySelector<HTMLElement>('[data-nav="sala"]')!.dataset['espera'])
      .toBeUndefined()
  })

  it('some assim que a mesa deixa de esperar', () => {
    const semEspera = renderizarNavSala(true, vi.fn(), false)

    expect(semEspera.querySelector('.nav-sala-marca')).toBeNull()
  })
})

describe('quem está na sala mas sem conexão comigo', () => {
  const dois = () => estadoCom(jogador('eu', 'Alex'), jogador('p2', 'Bruno'))

  it('marca quem eu não alcanço', () => {
    // 'p2' aparece na sala porque o anfitrião sabe dele — mas eu não tenho
    // conexão direta. É o "achou mas não conectou", visto por pessoa.
    const tela = renderizarSalaParada(dois(), 'eu', ['eu'])

    const marcado = tela.querySelector('.sala-quem[data-sem-conexao="1"]')!
    expect(marcado.textContent).toBe('Bruno')
  })

  it('não marca quem eu alcanço', () => {
    const tela = renderizarSalaParada(dois(), 'eu', ['eu', 'p2'])

    expect(tela.querySelector('[data-sem-conexao="1"]')).toBeNull()
  })

  it('nunca marca você mesmo', () => {
    const tela = renderizarSalaParada(dois(), 'eu', [])

    expect(tela.querySelector('[data-eu="1"]')!.getAttribute('data-sem-conexao'))
      .toBeNull()
  })

  it('sem a lista de conectados, não acusa ninguém', () => {
    // A tela também é usada antes de haver informação de conexão; inventar
    // um diagnóstico ali seria pior que não mostrar nenhum.
    const tela = renderizarSalaParada(dois(), 'eu')

    expect(tela.querySelector('[data-sem-conexao="1"]')).toBeNull()
  })

  it('quem já está marcado como caído não vira também sem conexão', () => {
    const caido = { ...jogador('p2', 'Bruno'), desconectadoEm: 1000 }
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), caido), 'eu', ['eu'])

    // Caiu já explica a ausência: acusar as duas coisas confundiria dois
    // diagnósticos diferentes na mesma ficha.
    const chip = tela.querySelector('[data-caiu="1"]')!
    expect(chip.getAttribute('data-sem-conexao')).toBeNull()
  })
})
