import { renderizarLobby } from './lobby'
import { haCodigoNaUrl } from '../codigo'

/**
 * A página inicial.
 *
 * Antes daqui, a primeira tela era o cartão de entrar e nada mais: quem
 * recebia um link não descobria o que o site é, e quem já usava não via em
 * lugar nenhum o que ele sabe fazer.
 *
 * A ordem é deliberada. **A ação vem primeiro** — a apresentação é para quem
 * chegou agora, mas o trabalho da página é deixar entrar, e quem já sabe o que
 * quer não deve rolar para achar o botão. Explicação depois, para quem
 * precisar.
 *
 * A tese da página é "sem ninguém no meio". É a única coisa que este projeto
 * tem e um aplicativo de call comum não tem, e é literalmente verdade — não é
 * promessa de política de privacidade, é topologia.
 */

/** Um bloco de texto com título, que é o formato de quase toda a página. */
function secao(classe: string, titulo: string): HTMLElement {
  const el = document.createElement('section')
  el.className = classe
  const h = document.createElement('h2')
  h.className = 'home-titulo'
  h.textContent = titulo
  el.append(h)
  return el
}

function paragrafo(texto: string, classe = 'home-texto'): HTMLElement {
  const p = document.createElement('p')
  p.className = classe
  p.textContent = texto
  return p
}

function cartaoRecurso(titulo: string, texto: string): HTMLElement {
  const cartao = document.createElement('article')
  cartao.className = 'home-recurso'
  const h = document.createElement('h3')
  h.textContent = titulo
  cartao.append(h, paragrafo(texto))
  return cartao
}

export interface ExtrasHome {
  /** O painel de teste de rede, montado por quem tem o estado dele. */
  testeRede?: HTMLElement
  /** O painel da identidade. Vem pronto porque depende de leitura assíncrona
   *  do cofre, que esta camada não deve conhecer. */
  identidade?: HTMLElement
  /** A faixa de grupos salvos. Vazia para quem chega pela primeira vez. */
  grupos?: HTMLElement
}

export function renderizarHome(
  aoEntrar: (apelido: string, codigo: string) => void,
  extras: ExtrasHome = {},
): HTMLElement {
  const home = document.createElement('div')
  home.className = 'home'
  // Quem chegou por um convite não veio ler a apresentação: veio entrar. O
  // herói inteiro empurraria o cartão para fora da tela, e um clique viraria
  // "rolar até achar". Vale também para link truncado — aí é o aviso que
  // precisa aparecer sem rolagem.
  if (haCodigoNaUrl(location.hash)) home.dataset['convite'] = '1'

  // Quem já tem grupos salvos vê os grupos PRIMEIRO, e a apresentação vira
  // material de consulta. Quem chega pela primeira vez vê o contrário. Saber
  // qual é o caso custa uma leitura do armazenamento, então não há razão para
  // mostrar a mesma coisa às duas pessoas.
  if (extras.grupos?.hasChildNodes()) {
    home.dataset['comGrupos'] = '1'
    home.append(extras.grupos)
  }

  // ---- Herói -------------------------------------------------------------
  const heroi = document.createElement('header')
  heroi.className = 'home-heroi'

  const marca = document.createElement('div')
  marca.className = 'home-marca'
  marca.textContent = 'TOPAZ'

  const chamada = document.createElement('h1')
  chamada.className = 'home-chamada'
  chamada.textContent = 'Sem ninguém no meio.'

  heroi.append(marca, chamada, paragrafo(
    'A voz e a tela vão do seu navegador direto para o de quem está com você. '
    + 'Nenhum servidor guarda, grava ou escuta — porque não existe servidor.',
    'home-subchamada',
  ))

  // A assinatura da página é a própria topologia: dois pontos ligados por uma
  // linha, sem nada no meio. Um diagrama de serviço comum teria um terceiro
  // ponto ali — a ausência dele É o argumento, e desenhá-la diz mais rápido
  // do que qualquer frase. Decorativa: o texto acima já disse tudo.
  const topologia = document.createElement('div')
  topologia.className = 'home-topologia'
  topologia.setAttribute('aria-hidden', 'true')
  for (const papel of ['ponto', 'linha', 'ponto']) {
    const parte = document.createElement('span')
    parte.className = `home-${papel}`
    topologia.append(parte)
  }
  heroi.append(topologia)

  home.append(heroi)

  // ---- Ação: é para isto que a página existe ------------------------------
  const acao = document.createElement('section')
  acao.className = 'home-acao'
  acao.append(renderizarLobby(aoEntrar))
  // A identidade fica junto do cartão de entrar, não numa seção lá embaixo:
  // quando ela é nova, o segredo precisa ser visto AGORA — é a única vez que
  // ele existe para ser mostrado.
  if (extras.identidade) acao.append(extras.identidade)
  home.append(acao)

  // ---- O que dá para fazer ------------------------------------------------
  const recursos = secao('home-recursos', 'O que dá para fazer')
  const grade = document.createElement('div')
  grade.className = 'home-grade'
  grade.append(
    cartaoRecurso(
      'Conversar e mostrar a tela',
      'Voz com cancelamento de ruído e tela em 1080p com o som do sistema '
      + 'junto. Escolha de microfone e de saída, volume separado por pessoa, e '
      + 'a tela de alguém em janela flutuante enquanto você faz outra coisa.',
    ),
    cartaoRecurso(
      'Jogar na mesma sala',
      'Blackjack com até sete pessoas na mesa, e um anfitrião que passa '
      + 'sozinho para outra pessoa se quem estava conduzindo cair. O jogo e a '
      + 'conversa são independentes: dá para jogar calado e conversar sem jogar.',
    ),
  )
  recursos.append(grade)
  home.append(recursos)

  // ---- O que está protegido ----------------------------------------------
  //
  // Diz o que É protegido e a única coisa sobre a qual a pessoa pode agir.
  // NÃO lista o que não conseguimos proteger: numa página pública isso é
  // entregar mapa de superfície de ataque, e uma vitrine não é lugar de modelo
  // de ameaça. O levantamento honesto e completo vive em
  // `docs/diario-de-bordo.md`, que é documentação de engenharia.
  const seguranca = secao('home-seguranca', 'O que está protegido')
  seguranca.append(paragrafo(
    'Voz, tela e mensagens são cifradas de ponta a ponta pelo próprio WebRTC. '
    + 'Cada dupla tem a própria sessão, e como não há servidor no caminho, não '
    + 'existe intermediário que poderia decifrar e escolhe não fazer.',
  ))
  seguranca.append(paragrafo(
    'O código da sala é a chave dela: quem tem o link, entra. Trate como senha.',
    'home-destaque',
  ))
  home.append(seguranca)

  // ---- Rede, só se houver o painel ---------------------------------------
  if (extras.testeRede) {
    const rede = secao('home-rede', 'Se alguém não conseguir entrar')
    rede.append(paragrafo(
      'Os navegadores se encontram por servidores públicos de busca — três '
      + 'redes diferentes ao mesmo tempo, porque antivírus costuma bloquear os '
      + 'endereços de uma delas e raramente os das três. Esses servidores só '
      + 'apresentam as pessoas: nada do que vocês falam passa por eles.',
    ))
    rede.append(extras.testeRede)
    home.append(rede)
  }

  return home
}
