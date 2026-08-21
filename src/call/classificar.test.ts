import { describe, it, expect } from 'vitest'
import { ehTela } from './classificar'

const stream = (video: number, audio: number) => ({
  getVideoTracks: () => Array.from({ length: video }, () => ({})),
  getAudioTracks: () => Array.from({ length: audio }, () => ({})),
}) as unknown as MediaStream

describe('ehTela', () => {
  it('stream só de áudio é microfone', () => {
    expect(ehTela(stream(0, 1))).toBe(false)
  })

  it('stream com vídeo é tela', () => {
    expect(ehTela(stream(1, 0))).toBe(true)
  })

  it('tela com som continua sendo tela', () => {
    expect(ehTela(stream(1, 1))).toBe(true)
  })

  it('stream vazio não é tela', () => {
    expect(ehTela(stream(0, 0))).toBe(false)
  })
})
