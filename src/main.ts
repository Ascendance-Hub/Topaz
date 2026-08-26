import { Sessao } from './net/sessao'
import {
  criarSalasTrystero, criarTransporte, relaysConectados, relaysDetalhados,
} from './net/transport'
import { coletarCandidatos } from './net/coletar-candidatos'
import { analisarCandidatos } from './net/diagnostico-rede'
import type { Analise } from './net/diagnostico-rede'
import { renderizarTesteRede } from './ui/components/teste-rede'
import { renderizarHome } from './ui/components/home'
import { apelidoSalvo, salvarApelido } from './ui/components/lobby'
import { renderizarBarraSala } from './ui/components/barra-sala'
import { renderizarConexao } from './ui/components/conexao'
import { criarChat } from './ui/components/chat'
import { renderizarSalaParada } from './ui/components/sala'
import { renderizarTrilho } from './ui/components/trilho'
import type { Tela } from './ui/components/trilho'
import { JOGOS, renderizarAjustesDoJogo, renderizarJogos } from './ui/components/jogos'
import { renderizarConfigPartida } from './ui/components/config-partida'
import { formatoLembrado, lembrarFormato } from './partida/formato'
import { CONFIG_PADRAO } from './game/rules'
import { renderizarConfiguracoes } from './ui/components/configuracoes'
import { renderizarFaixaGrupos } from './ui/components/faixa-grupos'
import { grupos, grupoSalvo, removerGrupo, salvarGrupo } from './grupos/grupos'
import { renderizarControlesCall } from './ui/components/call'
import { renderizarMixer } from './ui/components/mixer'
import { AreaDeMidia } from './ui/area-midia'
import { criarAcoesCall } from './ui/acoes-da-call'
import { EU, montarParticipantes } from './ui/components/participantes'
import { renderizarCanais } from './ui/components/canais'
import { CANAL_PADRAO } from './call/protocolo'
import { fotoLembrada, fotoRecebida } from './perfil/foto-navegador'
import { renderizarIdentidade } from './ui/components/identidade'
import { entrarComSegredo, identidadeAtual, sairDaIdentidade } from './identidade/atual'
import type { Identidade } from './identidade/atual'
import { Apresentacao } from './identidade/apresentacao'
import type { Participante } from './ui/components/participantes'
import { MonitorDeVoz, MS_AMOSTRAGEM } from './call/monitor-voz'
import { suportaTrocarSaida } from './ui/dom-midia'
import { criarCanalCall } from './call/canal'
import { ProtocoloCall } from './call/protocolo'
import { Midia } from './call/midia'
import { AparelhosEmUso } from './call/aparelhos-em-uso'
import { renderizar } from './ui/render'
import { rngSemente } from './game/shoe'
import { mesaEsperaPor } from './game/rules'
import { faltaCripto, renderizarSemCripto } from './ui/components/sem-cripto'
import { renderizarSalasSalvas, type AcoesDeSalas } from './ui/components/salas-salvas'
import { montarDoCanal, type FonteDeParticipantes } from './ui/components/participantes'
import { renderizarRoda } from './ui/components/roda'
import { observarGrupos } from './presenca/presenca'
import { abrirSalaDeFundo } from './presenca/sala-de-fundo'

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
  const chat = criarChat((texto, escopo) => {
    // No canal, vai só para quem está comigo — e é isso que o torna do canal.
    // Mandar a todos e esconder na tela deixaria o texto viajando para quem
    // não devia recebê-lo.
    if (escopo === 'canal') transporte.enviarMensagem(texto, escopo, protocolo.estado().comigo)
    else transporte.enviarMensagem(texto, escopo)
    // A rede não devolve ao remetente o que ele mesmo mandou; sem este eco,
    // eu seria o único da sala a não ver a própria mensagem.
    chat.receber(apelido, texto, escopo)
  }, (trocado) => {
    // Um atributo na raiz e o CSS resolve o resto: as duas áreas trocam de
    // coluna, e nada se desmonta. Refazer o miolo aqui derrubaria o vídeo que
    // está tocando, e a troca é justamente para continuar vendo os dois.
    app.dataset['trocado'] = trocado ? '1' : ''
  })
  transporte.aoReceberMensagem((texto, peerId, escopo) =>
    chat.receber(apelidoDe(peerId), texto, escopo))

  /**
   * Anuncia a minha foto para a sala inteira.
   *
   * Chamada a cada pessoa que entra, e não uma vez só: quem chega depois não
   * tem como pedir, e um anúncio completo repetido é o mesmo padrão que o
   * resto do projeto usa para se consertar sozinho.
   */
  function anunciarFoto(): void {
    const minha = fotoLembrada()
    if (minha) transporte.enviarFoto(minha)
  }

  transporte.aoReceberFoto((foto, peerId) => {
    // A conferência é assíncrona porque o tamanho decodificado só se sabe
    // depois de o navegador decodificar — é o que barra a bomba de
    // descompressão, que o teto de bytes sozinho não pega.
    void fotoRecebida(foto).then((valida) => {
      if (!valida) return
      fotos.set(peerId, valida)
      // Mesma razão da minha: a assinatura dos círculos não olha a foto, e sem
      // isto a foto de quem trocou no meio da conversa nunca apareceria.
      invalidarRostos()
      desenharParticipantes()
    })
  })

  transporte.aoEntrarPeer(() => anunciarFoto())
  transporte.aoSairPeer((peerId) => {
    // Sem isto, a foto de quem saiu ficaria guardada até a aba fechar, e
    // reapareceria se outra pessoa herdasse o mesmo id.
    fotos.delete(peerId)
  })

  /**
   * Escolha local de visualização, de propósito FORA do `EstadoJogo`. Se
   * morasse no estado compartilhado, abrir a mesa arrastaria todo mundo
   * junto, e cada broadcast do host devolveria à mesa a tela de quem tivesse
   * voltado para a sala — há teste cobrindo esse segundo caso.
   */
  let tela: Tela = 'sala'
  /** Qual jogo está com o formato aberto, dentro da aba de Jogos. */
  let jogoEmAjuste: string | null = null
  /** A identidade, guardada aqui para os Ajustes poderem mostrá-la. */
  let identidade: Identidade | null = null

  function abrirFormato(chave: string): void {
    jogoEmAjuste = chave
    desenhar()
  }

  /**
   * O que o painel de formato precisa saber.
   *
   * A sugestão só é oferecida numa sala que ainda está no PADRÃO: numa sala já
   * configurada de propósito, preencher por cima apagaria a escolha de alguém
   * — possivelmente de outra pessoa, já que o formato viaja no estado.
   */
  function dadosDoFormato() {
    const estado = sessao.estado()
    const noPadrao = JSON.stringify(estado.config) === JSON.stringify(CONFIG_PADRAO)
    const lembrado = formatoLembrado()
    return {
      config: estado.config,
      souHost: sessao.souHost(),
      emAndamento: estado.fase !== 'aguardando' && estado.fase !== 'fim',
      sugestao: noPadrao && lembrado
        && JSON.stringify(lembrado) !== JSON.stringify(estado.config)
        ? lembrado
        : null,
    }
  }

  function irPara(destino: Tela): void {
    tela = destino
    desenhar()
  }

  /**
   * A marca só faz sentido quando a mesa está fora da tela: com a mesa
   * aberta, os botões que ela anunciaria já estão à vista, e a bolinha viraria
   * ruído em cima de algo que a pessoa já está olhando.
   */
  function mesaEspera(): boolean {
    return tela !== 'mesa'
      && sessao.statusConexao() === 'conectado'
      && mesaEsperaPor(sessao.estado(), sessao.meuId())
  }

  /**
   * Microfones, saídas e o motivo de o microfone não ter aberto.
   *
   * A saída escolhida precisa ser reaplicada a cada elemento novo — quem entra
   * depois nasceria na saída padrão do sistema.
   */
  const aparelhos = new AparelhosEmUso(
    midia, suportaTrocarSaida, () => area.aplicarSaidaNosNovos(),
  )

  /** O mixer é remontado a cada desenho: canais aparecem e somem conforme
   *  quem entra na call e quem está sendo assistido. */
  function montarMixer(): HTMLElement {
    const atual = protocolo.estado()
    return renderizarMixer(
      area.canais(atual.naCall, atual.assistindo),
      (chave, volume) => area.definirVolume(chave, volume),
    )
  }

  /**
   * Quem está falando agora, medido localmente sobre o áudio que já chega.
   *
   * Nada disso trafega: ninguém publica "estou falando". O anel de cada pessoa
   * é desenhado a partir do som dela que este navegador está recebendo.
   */
  const monitorVoz = new MonitorDeVoz()
  const falantes = new Set<string>()

  /**
   * A foto de cada pessoa, já conferida.
   *
   * Só entra aqui o que passou por `fotoRecebida` — formato, tamanho em bytes
   * e tamanho depois de decodificar. O mapa é a fronteira: daqui para a tela,
   * ninguém precisa desconfiar de novo.
   */
  const fotos = new Map<string, string>()

  /**
   * O selo de quem já PROVOU quem é. Só entra aqui depois de a assinatura
   * fechar — afirmar uma identidade é trivial, provar não.
   */
  const selos = new Map<string, string>()

  identidadeAtual().then((eu) => {
    identidade = eu
    desenhar()
    const apresentacao = new Apresentacao(transporte, eu.par, codigo)
    apresentacao.aoVerificar((peerId, selo) => {
      selos.set(peerId, selo)
      desenharParticipantes()
    })
    transporte.aoSairPeer((peerId) => selos.delete(peerId))
  }).catch((erro: unknown) => {
    // Sem identidade a sala continua funcionando: ninguém ganha selo, e é só
    // isso. Derrubar a sala por causa de um cofre indisponível seria trocar um
    // enfeite ausente por uma página em branco.
    console.warn('não deu para carregar a identidade desta máquina', erro)
  })
  monitorVoz.aoMudar((id, falando) => {
    if (falando) falantes.add(id)
    else falantes.delete(id)
    // Só a fileira: redesenhar a página inteira dez vezes por segundo por
    // causa de um anel seria caro e faria a mesa piscar.
    desenharParticipantes()
  })

  const acoesConfiguracoes = {
    renomear: (novo: string) => {
      salvarApelido(novo)
      // `entrar` é idempotente por construção: sobre um jogador que já existe
      // ela só atualiza o apelido. Reusá-la evita uma ação nova nas regras do
      // jogo só para renomear.
      sessao.entrar(novo)
      desenhar()
    },
    salvarGrupo: (nome: string) => {
      salvarGrupo(codigo, nome)
      desenhar()
    },
    esquecerGrupo: () => {
      removerGrupo(codigo)
      desenhar()
    },
    trocouFoto: () => {
      // Os peers só recebem foto quando alguém a anuncia.
      anunciarFoto()
      // E os círculos já estão desenhados com a anterior: a assinatura deles
      // não olha a foto — olhar exigiria comparar dezenas de milhares de
      // caracteres a cada mudança de quem fala. Invalidar na mão é exato e
      // custa nada, porque trocar de foto é raro.
      invalidarRostos()
      desenharParticipantes()
    },
    identidade: {
      guardei: () => {
        if (identidade) identidade = { ...identidade, segredoNovo: undefined }
        desenhar()
      },
      entrarComSegredo: (segredo: string) => {
        entrarComSegredo(segredo).then((nova) => {
          identidade = nova
          desenhar()
        }).catch((erro: unknown) => console.warn('não deu para entrar com esse ID', erro))
      },
      sair: () => {
        sairDaIdentidade()
          .then(() => identidadeAtual())
          .then((nova) => {
            identidade = nova
            desenhar()
          })
          .catch((erro: unknown) => console.warn('não deu para sair', erro))
      },
    },
  }

  /** Junta o que a sala sabe e deixa a decisão com `montarParticipantes`. */
  /**
   * Tudo que se sabe sobre quem está na call, num lugar só.
   *
   * Serve à fileira de baixo e à lista de canais da esquerda. Separada porque
   * as duas precisam exatamente do mesmo, e uma cópia divergiria na primeira
   * vez que alguém acrescentasse um campo.
   */
  function fonteDeParticipantes(): FonteDeParticipantes {
    const atual = protocolo.estado()
    return {
      euNaCall: atual.euNaCall,
      naCall: atual.comigo,
      meuApelido: apelido,
      minhaFoto: fotoLembrada() ?? undefined,
      meuMicrofoneMudo: midia.microfoneMudo(),
      euSemMicrofone: aparelhos.semMicrofone() !== null,
      falantes,
      fotos,
      selos,
      apelidoDe,
    }
  }

  function participantesAgora(): Participante[] {
    return montarParticipantes(fonteDeParticipantes())
  }

  /**
   * Trocar de sala sem passar pela home.
   *
   * Desmonta ESTA sala antes de montar a outra, pelo mesmo caminho que
   * `reconectar` usa: uma conexão de cada vez, e o desmonte é local para duas
   * salas na mesma página continuarem sendo um caso de teste legítimo.
   */
  const acoesDeSalas: AcoesDeSalas = {
    ir: (destino: string) => {
      // Espera SÓ a observação do destino fechar — nunca o resto.
      //
      // O Trystero devolve a mesma sala quando se entra num id já aberto, e a
      // saída dele só desregistra depois de um envio e mais 99ms. Sem isto, a
      // sala "nova" seria a passiva, que não anuncia.
      //
      // E só ela: enquanto ESTA sala continua registrada, a piscina de relays
      // sobrevive. Esperar tudo fazia `hasActiveRooms()` virar falso, e o
      // Trystero destruía as vinte conexões de relay e as vinte ofertas
      // pré-fabricadas — foi o que deixou a troca de sala lenta e falhando.
      void presenca.fecharUm(destino).then(() => {
        encerrar()
        entrarNaSala(app, apelido, destino)
      })
    },
    outra: () => {
      encerrar()
      window.location.hash = ''
      iniciarApp(app)
    },
  }

  try {
    // Um fone plugado ou arrancado no meio da conversa deixaria a lista velha.
    navigator.mediaDevices.addEventListener(
      'devicechange', () => void aparelhos.reler().then(desenhar),
    )
  } catch {
    // Navegador sem `mediaDevices`: a call não vai funcionar mesmo, e a sala
    // não pode quebrar por causa disso.
  }

  /**
   * A área de mídia: as telas e as vozes.
   *
   * Criada UMA vez e nunca substituída — recriar um elemento de mídia
   * reinicia o fluxo, e a mesa é redesenhada a cada anúncio do anfitrião.
   */
  const area = new AreaDeMidia({
    apelidoDe,
    saidaAtual: () => aparelhos.saidaAtual(),
    aoOuvirVoz: (peerId, stream) => monitorVoz.observar(peerId, stream),
    aoPerderVoz: (peerId) => monitorVoz.esquecer(peerId),
  })

  midia.aoReceberMidia((stream, de) => {
    area.receber(stream, de, protocolo.estado().assistindo.includes(de))
  })

  const acoesCall = criarAcoesCall({
    protocolo, midia, aparelhos, area,
    pararDeMedirVoz: () => {
      monitorVoz.encerrar()
      falantes.clear()
    },
    sincronizarMidia: () => sincronizarMidia(),
    desenhar: () => desenhar(),
  })

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
    // `comigo` e não `naCall`: o microfone vai só para quem está no MEU
    // canal. É esta linha que faz dois grupos conversarem na mesma sala sem se
    // atrapalhar — e ela sozinha, porque a conexão com todos continua de pé.
    midia.sincronizarMicrofone(atual.comigo)
    // A assinatura vira efeito: sem espectador nenhum, a `Midia` despublica do
    // último e o codificador desliga — que é o ponto de todo o desenho.
    midia.sincronizarTela(atual.assistidoPor)

    area.ajustar(atual.assistindo, atual.compartilhando, atual.comigo)
    area.previaDaMinhaTela(atual.euCompartilhando ? midia.telaLocal() : null)
    sincronizarMedidorDeVoz(atual.comigo, atual.euNaCall)
  }

  /**
   * Deixa o medidor de voz observando exatamente quem está na call.
   *
   * Reconciliação, não detecção de borda — a mesma regra do resto da mídia.
   * Quem sai da call deixaria para trás um analisador pendurado num stream
   * morto: vazamento, e o anel dele congelado aceso.
   *
   * O meu microfone entra aqui porque ele NUNCA chega pelo caminho de mídia
   * recebida — sai daqui direto para a rede. Sem isto eu seria o único sem
   * anel.
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

  /** Em que canal a aba de conversa está aberta agora. `''` fora da call. */
  let canalDoChat = ''

  protocolo.aoMudar(() => {
    const atual = protocolo.estado()
    const agora = atual.euNaCall ? atual.meuCanal : ''
    chat.definirEmCanal(atual.euNaCall)
    // Mudou de canal (ou saiu): a conversa de lá foi endereçada às pessoas com
    // quem você estava. Mantê-la na tela enquanto você fala com outras
    // confunde de quem é o quê — e some junto com o motivo de existir.
    if (agora !== canalDoChat) {
      chat.limparCanal()
      canalDoChat = agora
    }
    sincronizarMidia()
    desenhar()
  })

  let barra = renderizarBarraSala(codigo, sessao.souHost(), {
    aoReconectar: reconectar,
    naSala: sessao.estado().jogadores.length,
    conectados: conectadosComigo().length,
  })
  let nav = renderizarTrilho(tela, irPara, { mesaEspera: mesaEspera() })
  let mixer = montarMixer()

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
  /**
   * A roda de conversa, irmã do palco e não filha dele.
   *
   * Ela precisa se redesenhar em ritmo de FALA, e o palco se redesenha em
   * ritmo de partida. Dentro dele, o anel de quem fala só acenderia quando o
   * jogo mudasse — que é o que acontecia até aqui.
   */
  let roda = renderizarRoda([])

  /**
   * Quem está na sala, logo abaixo da barra.
   *
   * Saiu do miolo: lá ele disputava o lugar com os rostos, e é informação de
   * cabeçalho — quem está nesta sala, esteja em call ou não. Junto do código
   * e do "2 de 2 conectados", que respondem à mesma pergunta.
   */
  let naSala = renderizarSalaParada(
    sessao.estado(), sessao.meuId(), conectadosComigo())

  /**
   * A coluna da esquerda: suas salas, os canais, e as seções.
   *
   * Os canais moraram no rodapé por um tempo e ficou ruim: uma fileira de
   * pílulas embaixo dizia quantos, e o que se quer saber ao escolher um canal
   * é COM QUEM. Vertical cabe o nome de cada pessoa, e sobra largura no meio
   * para o que importa — a tela compartilhada.
   *
   * Os três moram no mesmo invólucro para o grid ter uma coluna só. Cada um
   * se redesenha por dentro, sem a coluna se desmontar.
   */
  const coluna = document.createElement('div')
  coluna.className = 'coluna'
  /**
   * Os OUTROS grupos salvos, em modo passivo.
   *
   * Este aqui é ativo — é onde você está de verdade. Observar a si mesmo
   * abriria uma segunda sala para a mesma conversa; pior, o Trystero devolve a
   * MESMA sala nesse caso, e o `onPeerJoin` é uma propriedade única: uma das
   * duas perderia o seu ouvinte.
   */
  const presenca = observarGrupos(
    grupos().map((g) => g.codigo).filter((c) => c !== codigo), abrirSalaDeFundo)
  presenca.aoMudar(() => desenharSalasSalvas())

  let salasSalvas = renderizarSalasSalvas(
    grupos(), codigo, acoesDeSalas, presenca.quantos)
  let canais = renderizarCanais([], CANAL_PADRAO, { mudar: () => {} })
  coluna.append(salasSalvas, canais, nav)
  /**
   * O que rola: o palco e as telas compartilhadas, juntos.
   *
   * Existe para a sala poder ser uma casca de altura fixa — barra em cima,
   * pessoas e controles embaixo, e SÓ o miolo rolando. Sem este invólucro,
   * palco e vídeos seriam duas áreas roláveis lado a lado, ou a página
   * inteira cresceria e os controles da call sairiam da tela.
   */
  const conteudo = document.createElement('div')
  conteudo.className = 'conteudo'
  // A roda vem antes: em modo faixa ela é a coluna da esquerda do miolo, e a
  // ordem no DOM é a ordem na tela.
  conteudo.append(roda, palco, area.videos)

  app.replaceChildren(
    barra, naSala, coluna, conteudo, controles, lateral, area.audios,
  )

  /**
   * Quem está falando, marcado no lugar.
   *
   * O anel acende trocando um atributo, sem refazer elemento nenhum: é a
   * única parte da lista de canais que muda em ritmo de fala.
   */
  function acenderQuemFala(): void {
    for (const item of roda.querySelectorAll<HTMLElement>('.roda-pessoa')) {
      const quem = item.dataset['pessoa']
      if (quem !== undefined && falantes.has(quem)) item.dataset['falando'] = '1'
      else delete item.dataset['falando']
    }
    for (const linha of canais.querySelectorAll<HTMLElement>('.canal-pessoa')) {
      const quem = linha.dataset['pessoa']
      // Eu apareço sob a chave própria do medidor, não sob o meu peerId: o
      // meu microfone é local e nunca chega pelo caminho de mídia recebida.
      const falando = quem !== undefined
        && falantes.has(linha.dataset['eu'] === '1' ? EU : quem)
      if (falando) linha.dataset['falando'] = '1'
      else delete linha.dataset['falando']
    }
  }

  /**
   * Clicar num canal: entra na call ali, se ainda não estiver nela.
   *
   * Antes o clique só trocava de canal, e a lista nem aparecia fora da call.
   * Mas ver quem está conversando é justamente o que faz alguém decidir
   * entrar — esconder isso até a pessoa entrar invertia a ordem das coisas.
   *
   * Entrar e trocar na mesma ação, e não "entre primeiro, depois escolha":
   * quem clicou no Canal 2 já disse para onde quer ir.
   */
  function entrarNoCanal(id: string): void {
    if (protocolo.estado().euNaCall) {
      protocolo.mudarCanal(id)
      return
    }
    // A ordem importa: o canal é definido ANTES de anunciar presença, senão eu
    // apareço um instante no principal para todo mundo — e nesse instante o
    // microfone vai para lá.
    protocolo.mudarCanal(id)
    acoesCall.entrar()
  }

  /**
   * O miolo de quem ainda não entrou na call.
   *
   * Antes ele mostrava a lista de quem está na sala; ela subiu para o topo, e
   * o que sobra aqui é um espaço vazio. Vazio sem explicação lê como falha —
   * uma linha dizendo o que fazer custa nada e responde a pergunta.
   */
  function renderizarConvite(): HTMLElement {
    const convite = document.createElement('p')
    convite.className = 'convite-call'
    convite.textContent = 'Entre na call para conversar, ou clique num canal ao lado.'
    return convite
  }

  /** A assinatura da última lista desenhada, para não refazê-la à toa. */
  let assinaturaDosCanais = ''
  let assinaturaDaConfig = ''
  let assinaturaDaRoda = ''

  /**
   * Força o próximo desenho a refazer os rostos.
   *
   * As assinaturas comparam quem está onde, não como cada um está desenhado —
   * incluir a foto obrigaria a concatenar dezenas de milhares de caracteres a
   * cada mudança de quem fala, muitas vezes por minuto. Trocar de foto é raro,
   * então avisar na mão é exato e muito mais barato que a alternativa.
   */
  /** Só a tira de salas, sem redesenhar o resto. */
  function desenharSalasSalvas(): void {
    presenca.sincronizar(
      grupos().map((g) => g.codigo).filter((c) => c !== codigo))
    const novas = renderizarSalasSalvas(
      grupos(), codigo, acoesDeSalas, presenca.quantos)
    salasSalvas.replaceWith(novas)
    salasSalvas = novas
  }

  function invalidarRostos(): void {
    assinaturaDaRoda = ''
    assinaturaDosCanais = ''
  }

  /** Só a fileira, sem redesenhar o resto. Chamada a cada mudança de quem
   *  está falando, que acontece muitas vezes por minuto. */
  function desenharParticipantes(): void {
    const atual = protocolo.estado()
    // A lista de canais só existe dentro da call: fora dela não há para onde
    // ir, e uma fileira de pílulas mortas seria só ruído.
    // A lista só se reconstrói quando a COMPOSIÇÃO muda. Esta função roda a
    // cada mudança de quem fala, e refazer os retratos nesse ritmo mandaria o
    // navegador redecodificar toda foto várias vezes por minuto — a mesma
    // preocupação que fez a fileira existir separada do resto.
    const assinatura = `${atual.euNaCall}|${atual.meuCanal}|${atual.podeAbrirCanal}|`
      + atual.porCanal.map((c) => `${c.id}:${c.quem.join(',')}`).join(';')
    if (assinatura !== assinaturaDosCanais) {
      assinaturaDosCanais = assinatura
      const novosCanais = renderizarCanais(
        atual.porCanal.map((c) => ({
          id: c.id,
          nome: c.nome,
          // O protocolo entrega peerIds; nome e foto vêm do jogo e das fotos
          // recebidas. É aqui que os dois vocabulários se encontram.
          gente: montarDoCanal(c.quem, transporte.meuId(), fonteDeParticipantes()),
        })),
        // Fora da call eu não estou em canal nenhum, e nenhum deve aparecer
        // aceso: `meuCanal` guarda para onde eu iria, não onde eu estou.
        atual.euNaCall ? atual.meuCanal : '',
        {
          mudar: entrarNoCanal,
          // O botão só existe quando há id livre: um "+" que não abre nada
          // seria um botão que engana.
          ...(atual.podeAbrirCanal ? { abrir: () => protocolo.abrirCanal() } : {}),
        },
      )
      canais.replaceWith(novosCanais)
      canais = novosCanais
    }
    acenderQuemFala()

    // A roda segue a mesma regra dos canais: só se refaz quando a composição
    // muda. Assistindo alguém ela vira faixa, e o modo entra na assinatura
    // porque muda o desenho inteiro.
    const gente = participantesAgora()
    const modo = atual.assistindo.length > 0 ? 'faixa' : 'grade'
    const assinaturaRoda = `${modo}|`
      + gente.map((p) => `${p.peerId}:${p.mudo}${p.semMicrofone}${p.selo ?? ''}`).join(',')
    if (assinaturaRoda !== assinaturaDaRoda) {
      assinaturaDaRoda = assinaturaRoda
      const nova = renderizarRoda(gente, modo)
      roda.replaceWith(nova)
      roda = nova
    }
  }

  function desenhar(): void {
    // A roda e os vídeos são irmãos persistentes do palco: eles NÃO são
    // trocados quando a tela muda, e por isso continuavam aparecendo por baixo
    // dos Ajustes e da galeria. Quem some é o CSS, e não o DOM: desmontar o
    // vídeo o faria recomeçar do zero ao voltar, e a prévia da própria tela
    // morreria junto.
    conteudo.dataset['tela'] = tela

    const novaBarra = renderizarBarraSala(codigo, sessao.souHost(), {
      aoReconectar: reconectar,
      naSala: sessao.estado().jogadores.length,
      conectados: conectadosComigo().length,
    })
    barra.replaceWith(novaBarra)
    barra = novaBarra

    const novoNaSala = renderizarSalaParada(
      sessao.estado(), sessao.meuId(), conectadosComigo())
    naSala.replaceWith(novoNaSala)
    naSala = novoNaSala

    desenharSalasSalvas()

    const novaNav = renderizarTrilho(tela, irPara, { mesaEspera: mesaEspera() })
    nav.replaceWith(novaNav)
    nav = novaNav

    const novosControles =
      renderizarControlesCall(
        protocolo.estado(), acoesCall, midia.qualidade(), midia.tipoConteudo(),
        {
          apelidoDe, meuMicrofoneMudo: midia.microfoneMudo(),
          todosSilenciados: area.silenciados(),
          microfones: aparelhos.microfones(), microfoneAtual: midia.microfoneAtual(),
          semMicrofone: aparelhos.semMicrofone(),
          saidas: aparelhos.saidas(), saidaAtual: aparelhos.saidaAtual(),
        })
    controles.replaceWith(novosControles)
    controles = novosControles

    const novoMixer = montarMixer()
    mixer.replaceWith(novoMixer)
    mixer = novoMixer
    area.aplicarVolumes()
    desenharParticipantes()

    // Enquanto ninguém é anfitrião a mesa ainda não existe: mostrar a mesa
    // vazia com "Aguardando jogadores…" confundiria "ninguém entrou ainda"
    // com "a conexão falhou" (spec §14).
    const status = sessao.statusConexao()
    if (status !== 'conectado') {
      palco.replaceChildren(renderizarConexao(status, relaysConectados()))
      if (status === 'sem-conexao') {
        palco.append(
        renderizarTesteRede(
          analiseRede, testandoRede, testarRede, relaysDetalhados(), estadoDetalhes))
      }
      return
    }
    if (tela === 'mesa') {
      renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
      return
    }

    if (tela === 'jogos') {
      palco.replaceChildren(jogoEmAjuste === null
        ? renderizarJogos({
          abrir: () => irPara('mesa'),
          // A engrenagem só existe para o anfitrião: mostrá-la a todos e
          // barrar no clique seria um botão que engana.
          ...(sessao.souHost() ? { ajustar: abrirFormato } : {}),
        })
        : renderizarAjustesDoJogo(
          JOGOS.find((j) => j.chave === jogoEmAjuste)?.nome ?? 'Formato',
          renderizarConfigPartida(dadosDoFormato(), (config) => {
            sessao.despachar({ tipo: 'configurar', config })
            // Lembrar aqui e não no motor: é escolha DESTA pessoa nesta
            // máquina, não estado da partida.
            lembrarFormato(config)
            desenhar()
          }),
          () => { jogoEmAjuste = null; desenhar() },
        ))
      return
    }

    if (tela === 'config') {
      const meuApelido = sessao.estado().jogadores.find((j) => j.peerId === sessao.meuId())
        ?.apelido ?? apelido
      const grupo = grupoSalvo(codigo)
      // Só refaz quando algo REALMENTE mudou.
      //
      // `desenhar` roda a cada tique e a cada mudança da sala — várias vezes
      // por minuto. O painel tem um `<input type="file">` dentro, e o diálogo
      // do sistema fica aberto por segundos: refazer o painel nesse meio-tempo
      // desliga o campo que estava esperando o arquivo, e escolher a foto não
      // faz nada. Era por isso que só funcionava na tela inicial, onde nada
      // redesenha sozinho.
      //
      // Vale para os campos de texto pelo mesmo motivo: um nome sendo digitado
      // sumia no meio da digitação.
      const assinatura = `${meuApelido}|${grupo?.nome ?? ''}|${identidade?.selo ?? ''}`
      if (assinatura !== assinaturaDaConfig || palco.querySelector('.config') === null) {
        assinaturaDaConfig = assinatura
        palco.replaceChildren(renderizarConfiguracoes(
          { apelido: meuApelido, codigo, grupo, identidade }, acoesConfiguracoes))
      }
      return
    }

    const call = protocolo.estado()
    // Assistindo alguém, a roda cede o meio para a tela e vira faixa. Saber
    // quem está falando importa MAIS com uma tela na frente, não menos — por
    // isso ela encolhe em vez de sumir.
    conteudo.dataset['assistindo'] = call.assistindo.length > 0 ? '1' : ''

    // Dentro de um canal o miolo são os rostos, e quem desenha a roda é
    // `desenharParticipantes` — aqui o palco fica de fora do caminho.
    if (call.euNaCall) {
      palco.replaceChildren()
      return
    }

    palco.replaceChildren(renderizarConvite())

    // Quem está sozinho é exatamente quem precisa do teste: a aplicação não
    // distingue de dentro "ninguém me achou" de "minha rede não deixa
    // conectar", e o teste responde a segunda metade na máquina certa.
    if (conectadosComigo().length <= 1) {
      palco.append(
        renderizarTesteRede(
          analiseRede, testandoRede, testarRede, relaysDetalhados(), estadoDetalhes))
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
  /** Sobrevive ao redesenho: a sala é reconstruída a cada clique na call. */
  let detalhesRede: boolean | undefined
  const estadoDetalhes = {
    get aberto() { return detalhesRede },
    aoAlternar: (aberto: boolean) => { detalhesRede = aberto },
  }
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
    // Sem esperar, de propósito: a sala nova é aberta logo em seguida, e
    // enquanto a velha ainda está registrada a piscina de relays sobrevive.
    void presenca.encerrar()
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
  // Antes de tudo: sem `crypto.subtle` nenhuma sala se forma, porque o código
  // da sala vira chave antes do primeiro anúncio. Falhar aqui, dizendo o que
  // houve, é melhor que deixar a pessoa clicar em "entrar" e olhar para uma
  // sala que nunca conecta.
  if (faltaCripto({ isSecureContext: window.isSecureContext, subtle: crypto.subtle })) {
    app.replaceChildren(renderizarSemCripto(window.location.href))
    return
  }

  try {
    // O teste de rede também mora na home, e não só dentro da sala: quem
    // recebeu um link e não consegue entrar nunca chega à sala para achá-lo.
    let analise: Analise | null = null
    let rodando = false
    let identidade: Identidade | null = null

    /** Recarrega o painel depois de qualquer mudança de identidade. */
    const adotar = (nova: Identidade): void => {
      identidade = nova
      desenharHome()
    }

    const acoesIdentidade = {
      // A pessoa afirmou ter guardado: paramos de mostrar o segredo. Ele não
      // é apagado de lugar nenhum porque nunca foi guardado — só existia nesta
      // variável.
      guardei: () => {
        if (identidade) adotar({ ...identidade, segredoNovo: undefined })
      },
      entrarComSegredo: (segredo: string) => {
        entrarComSegredo(segredo).then(adotar).catch((erro: unknown) => {
          console.warn('não deu para entrar com esse ID', erro)
        })
      },
      sair: () => {
        sairDaIdentidade()
          .then(() => identidadeAtual())
          .then(adotar)
          .catch((erro: unknown) => console.warn('não deu para sair', erro))
      },
    }

    identidadeAtual().then(adotar).catch((erro: unknown) => {
      // Cofre indisponível (janela anônima, política do navegador): a home
      // continua servindo para entrar em sala, só sem identidade.
      console.warn('não deu para carregar a identidade', erro)
    })

    /**
     * Entrar direto por um cartão de grupo.
     *
     * O apelido guardado é usado sem perguntar — quem tem grupos salvos já
     * passou pela porta da frente pelo menos uma vez. Se ele não existir (o
     * armazenamento pode ter sido limpo pela metade), o cartão não faz nada em
     * silêncio: leva o foco para o campo, que é o que resolve.
     */
    const entrarNoGrupo = (cod: string): void => {
      const apelido = apelidoSalvo()
      if (!apelido) {
        app.querySelector<HTMLInputElement>('input[placeholder="Seu apelido"]')?.focus()
        return
      }
      irParaSala(apelido, cod)
    }

    /**
     * Quem está online em cada grupo salvo.
     *
     * Salas de fundo em modo passivo: elas não anunciam, e duas passivas nunca
     * se conectam. Um grupo em que ninguém está custa zero conexões — é o que
     * torna razoável abrir todos os salvos de uma vez.
     */
    const presenca = observarGrupos(
      grupos().map((g) => g.codigo), abrirSalaDeFundo)
    presenca.aoMudar(() => desenharHome())

    /**
     * Entrar numa sala fecha a observação DELA antes, e espera.
     *
     * Aqui não custa: vindo da tela inicial não há sala aberta, então não há
     * piscina de relays quente para perder — ela seria construída de qualquer
     * jeito. É dentro de uma sala que esperar demais machuca.
     */
    const irParaSala = (apelido: string, codigo: string): void => {
      void presenca.fecharUm(codigo)
        .then(() => entrarNaSala(app, apelido, codigo))
    }

    const desenharHome = (): void => {
      // Grupo removido (ou salvo noutra aba) deixa de ser observado na hora.
      presenca.sincronizar(grupos().map((g) => g.codigo))
      app.replaceChildren(renderizarHome(
        irParaSala,
        // Sem a lista de servidores, de propósito. Aqui ninguém entrou em sala
        // ainda, então nenhum socket está aberto e a contagem sairia "0 de 20"
        // — que lê como falha catastrófica para quem acabou de abrir a página.
        // A lista só quer dizer alguma coisa DENTRO da sala. O teste de NAT em
        // si funciona sozinho: ele fala com os servidores STUN direto.
        {
          testeRede: renderizarTesteRede(analise, rodando, testar),
          identidade: renderizarIdentidade(identidade, acoesIdentidade),
          grupos: renderizarFaixaGrupos(grupos(), entrarNoGrupo, (cod) => {
            removerGrupo(cod)
            desenharHome()
          }, presenca.quantos),
        },
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
