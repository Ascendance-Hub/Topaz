# Topaz — Blackjack multiplayer P2P

**Data:** 2026-08-15
**Status:** aprovado, pronto para plano de implementação

---

## 1. Visão geral

Topaz é um hub de jogos de mesa para jogar com amigos, hospedado como site
estático no GitHub Pages. Não há servidor, backend ou banco de dados: os
navegadores dos jogadores se conectam diretamente entre si via WebRTC.

O primeiro jogo é o blackjack, construído como fatia vertical — completo e
jogável — com netcode e UI de cartas já isolados em módulos próprios, mas
deliberadamente **não generalizados** até que um segundo jogo exista para
provar a abstração.

Publicação: `https://ascendance-hub.github.io/Topaz/`

### Fluxo do usuário

1. Abre o site, escolhe um apelido (guardado em `localStorage`)
2. Cria uma sala e recebe um link com o código no hash: `#sala=K7X2Q`
3. Manda o link para os amigos
4. Eles abrem, entram na sala e jogam

---

## 2. Não-objetivos

Explicitamente fora de escopo nesta entrega:

- Poker, xadrez ou qualquer segundo jogo
- Netcode genérico multi-jogo (será extraído quando o jogo 2 existir)
- Persistência de fichas entre sessões
- Contas, login ou identidade durável
- Apostas com valor real
- Proteção criptográfica contra trapaça do host
- Chat de texto ou voz
- Partidas públicas ou matchmaking

---

## 3. Decisões tomadas

| Decisão | Escolha | Razão |
|---|---|---|
| Transporte | Trystero (estratégia Nostr) | Sem cadastro, sem chave, sem servidor próprio |
| Autoridade | Host autoritativo, snapshot completo | Estado é minúsculo; elimina dessincronização e barateia migração |
| Queda do host | Migração automática | Uma queda de wifi não pode encerrar a partida de todos |
| Regras | Completas: hit, stand, double, split, seguro | Pedido explícito |
| Fichas | 1000 por jogador, por sala, sem persistência | Sem saldo autoritativo possível; evita desvantagem inicial |
| Lugares | 7 na mesa, excedente vira espectador | Padrão de cassino; acima disso a espera fica longa demais |
| Jogador ausente | Relógio de 30s com ação automática | Mesa não pode travar por causa de um celular bloqueado |
| Stack | TypeScript + Vite + vitest, sem framework | Estado→render simples; animação CSS sem brigar com ciclo de vida |
| Layout | Grade para os outros, painel dedicado para você | Junta o aproveitamento de tela da grade com o foco na própria mão |

---

## 4. Arquitetura

```
src/
  game/      regras puras — sem rede, sem DOM
    shoe.ts        sapata: criar, embaralhar, comprar, reconstruir
    hand.ts        avaliação de mão (soft/hard, blackjack, estouro)
    rules.ts       ações válidas, pagamentos
    machine.ts     máquina de estados da rodada
    types.ts
  net/       rede e autoridade
    transport.ts   fachada sobre o Trystero
    host.ts        eleição, validação de ação, broadcast
    client.ts      envio de intenção, aplicação de snapshot
    migration.ts   detecção de queda e reconstrução
  ui/        apresentação
    render.ts      estado → DOM
    animate.ts     FLIP para distribuição e viradas
    components/    mesa, peça de jogador, painel próprio, lobby
    theme.css      tokens da paleta topázio
  main.ts    fiação
```

**Regra estrutural inegociável:** `game/` não importa nada de `net/` nem de
`ui/`. Recebe estado e ação, devolve estado novo. É o que torna as regras
testáveis sem navegador e o que permitirá plugar um segundo jogo sem
reescrever a camada de rede.

---

## 5. Modelo de dados

```ts
type Naipe = 'copas' | 'ouros' | 'paus' | 'espadas'
type Valor = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'
type Carta = { naipe: Naipe; valor: Valor }

type Mao = {
  id: string
  cartas: Carta[]
  aposta: number
  dobrada: boolean
  vindaDeSplit: boolean
  encerrada: boolean
  resultado?: 'ganhou' | 'perdeu' | 'empatou' | 'blackjack'
}

type Jogador = {
  peerId: string
  apelido: string
  cadeira: number | null      // null = espectador
  fichas: number
  maos: Mao[]
  maoAtiva: number
  seguro: number              // 0 = não contratou
  rodadasInativo: number
}

type Fase = 'aguardando' | 'apostas' | 'distribuindo'
          | 'turnos' | 'dealer' | 'acerto'

type EstadoJogo = {
  fase: Fase
  jogadores: Jogador[]
  ordemCadeiras: number[]
  vezDe: string | null        // peerId
  prazoTurno: number | null   // timestamp
  maoDealer: Carta[]          // carta oculta NUNCA presente aqui
  dealerTemOculta: boolean
  cartasRestantes: number
  hostAtual: string
  rodada: number
}
```

A sapata (`Carta[]` completo) vive **apenas na memória do host** e nunca entra
em `EstadoJogo`. Ela não é serializada nem transmitida.

---

## 6. Máquina de estados da rodada

```
aguardando ──(2+ jogadores)──> apostas
apostas ──(todos apostaram ou 30s)──> distribuindo
distribuindo ──(2 cartas cada + 1 dealer visível)──> turnos
turnos ──(todas as mãos encerradas)──> dealer
dealer ──(dealer parou ou estourou)──> acerto
acerto ──(pagamentos aplicados)──> apostas
```

**Seguro** é oferecido na entrada de `turnos`, apenas quando a carta visível do
dealer é um Ás, com janela própria antes do primeiro turno.

**Split** cria mãos-filhas dentro do turno do jogador. Cada mão é jogada até
parar ou estourar antes de passar para a próxima. Um jogador com 3 mãos joga as
3 em sequência, e o relógio de 30s reinicia a cada mão.

---

## 7. Netcode

### Eleição de host

O host é o jogador com o menor `peerId` da sala, em ordem lexicográfica. Todo
cliente calcula isso localmente a partir da lista de peers — não há negociação,
handshake ou votação. Se dois clientes têm a mesma lista, chegam à mesma
resposta.

### Protocolo

Dois canais Trystero apenas:

| Canal | Direção | Conteúdo |
|---|---|---|
| `acao` | cliente → host | `{ tipo, maoId?, valor? }` |
| `estado` | host → todos | `EstadoJogo` completo |

O cliente envia **intenção**, nunca resultado. O host valida contra
`rules.ts`, aplica, e transmite o snapshot. Ação inválida é descartada em
silêncio — o snapshot seguinte já corrige a tela do cliente.

### Migração de host

1. `onPeerLeave` dispara em todos os clientes
2. Cada um remove o peer e recalcula a eleição
3. Quem se descobre novo host reconstrói a sapata: baralho completo de 6,
   menos todas as cartas visíveis no último snapshot, embaralhado
4. Se havia carta oculta do dealer, o novo host compra uma nova da sapata
   reconstruída — ninguém a tinha visto, então a substituição é indetectável
5. O novo host transmite o snapshot e a partida segue da mão atual

Se o host cair no meio de `distribuindo` ou `acerto`, o novo host reexecuta a
fase inteira a partir do último snapshot íntegro.

### Jogador ausente

Relógio de 30s por mão, com barra visível. Ao expirar, o host aplica `parar`
automaticamente. Duas rodadas consecutivas sem ação manual: o jogador vira
espectador e a cadeira é liberada. Ele pode voltar a sentar quando quiser.

### Reconexão

Ao voltar para a mesma sala com o mesmo apelido dentro de 60s, o jogador
recupera cadeira e fichas. Passado esse prazo, entra como jogador novo com
stack inicial.

---

## 8. Regras da casa

- 6 baralhos em sapata; reembaralha quando restam menos de 25%
- Dealer **para** em 17, inclusive soft 17
- Blackjack natural paga **3:2**; seguro paga 2:1
- Dobrar permitido em quaisquer 2 cartas, inclusive após split
- Split até 3 mãos (2 re-splits)
- Par de Ases separado recebe exatamente 1 carta por mão
- 21 formado após split **não** conta como blackjack natural
- Sem *surrender*
- Empate devolve a aposta
- Stack inicial: 1000 fichas; quem zera recebe rebuy automático de 1000
- Fichas de 25, 100 e 500; aposta mínima 25, máxima 500 por mão
- Quem não apostar dentro dos 30s da fase de apostas fica de fora da rodada
  (sem penalidade) e volta a apostar na rodada seguinte

---

## 9. Design system

Paleta ancorada no topázio imperial (âmbar-dourado), que dá nome ao repositório.
O feltro verde é exclusivo das mesas de carteado; a identidade do hub e dos
demais jogos é topázio sobre carvão.

```css
:root {
  /* topázio — identidade do hub */
  --topazio-300: #FFCE6B;
  --topazio-400: #F5B942;
  --topazio-500: #E8A317;   /* primária */
  --topazio-600: #C9A227;   /* dourado da mesa */
  --topazio-700: #A4801A;
  --topazio-900: #4A3A0E;

  /* feltro — só mesas de carteado */
  --feltro-400: #1D5641;
  --feltro-600: #123528;
  --feltro-800: #0B2117;

  /* neutros */
  --carvao-900: #0E0F12;
  --carvao-700: #1A1C21;
  --carvao-500: #2A2E36;
  --texto:      #EFE6CF;
  --texto-fraco:#CFC4A4;

  /* cartas */
  --carta-face:     #F6F1E3;
  --carta-borda:    #D8CDB0;
  --naipe-vermelho: #A3232A;
  --carta-verso:    repeating-linear-gradient(45deg,#7C1D22 0 4px,#651418 4px 8px);
}
```

**Tipografia:** serifada (Georgia) para títulos, nomes e botões — é o que dá o
ar de clube privado. Números de fichas e totais em `font-variant-numeric:
tabular-nums`, para não dançarem ao mudar.

---

## 10. Layout da mesa

Três faixas verticais:

1. **Dealer** no topo, centralizado, cartas ligeiramente maiores, com a
   indicação do que está mostrando
2. **Grade dos outros jogadores** — até 6 peças, `repeat(auto-fit, …)` com
   máximo de 3 colunas no desktop e 2 no celular
3. **Painel próprio** embaixo — moldura em topázio, cartas grandes, fichas,
   aposta e os botões de ação logo abaixo

Adaptação por lotação:

| Outros jogadores | Grade |
|---|---|
| 0 | oculta; aparece "aguardando jogadores…" com o link da sala |
| 1–3 | uma linha centralizada, peças maiores |
| 4–6 | duas linhas (3+3 desktop, 2+2+2 celular) |

Cadeiras vazias não são renderizadas. Cada peça mostra estado explícito —
`jogando…`, `parou`, `estourou` — e quem já agiu fica esmaecido, para o olho ir
direto a quem falta. Mãos com muitas cartas sobrepõem em leque, mantendo a peça
com largura estável.

---

## 11. Animação

Técnica FLIP com `transform` e `transition`, sem biblioteca:

- **Distribuição:** carta nasce na posição da sapata e voa até a mão; cascata de
  ~90ms entre cartas
- **Virada da oculta:** `rotateY` de 300ms
- **Fichas:** contador interpolado ao mudar o saldo
- **Vez do jogador:** pulso suave na borda em topázio

Tudo respeitando `prefers-reduced-motion`, que corta as transições e mantém só o
estado final.

---

## 12. Testes

`game/` é escrito por TDD com vitest — é onde moram os erros que estragam
partida:

- Ás valendo 1 ou 11 na mesma mão (mão soft virando hard ao estourar)
- Blackjack natural *versus* 21 com três cartas
- 21 após split não sendo blackjack
- Split de Ases recebendo exatamente uma carta
- Pagamento de seguro com e sem blackjack do dealer
- Dobrar após split
- Empate devolvendo aposta
- Reembaralhamento no limiar de 25%
- Reconstrução da sapata na migração produzindo composição correta

`net/` é testado com um transporte falso em memória, sem navegador: eleição de
host, rejeição de ação inválida, migração no meio da rodada, expiração de
relógio.

Cobertura não é meta numérica; a meta é que toda regra da seção 8 tenha um teste
que falha se ela for violada.

---

## 13. Deploy

GitHub Actions em push na `main`: build com Vite e publicação no GitHub Pages.

Dois detalhes que quebram silenciosamente se esquecidos:

- `base: '/Topaz/'` no `vite.config.ts` — sem isso os assets apontam para a raiz
  do domínio e a página sobe em branco
- O código da sala vai no **hash** (`#sala=K7X2Q`), nunca no path — o Pages não
  tem rewrite, então qualquer rota real daria 404 ao recarregar

---

## 14. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Host consegue inspecionar a sapata pelo DevTools | Aceito: sem apostas reais, e a alternativa criptográfica não se paga |
| Relay Nostr público fora do ar | Trystero aceita trocar de estratégia com uma linha; Firebase/Supabase como plano B |
| Rede restritiva impede conexão direta | Sem TURN próprio, esses casos falham; mensagem de erro clara em vez de tela travada |
| Migração de host em cascata (vários saem juntos) | Eleição é determinística e reexecuta a cada saída; converge |
| IP visível entre pares | Inerente ao WebRTC; mitigado por código de sala longo e aleatório |
