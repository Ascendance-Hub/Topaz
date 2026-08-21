# O que aprendemos sobre Trystero e WebRTC

Coisas que custaram tempo para descobrir e que **não estão na documentação
oficial** de nenhuma das duas. Quase tudo aqui saiu de bug relatado em uso
real, não de leitura de manual.

Cada item traz o **sintoma** (como aparece para quem usa), a **causa** (o que
está acontecendo por baixo) e o **conserto**. O sintoma vem primeiro de
propósito: é por ele que a gente vai reconhecer o problema da próxima vez.

---

## Trystero

### `onPeerJoin` é propriedade, não método

```js
sala.onPeerJoin = (peerId) => { ... }   // certo nesta versão
sala.onPeerJoin((peerId) => { ... })    // API antiga — estoura
```

**Sintoma:** tudo para de funcionar a partir daquela linha, sem erro visível se
o código estiver dentro de um handler assíncrono.

**Cuidado extra:** exemplos antigos na internet usam a forma de método. Se
copiar de blog, confira.

### Cada slot guarda UM handler — atribuir de novo apaga o anterior

`onPeerJoin`, `onPeerLeave`, `onPeerStream`, `onPeerTrack` e o `onMessage` de
cada canal guardam **um único** handler.

**Sintoma:** um módulo novo funciona e um módulo antigo para de receber avisos,
em silêncio, sem erro no console.

**Foi o que quase aconteceu** ao montar a call: se ela atribuísse o próprio
`onPeerJoin`, apagaria o do jogo e a eleição de anfitrião pararia de receber
avisos — a sala inteira quebraria sem nenhuma pista.

**Conserto:** um único despachante por slot, que itera uma lista de ouvintes.
É o que `criarTransporte` faz, e há teste garantindo que a propriedade
continue valendo.

### `addStream` pareia com `onPeerStream`; `addTrack` pareia com `onPeerTrack`

**Sintoma:** dados trafegam normalmente (chat, jogo), mas **nenhuma mídia
chega**, nos dois sentidos, sem erro nenhum.

**Causa:** em `media.mjs`, `addStream` alimenta `pendingStreamMetas`, e essa
fila só é consumida por `receiveRemoteStream`, que dispara `onPeerStream`.
`onPeerTrack` vem de `pendingTrackMetas`, que só existe quando o remetente usou
`addTrack`. Publicar de um jeito e escutar do outro faz os dois nunca se
encontrarem.

**Como reconhecer rápido:** se as mensagens de controle chegam (um botão que
depende delas aparece), o problema **não é o protocolo** — é o pareamento.

### O destinatário vai em `target`, dentro das opções

```js
acao.send(msg, { target: peerId })   // certo
acao.send(msg, peerId)               // erro de tipo
```

`PeerTarget` é `string | string[] | null`, então **uma chamada só alcança
vários alvos** — não precisa de laço.

### `getPeers()` devolve os `RTCPeerConnection` crus

```js
getPeers(): Record<string, RTCPeerConnection>
```

É por aí que dá para mexer em codec, bitrate e resolução. O Trystero não
esconde o WebRTC.

### `removeStream` casa os senders pelas FAIXAS, não pelo objeto

```js
removeStream: (stream) => pc.getSenders()
  .filter((s) => s.track && stream.getTracks().includes(s.track))
  .forEach((s) => pc.removeTrack(s))
```

Ou seja: dá para remover passando **qualquer** `MediaStream` que contenha as
mesmas faixas. Útil quando se publica invólucros diferentes (ver abaixo).

### O receptor cacheia o stream remoto pelo OBJETO do remetente

**Sintoma:** sair e voltar da call quebrava a conversa de forma **assimétrica**
— quem re-entrava passava a ser ouvido, mas não ouvia; uma nova saída invertia
o quadro.

**Causa:** a chave do stream sai de um `WeakMap` indexado pelo objeto. Quem sai
e volta captura um `MediaStream` novo (chave nova, funciona). Quem **fica**
republica o mesmo objeto — a chave repete, `receiveStreamMeta` acha no cache,
reentrega o stream **antigo** (morto no `removeStream`) e descarta o `ontrack`
novo por não haver meta pendente.

**Conserto:** publicar sempre um invólucro novo sobre as mesmas faixas.

```js
sala.addStream(new MediaStream(stream.getTracks()), { target, metadata })
```

### `pendingStreamMetas` é uma fila FIFO POR PEER, compartilhada por todas as mídias

**Sintoma:** com 3 ou 4 pessoas, alguém entrando fazia outra pessoa **sumir do
áudio** de quem já a ouvia.

**Causa:** microfone e tela da mesma pessoa dividem a mesma fila, e
`receiveRemoteStream` faz `shift()` cego. Um metadado que chegue sem faixa
correspondente — o que acontece quando alguém entra e a conexão ainda está
sendo estabelecida — **desalinha a fila para sempre**: dali em diante todo
stream recebe o rótulo do anterior. Na prática, o microfone de alguém era
tratado como tela e ia parar num `<video>` **mudo**.

**Conserto:** **não confiar no `metadata` para classificar.** As faixas do
próprio stream não têm como mentir:

```js
const ehTela = (stream) => stream.getVideoTracks().length > 0
```

O `metadata` continua útil para informação decorativa, nunca para decidir o que
uma mídia é.

### Padrões de conexão

- **ICE padrão:** apenas STUN (`stun.l.google.com:19302` e
  `stun.cloudflare.com:3478`). **Nenhum TURN.** Existe a opção `turnConfig`.
- **Sinalização nostr:** 48 relays na lista, e o Trystero sorteia 5
  (`defaultRedundancy`). Se poucos estiverem acessíveis, dois jogadores podem
  cair em conjuntos diferentes e não se encontrar.

---

## WebRTC

### `removeTrack` não encerra o transceiver — e o `ontrack` não dispara de novo

**Sintoma:** assistir → parar de assistir → assistir de novo não voltava. Só
voltava se quem compartilha **reiniciasse** o compartilhamento.

**Causa:** `removeTrack` só zera a faixa do sender; o transceiver continua
vivo. Ao re-adicionar, ele é reaproveitado e o `ontrack` do outro lado **não
dispara outra vez** — o metadado fica preso na fila para sempre. Reiniciar o
compartilhamento funciona porque cria uma **faixa** nova, não só um invólucro.

**Conserto:** parar de desmontar. Estabelecer o envio uma vez e usar
`encoding.active` para ligar e desligar a codificação, **sem renegociar**:

```js
const params = sender.getParameters()
params.encodings[0].active = false   // desliga o codificador
sender.setParameters(params)
```

### Trocar de codec com a conexão de pé: `setParameters`, não `setCodecPreferences`

**Medido em 2026-08-21**, com duas abas ligadas por Trystero real.

```js
const params = sender.getParameters()
params.encodings[0].codec = perfilH264   // de RTCRtpSender.getCapabilities('video')
sender.setParameters(params)             // VP8 → H.264, sem renegociar
```

`setCodecPreferences` **não serve** neste caminho: logo após o `addStream` não
existe transceiver nenhum para configurar (o `addStream` do Trystero é
assíncrono). Não é uma corrida apertada — a janela não existe.

**Detalhe de tipos:** escolher codec por encoding é mais novo que a lib do
TypeScript. Estender o tipo é melhor que recorrer a `any`:

```ts
type EncodingComCodec = RTCRtpEncodingParameters & { codec?: RTCRtpCodec }
```

### Nem todo H.264 é igual — e o padrão é ruim

**Sintoma:** "mesmo em 1080p a qualidade não parece boa".

**Causa:** pegar o primeiro perfil da lista costuma entregar
`packetization-mode=0` e Baseline.

**Ordem de importância:**

1. **`packetization-mode=1` pesa mais que o perfil.** Sem ele, quadros grandes
   — justamente os de tela — fragmentam mal, e o artefato aparece antes de o
   perfil fazer qualquer diferença.
2. Dentro disso, o `profile-level-id` começa com `64` (High), `4d` (Main) ou
   `42` (Baseline), nessa ordem de qualidade.

### `scaleResolutionDownBy` precisa sair da resolução REAL da fonte

**Sintoma:** qualidade ruim em monitores grandes, mesmo escolhendo 1080p.

**Causa:** presumir que a fonte é 1080p dá fator 1 numa tela 1440p ou 4K —
manda-se resolução nativa com bitrate de tela pequena.

```js
const alturaFonte = track.getSettings().height
encoding.scaleResolutionDownBy = Math.max(1, alturaFonte / alturaAlvo)
```

O `Math.max(1, ...)` importa: sem ele, uma fonte menor que o alvo viraria
**aumento** de escala — pixels inventados, gastando bitrate sem ganhar nitidez.

### `contentHint` é o botão que Discord e Meet não expõem

Vídeo: `'motion'` prioriza fluidez, `'detail'` prioriza nitidez. O codificador
não entrega os dois com o mesmo bitrate. Escolher errado é a causa clássica de
"a tela está travando" — ou de letra pequena embolada.

Áudio: `'speech'` (padrão de fato) e **`'music'`**.

### O Opus nasce mirando voz — e isso estraga som de jogo

**Sintoma:** o áudio do compartilhamento chega abafado e chiado, como se a voz
tivesse prioridade.

**Causa:** bitrate baixo e banda estreita, que é o certo para fala e péssimo
para música e efeitos.

**Conserto:** na faixa de áudio **da tela** (nunca no microfone):

```js
faixaDeAudioDaTela.contentHint = 'music'
encoding.maxBitrate = 192_000
```

### `hidden` NÃO para o áudio de um elemento de mídia

**Sintoma:** o som da tela continuava saindo depois de parar de assistir, e
depois de sair da call.

**Causa:** um `<video hidden>` continua tocando. Esconder é decisão de layout,
não de reprodução.

**Conserto:** ao esconder, `muted = true` e `pause()` também.

### O autoplay pode ser recusado

`play()` devolve promessa que **rejeita** quando não houve gesto do usuário.
Engolir essa rejeição faz a call ficar muda sem nenhuma pista. Um botão de som
resolve os dois casos de uma vez: serve para silenciar, e o clique é o gesto
que destrava.

### Mudo é `track.enabled = false`, não desligar a captura

Continua enviando a faixa, em silêncio. Desligar a captura acenderia e
apagaria o indicador de microfone do navegador a cada clique, e obrigaria a
renegociar.

### A barra nativa do Chrome dispara `track.onended`

Quem compartilha pode parar pelo botão do próprio navegador, não pelo da
aplicação. Sem tratar `onended`, a interface continua dizendo que a pessoa
compartilha.

### `getStats()` responde perguntas que ninguém mais responde

- **`encoderImplementation`** — diz se o encoder é de hardware
  (`MediaFoundationVideoEncodeAccelerator`, `QuickSync`, `NVENC`) ou software
  (`libvpx`, `OpenH264`).
- **`qualityLimitationReason`** — `'cpu'`, `'bandwidth'` ou `'none'`. O
  navegador entrega de graça quem está segurando a qualidade.
- **`totalEncodeTime / framesEncoded`** — custo médio por quadro. Cuidado: em
  encoder de **hardware** isso mede latência da chamada, não tempo de CPU, e as
  duas coisas não são comparáveis entre si.

### APIs que podem não existir

`RTCRtpSender.getCapabilities` e `requestPictureInPicture` faltam em
navegadores mais antigos. Uma exceção num ajuste **opcional** não pode derrubar
a funcionalidade inteira — e botão que falha no clique é pior que botão
ausente.

### Diagnóstico de NAT que o navegador não dá

Para saber se um NAT é simétrico, o navegador não serve: o Chrome zera
`relatedPort` dos candidatos `srflx` para não vazar o endereço local, então não
dá para provar que dois candidatos saíram do mesmo socket.

Fora do navegador dá: **um único socket UDP consultando vários servidores
STUN**. Se o endereço externo mudar conforme o destino, o NAT é simétrico e só
TURN resolve.

---

## Lições sobre testar isso

### Uma fake que não espelha a semântica real esconde o bug

A rede falsa do canal da call anunciava a entrada de peers **dentro** do
`conectar`, de forma síncrona. Isso é infiel: o construtor do consumidor ainda
não terminou, então o retrato enviado por quem já estava chegava a um nó sem
ouvinte e se perdia. O caso "entrar numa call que já está rolando" ficava
quebrado **com a suíte verde**.

A fake passou a anunciar só quando o consumidor registra `aoEntrarPeer` —
como o Trystero de verdade, que dispara depois.

**Regra que tiramos disso:** quando uma fake substitui uma biblioteca, ela
precisa espelhar o *pareamento* da biblioteca, não só a forma das funções.

### Fake incompleta vira erro confuso

Fakes sem `getSettings`, `getAudioTracks` ou `getTracks` produziram
`TypeError` que parecia bug de produção. Sempre que aparecer, a pergunta certa
é: **o navegador de verdade tem isso?** Se tem, o defeito é da fake.

### Separar o testável do intestável

Mídia não se testa sem navegador. O que dá para fazer é impedir que essa
intestabilidade se espalhe:

- `src/call/protocolo.ts` — quem está em quê. **Sem navegador, testado.**
- `src/call/midia.ts` — a casca que fala com as APIs. **Verificada na mão.**

E um teste guarda a fronteira: se `navigator`, `MediaStream` ou `document`
aparecerem no protocolo, a suíte reprova.

### Detecção de borda perde pedido; reconciliação não

**Sintoma:** ninguém ouvia ninguém quando as duas pessoas clicavam "Entrar na
call" quase ao mesmo tempo.

**Causa:** publicar olhando "quem entrou na lista desde a última vez" marcava
como resolvido mesmo quando a chamada era descartada por a captura ainda estar
na janela de permissão. Como os dois clicam juntos, o caso comum era cada um
receber o anúncio do outro durante o próprio prompt.

**Regra:** descreva **o que deveria estar valendo agora** e deixe a camada de
baixo calcular a diferença. Chamar de novo com o mesmo estado não pode fazer
nada; chamar cedo demais não pode perder o pedido.

---

## Histórico dos problemas relatados em uso

Na ordem em que apareceram, com o que cada um se revelou ser.

| Relato | Causa real |
|---|---|
| "Na faculdade não dava para achar jogo de quem estava fora" | NAT simétrico. Não era rotatividade de IP: o IP era estável, a **porta** mudava por destino. |
| "O compartilhamento não deu em nada, e o voice não pegava" | `addStream` publicando e `onPeerTrack` escutando — canais que nunca se encontram. |
| (mesmo relato) | Detecção de borda descartando a publicação feita durante a janela de permissão. |
| "Saio da call e entro de novo, não consigo mais falar" | Republicação do **mesmo objeto** de stream batendo no cache do receptor. |
| "Clico para assistir, paro, assisto de novo, não vejo" | `removeTrack` não encerra o transceiver; `ontrack` não dispara de novo. |
| "Mesmo em 1080p a qualidade não parece boa" | H.264 Baseline em `packetization-mode=0`, escala presumindo fonte 1080p, e teto único de bitrate. |
| "Parei de ouvir quem eu já ouvia quando entraram mais dois" | Fila FIFO de metadados desalinhando e trocando os rótulos. |
| "O som da tela continua depois de parar de assistir" | `hidden` não para áudio. |
| "O som do compartilhamento fica abafado" | Opus otimizado para voz. Não era limitação da tecnologia. |

**O padrão que se repete:** em quase todos, o sintoma era **silêncio** — nada
no console, nada quebrado à vista, só uma funcionalidade que não acontecia. Foi
sempre mais rápido ler o código da biblioteca do que tentar adivinhar.
