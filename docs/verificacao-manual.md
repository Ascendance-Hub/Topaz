# Verificação manual — pendente

Tudo neste projeto foi verificado por testes automatizados (585, rodando sem
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

## Três redes de descoberta

O site procura as pessoas por **nostr, MQTT e BitTorrent ao mesmo tempo**. São
infraestruturas diferentes: antivírus que bloqueia os endereços de uma
raramente bloqueia as três.

- [ ] **Com o antivírus LIGADO**, duas pessoas que não se achavam agora se acham
- [ ] Ninguém aparece duplicado na lista da sala
- [ ] Uma mensagem no chat chega **uma vez**, não duas ou três
- [ ] Sentar e apostar não acontecem em dobro
- [ ] A tela compartilhada aparece uma vez só para quem assiste

## Código de sala novo (16 caracteres)

O código passou de 8 para 16 caracteres, mostrado agrupado
(`K7X2-QW9F-M3PR-TVN4`). **Links antigos param de funcionar** — eles têm 8
caracteres e agora são recusados na entrada. É esperado, e falha de forma
visível (o aviso de convite inválido), nunca em silêncio.

⚠️ Todo mundo precisa estar na **mesma versão**. Quem estiver com a página
antiga aberta não vai conseguir entrar numa sala criada na versão nova.
Recarregar resolve.

- [ ] Criar sala: a barra de endereços mostra `#sala=XXXX-XXXX-XXXX-XXXX`
- [ ] O botão "Copiar link" entrega a mesma grafia que está na barra
- [ ] Abrir o link copiado noutra aba entra na sala certa
- [ ] Colar o código **com hífens** no campo "Código da sala" funciona
- [ ] Colar **sem hífens** também funciona
- [ ] Um link antigo, de 8 caracteres, mostra o aviso de convite inválido
- [ ] A barra da sala mostra o código agrupado, igual ao link

## Fontes e política de conteúdo

- [ ] A página abre com a tipografia certa (Bodoni nos títulos, Archivo no
      corpo) — sem cair para Georgia/system-ui
- [ ] O console **não** tem erro de CSP ao entrar numa sala
- [ ] O console **não** tem erro de CSP ao entrar na call nem ao compartilhar
      tela (é onde o worker do MQTT e a mídia local aparecem)
- [ ] Na aba Network do navegador, **nenhuma requisição sai para
      `fonts.googleapis.com` ou `fonts.gstatic.com`**

## Microfone negado e saída de áudio

Escritos em 2026-08-24, ainda não vistos com gente de verdade.

**Entrar só ouvindo.** Recarregue e clique em "Entrar na call" negando a
permissão do microfone (ou desligue o microfone no sistema antes).

- [ ] A pessoa **entra na call** — aparece "Sair da call", não fica no "Entrar"
- [ ] Um aviso em vermelho diz o motivo e cita o cadeado da barra de endereços
- [ ] O botão "Mutar meu microfone" **não** aparece — não há o que mutar
- [ ] Ela **ouve** quem está falando
- [ ] Libere o microfone no cadeado e clique em "Ativar microfone": ela passa a
      falar, e o aviso some sem precisar recarregar
- [ ] Sair e entrar de novo com a permissão concedida não deixa o aviso preso

**Saída de áudio.** Precisa de mais de uma saída (fone + alto-falante).

- [ ] O seletor aparece com dois ou mais aparelhos, e **não** aparece com um só
- [ ] Trocar move a voz das pessoas para o aparelho escolhido
- [ ] Trocar move **também o som da tela compartilhada**, não só a voz
- [ ] Quem entra na call depois já sai pelo aparelho escolhido
- [ ] A escolha sobrevive a recarregar a página
- [ ] Em Safari (ou Firefox antigo) o seletor simplesmente não aparece

## Home

- [ ] Abrir o site sem link mostra a apresentação, com o cartão de entrar
      visível sem rolar
- [ ] **Não** aparece "Servidores de descoberta: 0 de 20" na home (fora da sala
      não há socket aberto, e essa contagem leria como falha total)
- [ ] "Testar minha rede" funciona na home, antes de entrar em qualquer sala
- [ ] Abrir um link de convite encolhe o herói: o botão "Entrar na sala"
      aparece sem rolar
- [ ] Um link truncado mostra o aviso sem precisar rolar
- [ ] Só existe um `<h1>` na página (o título "Topaz" do cartão fica escondido)
- [ ] Em tela de celular, nada estoura para os lados

## Quem está falando

⚠️ **Os limiares nasceram estimados** (`LIMIAR_LIGA = 0.04`,
`LIMIAR_DESLIGA = 0.02`). Esta é a parte que precisa de ajuste com voz real,
em microfones diferentes.

**Como medir em vez de adivinhar.** Acrescente `?diag=voz` à URL, entre na
call e abra o console:

```
https://ascendance-hub.github.io/Topaz/?diag=voz#sala=XXXX-XXXX-XXXX-XXXX
```

Sai uma linha por segundo com o nível instantâneo e o **pico** desde a linha
anterior. O pico é o que importa: falar é intermitente, e uma amostra tirada no
meio de uma sílaba fechada mede silêncio.

| O que aparece | O que significa |
|---|---|
| `ninguém sendo medido` | o microfone não chegou ao analisador — defeito de encanamento |
| `agora=0.0000 pico=0.0000` sempre | o contexto de áudio não está recebendo nada |
| pico bem abaixo de 0,04 ao falar | **o limiar está alto demais** — é só trocar o número |
| `FALANDO` aparece e o anel não muda | o desenho não atualiza |

A sonda fica desligada sem o parâmetro.

- [ ] Falar acende o anel em volta do **seu** círculo, e ele **pulsa** —
      é o pulso que o distingue das outras bordas douradas da tela
      ("sou eu" na lista da sala, "é sua vez" na mesa, aba atual na navegação)
- [ ] O anel do amigo acende quando ele fala, e não quando você fala
- [ ] O anel **não pisca** nas pausas entre palavras de uma frase normal
- [ ] Ficar calado apaga o anel em menos de um segundo
- [ ] Ventilador, ar-condicionado ou teclado **não** acendem o anel
- [ ] Falar baixinho ainda acende (se não acender, `LIMIAR_LIGA` está alto)
- [ ] Silenciar a pessoa no mixer **não** apaga o anel dela — quem silenciou
      precisa saber que ela está falando
- [ ] Mutar o próprio microfone apaga o seu anel
- [ ] Quem sai da call some da fileira e não deixa anel aceso
- [ ] Sair e voltar da call faz o anel dela voltar a funcionar
- [ ] A voz **não** sai dobrada (o analisador não pode estar ligado à saída)

## Foto de perfil

- [ ] "Escolher foto" abre o seletor de arquivos e a prévia mostra a foto
- [ ] A prévia fica **redonda e sem achatar** — teste com uma foto bem larga
      e com uma bem alta
- [ ] "Tirar foto" volta para a inicial do apelido, e só aparece com foto
- [ ] A foto sobrevive a recarregar a página
- [ ] O amigo vê a sua foto no círculo dele, e você vê a dele
- [ ] Quem entra **depois** também recebe a sua foto, sem você fazer nada
- [ ] O anel de quem fala continua acendendo em volta da foto

**Segurança** — o ponto que motivou o desenho:

- [ ] Renomear um `.exe` para `.jpg` e escolher: aparece a mensagem de erro, e
      **nada é enviado**
- [ ] Escolher um PDF ou um `.txt`: mesma mensagem, sem quebrar a página
- [ ] Na aba Network do navegador, **nenhuma requisição sai** por causa de
      foto — ela viaja como `data:` pela conexão P2P

## Assistir a própria tela

- [ ] Ao compartilhar, aparece uma prévia pequena marcada "Sua tela"
- [ ] A prévia é **muda** — não há eco nem microfonia, mesmo compartilhando
      uma aba com som
- [ ] Parar de compartilhar faz a prévia sumir
- [ ] Com **ninguém assistindo**, o aviso "ninguém está assistindo" continua
      aparecendo — ver a própria tela não pode contar como espectador
- [ ] Compartilhar a janela do navegador mostra o efeito de espelho infinito;
      isso é esperado

## Identidade

⚠️ **O segredo aparece uma vez só.** Copie antes de fechar a página — não há
como mostrá-lo de novo, porque a chave guardada é não extraível de propósito.

- [ ] Primeira visita (ou aba anônima): aparece "Guarde o seu ID" com o segredo
- [ ] "Copiar" copia, e o texto também dá para selecionar à mão
- [ ] "Já guardei" some com o painel e deixa só o selo curto
- [ ] Recarregar a página mantém **o mesmo selo** e **não** mostra o segredo
- [ ] Colar o segredo em "Entrar com este ID" noutro navegador dá **o mesmo
      selo** — é o "logar noutro dispositivo"
- [ ] Colar um ID pela metade mostra erro e **não** apaga a identidade atual
- [ ] "Sair desta máquina" cria uma identidade nova; colar o segredo antigo
      traz a anterior de volta

**Na sala, com um amigo:**

- [ ] O selo aparece embaixo do nome dele na fileira da call
- [ ] O selo que você vê para ele é **o mesmo** que ele vê no próprio painel
- [ ] Nenhum selo aparece antes de a prova fechar

## Barra lateral e Ajustes

- [ ] O trilho mostra **Sala, Jogos e Ajustes**; o botão "Mesa" não existe mais
- [ ] "Jogos" abre a galeria, e o cartão do Blackjack abre a mesa
- [ ] Com a mesa aberta, "Jogos" continua aceso — é por onde se volta
- [ ] Os cartões "em breve" **não** são clicáveis
- [ ] A bolinha de "a mesa espera por você" aparece em Jogos, e some quando a
      mesa está na tela
- [ ] Em Ajustes, trocar o apelido muda o nome que os outros veem, **sem
      recarregar** e sem perder cadeira nem fichas
- [ ] Em Ajustes, trocar a foto atualiza o círculo na fileira da call
- [ ] Em tela larga o trilho é uma coluna à esquerda; em tela estreita vira
      faixa horizontal, sem estourar
- [ ] Numa tela **grande** (1440px ou mais), os três itens do trilho ficam
      juntos no topo, do tamanho do próprio texto — não espalhados pela altura
- [ ] Numa tela grande com a sala vazia, o miolo fica **centrado**, não colado
      no topo com um vão de feltro embaixo
- [ ] Com a mesa aberta (conteúdo alto), o topo **não** fica cortado e a
      rolagem alcança tudo

## Grupos

- [ ] Em Ajustes, "Salvar grupo" com um nome faz a sala aparecer na tela inicial
- [ ] Salvar sem nome usa o código como rótulo
- [ ] Salvar a mesma sala de novo **renomeia**, não duplica
- [ ] O cartão na tela inicial entra na sala num clique, sem pedir apelido de novo
- [ ] O × tira o atalho e **não** derruba ninguém da sala
- [ ] Os grupos sobrevivem a recarregar
- [ ] Com grupos salvos, eles aparecem **acima** da apresentação
- [ ] Sem grupos, a tela inicial é a apresentação de sempre

⚠️ Grupo é um atalho **por navegador**. Noutro computador a lista começa vazia
— é o mesmo preço da foto e da identidade, e a interface diz isso.

## Formato da partida

O formato saiu de Ajustes e mora na aba **Jogos**, na engrenagem do cartão do
jogo — cada jogo terá o seu.

- [ ] A engrenagem aparece no cartão do Blackjack **só para o anfitrião**
- [ ] Clicar nela abre o formato, com "← Jogos" para voltar
- [ ] Ajustes **não** tem mais a seção "A partida"
- [ ] O anfitrião vê os quatro campos editáveis
- [ ] Quem **não** é anfitrião vê os mesmos valores, **legíveis** e travados,
      com o motivo escrito
- [ ] Com a partida em andamento, nem o anfitrião edita — e a tela diz por quê
- [ ] Marcar "Jogar até sobrar um" apaga o campo de alvo
- [ ] Salvar com "até sobrar um" faz a partida seguir mesmo com alguém muito à
      frente; ela só acaba quando sobra um
- [ ] Com a **mesa parada**, mudar as fichas iniciais muda as fichas de todo
      mundo na hora — e a partida começa com o valor novo
- [ ] Com a partida **encerrada**, mudar as fichas **não** mexe no placar; o
      valor novo entra em "Nova partida"
- [ ] Quem entra depois recebe as fichas novas
- [ ] Baixar a aposta máxima para 300 troca os botões para 25 / 100 / 300 —
      nenhum botão de 500 sobra na tela
- [ ] Subir a aposta máxima para 800 oferece um botão de 800
- [ ] Todo botão de aposta que aparece **funciona** ao ser clicado
- [ ] Ao terminar uma partida, dá para ajustar o formato **sem recarregar**
- [ ] Mudar o tempo de jogada muda o ritmo da barra de prazo na mesa
- [ ] O amigo vê a mudança sem recarregar

**O defeito que isto conserta:**

- [ ] Com o padrão novo (alvo 2500), apostar 500 e ganhar a primeira mão
      **não** encerra mais a partida

## Canais de voz

Precisa de duas pessoas (ou duas abas com fones, para não haver microfonia).

- [ ] Fora da call **não** aparece lista de canais
- [ ] Os canais aparecem **antes de você entrar na call** — basta alguém estar
      num deles
- [ ] Fora da call, nenhum canal aparece aceso
- [ ] Clicar num canal fora da call **entra na call ali**, não no principal
- [ ] Trocando de canal, você deixa de ouvir quem ficou no outro — teste com
      duas máquinas suas, falando numa e ouvindo na outra
- [ ] Voltando ao canal, o som volta na hora
- [ ] Os canais estão na **coluna da esquerda**, não no rodapé
- [ ] Cada canal lista **quem** está nele, com foto e nome
- [ ] Dá para ver quem está num canal em que você NÃO está
- [ ] O anel acende no nome de quem fala, também na coluna
- [ ] Suas salas salvas aparecem no topo da coluna, e clicar troca de sala
- [ ] A sala em que você está fica marcada entre elas
- [ ] Na call aparece **só o canal em que há gente**, mais o botão "+"
- [ ] O "+" abre um canal novo e leva você para ele
- [ ] Quando o último sai de um canal, ele **some sozinho** da fileira
- [ ] Um canal esvaziado no meio não faz os outros trocarem de posição
- [ ] Dá para ter tantos canais quanta gente houver neles
- [ ] Você e o amigo veem exatamente a mesma lista
- [ ] O canal em que você está fica marcado
- [ ] Você e o amigo no mesmo canal: vocês se ouvem
- [ ] Ele troca de canal: **vocês param de se ouvir na hora**
- [ ] Ele continua visível na contagem do outro canal — não some da sala
- [ ] Voltar ao mesmo canal devolve o áudio, **sem recarregar**
- [ ] A contagem "N no canal" conta quem está com você, não a sala toda
- [ ] O chat continua sendo da SALA — todo mundo lê, em qualquer canal

**Telas por canal:**

- [ ] Compartilhando no canal 1, quem está no canal 2 **não** vê botão de
      assistir
- [ ] Assistindo alguém e ele trocando de canal: a tela some
- [ ] Você compartilhando e trocando de canal: quem assistia para de receber —
      confira que o aviso "ninguém está assistindo" volta

## Teste de rede

Aparece para quem está sozinho na sala ou não conseguiu conectar — que é
exatamente quem precisa dele.

- [ ] Sozinho na sala, o botão "Testar minha rede" aparece
- [ ] Numa rede doméstica comum, o resultado diz que a conexão direta funciona
- [ ] **Na máquina de quem fica sozinho com 3 pessoas, rodar o teste.** Se
      disser que a rede não permite conexão direta, a causa é a rede dele e
      nenhuma mudança no site resolve — precisaria de um servidor de
      retransmissão
- [ ] Com o antivírus bloqueando, o resultado acusa a saída bloqueada
- [ ] **Com o antivírus ligado e bloqueando algum relay**, o painel avisa que
      poucos servidores respondem e sugere conferir o histórico de bloqueios
- [ ] A lista de servidores de descoberta aparece, com os conectados em
      destaque e os demais riscados
- [ ] **Quando duas pessoas específicas não se acham, comparar as duas listas.**
      Se não houver nenhum servidor em comum aceso nas duas telas, é essa a
      causa — e nenhuma delas vê erro, porque as duas têm servidores conectados

## Diagnóstico de conexão

Estes existem para separar duas causas que parecem a mesma coisa: **ninguém
achou a pessoa** e **acharam e a conexão direta não fechou**.

- [ ] Com todo mundo conectado, a barra diz "N de N conectados" e fica discreta
- [ ] Quando alguém está na sala mas sem conexão com você, o número fica em
      vermelho e a ficha dele na sala ganha aro tracejado
- [ ] **Quando o terceiro não aparecer, anotar o que a barra diz nas três
      máquinas.** Se ele nem consta na sala, ninguém o achou; se consta e o aro
      está tracejado, acharam e a conexão não fechou
- [ ] "Reconectar" refaz a conexão sem recarregar, e você **não** vira uma
      pessoa nova para os outros (a lista da sala não ganha um fantasma)

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

## O palco da call

- [ ] "Na sala" fica **logo abaixo da barra**, numa linha só
- [ ] Fora da call o miolo convida a entrar, em vez de ficar vazio
- [ ] Entrando num canal, o miolo vira **círculos grandes** com as fotos
- [ ] **Não há duas fileiras de rostos** — a de baixo deixou de existir
- [ ] O anel de topázio acende e respira no círculo de quem fala
- [ ] O selo da identidade aparece embaixo do nome, na roda
- [ ] Mudo e sem microfone se distinguem um do outro
- [ ] Assistindo uma tela, os círculos **encolhem para a lateral** e a tela
      fica com o meio
- [ ] A tela compartilhada sai **nítida**, com texto legível — o padrão passou
      a ser nitidez, não fluidez
- [ ] Parando de assistir, eles voltam ao centro

## Tela grande, com a call ligada

A barra de controles é `fixed` no celular e faixa do grid no computador. Só a
segunda metade se confere aqui, e só numa janela larga (o DevTools aberto
estreita a janela o bastante para desligar o grid — foi o que escondeu o
defeito).

- [ ] Com dois seletores de dispositivo e "compartilhar tela" na barra, os
      canais e os avatares continuam **visíveis acima dela**
- [ ] Nada de avatar ou selo espiando por baixo da barra
- [ ] Abrindo o chat e o mixer de volumes, as faixas continuam no lugar

## Contexto seguro

- [ ] Abrir o site pelo IP da rede local (`http://192.168.x.x:5173`) mostra a
      porta fechada explicando que falta https — e **não** o lobby
- [ ] Pelo `localhost` e pelo site publicado, nada muda: o aviso não aparece

Sem `crypto.subtle` o código da sala não vira chave, e nenhuma das três redes
de descoberta chega a anunciar. Antes desse aviso a falha era muda: erro no
console, sala montada, e ninguém nunca aparecia.

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
