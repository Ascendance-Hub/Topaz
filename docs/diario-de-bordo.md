# Diário de bordo

Este documento conta **como o Topaz chegou onde está**: o que tentamos, o que
deu errado e o que cada erro ensinou.

Ele é o par narrativo de [`aprendizados-trystero-webrtc.md`](aprendizados-trystero-webrtc.md),
que guarda o conhecimento técnico já destilado — "faça assim, por causa disso".
Aqui fica o resto: a ordem em que as coisas aconteceram, as decisões tomadas
com informação incompleta e as medições que apontaram para o lugar errado.

Está escrito assim de propósito. Um projeto que só documenta o que funcionou
condena quem vier depois a repetir o caminho inteiro, porque as tentativas
descartadas parecem boas ideias enquanto ninguém contou como elas terminaram.

---

## A regra que define tudo

**Sem servidor.** O Topaz é um site estático no GitHub Pages: não há backend,
não há banco, não há nada rodando entre duas pessoas. Os navegadores se acham
por infraestrutura pública de terceiros e depois falam direto entre si.

Quase toda dificuldade deste diário sai daí. Com um servidor, metade dos
capítulos abaixo não existiria — e é justamente por isso que eles valem: o
custo real da escolha está registrado, não estimado.

---

## Capítulo 1 — O chat, e a lição sobre o DOM que não pode ser recriado

O primeiro pedido foi um chat no blackjack. Parecia trivial e ensinou a regra
mais reaproveitada do projeto.

A mesa é redesenhada a cada mudança de estado — num cliente, a cada anúncio do
anfitrião, o que durante a compra do dealer são **700 ms**. Um campo de texto
reconstruído nesse ritmo perde o foco e apaga o que a pessoa está escrevendo,
várias vezes por segundo.

**A regra que nasceu aí:** o que guarda estado vivo (texto sendo digitado,
áudio tocando, vídeo decodificando) vive **fora** do que é redesenhado, como
irmão no DOM, criado uma vez e nunca substituído. Chat, vídeos, áudios e
controles da call seguem isso até hoje.

---

## Capítulo 2 — A rede da faculdade, e o problema que decidimos não resolver

Na rede da faculdade nada conectava. A investigação foi montada como sonda
independente, e o veredito foi **NAT simétrico**: cada conexão de saída recebe
uma porta externa diferente, então o endereço que um lado descobre por STUN
não serve para o outro alcançar.

A correção existe e tem nome: **TURN**, um servidor que retransmite a mídia.
E é exatamente o que a regra do projeto proíbe.

**Decisão registrada: não consertar.** Não por ser difícil — por custar a
premissa. Vale mais que o Topaz não funcione numa rede corporativa do que
deixar de funcionar sem servidor.

Esse muro reaparece no Capítulo 8 por outro lado: TURN também seria a única
forma de esconder o IP de quem entra numa sala. É a mesma parede, vista de
outro ângulo.

---

## Capítulo 3 — A proibição do Discord, e a virada de escopo

Em 17/08/2026 a ANPD proibiu o compartilhamento de tela do Discord no Brasil.
O projeto virou de lado: de "blackjack com chat" para "**voz e tela entre
amigos, sem servidor**", com o jogo como uma das coisas que se pode fazer na
sala.

A decisão de arquitetura que veio junto foi a mais importante do projeto:
**call e jogo são independentes e componíveis.** Dá para ter call sem jogo,
jogo sem call, os dois juntos ou nenhum. Nenhum é pré-requisito do outro.

Isso custou trabalho na hora e economizou muito depois: quando a descoberta de
peers quebrou (Capítulo 7), o jogo continuou funcionando e serviu de controle
para isolar o problema.

---

## Capítulo 4 — Voz e tela, e a família de bugs de entrega de mídia

O capítulo mais denso em erros. Todos com a mesma assinatura: **os dados
passavam, a mídia não** — e nenhum deles apresentava erro no console.

| O que fizemos | Por que não funcionou |
|---|---|
| `addStream` + `onPeerTrack` | Nomes que combinam mas não conversam. O par certo é `onPeerStream`. |
| Reconciliar por detecção de borda | Durante a janela de permissão do microfone, o trabalho era descartado em silêncio. |
| Republicar o mesmo objeto `MediaStream` | O Trystero guarda o stream remoto num cache por objeto e reentregava um stream morto. Cada publicação precisa embrulhar num `new MediaStream(...)`. |
| `removeStream` e adicionar de novo | Não refaz `ontrack`. A conexão é estabelecida uma vez, e o que liga e desliga é `encoding.active`. |
| Esconder o `<video>` com `hidden` | Não para o áudio. Um elemento escondido continua tocando. |
| Confiar no metadado para saber se é tela ou microfone | A fila que pareia metadado e faixa desalinha, e o rótulo passa a mentir. A classificação saiu para as **faixas** do stream. |
| Publicar para peers ainda não ativos | O Trystero descarta em silêncio e nós marcávamos como feito. |

**A lição transversal:** em rede, *detectar a mudança* é frágil e *reafirmar o
estado desejado* é robusto. Todo o código de mídia virou **reconciliação
idempotente** — rodar duas vezes tem o mesmo efeito de rodar uma. Foi o que
acabou com essa família inteira.

**A segunda lição:** falha silenciosa é pior que exceção. Vários desses bugs
duraram porque nada reclamava.

---

## Capítulo 5 — Qualidade de imagem, e uma medição que só disse a verdade na segunda vez

A tela chegava borrada. A investigação passou por **codec** (forçar H.264 pelo
`setParameters`, não pelo `setCodecPreferences`), **bitrate por altura**,
**escala a partir da fonte real** e **`contentHint`**.

Aqui houve um erro meu que vale registrar. Montei uma sonda para descobrir se
o navegador usava codificador de hardware; ela dizia `libvpx` — software. A
sonda estava errada: eu chamava `sala.onPeerJoin(...)` como método, mas nesta
versão do Trystero é uma **propriedade** que se atribui. A exceção morria
dentro de um `onclick` assíncrono e nada aparecia.

O usuário disse "não sei se testei certo". Ele tinha testado certo — o
instrumento é que estava quebrado. Com a sonda corrigida, o resultado real era
MediaFoundation / Quick Sync: hardware.

---

## Capítulo 6 — A interface

A tela era "preta com botões". A reescrita adotou uma direção concreta — **uma
mesa sob um abajur**: fundo de feltro, luz que cai de cima e some nas bordas,
latão na estrutura, topázio como única cor que brilha.

Houve uma regressão no caminho ("ficou tudo torto e desalinhado"), causada por
elementos que atravessavam as duas colunas do grid carregando o próprio
`max-width`. Corrigido com um eixo só e uma barra lateral de verdade.

---

## Capítulo 7 — A saga da descoberta

O capítulo mais longo, mais caro e mais instrutivo. O sintoma: **pessoas
específicas não se achavam.** Às vezes três não funcionava, às vezes duas.

### As medições que apontaram para o lugar errado

Eu troquei o critério de seleção de relays **três vezes**, e as três primeiras
mediram a coisa errada:

1. **O socket abre?** — abrir não é entregar.
2. **O NIP-11 responde?** — descrever não é entregar.
3. **A mensagem chega ponta a ponta?** — o critério certo, com a sonda errada:
   ela filtrava um tipo de evento fixo (21152), enquanto o Trystero **deriva o
   tipo a partir do tópico**. Resultado: *todos* os relays foram reprovados.

> **Quando um resultado condena todo mundo, o instrumento está quebrado.**
> Uma medição que reprova a população inteira está medindo a si mesma.

E uma lição mais dolorida das três primeiras: eu media em **segundos** algo
que é usado por **minutos**. Um relay que demora a responder no primeiro
segundo pode ser perfeitamente bom para uma sala que dura uma hora. No fim,
voltamos à lista padrão do Trystero.

### A pista que veio do usuário, não da medição

Duas correções minhas vieram de o usuário me corrigir com dados:

- Eu afirmei que ele era o "denominador comum" das falhas. **Era falso** — ele
  nunca era a pessoa isolada; era sempre um terceiro. Essa correção levou
  direto à descoberta seguinte.
- Ele encontrou sozinho a causa: **o Norton bloqueava `replay.agorist.space`
  como phishing.** Com o antivírus desligado, conectou na hora.

### A causa raiz

O Trystero usa, por padrão, **5 relays de uma lista de 47** — e escolhe sempre
os mesmos 5, derivados do `appId`. Todo mundo cai no mesmo punhado.

Então um antivírus que bloqueia **um ou dois** endereços colapsa a interseção:
não é preciso derrubar a rede, basta envenenar dois nomes. Uma máquina medida
alcançava **5 de 20** relays com o NAT perfeitamente saudável.

### As duas correções

1. **`redundancy: 20`** — usar 20 relays em vez de 5.
2. **Três redes ao mesmo tempo** — nostr, MQTT e BitTorrent simultâneos,
   deduplicando por pessoa.

A segunda foi **ideia do usuário**, e ele também simplificou a implementação:
*"a partir do momento que um conectou, não dá pra fechar os outros 2?"* A
resposta é que não é preciso fechar nada — basta ignorar, com a regra
"primeiro que chega, ganha" aplicada a entradas, saídas, mensagens e streams.

O ponto que faz isso funcionar: o `selfId` do Trystero é **o mesmo nas três
estratégias**, então a mesma pessoa descoberta duas vezes tem o mesmo
identificador.

**Por que redundância de infraestrutura, e não de servidor:** MQTT e BitTorrent
não são "mais relays". São outro protocolo, outras portas, outra reputação. A
lista inteira do nostr cai numa mesma categoria para um antivírus; as três não
caem juntas.

### O que foi descartado, e por quê

- **Sinalização assistida por peers** (um amigo apresenta os outros dois):
  inútil no caso de duas pessoas — não há terceiro para apresentar.
- **Firebase / Supabase:** resolveria, e custa a premissa do projeto.
- **Ligar as redes extras só quando a primeira falha:** quebra com três
  pessoas. Se A e B se acham pelo nostr, nenhum dos dois tem motivo para
  escalar — e C, bloqueado, nunca é encontrado.

### O que custou

Bundle de **107 kB para 475 kB** (32 → 145 kB comprimido), quase tudo do
pacote `mqtt`. E, no ar, **três pools de 20 conexões pré-fabricadas** em vez de
um — o Trystero mantém um por estratégia. Decisão em aberto: manter as três
redes ou ficar com nostr + BitTorrent.

---

## Capítulo 8 — Privacidade, e o que dá e o que não dá para fechar

Levantamento honesto de quem enxerga o quê:

| | Conteúdo (voz, tela, chat, jogadas) | IP |
|---|---|---|
| Quem está na sala | sim — é o objetivo | sim |
| Relays, brokers, trackers | **não** | sim |

**O conteúdo está bem protegido, e não por mérito nosso:** o WebRTC obriga
DTLS-SRTP. Como a topologia é malha pura, sem servidor no meio, cada dupla tem
sua própria sessão cifrada — é ponta a ponta de verdade, não um intermediário
que poderia decifrar e escolhe não fazer.

**O IP é exposto por construção**, e a única correção seria TURN. Mesma parede
do Capítulo 2. Registrar isso é mais honesto do que sugerir mitigações que não
mitigam.

Vale dizer também o que **piorou**: ao adotar três redes, aumentou a lista de
terceiros que veem o IP de quem entra — antes só relays nostr, agora também
brokers MQTT e trackers.

O que foi fechado:

- **Fontes locais.** O `<link>` para o Google Fonts entregava a um terceiro o
  IP e a visita, a cada carregamento. Era o único terceiro dispensável.
- **CSP e `no-referrer`.** Rede de segurança para o dia em que entrar código
  que monte HTML a partir de texto vindo da rede.
- **Código de sala de 8 para 16 caracteres.** Ele não é um identificador: é a
  **senha** da sala. E é atacável offline — o relay vê o tópico como
  `SHA-256(...:codigo)`, hash rápido de passada única, então adivinhar é
  varrer o espaço sem falar com ninguém. Com 8 caracteres eram ~40 bits, que
  uma GPU cobre em minutos.
- **Desconfiar do que chega.** Estado do jogo com a forma verificada antes de
  ser adotado, texto de chat cortado por quem **recebe**, e busca de elementos
  por comparação de string em vez de seletor CSS interpolado.

### A ideia do ObjectId, e por que não

A proposta era formular o código como o `_id` do MongoDB — timestamp +
aleatório + contador. Para garantir unicidade sem coordenação, é ótimo. Para um
**segredo**, a estrutura trabalha contra: quem adivinha já sabe
aproximadamente quando a sala nasceu e que o contador anda em sequência, então
boa parte dos bytes deixa de ser imprevisível. Seria mais longo e igualmente
frágil. Sorteio uniforme atende aos dois objetivos de uma vez.

### O limite que fica

Qualquer peer pode publicar um estado dizendo que é o anfitrião. Sem servidor
não existe árbitro, e nenhuma verificação local prova o contrário. Dá para
**encarecer** — e é o que os guardas fazem — não para eliminar. O Topaz é um
jogo entre amigos, e essa é a premissa de confiança que ele assume.

---

## Capítulo 9 — O rollback, e um culpado que nunca confessou

Os canais de voz subiram e a sala parou de conectar. Duas salas diferentes,
duas falhas. Reversão imediata da `main`, e com ela a sala voltou.

O que veio depois é a parte que interessa, porque a investigação **não
encontrou o culpado**. A camada de rede não tinha sido tocada — `salas.ts`,
`transport.ts` e `canal.ts` estavam byte a byte iguais à versão anterior. O
deploy tinha passado. E o código revertido, rodando localmente em duas abas,
conectava sem reclamar.

Três achados de verdade saíram dessa caçada, e nenhum deles é a resposta:

**Um ouvinte que estoura levava os outros junto.** Quem entra na sala avisa
três assinantes pelo mesmo `for`: o jogo, a call e o anúncio de foto. Uma
exceção no meio do laço apaga tudo que vem depois, em silêncio — e o sintoma é
exatamente "entrei na sala e estou sozinho", com o chat e o jogo funcionando
por cima. É a forma da falha, mesmo sem prova de que foi a falha. Agora cada
ouvinte é isolado, e o estouro fica registrado em vez de engolido.

**O `?.` que sumiu.** A guarda de anúncio repetido virou
`anterior.compartilhando`, sem o `?.`. O TypeScript aceitou porque a
comparação anterior estreita o tipo — mas `msg` vem da rede, e ali o tipo é uma
promessa que ninguém do outro lado assinou. Reproduzido em teste, corrigido, e
o canal da call passou a conferir o que chega, como `src/net/validar.ts` já
fazia pelo jogo.

**O site morria mudo sem https.** Descoberto por acidente: um teste pelo IP da
rede local falhou, e o console mostrou `crypto.subtle` indefinido. O código da
sala vira chave antes do primeiro anúncio, e essa conta só existe em contexto
seguro. A identidade registrava o erro e seguia; o Trystero soltava rejeições
que ninguém pegava; a pessoa via uma sala que não conectava, sem uma palavra na
tela. Custou uma sessão inteira de investigação por um erro de montagem meu.

A lição não é técnica. É que **"logo depois do merge" e "por causa do merge"
não são a mesma coisa**, e que valia dizer isso em voz alta em vez de fechar o
diagnóstico no primeiro suspeito plausível. A reversão ter resolvido também é
compatível com relays de descoberta que voltaram sozinhos — foram vários
falhando no console durante todo o episódio.

## Capítulo 10 — A sala vira um lugar: a coluna, os rostos e as duas conversas

Quatro pedidos numa mensagem só, e eles se encaixavam: os canais para a
esquerda; o miolo virando rostos; um botão trocando o chat com o centro; e as
salas salvas sempre à vista.

### Os canais desceram do rodapé

**Problema.** A fileira de pílulas no rodapé dizia *quantos* estavam em cada
canal.

**Causa.** O número responde à pergunta errada. Escolher um canal é escolher
**com quem** falar, e a contagem não diz isso.

**Correção.** Lista vertical na esquerda, com o nome e a foto de cada pessoa —
inclusive de canais em que você não está, que é metade do motivo de a sala ser
uma só. `porCanal` passou a carregar `quem` (peerIds) em vez de `pessoas`
(número); o protocolo continua sem saber apelido nenhum, e quem desenha
resolve.

**Descartado.** Duas colunas como no Discord (servidores + canais). Comem 72px
a mais de largura, e a tela compartilhada precisa deles no notebook.

### O miolo virou gente

**Problema.** O centro da sala era uma lista de nomes escritos.

**Causa.** Numa conversa por voz, o que se olha o tempo todo é quem está aqui —
e nome escrito não é rosto.

**Correção.** Círculos grandes com as fotos, anel de topázio acendendo em quem
fala. Quando alguém compartilha tela, eles encolhem para uma faixa lateral e a
tela fica com o meio.

**Descartado.** Fazer os círculos sumirem quando há tela. Saber quem está
falando importa **mais** com uma tela na frente, não menos.

### As duas conversas

**Problema.** O chat era um só, da sala inteira. Com canais, faltava um lugar
de falar só com quem está com você.

**Correção.** Duas abas: Sala e Canal. E a distinção que importa: a mensagem
de canal é **enviada** só para quem está no seu canal — um `send` por
destinatário —, não escondida dos outros na hora de desenhar.

**Descartado.** Mandar a todos e filtrar na tela. Deixaria o texto viajando
para quem não devia recebê-lo, e bastaria abrir o console para ler. A troca é
um envio por pessoa em vez de um broadcast; numa conversa de amigos, são
poucos.

Trocar de canal esquece a conversa daquele canal. Aquelas mensagens foram
endereçadas às pessoas com quem você estava.

---

## Capítulo 11 — Três defeitos que só apareceram na tela de alguém

Nenhum destes tinha teste que o pegasse, e os três eram invisíveis na leitura.

### A barra de controles cobria metade da tela

**Problema.** Os canais e os avatares sumiram. Com o DevTools aberto, voltavam.

**Causa.** `.call-controles` é `position: fixed`, e um elemento fora do fluxo
**ignora** o `grid-row` que a regra logo abaixo lhe dá. O CSS dizia "quinta
faixa" e o navegador entendia "flutue por cima de tudo" — duas linhas
convivendo, uma anulando a outra em silêncio. O DevTools "consertava" porque
estreitava a janela e desligava o grid inteiro.

Ninguém viu antes porque a barra **cresceu**: com só "mutar" e "sair" ela era
baixa e sobrava feltro embaixo; os dois seletores de dispositivo e o
"compartilhar tela" a fizeram embrulhar em três linhas.

**Correção.** No computador ela volta ao fluxo; no celular continua `fixed`,
que é o certo lá. `layout.test.ts` guarda a contradição, porque ela não se vê
lendo.

### O site morria mudo sem HTTPS

**Problema.** Achado por acidente: um teste pelo IP da rede local não conectava.

**Causa.** `crypto.subtle` só existe em contexto seguro, e o código da sala
vira chave antes do primeiro anúncio. Sem ela, as três redes de descoberta
morrem antes de anunciar. A identidade registrava o erro e seguia; o Trystero
soltava rejeições que ninguém pegava; a pessoa via uma sala que não conectava,
**sem uma palavra na tela**.

**Correção.** A porta fecha dizendo por quê.

### O botão de trocar foto não funcionava dentro da sala

**Problema.** Escolher foto pelos Ajustes não fazia nada. Na tela inicial,
funcionava.

**Causa.** O painel de Ajustes se refazia a cada `desenhar()` — várias vezes
por minuto. O diálogo de arquivo do sistema fica aberto por segundos, e nesse
meio-tempo o `<input type="file">` que esperava o arquivo era substituído. Na
tela inicial nada redesenha sozinho, e por isso lá funcionava.

**Correção.** O painel só se refaz quando algo mudou de verdade. Vale para os
campos de texto pelo mesmo motivo — um nome sendo digitado sumia no meio.

É a **quarta vez** que este projeto encontra a mesma família de bug: elemento
com estado próprio sendo recriado por um desenho periódico. Já aconteceu com o
chat, com o `<details>` da conexão e com a roda de conversa.

---

## Capítulo 13 — A presença, e três dias medindo a coisa errada

Este capítulo é sobre método, não sobre código. O defeito era pequeno; o que
custou foi eu ter passado dias corrigindo causas que não eram a causa.

**O sintoma.** A presença entre grupos salvos não via ninguém. Nunca.

**O que eu "consertei" pelo caminho**, e nada disso era o problema:

1. Menos relays na sala de fundo (4 em vez de 20). Era um erro de desenho — a
   economia não existia, porque os sockets são compartilhados por estratégia.
   Corrigi. Continuou sem funcionar.
2. A colisão de salas do Trystero (`joinRoom` num id já aberto devolve o mesmo
   objeto). Era um defeito de verdade, e sério. Corrigi. Continuou sem
   funcionar — e a minha correção **quebrou a troca de sala**, porque esperar
   todas as salas fecharem faz o Trystero destruir a piscina de relays.
3. Reverti tudo. Recomecei.

**A virada foi parar de construir e medir.** Uma sonda fora do aplicativo, com
um modo de CONTROLE, e depois um botão que bissectava o meu próprio módulo. Os
resultados, em ordem:

| Observador | Contra a sonda | Contra o app |
|---|---|---|
| Sonda passiva | vê | não vê |
| Sonda ativa | vê | não vê |
| Módulo do app | vê | não vê |

Tudo enxergava a sonda; nada enxergava o app. Isso derrubou de uma vez as três
explicações que eu tinha construído.

**A causa.** Uma linha de diagnóstico no app:

```
sala (15s): relays nostr abertos 16 · peers 1 · por rede: nostr=0 mqtt=1 torrent=0
```

A presença era **só nostr**. As máquinas do teste se acham por **mqtt**. O
observador esperava numa rede em que aquelas pessoas não aparecem.

**A correção.** A sala de fundo passa a observar **as três redes**, e quem
conta desduplica por peerId. É a ideia que o Alexandre tinha proposto rodadas
antes — "usa todas as redes e depois reduz" —, e eu tinha respondido que o
problema era outro. O diagnóstico dele estava certo e o meu não.

A metade que NÃO foi adotada é a redução, e ele mesmo apontou o motivo ao
perguntar como eu a faria: uma rede desligada por estar quieta é uma rede que
não vê quem chegar depois. Presença é justamente sobre quem chega depois.

Ele também corrigiu a minha primeira versão da correção, que deixava o torrent
de fora porque o diagnóstico dizia `torrent=0`. Zero ali significa "não chegou
primeiro" — quem acha antes fica dono do peer e o outro nem aparece na conta.
A rede que conecta uma pessoa não é a mesma que conecta outra.

**O que continua sem explicação.** Entre as mesmas duas máquinas, o nostr acha
uma sonda e não acha o app. Isso não foi resolvido: foi contornado. Fica
registrado como pergunta em aberto, não como coisa entendida.

### O erro de método, que é a lição

Eu instrumentei **três vezes** antes de instrumentar direito:

- A primeira sonda só media sonda contra sonda — nunca contra o app, que era a
  pergunta.
- O primeiro diagnóstico só falava quando alguém entrava. "Nada no console" não
  distinguia "não achou ninguém" de "nem abriu sala nenhuma".
- O segundo saía uma vez só, aos 8 segundos. Não apareceu, e eu não sabia dizer
  se não disparou ou se ninguém estava olhando.

Toda vez o instrumento não separava as hipóteses que ele deveria separar — o
mesmo erro do Capítulo 5, com a sonda de codificador que media a coisa errada.
**Antes de medir, perguntar: quais respostas este instrumento NÃO distingue?**

---

## As ideias que vieram de fora do código

Boa parte do que ficou bom aqui não saiu de mim. Vale registrar o que
aconteceu com cada sugestão do Alexandre — inclusive as que não foram adiante,
que são as mais fáceis de esquecer.

### Adotadas inteiras

- **"Por que limitar a 3 canais?"** Eu tinha escolhido três sem razão técnica
  nenhuma, e admiti. O modelo dele — cria quando quiser, some quando esvazia,
  sem teto — é mais simples E mais honesto: um canal custa um campo de texto,
  não uma conexão.
- **"Não coloque o que não protege numa página pública."** Eu queria
  documentar as limitações de privacidade no site. Ele disse que era "pedir
  para ser atacado". Está certo: descrever a própria fraqueza para desconhecido
  não é transparência, é mapa. Ficou só o que é verdade útil — que todo código
  de sala é público.
- **"Diferente do Discord, mas sem fugir da memória muscular."** Virou a regra
  de desenho do projeto inteiro: convenção em onde a mão vai, diferença no
  material. É a Lei de Jakob, e ele descreveu antes de saber o nome.
- **Configuração de partida atrás da engrenagem, na aba Jogos.** Ele desenhou
  onde deveria morar, e estava melhor que a minha proposta.
- **Ver os canais de fora da call, e entrar clicando num deles.** Ele perguntou
  se dava e se era seguro. Dava, e não expõe nada novo: o canal de cada pessoa
  já viajava em toda mensagem de estado, para dentro e fora da call.

### Adotadas pela metade

- **Códigos de sala no estilo ObjectId do MongoDB.** A parte boa era o
  diagnóstico: 8 caracteres repetiam demais. A parte que não foi é a fórmula —
  timestamp e contador não somam aleatoriedade e ainda contam quando a sala
  foi criada. Ficaram 16 caracteres de entropia pura.
- **Fotos de perfil por URL do Google Imagens.** A ideia de ter foto foi dele.
  O caminho não deu: um `src` de terceiro entrega o IP de quem olha, e é
  exatamente o que o projeto inteiro tenta não fazer. Virou upload local com
  redesenho no canvas — o que trafega são pixels que nós desenhamos, nunca o
  arquivo. Ele perguntou sobre `.exe` renomeado; é justamente o que o redesenho
  barra.
- **"Melhore a qualidade da imagem."** Eu entendi tela compartilhada e mexi no
  codificador. Ele quis dizer os ícones. A correção certa era outra:
  `LADO_FOTO` era 96, herdado de um círculo de 52px, e a roda desenha a 144.

### Recusadas, e por quê

- **Tela cheia na janela flutuante (PiP).** Não dá: o navegador desenha a
  moldura daquela janela e não aceita botão nosso. Nem o Document PiP resolve.
  Ficou registrado como impossível, não como pendência.
- **Salvar a sala automaticamente.** Ele pediu e depois se corrigiu sozinho —
  o botão nos Ajustes já existia e funcionava. O trabalho foi descartado antes
  de existir.

### Correções dele que consertaram diagnósticos meus

- **"E se usarmos todas as redes primeiro e depois reduzirmos?"** Ele estava
  certo, e eu respondi que o problema era outro. Era exatamente isso: a
  presença ouvia só o nostr, e as máquinas dele se acham por mqtt. Levei três
  dias, três implementações e uma regressão para chegar onde a frase dele já
  apontava.
- **"A tela se ajeita em 10 ou 15 segundos."** Eu tinha trocado o
  `contentHint` para `detail` achando que resolveria a tela borrada. O que eu
  fiz foi trocar um ajuste temporário por uma perda de fluidez permanente.
  Voltou para `motion`.
- **"Só acontece quando eu aperto F12."** Foi essa frase que resolveu o caso da
  barra cobrindo a tela. Eu estava caçando exceção em JavaScript; a resposta
  era CSS, e ele tinha dado a pista no primeiro print — um selo de identidade
  cortado no rodapé, que eu não li.

---

## Erros de processo que vale não repetir

Não são erros de código; são de método, e custaram tempo real.

- **Commitei código que não compilava.** Encadeei `npm test ; npm run build`
  com `;` em vez de `&&`, então a falha do `tsc` passou despercebida atrás de
  um teste verde.
- **Empurrei para um branch cujo PR já tinha sido mesclado**, duas vezes.
  Correção: partir de um `main` recém-atualizado a cada PR.
- **Editei arquivo durante uma medição.** Um backup falhou no Windows e o
  arquivo ficou modificado sem eu perceber. Restaurado com `git checkout --`.
- **Testes que reprovei em vez de escutar.** Um teste de duas abas quebrou
  porque eu tinha posto o encerramento em escopo de módulo. O teste estava
  certo; o desenho é que estava errado.
- **Empurrei para PR já mesclado mais duas vezes** (quatro no total). A regra
  agora é conferir `gh pr view <n> --json state` depois de TODO push, e
  resgatar com `cherry-pick` quando voltar `MERGED`.
- **Fechei o diagnóstico no primeiro suspeito plausível.** Os canais subiram e
  a sala parou de conectar; revertemos na hora, e a investigação **não achou
  culpado**. "Logo depois do merge" e "por causa do merge" não são a mesma
  coisa — havia relays de descoberta caindo o episódio inteiro. Três defeitos
  reais saíram da caçada, e nenhum deles é prova de nada.
- **Mandei testar num endereço que não podia funcionar.** Pedi para abrir pelo
  IP da rede local, onde `crypto.subtle` não existe. Uma sessão inteira de
  confusão por erro meu de montagem — e foi ela que revelou a porta fechada
  sem HTTPS, que agora é funcionalidade.
- **Reescrevi CSS com expressão regular** e quebrei o arquivo. Regex não sabe
  contar chaves aninhadas. Consertado à mão, com uma conferência de chaves
  balanceadas depois.
- **Apaguei o `node_modules/.bin`** limpando um worktree cujo `node_modules`
  era uma junção para o real.

---

## O que continua em aberto

- **Testar as três redes com o antivírus ligado**, com mais gente e mais vezes.
- **Decidir sobre o MQTT** — 368 kB de bundle e 20 conexões ociosas, contra uma
  terceira via de descoberta.
- **Adotar a conexão reserva** quando a rede dona cai. Hoje a duplicata custa e
  não serve para nada: quando a dona cai, ela não é promovida. Fechá-la não é
  a saída — o Trystero anuncia de novo a cada ~5 s e a redescoberta viraria um
  laço de reconexão.
- **Um teste intermitente.** `apresentacao.test.ts` — "reconectar prova de
  novo" — falhou uma vez na suíte inteira e passou sozinho e em duas rodadas
  seguidas depois. Ele depende de `crypto.subtle`, que é assíncrono de verdade
  e já nos custou tempo antes (ele não resolve em microtarefas). Não foi
  investigado ainda, e um teste que às vezes passa é pior que um que sempre
  falha.
- **A conversa do canal não tem histórico**, nem para quem chega, nem ao voltar
  a um canal. É consequência de não haver servidor, e some junto com o motivo
  de existir — mas é uma decisão, não um acidente.
- **Presença entre grupos salvos** e **amigos**: o que resta do roteiro.
- **Degradar a tela conforme o número de espectadores.** A malha é N²: quem
  compartilha sobe uma cópia por pessoa que assiste, e a 2,5 Mbps quatro
  espectadores são 10 Mbps de upload. A maior otimização possível já está
  feita — a assinatura explícita, que não liga o codificador enquanto ninguém
  assiste.
