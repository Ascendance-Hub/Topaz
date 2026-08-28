// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { criarRostos } from './rostos'
import type { DependenciasDeRostos } from './rostos'
import type { EstadoCall } from '../call/protocolo'
import { EU } from '../ui/components/participantes'

const callParada: EstadoCall = {
  euNaCall: false, euCompartilhando: false, meuCanal: 'principal',
  naCall: [], comigo: [], porCanal: [], podeAbrirCanal: false,
  compartilhando: [], assistindo: [], assistidoPor: [],
}

function montar(call: Partial<EstadoCall> = {}) {
  let estado: EstadoCall = { ...callParada, ...call }
  const falantes = new Set<string>()
  const fonte = () => ({
    euNaCall: estado.euNaCall,
    naCall: estado.comigo,
    meuApelido: 'Eu',
    minhaFoto: undefined,
    meuMicrofoneMudo: false,
    euSemMicrofone: false,
    falantes,
    fotos: new Map<string, string>(),
    selos: new Map<string, string>(),
    apelidoDe: (id: string) => `Nome de ${id}`,
  })
  const dep: DependenciasDeRostos = {
    estadoCall: () => estado,
    pessoas: {
      fonte,
      participantes: () => (estado.euNaCall
        ? [{ peerId: EU, nome: 'Eu', euMesmo: true, mudo: false, semMicrofone: false, falando: false },
           ...estado.comigo.map((id) => ({
             peerId: id, nome: `Nome de ${id}`, euMesmo: false,
             mudo: false, semMicrofone: false, falando: false,
           }))]
        : []),
      falando: (id) => falantes.has(id),
    },
    meuId: () => 'eu',
    aoEntrarNoCanal: vi.fn(),
    aoAbrirCanal: vi.fn(),
  }
  const rostos = criarRostos(dep)
  return {
    rostos,
    falantes,
    definirEstado: (novo: Partial<EstadoCall>) => { estado = { ...estado, ...novo } },
    dep,
  }
}

describe('criarRostos — só refaz quando a composição muda', () => {
  it('desenhar duas vezes com o mesmo estado não troca os nós', () => {
    // Refazer os retratos no ritmo da fala mandaria o navegador redecodificar
    // toda foto várias vezes por minuto.
    const { rostos } = montar({ euNaCall: true, comigo: ['pa'], porCanal: [
      { id: 'principal', nome: 'Principal', quem: ['eu', 'pa'] }] })

    rostos.desenhar()
    const canaisAntes = rostos.canais.atual
    const rodaAntes = rostos.roda.atual
    rostos.desenhar()

    expect(rostos.canais.atual).toBe(canaisAntes)
    expect(rostos.roda.atual).toBe(rodaAntes)
  })

  it('mas refaz quando alguém entra no canal', () => {
    const { rostos, definirEstado } = montar({ euNaCall: true, comigo: [], porCanal: [
      { id: 'principal', nome: 'Principal', quem: ['eu'] }] })
    rostos.desenhar()
    const antes = rostos.canais.atual

    definirEstado({ comigo: ['pa'], porCanal: [
      { id: 'principal', nome: 'Principal', quem: ['eu', 'pa'] }] })
    rostos.desenhar()

    expect(rostos.canais.atual).not.toBe(antes)
  })

  it('e refaz quando a roda vira faixa', () => {
    // O modo muda o desenho inteiro, então entra na assinatura.
    const { rostos, definirEstado } = montar({ euNaCall: true, comigo: ['pa'] })
    rostos.desenhar()
    const antes = rostos.roda.atual

    definirEstado({ assistindo: ['pa'] })
    rostos.desenhar()

    expect(rostos.roda.atual).not.toBe(antes)
    expect(rostos.roda.atual.dataset['modo']).toBe('faixa')
  })

  it('invalidar força a refazer, mesmo sem nada ter mudado', () => {
    // É como a troca de foto avisa: a assinatura não olha a foto, porque
    // olhar exigiria concatenar dezenas de milhares de caracteres.
    const { rostos } = montar({ euNaCall: true, comigo: ['pa'] })
    rostos.desenhar()
    const antes = rostos.roda.atual

    rostos.invalidar()
    rostos.desenhar()

    expect(rostos.roda.atual).not.toBe(antes)
  })
})

describe('criarRostos — o anel de quem fala', () => {
  it('acende SEM refazer o elemento', () => {
    // É a única parte que muda em ritmo de fala.
    const { rostos, falantes } = montar({ euNaCall: true, comigo: ['pa'] })
    rostos.desenhar()
    const mesmoNo = rostos.roda.atual

    falantes.add('pa')
    rostos.desenhar()

    expect(rostos.roda.atual).toBe(mesmoNo)
    const pa = [...mesmoNo.querySelectorAll<HTMLElement>('.roda-pessoa')]
      .find((e) => e.dataset['pessoa'] === 'pa')
    expect(pa?.dataset['falando']).toBe('1')
  })

  it('e apaga quando a pessoa para de falar', () => {
    const { rostos, falantes } = montar({ euNaCall: true, comigo: ['pa'] })
    falantes.add('pa')
    rostos.desenhar()

    falantes.delete('pa')
    rostos.desenhar()

    const pa = [...rostos.roda.atual.querySelectorAll<HTMLElement>('.roda-pessoa')]
      .find((e) => e.dataset['pessoa'] === 'pa')
    expect(pa?.dataset['falando']).toBeUndefined()
  })

  it('eu acendo sob a chave do medidor, não sob o meu peerId', () => {
    // O meu microfone é local e nunca chega pelo caminho de mídia recebida.
    const { rostos, falantes } = montar({ euNaCall: true, comigo: [] })
    rostos.desenhar()

    falantes.add(EU)
    rostos.desenhar()

    const eu = [...rostos.roda.atual.querySelectorAll<HTMLElement>('.roda-pessoa')]
      .find((e) => e.dataset['eu'] === '1')
    expect(eu?.dataset['falando']).toBe('1')
  })
})

describe('criarRostos — a lista de canais', () => {
  it('fora da call nenhum canal aparece aceso', () => {
    // `meuCanal` guarda para onde eu IRIA, não onde eu estou.
    const { rostos } = montar({ euNaCall: false, meuCanal: 'principal', porCanal: [
      { id: 'principal', nome: 'Principal', quem: ['pa'] }] })

    rostos.desenhar()

    const acesos = [...rostos.canais.atual.querySelectorAll<HTMLElement>('[data-canal]')]
      .filter((c) => c.dataset['atual'] === '1' || c.getAttribute('aria-current'))
    expect(acesos).toEqual([])
  })

  it('o "+" só existe quando há id livre', () => {
    // Um "+" que não abre nada seria um botão que engana.
    const sem = montar({ euNaCall: true, podeAbrirCanal: false })
    sem.rostos.desenhar()
    const semBotao = [...sem.rostos.canais.atual.querySelectorAll('button')]
      .some((b) => /Novo canal/i.test(b.textContent ?? ''))

    const com = montar({ euNaCall: true, podeAbrirCanal: true })
    com.rostos.desenhar()
    const comBotao = [...com.rostos.canais.atual.querySelectorAll('button')]
      .some((b) => /Novo canal/i.test(b.textContent ?? ''))

    expect(semBotao).toBe(false)
    expect(comBotao).toBe(true)
  })
})
