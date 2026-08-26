import { textoLimitado } from '../../net/validar'
import type { EscopoChat } from '../../net/transport'

/** Teto de uma mensagem. Papo de mesa, não redação. */
export const LIMITE_TEXTO = 200

/**
 * Quantas linhas ficam na tela. Não existe histórico do lado de fora: quem
 * entra depois começa em branco e recarregar a página zera. Sem um teto, uma
 * sala aberta a tarde toda acumularia nós até engasgar o navegador.
 */
export const MAX_LINHAS = 100

export interface Chat {
  raiz: HTMLElement
  /** Põe uma linha no fim do log. `apelido` já resolvido por quem chama. */
  receber(apelido: string, texto: string, escopo?: EscopoChat): void
  /**
   * Diz se há um canal para conversar.
   *
   * Fora da call não há: a aba some e o que estiver escrito vai para o geral.
   * Um lugar de falar com ninguém seria pior que não ter o lugar.
   */
  definirEmCanal(emCanal: boolean): void
  /**
   * Esquece a conversa do canal.
   *
   * Chamado ao trocar de canal. Aquelas mensagens foram endereçadas às pessoas
   * com quem você estava, e mostrá-las enquanto você conversa com outras
   * confunde de quem é o quê. Some junto com o motivo de existirem.
   */
  limparCanal(): void
}

/**
 * Painel de conversa da sala.
 *
 * Devolve um objeto com a raiz em vez de só o elemento porque este painel é
 * criado UMA vez e nunca substituído: `renderizar` troca todos os filhos da
 * mesa a cada mudança de estado — num cliente, a cada broadcast do host, o
 * que durante a compra do dealer são 700ms. Um campo de texto reconstruído
 * nesse ritmo perderia o foco e apagaria o que a pessoa está escrevendo
 * várias vezes por segundo.
 */
/**
 * `aoTrocar` recebe o novo estado, não um pedido de alternância: quem aplica o
 * layout precisa saber PARA ONDE ir, e deduzir isso do lado de lá criaria dois
 * donos do mesmo booleano.
 */
export function criarChat(
  aoEnviar: (texto: string, escopo: EscopoChat) => void,
  aoTrocar?: (trocado: boolean) => void,
): Chat {
  const raiz = document.createElement('div')
  raiz.className = 'chat'
  raiz.dataset['aberto'] = '0'

  const gatilho = document.createElement('button')
  gatilho.type = 'button'
  gatilho.className = 'chat-gatilho'
  gatilho.setAttribute('aria-expanded', 'false')

  const rotulo = document.createElement('span')
  rotulo.textContent = 'Chat'
  gatilho.append(rotulo)

  /**
   * Dois lugares de falar, e não um filtro sobre o mesmo.
   *
   * O geral vai para a sala inteira; o do canal vai SÓ para quem está no seu
   * canal — enviado só a eles, não escondido dos outros na hora de desenhar.
   * Filtrar na tela deixaria o texto viajando para quem não devia recebê-lo, e
   * bastaria abrir o console para ler.
   *
   * Dois logs separados, e não um com etiquetas: quem escreve num canal está
   * conversando com aquelas pessoas, e misturar as duas conversas obrigaria a
   * ler etiqueta em cada linha para saber quem ouviu o quê.
   */
  const logs: Record<EscopoChat, HTMLElement> = {
    geral: document.createElement('div'),
    canal: document.createElement('div'),
  }
  for (const [escopo, el] of Object.entries(logs)) {
    el.className = 'chat-log'
    el.dataset['escopo'] = escopo
    el.setAttribute('role', 'log')
    el.setAttribute('aria-live', 'polite')
  }

  let escopoAtivo: EscopoChat = 'geral'
  let emCanal = false
  const naoLidasPorEscopo: Record<EscopoChat, number> = { geral: 0, canal: 0 }

  const abas = document.createElement('div')
  abas.className = 'chat-abas'
  abas.setAttribute('role', 'tablist')

  const botoesDeAba: Record<EscopoChat, HTMLButtonElement> = {
    geral: document.createElement('button'),
    canal: document.createElement('button'),
  }
  const ROTULOS: Record<EscopoChat, string> = { geral: 'Sala', canal: 'Canal' }
  for (const escopo of ['geral', 'canal'] as const) {
    const aba = botoesDeAba[escopo]
    aba.type = 'button'
    aba.className = 'chat-aba'
    aba.dataset['aba'] = escopo
    aba.setAttribute('role', 'tab')
    aba.onclick = () => trocarEscopo(escopo)
    abas.append(aba)
  }

  const form = document.createElement('form')
  form.className = 'chat-form'

  const campo = document.createElement('input')
  campo.type = 'text'
  campo.className = 'chat-campo'
  campo.maxLength = LIMITE_TEXTO
  campo.placeholder = 'Falar com a mesa…'
  campo.setAttribute('aria-label', 'Mensagem para a mesa')

  const botao = document.createElement('button')
  botao.type = 'submit'
  botao.className = 'chat-enviar'
  botao.textContent = 'Enviar'

  form.append(campo, botao)

  /**
   * Trocar o chat com o miolo de lugar.
   *
   * Fica no cabeçalho do chat, e não junto dos controles da call: é uma coisa
   * que se faz PARA ler melhor a conversa, então o botão mora onde o olho já
   * está quando esse desejo aparece.
   *
   * Só existe onde há dois lugares para trocar. No celular o chat é uma gaveta
   * sobre a tela e não há miolo ao lado — o CSS o esconde lá.
   */
  const cabeca = document.createElement('div')
  cabeca.className = 'chat-cabeca'
  cabeca.append(gatilho)

  let trocado = false
  if (aoTrocar) {
    const trocar = document.createElement('button')
    trocar.type = 'button'
    trocar.className = 'chat-trocar'
    trocar.dataset['chat'] = 'trocar'
    // Duas setas opostas: é o símbolo de "trocar de lugar" em toda parte, e
    // aqui ele descreve literalmente o que acontece.
    trocar.textContent = '⇄'

    const rotularTrocar = (): void => {
      const texto = trocado
        ? 'Devolver a call para o meio'
        : 'Trazer o chat para o meio'
      trocar.title = texto
      trocar.setAttribute('aria-label', texto)
      trocar.setAttribute('aria-pressed', String(trocado))
    }
    rotularTrocar()

    trocar.onclick = () => {
      trocado = !trocado
      rotularTrocar()
      aoTrocar(trocado)
    }
    cabeca.append(trocar)
  }

  raiz.append(cabeca, abas, logs.geral, logs.canal, form)

  let aberto = false
  let naoLidas = 0

  /** Selo com o número de mensagens perdidas; some quando não há nenhuma. */
  function desenharNaoLidas(): void {
    gatilho.querySelector('.chat-nao-lidas')?.remove()
    if (naoLidas === 0) return
    const selo = document.createElement('span')
    selo.className = 'chat-nao-lidas'
    selo.textContent = String(naoLidas)
    gatilho.append(selo)
  }

  /** Conversa é lida de baixo para cima: sem isto a gaveta abre no começo.
   *  Só o log visível: o escondido tem altura zero e rolar nele não faz nada,
   *  mas ele é rolado ao virar visível, na troca de aba. */
  function rolarAoFim(): void {
    const log = logs[escopoAtivo]
    log.scrollTop = log.scrollHeight
  }

  gatilho.onclick = () => {
    aberto = !aberto
    raiz.dataset['aberto'] = aberto ? '1' : '0'
    gatilho.setAttribute('aria-expanded', String(aberto))
    if (aberto) {
      naoLidas = 0
      desenharNaoLidas()
      rolarAoFim()
    }
  }

  /** O log de onde a pessoa está agora. */
  function trocarEscopo(escopo: EscopoChat): void {
    if (escopo === 'canal' && !emCanal) return
    escopoAtivo = escopo
    // Ler é o que zera: mudar de aba é ter visto o que havia lá.
    naoLidasPorEscopo[escopo] = 0
    desenharAbas()
    rolarAoFim()
  }

  function desenharAbas(): void {
    for (const escopo of ['geral', 'canal'] as const) {
      const aba = botoesDeAba[escopo]
      const ativa = escopo === escopoAtivo
      aba.setAttribute('aria-selected', String(ativa))
      if (ativa) aba.dataset['ativa'] = '1'
      else delete aba.dataset['ativa']
      // A aba do canal só existe quando há canal: um lugar de falar com
      // ninguém seria pior que não ter o lugar.
      aba.hidden = escopo === 'canal' && !emCanal
      aba.replaceChildren(document.createTextNode(ROTULOS[escopo]))
      const perdidas = naoLidasPorEscopo[escopo]
      if (perdidas > 0 && !ativa) {
        const selo = document.createElement('span')
        selo.className = 'chat-nao-lidas'
        selo.textContent = String(perdidas)
        aba.append(selo)
      }
      logs[escopo].hidden = !ativa
    }
    // As duas abas só valem a pena quando há duas: fora da call, a fileira é
    // um rótulo solto dizendo o óbvio.
    abas.hidden = !emCanal
  }

  function definirEmCanal(novo: boolean): void {
    if (novo === emCanal) return
    emCanal = novo
    // Saiu do canal: o que estava escrito ali não tem mais para onde ir.
    if (!emCanal && escopoAtivo === 'canal') escopoAtivo = 'geral'
    desenharAbas()
  }

  function limparCanal(): void {
    logs.canal.replaceChildren()
    naoLidasPorEscopo.canal = 0
    desenharAbas()
  }

  function receber(apelido: string, texto: string, escopo: EscopoChat = 'geral'): void {
    const linha = document.createElement('div')
    linha.className = 'chat-linha'

    // `textContent` nos dois, nunca `innerHTML`: apelido e texto chegam de
    // outro navegador, e ninguém na sala escolheu executar o que o outro
    // digitou. Vale para o apelido também — ele vem do `EstadoJogo`, que é
    // preenchido por quem entrou, não por nós.
    // E cortado no limite, que é a outra metade da mesma regra: `LIMITE_TEXTO`
    // é aplicado no envio, e quem envia pode simplesmente não aplicá-lo. O
    // limite que protege esta janela é o que ELA impõe ao que chega.
    const autor = document.createElement('span')
    autor.className = 'chat-autor'
    autor.textContent = textoLimitado(apelido, LIMITE_TEXTO)

    const corpo = document.createElement('span')
    corpo.className = 'chat-texto'
    corpo.textContent = textoLimitado(texto, LIMITE_TEXTO)

    linha.append(autor, corpo)
    const log = logs[escopo]
    log.append(linha)

    while (log.childElementCount > MAX_LINHAS) log.firstElementChild?.remove()

    if (!aberto) {
      naoLidas += 1
      desenharNaoLidas()
    }
    // Perdida também quando a gaveta está aberta noutra aba: chegou onde a
    // pessoa não está olhando, que é a definição de perdida.
    if (!aberto || escopo !== escopoAtivo) {
      naoLidasPorEscopo[escopo] += 1
      desenharAbas()
    }
    rolarAoFim()
  }

  form.onsubmit = (evento) => {
    evento.preventDefault()
    // `maxLength` só limita a digitação; colar texto por script (ou um
    // navegador que ignore o atributo) passaria batido. O corte de verdade
    // é aqui.
    const texto = campo.value.trim().slice(0, LIMITE_TEXTO)
    campo.value = ''
    if (!texto) return
    aoEnviar(texto, escopoAtivo)
  }

  desenharAbas()
  return { raiz, receber, definirEmCanal, limparCanal }
}
