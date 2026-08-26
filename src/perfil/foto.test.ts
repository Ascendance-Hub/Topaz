import { describe, it, expect } from 'vitest'
import { ehFotoValida, LADO_FOTO, MAX_BYTES_FOTO, recorteQuadrado } from './foto'

/** Uma foto plausível: o prefixo certo e conteúdo do tamanho de uma real. */
const fotoOk = (bytes = 4000) => `data:image/jpeg;base64,${'A'.repeat(bytes)}`

describe('ehFotoValida', () => {
  it('aceita uma foto como a que nós mesmos geramos', () => {
    expect(ehFotoValida(fotoOk())).toBe(true)
  })

  it('aceita os três formatos raster que o canvas produz', () => {
    for (const tipo of ['jpeg', 'png', 'webp']) {
      expect(ehFotoValida(`data:image/${tipo};base64,AAAA`)).toBe(true)
    }
  })

  it('recusa SVG, que pode carregar script dentro', () => {
    // Num `<img>` o script não roda, mas SVG traz uma superfície inteira que
    // não precisamos: o canvas nunca produz SVG, então nenhuma foto legítima
    // chega assim. O que chega desse jeito foi forjado à mão.
    const svg = 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg=='
    expect(ehFotoValida(svg)).toBe(false)
  })

  it('recusa qualquer coisa que não seja data: de imagem', () => {
    for (const ruim of [
      'https://exemplo.com/foto.jpg',
      'http://exemplo.com/foto.jpg',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:application/octet-stream;base64,TVqQ',
      '',
    ]) {
      expect(ehFotoValida(ruim)).toBe(false)
    }
  })

  it('recusa endereço externo mesmo disfarçado de imagem', () => {
    // O ponto todo de gerar a foto localmente é não buscar em servidor de
    // terceiro. Uma URL aqui furaria isso — e o CSP até bloquearia a busca,
    // mas o certo é não pedir.
    expect(ehFotoValida('https://exemplo.com/x.png')).toBe(false)
  })

  it('recusa o que não é texto', () => {
    for (const ruim of [null, undefined, 42, {}, ['data:image/png;base64,A']]) {
      expect(ehFotoValida(ruim)).toBe(false)
    }
  })

  it('recusa foto grande demais', () => {
    // Uma "foto" de dezenas de megabytes trava o navegador de todo mundo na
    // sala. O nosso encolhimento produz uns poucos milhares de bytes.
    expect(ehFotoValida(fotoOk(MAX_BYTES_FOTO + 1))).toBe(false)
  })

  it('o teto é folgado para a foto real, mas não para abuso', () => {
    // Se o teto ficasse rente ao tamanho típico, uma foto com mais detalhe
    // seria recusada em silêncio.
    expect(MAX_BYTES_FOTO).toBeGreaterThan(20_000)
    expect(MAX_BYTES_FOTO).toBeLessThan(200_000)
  })

  it('o lado cobre o maior círculo da tela em densidade dupla', () => {
    // A roda desenha a 144px. Menos que o dobro disso estica a foto, que foi
    // exatamente o defeito; muito mais é peso na rede sem ninguém ver.
    expect(LADO_FOTO).toBeGreaterThanOrEqual(288)
    expect(LADO_FOTO).toBeLessThanOrEqual(384)
  })
})

describe('recorteQuadrado', () => {
  it('numa imagem já quadrada, pega tudo', () => {
    expect(recorteQuadrado(200, 200)).toEqual({ x: 0, y: 0, lado: 200 })
  })

  it('numa paisagem, corta as laterais e mantém o centro', () => {
    // Esticar em vez de cortar achataria o rosto de todo mundo — é o erro
    // clássico de avatar, e ele só aparece quando alguém usa uma foto larga.
    expect(recorteQuadrado(400, 200)).toEqual({ x: 100, y: 0, lado: 200 })
  })

  it('num retrato, corta em cima e embaixo', () => {
    expect(recorteQuadrado(200, 400)).toEqual({ x: 0, y: 100, lado: 200 })
  })

  it('o recorte nunca sai da imagem', () => {
    for (const [l, a] of [[1, 1000], [1000, 1], [37, 91], [91, 37]]) {
      const r = recorteQuadrado(l!, a!)
      expect(r.x + r.lado).toBeLessThanOrEqual(l!)
      expect(r.y + r.lado).toBeLessThanOrEqual(a!)
      expect(r.lado).toBeGreaterThan(0)
    }
  })
})
