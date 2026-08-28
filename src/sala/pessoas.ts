import { montarParticipantes } from '../ui/components/participantes'
import type { FonteDeParticipantes, Participante } from '../ui/components/participantes'

/** Quem falou antes de a mesa saber o nome dele. */
export const APELIDO_DESCONHECIDO = 'Alguém'

/**
 * O que a sala precisa saber de fora para dizer quem é quem.
 *
 * Tudo função, e nada valor: este registro é consultado no ritmo da FALA — dez
 * vezes por segundo — e precisa enxergar o estado de agora, não o de quando
 * foi montado.
 */
export interface DependenciasDePessoas {
  /** Do `EstadoJogo`: é de lá que sai o apelido, nunca do payload do chat. */
  jogadores(): readonly { peerId: string; apelido: string }[]
  euNaCall(): boolean
  /** Quem está no MEU canal. */
  comigo(): readonly string[]
  meuApelido(): string
  minhaFoto(): string | undefined
  meuMicrofoneMudo(): boolean
  euSemMicrofone(): boolean
}

/**
 * O registro de quem é quem na sala: nome, foto, selo e quem está falando.
 *
 * Estava espalhado pelo `main.ts` em três coleções soltas, uma função de nome e
 * uma de montagem. Junto, vira a resposta a uma pergunta só — *quem são as
 * pessoas daqui?* — e passa a ser testável sem montar uma sala inteira.
 *
 * **É a peça que a feature de amigos vai usar.** A presença de hoje conta
 * *quantos*; o *quem* mora aqui, e é aqui que um amigo reconhecido entraria,
 * ao lado do selo que já existe.
 *
 * As três coleções são separadas de propósito, e cada uma tem dono diferente:
 * a foto chega pelo canal de fotos e passa por `fotoRecebida` antes; o selo só
 * entra depois de a assinatura fechar; e quem está falando é medido localmente
 * sobre o áudio que já chega, sem nada trafegar.
 */
export interface Pessoas {
  apelidoDe(peerId: string): string
  /** Já conferida por quem recebeu: daqui para a tela ninguém desconfia de
   *  novo. */
  guardarFoto(peerId: string, foto: string): void
  /** Só depois de a pessoa PROVAR quem é. Afirmar é trivial, provar não. */
  guardarSelo(peerId: string, selo: string): void
  /** Ao sair da sala. Sem isto, a foto de quem saiu ficaria guardada até a aba
   *  fechar e reapareceria se outra pessoa herdasse o mesmo id. */
  esquecer(peerId: string): void
  definirFalando(id: string, falando: boolean): void
  falando(id: string): boolean
  /** Ao sair da call: ninguém está falando se ninguém está sendo medido. */
  limparFalantes(): void
  fonte(): FonteDeParticipantes
  participantes(): Participante[]
}

export function criarPessoas(dep: DependenciasDePessoas): Pessoas {
  const fotos = new Map<string, string>()
  const selos = new Map<string, string>()
  const falantes = new Set<string>()

  /**
   * O apelido sai do `EstadoJogo` pelo peerId, e não do que o remetente
   * escreveu: assim ninguém digita o próprio nome e, portanto, ninguém se passa
   * por outro. Quem falou antes do primeiro retrato do anfitrião chegar ainda
   * não tem nome conhecido — daí o genérico, em vez de mostrar um peerId cru.
   */
  function apelidoDe(peerId: string): string {
    return dep.jogadores().find((j) => j.peerId === peerId)?.apelido
      || APELIDO_DESCONHECIDO
  }

  /**
   * Tudo que se sabe sobre quem está na call, num lugar só.
   *
   * Serve à roda de rostos e à lista de canais da esquerda. Uma só porque as
   * duas precisam exatamente do mesmo, e uma cópia divergiria na primeira vez
   * que alguém acrescentasse um campo.
   */
  function fonte(): FonteDeParticipantes {
    return {
      euNaCall: dep.euNaCall(),
      naCall: [...dep.comigo()],
      meuApelido: dep.meuApelido(),
      minhaFoto: dep.minhaFoto(),
      meuMicrofoneMudo: dep.meuMicrofoneMudo(),
      euSemMicrofone: dep.euSemMicrofone(),
      falantes,
      fotos,
      selos,
      apelidoDe,
    }
  }

  return {
    apelidoDe,
    guardarFoto: (peerId, foto) => { fotos.set(peerId, foto) },
    guardarSelo: (peerId, selo) => { selos.set(peerId, selo) },
    esquecer: (peerId) => {
      fotos.delete(peerId)
      selos.delete(peerId)
    },
    definirFalando: (id, falando) => {
      if (falando) falantes.add(id)
      else falantes.delete(id)
    },
    falando: (id) => falantes.has(id),
    limparFalantes: () => { falantes.clear() },
    fonte,
    participantes: () => montarParticipantes(fonte()),
  }
}
