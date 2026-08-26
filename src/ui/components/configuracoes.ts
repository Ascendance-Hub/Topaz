import { renderizarRetrato } from './retrato'
import { inicialDe } from './participantes'
import { renderizarIdentidade } from './identidade'
import type { AcoesIdentidade } from './identidade'
import type { Identidade } from '../../identidade/atual'
import { formatarCodigo } from '../codigo'
import { MAX_NOME } from '../../grupos/grupos'
import type { Grupo } from '../../grupos/grupos'

/**
 * Os ajustes da sala.
 *
 * Reúne o que antes só existia na porta de entrada — apelido e foto, que só
 * dava para escolher antes de entrar — e o que não tinha lugar nenhum: salvar
 * esta sala como grupo, e os controles da identidade.
 *
 * A ordem segue quem procura o quê: **você** primeiro, porque é o ajuste do
 * dia a dia; **este grupo** depois, porque é de vez em quando; e a
 * **identidade** por último, porque é quase nunca — e porque "Sair desta
 * máquina" é destrutivo e não merece ficar no caminho de quem só queria trocar
 * a foto.
 */

export interface DadosConfiguracoes {
  apelido: string
  /** O código desta sala, para poder salvá-la como grupo. */
  codigo: string
  /** O grupo, se esta sala já estiver salva. */
  grupo: Grupo | null
  identidade: Identidade | null
}

export interface AcoesConfiguracoes {
  /** Troca o apelido. Vale para esta sala na hora e fica lembrado. */
  renomear(apelido: string): void
  salvarGrupo(nome: string): void
  esquecerGrupo(): void
  /**
   * A foto mudou nesta máquina.
   *
   * O retrato guarda a foto sozinho; quem precisa saber é o resto do mundo —
   * os peers, que só recebem foto quando alguém a anuncia, e os círculos, que
   * já estão desenhados com a anterior. Sem esta ligação a foto era salva e
   * mais nada acontecia, e só reentrar na sala a fazia aparecer.
   */
  trocouFoto(): void
  identidade: AcoesIdentidade
}

function secao(classe: string, titulo: string): HTMLElement {
  const el = document.createElement('section')
  el.className = `config-secao ${classe}`
  const h = document.createElement('h3')
  h.className = 'config-titulo'
  h.textContent = titulo
  el.append(h)
  return el
}

export function renderizarConfiguracoes(
  dados: DadosConfiguracoes, acoes: AcoesConfiguracoes,
): HTMLElement {
  const area = document.createElement('div')
  area.className = 'config'

  area.append(secaoVoce(dados, acoes), secaoGrupo(dados, acoes))

  const identidade = secao('config-identidade', 'Sua identidade')
  identidade.append(renderizarIdentidade(dados.identidade, acoes.identidade))
  area.append(identidade)

  return area
}

function secaoVoce(
  dados: DadosConfiguracoes, acoes: AcoesConfiguracoes,
): HTMLElement {
  const el = secao('config-voce', 'Você')

  const form = document.createElement('form')
  form.className = 'config-linha'

  const campo = document.createElement('input')
  campo.type = 'text'
  campo.className = 'campo'
  campo.dataset['config'] = 'apelido'
  campo.value = dados.apelido
  campo.maxLength = 16
  campo.setAttribute('aria-label', 'Seu apelido')

  const salvar = document.createElement('button')
  salvar.type = 'submit'
  salvar.className = 'botao fantasma'
  salvar.dataset['config'] = 'salvar-apelido'
  salvar.textContent = 'Trocar nome'

  form.onsubmit = (evento) => {
    evento.preventDefault()
    const novo = campo.value.trim()
    // Apelido em branco deixaria a pessoa sem nome para todo mundo na sala.
    if (!novo) {
      campo.value = dados.apelido
      campo.focus()
      return
    }
    acoes.renomear(novo)
  }

  const retrato = renderizarRetrato(() => inicialDe(campo.value), acoes.trocouFoto)
  campo.addEventListener('input', () => retrato.atualizar())

  form.append(campo, salvar)
  el.append(form, retrato.raiz)
  return el
}

function secaoGrupo(
  dados: DadosConfiguracoes, acoes: AcoesConfiguracoes,
): HTMLElement {
  const el = secao('config-grupo', 'Esta sala')

  const explicacao = document.createElement('p')
  explicacao.className = 'config-texto'
  // A limitação dita na cara: o grupo é um atalho SEU, não um cadastro que
  // acompanha a pessoa. Fingir o contrário seria mentir sobre o produto.
  explicacao.textContent = dados.grupo
    ? 'Salva neste navegador. Ela aparece na tela inicial para você voltar num clique.'
    : 'Salve para ela aparecer na tela inicial e não precisar do link de novo. '
      + 'Fica só neste navegador.'
  el.append(explicacao)

  const codigo = document.createElement('p')
  codigo.className = 'config-codigo'
  codigo.textContent = formatarCodigo(dados.codigo)
  el.append(codigo)

  const form = document.createElement('form')
  form.className = 'config-linha'

  const campo = document.createElement('input')
  campo.type = 'text'
  campo.className = 'campo'
  campo.dataset['config'] = 'nome-grupo'
  campo.placeholder = 'Nome do grupo'
  campo.maxLength = MAX_NOME
  campo.value = dados.grupo?.nome ?? ''
  campo.setAttribute('aria-label', 'Nome do grupo')

  const salvar = document.createElement('button')
  salvar.type = 'submit'
  salvar.className = 'botao fantasma'
  salvar.dataset['config'] = 'salvar-grupo'
  salvar.textContent = dados.grupo ? 'Renomear' : 'Salvar grupo'

  form.onsubmit = (evento) => {
    evento.preventDefault()
    // Nome vazio é aceito de propósito: `nomeLimpo` usa o código como rótulo,
    // e obrigar a batizar antes de salvar seria atrito num caminho de um
    // clique.
    acoes.salvarGrupo(campo.value)
  }

  form.append(campo, salvar)
  el.append(form)

  if (dados.grupo) {
    const esquecer = document.createElement('button')
    esquecer.type = 'button'
    esquecer.className = 'botao fantasma'
    esquecer.dataset['config'] = 'esquecer-grupo'
    esquecer.textContent = 'Tirar da tela inicial'
    // Só tira o atalho: ninguém é removido de sala nenhuma, e o código
    // continua valendo para quem tiver o link.
    esquecer.title = 'Some com o atalho. A sala continua existindo.'
    esquecer.onclick = () => acoes.esquecerGrupo()
    el.append(esquecer)
  }

  return el
}
