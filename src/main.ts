import { Sessao } from './net/sessao'
import {
  criarSalasTrystero, criarTransporte, relaysConectados,
} from './net/transport'
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
import { EU } from './ui/components/participantes'
import { renderizarCanais } from './ui/components/canais'
import { CANAL_PADRAO } from './call/protocolo'
import { fotoLembrada, fotoRecebida } from './perfil/foto-navegador'
import { renderizarIdentidade } from './ui/components/identidade'
import { identidadeAtual } from './identidade/atual'
import { criarAcoesIdentidade } from './identidade/acoes'
import type { Identidade } from './identidade/atual'
import { Apresentacao } from './identidade/apresentacao'
import { MonitorDeVoz, MS_AMOSTRAGEM } from './call/monitor-voz'
import { suportaTrocarSaida } from './ui/dom-midia'
import { criarCanalCall } from './call/canal'
import { ProtocoloCall } from './call/protocolo'
import { Midia } from './call/midia'
import { AparelhosEmUso } from './call/aparelhos-em-uso'
import { criarPainelDeRede } from './ui/painel-rede'
import { criarPessoas } from './sala/pessoas'
import { criarPresencaLocal } from './sala/presenca-local'
import { oQueOPalcoMostra } from './sala/desenho'
import { criarSincronizacao } from './sala/sincronizacao'
import { renderizar } from './ui/render'
import { criarSlot } from './ui/slot'
import { rngSemente } from './game/shoe'
import { mesaEsperaPor } from './game/rules'
import { faltaCripto, renderizarSemCripto } from './ui/components/sem-cripto'
import { renderizarSalasSalvas, type AcoesDeSalas } from './ui/components/salas-salvas'
import { observarGrupos, PAUSA_ENTRE_SALAS_MS } from './presenca/presenca'
import { abrirSalaDeFundo, anunciarPresenca } from './presenca/sala-de-fundo'
import { montarDoCanal } from './ui/components/participantes'
import { renderizarRoda } from './ui/components/roda'

function rngDaSessao() {
  return rngSemente(Date.now() ^ Math.floor(Math.random() * 1e9))
}

/**
 * Monta a sala dentro de `app` e mantém tudo em dia. A mesa é um dos
 * conteúdos possíveis do palco, não a sala em si: entrar numa sala é estar
 * junto com as outras pessoas, e abrir a mesa é uma das coisas que se faz lá
 * dentro.
 *
 * As peças que se refazem inteiras — a barra, o trilho, a fileira de canais, a
 * roda — moram em `criarSlot`, e não em variáveis reatribuídas à mão. O motivo
 * está lá: `replaceWith` só funciona uma vez sobre a mesma referência, e a
 * disciplina de reatribuir a variável a cada troca era nove oportunidades de
 * esquecer — cada uma congelando um pedaço da tela em silêncio.
 */
export function entrarNaSala(app: HTMLElement, apelido: string, codigo: string): void {
  const salas = criarSalasTrystero(codigo)
  const transporte = criarTransporte(salas)
  const sessao = new Sessao(transporte, rngDaSessao)

  const protocolo = new ProtocoloCall(criarCanalCall(salas, transporte))
  const midia = new Midia(salas)

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
    chat.receber(pessoas.apelidoDe(peerId), texto, escopo))

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
      pessoas.guardarFoto(peerId, valida)
      // Mesma razão da minha: a assinatura dos círculos não olha a foto, e sem
      // isto a foto de quem trocou no meio da conversa nunca apareceria.
      invalidarRostos()
      desenharParticipantes()
    })
  })

  transporte.aoEntrarPeer(() => anunciarFoto())
  transporte.aoSairPeer((peerId) => {
    // Sem isto, a foto e o selo de quem saiu ficariam guardados até a aba
    // fechar, e reapareceriam se outra pessoa herdasse o mesmo id.
    pessoas.esquecer(peerId)
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

  /**
   * Quem é quem na sala: nome, foto, selo e quem está falando.
   *
   * Tudo função nas dependências, e nada valor: ele é consultado no ritmo da
   * FALA — dez vezes por segundo — e precisa enxergar o estado de agora.
   */
  const pessoas = criarPessoas({
    jogadores: () => sessao.estado().jogadores,
    euNaCall: () => protocolo.estado().euNaCall,
    comigo: () => protocolo.estado().comigo,
    meuApelido: () => apelido,
    minhaFoto: () => fotoLembrada() ?? undefined,
    meuMicrofoneMudo: () => midia.microfoneMudo(),
    euSemMicrofone: () => aparelhos.semMicrofone() !== null,
  })

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

  identidadeAtual().then((eu) => {
    identidade = eu
    desenhar()
    const apresentacao = new Apresentacao(transporte, eu.par, codigo)
    apresentacao.aoVerificar((peerId, selo) => {
      pessoas.guardarSelo(peerId, selo)
      desenharParticipantes()
    })
  }).catch((erro: unknown) => {
    // Sem identidade a sala continua funcionando: ninguém ganha selo, e é só
    // isso. Derrubar a sala por causa de um cofre indisponível seria trocar um
    // enfeite ausente por uma página em branco.
    console.warn('não deu para carregar a identidade desta máquina', erro)
  })
  monitorVoz.aoMudar((id, falando) => {
    pessoas.definirFalando(id, falando)
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
    identidade: criarAcoesIdentidade(() => identidade, (nova) => {
      identidade = nova
      desenhar()
    }),
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
      // Sem esperar, de propósito: o código é OUTRO, então não há a colisão
      // que o `reconectar` sofre — e esperar aqui deixaria mais lento
      // justamente o passo que já demora.
      void encerrar()
      entrarNaSala(app, apelido, destino)
    },
    outra: () => {
      void encerrar()
      window.location.hash = ''
      iniciarApp(app)
    },
  }

  /**
   * Um fone plugado ou arrancado no meio da conversa deixaria a lista velha.
   *
   * Guardado numa constante para poder ser REMOVIDO no `encerrar`. Trocar de
   * sala desmonta esta e monta outra, e um ouvinte esquecido continua chamando
   * `desenhar()` numa sala morta — um por troca, para sempre. Foi por esse
   * caminho que o anúncio órfão da presença nascia.
   */
  const aoTrocarAparelho = (): void => { void aparelhos.reler().then(desenhar) }
  try {
    navigator.mediaDevices.addEventListener('devicechange', aoTrocarAparelho)
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
    apelidoDe: pessoas.apelidoDe,
    saidaAtual: () => aparelhos.saidaAtual(),
    aoOuvirVoz: (peerId, stream) => monitorVoz.observar(peerId, stream),
    aoPerderVoz: (peerId) => monitorVoz.esquecer(peerId),
  })

  midia.aoReceberMidia((stream, de) => {
    area.receber(stream, de, protocolo.estado().assistindo.includes(de))
  })

  /**
   * Quem saiu da sala perde a voz na tela: o elemento sai da árvore e o stream
   * é largado.
   *
   * A tela já era resolvida — `ajustar` remove quem saiu de `compartilhando`.
   * O `<audio>` não: `ajustar` só **cala** (`muted`), e calar não solta o
   * `srcObject`. Ficava um elemento e um stream morto por pessoa que sai, para
   * sempre, porque o `selfId` do Trystero nasce a cada carregamento e quem
   * volta volta com id novo.
   *
   * **Remover, e não reaproveitar.** Se a mesma pessoa reaparecer com o MESMO
   * peerId (o "Reconectar" preserva o `selfId`), quem manda republica um
   * invólucro novo — o `ProtocoloCall` dela tirou você do `comigo` na saída e
   * põe de volta na entrada, e `sincronizarMicrofone` reconcilia. Chega um
   * `onPeerStream` novo, e `AreaDeMidia.receber` monta um `<audio>` novo.
   *
   * Reaproveitar o elemento antigo seria o defeito de 2026-08-26 de volta: o
   * receptor cacheia o stream pelo OBJETO, e um elemento apontando para um
   * stream morto nunca mais toca nada.
   */
  transporte.aoSairPeer((peerId) => area.removerVozDe(peerId))

  const acoesCall = criarAcoesCall({
    protocolo, midia, aparelhos, area,
    pararDeMedirVoz: () => {
      monitorVoz.encerrar()
      pessoas.limparFalantes()
    },
    sincronizarMidia: () => sincronizacao.sincronizarMidia(),
    desenhar: () => desenhar(),
  })

  /**
   * Só a tira de salas, sem redesenhar o resto.
   *
   * É aqui que a presença passa a observar — e nunca antes da tranca, porque
   * `desenhar()` roda já na montagem e o adiamento não adiaria nada.
   *
   * O grupo ATUAL fica de fora da observação: eu já estou nele, e observar a
   * si mesmo abriria uma segunda entrada no mesmo `codigo#presenca` — que o
   * Trystero devolveria como a MESMA sala, com o `onPeerJoin` (que é
   * propriedade, não lista) sobrescrito por cima do anúncio.
   */
  function desenharSalasSalvas(): void {
    presencaLocal.acompanharGrupos()
    salasSalvas.trocar(renderizarSalasSalvas(
      grupos(), codigo, acoesDeSalas, presencaLocal.quantos))
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
    sincronizacao.sincronizarMidia()
    desenhar()
  })

  const barra = criarSlot(renderizarBarraSala(codigo, sessao.souHost(), {
    aoReconectar: reconectar,
    naSala: sessao.estado().jogadores.length,
    conectados: conectadosComigo().length,
  }))
  const nav = criarSlot(renderizarTrilho(tela, irPara, { mesaEspera: mesaEspera() }))
  const mixer = criarSlot(montarMixer())

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
  lateral.append(chat.raiz, mixer.atual)
  const controles = criarSlot(renderizarControlesCall(
    protocolo.estado(), acoesCall, midia.qualidade(), midia.tipoConteudo()))
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
  const roda = criarSlot(renderizarRoda([]))

  /**
   * Quem está na sala, logo abaixo da barra.
   *
   * Saiu do miolo: lá ele disputava o lugar com os rostos, e é informação de
   * cabeçalho — quem está nesta sala, esteja em call ou não. Junto do código
   * e do "2 de 2 conectados", que respondem à mesma pergunta.
   */
  const naSala = criarSlot(renderizarSalaParada(
    sessao.estado(), sessao.meuId(), conectadosComigo()))

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
   * A presença deste lado: quem está online nos outros grupos salvos, e o meu
   * anúncio neste.
   *
   * `conectado` vale mesmo estando sozinho — assumir como anfitrião já conta,
   * então quem abre uma sala vazia não fica esperando para sempre.
   */
  const presencaLocal = criarPresencaLocal({
    codigo,
    grupos: () => grupos().map((g) => g.codigo),
    conectado: () => sessao.statusConexao() === 'conectado',
    abrir: abrirSalaDeFundo,
    anunciar: anunciarPresenca,
    pausaMs: PAUSA_ENTRE_SALAS_MS,
    aoMudar: () => desenharSalasSalvas(),
  })

  const salasSalvas = criarSlot(renderizarSalasSalvas(
    grupos(), codigo, acoesDeSalas, presencaLocal.quantos))
  const canais = criarSlot(renderizarCanais([], CANAL_PADRAO, { mudar: () => {} }))
  coluna.append(salasSalvas.atual, canais.atual, nav.atual)
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
  conteudo.append(roda.atual, palco, area.videos)

  app.replaceChildren(
    barra.atual, naSala.atual, coluna, conteudo, controles.atual, lateral, area.audios,
  )

  /**
   * Quem está falando, marcado no lugar.
   *
   * O anel acende trocando um atributo, sem refazer elemento nenhum: é a
   * única parte da lista de canais que muda em ritmo de fala.
   */
  function acenderQuemFala(): void {
    for (const item of roda.atual.querySelectorAll<HTMLElement>('.roda-pessoa')) {
      const quem = item.dataset['pessoa']
      if (quem !== undefined && pessoas.falando(quem)) item.dataset['falando'] = '1'
      else delete item.dataset['falando']
    }
    for (const linha of canais.atual.querySelectorAll<HTMLElement>('.canal-pessoa')) {
      const quem = linha.dataset['pessoa']
      // Eu apareço sob a chave própria do medidor, não sob o meu peerId: o
      // meu microfone é local e nunca chega pelo caminho de mídia recebida.
      const falando = quem !== undefined
        && pessoas.falando(linha.dataset['eu'] === '1' ? EU : quem)
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
          gente: montarDoCanal(c.quem, transporte.meuId(), pessoas.fonte()),
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
      canais.trocar(novosCanais)
    }
    acenderQuemFala()

    // A roda segue a mesma regra dos canais: só se refaz quando a composição
    // muda. Assistindo alguém ela vira faixa, e o modo entra na assinatura
    // porque muda o desenho inteiro.
    const gente = pessoas.participantes()
    const modo = atual.assistindo.length > 0 ? 'faixa' : 'grade'
    const assinaturaRoda = `${modo}|`
      + gente.map((p) => `${p.peerId}:${p.mudo}${p.semMicrofone}${p.selo ?? ''}`).join(',')
    if (assinaturaRoda !== assinaturaDaRoda) {
      assinaturaDaRoda = assinaturaRoda
      roda.trocar(renderizarRoda(gente, modo))
    }
  }

  function desenhar(): void {
    presencaLocal.liberarSeConectou()
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
    barra.trocar(novaBarra)

    const novoNaSala = renderizarSalaParada(
      sessao.estado(), sessao.meuId(), conectadosComigo())
    naSala.trocar(novoNaSala)

    desenharSalasSalvas()

    const novaNav = renderizarTrilho(tela, irPara, { mesaEspera: mesaEspera() })
    nav.trocar(novaNav)

    const novosControles =
      renderizarControlesCall(
        protocolo.estado(), acoesCall, midia.qualidade(), midia.tipoConteudo(),
        {
          apelidoDe: pessoas.apelidoDe, meuMicrofoneMudo: midia.microfoneMudo(),
          todosSilenciados: area.silenciados(),
          microfones: aparelhos.microfones(), microfoneAtual: midia.microfoneAtual(),
          semMicrofone: aparelhos.semMicrofone(),
          saidas: aparelhos.saidas(), saidaAtual: aparelhos.saidaAtual(),
        })
    controles.trocar(novosControles)

    const novoMixer = montarMixer()
    mixer.trocar(novoMixer)
    area.aplicarVolumes()
    desenharParticipantes()

    // A decisão do que o palco mostra mora em `sala/desenho.ts`, junto com o
    // porquê de cada regra. Aqui só se obedece.
    const mostrar = oQueOPalcoMostra({
      status: sessao.statusConexao(),
      tela,
      jogoEmAjuste,
      euNaCall: protocolo.estado().euNaCall,
      sozinho: conectadosComigo().length <= 1,
    })

    if (mostrar.tipo === 'conexao') {
      palco.replaceChildren(renderizarConexao(mostrar.status, relaysConectados()))
      if (mostrar.comTesteDeRede) palco.append(painelRede.desenhar(true))
      return
    }

    if (mostrar.tipo === 'mesa') {
      renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
      return
    }

    if (mostrar.tipo === 'jogos') {
      palco.replaceChildren(renderizarJogos({
        abrir: () => irPara('mesa'),
        // A engrenagem só existe para o anfitrião: mostrá-la a todos e barrar
        // no clique seria um botão que engana.
        ...(sessao.souHost() ? { ajustar: abrirFormato } : {}),
      }))
      return
    }

    if (mostrar.tipo === 'formato') {
      palco.replaceChildren(renderizarAjustesDoJogo(
        JOGOS.find((j) => j.chave === mostrar.jogo)?.nome ?? 'Formato',
        renderizarConfigPartida(dadosDoFormato(), (config) => {
          sessao.despachar({ tipo: 'configurar', config })
          // Lembrar aqui e não no motor: é escolha DESTA pessoa nesta máquina,
          // não estado da partida.
          lembrarFormato(config)
          desenhar()
        }),
        () => { jogoEmAjuste = null; desenhar() },
      ))
      return
    }

    if (mostrar.tipo === 'config') {
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

    // Daqui para baixo é a tela da sala, e SÓ ela atualiza este atributo —
    // como antes. Assistindo alguém, a roda cede o meio para a tela e vira
    // faixa: saber quem está falando importa MAIS com uma tela na frente.
    conteudo.dataset['assistindo'] =
      protocolo.estado().assistindo.length > 0 ? '1' : ''

    // Dentro de um canal o miolo são os rostos, e quem desenha a roda é
    // `desenharParticipantes` — aqui o palco fica de fora do caminho.
    if (mostrar.tipo === 'rostos') {
      palco.replaceChildren()
      return
    }

    palco.replaceChildren(renderizarConvite())
    if (mostrar.comTesteDeRede) palco.append(painelRede.desenhar(true))
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
  let encerrar: () => Promise<void> = () => Promise.resolve()

  /** Dentro da sala ele LISTA os servidores: aqui o número quer dizer algo. */
  const painelRede = criarPainelDeRede(() => desenhar())

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
    // ESPERA a saída terminar antes de reentrar. É o único caminho do app que
    // reentra no MESMO id, e sem a espera ele recebia de volta a sala que está
    // morrendo — `joinRoom` num id ainda registrado devolve a mesma sala
    // (`strategy.ts:213`), e o `leave` só desregistra depois de um envio e
    // mais 99 ms (`room.ts:162`).
    //
    // Medido com duas páginas, 2 de 2 em cada braço: sem esperar, os dois
    // lados ficam sozinhos e não se reencontram (85 s+, e os dois se declaram
    // anfitrião). Esperando o `leave`, o par volta em ~1,3 s e fica estável.
    //
    // Esperar o próprio `leave`, e não um número: a espera real fica em torno
    // de 200 ms, é menor que qualquer valor que eu chutaria, e acompanha
    // sozinha se a biblioteca mudar os 99 ms dela.
    //
    // `trocar de grupo` NÃO passa por aqui: lá o código é outro, não há
    // colisão, e esperar só deixaria mais lento o que já é o passo lento.
    void encerrar().then(() => entrarNaSala(app, apelido, codigo))
  }

  /**
   * O pulso da sala, criado aqui e não antes: o tique não pode começar a bater
   * sobre uma sala que ainda está sendo montada.
   */
  const sincronizacao = criarSincronizacao({
    estadoCall: () => protocolo.estado(),
    midia,
    area,
    vozes: monitorVoz,
    aoTique: (agora) => sessao.tique(agora),
    msAmostragemDeVoz: MS_AMOSTRAGEM,
    diagnosticoDeVoz: new URLSearchParams(location.search).get('diag') === 'voz',
  })

  encerrar = () => {
    sincronizacao.encerrar()
    try {
      navigator.mediaDevices.removeEventListener('devicechange', aoTrocarAparelho)
    } catch {
      // Mesmo motivo do registro: navegador sem `mediaDevices`.
    }
    // Tranca de vez: um desenho atrasado não pode reabrir o anúncio de um
    // grupo que a pessoa acabou de deixar. O porquê está em presenca-local.ts.
    presencaLocal.encerrar()
    midia.desligarMicrofone()
    midia.pararTela()
    // A promessa vem daqui: é a saída das três salas do Trystero.
    return sessao.encerrar()
  }

  window.addEventListener('beforeunload', () => void sessao.encerrar())
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
    const painelRede = criarPainelDeRede(() => desenharHome())
    let identidade: Identidade | null = null

    /** Recarrega o painel depois de qualquer mudança de identidade. */
    const adotar = (nova: Identidade): void => {
      identidade = nova
      desenharHome()
    }

    const acoesIdentidade = criarAcoesIdentidade(() => identidade, adotar)

    identidadeAtual().then(adotar).catch((erro: unknown) => {
      // Cofre indisponível (janela anônima, política do navegador): a home
      // continua servindo para entrar em sala, só sem identidade.
      console.warn('não deu para carregar a identidade', erro)
    })

    /**
     * Quem está online em cada grupo salvo, já na tela inicial.
     *
     * Aqui pode começar na hora: não há sala se formando para competir com
     * ela. As aberturas continuam espaçadas mesmo assim — são três redes por
     * grupo, e abrir todas de uma vez trava a página de quem tem vários.
     */
    const presencaHome = observarGrupos(
      grupos().map((g) => g.codigo), abrirSalaDeFundo, PAUSA_ENTRE_SALAS_MS)
    presencaHome.aoMudar(() => desenharHome())

    /**
     * Sair da tela inicial para uma sala.
     *
     * A observação da home é encerrada, e **sem esperar**: as salas de
     * presença têm id próprio (`codigo#presenca`), então nenhuma delas pode
     * ser devolvida no lugar da sala de verdade. Esperar aqui foi o que
     * deixou a entrada lenta nas tentativas anteriores, e não protege de nada
     * neste desenho.
     */
    const irParaSala = (apelido: string, cod: string): void => {
      presencaHome.encerrar()
      entrarNaSala(app, apelido, cod)
    }

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

    const desenharHome = (): void => {
      app.replaceChildren(renderizarHome(
        (apelido, codigo) => irParaSala(apelido, codigo),
        // Sem a lista de servidores, de propósito. Aqui ninguém entrou em sala
        // ainda, então nenhum socket está aberto e a contagem sairia "0 de 20"
        // — que lê como falha catastrófica para quem acabou de abrir a página.
        // A lista só quer dizer alguma coisa DENTRO da sala. O teste de NAT em
        // si funciona sozinho: ele fala com os servidores STUN direto.
        {
          // Sem a lista de servidores, de propósito: aqui nenhum socket está
          // aberto, e "0 de 20" lê como falha catastrófica.
          testeRede: painelRede.desenhar(false),
          identidade: renderizarIdentidade(identidade, acoesIdentidade),
          grupos: renderizarFaixaGrupos(grupos(), entrarNoGrupo, (cod) => {
            removerGrupo(cod)
            // Grupo removido deixa de ser observado na hora: continuar
            // segurando a sala dele seria pagar por uma contagem que ninguém
            // mais vê.
            presencaHome.sincronizar(grupos().map((g) => g.codigo))
            desenharHome()
          }, presencaHome.quantos),
        },
      ))
    }

    desenharHome()
  } catch {
    app.textContent = MENSAGEM_ERRO_INICIAL
  }
}

const raiz = document.querySelector<HTMLDivElement>('#app')
if (raiz) iniciarApp(raiz)
