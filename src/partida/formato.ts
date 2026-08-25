import { normalizarConfig } from '../game/rules'
import type { ConfigPartida } from '../game/types'

/**
 * Guardar e transportar um formato de partida.
 *
 * Duas coisas diferentes, que resolvem problemas diferentes:
 *
 * - **Lembrar** é conveniência na sua máquina. O caso comum — o grupo sair e
 *   voltar noutro dia — deixa de exigir qualquer coisa da pessoa.
 * - **Exportar** é portabilidade: mandar o formato para um amigo, ou levar
 *   para outro computador. É o que o armazenamento local não faz.
 *
 * O JSON é texto para copiar, não arquivo para baixar. Agora que a máquina
 * lembra sozinha, o único uso que sobra para ele é mandar o formato a outra
 * pessoa — e isso se faz colando no chat. Arquivo seria uma volta a mais para
 * o mesmo fim, e um caminho a menos que funciona em todo navegador.
 */

export const CHAVE_FORMATO = 'topaz:formato'

/** Teto do texto aceito na importação. Um formato tem quatro números; o resto
 *  é lixo ou tentativa de travar o navegador com um JSON gigante. */
export const MAX_JSON = 2000

export function lembrarFormato(config: ConfigPartida): void {
  try {
    localStorage.setItem(CHAVE_FORMATO, JSON.stringify(config))
  } catch {
    // Armazenamento bloqueado: o formato vale só nesta sessão.
  }
}

/**
 * O último formato salvo por esta pessoa, ou `null`.
 *
 * Passa por `normalizarConfig` porque o `localStorage` é editável por qualquer
 * script desta origem — e porque pode ter sido escrito por uma versão do site
 * que não conhecemos.
 */
export function formatoLembrado(): ConfigPartida | null {
  try {
    const cru = localStorage.getItem(CHAVE_FORMATO)
    if (cru === null) return null
    return normalizarConfig(JSON.parse(cru))
  } catch {
    // JSON corrompido ou armazenamento indisponível: é como não ter nenhum.
    return null
  }
}

export function esquecerFormato(): void {
  try {
    localStorage.removeItem(CHAVE_FORMATO)
  } catch {
    // Nada a fazer.
  }
}

/** O formato como texto para copiar. Indentado porque alguém vai lê-lo. */
export function paraJson(config: ConfigPartida): string {
  return JSON.stringify(config, null, 2)
}

/**
 * Lê um formato colado, ou devolve `null`.
 *
 * `null` para tudo que não fecha, sem distinguir "não é JSON" de "é JSON de
 * outra coisa": quem colou errado precisa saber que errou, não de qual das
 * duas maneiras.
 *
 * O que fecha passa por `normalizarConfig`, então um formato de uma versão
 * futura com campos a mais — ou com números impossíveis — vira algo jogável em
 * vez de ser recusado.
 */
export function deJson(texto: unknown): ConfigPartida | null {
  if (typeof texto !== 'string') return null
  const limpo = texto.trim()
  if (limpo === '' || limpo.length > MAX_JSON) return null
  try {
    const cru: unknown = JSON.parse(limpo)
    if (typeof cru !== 'object' || cru === null || Array.isArray(cru)) return null
    // Sem NENHUM campo conhecido não é um formato: é outro JSON qualquer, e
    // aceitá-lo devolveria o padrão como se a importação tivesse dado certo.
    const c = cru as Record<string, unknown>
    const conhecidos = ['fichasIniciais', 'alvo', 'apostaMax', 'segundosTurno']
    if (!conhecidos.some((k) => k in c)) return null
    return normalizarConfig(cru)
  } catch {
    return null
  }
}
