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

---

## O que continua em aberto

- **Testar as três redes com o antivírus ligado**, com mais gente e mais vezes.
- **Decidir sobre o MQTT** — 368 kB de bundle e 20 conexões ociosas, contra uma
  terceira via de descoberta.
- **Adotar a conexão reserva** quando a rede dona cai. Hoje a duplicata custa e
  não serve para nada: quando a dona cai, ela não é promovida. Fechá-la não é
  a saída — o Trystero anuncia de novo a cada ~5 s e a redescoberta viraria um
  laço de reconexão.
- **Salas persistentes** em `localStorage`, no estilo de servidores do Discord.
- **Degradar a tela conforme o número de espectadores.** A malha é N²: quem
  compartilha sobe uma cópia por pessoa que assiste, e a 2,5 Mbps quatro
  espectadores são 10 Mbps de upload. A maior otimização possível já está
  feita — a assinatura explícita, que não liga o codificador enquanto ninguém
  assiste.
