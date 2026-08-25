// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { CHAVE_FOTO, esquecerFoto, fotoLembrada, lembrarFoto } from './foto-navegador'

const foto = 'data:image/jpeg;base64,AAAA'

beforeEach(() => localStorage.clear())

describe('memória da foto', () => {
  it('lembra e devolve', () => {
    lembrarFoto(foto)
    expect(fotoLembrada()).toBe(foto)
  })

  it('sem nada guardado, devolve null', () => {
    expect(fotoLembrada()).toBeNull()
  })

  it('esquecer apaga', () => {
    lembrarFoto(foto)
    esquecerFoto()
    expect(fotoLembrada()).toBeNull()
  })

  it('o que foi adulterado no armazenamento não passa', () => {
    // O localStorage é editável por qualquer script desta origem — uma
    // extensão basta. Ler de lá é tão pouco confiável quanto ler da rede.
    localStorage.setItem(CHAVE_FOTO, 'https://exemplo.com/rastreador.png')

    expect(fotoLembrada()).toBeNull()
  })
})
