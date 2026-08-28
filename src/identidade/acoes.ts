import { entrarComSegredo, identidadeAtual, sairDaIdentidade } from './atual'
import type { Identidade } from './atual'

/**
 * O que a interface pode fazer com a identidade desta máquina.
 *
 * Existia **duas vezes** — uma dentro da sala, nos Ajustes, e uma na home —,
 * com a mesma lógica e as mesmas mensagens de erro. A diferença entre as
 * cópias era só onde a identidade nova ia parar, e isso virou o `adotar`.
 *
 * Nenhuma das três derruba a tela quando falha: sem identidade a sala continua
 * funcionando e a home continua servindo para entrar em sala — ninguém ganha
 * selo, e é só isso. Trocar um enfeite ausente por uma página em branco seria
 * o pior desfecho possível.
 */
export interface AcoesIdentidade {
  guardei(): void
  entrarComSegredo(segredo: string): void
  sair(): void
}

export function criarAcoesIdentidade(
  /** A identidade em uso agora, ou `null` enquanto o cofre não respondeu. */
  atual: () => Identidade | null,
  adotar: (nova: Identidade) => void,
): AcoesIdentidade {
  return {
    // A pessoa afirmou ter guardado: paramos de mostrar o segredo. Ele não é
    // apagado de lugar nenhum porque nunca foi guardado — só existia numa
    // variável, e a chave no cofre é não extraível de propósito.
    guardei: () => {
      const eu = atual()
      if (eu) adotar({ ...eu, segredoNovo: undefined })
    },
    entrarComSegredo: (segredo) => {
      entrarComSegredo(segredo).then(adotar).catch((erro: unknown) => {
        console.warn('não deu para entrar com esse ID', erro)
      })
    },
    sair: () => {
      sairDaIdentidade()
        .then(() => identidadeAtual())
        .then(adotar)
        .catch((erro: unknown) => console.warn('não deu para sair', erro))
    },
  }
}
