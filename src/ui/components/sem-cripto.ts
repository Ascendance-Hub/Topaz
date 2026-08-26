/**
 * A porta fechada quando o navegador não oferece criptografia.
 *
 * O código da sala não viaja como texto: ele vira uma chave (SHA-256 + AES-GCM)
 * antes de qualquer anúncio, e é isso que impede um relay de descoberta de
 * saber em que sala alguém está. Essa conta mora em `crypto.subtle`, que o
 * navegador só entrega em **contexto seguro** — `https://` ou `localhost`.
 *
 * Sem ela nada funciona, e o modo como falhava era o pior possível: a
 * identidade registrava um erro no console e seguia, o Trystero soltava
 * rejeições que ninguém pegava, e a pessoa via uma sala que simplesmente não
 * conectava. Nenhuma palavra na tela.
 *
 * Custou uma sessão inteira de investigação num teste por IP da rede local. É
 * barato demais para continuar acontecendo.
 */

interface CriptoDoNavegador {
  isSecureContext: boolean
  subtle: unknown
}

export function faltaCripto(amb: CriptoDoNavegador): boolean {
  // Os dois, porque um não implica o outro: um navegador antigo numa página
  // https tem contexto seguro e não tem `subtle`.
  return !amb.isSecureContext || amb.subtle === undefined
}

export function renderizarSemCripto(endereco: string): HTMLElement {
  const caixa = document.createElement('section')
  caixa.className = 'sem-cripto'
  // `alert` e não `status`: a pessoa não pode usar nada da página, então isto
  // merece interromper a leitura em vez de esperar uma pausa.
  caixa.setAttribute('role', 'alert')

  const titulo = document.createElement('h1')
  titulo.textContent = 'Este endereço não permite conexão segura'

  const porque = document.createElement('p')
  porque.textContent = 'O Topaz transforma o código da sala numa chave de '
    + 'criptografia antes de procurar alguém. O navegador só libera essa conta '
    + 'em páginas https — e esta foi aberta sem ele, então nada consegue nem '
    + 'começar.'

  const onde = document.createElement('p')
  onde.className = 'sem-cripto-endereco'
  onde.textContent = endereco

  const saida = document.createElement('p')
  saida.textContent = 'Abra o site pelo endereço https. Se você estiver '
    + 'testando na sua própria máquina, localhost também funciona.'

  caixa.append(titulo, porque, onde, saida)
  return caixa
}
