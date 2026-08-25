import type { Identidade } from '../../identidade/atual'
import { ehSegredoValido } from '../../identidade/chaves'

export const AVISO_GUARDE =
  'Este é o seu ID. Guarde num lugar seguro: é com ele que você entra em '
  + 'outro computador. Ele não pode ser mostrado de novo — a chave fica '
  + 'trancada neste navegador de um jeito que nem nós conseguimos ler.'

export interface AcoesIdentidade {
  /** Entrar com um ID guardado — o "logar noutro dispositivo". */
  entrarComSegredo(segredo: string): void
  /** Apagar a identidade desta máquina. */
  sair(): void
  /** A pessoa afirmou ter guardado o segredo; pode parar de mostrá-lo. */
  guardei(): void
}

/**
 * O painel da identidade.
 *
 * Tem dois estados bem diferentes, e a diferença é deliberada:
 *
 * - **Acabou de criar**: o segredo aparece grande, com aviso, e não some
 *   sozinho. É a única vez que ele existe para ser visto — a chave guardada é
 *   não extraível, então depois daqui não há como recuperá-lo.
 * - **Já existe**: um selo pequeno e discreto. Identidade em uso não é assunto
 *   de todo dia; ela só precisa estar à mão para comparar com alguém.
 */
export function renderizarIdentidade(
  identidade: Identidade | null, acoes: AcoesIdentidade,
): HTMLElement {
  const area = document.createElement('section')
  area.className = 'identidade'

  // Ainda carregando do cofre: nada de "criar identidade" piscando na tela
  // antes de sabermos se já existe uma.
  if (!identidade) return area

  if (identidade.segredoNovo) {
    area.dataset['novo'] = '1'
    area.append(novoSegredo(identidade.segredoNovo, acoes))
    return area
  }

  area.append(seloDiscreto(identidade.selo), formularioDeEntrada(acoes), botaoSair(acoes))
  return area
}

function novoSegredo(segredo: string, acoes: AcoesIdentidade): HTMLElement {
  const caixa = document.createElement('div')
  caixa.className = 'identidade-novo'

  const titulo = document.createElement('h3')
  titulo.className = 'identidade-titulo'
  titulo.textContent = 'Guarde o seu ID'

  const aviso = document.createElement('p')
  aviso.className = 'identidade-aviso'
  aviso.textContent = AVISO_GUARDE

  // `readOnly` e não `disabled`: desabilitado não deixa selecionar o texto, e
  // selecionar é exatamente o que a pessoa precisa fazer aqui.
  const campo = document.createElement('textarea')
  campo.className = 'identidade-segredo'
  campo.readOnly = true
  campo.rows = 3
  campo.value = segredo
  campo.dataset['id'] = 'segredo'
  campo.setAttribute('aria-label', 'Seu ID secreto')

  const copiar = document.createElement('button')
  copiar.type = 'button'
  copiar.className = 'botao'
  copiar.dataset['id'] = 'copiar'
  copiar.textContent = 'Copiar'
  copiar.onclick = () => {
    // Seleciona sempre, mesmo que a área de transferência funcione: é o
    // caminho que sobra em navegador antigo ou com permissão negada.
    campo.select()
    void navigator.clipboard?.writeText(segredo).catch(() => {})
    copiar.textContent = 'Copiado!'
  }

  const pronto = document.createElement('button')
  pronto.type = 'button'
  pronto.className = 'botao fantasma'
  pronto.dataset['id'] = 'guardei'
  pronto.textContent = 'Já guardei'
  pronto.onclick = () => acoes.guardei()

  caixa.append(titulo, aviso, campo, copiar, pronto)
  return caixa
}

function seloDiscreto(selo: string): HTMLElement {
  const linha = document.createElement('p')
  linha.className = 'identidade-selo'
  linha.append('Seu ID: ')

  const valor = document.createElement('span')
  valor.className = 'identidade-selo-valor'
  valor.textContent = selo
  linha.append(valor)
  return linha
}

function formularioDeEntrada(acoes: AcoesIdentidade): HTMLElement {
  const form = document.createElement('form')
  form.className = 'identidade-entrar'

  const campo = document.createElement('input')
  campo.type = 'text'
  campo.className = 'campo'
  campo.placeholder = 'Colar um ID guardado'
  campo.dataset['id'] = 'entrar-campo'

  const enviar = document.createElement('button')
  enviar.type = 'submit'
  enviar.className = 'botao fantasma'
  enviar.dataset['id'] = 'entrar'
  enviar.textContent = 'Entrar com este ID'

  const erro = document.createElement('p')
  erro.className = 'identidade-erro'
  erro.hidden = true

  form.onsubmit = (evento) => {
    evento.preventDefault()
    const segredo = campo.value.trim()
    // Confere o formato ANTES de trocar: um erro aqui apagaria a identidade
    // que está funcionando por causa de um espaço a mais no que foi colado.
    if (!ehSegredoValido(segredo)) {
      erro.hidden = false
      erro.textContent = 'Esse não parece ser um ID válido. Confira se copiou inteiro.'
      return
    }
    erro.hidden = true
    campo.value = ''
    acoes.entrarComSegredo(segredo)
  }

  form.append(campo, enviar, erro)
  return form
}

function botaoSair(acoes: AcoesIdentidade): HTMLElement {
  const sair = document.createElement('button')
  sair.type = 'button'
  sair.className = 'botao fantasma'
  sair.dataset['id'] = 'sair'
  sair.textContent = 'Sair desta máquina'
  sair.title =
    'Apaga a sua identidade deste navegador. Sem o ID guardado, não dá para voltar.'
  sair.onclick = () => acoes.sair()
  return sair
}
