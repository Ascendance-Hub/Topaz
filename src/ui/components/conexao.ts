import type { StatusConexao } from '../../net/sessao'

export const TITULO_CONECTANDO = 'Conectando à sala…'
export const DETALHE_CONECTANDO =
  'Procurando os outros jogadores. Isso costuma levar alguns segundos.'

export const TITULO_SEM_CONEXAO = 'Não foi possível conectar'
export const DETALHE_SEM_CONEXAO =
  'Ninguém foi encontrado nesta sala. A rede pode estar bloqueando a conexão ' +
  'direta entre navegadores (redes de empresa e alguns celulares fazem isso). ' +
  'Tente outra rede, confira o código da sala e recarregue a página.'

export const DETALHE_SEM_RELAY =
  'Nenhum servidor de descoberta respondeu. Antivírus, firewall ou o DNS da '
  + 'sua rede podem estar bloqueando — o Norton já marcou um deles como '
  + 'phishing por engano. Vale conferir o histórico de bloqueios do antivírus '
  + 'e liberar o endereço, ou tentar de outra rede.'

/**
 * Enquanto a sala não resolve quem é o anfitrião, a mesa não existe ainda —
 * mostrar "Aguardando jogadores…" aqui seria mentira: é a mesma tela para
 * "ninguém entrou ainda", "o relay caiu" e "o WebRTC está bloqueado". A spec
 * §14 pede mensagem clara em vez de tela travada, e é isto.
 */
export function renderizarConexao(
  status: StatusConexao, relaysConectados?: number,
): HTMLElement {
  const caixa = document.createElement('div')
  caixa.className = 'conexao'
  caixa.dataset['status'] = status

  const falhou = status === 'sem-conexao'
  if (falhou) caixa.classList.add('falhou')

  const titulo = document.createElement('div')
  titulo.className = 'conexao-titulo'
  titulo.textContent = falhou ? TITULO_SEM_CONEXAO : TITULO_CONECTANDO

  const detalhe = document.createElement('div')
  detalhe.className = 'conexao-detalhe'
  // Zero relays conectados é um diagnóstico DIFERENTE de "ninguém entrou": a
  // sinalização nem sequer chegou a funcionar. Antivírus e firewall bloqueiam
  // em silêncio, e sem esta distinção a pessoa procura o defeito na sala, no
  // código ou no amigo — nunca na própria máquina, que é onde ele está.
  const semSinalizacao = falhou && relaysConectados === 0
  detalhe.textContent = semSinalizacao
    ? DETALHE_SEM_RELAY
    : (falhou ? DETALHE_SEM_CONEXAO : DETALHE_CONECTANDO)

  caixa.append(titulo, detalhe)
  return caixa
}
