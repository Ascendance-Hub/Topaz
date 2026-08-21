import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * `protocolo.ts` é a metade testável da call. Se mídia vazar para dentro dele,
 * ela deixa de ser testável sem navegador — e a suíte perde justamente a peça
 * que cobre a assinatura explícita, que é o coração do desenho.
 *
 * Mesmo espírito de `src/game/isolamento.test.ts`, e pelo mesmo motivo: uma
 * fronteira que só existe na cabeça de quem escreveu não sobrevive à terceira
 * semana.
 */
describe('isolamento do protocolo da call', () => {
  it('não menciona nenhuma API de navegador', () => {
    const fonte = readFileSync('src/call/protocolo.ts', 'utf8')

    for (const proibido of [
      'navigator', 'MediaStream', 'document', 'window', 'RTCPeerConnection',
    ]) {
      expect(fonte).not.toContain(proibido)
    }
  })

  it('não importa nada de fora de src/call', () => {
    const fonte = readFileSync('src/call/protocolo.ts', 'utf8')

    expect(fonte).not.toMatch(/from\s+'\.\.\//)
  })
})
