# Identidade, grupos e a reforma da sala

Ciclo grande, em vários PRs. Este documento guarda as decisões e por que foram
tomadas — inclusive as que contrariam o que eu recomendei.

## O mapa do ciclo

| PR | O quê | Depende de |
|---|---|---|
| 1 | **Identidade estável** — par de chaves no navegador | — |
| 2 | **Barra lateral + grupos persistentes** | 1 |
| 3 | **Presença entre grupos + mensagem direta** | 1, 2 |
| 4 | **Galeria de jogos + configuração da partida** | 2 |
| 5 | **Canais de voz** | 2 |
| 6 | **Amigos** | 1, 3 |

A identidade vem primeiro por decisão do dono do projeto, contra a minha
recomendação de adiá-la. O argumento dele é bom: tudo daqui para frente —
grupos, presença, amigos, "quem é essa pessoa" — se apoia em saber quem é
quem, e construir isso depois significaria remendar cada peça.

Ela não tem tela própria. Por isso é um PR sozinho: junto com a reforma visual
daria um diff grande demais para alguém revisar de verdade.

---

## 1. Por que não dá para ter amigos hoje

O `selfId` do Trystero **nasce a cada carregamento da página**. Ele identifica
uma aba, não uma pessoa. "Adicionar amigo" não teria o que guardar, e a lista
apontaria para ninguém no dia seguinte.

Guardar o IP foi cogitado e descartado: IP não identifica pessoa (muda, e várias
pessoas dividem o mesmo atrás de NAT), e guardar endereço de gente numa lista
local é ruim por si só.

## 2. A identidade é um par de chaves local

Gerado no primeiro acesso, guardado no navegador. A **chave pública** é a
identidade; a privada nunca sai dali.

Isso resolve dois problemas de uma vez:

- **Continuidade**: a mesma pessoa é reconhecível entre sessões.
- **Prova**: como ela pode assinar um desafio, dá para *verificar* em vez de
  acreditar. Hoje o apelido é auto-declarado e ninguém confere.

### Chave não extraível, no IndexedDB

Decisão importante: a chave é gerada com `extractable: false` e guardada como
`CryptoKey` no **IndexedDB**, não como texto no `localStorage`.

A diferença é concreta. Uma chave em `localStorage` é texto que qualquer script
da origem consegue ler e levar embora — uma extensão do navegador basta. Um
`CryptoKey` não extraível pode ser **usado** para assinar, mas o material nunca
pode ser lido, nem por nós. Um script hostil na página conseguiria fazer a
pessoa assinar enquanto ela estivesse ali; não conseguiria roubar a identidade
para usar amanhã, de outro lugar.

Custo: IndexedDB é assíncrono e mais chato que `localStorage`. Vale.

### O que é mostrado

Um selo curto derivado da chave pública (`SHA-256`, primeiros bytes, no mesmo
alfabeto sem ambiguidade dos códigos de sala). Ele existe para duas pessoas
poderem comparar "é você mesmo?" quando importar.

### O limite, dito na cara

A identidade é **por dispositivo**. Entrar do celular é ser outra pessoa aos
olhos do sistema. É o mesmo preço dos grupos e da foto, e a interface não deve
fingir o contrário. Exportar/importar identidade fica registrado como evolução
possível, não como falta.

## 3. Presença entre grupos (decidido: modo econômico)

A ideia é carregar todos os grupos salvos ao entrar no site, para ver quem está
online em cada um.

O que viabiliza isso é o **modo passivo** do Trystero. Medido em
`signal-handler.mjs:385`:

```js
if (ctx.isPassive && remoteIsPassive) return
```

Quem entra passivo **não anuncia** e não pré-fabrica conexões — só escuta. E
dois passivos nunca se conectam. Então:

- Você entra **ativo** no grupo que abriu e **passivo** nos outros salvos.
- O tráfego de anúncio não multiplica por número de grupos.
- Grupo sem ninguém dentro custa **zero conexões**.
- "Online no grupo X" passa a significar *está no grupo X* — mais honesto que
  "está no site em algum lugar".

O custo que sobra é assinatura em relay: cada grupo assina relays em cada rede.
Presença é melhor-esforço; a sala em que a pessoa está não é. Relay foi a peça
que mais custou para funcionar, e ela não pode ser ameaçada por um enfeite.

### ⚠️ Emendas de 2026-08-27, todas por medição

Três coisas que este desenho dizia deixaram de valer. Ficam registradas em vez
de reescritas, porque o motivo de cada uma custou caro.

**1. Não é "só no nostr e com menos relays". São as três redes, redundância
normal.** Era a economia que parecia sensata e foi o que fez a presença nunca
ver ninguém: as máquinas do teste se acham por **mqtt**. O diagnóstico que
provou está no Capítulo 13 do diário. E "menos relays" era economia falsa — os
sockets são compartilhados por estratégia.

**2. A sala de presença tem id PRÓPRIO: `codigo#presenca`.** O desenho original
não dizia nada sobre isso, e é a peça que faltava. O Trystero indexa
`occupiedRooms` só pelo `roomId` e devolve a sala já aberta ignorando a config
(`strategy.ts:213`): com o mesmo código nas duas salas, entrar no grupo
devolvia a sala de fundo **passiva**, que não anuncia nem pré-fabrica ofertas.
Medido: `mesmoObjeto: true`, `isPassive: true`, zero conexões. Era o "trocar de
grupo está lento e inconstante" — e não era a presença atrapalhando de fora,
era o app entrando na sala errada.

**3. Presença não se infere de conexão: se declara.** O modo passivo tem uma
propriedade que o desenho não previa — uma sala passiva **se ativa** ao receber
um anúncio (`signal-handler.ts:807` → `requeueAnnounce`) e, a partir daí,
**também anuncia**. Dois observadores do mesmo grupo passam a se enxergar, e a
conta vira "quantos estão OLHANDO o grupo". Medido: grupo vazio marcando
"1 pessoa online". Quem está no grupo agora manda uma ação `aqui`; quem só
observa fica calado, e só a declaração conta.

## 4. Canais de voz: uma sala, não várias

Cada canal **não** vira uma sala do Trystero. O protocolo da call já publica
mídia por destinatário — basta cada pessoa anunciar em que canal está, e o
microfone ir só para quem está no mesmo canal.

Uma sala por canal seria pior em tudo: novo handshake a cada troca, e ninguém
enxergaria quem está nos outros canais.

Os canais **não são persistentes**, por pedido: eles existem enquanto a sala
existe.

## 5. A barra lateral substitui o botão "Mesa"

O botão "Mesa" pressupõe **um** jogo. Vão existir mais. A barra lateral passa a
ser a navegação da sala, com abas:

- **Sala** — quem está, a call, o chat
- **Jogos** — a galeria; a mesa aberta é o conteúdo do palco
- **Configurações** — apelido e foto trocáveis a qualquer momento (hoje só na
  entrada), e as regras da partida

### O defeito concreto que motiva "configurar a partida"

O blackjack termina quando alguém chega a 1500 fichas. Começando com 1000, uma
aposta de 500 ganha na primeira mão **encerra a partida**. O alvo, as fichas
iniciais e a aposta máxima precisam ser configuráveis pelo anfitrião.

## 6. O que NÃO muda

- Regras do jogo (`src/game/`) continuam puras e sem saber de rede.
- As três redes de descoberta da sala ativa.
- O código de sala, o CSP, os guardas do que chega da rede.
