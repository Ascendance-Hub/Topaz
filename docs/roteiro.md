# Roteiro

Onde o projeto está, o que já foi decidido e o que falta. Atualizado conforme
as coisas andam — não é plano de implementação (esses vivem em
`docs/superpowers/plans/`), é o mapa de cima.

## Pronto

Tudo abaixo está na `main` e **verificado em uso real**, não só por teste — com
duas exceções marcadas 🕓, escritas em 2026-08-24 e ainda não vistas com gente.

- **Blackjack multijogador** — regras completas, eleição e migração de
  anfitrião, reconexão, partida com eliminação.
- **Chat da sala** — texto livre, canal próprio fora do estado do jogo, painel
  que sobrevive aos re-renders da mesa.
- **Call de voz** — entrar e sair, mudo próprio, silenciar todo mundo, seletor
  de microfone trocável no meio da call (via `replaceTrack`, sem renegociar) e
  🕓 **seletor de saída de áudio** (`setSinkId`), que leva junto o som das telas.
- 🕓 **Entrar só ouvindo** — microfone negado, ausente ou ocupado não impede mais
  a entrada: a barra diz o motivo e oferece "Ativar microfone". Antes disso, a
  permissão negada matava o botão em silêncio.
- **Compartilhamento de tela** — assinatura explícita (o codificador só liga
  quando alguém pede para assistir), H.264 forçado por `setParameters`,
  qualidade e `contentHint` no seletor, **áudio do sistema junto** com bitrate
  de música, tela cheia e Picture-in-Picture.
- **Mixer de volume** — um canal por voz e um por tela, separados de propósito.
- 🕓 **Barra lateral** — o botão "Mesa" virou um trilho com Sala, Jogos e
  Ajustes. Ajustes traz apelido e foto trocáveis a qualquer momento (antes só
  na porta de entrada), salvar esta sala como grupo, e os controles da
  identidade.
- 🕓 **Grupos persistentes** — atalhos salvos no navegador, com cor derivada do
  próprio código. Aparecem no topo da tela inicial para quem já tem algum.
- 🕓 **Configuração da partida** — fichas iniciais, alvo, aposta máxima e tempo
  de jogada, escolhidos pelo anfitrião e só entre partidas. Viajam no
  `EstadoJogo`, então todo mundo concorda sozinho. O padrão do alvo mudou de
  1500 para **2500**: com 1000 iniciais e aposta de 500, o antigo fazia uma
  única mão ganha encerrar a partida.
- 🕓 **Galeria de jogos** — o que dá para jogar, e o que vem por aí como
  promessa declarada, nunca como cartão clicável que não faz nada.
- 🕓 **Identidade estável** — par de chaves gerado no navegador, guardado como
  `CryptoKey` **não extraível** no IndexedDB. Quem entra na sala prova quem é
  assinando um desafio sorteado na hora, e ganha um selo. O segredo de
  recuperação é mostrado **uma vez** na criação; com ele dá para entrar noutro
  computador.
- 🕓 **Assistir a própria tela** — prévia pequena da própria captura, para
  conferir o que se está mostrando. Não passa por WebRTC e não liga
  codificador: assistir a si mesmo continua não acordando o encoder.
- 🕓 **Foto de perfil** — escolhida do computador, encolhida para 96×96 pelo
  canvas e enviada P2P como `data:`. Nenhum servidor de terceiro é contatado.
- 🕓 **Home de apresentação** — a primeira tela deixou de ser um cartão de
  entrar e virou uma página: o que o site faz, o que está protegido, e o teste
  de rede acessível antes mesmo de entrar numa sala. A ação vem antes da
  apresentação, porque o trabalho da página é deixar entrar.
- 🕓 **Quem está falando** — anel de topázio em volta de quem fala, medido
  localmente sobre o áudio que já chega. Nada disso trafega.
- **Descoberta por três redes** — nostr, MQTT e BitTorrent ao mesmo tempo,
  deduplicando por pessoa. Foi o que destravou os amigos que não se achavam.
- **Privacidade e guardas de rede** — fontes locais, CSP, código de sala de 16
  caracteres, validação do que chega. Ver seção própria abaixo.

O padrão de qualidade da tela é **1080p** desde 2026-08-24. É escolha contra a
economia: custa ~3× de codificação e 6 Mbps por espectador (contra 2,5 em
720p), e vale porque o uso real é ler texto na tela do outro. O seletor
continua ali para quem tiver upload curto.

## Onde ficam os aprendizados

Dois documentos, com propósitos diferentes:

- [`aprendizados-trystero-webrtc.md`](aprendizados-trystero-webrtc.md) — o
  conhecimento técnico já destilado sobre Trystero e WebRTC que **não está na
  documentação oficial** de nenhum dos dois, com sintoma, causa e conserto de
  cada caso.
- [`diario-de-bordo.md`](diario-de-bordo.md) — o **processo**: em que ordem as
  coisas aconteceram, o que foi tentado e descartado, e as medições que
  apontaram para o lugar errado. Existe para que as tentativas mortas não
  pareçam boas ideias para quem chegar depois.

## Investigado e encerrado

- **Topaz não conecta na rede da faculdade** — diagnosticado em 2026-08-19:
  NAT simétrico (mesmo socket, porta externa diferente por destino). Não é
  sinalização e não é bloqueio de UDP. A correção seria TURN escutando na 443,
  já que só 80 e 443 saem daquela rede.
  **Decisão: não consertar.** Exigiria servidor TURN mantido, quebrando a
  premissa "sem servidor". Vão jogar de casa.

- **Probe de custo de codificação de tela** — 2026-08-20, notebook de 8 núcleos:
  - Com 1-2 assistindo (o caso real), o custo é ~0,3-0,45 núcleo. Folga grande.
  - O que custa é **resolução**, não número de assistentes: até 720p o custo
    quase não mexe; em 1080p salta ~3×.
  - No automático o Chrome escolhe VP8 e cai em `libvpx` (software). Pedindo
    H.264 explicitamente, ele usa o **Intel Quick Sync** do chip.
  - As duas rodadas não são comparáveis entre si (resoluções diferentes, e
    `ms/quadro` mede coisas diferentes em hardware e software). A conclusão
    firme é só a existência do encoder de hardware.

## Ciclo concluído — sala neutra + call

Fechado. Fica registrado porque as decisões abaixo continuam valendo, e porque
duas delas foram revistas depois (marcadas com ⚠️).

**Sala neutra + call 1:1 (voz e tela).** Abordagem A: a sala passa a ser dona
da conexão, com jogo e call como módulos opcionais e independentes por cima.

| Seção do design | Estado |
|---|---|
| 1 — camada Sala e o que não muda | aprovada |
| 2 — módulo de call por dentro | aprovada |
| 3 — UI da sala | aprovada |
| 4 — erros e casos de borda | aprovada |
| 5 — testes | aprovada |
| documento em `docs/superpowers/specs/` | escrito, aguardando revisão |
| plano de implementação | escrito (parte 1 de 2) |
| execução do plano 1 | **feita** |
| plano 2 — a call | escrito |
| execução do plano 2 | **feita** — 420 testes passando |

- Spec: `docs/superpowers/specs/2026-08-21-sala-e-call-design.md`
- Plano 1 — sala neutra: `docs/superpowers/plans/2026-08-21-sala-neutra.md`
- Plano 2 — a call: `docs/superpowers/plans/2026-08-21-call-voz-e-tela.md`

O plano 1 entregou: transporte partido em `criarSalaTrystero` +
`criarTransporte` (e testável pela primeira vez), `ui/sala.ts` renomeado para
`ui/codigo.ts`, a tela da sala com quem está presente, e o `main.ts` montando
uma sala em vez de uma partida. Nenhuma regra de jogo foi tocada. Tudo isso já
foi visto em uso real, com amigos, em máquinas diferentes.

O spec foi partido em dois planos porque a reestruturação da sala entrega
software funcionando sozinha, sem nenhuma mídia. O passo de confirmar se dá
para forçar H.264 pelo Trystero saiu do começo (onde a §13 do spec o punha) e
virou a primeira tarefa do plano 2 — ele não bloqueia a reestruturação.

Decisões já tomadas neste ciclo:

- Tudo dentro do Topaz, não em repositório separado.
- Call e jogo rodam ao mesmo tempo, mas **nenhum é pré-requisito do outro**.
- Primeira fatia é **1:1**, voz + tela, **sem câmera**.
- Sala vira espaço neutro; a mesa é algo que se abre lá dentro.
- Regras do jogo (`src/game/`) e a `Sessao` não são tocadas.
- Mídia **não** entra na interface `Transporte` — ela sustenta a rede falsa que
  testa quase tudo, e `MediaStream` não se finge honestamente ali.
- **Assinatura explícita**: compartilhar tela não liga o encoder; só quando
  alguém pede para assistir.
- Anti-ruído: começa com o do próprio navegador (`noiseSuppression` etc.).
- Qualidade padrão 720p, com 1080p opcional. `contentHint` exposto.
  ⚠️ Revisto em 2026-08-24: o padrão passou a ser **1080p**. Ver "Pronto".
- **Seletor de microfone**, trocável no meio da call via `replaceTrack` (sem
  renegociar). Junto vai o seletor de saída de áudio, que é a mesma UI.
  ✅ Os dois foram feitos. O de saída não aparece em navegador sem `setSinkId`
  (Safari, Firefox antigo): um seletor que não muda nada é pior que nenhum.
- Coexistência de mesa e tela resolvida por **Picture-in-Picture nativo**, com
  vídeo flutuante em página como padrão.
- **Celular: a call não funciona**, e a interface diz isso sem rodeios. O
  blackjack continua funcionando no celular como hoje.
- Sem trava artificial de 2 pessoas: a call funciona com 3-4 naturalmente, mas
  só 1:1 é prometido, porque só isso será testado.

Risco do H.264 **resolvido em 2026-08-21**, com sonda de duas abas ligadas por
Trystero real:

- `sender.setParameters` com `encodings[0].codec` troca o codec **com a conexão
  de pé, sem renegociar**. VP8 → H.264 confirmado nas duas pontas.
- `setCodecPreferences` não serve, e não pelo motivo que eu tinha registrado:
  logo após o `addStream` não existe transceiver nenhum para configurar. A
  janela apertada que eu supunha simplesmente não existe.
- **Em aberto:** a sonda devolveu `encoderImplementation` vazio, então não está
  provado que o Quick Sync entra por esse caminho. É inferência a partir da
  sonda anterior, não medição. Fica para a verificação manual.

## Privacidade e desconfiança do que vem da rede

Levantamento e correções em 2026-08-24. O relato completo, com o que **não**
dá para fechar sem servidor, está no Capítulo 8 do
[diário de bordo](diario-de-bordo.md).

- **Fontes servidas pelo próprio site.** O `<link>` para o Google Fonts
  entregava a um terceiro o IP e a visita a cada carregamento. Era o único
  terceiro dispensável do projeto.
- **CSP e `referrer: no-referrer`** no `index.html`. `frame-ancestors` fica de
  fora: só funciona como cabeçalho HTTP, e o GitHub Pages não permite definir
  cabeçalhos.
- **Código de sala de 8 para 16 caracteres** (~40 → ~79 bits), mostrado
  agrupado (`K7X2-QW9F-M3PR-TVN4`). O código é a senha da sala e é atacável
  offline: o relay vê o tópico como um SHA-256 de passada única, então
  adivinhar é varrer o espaço sem falar com ninguém.
- **Guardas no que chega** — `ehEstadoPlausivel` antes de adotar estado, corte
  de texto do chat por quem recebe, e busca de elementos por comparação de
  string em vez de seletor CSS com `peerId` interpolado.
- **Vazamento de mídia fechado** — tirar um `<video>`/`<audio>` da árvore sem
  zerar o `srcObject` deixava stream e decodificador vivos.

**Limite estrutural registrado:** qualquer peer pode publicar um estado se
declarando anfitrião. Sem servidor não há árbitro; os guardas encarecem, não
eliminam.

## O que falta

### Defeitos conhecidos

- **A conexão reserva não é adotada.** Quando a rede dona de um peer cai, a
  duplicata das outras redes não é promovida — o `onPeerJoin` dela já tinha
  sido ignorado. Ela custa memória e não serve para nada. Fechá-la não é a
  saída: o Trystero reanuncia a cada ~5 s e viraria laço de reconexão.

### Decisão em aberto

- **Manter o MQTT?** Custa 368 kB de bundle e 20 conexões ociosas do pool
  (o Trystero mantém um pool de 20 por estratégia). Em troca, é uma terceira
  via de descoberta. Depende de mais rodadas de teste com o antivírus ligado.

### Ciclo em andamento — identidade, grupos e a reforma da sala

Desenho completo em
`docs/superpowers/specs/2026-08-25-identidade-grupos-e-sala-design.md`.

| PR | O quê | Estado |
|---|---|---|
| 1 | Identidade estável | **feito** |
| 2 | Barra lateral + grupos persistentes | **feito** |
| 3 | Presença entre grupos + mensagem direta | a fazer |
| 4 | Galeria de jogos + configuração da partida | **feito** |
| 5 | Canais de voz | a fazer |
| 6 | Amigos | a fazer |

Decisões que já valem:

- **Um grupo é um marcador local** (nome, código, cor). Quem está no grupo é
  quem está na sala agora.
- **Presença por modo passivo**: ativo no grupo aberto, passivo nos outros.
  Passivo não anuncia, e dois passivos nunca se conectam — grupo vazio custa
  zero conexões. Grupos de fundo entram só no nostr, com menos relays.
- **Canais de voz numa sala só**, com o canal indo no protocolo da call. Uma
  sala por canal exigiria novo handshake a cada troca.
- **A barra lateral substitui o botão "Mesa"**, que pressupõe um jogo só.

### Próximo ciclo grande

- **Grupos persistentes** — salvos no navegador, tipo servidor do Discord.
  Desenhado em
  `docs/superpowers/specs/2026-08-24-home-e-grupos-design.md`: um grupo é um
  **marcador local** (nome, código, cor). Quem está no grupo é quem está na
  sala agora. A home já foi feita para receber a faixa "Seus grupos" acima da
  apresentação.
- **Iniciar o jogo direto do grupo**, sem passar pela sala de espera. Depende
  dos grupos.

### Adiado de propósito

Nada aqui é defeito; são coisas que cabem depois.

- **Tela cheia na janela flutuante** — pedido de uso, e **fora do alcance da
  plataforma**: a janela do Picture-in-Picture é desenhada pelo navegador, e a
  API não permite acrescentar botão nenhum a ela. A alternativa real é o
  *Document Picture-in-Picture* (Chrome/Edge 116+), que abre uma janelinha com
  HTML nosso dentro — mas mesmo nela o navegador não deixa ir a tela cheia; o
  que daria é um botão "abrir em tela cheia" que fecha a flutuante e amplia na
  aba. Adiado por decisão do dono do projeto.
- **Trocar identidade e sair** fora da home — os controles existem, mas o
  lugar natural deles é a aba Configurações da barra lateral (PR 2).
- **Exportar identidade entre máquinas sem digitar** — hoje é copiar e colar o
  segredo. Um QR code resolveria, e é ciclo próprio.
- **Foto na mesa e no chat** — hoje ela só aparece na fileira de participantes
  da call. Levá-la para a lista da sala e para as linhas do chat é o passo
  natural, mas cada lugar tem uma forma diferente e merece cuidado próprio.
- **Compartilhar o estado do microfone** — hoje a fileira de participantes só
  sabe se **eu** estou mudo ou sem microfone; o dos outros não trafega. Mostrar
  o ícone deles exigiria mandar isso pelo protocolo da call.

- **Degradar a tela conforme o número de espectadores** — a malha é N²: quem
  compartilha sobe uma cópia por pessoa que assiste. Em 1080p são 6 Mbps cada,
  então quatro espectadores são 24 Mbps de subida. A maior otimização já está
  feita (assinatura explícita); o que falta é cair de resolução sozinho em vez
  de travar.
- **RNNoise em WASM** — anti-ruído bem melhor que o do navegador, mas é
  integração de AudioWorklet e merece ciclo próprio.
- **Câmera** — fora da primeira versão; o código de mídia é genérico o
  bastante para aceitar depois.
- **Camada espacial tipo Gather** — bonequinho andando, áudio por proximidade.
  Depende dos grupos existirem.
- **Mais de 5 pessoas com todos compartilhando tela** — exigiria SFU ou
  WebCodecs. Só se um dia fizer falta.
- **Celular** — a call não funciona, e a interface diz isso sem rodeios. O
  blackjack continua funcionando.
- **Rede da faculdade** — decidido não consertar; exigiria TURN. Ver
  "Investigado e encerrado".
