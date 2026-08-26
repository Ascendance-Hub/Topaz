// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { faltaCripto, renderizarSemCripto } from './sem-cripto'

describe('faltaCripto', () => {
  it('com as ferramentas no lugar, não falta nada', () => {
    expect(faltaCripto({ isSecureContext: true, subtle: {} })).toBe(false)
  })

  it('fora de contexto seguro, falta', () => {
    expect(faltaCripto({ isSecureContext: false, subtle: {} })).toBe(true)
  })

  it('sem `subtle`, falta — mesmo que o navegador se diga seguro', () => {
    // Os dois são conferidos porque um não implica o outro: navegador antigo
    // em página https tem contexto seguro e não tem `crypto.subtle`.
    expect(faltaCripto({ isSecureContext: true, subtle: undefined })).toBe(true)
  })
})

describe('renderizarSemCripto', () => {
  it('diz o que houve, sem culpar a rede da pessoa', () => {
    const aviso = renderizarSemCripto('http://192.168.0.12:5173/Topaz/')

    expect(aviso.textContent).toContain('https')
  })

  it('mostra o endereço aberto, que é o que denuncia o problema', () => {
    const aviso = renderizarSemCripto('http://192.168.0.12:5173/Topaz/')

    expect(aviso.textContent).toContain('192.168.0.12')
  })

  it('é lido como aviso por quem usa leitor de tela', () => {
    const aviso = renderizarSemCripto('http://exemplo/')

    expect(aviso.getAttribute('role')).toBe('alert')
  })
})
