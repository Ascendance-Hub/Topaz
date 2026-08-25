import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O código sem os comentários.
 *
 * Um guarda que lê o arquivo inteiro reprova o próprio comentário que explica
 * a regra — foi o que aconteceu com `nivel-voz.ts`, cujo cabeçalho diz "aqui
 * não existe AudioContext". Proibir escrever o nome da coisa proibida
 * empurraria a documentação para uma linguagem torta.
 */
function semComentarios(caminho: string): string {
  return readFileSync(caminho, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

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
    const fonte = semComentarios('src/call/protocolo.ts')

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

/**
 * `nivel-voz.ts` guarda a decisão de "esta pessoa está falando" — histerese e
 * energia, números puros. A captura mora em `monitor-voz.ts`.
 *
 * A fronteira existe porque histerese se testa com números, não com
 * microfone: sem ela, provar que o anel não pisca na pausa entre palavras
 * exigiria um navegador e alguém falando.
 */
describe('isolamento da decisão de fala', () => {
  it('não menciona nenhuma API de áudio nem de navegador', () => {
    const fonte = semComentarios('src/call/nivel-voz.ts')

    for (const proibido of [
      'AudioContext', 'AnalyserNode', 'MediaStream', 'navigator', 'document',
      'window', 'requestAnimationFrame',
    ]) {
      expect(fonte).not.toContain(proibido)
    }
  })

  it('não importa nada — a decisão não depende de peça nenhuma', () => {
    const fonte = readFileSync('src/call/nivel-voz.ts', 'utf8')

    expect(fonte).not.toMatch(/^import\s/m)
  })
})
