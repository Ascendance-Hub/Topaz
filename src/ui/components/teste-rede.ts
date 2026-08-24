import { VEREDITOS } from '../../net/diagnostico-rede'
import type { Analise } from '../../net/diagnostico-rede'
import type { RelayDetalhe } from '../../net/transport'

export const TEXTOS = {
  rodando: 'Testando sua rede…',
  direto: 'Sua rede permite conexão direta. Se ainda assim você não encontra '
    + 'ninguém, o problema não está aqui.',
  simetrico: 'Sua rede não permite conexão direta entre navegadores. É o caso '
    + 'de muitas redes de empresa, faculdade e de alguns provedores de celular. '
    + 'Nenhuma configuração do site resolve isso — teria que existir um '
    + 'servidor de retransmissão no meio.',
  semUdp: 'Sua rede bloqueia a saída que o teste precisa. Firewall ou antivírus '
    + 'costumam ser a causa.',
  inconclusivo: 'Não deu para concluir: algum servidor de teste não respondeu. '
    + 'Vale tentar de novo em alguns segundos.',
  poucosRelays: 'Poucos servidores estão respondendo na sua rede. Antivírus '
    + 'costumam bloquear estes endereços por engano — vale conferir o '
    + 'histórico de bloqueios e liberar, ou desativar a proteção de web por '
    + 'alguns minutos para testar.',
} as const

/**
 * Abaixo disto, o aviso de bloqueio aparece.
 *
 * Zero conectados é o estado normal de quem acabou de entrar, então zero não
 * dispara nada — senão seria alarme falso em toda visita. O que preocupa é
 * conseguir alguns e não a maioria, que é a assinatura de um filtro
 * escolhendo endereços.
 */
const FRACAO_SAUDAVEL = 0.5

const PARA_TEXTO: Record<string, string> = {
  [VEREDITOS.direto]: TEXTOS.direto,
  [VEREDITOS.simetrico]: TEXTOS.simetrico,
  [VEREDITOS.semUdp]: TEXTOS.semUdp,
  [VEREDITOS.inconclusivo]: TEXTOS.inconclusivo,
}

/**
 * Teste de rede que qualquer pessoa da sala consegue rodar sozinha.
 *
 * Existe porque "não consigo entrar" tem causas que a aplicação não distingue
 * de dentro: quem nunca conectou com ninguém não aparece para ninguém, e o
 * silêncio é igual para "ninguém me achou" e "minha rede não deixa conectar".
 * Este teste responde a segunda metade, e responde na máquina de quem está
 * com o problema.
 */
export function renderizarTesteRede(
  analise: Analise | null, rodando: boolean, aoRodar: () => void,
  relays?: RelayDetalhe[],
): HTMLElement {
  const painel = document.createElement('div')
  painel.className = 'teste-rede'

  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'botao fantasma'
  botao.dataset['teste'] = 'rodar'
  botao.textContent = rodando ? TEXTOS.rodando : 'Testar minha rede'
  botao.disabled = rodando
  botao.onclick = aoRodar
  painel.append(botao)

  /**
   * Os servidores de descoberta, para duas pessoas compararem.
   *
   * Duas redes podem alcançar conjuntos DIFERENTES de servidores. Se os
   * conjuntos não se cruzam, as duas pessoas nunca se encontram — e nenhuma
   * vê erro, porque ambas têm servidores conectados. Só olhando os nomes lado
   * a lado dá para ver isso.
   */
  function listarRelays(): void {
    if (!relays || relays.length === 0) return

    const resumo = document.createElement('p')
    resumo.className = 'teste-rede-relays-resumo'
    const vivos = relays.filter((r) => r.conectado).length
    resumo.textContent =
      `Servidores de descoberta: ${vivos} de ${relays.length}. `
      + 'Compare esta lista com a da outra pessoa — vocês precisam ter pelo '
      + 'menos um em comum.'
    painel.append(resumo)

    if (vivos > 0 && vivos < relays.length * FRACAO_SAUDAVEL) {
      const alerta = document.createElement('p')
      alerta.className = 'teste-rede-veredito'
      alerta.dataset['ruim'] = '1'
      alerta.textContent = TEXTOS.poucosRelays
      painel.append(alerta)
    }

    const lista = document.createElement('div')
    lista.className = 'teste-rede-relays'
    for (const relay of relays) {
      const item = document.createElement('span')
      item.className = 'teste-rede-relay'
      item.dataset['conectado'] = relay.conectado ? '1' : '0'
      item.textContent = relay.nome
      lista.append(item)
    }
    painel.append(lista)
  }

  if (rodando) {
    const aviso = document.createElement('p')
    aviso.className = 'teste-rede-veredito'
    aviso.textContent = TEXTOS.rodando
    painel.append(aviso)
    listarRelays()
    return painel
  }

  if (!analise) {
    listarRelays()
    return painel
  }

  const veredito = document.createElement('p')
  veredito.className = 'teste-rede-veredito'
  const ruim = analise.veredito === VEREDITOS.simetrico
    || analise.veredito === VEREDITOS.semUdp
  veredito.dataset['ruim'] = ruim ? '1' : '0'
  veredito.textContent = PARA_TEXTO[analise.veredito] ?? TEXTOS.inconclusivo
  painel.append(veredito)
  listarRelays()

  return painel
}
