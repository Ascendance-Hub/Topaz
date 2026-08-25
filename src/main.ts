import { Sessao } from './net/sessao'
import {
  criarSalasTrystero, criarTransporte, relaysConectados, relaysDetalhados,
} from './net/transport'
import { coletarCandidatos } from './net/coletar-candidatos'
import { analisarCandidatos } from './net/diagnostico-rede'
import type { Analise } from './net/diagnostico-rede'
import { renderizarTesteRede } from './ui/components/teste-rede'
import { renderizarHome } from './ui/components/home'
import { renderizarBarraSala } from './ui/components/barra-sala'
import { renderizarConexao } from './ui/components/conexao'
import { criarChat } from './ui/components/chat'
import { renderizarNavSala, renderizarSalaParada } from './ui/components/sala'
import { renderizarControlesCall } from './ui/components/call'
import type { AcoesCall } from './ui/components/call'
import { criarVideoRemoto, mostrarVideo } from './ui/components/video-remoto'
import { renderizarMixer, chaveVoz, chaveTela } from './ui/components/mixer'
import { renderizarParticipantes } from './ui/components/participantes'
import type { Participante } from './ui/components/participantes'
import { MonitorDeVoz, MS_AMOSTRAGEM } from './call/monitor-voz'
import { aplicarSaida, limparMidia, removerMidiaDe, suportaTrocarSaida } from './ui/dom-midia'
import { ehTela } from './call/classificar'
import { criarCanalCall } from './call/canal'
import { ProtocoloCall } from './call/protocolo'
import { Midia } from './call/midia'
import {
  escolherMicrofone, escolherSaida, lembrarMicrofone, lembrarSaida, microfoneLembrado,
  microfones, motivoSemMicrofone, saidaLembrada, saidasDeAudio,
} from './call/dispositivos'
import type { Dispositivo } from './call/dispositivos'
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
  const salas = criarSalasTrystero(codigo)
  const transporte = criarTransporte(salas)
  const sessao = new Sessao(transporte, rngDaSessao)

  const protocolo = new ProtocoloCall(criarCanalCall(salas, transporte))
  const midia = new Midia(salas)

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

  let aparelhos: Dispositivo[] = []
  /** As saídas de áudio. Fica vazia quando o navegador não sabe trocar, e aí
   *  a barra nem desenha o seletor. */
  let saidas: Dispositivo[] = []
  let saidaAtual: string | null = null
  /**
   * Por que o microfone não abriu, ou `null` se abriu.
   *
   * Preenchido significa que a pessoa está na call **só ouvindo**. Antes disto
   * existir, negar a permissão fazia o `getUserMedia` rejeitar sem `catch`:
   * `protocolo.entrar()` nunca rodava e o botão "Entrar na call" não fazia
   * nada visível.
   */
  let semMicrofone: string | null = null

  /**
   * Quem está falando agora, medido localmente sobre o áudio que já chega.
   *
   * Nada disso trafega: ninguém publica "estou falando". O anel de cada pessoa
   * é desenhado a partir do som dela que este navegador está recebendo.
   */
  const monitorVoz = new MonitorDeVoz()
  const falantes = new Set<string>()
  /** O `selfId` não serve de chave para mim: o meu microfone é local e nunca
   *  chega por `aoReceberMidia`. Uma chave própria evita confundir os dois. */
  const EU = 'eu'

  monitorVoz.aoMudar((id, falando) => {
    if (falando) falantes.add(id)
    else falantes.delete(id)
    // Só a fileira: redesenhar a página inteira dez vezes por segundo por
    // causa de um anel seria caro e faria a mesa piscar.
    desenharParticipantes()
  })

  /** Quem aparece na fileira: eu, se estou na call, e quem mais estiver. */
  function participantesAgora(): Participante[] {
    const atual = protocolo.estado()
    if (!atual.euNaCall) return []
    const eu: Participante = {
      peerId: EU,
      nome: apelido,
      euMesmo: true,
      falando: falantes.has(EU),
      // Só o meu estado de microfone é conhecido: o dos outros não trafega, e
      // inventar um ícone a partir de silêncio mentiria para quem está só
      // ouvindo em silêncio.
      mudo: midia.microfoneMudo(),
      semMicrofone: semMicrofone !== null,
    }
    const outros = atual.naCall.map((peerId): Participante => ({
      peerId, nome: apelidoDe(peerId), falando: falantes.has(peerId),
    }))
    return [eu, ...outros]
  }

  /** Manda a voz e as telas para a saída escolhida. Precisa rodar de novo a
   *  cada elemento novo — quem entra depois nasceria na saída padrão. */
  function aplicarSaidaEscolhida(): void {
    if (!saidaAtual) return
    aplicarSaida(audios, saidaAtual)
    aplicarSaida(videos, saidaAtual)
  }

  /**
   * Relê a lista de microfones.
   *
   * Chamada ao entrar na call e sempre que o sistema avisa que algo mudou —
   * um fone plugado ou arrancado no meio da conversa deixaria a lista velha, e
   * a pessoa escolheria um aparelho que não existe mais.
   *
   * Os NOMES só aparecem depois da permissão concedida, então isto só rende de
   * verdade depois de entrar na call.
   */
  async function relerMicrofones(): Promise<void> {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices()
      aparelhos = microfones(lista)
      // Sem `setSinkId` a lista fica vazia de propósito: um seletor que a
      // pessoa mexe e não muda nada faz ela achar que o site quebrou.
      saidas = suportaTrocarSaida() ? saidasDeAudio(lista) : []
    } catch {
      aparelhos = []
      saidas = []
    }

    const saidaEscolhida = escolherSaida(saidas, saidaAtual ?? saidaLembrada())
    if (saidaEscolhida && saidaEscolhida !== saidaAtual) {
      saidaAtual = saidaEscolhida
      aplicarSaidaEscolhida()
    }

    const escolhido = escolherMicrofone(aparelhos, midia.microfoneAtual() ?? microfoneLembrado())
    if (escolhido && escolhido !== midia.microfoneAtual()) {
      // Trocar o microfone também abre um `getUserMedia`, e ele rejeita pelos
      // mesmos motivos do primeiro. Sem este catch, um fone arrancado no meio
      // da conversa deixava a interface parada em silêncio.
      try {
        await midia.trocarMicrofone(escolhido)
        semMicrofone = null
      } catch (erro: unknown) {
        semMicrofone = motivoSemMicrofone(erro)
      }
    }
    desenhar()
  }

  /**
   * Abre o microfone, guardando o motivo se não der.
   *
   * Nunca rejeita: quem chama continua o fluxo de qualquer jeito, porque
   * entrar na call sem microfone é um desfecho válido — o inválido era não
   * entrar e não dizer nada.
   */
  async function abrirMicrofone(): Promise<void> {
    try {
      await midia.ligarMicrofone()
      semMicrofone = null
    } catch (erro: unknown) {
      semMicrofone = motivoSemMicrofone(erro)
    }
  }

  try {
    navigator.mediaDevices.addEventListener('devicechange', () => void relerMicrofones())
  } catch {
    // Navegador sem `mediaDevices`: a call não vai funcionar mesmo, e a sala
    // não pode quebrar por causa disso.
  }

  const acoesCall: AcoesCall = {
    entrar: () => {
      // O microfone sobe ANTES de anunciar: anunciar primeiro faria os outros
      // esperarem um áudio que ainda não existe.
      //
      // Mas a falha dele NÃO impede a entrada. Antes, `ligarMicrofone()` sem
      // `catch` fazia a permissão negada matar o botão em silêncio — nada
      // acontecia e a pessoa não sabia por quê. Agora ela entra só ouvindo, e
      // a barra diz o motivo.
      void abrirMicrofone().then(async () => {
        protocolo.entrar()
        // Só agora os nomes dos aparelhos existem: a permissão acabou de ser
        // concedida. (Com a permissão negada a lista vem anônima, o que é
        // exatamente o motivo de o seletor não aparecer nesse caso.)
        await relerMicrofones()
        // E sincroniza de novo depois de capturar: quem anunciou durante a
        // janela de permissão só é alcançado aqui.
        sincronizarMidia()
        desenhar()
      })
    },
    tentarMicrofone: () => {
      // A pessoa liberou a permissão no cadeado, ou fechou o programa que
      // segurava o aparelho. Só o microfone sobe — ela já está na call.
      void abrirMicrofone().then(async () => {
        await relerMicrofones()
        sincronizarMidia()
        desenhar()
      })
    },
    trocarSaida: (deviceId) => {
      saidaAtual = deviceId
      lembrarSaida(deviceId)
      aplicarSaidaEscolhida()
      desenhar()
    },
    sair: () => {
      protocolo.sair()
      // O motivo era do estado "entrei sem microfone". Fora da call ele não
      // descreve mais nada, e ficaria pendurado na próxima entrada.
      semMicrofone = null
      midia.desligarMicrofone()
      midia.pararTela()
      // Sair precisa calar tudo de verdade: um `<video>` escondido continua
      // tocando, e era isso que deixava o som da tela saindo depois de sair.
      // `limparMidia` também larga os `srcObject` — tirar da árvore sem soltar
      // deixava stream e decodificador vivos até a coleta de lixo passar.
      limparMidia(videos)
      limparMidia(audios)
      // Fecha o contexto de áudio junto: manter um AudioContext aberto fora da
      // call segura a placa de som sem motivo.
      monitorVoz.encerrar()
      falantes.clear()
    },
    compartilhar: () => {
      void midia.compartilharTela(() => {
        // Chegou aqui porque a pessoa usou a barra nativa do Chrome. Sem isto,
        // a interface continuaria dizendo que ela compartilha.
        protocolo.definirCompartilhando(false)
        midia.pararTela()
      }).then(() => {
        protocolo.definirCompartilhando(true)
        sincronizarMidia()
      })
    },
    pararTela: () => {
      protocolo.definirCompartilhando(false)
      midia.pararTela()
    },
    alternarMeuMicrofone: () => {
      midia.alternarMicrofone()
      desenhar()
    },
    alternarSilenciarTodos: () => {
      todosSilenciados = !todosSilenciados
      const atual = protocolo.estado()
      ajustarVideos(atual.assistindo, atual.compartilhando)
      desenhar()
    },
    trocarMicrofone: (deviceId) => {
      lembrarMicrofone(deviceId)
      void midia.trocarMicrofone(deviceId).then(desenhar)
    },
    assistir: (peerId) => protocolo.assistir(peerId),
    pararDeAssistir: (peerId) => protocolo.pararDeAssistir(peerId),
    definirQualidade: (altura) => {
      midia.definirQualidade(altura)
      desenhar()
    },
    definirTipoConteudo: (tipo) => {
      midia.definirTipoConteudo(tipo)
      desenhar()
    },
  }

  // Área de áudio remoto: criada uma vez e nunca substituída, pelo mesmo motivo
  // do chat — recriar um <audio> reinicia o fluxo.
  const audios = document.createElement('div')
  audios.className = 'call-audios'
  // A área de vídeo segue a mesma regra: criada uma vez, nunca substituída.
  const videos = document.createElement('div')
  videos.className = 'call-videos'

  function removerVideoDe(peerId: string): void {
    removerMidiaDe(videos, peerId)
  }

  /** Tira a pessoa do áudio E do medidor de voz. O medidor precisa sair
   *  junto: um analisador esquecido é vazamento, e o anel ficaria aceso. */
  function removerAudioDe(peerId: string): void {
    removerMidiaDe(audios, peerId)
    monitorVoz.esquecer(peerId)
  }

  /**
   * O stream de tela chega UMA vez por sessão de compartilhamento — depois
   * disso, assistir e parar só ligam e desligam o codificador do outro lado,
   * sem renegociar. Então o elemento é escondido, nunca removido: removê-lo
   * faria a tela não voltar, porque não haveria stream novo para recriá-lo.
   *
   * Ele só sai de vez quando a pessoa para de compartilhar (ou sai da sala),
   * aí sim não há mais nada para mostrar.
   */
  let todosSilenciados = false
  /** Volume por canal, de 0 a 1. Ausente = 1, que é o padrão de mídia. */
  const volumes = new Map<string, number>()

  const volumeDe = (chave: string): number => volumes.get(chave) ?? 1

  /**
   * Aplica os volumes aos elementos que existem agora.
   *
   * Roda a cada desenho porque elementos aparecem e somem conforme a call
   * muda, e um volume ajustado antes precisa valer para o elemento novo.
   */
  function aplicarVolumes(): void {
    for (const el of audios.querySelectorAll<HTMLAudioElement>('audio[data-de]')) {
      el.volume = volumeDe(chaveVoz(el.dataset['de'] ?? ''))
    }
    for (const caixa of videos.querySelectorAll<HTMLElement>('[data-de]')) {
      const video = caixa.querySelector('video')
      if (video) video.volume = volumeDe(chaveTela(caixa.dataset['de'] ?? ''))
    }
  }

  /** Um canal de voz por pessoa na call, e um de tela por quem compartilha. */
  function canaisDeAudio() {
    const atual = protocolo.estado()
    const vozes = atual.naCall.map((peerId) => ({
      chave: chaveVoz(peerId), nome: apelidoDe(peerId), volume: volumeDe(chaveVoz(peerId)),
    }))
    const telas = atual.assistindo.map((peerId) => ({
      chave: chaveTela(peerId),
      nome: `Tela de ${apelidoDe(peerId)}`,
      volume: volumeDe(chaveTela(peerId)),
    }))
    return [...vozes, ...telas]
  }

  function ajustarVideos(assistindo: string[], compartilhando: string[]): void {
    for (const caixa of videos.querySelectorAll<HTMLElement>('[data-de]')) {
      const de = caixa.dataset['de'] ?? ''
      if (!compartilhando.includes(de)) {
        removerMidiaDe(videos, de)
        continue
      }
      mostrarVideo(caixa, assistindo.includes(de) && !todosSilenciados)
    }
    for (const el of audios.querySelectorAll<HTMLAudioElement>('audio')) {
      el.muted = todosSilenciados
    }
  }

  midia.aoReceberMidia((stream, de, meta) => {
    // A metadata vem de quem publicou (`{ tipo: 'microfone' }` ou
    // `{ tipo: 'tela' }`), e é mais confiável do que adivinhar pelo tipo da
    // faixa: uma tela sem áudio e um microfone são ambos "uma faixa só".
    // A classificação sai das FAIXAS do stream, não do metadado. Ver
    // `ehTela`: a fila que pareia metadado e faixa no Trystero desalinha, e o
    // rótulo passa a mentir — era isso que fazia alguém sumir do áudio.
    void meta
    if (ehTela(stream)) {
      // Uma tela por peer: se ele reabrir o compartilhamento, a nova substitui
      // a velha em vez de empilhar quadros congelados.
      // Sessão de compartilhamento nova: substitui a caixa inteira, para não
      // ficar um quadro congelado da sessão anterior.
      removerVideoDe(de)
      const caixa = criarVideoRemoto(de, stream, apelidoDe(de))
      videos.append(caixa)
      mostrarVideo(caixa, protocolo.estado().assistindo.includes(de))
      // Elemento novo nasce na saída padrão do sistema; a saída escolhida é
      // estado da pessoa e precisa valer para quem chegou agora também.
      aplicarSaidaEscolhida()
      return
    }

    // Um elemento por peer. Cada republicação (sair e voltar da call) traz um
    // stream novo, e sem trocar o elemento os antigos se acumulavam segurando
    // streams mortos.
    removerAudioDe(de)
    const el = document.createElement('audio')
    el.autoplay = true
    el.dataset['de'] = de
    el.srcObject = stream
    // O navegador pode recusar tocar sem gesto do usuário. Entrar na call é um
    // clique, então quase sempre há permissão — mas engolir a rejeição faria a
    // call ficar muda sem nenhuma pista do motivo.
    void el.play().catch((erro) => {
      console.warn('áudio da call bloqueado pelo navegador:', erro)
    })
    audios.append(el)
    aplicarSaidaEscolhida()
    // Passa a medir a voz desta pessoa. Idempotente, e trocar o stream (sair e
    // voltar da call) troca o analisador junto — senão o anel dela nunca mais
    // acenderia, porque o stream antigo está morto.
    monitorVoz.observar(de, stream)
  })

  /**
   * Quem entra na call depois de mim precisa receber meu microfone: o
   * `addStream` inicial só alcançou quem já estava lá.
   */
  /**
   * Uma função só, idempotente, chamada a cada mudança E depois de cada
   * captura ficar pronta. Não guarda "o que mudou": descreve o que deveria
   * estar publicado agora, e a `Midia` faz a diferença.
   *
   * A versão anterior detectava borda e marcava como feito mesmo quando a
   * publicação era descartada por a captura ainda não existir — e como as duas
   * pessoas clicam "Entrar na call" quase juntas, o caso comum era cada uma
   * receber o anúncio da outra durante a própria janela de permissão e nunca
   * mais tentar.
   */
  function sincronizarMidia(): void {
    const atual = protocolo.estado()
    midia.sincronizarMicrofone(atual.naCall)
    // A assinatura vira efeito: sem espectador nenhum, a `Midia` despublica do
    // último e o codificador desliga — que é o ponto de todo o desenho.
    midia.sincronizarTela(atual.assistidoPor)

    ajustarVideos(atual.assistindo, atual.compartilhando)
    sincronizarMedidorDeVoz(atual.naCall, atual.euNaCall)
  }

  /**
   * Deixa o medidor de voz observando exatamente quem está na call.
   *
   * Reconciliação, não detecção de borda — a mesma regra do resto da mídia.
   * Quem sai da call deixaria para trás um analisador pendurado num stream
   * morto: vazamento, e o anel dele congelado aceso.
   *
   * O meu microfone entra aqui porque ele NUNCA chega por `aoReceberMidia` —
   * sai daqui direto para a rede. Sem isto eu seria o único sem anel.
   */
  function sincronizarMedidorDeVoz(naCall: string[], euNaCall: boolean): void {
    const meu = midia.microfoneLocal()
    if (euNaCall && meu) monitorVoz.observar(EU, meu)
    else monitorVoz.esquecer(EU)

    const devem = new Set(euNaCall ? naCall : [])
    for (const id of monitorVoz.observando()) {
      if (id !== EU && !devem.has(id)) monitorVoz.esquecer(id)
    }
  }

  protocolo.aoMudar(() => {
    sincronizarMidia()
    desenhar()
  })

  let barra = renderizarBarraSala(codigo, sessao.souHost(), {
    aoReconectar: reconectar,
    naSala: sessao.estado().jogadores.length,
    conectados: conectadosComigo().length,
  })
  let nav = renderizarNavSala(mesaAberta, alternarMesa, mesaEspera())
  let mixer = renderizarMixer(canaisDeAudio(), (chave, volume) => {
    volumes.set(chave, volume)
    aplicarVolumes()
  })

  /**
   * A coluna lateral: conversa e volumes.
   *
   * Existe como elemento de verdade, e não como duas peças soltas no grid,
   * porque é ela que carrega a linha que separa a lateral da mesa. Sem um
   * container, a linha teria que ser desenhada em cada peça e quebraria no
   * vão entre elas.
   */
  const lateral = document.createElement('aside')
  lateral.className = 'lateral'
  lateral.append(chat.raiz, mixer)
  let controles = renderizarControlesCall(
    protocolo.estado(), acoesCall, midia.qualidade(), midia.tipoConteudo())
  // `palco` é criado uma vez e só tem os filhos trocados: `renderizar` guarda
  // a contagem de cartas no dataset dele para decidir animação, e recriar o
  // elemento a cada ida e volta faria as cartas voarem de novo sem motivo.
  const palco = document.createElement('div')
  palco.className = 'palco'
  // A fileira de pessoas fica logo acima da barra de controles: é onde
  // qualquer aplicativo de call põe, e essa é a metade convencional do
  // desenho — a diferença fica no material, não na disposição.
  let participantes = renderizarParticipantes([])
  app.replaceChildren(barra, nav, palco, participantes, controles, lateral, videos, audios)

  /** Só a fileira, sem redesenhar o resto. Chamada a cada mudança de quem
   *  está falando, que acontece muitas vezes por minuto. */
  function desenharParticipantes(): void {
    const nova = renderizarParticipantes(participantesAgora())
    participantes.replaceWith(nova)
    participantes = nova
  }

  function desenhar(): void {
    const novaBarra = renderizarBarraSala(codigo, sessao.souHost(), {
      aoReconectar: reconectar,
      naSala: sessao.estado().jogadores.length,
      conectados: conectadosComigo().length,
    })
    barra.replaceWith(novaBarra)
    barra = novaBarra

    const novaNav = renderizarNavSala(mesaAberta, alternarMesa, mesaEspera())
    nav.replaceWith(novaNav)
    nav = novaNav

    const novosControles =
      renderizarControlesCall(
        protocolo.estado(), acoesCall, midia.qualidade(), midia.tipoConteudo(),
        {
          apelidoDe, meuMicrofoneMudo: midia.microfoneMudo(), todosSilenciados,
          microfones: aparelhos, microfoneAtual: midia.microfoneAtual(),
          semMicrofone, saidas, saidaAtual,
        })
    controles.replaceWith(novosControles)
    controles = novosControles

    const novoMixer = renderizarMixer(canaisDeAudio(), (chave, volume) => {
      volumes.set(chave, volume)
      aplicarVolumes()
    })
    mixer.replaceWith(novoMixer)
    mixer = novoMixer
    aplicarVolumes()
    desenharParticipantes()

    // Enquanto ninguém é anfitrião a mesa ainda não existe: mostrar a mesa
    // vazia com "Aguardando jogadores…" confundiria "ninguém entrou ainda"
    // com "a conexão falhou" (spec §14).
    const status = sessao.statusConexao()
    if (status !== 'conectado') {
      palco.replaceChildren(renderizarConexao(status, relaysConectados()))
      if (status === 'sem-conexao') {
        palco.append(
        renderizarTesteRede(analiseRede, testandoRede, testarRede, relaysDetalhados()))
      }
      return
    }
    if (mesaAberta) {
      renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
      return
    }

    palco.replaceChildren(
      renderizarSalaParada(sessao.estado(), sessao.meuId(), conectadosComigo()))

    // Quem está sozinho é exatamente quem precisa do teste: a aplicação não
    // distingue de dentro "ninguém me achou" de "minha rede não deixa
    // conectar", e o teste responde a segunda metade na máquina certa.
    if (conectadosComigo().length <= 1) {
      palco.append(
        renderizarTesteRede(analiseRede, testandoRede, testarRede, relaysDetalhados()))
    }
  }

  sessao.aoMudar(desenhar)
  sessao.entrar(apelido)
  desenhar()

  /**
   * Com quem eu tenho conexão direta agora, contando eu mesmo.
   *
   * A diferença entre isto e quantas pessoas o anfitrião lista é o
   * "achou mas não conectou": alguém que existe na sala e com quem meu
   * navegador nunca conseguiu fechar um par.
   */
  function conectadosComigo(): string[] {
    return [sessao.meuId(), ...transporte.peers()]
  }

  /** Preenchido no fim da montagem, quando o tique já existe. */
  let encerrar: () => void = () => {}

  let analiseRede: Analise | null = null
  let testandoRede = false

  function testarRede(): void {
    if (testandoRede) return
    testandoRede = true
    desenhar()
    void coletarCandidatos().then(({ candidatos, erros }) => {
      analiseRede = analisarCandidatos(candidatos, erros)
      testandoRede = false
      desenhar()
    })
  }

  /**
   * Refaz a conexão sem recarregar a página.
   *
   * Mesma sala, mesmo apelido — e, principalmente, o mesmo `selfId`, que vive
   * enquanto a página viver. Recarregar daria identidade nova, e o anfitrião
   * passaria a te ver como outra pessoa, deixando um fantasma para trás até a
   * janela de reconexão vencer.
   *
   * Desmonta ESTA sala antes de montar a nova. O desmonte é local, e não de
   * módulo: duas salas na mesma página são um caso legítimo de teste (duas
   * pessoas), e uma variável de módulo faria a segunda matar a primeira.
   */
  function reconectar(): void {
    encerrar()
    entrarNaSala(app, apelido, codigo)
  }

  // O host avalia prazos vencidos (turno, reconexão); nos clientes o tique
  // resolve a descoberta e reanuncia a presença quando ela se perde.
  //
  // `sincronizarMidia` entra no mesmo ritmo porque é idempotente e porque a
  // publicação para um peer que ainda não completou o handshake é descartada
  // pelo Trystero: sem uma nova tentativa periódica, quem entrou na call
  // enquanto o par ainda se formava nunca seria ouvido. Quando está tudo em
  // dia, a chamada não faz nada.
  const tique = setInterval(() => {
    sessao.tique(Date.now())
    sincronizarMidia()
  }, 500)
  // Ritmo próprio, dez vezes mais rápido: o anel precisa acompanhar a fala, e
  // meio segundo de atraso para acender seria pior que não ter anel. Ainda
  // assim é bem mais barato que medir a cada quadro.
  const tiqueVoz = setInterval(() => monitorVoz.tique(Date.now()), MS_AMOSTRAGEM)

  // ---- Sonda de voz -----------------------------------------------------
  //
  // Ligada por `?diag=voz` na URL, e desligada para todo mundo por padrão.
  //
  // Existe porque os limiares nasceram estimados e só se acertam com voz real
  // — e porque "o anel não acende" tem três causas indistinguíveis a olho: o
  // áudio não chega ao analisador, o limiar está alto demais, ou o desenho não
  // atualiza. O número separa as três em dez segundos.
  //
  // Reporta o PICO desde a última linha, além do nível instantâneo: falar é
  // intermitente, e uma amostra tirada no meio de uma sílaba fechada mede
  // silêncio. É o pico que diz qual limiar serviria.
  if (new URLSearchParams(location.search).get('diag') === 'voz') {
    const picos = new Map<string, number>()
    setInterval(() => {
      const lidos = monitorVoz.niveis()
      if (lidos.length === 0) {
        console.log('[voz] ninguém sendo medido — o microfone não chegou ao analisador')
        return
      }
      console.log('[voz] ' + lidos.map((l) => {
        const pico = Math.max(picos.get(l.id) ?? 0, l.nivel)
        picos.set(l.id, 0)
        return `${l.id}: agora=${l.nivel.toFixed(4)} pico=${pico.toFixed(4)}`
          + (l.falando ? ' FALANDO' : '')
      }).join('   '))
    }, 900)
    // Amostra mais fina que a linha impressa, senão o pico seria só uma
    // fotografia a cada 0,9 s — que é justamente o que perde a sílaba.
    setInterval(() => {
      for (const l of monitorVoz.niveis()) {
        picos.set(l.id, Math.max(picos.get(l.id) ?? 0, l.nivel))
      }
    }, MS_AMOSTRAGEM)
  }

  encerrar = () => {
    clearInterval(tique)
    clearInterval(tiqueVoz)
    monitorVoz.encerrar()
    midia.desligarMicrofone()
    midia.pararTela()
    sessao.encerrar()
  }

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
    // O teste de rede também mora na home, e não só dentro da sala: quem
    // recebeu um link e não consegue entrar nunca chega à sala para achá-lo.
    let analise: Analise | null = null
    let rodando = false

    const desenharHome = (): void => {
      app.replaceChildren(renderizarHome(
        (apelido, codigo) => entrarNaSala(app, apelido, codigo),
        // Sem a lista de servidores, de propósito. Aqui ninguém entrou em sala
        // ainda, então nenhum socket está aberto e a contagem sairia "0 de 20"
        // — que lê como falha catastrófica para quem acabou de abrir a página.
        // A lista só quer dizer alguma coisa DENTRO da sala. O teste de NAT em
        // si funciona sozinho: ele fala com os servidores STUN direto.
        { testeRede: renderizarTesteRede(analise, rodando, testar) },
      ))
    }

    function testar(): void {
      if (rodando) return
      rodando = true
      desenharHome()
      void coletarCandidatos().then(({ candidatos, erros }) => {
        analise = analisarCandidatos(candidatos, erros)
        rodando = false
        desenharHome()
      })
    }

    desenharHome()
  } catch {
    app.textContent = MENSAGEM_ERRO_INICIAL
  }
}

const raiz = document.querySelector<HTMLDivElement>('#app')
if (raiz) iniciarApp(raiz)
