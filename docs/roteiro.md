# Roteiro

Onde o projeto está, o que já foi decidido e o que falta. Atualizado conforme
as coisas andam — não é plano de implementação (esses vivem em
`docs/superpowers/plans/`), é o mapa de cima.

## Pronto

- **Blackjack multijogador** — regras completas, eleição e migração de
  anfitrião, reconexão, partida com eliminação. Na `main`.
- **Chat da sala** — texto livre, canal próprio fora do estado do jogo, painel
  que sobrevive aos re-renders da mesa.
  ⚠️ Está na branch `chat-da-sala`, commitada e no remoto, **ainda não mergeada
  na `main`** — ou seja, ainda não está no ar.

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

## Em desenho agora

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

- Spec: `docs/superpowers/specs/2026-08-21-sala-e-call-design.md`
- Plano 1 — sala neutra: `docs/superpowers/plans/2026-08-21-sala-neutra.md`
- Plano 2 — a call: a escrever, depois que o plano 1 estiver executado

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
- **Seletor de microfone**, trocável no meio da call via `replaceTrack` (sem
  renegociar). Junto vai o seletor de saída de áudio, que é a mesma UI.
- Coexistência de mesa e tela resolvida por **Picture-in-Picture nativo**, com
  vídeo flutuante em página como padrão.
- **Celular: a call não funciona**, e a interface diz isso sem rodeios. O
  blackjack continua funcionando no celular como hoje.
- Sem trava artificial de 2 pessoas: a call funciona com 3-4 naturalmente, mas
  só 1:1 é prometido, porque só isso será testado.

Risco declarado: **forçar H.264 pode não ser possível através do Trystero**,
porque ele negocia sozinho no `addStream` e a janela para
`setCodecPreferences` é apertada. Primeiro passo da implementação é confirmar
isso. Se não der, fica no codec padrão — chato, não fatal para 1:1.

## Adiado de propósito

Nada aqui é defeito; são coisas que cabem depois.

- **Áudio do sistema junto com a tela** — irregular entre plataformas e cria
  eco com o microfone aberto. Custo: assistir vídeo junto não funciona direito
  (imagem sim, som não).
- **RNNoise em WASM** — anti-ruído bem melhor que o do navegador, mas é
  integração de AudioWorklet e merece ciclo próprio.
- **Câmera** — fora da primeira versão; o código de mídia fica genérico o
  bastante para aceitar depois.
- **Grupos persistentes** — salvos no navegador, tipo servidor do Discord.
  Próximo ciclo de design, por cima desta base.
- **Iniciar o jogo direto do grupo**, sem passar pela sala de espera. Depende
  dos grupos.
- **Camada espacial tipo Gather** — bonequinho andando, áudio por proximidade.
  Depende da call e dos grupos existirem.
- **Mais de 5 pessoas com todos compartilhando tela** — exigiria SFU ou
  WebCodecs. Só se um dia fizer falta.
