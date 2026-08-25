import { describe, it, expect, vi } from 'vitest'
import { criarAcoesCall } from './acoes-da-call'

function montar(falhaAoAbrir = false) {
  const dep = {
    protocolo: {
      entrar: vi.fn(),
      sair: vi.fn(),
      estado: () => ({ assistindo: ['pa'], compartilhando: ['pa', 'pb'] }),
      assistir: vi.fn(),
      pararDeAssistir: vi.fn(),
      definirCompartilhando: vi.fn(),
    },
    midia: {
      desligarMicrofone: vi.fn(),
      pararTela: vi.fn(),
      alternarMicrofone: vi.fn(),
      compartilharTela: vi.fn(async (_aoParar: () => void) => {}),
      definirQualidade: vi.fn(),
      definirTipoConteudo: vi.fn(),
    },
    aparelhos: {
      // `abrir` NUNCA rejeita, mesmo com o microfone negado — ele guarda o
      // motivo por dentro. É esse contrato que faz a entrada acontecer.
      abrir: vi.fn(async () => { void falhaAoAbrir }),
      reler: vi.fn(async () => {}),
      usarMicrofone: vi.fn(async () => {}),
      usarSaida: vi.fn(),
      esquecerFalha: vi.fn(),
    },
    area: { limpar: vi.fn(), alternarSilenciarTodos: vi.fn(() => true), ajustar: vi.fn() },
    pararDeMedirVoz: vi.fn(),
    sincronizarMidia: vi.fn(),
    desenhar: vi.fn(),
  }
  return { acoes: criarAcoesCall(dep), dep }
}

/** As ações disparam trabalho assíncrono sem esperar; isto deixa assentar. */
const assentar = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('entrar na call', () => {
  it('abre o microfone ANTES de anunciar', async () => {
    // Anunciar primeiro faria os outros esperarem um áudio que ainda não
    // existe.
    const { acoes, dep } = montar()
    const ordem: string[] = []
    dep.aparelhos.abrir.mockImplementation(async () => { ordem.push('abrir') })
    dep.protocolo.entrar.mockImplementation(() => ordem.push('entrar'))

    acoes.entrar()
    await assentar()

    expect(ordem).toEqual(['abrir', 'entrar'])
  })

  it('entra mesmo com o microfone negado', async () => {
    // O defeito que isto conserta: a rejeição sem `catch` matava o botão em
    // silêncio, e a pessoa não entendia por que nada acontecia.
    const { acoes, dep } = montar(true)

    acoes.entrar()
    await assentar()

    expect(dep.protocolo.entrar).toHaveBeenCalled()
  })

  it('relê os aparelhos depois, quando os nomes já existem', async () => {
    // Antes da permissão a lista vem anônima — é por isso que o seletor não
    // aparece nesse caso.
    const { acoes, dep } = montar()

    acoes.entrar()
    await assentar()

    expect(dep.aparelhos.reler).toHaveBeenCalled()
  })

  it('sincroniza de novo depois de capturar', async () => {
    // Quem anunciou durante a janela de permissão só é alcançado aqui.
    const { acoes, dep } = montar()

    acoes.entrar()
    await assentar()

    expect(dep.sincronizarMidia).toHaveBeenCalled()
    expect(dep.desenhar).toHaveBeenCalled()
  })
})

describe('tentar o microfone de novo', () => {
  it('sobe o microfone sem reentrar na call', async () => {
    const { acoes, dep } = montar()

    acoes.tentarMicrofone()
    await assentar()

    expect(dep.aparelhos.abrir).toHaveBeenCalled()
    expect(dep.protocolo.entrar).not.toHaveBeenCalled()
  })
})

describe('sair da call', () => {
  it('cala tudo: microfone, tela, elementos e medidor', () => {
    // Um `<video>` escondido continua tocando — era isso que deixava o som da
    // tela saindo depois de sair.
    const { acoes, dep } = montar()

    acoes.sair()

    expect(dep.midia.desligarMicrofone).toHaveBeenCalled()
    expect(dep.midia.pararTela).toHaveBeenCalled()
    expect(dep.area.limpar).toHaveBeenCalled()
    expect(dep.pararDeMedirVoz).toHaveBeenCalled()
  })

  it('esquece o motivo de não ter microfone', () => {
    // Fora da call ele não descreve mais nada, e ficaria pendurado na próxima
    // entrada.
    const { acoes, dep } = montar()

    acoes.sair()

    expect(dep.aparelhos.esquecerFalha).toHaveBeenCalled()
  })
})

describe('compartilhar tela', () => {
  it('só anuncia depois de a captura existir', async () => {
    const { acoes, dep } = montar()

    acoes.compartilhar()
    await assentar()

    expect(dep.protocolo.definirCompartilhando).toHaveBeenCalledWith(true)
    expect(dep.sincronizarMidia).toHaveBeenCalled()
  })

  it('parar pela barra do navegador desfaz o anúncio', async () => {
    // Sem isto, a interface continuaria dizendo que a pessoa compartilha.
    const { acoes, dep } = montar()
    let aoParar: (() => void) | null = null
    dep.midia.compartilharTela.mockImplementation(async (cb: () => void) => { aoParar = cb })

    acoes.compartilhar()
    await assentar()
    aoParar!()

    expect(dep.protocolo.definirCompartilhando).toHaveBeenCalledWith(false)
    expect(dep.midia.pararTela).toHaveBeenCalled()
  })
})

describe('silenciar todos', () => {
  it('ajusta na hora, sem esperar o próximo tique', () => {
    // Meio segundo de som de quem se acabou de silenciar é meio segundo a mais
    // do que ninguém quer.
    const { acoes, dep } = montar()

    acoes.alternarSilenciarTodos()

    expect(dep.area.alternarSilenciarTodos).toHaveBeenCalled()
    expect(dep.area.ajustar).toHaveBeenCalledWith(['pa'], ['pa', 'pb'])
  })
})

describe('os controles simples', () => {
  it('cada um faz a sua coisa e redesenha', async () => {
    const { acoes, dep } = montar()

    acoes.alternarMeuMicrofone()
    acoes.definirQualidade(1080)
    acoes.definirTipoConteudo('detail')
    acoes.trocarSaida('fone')
    acoes.trocarMicrofone('mic')
    await assentar()

    expect(dep.midia.alternarMicrofone).toHaveBeenCalled()
    expect(dep.midia.definirQualidade).toHaveBeenCalledWith(1080)
    expect(dep.midia.definirTipoConteudo).toHaveBeenCalledWith('detail')
    expect(dep.aparelhos.usarSaida).toHaveBeenCalledWith('fone')
    expect(dep.aparelhos.usarMicrofone).toHaveBeenCalledWith('mic')
    expect(dep.desenhar).toHaveBeenCalledTimes(5)
  })

  it('assistir e parar de assistir passam direto para o protocolo', () => {
    const { acoes, dep } = montar()

    acoes.assistir('pa')
    acoes.pararDeAssistir('pb')

    expect(dep.protocolo.assistir).toHaveBeenCalledWith('pa')
    expect(dep.protocolo.pararDeAssistir).toHaveBeenCalledWith('pb')
  })
})
