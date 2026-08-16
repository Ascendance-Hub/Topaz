# Topaz — Sala de espera, eliminação e fim de partida

**Data:** 2026-08-16
**Status:** aprovado, pronto para plano de implementação
**Antecede:** `2026-08-15-blackjack-topaz-design.md`

---

## 1. Por que

O jogo foi publicado e jogado. O feedback veio de uso real, não de suposição:

- O botão **"Sentar à mesa"** inicia a partida no instante em que o anfitrião
  clica. Não existe sala de espera, então não há como aguardar os amigos
  chegarem.
- **As fontes são pequenas demais.** As fichas — o dado mais importante depois
  das cartas — estão em 10,5px, o menor texto da tela.
- **Ninguém sabe o que são Dobrar, Dividir e Seguro** sem já conhecer blackjack.
- **É impossível quebrar.** Existe rebuy automático em dois lugares, então as
  fichas não têm peso: perder não custa nada.
- **A partida nunca acaba.** Rodadas se sucedem indefinidamente, sem vencedor.

---

## 2. Escopo

Cinco mudanças, nesta ordem de dependência:

1. Sala de espera com início controlado pelo anfitrião
2. Eliminação por falta de fichas
3. Fim de partida, vencedor e placar
4. Legibilidade (tamanhos e destaque das fichas)
5. Painel de ajuda das jogadas

---

## 3. Não-objetivos

- Rebuy, mesmo limitado. Eliminação é definitiva dentro da partida.
- Torneio com vários rounds, blinds crescentes ou premiação.
- Histórico de partidas entre sessões.
- Legenda permanente sob os botões — deliberadamente recusada: atrapalha quem
  já sabe jogar, e a partida inteira é jogada por quem já aprendeu.
- Espectadores continuam sem representação visual na mesa (pendência anterior,
  não abordada aqui).

---

## 4. Sala de espera

`aguardando` deixa de avançar sozinha. Hoje `transicionar` move para `apostas`
assim que **um** jogador senta; isso sai.

- Todos veem quem já está sentado e podem sentar livremente.
- Só o anfitrião vê **Iniciar partida**. Os demais veem *"aguardando o anfitrião
  iniciar"*.
- Iniciar exige ao menos **um** jogador sentado. Jogar sozinho é permitido.
- Ao iniciar, os `peerId` dos sentados são gravados em `naPartida`, e a fase vai
  para `apostas`.

### Quem pode sentar, e quando

| Situação | Pode sentar? |
|---|---|
| Fase `aguardando` | sim, qualquer um |
| Em partida, estava em `naPartida`, tem fichas, não eliminado | sim |
| Em partida, nunca entrou na partida | não |
| Eliminado | não, até a próxima partida |

A segunda linha existe para quem perdeu a cadeira por inatividade — celular
bloqueado, aba em segundo plano — e volta. A terceira impede que um retardatário
entre com 1000 fichas numa partida onde os outros já lutaram até 400.

---

## 5. Eliminação

Os dois rebuys automáticos são removidos: o de `sentar` e o de `limparRodada`.

No acerto de cada rodada, depois dos pagamentos, todo jogador **sentado** com
`fichas < REGRAS.apostaMin` é eliminado:

- perde a cadeira (`cadeira = null`)
- ganha `eliminadoEm = estado.rodada`
- continua na sala como espectador, vendo o jogo

O limiar é a aposta mínima, não zero: com 20 fichas o jogador não consegue mais
apostar, então já está fora na prática.

---

## 6. Fim de partida

Verificado no acerto, **depois** das eliminações da rodada, nesta ordem:

1. **Algum jogador tem `fichas >= REGRAS.alvoVitoria`** → vence
2. **Sobrou exatamente um jogador apto** → vence
3. **Nenhum jogador está apto** → sem vencedor

A regra 2 só se aplica quando `naPartida.length >= 2`. Jogando sozinho ela nunca
dispara: o solitário joga até atingir o alvo (ganhou) ou até quebrar (perdeu,
pela regra 3).

**"Apto" significa:** está em `naPartida`, não foi eliminado e tem
`fichas >= REGRAS.apostaMin` — **esteja sentado ou não.** Quem perdeu a cadeira
por inatividade mas ainda tem fichas continua contando, porque pode voltar a
sentar. A consequência é que a partida não termina enquanto essa pessoa estiver
na sala; se ela fechar a aba, a purga de desconectados a remove de `jogadores`
depois de `REGRAS.segundosReconexao` e a contagem se resolve sozinha.

**Se dois ou mais cruzarem o alvo na mesma rodada**, vence quem tiver mais
fichas. Empate exato em fichas é empate de verdade: `vencedor` fica `null` e os
empatados aparecem juntos no topo do placar, como no caso 3.

A fase vai para `fim`, e `vencedor` recebe o `peerId` do vencedor ou `null`.

### Placar

A posição é dada pela **rodada em que o jogador caiu** — quem aguentou mais fica
melhor colocado. Quem caiu na **mesma rodada empata**, sem critério de
desempate, e a numeração segue a convenção de competição (a posição seguinte
pula as empatadas).

Ordem de classificação:

1. o vencedor, se houver
2. sobreviventes com fichas, por saldo decrescente
3. eliminados, por `eliminadoEm` decrescente, empatando os de mesma rodada

O caso 3 do fim de partida só ocorre quando os últimos sobreviventes quebram
**na mesma rodada** — todos apostaram e perderam juntos. Nesse caso não há
vencedor, e eles aparecem empatados no topo do placar:

```
1º  Bruno     0  ┐
1º  Alex      0  ├ eliminados na rodada 20 — empate real
1º  Carla     0  ┘
4º  Duda      0    eliminada na rodada 6
```

### Nova partida

Só o anfitrião vê **Nova partida**, disponível apenas na fase `fim`. Ela devolve
todos à sala de espera: fichas em `REGRAS.stackInicial`, `eliminadoEm` limpo,
`naPartida` vazio, `vencedor` nulo, cadeiras liberadas, `rodada` em 1.

Ser anfitrião é papel de rede, não de jogo: um anfitrião eliminado continua
anfitrião e continua podendo reiniciar. Se ele sair, a migração de anfitrião já
existente transfere o papel junto com o estado.

---

## 7. Legibilidade

| Elemento | Hoje | Novo |
|---|---|---|
| Fichas | 10,5px | **17px, dentro de um selo** |
| Nome | 11,5px | 15px |
| Total da mão | 10px | 13px |
| Cartas na grade | 32×46px, 13px | 40×57px, 16px |
| Botões | 12,5px | 14,5px |
| Rótulos | 9,5px | 11px |

O selo de fichas é a mudança que responde ao *"não é claro quanto cada um tem"*:
o número deixa de ser texto solto e ganha moldura, contraste e rótulo. Com esses
tamanhos a grade continua cabendo três colunas no desktop e duas no celular.

---

## 8. Painel de ajuda

Um botão **?** na barra de ações abre um painel com as três jogadas que não são
autoexplicativas — Dobrar, Dividir e Seguro — cada uma com o que faz **e quando
vale a pena**, que é o que uma legenda curta não comporta.

Pedir e Parar não entram: quem não sabe descobre no primeiro clique, e explicar
o óbvio faz ninguém ler o resto.

O botão precisa ser visível o bastante para um novato reparar nele sem
atrapalhar quem já sabe.

---

## 9. Modelo de dados

```ts
// REGRAS
alvoVitoria: 1500

// Fase — 'aguardando' muda de semântica, 'fim' é nova
type Fase = 'aguardando' | 'apostas' | 'distribuindo' | 'seguro'
          | 'turnos' | 'dealer' | 'acerto' | 'fim'

// Jogador — campo novo
/** Rodada em que quebrou. `null` = nunca eliminado nesta partida. */
eliminadoEm: number | null

// EstadoJogo — campos novos
/** peerId do vencedor; `null` fora de `fim` ou quando ninguém venceu. */
vencedor: string | null
/** peerIds de quem estava sentado quando a partida começou. */
naPartida: string[]

// Acao — variantes novas, ambas exclusivas do anfitrião
| { tipo: 'iniciar' }
| { tipo: 'novaPartida' }
```

`naPartida` serve a dois propósitos com um campo só: decide quem pode voltar a
sentar durante a partida, e seu tamanho decide se a regra do último sobrevivente
se aplica.

**Atenção:** `machine.test.ts` afere o conjunto exato de chaves de `EstadoJogo`
para garantir que a sapata nunca vaze. Esse teste precisa ser atualizado
deliberadamente com os dois campos novos — não reflexivamente.

---

## 10. Máquina de estados

```
aguardando ──(anfitrião inicia, ≥1 sentado)──> apostas
   ↑                                              │
   │                                     …ciclo da rodada…
   │                                              │
   │                                           acerto
   │                                              │
   │                    ┌─────────────────────────┤
   │                    │                         │
   │            (fim de partida)          (partida continua)
   │                    │                         │
   │                    ▼                         ▼
   └──(nova partida)── fim                     apostas
```

Nenhuma outra transição muda. `acerto` ganha uma bifurcação; todo o resto do
ciclo — apostas, distribuição, seguro, turnos, dealer — fica como está.

---

## 11. Impacto nos testes existentes

A mudança de semântica de `aguardando` quebra todo teste que assume que sentar
inicia a partida. Isso atinge boa parte de `machine.test.ts` e de
`sessao.test.ts`, que montam mesas sentando jogadores e esperam a fase avançar
sozinha.

Esses testes devem ser **ajustados para despachar `iniciar`**, não reescritos
para contornar a nova regra. Um teste que passe a sentar e mexer na fase à mão
para continuar verde é exatamente o antipadrão que deixou dois defeitos críticos
passarem por 199 testes na entrega anterior.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Quem quebra cedo assiste até o fim | Aceito e explicitado ao usuário: é o que dá peso às fichas. O anfitrião pode reiniciar a qualquer momento. |
| Retardatário não consegue entrar na partida em andamento | Deliberado: entrar com 1000 fichas contra quem lutou até 400 seria injusto. O anfitrião reinicia se quiser incluí-lo. |
| Ajuste em massa dos testes existentes esconder regressão | Cada ajuste precisa ser justificado pela nova regra, nunca pela conveniência de ficar verde |
| Fontes maiores quebrarem o layout no celular | A grade cai para duas colunas; verificar em tela estreita antes de fechar |
