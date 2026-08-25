import { LIMITES, normalizarConfig } from '../../game/rules'
import type { ConfigPartida } from '../../game/types'

export const AVISO_SO_ANFITRIAO =
  'Só o anfitrião muda o formato da partida — assim ninguém joga com regras '
  + 'diferentes das dos outros.'

export const AVISO_EM_ANDAMENTO =
  'A partida está em andamento. O formato só muda entre partidas: trocar o '
  + 'alvo agora mudaria a regra com dinheiro na mesa.'

export const AVISO_FICHAS =
  'As fichas novas valem para quem entrar depois e para a próxima partida. '
  + 'Ninguém ganha nem perde fichas agora.'

export interface DadosConfigPartida {
  config: ConfigPartida
  souHost: boolean
  /** `true` quando a fase não é `aguardando`. */
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
    entrada.value = String(dados.config[campo.chave] ?? '')
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
  alvo.value = String(dados.config.alvo ?? LIMITES.alvo.min)
  alvo.disabled = !podeMexer || dados.config.alvo === null
  rotuloAlvo.htmlFor = 'config-alvo'
  alvo.id = 'config-alvo'

  const semAlvoRotulo = document.createElement('label')
  semAlvoRotulo.className = 'config-partida-modo'

  const semAlvo = document.createElement('input')
  semAlvo.type = 'checkbox'
  semAlvo.dataset['partida'] = 'sem-alvo'
  semAlvo.checked = dados.config.alvo === null
  semAlvo.disabled = !podeMexer
  // O campo de número não some quando desmarcado: some o sentido dele. Deixar
  // o valor visível e apagado mostra ao que se volta ao desmarcar.
  semAlvo.onchange = () => { alvo.disabled = !podeMexer || semAlvo.checked }

  semAlvoRotulo.append(semAlvo, document.createTextNode(' Jogar até sobrar um'))
  linhaAlvo.append(rotuloAlvo, alvo, semAlvoRotulo)
  form.append(linhaAlvo)

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

  area.append(form)
  return area
}
