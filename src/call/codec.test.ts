import { describe, it, expect } from 'vitest'
import { escolherH264 } from './codec'

const codec = (sdpFmtpLine: string, mimeType = 'video/H264') =>
  ({ mimeType, clockRate: 90000, sdpFmtpLine }) as RTCRtpCodec

describe('escolherH264', () => {
  it('não devolve nada quando não há H.264', () => {
    expect(escolherH264([codec('', 'video/VP8')])).toBeUndefined()
  })

  it('prefere packetization-mode=1', () => {
    const modo0 = codec('packetization-mode=0;profile-level-id=42e01f')
    const modo1 = codec('packetization-mode=1;profile-level-id=42e01f')

    expect(escolherH264([modo0, modo1])).toBe(modo1)
  })

  it('prefere High a Main, e Main a Baseline', () => {
    const baseline = codec('packetization-mode=1;profile-level-id=42e01f')
    const main = codec('packetization-mode=1;profile-level-id=4d001f')
    const high = codec('packetization-mode=1;profile-level-id=640c1f')

    expect(escolherH264([baseline, main, high])).toBe(high)
    expect(escolherH264([baseline, main])).toBe(main)
  })

  it('modo de empacotamento pesa mais que perfil', () => {
    // Um High em modo 0 fragmenta pior na rede que um Baseline em modo 1, e
    // fragmentação ruim aparece como artefato antes de o perfil fazer falta.
    const highModo0 = codec('packetization-mode=0;profile-level-id=640c1f')
    const baselineModo1 = codec('packetization-mode=1;profile-level-id=42e01f')

    expect(escolherH264([highModo0, baselineModo1])).toBe(baselineModo1)
  })

  it('aceita H.264 sem fmtp em vez de desistir', () => {
    const pelado = codec('')

    expect(escolherH264([pelado])).toBe(pelado)
  })

  it('não se confunde com a caixa do mimeType', () => {
    const minusculo = codec('packetization-mode=1', 'video/h264')

    expect(escolherH264([minusculo])).toBe(minusculo)
  })
})
