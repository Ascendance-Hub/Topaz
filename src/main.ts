import { Sessao } from './net/sessao'
import { criarSalaTrystero, criarTransporte } from './net/transport'
import { renderizarLobby } from './ui/components/lobby'
import { renderizarBarraSala } from './ui/components/barra-sala'
import { renderizarConexao } from './ui/components/conexao'
import { criarChat } from './ui/components/chat'
import { renderizarNavSala, renderizarSalaParada } from './ui/components/sala'
import { renderizarControlesCall } from './ui/components/call'
import type { AcoesCall } from './ui/components/call'
import { criarCanalCall } from './call/canal'
import { ProtocoloCall } from './call/protocolo'
import { Midia } from './call/midia'
import { renderizar } from './ui/render'
import { rngSemente } from './game/shoe'
import { mesaEsperaPor } from './game/rules'

/** Quem falou antes de a mesa saber o nome dele. */
export const APELIDO_DESCONHECIDO = 'Alguém'

function rngDaSessao() {
  return rngSemente(Date.now() ^ Math.floor(Math.random() * 1e9))
}

/**
 * Monta a sala dentro de `app` e mantém tudo em dia. A mesa é um dos
 * conteúdos possíveis do palco, não a sala em si: entrar numa sala é estar
 * junto com as outras pessoas, e abrir a mesa é uma das coisas que se faz lá
 * dentro.
 *
 * `Node.replaceWith` só substitui o nó no DOM uma vez — chamar de novo sobre
 * a MESMA referência antiga mexe num nó já órfão, e a tela para de
 * acompanhar (é assim que passaria batido um "você é o anfitrião" que nunca
 * atualiza após uma migração de host). Por isso `barra` e `nav` são
 * reatribuídas a cada troca: cada `desenhar()` sempre substitui o nó que está
 * de fato na página, nunca um órfão de uma rodada anterior.
 */
export function entrarNaSala(app: HTMLElement, apelido: string, codigo: string): void {
  const salaTrystero = criarSalaTrystero(codigo)
  const transporte = criarTransporte(salaTrystero)
  const sessao = new Sessao(transporte, rngDaSessao)

  const protocolo = new ProtocoloCall(criarCanalCall(salaTrystero, transporte))
  const midia = new Midia(salaTrystero)

  /**
   * O apelido sai do `EstadoJogo` pelo peerId, não do payload do chat: assim
   * ninguém digita o próprio nome e, portanto, ninguém se passa por outro. Um
   * peer que falou antes do primeiro snapshot do host chegar ainda não tem
   * nome conhecido aqui — daí o genérico em vez de exibir um peerId cru.
   */
  function apelidoDe(peerId: string): string {
    const jogador = sessao.estado().jogadores.find((j) => j.peerId === peerId)
    return jogador?.apelido || APELIDO_DESCONHECIDO
  }

  // O chat é criado uma única vez e nunca substituído: `renderizar` troca
  // todos os filhos do `palco` a cada mudança de estado, e um campo de texto
  // ali dentro perderia foco e conteúdo a cada broadcast do host. Por isso
  // ele é irmão do palco, não filho.
  const chat = criarChat((texto) => {
    transporte.enviarMensagem(texto)
    // A rede não devolve ao remetente o que ele mesmo mandou; sem este eco,
    // eu seria o único da sala a não ver a própria mensagem.
    chat.receber(apelido, texto)
  })
  transporte.aoReceberMensagem((texto, peerId) => chat.receber(apelidoDe(peerId), texto))

  /**
   * Escolha local de visualização, de propósito FORA do `EstadoJogo`. Se
   * morasse no estado compartilhado, abrir a mesa arrastaria todo mundo
   * junto, e cada broadcast do host devolveria à mesa a tela de quem tivesse
   * voltado para a sala — há teste cobrindo esse segundo caso.
   */
  let mesaAberta = false

  function alternarMesa(aberta: boolean): void {
    mesaAberta = aberta
    desenhar()
  }

  /**
   * A marca só faz sentido quando a mesa está fora da tela: com a mesa
   * aberta, os botões que ela anunciaria já estão à vista, e a bolinha viraria
   * ruído em cima de algo que a pessoa já está olhando.
   */
  function mesaEspera(): boolean {
    return !mesaAberta
      && sessao.statusConexao() === 'conectado'
      && mesaEsperaPor(sessao.estado(), sessao.meuId())
  }

  const acoesCall: AcoesCall = {
    entrar: () => {
      // O microfone sobe ANTES de anunciar: anunciar primeiro faria os outros
      // esperarem um áudio que ainda não existe, e se a permissão fosse negada
      // eu apareceria na call mudo sem saber.
      void midia.ligarMicrofone(protocolo.estado().naCall)
        .then(() => protocolo.entrar())
    },
    sair: () => {
      protocolo.sair()
      midia.desligarMicrofone()
      midia.pararTela()
    },
    compartilhar: () => {
      void midia.compartilharTela(() => {
        // Chegou aqui porque a pessoa usou a barra nativa do Chrome. Sem isto,
        // a interface continuaria dizendo que ela compartilha.
        protocolo.definirCompartilhando(false)
        midia.pararTela()
      }).then(() => protocolo.definirCompartilhando(true))
    },
    pararTela: () => {
      protocolo.definirCompartilhando(false)
      midia.pararTela()
    },
    assistir: (peerId) => protocolo.assistir(peerId),
    pararDeAssistir: (peerId) => protocolo.pararDeAssistir(peerId),
  }

  // Área de áudio remoto: criada uma vez e nunca substituída, pelo mesmo motivo
  // do chat — recriar um <audio> reinicia o fluxo.
  const audios = document.createElement('div')
  audios.className = 'call-audios'
  // A área de vídeo segue a mesma regra: criada uma vez, nunca substituída.
  const videos = document.createElement('div')
  videos.className = 'call-videos'

  function removerVideoDe(peerId: string): void {
    videos.querySelector(`[data-de="${peerId}"]`)?.remove()
  }

  midia.aoReceberFaixa((faixa, de) => {
    if (faixa.kind === 'audio') {
      const el = document.createElement('audio')
      el.autoplay = true
      el.srcObject = new MediaStream([faixa])
      audios.append(el)
      return
    }
    // Uma tela por peer: se ele reabrir o compartilhamento, a nova substitui a
    // velha em vez de empilhar quadros congelados.
    removerVideoDe(de)
    const el = document.createElement('video')
    el.autoplay = true
    el.playsInline = true
    // Mudo de propósito: o áudio dele já vem pelo microfone, e o elemento de
    // vídeo com som duplicaria a voz.
    el.muted = true
    el.dataset['de'] = de
    el.srcObject = new MediaStream([faixa])
    videos.append(el)
  })

  /**
   * Quem entra na call depois de mim precisa receber meu microfone: o
   * `addStream` inicial só alcançou quem já estava lá.
   */
  let naCallAntes: string[] = []
  let assistidoAntes: string[] = []
  let assistindoAntes: string[] = []

  protocolo.aoMudar(() => {
    const atual = protocolo.estado()

    for (const peerId of atual.naCall) {
      if (!naCallAntes.includes(peerId)) midia.publicarMicrofonePara(peerId)
    }
    naCallAntes = atual.naCall

    // A assinatura vira efeito, de forma idempotente: quem entrou na lista
    // ganha a tela, quem saiu perde. Sem espectador nenhum, o `removeStream`
    // do último desliga o codificador — que é o ponto de todo o desenho.
    for (const peerId of atual.assistidoPor) {
      if (!assistidoAntes.includes(peerId)) midia.publicarTelaPara(peerId)
    }
    for (const peerId of assistidoAntes) {
      if (!atual.assistidoPor.includes(peerId)) midia.despublicarTelaDe(peerId)
    }
    assistidoAntes = atual.assistidoPor

    for (const peerId of assistindoAntes) {
      if (!atual.assistindo.includes(peerId)) removerVideoDe(peerId)
    }
    assistindoAntes = atual.assistindo

    desenhar()
  })

  let barra = renderizarBarraSala(codigo, sessao.souHost())
  let nav = renderizarNavSala(mesaAberta, alternarMesa, mesaEspera())
  let controles = renderizarControlesCall(protocolo.estado(), acoesCall)
  // `palco` é criado uma vez e só tem os filhos trocados: `renderizar` guarda
  // a contagem de cartas no dataset dele para decidir animação, e recriar o
  // elemento a cada ida e volta faria as cartas voarem de novo sem motivo.
  const palco = document.createElement('div')
  app.replaceChildren(barra, nav, palco, chat.raiz, controles, videos, audios)

  function desenhar(): void {
    const novaBarra = renderizarBarraSala(codigo, sessao.souHost())
    barra.replaceWith(novaBarra)
    barra = novaBarra

    const novaNav = renderizarNavSala(mesaAberta, alternarMesa, mesaEspera())
    nav.replaceWith(novaNav)
    nav = novaNav

    const novosControles = renderizarControlesCall(protocolo.estado(), acoesCall)
    controles.replaceWith(novosControles)
    controles = novosControles

    // Enquanto ninguém é anfitrião a mesa ainda não existe: mostrar a mesa
    // vazia com "Aguardando jogadores…" confundiria "ninguém entrou ainda"
    // com "a conexão falhou" (spec §14).
    const status = sessao.statusConexao()
    if (status !== 'conectado') {
      palco.replaceChildren(renderizarConexao(status))
      return
    }
    if (mesaAberta) {
      renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
    } else {
      palco.replaceChildren(renderizarSalaParada(sessao.estado(), sessao.meuId()))
    }
  }

  sessao.aoMudar(desenhar)
  sessao.entrar(apelido)
  desenhar()

  // O host avalia prazos vencidos (turno, reconexão); nos clientes o tique
  // não faz nada — só o host tem efeito colateral (ver Sessao.tique).
  setInterval(() => sessao.tique(Date.now()), 500)

  window.addEventListener('beforeunload', () => sessao.encerrar())
}

export const MENSAGEM_ERRO_INICIAL = 'Não foi possível carregar o Topaz. Recarregue a página.'

/**
 * `renderizarLobby` roda antes de qualquer clique do usuário; um erro
 * inesperado aqui (sem isso) deixaria a página em branco, sem nenhuma pista
 * do que houve. Não é um sistema de relato de erros — é uma mensagem legível
 * de fallback, o suficiente para o usuário saber que algo falhou e recarregar.
 */
export function iniciarApp(app: HTMLElement): void {
  try {
    app.replaceChildren(renderizarLobby((apelido, codigo) => entrarNaSala(app, apelido, codigo)))
  } catch {
    app.textContent = MENSAGEM_ERRO_INICIAL
  }
}

const raiz = document.querySelector<HTMLDivElement>('#app')
if (raiz) iniciarApp(raiz)
