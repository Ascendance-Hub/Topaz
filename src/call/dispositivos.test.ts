// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHAVE_MICROFONE, escolherMicrofone, lembrarMicrofone,
  microfoneLembrado, microfones,
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
