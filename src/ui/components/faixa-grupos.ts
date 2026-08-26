import { corDoGrupo } from '../../grupos/grupos'
import type { Grupo } from '../../grupos/grupos'
import { formatarCodigo } from '../codigo'

/**
 * A faixa de grupos salvos, no topo da home.
 *
 * É o que faz a home ser "híbrida": quem chega pela primeira vez vê a
 * apresentação, e quem já tem grupos vê os grupos primeiro. Saber qual é o
 * caso custa uma leitura do armazenamento, então não há razão para mostrar a
 * mesma coisa às duas pessoas.
 *
 * Cada cartão leva a cor derivada do próprio código — a mesma em qualquer
 * máquina, sem nada a sincronizar. É a única pista visual que distingue os
 * cartões de relance, então ela carrega mais peso do que parece.
 */
export function renderizarFaixaGrupos(
  lista: Grupo[],
  aoEntrar: (codigo: string) => void,
  aoRemover: (codigo: string) => void,
  /**
   * Quantas OUTRAS pessoas estão em cada grupo agora.
   *
   * Chega por função e não por número dentro do `Grupo`: presença muda o tempo
   * todo e o grupo salvo não, e guardar as duas coisas juntas faria a lista
   * salva parecer volátil.
   */
  quantosEm: (codigo: string) => number = () => 0,
): HTMLElement {
  const faixa = document.createElement('section')
  faixa.className = 'faixa-grupos'
  // Sem grupos não há faixa: um título sozinho em cima de nada é pior do que
  // não ter seção nenhuma.
  if (lista.length === 0) return faixa

  const titulo = document.createElement('h2')
  titulo.className = 'home-titulo'
  titulo.textContent = 'Seus grupos'
  faixa.append(titulo)

  const grade = document.createElement('div')
  grade.className = 'faixa-grupos-grade'

  for (const grupo of lista) {
    const cartao = document.createElement('div')
    cartao.className = 'grupo-cartao'
    cartao.dataset['grupo'] = grupo.codigo
    cartao.style.setProperty('--cor-grupo', corDoGrupo(grupo.codigo))

    const entrar = document.createElement('button')
    entrar.type = 'button'
    entrar.className = 'grupo-entrar'
    entrar.dataset['entrar'] = grupo.codigo

    const nome = document.createElement('span')
    nome.className = 'grupo-nome'
    // `textContent`: o nome foi digitado por uma pessoa.
    nome.textContent = grupo.nome

    const codigo = document.createElement('span')
    codigo.className = 'grupo-codigo'
    codigo.textContent = formatarCodigo(grupo.codigo)

    entrar.append(nome, codigo)

    // Só aparece quando há alguém. "0 online" é ruído: a ausência do selo já
    // diz isso, e diz mais baixo.
    const quantos = quantosEm(grupo.codigo)
    if (quantos > 0) {
      const online = document.createElement('span')
      online.className = 'grupo-online'
      online.dataset['online'] = grupo.codigo
      online.textContent = `${quantos} online`
      entrar.append(online)
    }

    entrar.onclick = () => aoEntrar(grupo.codigo)

    const remover = document.createElement('button')
    remover.type = 'button'
    remover.className = 'grupo-remover'
    remover.dataset['remover'] = grupo.codigo
    remover.textContent = '×'
    // Só tira o atalho. Ninguém sai de sala nenhuma, e quem tiver o link entra
    // do mesmo jeito — dizer isso evita o medo de apagar algo dos outros.
    remover.title = `Tirar ${grupo.nome} daqui. A sala continua existindo.`
    remover.setAttribute('aria-label', `Tirar ${grupo.nome} da tela inicial`)
    remover.onclick = () => aoRemover(grupo.codigo)

    cartao.append(entrar, remover)
    grade.append(cartao)
  }

  faixa.append(grade)
  return faixa
}
