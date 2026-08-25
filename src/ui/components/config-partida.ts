import { LIMITES, normalizarConfig } from '../../game/rules'
import type { ConfigPartida } from '../../game/types'
import { deJson, paraJson } from '../../partida/formato'

export const AVISO_SO_ANFITRIAO =
  'Só o anfitrião muda o formato da partida — assim ninguém joga com regras '
  + 'diferentes das dos outros.'

export const AVISO_EM_ANDAMENTO =
  'A partida está em andamento. O formato só muda entre partidas: trocar o '
  + 'alvo agora mudaria a regra com dinheiro na mesa. Quando ela acabar, dá '
  + 'para ajustar antes de começar a próxima.'

export const AVISO_SUGESTAO =
  'Campos preenchidos com o último formato que você salvou. Confira e clique '
  + 'em salvar para valer nesta sala.'

export const ERRO_IMPORTAR =
  'Não deu para ler esse formato. Cole o texto inteiro, incluindo as chaves.'

export const AVISO_FICHAS =
  'Com a mesa parada, mudar as fichas já vale para todo mundo. Com a partida '
  + 'encerrada, vale na próxima — para não apagar o placar da que acabou.'

export interface DadosConfigPartida {
  config: ConfigPartida
  /**
   * O último formato salvo por esta pessoa, quando vale a pena oferecer.
   *
   * Quem decide se vale é quem monta: só faz sentido numa sala que ainda está
   * no padrão. Numa sala já configurada de propósito, preencher por cima
   * apagaria a escolha de alguém.
   */
  sugestao?: ConfigPartida | null
  souHost: boolean
  /** Partida em curso de verdade. `fim` NÃO conta: ali a partida acabou, e é
   *  onde se ajusta o formato antes de recomeçar. */
  emAndamento: boolean
}

interface Campo {
  chave: keyof ConfigPartida
  rotulo: string
  min: number
  max: number
  dica?: string
}

const CAMPOS: Campo[] = [
  {
    chave: 'fichasIniciais',
    rotulo: 'Fichas de cada um',
    min: LIMITES.fichasIniciais.min,
    max: LIMITES.fichasIniciais.max,
  },
  {
    chave: 'apostaMax',
    rotulo: 'Aposta máxima',
    min: LIMITES.apostaMax.min,
    max: LIMITES.apostaMax.max,
    dica: 'Nunca passa das fichas de cada um.',
  },
  {
    chave: 'segundosTurno',
    rotulo: 'Tempo de cada jogada',
    min: LIMITES.segundosTurno.min,
    max: LIMITES.segundosTurno.max,
    dica: 'Em segundos.',
  },
]

/**
 * O formato da partida.
 *
 * Existe por um defeito concreto: com 1000 fichas, alvo de 1500 e aposta
 * máxima de 500, apostar o máximo e ganhar a PRIMEIRA mão encerrava a partida.
 * O padrão passou a 2500, e o resto virou escolha do anfitrião.
 *
 * Duas restrições aparecem na tela em vez de acontecerem em silêncio:
 *
 * - **Só o anfitrião muda.** Quem não é vê os valores, para saber com que
 *   regras está jogando — esconder faria a mesa parecer arbitrária.
 * - **Só entre partidas.** Trocar o alvo no meio mudaria a regra com dinheiro
 *   na mesa, e quem estivesse na frente pela regra antiga perderia sem ter
 *   feito nada errado.
 */
export function renderizarConfigPartida(
  dados: DadosConfigPartida, aoSalvar: (config: ConfigPartida) => void,
): HTMLElement {
  const area = document.createElement('div')
  area.className = 'config-partida'

  const podeMexer = dados.souHost && !dados.emAndamento
  // A sugestão só preenche os campos; o que vale na sala continua sendo
  // `config` até alguém salvar. Por isso o aviso — sem ele a tela mostraria
  // números que a partida não está usando, e ninguém saberia disso.
  const mostrado = (podeMexer && dados.sugestao) || dados.config

  if (!podeMexer) {
    const aviso = document.createElement('p')
    aviso.className = 'config-texto'
    aviso.dataset['partida'] = 'aviso'
    // A razão, não só a proibição: "não pode" sem porquê parece capricho.
    aviso.textContent = dados.emAndamento ? AVISO_EM_ANDAMENTO : AVISO_SO_ANFITRIAO
    area.append(aviso)
  }

  const form = document.createElement('form')
  form.className = 'config-partida-form'

  const entradas = new Map<keyof ConfigPartida, HTMLInputElement>()

  for (const campo of CAMPOS) {
    const linha = document.createElement('label')
    linha.className = 'config-partida-linha'

    const nome = document.createElement('span')
    nome.className = 'config-partida-rotulo'
    nome.textContent = campo.rotulo

    const entrada = document.createElement('input')
    entrada.type = 'number'
    entrada.className = 'campo'
    entrada.dataset['partida'] = campo.chave
    entrada.min = String(campo.min)
    entrada.max = String(campo.max)
    entrada.value = String(mostrado[campo.chave] ?? '')
    entrada.disabled = !podeMexer
    entradas.set(campo.chave, entrada)

    linha.append(nome, entrada)
    if (campo.dica) {
      const dica = document.createElement('span')
      dica.className = 'config-partida-dica'
      dica.textContent = campo.dica
      linha.append(dica)
    }
    form.append(linha)
  }

  // ---- O alvo, que tem um modo além de um número ------------------------
  const linhaAlvo = document.createElement('div')
  linhaAlvo.className = 'config-partida-linha'

  const rotuloAlvo = document.createElement('label')
  rotuloAlvo.className = 'config-partida-rotulo'
  rotuloAlvo.textContent = 'Vence quem chegar a'

  const alvo = document.createElement('input')
  alvo.type = 'number'
  alvo.className = 'campo'
  alvo.dataset['partida'] = 'alvo'
  alvo.min = String(LIMITES.alvo.min)
  alvo.max = String(LIMITES.alvo.max)
  alvo.value = String(mostrado.alvo ?? LIMITES.alvo.min)
  alvo.disabled = !podeMexer || mostrado.alvo === null
  rotuloAlvo.htmlFor = 'config-alvo'
  alvo.id = 'config-alvo'

  const semAlvoRotulo = document.createElement('label')
  semAlvoRotulo.className = 'config-partida-modo'

  const semAlvo = document.createElement('input')
  semAlvo.type = 'checkbox'
  semAlvo.dataset['partida'] = 'sem-alvo'
  semAlvo.checked = mostrado.alvo === null
  semAlvo.disabled = !podeMexer
  // O campo de número não some quando desmarcado: some o sentido dele. Deixar
  // o valor visível e apagado mostra ao que se volta ao desmarcar.
  semAlvo.onchange = () => { alvo.disabled = !podeMexer || semAlvo.checked }

  semAlvoRotulo.append(semAlvo, document.createTextNode(' Jogar até sobrar um'))
  linhaAlvo.append(rotuloAlvo, alvo, semAlvoRotulo)
  form.append(linhaAlvo)

  if (podeMexer && dados.sugestao) {
    const nota = document.createElement('p')
    nota.className = 'config-partida-dica'
    nota.dataset['partida'] = 'sugestao'
    nota.textContent = AVISO_SUGESTAO
    form.append(nota)
  }

  const dicaFichas = document.createElement('p')
  dicaFichas.className = 'config-partida-dica'
  dicaFichas.textContent = AVISO_FICHAS
  form.append(dicaFichas)

  if (podeMexer) {
    const salvar = document.createElement('button')
    salvar.type = 'submit'
    salvar.className = 'botao fantasma'
    salvar.dataset['partida'] = 'salvar'
    salvar.textContent = 'Salvar formato'
    form.append(salvar)
  }

  form.onsubmit = (evento) => {
    evento.preventDefault()
    if (!podeMexer) return
    const numero = (chave: keyof ConfigPartida): number =>
      Number(entradas.get(chave)!.value)
    // Passa por `normalizarConfig` aqui também, e não só no motor: sem isto o
    // campo aceitaria um valor que o motor recusaria, e a tela mostraria uma
    // coisa enquanto a partida usa outra.
    aoSalvar(normalizarConfig({
      fichasIniciais: numero('fichasIniciais'),
      apostaMax: numero('apostaMax'),
      segundosTurno: numero('segundosTurno'),
      alvo: semAlvo.checked ? null : Number(alvo.value),
    }))
  }

  area.append(form, blocoDeTransporte(dados, entradas, alvo, semAlvo, podeMexer))
  return area
}

/**
 * Exportar e importar o formato como texto.
 *
 * Texto para copiar, e não arquivo para baixar: agora que a máquina lembra o
 * último formato sozinha, o único uso que sobra para o JSON é mandar o formato
 * a outra pessoa — e isso se faz colando numa conversa. Arquivo seria uma
 * volta a mais para o mesmo fim, e um caminho a menos que funciona em todo
 * navegador.
 *
 * Importar PREENCHE os campos em vez de aplicar direto: quem cola um formato
 * de outra pessoa merece ver o que vai mudar antes de a mesa mudar.
 */
function blocoDeTransporte(
  dados: DadosConfigPartida,
  entradas: Map<keyof ConfigPartida, HTMLInputElement>,
  alvo: HTMLInputElement,
  semAlvo: HTMLInputElement,
  podeMexer: boolean,
): HTMLElement {
  const bloco = document.createElement('details')
  bloco.className = 'config-partida-transporte'

  const resumo = document.createElement('summary')
  resumo.className = 'teste-rede-resumo'
  resumo.textContent = 'Levar este formato para outro lugar'
  bloco.append(resumo)

  const caixa = document.createElement('textarea')
  caixa.className = 'config-partida-json'
  caixa.rows = 7
  caixa.dataset['partida'] = 'json'
  caixa.value = paraJson(dados.config)
  caixa.setAttribute('aria-label', 'Formato da partida em texto')
  bloco.append(caixa)

  const erro = document.createElement('p')
  erro.className = 'config-partida-erro'
  erro.dataset['partida'] = 'erro-json'
  erro.hidden = true

  const copiar = document.createElement('button')
  copiar.type = 'button'
  copiar.className = 'botao fantasma'
  copiar.dataset['partida'] = 'copiar'
  copiar.textContent = 'Copiar'
  copiar.onclick = () => {
    // Seleciona sempre: é o caminho que sobra sem permissão de área de
    // transferência, e não custa nada quando ela existe.
    caixa.select()
    void navigator.clipboard?.writeText(caixa.value).catch(() => {})
    copiar.textContent = 'Copiado!'
  }
  bloco.append(copiar)

  if (podeMexer) {
    const importar = document.createElement('button')
    importar.type = 'button'
    importar.className = 'botao fantasma'
    importar.dataset['partida'] = 'importar'
    importar.textContent = 'Usar este formato'
    importar.onclick = () => {
      const lido = deJson(caixa.value)
      if (!lido) {
        erro.hidden = false
        erro.textContent = ERRO_IMPORTAR
        return
      }
      erro.hidden = true
      for (const [chave, entrada] of entradas) {
        entrada.value = String(lido[chave] ?? '')
      }
      semAlvo.checked = lido.alvo === null
      alvo.disabled = lido.alvo === null
      if (lido.alvo !== null) alvo.value = String(lido.alvo)
    }
    bloco.append(importar)
  }

  bloco.append(erro)
  return bloco
}
