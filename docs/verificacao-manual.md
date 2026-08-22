# Verificação manual — pendente

Tudo neste projeto foi verificado por testes automatizados (539, rodando sem
navegador) e por revisão de código. **Nada foi verificado num navegador de
verdade.** Os itens abaixo só podem ser conferidos por uma pessoa.

Para rodar: `npm run dev`, e abra **três abas** — uma delas anônima, para
simular um navegador separado.

## Partida

- [ ] Três jogadores em abas separadas completam uma rodada
- [ ] Dobrar debita a aposta extra e entrega exatamente uma carta
- [ ] Dividir cria duas mãos, jogadas em sequência, e **as duas ficam visíveis**
- [ ] Split de Ases recebe uma carta por mão e encerra
- [ ] Seguro só aparece quando o dealer mostra Ás, e a fase termina assim que
      todos respondem (sem esperar os 30s)
- [ ] Blackjack natural paga 3:2
- [ ] As cartas de quem parou continuam na tela até o fim da rodada, com o
      resultado
- [ ] O dealer compra uma carta por vez, com pausa visível entre elas
- [ ] A barra de tempo do turno anda de verdade
- [ ] O anfitrião vê "Iniciar partida" e os outros veem o aviso de espera
- [ ] Quem quebra vira espectador e não consegue sentar de novo
- [ ] Alguém chegando a 1500 encerra a partida com placar
- [ ] "Nova partida" devolve todos à sala de espera com 1000 fichas
- [ ] O botão "?" explica Dobrar, Dividir e Seguro

## Sala

- [ ] Ao entrar, a tela mostra a sala com quem está — não a mesa
- [ ] A navegação alterna entre Sala e Mesa, e a mesa em andamento continua
      valendo quando você volta para ela
- [ ] Quem está na sala aparece na lista mesmo sem ter sentado
- [ ] Quem fecha a aba aparece marcado como caído antes de sumir
- [ ] Abrir a mesa não arrasta os outros junto — cada um escolhe o que vê
- [ ] Com a partida rolando e você na sala, o botão "Mesa" ganha uma marca
      quando a mesa espera por você — na aposta, no seguro e na sua vez
- [ ] A marca some assim que você responde, e não aparece com a mesa aberta
- [ ] Com "reduzir movimento" ligado, a marca aparece sem pulsar

## Call

Precisa de **duas pessoas em máquinas diferentes** — abas na mesma máquina não
exercitam o caminho real de rede.

- [ ] Entrar na call nas duas pontas e ouvir um ao outro
- [ ] Estar na sala **sem** entrar na call não faz receber áudio de ninguém
- [ ] Sair da call apaga o indicador de microfone do navegador
- [ ] Compartilhar tela e conferir que **nada é codificado** até alguém clicar
      em Assistir — o aviso "ninguém está assistindo" aparece
- [ ] Clicar em Assistir mostra a tela do outro
- [ ] Parar de assistir faz o aviso voltar do outro lado
- [ ] Parar pela barra nativa do Chrome atualiza a interface corretamente
- [ ] Em `chrome://webrtc-internals`, confirmar codec **H264** e
      `encoderImplementation` citando MediaFoundation ou Quick Sync
- [ ] Fechar a aba de quem compartilhava limpa o vídeo do outro lado
- [ ] O anfitrião cair no meio da call não interrompe a conversa
- [ ] Jogar uma rodada de blackjack com a call aberta, falando ao mesmo tempo
- [ ] **Sair da call e entrar de novo, dos dois lados, e continuar se ouvindo**
      (era o bug do stream republicado com o mesmo objeto)
- [ ] "Expandir" aumenta a tela recebida sem cobrir a mesa
- [ ] "Janela flutuante" abre o PiP do sistema, que dá para mover e
      redimensionar fora do navegador
- [ ] Trocar a qualidade de 720p para 1080p muda a nitidez sem cortar o vídeo
- [ ] **Assistir, parar de assistir e assistir de novo** — a tela volta sem
      quem compartilha precisar reiniciar nada
- [ ] "Tela cheia" ocupa o monitor inteiro e a barra de controles continua lá
- [ ] Trocar "Jogo / vídeo" para "Código / texto" deixa letra pequena legível
- [ ] Compartilhar uma aba com som: quem assiste ouve, e o botão silencia
- [ ] Com fone nos dois lados, o som da tela não gera eco
- [ ] **Parar de assistir uma tela com som cala o som junto** (era o bug do
      elemento escondido que continuava tocando)
- [ ] **Sair da call cala tudo**: nenhuma tela e nenhum áudio continuam
- [ ] **Com 3 ou 4 pessoas**, entrar alguém novo não faz ninguém sumir do
      áudio de quem já estava
- [ ] Com duas pessoas compartilhando, os botões dizem o nome de cada uma
- [ ] "Mutar meu microfone" cala você para todos, e o estado sobrevive a sair
      e voltar da call
- [ ] "Silenciar todos" cala vozes e telas de uma vez
- [ ] O som de um jogo compartilhado não chega abafado nem chiado
- [ ] Com dois microfones no PC, o seletor aparece e trocar **não corta a
      conversa** de quem está ouvindo
- [ ] A escolha do microfone sobrevive a recarregar a página
- [ ] Plugar ou arrancar um fone no meio da call atualiza a lista sozinho
- [ ] No celular, o seletor deixa escolher entre os microfones do aparelho
- [ ] Trocar de microfone estando mudo **não** reabre o microfone
- [ ] **Com 4 pessoas**, todo mundo ouve todo mundo — inclusive quem entrou na
      call por último
- [ ] Quem está na call **aparece na lista da sala**, sem exceção
- [ ] Alguém que entra atrasado aparece sozinho em alguns segundos, sem
      ninguém precisar recarregar

## Rede

- [ ] Fechar a aba do anfitrião não encerra a partida — outro jogador assume e
      a mão em andamento continua
- [ ] Depois da migração, a barra do topo passa a indicar o novo anfitrião
- [ ] Recarregar a aba de um jogador dentro de 60s devolve cadeira e fichas
- [ ] Passados 60s sem voltar, ele some da mesa e a cadeira é liberada
- [ ] Jogador inativo é pulado em 30s e vira espectador em duas rodadas

> **O item mais importante da lista é a migração de anfitrião com três abas.**
> Toda a lógica de eleição e migração foi validada contra uma rede falsa em
> memória. Ela imita o comportamento do Trystero de perto, inclusive a demora
> para os peers aparecerem — mas continua sendo uma imitação. Se algo tiver
> escapado, é aqui.

## Chat

- [ ] Mensagem enviada de uma aba aparece nas outras, com o apelido de quem
      mandou — e na própria aba de quem enviou também
- [ ] Com o painel fechado, o gatilho mostra o número de mensagens não lidas, e
      abrir zera a contagem
- [ ] Digitar uma mensagem longa e **não** enviar: o texto continua no campo
      enquanto a mesa se movimenta (durante a compra do dealer, que redesenha a
      cada 700ms) — este é o ponto que a arquitetura do painel existe para
      garantir
- [ ] O log rola sozinho para a mensagem mais nova
- [ ] Uma mensagem de 200 caracteres sem espaço nenhum não estica o painel para
      fora da tela
- [ ] No celular, o painel aberto não cobre a mesa a ponto de impedir de jogar,
      e o teclado não esconde o campo

## Aparência

- [ ] A sala parece um lugar: feltro sob uma luz quente, não um fundo preto
- [ ] Em tela larga, conversa e volumes ficam na coluna da direita, sem cobrir
      a mesa
- [ ] Em tela estreita, tudo empilha e a conversa volta a ser gaveta
- [ ] As fontes carregam (Bodoni no nome da sala, Archivo no resto); se a rede
      bloquear o Google Fonts, o texto continua legível nas fontes de sistema
- [ ] O mixer aparece só com alguém na call, e mexer num controle muda o volume
      **daquela** pessoa sem afetar as outras
- [ ] Baixar o volume de uma tela não baixa a voz da mesma pessoa

- [ ] A grade reflui de 3 para 2 colunas em tela estreita
- [ ] Com "reduzir movimento" ligado no sistema operacional, as cartas aparecem
      no lugar certo (sem voo) e a barra de tempo mostra uma posição estática
      correta em vez de ficar cheia

## Publicação

- [ ] O site publicado carrega em `https://ascendance-hub.github.io/Topaz/`

Para publicar: fazer merge na `main` e, em **Settings → Pages**, definir
**Source: GitHub Actions**. O workflow já existe e roda os testes antes do
build.

---

## Limitações conhecidas

Não são defeitos a corrigir — são consequências assumidas do desenho, listadas
para você saber o que esperar.

**Se duas mesas se formarem separadamente e depois se encontrarem**, uma delas
vence (a que tiver mais jogo) e a outra é descartada com as fichas. É raro:
exige a conexão demorar mais de 2,5s *e* alguém ter entrado no lado perdedor.

**Se dois jogadores nunca conseguirem se enxergar entre si mas ambos enxergarem
um terceiro**, esse terceiro pode ver a mesa alternando entre as duas — cada
troca é para uma mesa com mais jogo que a anterior, então não gira em círculo,
mas pisca enquanto as duas avançam. Isso é uma divisão que não tem como ser
resolvida sem os dois primeiros se conectarem; nenhuma escolha nossa conserta.

**Se o relay de descoberta estiver totalmente inacessível**, cada jogador vê uma
mesa normal com "aguardando jogadores" — indistinguível de uma sala vazia. O
aviso explícito de falha só aparece quando existe um peer visível mas silencioso.

**Se vários jogadores entrarem ao longo de mais de 15 segundos**, a tela pode
mostrar "não foi possível conectar" mesmo com a sala ainda se formando. Corrige
sozinho quando as conexões assentam.

**Criar uma sala sozinho custa até 2,5 segundos** numa tela de "conectando".
É o preço de não decidir quem manda a partir de uma lista de peers vazia.

**Entrar numa sala expõe o seu IP aos outros participantes.** Isso é inerente ao
WebRTC, não uma falha desta implementação. O código de sala de 8 caracteres
(gerado com `crypto.getRandomValues`, ~8,5 × 10¹¹ combinações) é o que impede um
estranho de entrar. Mande o link só para quem você quer na mesa.

## Limitações da partida com eliminação

Vieram com as regras de eliminação e fim de partida. Nenhuma é defeito a
corrigir; são consequências assumidas, listadas para você não estranhar.

**Se todo mundo que estava jogando fechar a aba**, a partida termina em vez de
congelar — mas o placar final aparece vazio, porque ele só lista quem estava na
partida, e todos foram embora. Quem sobrou vê "Fim de partida", uma mesa vazia e
um botão de nova partida funcionando.

**Se o jogador da vez sumir no meio da mão** e mais ninguém tiver cartas para
jogar, a rodada pula direto para o dealer. Quem estava sentado mas ainda não
tinha apostado não é chamado de volta naquela rodada.

**Quem levanta da mesa bem no fim de uma rodada, já sem fichas para apostar**,
recebe a recusa com a mensagem "Partida em andamento" em vez de uma que fale de
fichas. O botão é recusado corretamente; só o motivo exibido é impreciso.

**A mesa pode ficar parada na tela de apostas** se um participante continuar
conectado mas nunca voltar a sentar. Isso é proposital — ele tem direito de
voltar — e se resolve sozinho cerca de um minuto depois de ele fechar a aba.

**A nova disposição da sala de espera, a tela de fim e o painel de ajuda nunca
foram vistos num navegador de verdade**, só em DOM de teste.

## Limitações do chat

Consequências assumidas de manter a conversa fora do estado do jogo.

**Não há histórico.** Quem entra depois só vê o que for dito dali em diante, e
recarregar a página apaga a conversa. Foi escolha explícita: guardar histórico
significaria replicá-lo no estado do host, fazê-lo sobreviver à migração de
anfitrião e resolvê-lo no encontro de duas mesas — custo alto para papo de mesa.

**A ordem das mensagens pode diferir entre navegadores.** Cada um mostra na
ordem em que recebeu, e não há relógio comum. Duas falas quase simultâneas podem
aparecer trocadas em telas diferentes.

**Uma mensagem enviada para alguém que ainda não completou a conexão se perde.**
Não há reenvio: o canal é o mesmo caminho direto que a partida usa, sem fila.

**Não dá para silenciar nem bloquear ninguém**, e não há limite de frequência —
nada impede alguém de inundar o painel. Sem servidor não existe onde moderar; a
proteção é o link só ir para quem você conhece.

**Quem falar antes de o primeiro snapshot do host chegar aparece como
"Alguém"**, porque o apelido vem do estado da partida e ele ainda não está lá.
Dura o tempo de um round-trip.

**O painel nunca foi visto num navegador de verdade**, só em DOM de teste.

## Decisões em aberto

Coisas deliberadamente não implementadas, para você decidir:

- **Apostas** são 25, 100 ou 500 — valores fixos, não combináveis. Não dá para
  apostar 250.
- **Sem *dealer peek***: com Ás ou dez à mostra, os jogadores jogam a mão inteira
  antes de o dealer revelar um blackjack natural, e perdem também o que
  dobraram ou dividiram.
- **Espectadores não aparecem** na mesa para os outros jogadores — inclusive
  quem foi eliminado, que fica invisível para quem continua jogando.
- **Faltam duas animações** do spec: a virada da carta oculta do dealer e o
  contador de fichas interpolado.
