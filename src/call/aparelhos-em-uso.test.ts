// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AparelhosEmUso } from './aparelhos-em-uso'

const info = (kind: string, deviceId: string, label = '') =>
  ({ kind, deviceId, label, groupId: '' }) as MediaDeviceInfo

const negado = () => Object.assign(new Error('x'), { name: 'NotAllowedError' })

/** Uma `Midia` de mentira: registra o que foi pedido e falha quando mandado. */
function midiaFalsa(falharAo: 'ligar' | 'trocar' | null = null) {
  let atual: string | null = null
  return {
    ligarMicrofone: vi.fn(async (): Promise<void> => {
      if (falharAo === 'ligar') throw negado()
    }),
    trocarMicrofone: vi.fn(async (id: string): Promise<void> => {
      if (falharAo === 'trocar') throw negado()
      atual = id
    }),
    microfoneAtual: () => atual,
  }
}

function comAparelhos(lista: MediaDeviceInfo[]): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: () => Promise.resolve(lista) },
  })
}

beforeEach(() => localStorage.clear())

describe('abrir o microfone', () => {
  it('sem falha, não há motivo nenhum guardado', async () => {
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, vi.fn())

    await aparelhos.abrir()

    expect(aparelhos.semMicrofone()).toBeNull()
  })

  it('permissão negada guarda o motivo em vez de estourar', async () => {
    // O defeito original: a rejeição sem `catch` matava a entrada na call em
    // silêncio. Aqui ela vira um texto que a barra sabe mostrar.
    const aparelhos = new AparelhosEmUso(midiaFalsa('ligar'), () => true, vi.fn())

    await expect(aparelhos.abrir()).resolves.toBeUndefined()
    expect(aparelhos.semMicrofone()).toContain('bloqueou')
  })

  it('sair da call esquece o motivo — ele não descreve mais nada', async () => {
    const aparelhos = new AparelhosEmUso(midiaFalsa('ligar'), () => true, vi.fn())
    await aparelhos.abrir()

    aparelhos.esquecerFalha()

    expect(aparelhos.semMicrofone()).toBeNull()
  })
})

describe('reler a lista', () => {
  it('separa entradas de saídas', async () => {
    comAparelhos([
      info('audioinput', 'mic', 'Fone'),
      info('audiooutput', 'alto', 'Alto-falante'),
      info('videoinput', 'cam', 'Webcam'),
    ])
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, vi.fn())

    await aparelhos.reler()

    expect(aparelhos.microfones()).toEqual([{ id: 'mic', nome: 'Fone' }])
    expect(aparelhos.saidas()).toEqual([{ id: 'alto', nome: 'Alto-falante' }])
  })

  it('sem suporte a trocar saída, a lista fica vazia', async () => {
    // Um seletor que a pessoa mexe e não muda nada faz ela achar que o site
    // quebrou — pior que não ter seletor.
    comAparelhos([info('audiooutput', 'alto', 'Alto-falante')])
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => false, vi.fn())

    await aparelhos.reler()

    expect(aparelhos.saidas()).toEqual([])
  })

  it('avisa a saída escolhida para quem aplica nos elementos', async () => {
    comAparelhos([info('audiooutput', 'alto', 'Alto-falante')])
    const aplicou = vi.fn()
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, aplicou)

    await aparelhos.reler()

    expect(aplicou).toHaveBeenCalledWith('alto')
    expect(aparelhos.saidaAtual()).toBe('alto')
  })

  it('não reavisa a mesma saída a cada releitura', async () => {
    comAparelhos([info('audiooutput', 'alto', 'Alto-falante')])
    const aplicou = vi.fn()
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, aplicou)

    await aparelhos.reler()
    await aparelhos.reler()

    expect(aplicou).toHaveBeenCalledTimes(1)
  })

  it('escolhe o microfone e o deixa em uso', async () => {
    comAparelhos([info('audioinput', 'mic', 'Fone')])
    const midia = midiaFalsa()
    const aparelhos = new AparelhosEmUso(midia, () => true, vi.fn())

    await aparelhos.reler()

    expect(midia.trocarMicrofone).toHaveBeenCalledWith('mic')
  })

  it('lista vazia não estoura e não escolhe nada', async () => {
    comAparelhos([])
    const midia = midiaFalsa()
    const aparelhos = new AparelhosEmUso(midia, () => true, vi.fn())

    await aparelhos.reler()

    expect(midia.trocarMicrofone).not.toHaveBeenCalled()
    expect(aparelhos.microfones()).toEqual([])
  })

  it('navegador sem mediaDevices devolve listas vazias em vez de quebrar', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: () => Promise.reject(new Error('não existe')) },
    })
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, vi.fn())

    await expect(aparelhos.reler()).resolves.toBeUndefined()
    expect(aparelhos.microfones()).toEqual([])
  })

  it('fone arrancado no meio da conversa guarda o motivo, não trava calado', async () => {
    // Este caminho também abre um getUserMedia. Sem `catch`, a interface
    // ficava parada sem dizer nada.
    comAparelhos([info('audioinput', 'mic', 'Fone')])
    const aparelhos = new AparelhosEmUso(midiaFalsa('trocar'), () => true, vi.fn())

    await aparelhos.reler()

    expect(aparelhos.semMicrofone()).toContain('bloqueou')
  })
})

describe('escolha da pessoa', () => {
  it('trocar microfone lembra para a próxima sessão', async () => {
    const midia = midiaFalsa()
    const aparelhos = new AparelhosEmUso(midia, () => true, vi.fn())

    await aparelhos.usarMicrofone('fone-usb')

    expect(midia.trocarMicrofone).toHaveBeenCalledWith('fone-usb')
    expect(localStorage.getItem('topazMicrofone')).toBe('fone-usb')
  })

  it('trocar saída lembra e aplica na hora', () => {
    const aplicou = vi.fn()
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, aplicou)

    aparelhos.usarSaida('fone-usb')

    expect(aparelhos.saidaAtual()).toBe('fone-usb')
    expect(aplicou).toHaveBeenCalledWith('fone-usb')
    expect(localStorage.getItem('topazSaidaAudio')).toBe('fone-usb')
  })

  it('a saída lembrada volta a valer na sessão seguinte', async () => {
    localStorage.setItem('topazSaidaAudio', 'fone-usb')
    comAparelhos([
      info('audiooutput', 'alto', 'Alto-falante'),
      info('audiooutput', 'fone-usb', 'Fone USB'),
    ])
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, vi.fn())

    await aparelhos.reler()

    expect(aparelhos.saidaAtual()).toBe('fone-usb')
  })

  it('a saída lembrada que sumiu cai na primeira disponível', async () => {
    // Um fone desplugado entre sessões deixaria um id que não resolve mais.
    localStorage.setItem('topazSaidaAudio', 'sumiu')
    comAparelhos([info('audiooutput', 'alto', 'Alto-falante')])
    const aparelhos = new AparelhosEmUso(midiaFalsa(), () => true, vi.fn())

    await aparelhos.reler()

    expect(aparelhos.saidaAtual()).toBe('alto')
  })
})
