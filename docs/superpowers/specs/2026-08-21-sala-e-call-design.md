# Topaz — Sala neutra e call de voz e tela

**Data:** 2026-08-21
**Status:** aguardando revisão do autor
**Antecede:** `2026-08-16-melhorias-partida-design.md`

---

## 1. Por que

Em 17/08/2026 a ANPD determinou que o Discord suspendesse compartilhamento de
tela e vídeo no Brasil. Voz e texto continuam; o resto caiu. As alternativas
testadas na prática decepcionaram: Meet corta em uma hora, Teams só deixa uma
pessoa compartilhar, e Gather ficou travando.

O Topaz já tem, funcionando e testada, exatamente a infraestrutura que faltaria:
conexão direta entre navegadores, salas por código, presença de participantes e
migração de anfitrião. Falta só usar a mesma conexão para carregar mídia.

Junto disso vem um conserto que o uso real do jogo pediu: hoje entrar numa sala
significa sentar numa mesa de blackjack. Não existe "estar junto" sem estar
jogando.

---

## 2. Escopo

1. A sala passa a ser um espaço neutro, dona da conexão.
2. Um módulo de call plugado nela: voz e compartilhamento de tela.
3. A mesa de blackjack vira algo que se abre dentro da sala.

Call e jogo são **independentes e componíveis**: call sem jogo, jogo sem call,
ou os dois ao mesmo tempo. Nenhum é pré-requisito do outro.

**A primeira fatia é 1:1** — duas pessoas, voz e tela.

---

## 3. Não-objetivos

- **Câmera.** Fora desta entrega. O código de mídia fica genérico o bastante
  para aceitar depois, porque para o WebRTC câmera e tela são a mesma coisa.
- **Áudio do sistema junto com a tela.** Captura irregular entre plataformas e
  cria eco com o microfone aberto. Custo assumido: assistir vídeo junto entrega
  imagem sem som.
- **RNNoise em WASM.** O supressor do próprio navegador entra; o bom fica para
  um ciclo que mexa só em áudio.
- **Indicador de quem está falando.** Exige laço de análise de áudio rodando
  sempre; mora no mesmo ciclo do RNNoise.
- **Grupos persistentes.** Próximo ciclo, por cima desta base.
- **Celular.** A call não funciona em celular e a interface diz isso. O
  blackjack continua funcionando em celular como hoje.
- **Servidor TURN.** Decisão de 2026-08-20: redes com NAT simétrico ficam de
  fora. Ver `docs/roteiro.md`.
- **SFU ou WebCodecs** para grupos grandes com todos compartilhando.

---

## 4. O modelo de sala

### O que já existe e não precisa ser inventado

`Sessao.entrar(apelido)` já coloca quem chega em `estado.jogadores`, mesmo sem
sentar — sentar é ato separado. **A lista de quem está na sala já existe, já é
sincronizada e já tem teste.** A sala usa essa lista como sua presença.

A mesa também já sabe existir sem ninguém jogando: é a fase `aguardando`.

### A consequência: abrir a mesa não é estado compartilhado

A mesa está sempre disponível na sala; **abrir é escolha local de
visualização.** Se ninguém senta, nada acontece — e sentar já é compartilhado e
já funciona.

Isso evita acrescentar um `mesaAberta` às regras, que seria enfiar um conceito
de sala dentro do motor de blackjack. O teste de isolamento de `src/game/`
existe justamente para impedir esse vazamento.

**Resultado: `src/game/`, a `Sessao`, a eleição de anfitrião, a migração e a
reconexão não são tocadas.** A reestruturação é toda de composição, e os 338
testes existentes continuam valendo como estão.

### A call não tem anfitrião

Mídia é simétrica entre pares; não há estado autoritativo para eleger ninguém.
Se o anfitrião do jogo cair durante uma conversa, a conversa não sente nada.

---

## 5. Camadas e arquivos

### O transporte se parte em dois

```
criarSalaTrystero(codigo) → a conexão Trystero crua
criarTransporte(sala)     → o Transporte de dados de hoje, por cima dela
```

A call recebe a **mesma** conexão. Mídia e dados viajam pelos mesmos peers, sem
segunda pilha e sem segundo handshake.

### Mídia não entra na interface `Transporte`

O `Transporte` sustenta a rede falsa em memória que testa eleição, migração e
split-brain sem navegador. `MediaStream` não se finge honestamente nesse
ambiente. Enfiar mídia ali contaminaria a peça mais testável do projeto.

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/call/protocolo.ts` | Quem está na call, quem compartilha, quem assiste. Mensagens de pedir e parar. **Sem navegador.** |
| `src/call/protocolo.fake.ts` | Canal falso em memória, no espírito de `transport.fake.ts`. |
| `src/call/midia.ts` | Casca fina sobre `getUserMedia`, `getDisplayMedia` e `RTCPeerConnection`. |
| `src/call/dispositivos.ts` | Enumerar, escolher e lembrar microfone e saída. |
| `src/ui/components/call.ts` | Controles e área de vídeo. |
| `src/ui/components/sala.ts` | A casca da sala: quem está aqui, abrir mesa, entrar na call. |

### Renomeação

`src/ui/sala.ts` guarda utilidades de *código* de sala (gerar, validar, montar
link) e passaria a conviver com um componente de sala. Vira `src/ui/codigo.ts`.
Rename puro, testes acompanham.

### A forma do módulo

```ts
interface Call {
  entrar(): Promise<void>              // publica o microfone
  entrarSoOuvindo(): void
  sair(): void
  compartilharTela(): Promise<void>
  pararTela(): void
  assistir(peerId: string): void
  pararDeAssistir(peerId: string): void
  estado(): EstadoCall
  aoMudar(cb: () => void): void
}
```

Estar na sala e estar na call são coisas separadas. **Entrar na call é ato
explícito** — é o que evita microfone aberto sem a pessoa perceber.

---

## 6. Assinatura explícita

O princípio central: **compartilhar tela não liga o codificador.**

1. Quem compartilha anuncia "tenho tela disponível" — mensagem de dados por
   canal próprio do módulo (`sala.makeAction('call')`), sem tocar no
   `Transporte` do jogo.
2. Quem quiser vê um botão **Assistir**.
3. Só ao clique acontece `addStream(tela, { target: aquelePeer })`.
4. Quem para de assistir sai do `target`. **Sem assistentes, o codificador
   desliga.**

Justificativa medida: o probe de 2026-08-20 mostrou que o custo escala com quem
assiste, não com quem compartilha. Em 1:1 a diferença é quase invisível; é o que
permite crescer depois sem reescrever.

### O microfone também é dirigido

Estar na sala não é estar na call, então o microfone **não** publica para todos
os peers da sala — só para quem está na call. Vale o mesmo `target`:

- Ao entrar na call, você publica seu microfone para cada participante atual.
- Quem entrar depois vira alvo novo, e recebe seu áudio a partir dali.
- Quem sair da call deixa de ser alvo.

Sem isso, alguém que só quisesse jogar blackjack receberia o áudio da conversa
sem ter pedido — e ninguém na sala saberia que isso está acontecendo.

### Sem trava artificial de duas pessoas

Voz em malha é barata, e a tela segue a assinatura. A call funciona com 3 ou 4
sem código extra. Mas **só 1:1 é prometido**, porque só isso será testado.

---

## 7. Captura, qualidade e dispositivos

### Microfone

```ts
getUserMedia({ audio: {
  noiseSuppression: true, echoCancellation: true, autoGainControl: true,
} })
```

### Tela

Duas conclusões do probe viram código:

- **Resolução é o que custa.** Até 720p o custo quase não mexe; em 1080p salta
  cerca de 3×. Padrão **720p**, com 1080p disponível, via
  `sender.setParameters({ encodings: [{ maxBitrate, scaleResolutionDownBy }] })`
  — que funciona a qualquer momento, sem renegociar.
- **`contentHint`** exposto: `motion` para jogo e vídeo, `detail` para código e
  texto. É o botão que Discord e Meet não deixam tocar, e escolher errado é a
  causa clássica de "tela travando".

### Codec

Preferir **H.264**, que no hardware do autor aciona o Intel Quick Sync. A troca
é deliberada: H.264 gasta mais banda que AV1 para a mesma qualidade, e banda é o
recurso que sobra (200 Mbps de upload) enquanto CPU é o que falta. Em máquina
sem encoder dedicado a escolha é neutra.

**Como forçar** (medido em 2026-08-21, duas abas ligadas por Trystero real):

```ts
const params = sender.getParameters()
params.encodings[0].codec = perfilH264   // de RTCRtpSender.getCapabilities('video')
sender.setParameters(params)
```

Troca o codec **com a conexão já de pé, sem renegociar**. Serve porque só
seleciona entre o que já foi negociado, e o H.264 entra no SDP por padrão
mesmo sem ser o preferido.

`setCodecPreferences` **não** serve: logo após `addStream` não existe
transceiver nenhum para configurar (o `addStream` do Trystero é assíncrono).
Não é uma corrida apertada — a janela não existe.

### Dispositivos

- Lista via `enumerateDevices()` filtrando `audioinput`.
- **Os nomes só existem depois da permissão concedida.** O seletor nasce
  assumindo isso, sem prometer nomes que ainda não tem.
- Trocar no meio da call usa `replaceTrack` do Trystero: substitui a faixa **sem
  renegociar**, sem corte audível.
- `ondevicechange` reenumera quando um fone é plugado ou arrancado.
- Escolha guardada no `localStorage`, como já é feito com o apelido.
- Seletor de **saída** de áudio junto (`setSinkId`), mesma interface.

---

## 8. UI da sala

### A regra herdada do chat

`renderizar` troca todos os filhos do palco a cada mudança de estado. Recriar um
`<video>` **reinicia o fluxo**: tela preta e engasgo. A área de mídia é criada
uma vez e nunca substituída.

```
┌─────────────────────────────────────────────┐
│ barra de sala — código, copiar link         │  redesenhada
├─────────────────────────────────────────────┤
│   palco: a mesa, ou a sala vazia            │  re-renderizado
├─────────────────────────────────────────────┤
│ [ 🎤 ] [ 🖥 compartilhar ] [ sair da call ]  │  persistente
└─────────────────────────────────────────────┘
        ┌──────────────┐        ┌───────────┐
        │ vídeo        │        │   chat    │  persistentes
        └──────────────┘        └───────────┘
```

### Estados

1. **Sala parada** — lista de quem está, botões *Abrir mesa* e *Entrar na call*.
2. **Na call, ninguém compartilhando** — controles embaixo; quem compartilha
   ganha *Assistir* ao lado do nome.
3. **Assistindo, sem mesa** — o vídeo ocupa o espaço principal.
4. **Mesa aberta + assistindo** — ver abaixo.

### Coexistência de mesa e tela

**Picture-in-Picture nativo** (`video.requestPictureInPicture()`): a tela do
outro vira janela flutuante do sistema, acima de tudo, redimensionável pelo
próprio sistema operacional — inclusive ao trocar de aba.

Limites: exige clique (regra do navegador) e o Firefox tem API própria. Por
isso o padrão em página continua sendo **vídeo flutuante no canto** com botão de
expandir. O PiP é um botão a mais, não a única saída.

---

## 9. Erros e casos de borda

Princípio herdado de `renderizarConexao`: **toda falha vira mensagem legível que
diz qual falha é**, em vez de tela travada.

**Uma propriedade que simplifica:** mídia e dados viajam na mesma conexão. Se o
chat funciona entre duas pessoas, a call conecta. Não existe "o jogo funciona
mas a call não fecha". O que varia é qualidade, não conectividade.

| Situação | Resposta |
|---|---|
| Microfone negado | Oferece **entrar só ouvindo**, em vez de travar ou entrar mudo em silêncio. |
| Sem microfone no aparelho | Mesma coisa, dizendo o porquê. |
| Cancelou o seletor de tela | **Nenhuma mensagem** — foi intencional. |
| Sem `getDisplayMedia` | Botão ausente com o motivo, em vez de falhar no clique. |
| "Parar de compartilhar" nativo do Chrome | `track.onended` limpa tudo e avisa os peers. Sem isso a interface mentiria. |
| Fone arrancado no meio | A faixa termina e o microfone morre calado. Detectado e avisado. |
| Quem compartilhava parou | Área limpa com "fulano parou de compartilhar", não quadro congelado. |
| Último assistente saiu | Codificador desliga. |
| `play()` rejeitado por autoplay | Área mostra **"clique para ouvir"**, não silêncio inexplicável. |
| Peer sai | Vídeo removido, lista atualizada, encoder desligado se era o assistente. |
| Anfitrião do jogo cai | Nada acontece com a call. |

---

## 10. Estratégia de testes

Mídia é a parte menos testável do projeto. `getUserMedia`, `getDisplayMedia`,
codificação e PiP não existem sem navegador. O objetivo do desenho é **impedir
que essa intestabilidade se espalhe**.

O corte é o mesmo que já separa `src/game/` de `src/net/`:

- `src/call/protocolo.ts` — sem navegador, **testado**.
- `src/call/midia.ts` — casca fina sobre as APIs, **verificada na mão**.

E, como já se faz para `src/game/`, **um teste que guarda a fronteira**:
`protocolo.ts` não pode mencionar `navigator`, `MediaStream` nem `document`.

### Coberto por teste automatizado

- Assinatura: pedir, parar, e o codificador desligando quando o último sai.
- Quem está na call, quem entrou só ouvindo, quem saiu.
- Reação a `track.onended`, com faixa falsa.
- Escolha e memória de dispositivo.
- Componentes de UI: botões, rótulos, estados.
- **O painel de vídeo sobrevivendo aos re-renders da mesa** — o mesmo teste que
  provou seu valor no chat.

### Só verificação manual

Qualidade real de tela e áudio; se o H.264 foi negociado e o Quick Sync entrou;
PiP; autoplay; eco e supressão de ruído; troca de microfone com fone sendo
arrancado de verdade; e a call inteira entre duas pessoas.

**A proporção, dita com todas as letras:** dá para testar bem a *lógica* e quase
nada da *experiência*. Diferente do blackjack, aqui o autor e os amigos dele são
parte do processo de verificação, não um extra.

---

## 11. Impacto no que existe

| Área | Impacto |
|---|---|
| `src/game/` | **Nenhum.** |
| `src/net/sessao.ts` | **Nenhum.** |
| `src/net/transport.ts` | Parte em `criarSalaTrystero` + `criarTransporte`. Interface `Transporte` inalterada. |
| `src/main.ts` | Passa a montar uma sala em vez de uma partida. |
| `src/ui/sala.ts` | Renomeado para `src/ui/codigo.ts`. |
| `src/ui/render.ts`, `mesa.ts` | Nenhum por dentro; passam a ser montados pela sala. |
| Chat | Nenhum. Vira mais um painel persistente da sala. |
| Tela de espera | Muda de significado: deixa de ser antessala da mesa e vira a sala. |

---

## 12. Riscos

**~~Forçar H.264 pode não ser possível através do Trystero.~~ RESOLVIDO em
2026-08-21.** Dá, por `sender.setParameters` com a conexão já estabelecida —
ver Seção 7. O risco como estava escrito partia de uma premissa errada: o
problema não era corrida com a negociação, era que o transceiver ainda não
existe logo após o `addStream`.

**Não está confirmado que o encoder de hardware entra pelo caminho do
Trystero.** A sonda de codec devolveu `encoderImplementation` vazio. Sabe-se,
da sonda anterior, que este notebook usa Quick Sync quando o H.264 é
negociado, e a escolha de encoder não depende de como o SDP chegou lá — mas
isso é inferência, não medição. Conferir na verificação manual, com a call de
verdade rodando.

**A reestruturação do `main.ts` pode causar regressão no jogo.** Mitigação: a
sala nasce com o jogo funcionando exatamente como hoje e a suíte verde, e só
depois a call é plugada. Nenhuma das duas etapas mexe em regra de jogo.

**A experiência pode simplesmente não ser boa o bastante**, e isso só se
descobre em uso real. O probe mediu custo de codificação, não qualidade
percebida no caminho real de internet entre duas casas. Esse número ainda não
existe.

---

## 13. Ordem de implementação

1. Confirmar se dá para forçar H.264 pelo Trystero (risco da Seção 12).
2. Partir o transporte em `criarSalaTrystero` + `criarTransporte`, sem mudança
   de comportamento. Suíte verde.
3. Renomear `src/ui/sala.ts` para `src/ui/codigo.ts`. Suíte verde.
4. A sala como casca, com o jogo montado dentro dela e funcionando como hoje.
   Suíte verde, nenhuma regressão.
5. `protocolo.ts` e seu canal falso, com testes — sem nenhuma mídia real ainda.
6. `midia.ts`: microfone, entrar e sair da call.
7. Compartilhamento de tela com assinatura explícita.
8. Qualidade, codec e seletores de dispositivo.
9. UI: controles, área de vídeo persistente, PiP.
10. Atualizar `docs/verificacao-manual.md` e o `README.md`.
