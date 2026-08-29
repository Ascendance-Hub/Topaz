import type { StatusConexao } from '../net/sessao'
import type { Tela } from '../ui/components/trilho'

/**
 * O que o palco mostra agora.
 *
 * Separado do desenho de propósito: as regras abaixo custaram caro e cabem
 * numa função pura, testável sem DOM nenhum. Quem renderiza só obedece.
 */
export type ConteudoDoPalco =
  /** Ainda não há anfitrião, ou a conexão falhou. */
  | { tipo: 'conexao'; status: StatusConexao; comTesteDeRede: boolean }
  | { tipo: 'mesa' }
  | { tipo: 'jogos' }
  | { tipo: 'formato'; jogo: string }
  | { tipo: 'config' }
  | { tipo: 'dicas' }
  /** Dentro da call o miolo são os rostos, e o palco sai da frente. */
  | { tipo: 'rostos' }
  | { tipo: 'convite'; comTesteDeRede: boolean }

export interface EstadoDaSalaParaDesenhar {
  status: StatusConexao
  tela: Tela
  /** Qual jogo está com o formato aberto, dentro da aba de Jogos. */
  jogoEmAjuste: string | null
  euNaCall: boolean
  /** Ninguém mais conectado comigo. */
  sozinho: boolean
}

/**
 * A decisão, sem desenhar nada.
 *
 * As três regras que ela guarda, e por que cada uma existe:
 *
 * 1. **A conexão vem antes de tudo.** Enquanto ninguém é anfitrião a mesa ainda
 *    não existe, e mostrá-la vazia com "Aguardando jogadores…" confundiria
 *    "ninguém entrou ainda" com "a conexão falhou" (spec §14).
 * 2. **Quem está sozinho recebe o teste de rede.** A aplicação não distingue de
 *    dentro "ninguém me achou" de "minha rede não deixa conectar" — o teste
 *    responde a segunda metade, na máquina certa.
 * 3. **Dentro da call o palco sai da frente.** O miolo são os rostos, e quem
 *    desenha a roda é outro caminho.
 */
export function oQueOPalcoMostra(estado: EstadoDaSalaParaDesenhar): ConteudoDoPalco {
  if (estado.status !== 'conectado') {
    return {
      tipo: 'conexao',
      status: estado.status,
      // Só na falha: durante "conectando" o teste seria ruído sobre algo que
      // ainda está acontecendo.
      comTesteDeRede: estado.status === 'sem-conexao',
    }
  }
  if (estado.tela === 'mesa') return { tipo: 'mesa' }
  if (estado.tela === 'jogos') {
    return estado.jogoEmAjuste === null
      ? { tipo: 'jogos' }
      : { tipo: 'formato', jogo: estado.jogoEmAjuste }
  }
  if (estado.tela === 'config') return { tipo: 'config' }
  if (estado.tela === 'dicas') return { tipo: 'dicas' }
  if (estado.euNaCall) return { tipo: 'rostos' }
  return { tipo: 'convite', comTesteDeRede: estado.sozinho }
}
