import { describe, it, expect } from 'vitest'
import { analisarCandidatos, VEREDITOS } from './diagnostico-rede'

const c = (tipo: string, porta: number, portaLocal: number) =>
  ({ tipo, porta, portaLocal })

describe('analisarCandidatos', () => {
  it('sem nenhum candidato externo, o UDP não sai', () => {
    const r = analisarCandidatos([c('host', 1, 0)])

    expect(r.veredito).toBe(VEREDITOS.semUdp)
  })

  it('mesma porta externa para destinos diferentes: NAT cooperativo', () => {
    // Duas respostas de STUN diferentes vindas do MESMO socket local, com a
    // mesma porta externa. É o que permite P2P direto.
    const r = analisarCandidatos([
      c('host', 1, 0), c('srflx', 40000, 5000), c('srflx', 40000, 5000),
    ])

    expect(r.veredito).toBe(VEREDITOS.direto)
  })

  it('porta externa diferente por destino: NAT simétrico', () => {
    const r = analisarCandidatos([
      c('host', 1, 0), c('srflx', 40000, 5000), c('srflx', 40001, 5000),
    ])

    expect(r.veredito).toBe(VEREDITOS.simetrico)
  })

  it('um servidor só respondendo não dá para concluir', () => {
    // Sem duas respostas não há o que comparar, e inventar veredito aqui
    // mandaria a pessoa consertar a coisa errada.
    const r = analisarCandidatos([c('host', 1, 0), c('srflx', 40000, 5000)])

    expect(r.veredito).toBe(VEREDITOS.inconclusivo)
  })

  it('candidatos de sockets locais diferentes não se comparam', () => {
    // Portas locais distintas são interfaces distintas (wifi, VPN). Portas
    // externas diferentes aí são normais e não indicam NAT simétrico.
    const r = analisarCandidatos([
      c('srflx', 40000, 5000), c('srflx', 50000, 6000),
    ])

    expect(r.veredito).toBe(VEREDITOS.inconclusivo)
  })

  it('relata quantos candidatos de cada tipo encontrou', () => {
    const r = analisarCandidatos([
      c('host', 1, 0), c('srflx', 40000, 5000), c('srflx', 40000, 5000), c('relay', 9, 0),
    ])

    expect(r.contagem).toEqual({ host: 1, srflx: 2, relay: 1 })
  })
})
