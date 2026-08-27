import type { EstadoCall } from '../../call/protocolo'
import { ALTURA_PADRAO } from '../../call/midia'
import type { TipoConteudo } from '../../call/midia'
import type { Dispositivo } from '../../call/dispositivos'

export interface AcoesCall {
  entrar(): void
  sair(): void
  compartilhar(): void
  pararTela(): void
  assistir(peerId: string): void
  pararDeAssistir(peerId: string): void
  definirQualidade(altura: number): void
  definirTipoConteudo(tipo: TipoConteudo): void
  alternarMeuMicrofone(): void
  alternarSilenciarTodos(): void
  trocarMicrofone(deviceId: string): void
  /** Tenta abrir o microfone de novo, depois de a pessoa liberar a permissão
   *  ou fechar o programa que estava segurando o aparelho. */
  tentarMicrofone(): void
  trocarSaida(deviceId: string): void
}

/** O que a barra precisa saber além do estado da call. */
export interface ContextoCall {
  apelidoDe: (peerId: string) => string
  meuMicrofoneMudo?: boolean
  todosSilenciados?: boolean
  microfones?: Dispositivo[]
  microfoneAtual?: string | null
  /** Por que o microfone não abriu, ou ausente se abriu. Presente significa
   *  que a pessoa está na call **só ouvindo**. */
  semMicrofone?: string | null
  /** As saídas de áudio. `main.ts` não passa nada quando o navegador não sabe
   *  trocar (`setSinkId`), e aí o seletor simplesmente não existe. */
  saidas?: Dispositivo[]
  saidaAtual?: string | null
}

/**
 * As duas alturas que o probe de 2026-08-20 separou: até 720p o custo de
 * codificação quase não se mexe, e em 1080p ele salta cerca de 3×. Oferecer um
 * meio-termo aqui seria escolha sem consequência medida.
 */
const ALTURAS = [720, 1080] as const

export const AVISO_SEM_ESPECTADOR =
  'ninguém está assistindo — sua tela não está sendo codificada'

function botao(chave: string, rotulo: string, aoClicar: () => void): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'call-botao'
  el.dataset['call'] = chave
  el.textContent = rotulo
  el.onclick = aoClicar
  return el
}

/**
 * Barra de controles da call. Vive fora do palco que `renderizar` reconstrói —
 * um botão que sumisse e voltasse a cada broadcast do host seria impossível de
 * acertar com o mouse.
 *
 * Entrar na call é um ato explícito, separado de entrar na sala: é o que
 * impede um microfone aberto sem a pessoa ter pedido.
 */
export function renderizarControlesCall(
  estado: EstadoCall, acoes: AcoesCall,
  // `main.ts` sempre passa `midia.qualidade()`; este padrão é para quem monta
  // a barra sem contexto. Apontado para a constante para não virar uma segunda
  // fonte de verdade que discorda da primeira em silêncio.
  alturaAtual: number = ALTURA_PADRAO, conteudoAtual: TipoConteudo = 'motion',
  contexto: ContextoCall = { apelidoDe: (id) => id },
): HTMLElement {
  const barra = document.createElement('div')
  barra.className = 'call-controles'

  if (!estado.euNaCall) {
    barra.append(botao('entrar', 'Entrar na call', () => acoes.entrar()))
    return barra
  }

  const contagem = document.createElement('span')
  contagem.className = 'call-contagem'
  // Eu conto: "2 na call" descreve a conversa, enquanto "1 na call" com alguém
  // do outro lado descreveria uma lista de terceiros que ninguém pediu.
  // Quem está COMIGO, não quem está na sala: o número descreve a conversa de
  // que eu faço parte. Quem está noutro canal aparece na lista de canais.
  contagem.textContent = `${estado.comigo.length + 1} no canal`

  barra.append(contagem)

  // Sem microfone a pessoa está na call SÓ OUVINDO. Mutar e escolher aparelho
  // não fazem sentido nesse estado; o que ela precisa é saber por quê e ter
  // como tentar de novo.
  if (contexto.semMicrofone) {
    const aviso = document.createElement('span')
    aviso.className = 'call-sem-microfone'
    // `textContent`: a mensagem é nossa, mas ela nasce de um erro do
    // navegador, e essa origem não merece confiança por construção.
    aviso.textContent = contexto.semMicrofone
    barra.append(aviso)
    barra.append(botao('tentar-microfone', 'Ativar microfone', () => acoes.tentarMicrofone()))
  } else {
    const meuMic = botao(
      'meu-microfone',
      contexto.meuMicrofoneMudo ? 'Ligar meu microfone' : 'Mutar meu microfone',
      () => acoes.alternarMeuMicrofone(),
    )
    meuMic.dataset['mudo'] = contexto.meuMicrofoneMudo ? '1' : '0'
    barra.append(meuMic)
  }

  // Só aparece com mais de um aparelho: com um só não há o que escolher, e o
  // seletor viraria ruído. Os nomes só existem depois da permissão concedida,
  // o que combina com ele viver dentro da call.
  const aparelhos = contexto.semMicrofone ? [] : (contexto.microfones ?? [])
  if (aparelhos.length > 1) {
    const seletor = document.createElement('select')
    seletor.className = 'call-qualidade'
    seletor.dataset['call'] = 'microfone'
    seletor.setAttribute('aria-label', 'Microfone')
    for (const aparelho of aparelhos) {
      const opcao = document.createElement('option')
      opcao.value = aparelho.id
      // `textContent`: o nome vem do sistema operacional.
      opcao.textContent = aparelho.nome
      if (aparelho.id === contexto.microfoneAtual) opcao.selected = true
      seletor.append(opcao)
    }
    seletor.onchange = () => acoes.trocarMicrofone(seletor.value)
    barra.append(seletor)
  }

  // Para onde eu OUÇO. Aparece mesmo para quem entrou só ouvindo — é
  // justamente essa pessoa que mais precisa escolher o destino do som.
  const saidas = contexto.saidas ?? []
  if (saidas.length > 1) {
    const seletor = document.createElement('select')
    seletor.className = 'call-qualidade'
    seletor.dataset['call'] = 'saida'
    seletor.setAttribute('aria-label', 'Saída de áudio')
    for (const saida of saidas) {
      const opcao = document.createElement('option')
      opcao.value = saida.id
      // `textContent`: o nome vem do sistema operacional.
      opcao.textContent = saida.nome
      if (saida.id === contexto.saidaAtual) opcao.selected = true
      seletor.append(opcao)
    }
    seletor.onchange = () => acoes.trocarSaida(seletor.value)
    barra.append(seletor)
  }

  const silenciar = botao(
    'silenciar-todos',
    contexto.todosSilenciados ? 'Ouvir todos' : 'Silenciar todos',
    () => acoes.alternarSilenciarTodos(),
  )
  silenciar.dataset['silenciado'] = contexto.todosSilenciados ? '1' : '0'
  barra.append(silenciar, botao('sair', 'Sair da call', () => acoes.sair()))

  if (estado.euCompartilhando) {
    barra.append(botao('parar-tela', 'Parar de compartilhar', () => acoes.pararTela()))

    const qualidade = document.createElement('select')
    qualidade.className = 'call-qualidade'
    qualidade.dataset['call'] = 'qualidade'
    qualidade.setAttribute('aria-label', 'Qualidade da tela compartilhada')
    for (const altura of ALTURAS) {
      const opcao = document.createElement('option')
      opcao.value = String(altura)
      opcao.textContent = `${altura}p`
      if (altura === alturaAtual) opcao.selected = true
      qualidade.append(opcao)
    }
    qualidade.onchange = () => acoes.definirQualidade(Number(qualidade.value))
    barra.append(qualidade)

    const conteudo = document.createElement('select')
    conteudo.className = 'call-qualidade'
    conteudo.dataset['call'] = 'conteudo'
    conteudo.setAttribute('aria-label', 'O que a tela mostra')
    for (const [valor, rotulo] of [
      ['motion', 'Jogo / vídeo'], ['detail', 'Código / texto'],
    ] as const) {
      const opcao = document.createElement('option')
      opcao.value = valor
      opcao.textContent = rotulo
      if (valor === conteudoAtual) opcao.selected = true
      conteudo.append(opcao)
    }
    conteudo.onchange = () => acoes.definirTipoConteudo(conteudo.value as TipoConteudo)
    barra.append(conteudo)
    if (estado.assistidoPor.length === 0) {
      const aviso = document.createElement('span')
      aviso.className = 'call-sem-espectador'
      // Não é erro: é a assinatura funcionando. Dizer isso em voz alta evita a
      // pessoa achar que o compartilhamento falhou e ficar clicando de novo.
      aviso.textContent = AVISO_SEM_ESPECTADOR
      barra.append(aviso)
    }
  } else {
    barra.append(botao('compartilhar', 'Compartilhar tela', () => acoes.compartilhar()))
  }

  for (const peerId of estado.compartilhando) {
    const assistindo = estado.assistindo.includes(peerId)
    // O nome vai no rótulo: com duas pessoas compartilhando, dois botões
    // "Parar de assistir" idênticos não deixam escolher qual.
    const quem = contexto.apelidoDe(peerId)
    const el = botao(
      assistindo ? 'parar-assistir' : 'assistir',
      assistindo ? `Parar de ver ${quem}` : `Ver tela de ${quem}`,
      () => (assistindo ? acoes.pararDeAssistir(peerId) : acoes.assistir(peerId)),
    )
    el.dataset[assistindo ? 'pararAssistir' : 'assistir'] = peerId
    barra.append(el)
  }

  return barra
}
