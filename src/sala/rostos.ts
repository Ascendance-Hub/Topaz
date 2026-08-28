import type { EstadoCall } from '../call/protocolo'
import { renderizarCanais } from '../ui/components/canais'
import { EU, montarDoCanal } from '../ui/components/participantes'
import type { FonteDeParticipantes, Participante } from '../ui/components/participantes'
import { renderizarRoda } from '../ui/components/roda'
import { criarSlot } from '../ui/slot'
import type { Slot } from '../ui/slot'

export interface PessoasParaRostos {
  fonte(): FonteDeParticipantes
  participantes(): Participante[]
  falando(id: string): boolean
}

export interface DependenciasDeRostos {
  estadoCall(): EstadoCall
  pessoas: PessoasParaRostos
  meuId(): string
  /** Clicar num canal entra na call ali, se ainda não estiver nela. */
  aoEntrarNoCanal(id: string): void
  aoAbrirCanal(): void
}

export interface Rostos {
  /** A lista de canais da coluna esquerda. Anexe `.atual` uma vez. */
  readonly canais: Slot<HTMLElement>
  /** A roda de rostos do miolo. Anexe `.atual` uma vez. */
  readonly roda: Slot<HTMLElement>
  /**
   * Só a fileira e a roda, sem redesenhar o resto.
   *
   * Chamada a cada mudança de quem fala — **muitas vezes por minuto**.
   */
  desenhar(): void
  /** Força o próximo desenho a refazer os retratos. */
  invalidar(): void
}

/**
 * O desenho que acompanha a FALA.
 *
 * Existe separado do resto porque tem ritmo próprio: o anel de quem fala
 * precisa acender junto com a voz, e redesenhar a página inteira dez vezes por
 * segundo por causa de um anel seria caro e faria a mesa piscar.
 *
 * As duas memoizações aqui não são otimização preventiva — cada uma tem um
 * custo medido do outro lado. Ver `desenhar` e `invalidar`.
 */
export function criarRostos(dep: DependenciasDeRostos): Rostos {
  const canais = criarSlot(renderizarCanais([], '', { mudar: () => {} }))
  const roda = criarSlot(renderizarRoda([]))

  /** A assinatura da última lista desenhada, para não refazê-la à toa. */
  let assinaturaDosCanais = ''
  let assinaturaDaRoda = ''

  /**
   * Quem está falando, marcado no lugar.
   *
   * O anel acende trocando um atributo, sem refazer elemento nenhum: é a única
   * parte que muda em ritmo de fala.
   */
  function acenderQuemFala(): void {
    for (const item of roda.atual.querySelectorAll<HTMLElement>('.roda-pessoa')) {
      const quem = item.dataset['pessoa']
      if (quem !== undefined && dep.pessoas.falando(quem)) item.dataset['falando'] = '1'
      else delete item.dataset['falando']
    }
    for (const linha of canais.atual.querySelectorAll<HTMLElement>('.canal-pessoa')) {
      const quem = linha.dataset['pessoa']
      // Eu apareço sob a chave própria do medidor, e não sob o meu peerId: o
      // meu microfone é local e nunca chega pelo caminho de mídia recebida.
      const falando = quem !== undefined
        && dep.pessoas.falando(linha.dataset['eu'] === '1' ? EU : quem)
      if (falando) linha.dataset['falando'] = '1'
      else delete linha.dataset['falando']
    }
  }

  return {
    canais,
    roda,

    desenhar: () => {
      const atual = dep.estadoCall()

      // A lista só se reconstrói quando a COMPOSIÇÃO muda. Esta função roda a
      // cada mudança de quem fala, e refazer os retratos nesse ritmo mandaria
      // o navegador redecodificar toda foto várias vezes por minuto — a mesma
      // preocupação que fez esta parte existir separada do resto.
      const assinatura = `${atual.euNaCall}|${atual.meuCanal}|${atual.podeAbrirCanal}|`
        + atual.porCanal.map((c) => `${c.id}:${c.quem.join(',')}`).join(';')
      if (assinatura !== assinaturaDosCanais) {
        assinaturaDosCanais = assinatura
        canais.trocar(renderizarCanais(
          atual.porCanal.map((c) => ({
            id: c.id,
            nome: c.nome,
            // O protocolo entrega peerIds; nome e foto vêm do jogo e das fotos
            // recebidas. É aqui que os dois vocabulários se encontram.
            gente: montarDoCanal(c.quem, dep.meuId(), dep.pessoas.fonte()),
          })),
          // Fora da call eu não estou em canal nenhum, e nenhum deve aparecer
          // aceso: `meuCanal` guarda para onde eu iria, não onde eu estou.
          atual.euNaCall ? atual.meuCanal : '',
          {
            mudar: dep.aoEntrarNoCanal,
            // O botão só existe quando há id livre: um "+" que não abre nada
            // seria um botão que engana.
            ...(atual.podeAbrirCanal ? { abrir: dep.aoAbrirCanal } : {}),
          },
        ))
      }
      acenderQuemFala()

      // A roda segue a mesma regra dos canais: só se refaz quando a composição
      // muda. Assistindo alguém ela vira faixa, e o modo entra na assinatura
      // porque muda o desenho inteiro.
      const gente = dep.pessoas.participantes()
      const modo = atual.assistindo.length > 0 ? 'faixa' : 'grade'
      const assinaturaRoda = `${modo}|`
        + gente.map((p) => `${p.peerId}:${p.mudo}${p.semMicrofone}${p.selo ?? ''}`).join(',')
      if (assinaturaRoda !== assinaturaDaRoda) {
        assinaturaDaRoda = assinaturaRoda
        roda.trocar(renderizarRoda(gente, modo))
      }
    },

    /**
     * As assinaturas comparam **quem está onde**, e não como cada um está
     * desenhado — incluir a foto obrigaria a concatenar dezenas de milhares de
     * caracteres a cada mudança de quem fala, muitas vezes por minuto.
     *
     * Trocar de foto é raro, então avisar na mão é exato e muito mais barato
     * que a alternativa.
     */
    invalidar: () => {
      assinaturaDaRoda = ''
      assinaturaDosCanais = ''
    },
  }
}
