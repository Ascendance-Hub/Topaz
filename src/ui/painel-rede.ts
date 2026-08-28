import { coletarCandidatos } from '../net/coletar-candidatos'
import { analisarCandidatos } from '../net/diagnostico-rede'
import type { Analise } from '../net/diagnostico-rede'
import { relaysDetalhados } from '../net/transport'
import { renderizarTesteRede } from './components/teste-rede'

/**
 * O teste de rede, com o estado dele.
 *
 * Aparece em dois lugares — na home, para quem recebeu um link e não consegue
 * entrar, e dentro da sala, para quem está sozinho. As duas cópias guardavam
 * `analise` e `rodando` e chamavam `coletarCandidatos` do mesmo jeito.
 *
 * **`comRelays` é a única diferença de verdade: a home não conta servidores.**
 * Lá ninguém entrou em sala ainda, nenhum socket está aberto, e a contagem
 * sairia "0 de 20" — que lê como falha catastrófica para quem acabou de abrir
 * a página. O teste de NAT em si funciona sozinho: ele fala com os servidores
 * STUN direto.
 *
 * `detalhesAbertos` mora aqui, e não no componente, porque dentro da sala o
 * painel é reconstruído a cada clique na call — um `<details>` que fecha
 * sozinho enquanto a pessoa lê é a mesma família de bug do chat que perdia o
 * texto sendo digitado.
 */
export function criarPainelDeRede(aoMudar: () => void) {
  let analise: Analise | null = null
  let rodando = false
  let detalhesAbertos: boolean | undefined

  const estadoDetalhes = {
    get aberto() { return detalhesAbertos },
    aoAlternar: (aberto: boolean) => { detalhesAbertos = aberto },
  }

  function testar(): void {
    if (rodando) return
    rodando = true
    aoMudar()
    void coletarCandidatos().then(({ candidatos, erros }) => {
      analise = analisarCandidatos(candidatos, erros)
      rodando = false
      aoMudar()
    })
  }

  return {
    testar,
    desenhar: (comRelays: boolean): HTMLElement => (comRelays
      ? renderizarTesteRede(analise, rodando, testar, relaysDetalhados(), estadoDetalhes)
      : renderizarTesteRede(analise, rodando, testar)),
  }
}
