// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHAVE_MICROFONE, escolherMicrofone, lembrarMicrofone,
  microfoneLembrado, microfones, motivoSemMicrofone,
  escolherSaida, lembrarSaida, saidaLembrada, saidasDeAudio,
} from './dispositivos'

const info = (kind: string, deviceId: string, label = ''): MediaDeviceInfo =>
  ({ kind, deviceId, label, groupId: '' }) as MediaDeviceInfo

describe('microfones', () => {
  it('fica só com as entradas de áudio', () => {
    const lista = microfones([
      info('audioinput', 'a', 'Fone'),
      info('videoinput', 'b', 'Webcam'),
      info('audiooutput', 'c', 'Alto-falante'),
    ])

    expect(lista).toEqual([{ id: 'a', nome: 'Fone' }])
  })

  it('inventa um nome quando o navegador não deu', () => {
    // Os nomes só existem depois da permissão concedida: antes disso o
    // navegador entrega uma lista anônima. Melhor "Microfone 1" do que um
    // seletor com opções em branco.
    const lista = microfones([info('audioinput', 'a'), info('audioinput', 'b')])

    expect(lista.map((m) => m.nome)).toEqual(['Microfone 1', 'Microfone 2'])
  })

  it('ignora dispositivo sem id, que não dá para selecionar', () => {
    expect(microfones([info('audioinput', '', 'Fantasma')])).toEqual([])
  })
})

describe('lembrar a escolha', () => {
  beforeEach(() => localStorage.clear())

  it('guarda e devolve', () => {
    lembrarMicrofone('abc')

    expect(microfoneLembrado()).toBe('abc')
    expect(localStorage.getItem(CHAVE_MICROFONE)).toBe('abc')
  })

  it('sem nada guardado, devolve nulo', () => {
    expect(microfoneLembrado()).toBeNull()
  })
})

describe('escolherMicrofone', () => {
  const lista = [
    { id: 'padrao', nome: 'Padrão do sistema' },
    { id: 'fone', nome: 'Fone USB' },
  ]

  it('prefere o que foi lembrado', () => {
    expect(escolherMicrofone(lista, 'fone')).toBe('fone')
  })

  it('cai no primeiro quando o lembrado sumiu', () => {
    // Fone desconectado entre uma sessão e outra. Insistir num id que não
    // existe mais faria o `getUserMedia` falhar e a pessoa entrar muda.
    expect(escolherMicrofone(lista, 'fone-que-foi-embora')).toBe('padrao')
  })

  it('cai no primeiro quando não há nada lembrado', () => {
    expect(escolherMicrofone(lista, null)).toBe('padrao')
  })

  it('devolve nulo quando não há microfone nenhum', () => {
    expect(escolherMicrofone([], 'fone')).toBeNull()
  })
})

describe('motivoSemMicrofone', () => {
  const erro = (name: string) => Object.assign(new Error('x'), { name })

  it('explica a permissão negada e diz onde liberar', () => {
    // O caso que mais acontece, e o único em que a pessoa pode resolver
    // sozinha — então a mensagem tem que dizer ONDE.
    const texto = motivoSemMicrofone(erro('NotAllowedError'))
    expect(texto).toContain('bloqueou')
    expect(texto.toLowerCase()).toContain('endereços')
  })

  it('distingue não ter microfone de estar bloqueado', () => {
    expect(motivoSemMicrofone(erro('NotFoundError')))
      .not.toBe(motivoSemMicrofone(erro('NotAllowedError')))
    expect(motivoSemMicrofone(erro('NotFoundError'))).toContain('Nenhum microfone')
  })

  it('aponta o programa que está segurando o aparelho', () => {
    expect(motivoSemMicrofone(erro('NotReadableError'))).toContain('outro programa')
  })

  it('trata o aparelho lembrado que sumiu', () => {
    expect(motivoSemMicrofone(erro('OverconstrainedError'))).toContain('não está mais')
  })

  it('nunca devolve vazio, seja qual for o erro', () => {
    // Sem isto o aviso apareceria em branco, que é quase tão ruim quanto o
    // botão morto que este trabalho veio consertar.
    for (const valor of [erro('CoisaNova'), new Error('sem nome'), null, undefined, 'texto']) {
      expect(motivoSemMicrofone(valor).length).toBeGreaterThan(0)
    }
  })
})

describe('saidasDeAudio', () => {
  it('fica só com as saídas de áudio', () => {
    const lista = saidasDeAudio([
      info('audioinput', 'a', 'Fone'),
      info('audiooutput', 'c', 'Alto-falante'),
      info('videoinput', 'b', 'Webcam'),
    ])

    expect(lista).toEqual([{ id: 'c', nome: 'Alto-falante' }])
  })

  it('inventa um nome quando o navegador não deu', () => {
    expect(saidasDeAudio([info('audiooutput', 'c')])[0]!.nome).toBe('Saída 1')
  })

  it('descarta id vazio, que não serve para setSinkId', () => {
    expect(saidasDeAudio([info('audiooutput', '', 'Anônimo')])).toEqual([])
  })
})

describe('memória da saída de áudio', () => {
  beforeEach(() => localStorage.clear())

  it('lembra e devolve', () => {
    lembrarSaida('fone-usb')
    expect(saidaLembrada()).toBe('fone-usb')
  })

  it('sem nada lembrado, devolve null', () => {
    expect(saidaLembrada()).toBeNull()
  })

  it('usa a lembrada quando ela ainda existe', () => {
    const lista = [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }]
    expect(escolherSaida(lista, 'b')).toBe('b')
  })

  it('cai na primeira quando a lembrada sumiu — um fone desplugado entre sessões', () => {
    const lista = [{ id: 'a', nome: 'A' }]
    expect(escolherSaida(lista, 'sumiu')).toBe('a')
  })

  it('devolve null quando não há saída nenhuma', () => {
    expect(escolherSaida([], 'b')).toBeNull()
  })
})
