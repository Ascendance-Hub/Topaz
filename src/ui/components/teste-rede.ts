import { VEREDITOS } from '../../net/diagnostico-rede'
import type { Analise } from '../../net/diagnostico-rede'

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
} as const

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

  if (rodando) {
    const aviso = document.createElement('p')
    aviso.className = 'teste-rede-veredito'
    aviso.textContent = TEXTOS.rodando
    painel.append(aviso)
    return painel
  }

  if (!analise) return painel

  const veredito = document.createElement('p')
  veredito.className = 'teste-rede-veredito'
  const ruim = analise.veredito === VEREDITOS.simetrico
    || analise.veredito === VEREDITOS.semUdp
  veredito.dataset['ruim'] = ruim ? '1' : '0'
  veredito.textContent = PARA_TEXTO[analise.veredito] ?? TEXTOS.inconclusivo
  painel.append(veredito)

  return painel
}
