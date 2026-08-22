import { describe, it, expect } from 'vitest'
import { analisarCandidatos, VEREDITOS } from './diagnostico-rede'

const c = (tipo: string, porta: number, portaLocal: number) =>
  ({ tipo, porta, portaLocal })

describe('analisarCandidatos', () => {
  it('sem nenhum candidato externo, o UDP não sai', () => {
    expect(analisarCandidatos([c('host', 1, 0)], 0).veredito).toBe(VEREDITOS.semUdp)
  })

  it('UM candidato externo, sem erro, é o caso BOM', () => {
    // O navegador deduplica candidatos idênticos. Quando os servidores STUN
    // veem o MESMO endereço externo — que é o que acontece num NAT que mantém
    // o mapeamento — sai um candidato só. Ler isso como "só um respondeu" era
    // o defeito: o caso bom aparecia como indefinido.
    const r = analisarCandidatos([c('host', 1, 0), c('srflx', 40000, 5000)], 0)

    expect(r.veredito).toBe(VEREDITOS.direto)
  })

  it('um candidato COM erro de servidor não conclui', () => {
    // Aqui o candidato único pode ser dedução ou pode ser que os outros
    // servidores nem responderam. Não dá para saber, e chutar mandaria a
    // pessoa consertar a coisa errada.
    const r = analisarCandidatos([c('srflx', 40000, 5000)], 2)

    expect(r.veredito).toBe(VEREDITOS.inconclusivo)
  })

  it('portas externas diferentes do mesmo socket: NAT simétrico', () => {
    const r = analisarCandidatos(
      [c('host', 1, 0), c('srflx', 40000, 5000), c('srflx', 40001, 5000)], 0)

    expect(r.veredito).toBe(VEREDITOS.simetrico)
  })

  it('simétrico continua valendo mesmo com um servidor tendo falhado', () => {
    // Duas portas diferentes são prova direta: não importa se um terceiro
    // servidor caiu.
    const r = analisarCandidatos([c('srflx', 40000, 5000), c('srflx', 40001, 5000)], 1)

    expect(r.veredito).toBe(VEREDITOS.simetrico)
  })

  it('candidatos de sockets locais diferentes não se comparam', () => {
    // Portas locais distintas são interfaces distintas (wifi, VPN). Portas
    // externas diferentes aí são normais.
    const r = analisarCandidatos([c('srflx', 40000, 5000), c('srflx', 50000, 6000)], 0)

    expect(r.veredito).toBe(VEREDITOS.direto)
  })

  it('relata quantos candidatos de cada tipo encontrou', () => {
    const r = analisarCandidatos(
      [c('host', 1, 0), c('srflx', 40000, 5000), c('relay', 9, 0)], 0)

    expect(r.contagem).toEqual({ host: 1, srflx: 1, relay: 1 })
  })
})
