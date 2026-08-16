# Melhorias de Partida — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar rodadas infinitas numa partida com começo, eliminação e vencedor, e tornar a mesa legível.

**Architecture:** A máquina de estados ganha duas bordas — `aguardando` deixa de avançar sozinha e passa a esperar o anfitrião, e `fim` encerra a partida com um vencedor. Entre elas, o acerto de cada rodada passa a eliminar quem não pode mais apostar. A classificação final é função pura sobre o estado, testável sem UI. A camada visual só reage: novas fases, nova escala tipográfica e um painel de ajuda.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, happy-dom para os testes de DOM. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-16-melhorias-partida-design.md`

## Global Constraints

- Todo código, identificador, comentário e texto de tela em **português**.
- TypeScript `strict: true`, com `noUncheckedIndexedAccess` e `noUnusedLocals`.
- `src/game/` não importa nada de `src/net/` nem de `src/ui/`; há teste que garante.
- A sapata e a carta oculta do dealer **nunca** entram em `EstadoJogo`. `machine.test.ts` afere o conjunto exato de chaves — atualizar esse teste é ato deliberado de quem adiciona campo, nunca reflexo para ficar verde.
- Constantes de regra vivem só em `REGRAS`. O literal `21` em `rules.ts` é exceção documentada e permanece.
- Toda aleatoriedade passa pelo `Rng` injetado. Sem `Math.random()`.
- Sem `innerHTML` em lugar nenhum.
- `iniciar` e `novaPartida` são exclusivas do anfitrião: `aplicar` recusa quando `peerId !== estado.hostAtual`.
- Ao ajustar teste existente que quebrou, o ajuste tem que ser justificado pela regra nova. Fazer um teste passar mexendo em fase à mão é o antipadrão que deixou dois defeitos críticos passarem por 199 testes na entrega anterior.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Valores fixos do spec: alvo de vitória 1500 · eliminação abaixo de `apostaMin` (25) · stack inicial 1000 · fichas 17px · nome 15px · total 13px · cartas da grade 40×57px/16px · botões 14,5px · rótulos 11px.

---

## Task 1: Campos novos (puramente aditivo)

Nada de comportamento muda aqui. O objetivo é introduzir os campos e a constante
com a suíte inteira permanecendo verde, para que a Task 2 mude semântica sobre
terreno estável.

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/rules.ts`
- Modify: `src/game/machine.ts` (`criarContexto`, `case 'entrar'`)
- Test: `src/game/machine.test.ts` (conjunto de chaves)

**Interfaces:**
- Consumes: nada
- Produces: `REGRAS.alvoVitoria`, `Fase` com `'fim'`, `Jogador.eliminadoEm`, `EstadoJogo.vencedor`, `EstadoJogo.naPartida`, `Acao` com `iniciar` e `novaPartida`

- [ ] **Step 1: Acrescentar a constante em `src/game/rules.ts`**

Dentro de `REGRAS`, depois de `stackInicial`:

```ts
  alvoVitoria: 1500,
```

- [ ] **Step 2: Acrescentar os tipos em `src/game/types.ts`**

Em `Fase`, acrescentar `'fim'` ao fim da união:

```ts
export type Fase =
  | 'aguardando'
  | 'apostas'
  | 'distribuindo'
  | 'seguro'
  | 'turnos'
  | 'dealer'
  | 'acerto'
  | 'fim'
```

Em `Jogador`, acrescentar:

```ts
  /** Rodada em que quebrou. `null` = nunca eliminado nesta partida. */
  eliminadoEm: number | null
```

Em `EstadoJogo`, acrescentar:

```ts
  /** peerId de quem venceu. `null` fora de `fim`, ou quando ninguém venceu. */
  vencedor: string | null
  /** peerIds de quem estava sentado quando o anfitrião iniciou a partida. */
  naPartida: string[]
```

Em `Acao`, acrescentar as duas variantes:

```ts
  | { tipo: 'iniciar' }
  | { tipo: 'novaPartida' }
```

- [ ] **Step 3: Inicializar em `criarContexto`**

Em `src/game/machine.ts`, dentro do objeto `estado` de `criarContexto`, depois de
`proximoIdMao: 1,`:

```ts
      vencedor: null,
      naPartida: [],
```

- [ ] **Step 4: Inicializar no `case 'entrar'`**

No objeto que `estado.jogadores.push(...)` recebe, depois de `decidiuSeguro: false,`:

```ts
        eliminadoEm: null,
```

- [ ] **Step 5: Rodar a suíte e ver os erros de tipo**

Run: `npx tsc --noEmit`
Expected: erros em todo lugar que constrói `Jogador` ou `EstadoJogo` literal — sobretudo os fixtures de teste. É esperado.

- [ ] **Step 6: Corrigir os fixtures**

Acrescentar `eliminadoEm: null` a todo literal de `Jogador` e `vencedor: null, naPartida: []` a todo literal de `EstadoJogo` nos testes. São adições mecânicas; nenhuma asserção muda.

- [ ] **Step 7: Atualizar o teste do conjunto de chaves**

Em `src/game/machine.test.ts`, o teste `'EstadoJogo expõe exatamente as chaves públicas esperadas'` compara `Object.keys(ctx.estado).sort()` com uma lista literal. Acrescentar `'vencedor'` e `'naPartida'` a essa lista.

Este teste existe para impedir que a sapata vaze para a rede. Está sendo alterado porque dois campos públicos foram adicionados de propósito — não para calar uma falha.

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: tudo verde, mesma quantidade de testes de antes.

- [ ] **Step 9: Commit**

```bash
git add src/game/types.ts src/game/rules.ts src/game/machine.ts src/game/machine.test.ts src/net/sessao.test.ts src/ui
git commit -m "feat: campos de partida (alvo, eliminacao, vencedor) sem mudar comportamento"
```

---

## Task 2: Sala de espera e ação `iniciar`

**Files:**
- Modify: `src/game/machine.ts` (`transicionar`, `aplicar`)
- Test: `src/game/machine.test.ts`

**Interfaces:**
- Consumes: `EstadoJogo.naPartida`, `Acao` com `iniciar` (Task 1)
- Produces: `podeSentar(estado, jogador): boolean`; a fase `aguardando` só sai por ação do anfitrião

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/game/machine.test.ts`:

```ts
describe('sala de espera', () => {
  it('sentar não inicia mais a partida sozinho', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
  })

  it('o anfitrião inicia e a partida vai para apostas', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.naPartida).toEqual(['p1'])
  })

  it('quem não é anfitrião não consegue iniciar', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
  })

  it('não inicia com a mesa vazia', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
  })

  it('naPartida registra todos os sentados no momento do início', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p3', { tipo: 'entrar', apelido: 'Carla' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    // Carla entrou na sala mas não sentou antes do início.
    expect(ctx.estado.naPartida.sort()).toEqual(['p1', 'p2'])
  })

  it('quem não entrou na partida não consegue sentar depois que ela começa', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBeNull()
  })

  it('quem estava na partida e perdeu a cadeira consegue voltar a sentar', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'levantar' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- machine`
Expected: FAIL. Os testes de `sala de espera` falham, **e vários testes existentes também** — todos os que sentavam jogadores esperando a fase avançar sozinha. É exatamente o esperado.

- [ ] **Step 3: Remover o avanço automático de `aguardando`**

Em `transicionar`, apagar este bloco inteiro:

```ts
  if (estado.fase === 'aguardando' && sentados(estado).length >= 1) {
    estado.fase = 'apostas'
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
  }
```

- [ ] **Step 4: Acrescentar a guarda de sentar**

Perto dos outros auxiliares de `machine.ts`:

```ts
/**
 * Na sala de espera qualquer um senta. Com a partida em andamento, só volta
 * a sentar quem já estava nela — assim quem perdeu a cadeira por inatividade
 * consegue voltar, mas um retardatário não entra com 1000 fichas numa mesa
 * onde os outros já lutaram até 400.
 */
function podeSentar(estado: EstadoJogo, jogador: Jogador): boolean {
  if (estado.fase === 'aguardando') return true
  if (estado.fase === 'fim') return false
  return estado.naPartida.includes(jogador.peerId)
}
```

E no `case 'sentar'`, logo depois da checagem de cadeira ocupada:

```ts
      if (!podeSentar(estado, jogador)) break
```

- [ ] **Step 5: Acrescentar o `case 'iniciar'`**

No `switch` de `aplicar`, depois do `case 'levantar'`:

```ts
    case 'iniciar': {
      if (estado.fase !== 'aguardando') break
      if (peerId !== estado.hostAtual) break
      const naMesa = sentados(estado)
      if (naMesa.length === 0) break
      estado.naPartida = naMesa.map((j) => j.peerId)
      estado.fase = 'apostas'
      estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
      break
    }
```

- [ ] **Step 6: Rodar os testes novos**

Run: `npm test -- machine -t "sala de espera"`
Expected: PASS, 7 testes.

- [ ] **Step 7: Ajustar os testes existentes que quebraram**

Todo teste que montava a mesa sentando jogadores e esperava a rodada começar
precisa agora despachar `{ tipo: 'iniciar' }` pelo **anfitrião** (o `hostId`
passado a `criarContexto`) depois de sentar todo mundo.

Isso vale para `src/game/machine.test.ts` e para `src/net/sessao.test.ts`.

**Ajuste cada um acrescentando o `iniciar` — nunca forçando `estado.fase` à mão.**
Um teste que mexe em fase diretamente para continuar verde deixa de testar a
máquina de estados e passa a testar a si mesmo.

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add src/game/machine.ts src/game/machine.test.ts src/net/sessao.test.ts
git commit -m "feat: sala de espera com inicio controlado pelo anfitriao"
```

---

## Task 3: Eliminação por falta de fichas

**Files:**
- Modify: `src/game/machine.ts` (`case 'sentar'`, `limparRodada`, `podeSentar`)
- Test: `src/game/machine.test.ts`

**Interfaces:**
- Consumes: `Jogador.eliminadoEm` (Task 1), `podeSentar` (Task 2)
- Produces: eliminação registrada em `eliminadoEm`; nenhum rebuy automático

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe('eliminação', () => {
  function mesaIniciada(fichasP2: number): Contexto {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas = fichasP2
    return ctx
  }

  it('não repõe mais fichas de quem quebrou no acerto', () => {
    const ctx = mesaIniciada(10)
    const depois = limparRodadaParaTeste(ctx)
    expect(depois.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas).toBe(10)
  })

  it('elimina quem fica abaixo da aposta mínima', () => {
    const ctx = mesaIniciada(10)
    const depois = limparRodadaParaTeste(ctx)
    const p2 = depois.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(p2.cadeira).toBeNull()
    expect(p2.eliminadoEm).toBe(1)
  })

  it('não elimina quem tem exatamente a aposta mínima', () => {
    const ctx = mesaIniciada(REGRAS.apostaMin)
    const depois = limparRodadaParaTeste(ctx)
    const p2 = depois.estado.jogadores.find((j) => j.peerId === 'p2')!
    expect(p2.cadeira).toBe(1)
    expect(p2.eliminadoEm).toBeNull()
  })

  it('eliminado não consegue sentar de novo na mesma partida', () => {
    let ctx = mesaIniciada(10)
    ctx = limparRodadaParaTeste(ctx)
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBeNull()
  })

  it('sentar não repõe mais fichas', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx.estado.jogadores[0]!.fichas = 10
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.jogadores[0]!.fichas).toBe(10)
  })
})
```

`limparRodadaParaTeste` conduz a rodada até o acerto usando as funções públicas.
Escrever este auxiliar no mesmo arquivo:

```ts
/** Leva a rodada até o fim usando só a API pública, avançando o relógio. */
function limparRodadaParaTeste(inicial: Contexto): Contexto {
  let ctx = inicial
  let agora = 0
  const passo = REGRAS.msEntreCartasDealer + 1
  for (const jogador of ctx.estado.jogadores) {
    if (jogador.cadeira !== null && jogador.fichas >= REGRAS.apostaMin) {
      ctx = aplicar(ctx, jogador.peerId, { tipo: 'apostar', valor: REGRAS.apostaMin }, agora, RNG())
    }
  }
  let guarda = 0
  while (ctx.estado.rodada === inicial.estado.rodada && ctx.estado.fase !== 'fim' && guarda++ < 200) {
    if (ctx.estado.fase === 'turnos' && ctx.estado.vezDe) {
      const jogador = ctx.estado.jogadores.find((j) => j.peerId === ctx.estado.vezDe)!
      const mao = jogador.maos[jogador.maoAtiva]
      if (mao) {
        ctx = aplicar(ctx, jogador.peerId, { tipo: 'parar', maoId: mao.id }, agora, RNG())
        continue
      }
    }
    if (ctx.estado.fase === 'seguro') {
      for (const jogador of ctx.estado.jogadores) {
        if (!jogador.decidiuSeguro && jogador.maos.length > 0) {
          ctx = aplicar(ctx, jogador.peerId, { tipo: 'seguro', aceitar: false }, agora, RNG())
        }
      }
      continue
    }
    agora += passo
    ctx = avancar(ctx, agora, RNG())
  }
  return ctx
}
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- machine -t "eliminação"`
Expected: FAIL — hoje as fichas são repostas e ninguém perde a cadeira.

- [ ] **Step 3: Remover o rebuy do `case 'sentar'`**

Apagar estas duas linhas e o comentário acima delas:

```ts
      // Quem re-senta com o stack curto (ou zerado) é reabastecido aqui —
      // não mais silenciosamente a cada acerto enquanto está de pé.
      if (jogador.fichas < REGRAS.apostaMin) jogador.fichas = REGRAS.stackInicial
```

- [ ] **Step 4: Trocar o rebuy de `limparRodada` por eliminação**

Substituir este bloco:

```ts
    // Só quem está sentado é reabastecido — quem levantou fica com o
    // stack que tinha; o reabastecimento dele acontece ao sentar de novo.
    if (jogador.cadeira !== null && jogador.fichas < REGRAS.apostaMin) {
      jogador.fichas = REGRAS.stackInicial
    }
```

por:

```ts
    // Abaixo da aposta mínima o jogador não consegue mais apostar — está
    // fora na prática, mesmo sem estar exatamente em zero. `estado.rodada`
    // ainda é a rodada que acabou de ser jogada; o incremento vem depois.
    if (jogador.cadeira !== null && jogador.fichas < REGRAS.apostaMin) {
      jogador.cadeira = null
      jogador.eliminadoEm = estado.rodada
    }
```

- [ ] **Step 5: Fechar `podeSentar` para eliminados**

Trocar a última linha de `podeSentar`:

```ts
  return estado.naPartida.includes(jogador.peerId)
    && jogador.eliminadoEm === null
    && jogador.fichas >= REGRAS.apostaMin
}
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- machine -t "eliminação"`
Expected: PASS, 5 testes.

- [ ] **Step 7: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: verde. Se algum teste antigo dependia do rebuy, ajuste-o para a regra nova — não reintroduza reposição.

- [ ] **Step 8: Commit**

```bash
git add src/game/machine.ts src/game/machine.test.ts
git commit -m "feat: eliminacao abaixo da aposta minima, sem rebuy"
```

---

## Task 4: Fim de partida e vencedor

**Files:**
- Modify: `src/game/machine.ts` (`limparRodada`, `aplicar`)
- Test: `src/game/machine.test.ts`

**Interfaces:**
- Consumes: `EstadoJogo.vencedor`, `EstadoJogo.naPartida`, `REGRAS.alvoVitoria`, `Jogador.eliminadoEm`
- Produces: `aptos(estado): Jogador[]`; fase `'fim'`; ação `novaPartida`

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe('fim de partida', () => {
  function comDois(fichasP1: number, fichasP2: number): Contexto {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.fichas = fichasP1
    ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.fichas = fichasP2
    return ctx
  }

  it('quem atinge o alvo vence', () => {
    const depois = limparRodadaParaTeste(comDois(REGRAS.alvoVitoria + 100, 400))
    expect(depois.estado.fase).toBe('fim')
    expect(depois.estado.vencedor).toBe('p1')
  })

  it('empate exato no alvo não declara vencedor', () => {
    const depois = limparRodadaParaTeste(comDois(REGRAS.alvoVitoria, REGRAS.alvoVitoria))
    expect(depois.estado.fase).toBe('fim')
    expect(depois.estado.vencedor).toBeNull()
  })

  it('quem tem mais fichas vence quando os dois passam do alvo', () => {
    const depois = limparRodadaParaTeste(comDois(REGRAS.alvoVitoria + 200, REGRAS.alvoVitoria + 50))
    expect(depois.estado.vencedor).toBe('p1')
  })

  it('sobrando um único apto, ele vence', () => {
    const depois = limparRodadaParaTeste(comDois(600, 10))
    expect(depois.estado.fase).toBe('fim')
    expect(depois.estado.vencedor).toBe('p1')
  })

  it('todos quebrando na mesma rodada não declara vencedor', () => {
    const depois = limparRodadaParaTeste(comDois(10, 10))
    expect(depois.estado.fase).toBe('fim')
    expect(depois.estado.vencedor).toBeNull()
  })

  it('jogando sozinho, a regra do último sobrevivente não dispara', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'iniciar' }, 0, RNG())
    ctx.estado.jogadores[0]!.fichas = 600
    const depois = limparRodadaParaTeste(ctx)
    expect(depois.estado.fase).not.toBe('fim')
  })

  it('quem perdeu a cadeira mas tem fichas ainda conta como apto', () => {
    let ctx = comDois(600, 600)
    ctx = aplicar(ctx, 'p2', { tipo: 'levantar' }, 0, RNG())
    const depois = limparRodadaParaTeste(ctx)
    expect(depois.estado.fase).not.toBe('fim')
  })

  it('novaPartida devolve todo mundo à sala de espera com o stack cheio', () => {
    let ctx = limparRodadaParaTeste(comDois(REGRAS.alvoVitoria + 100, 10))
    expect(ctx.estado.fase).toBe('fim')
    ctx = aplicar(ctx, 'p1', { tipo: 'novaPartida' }, 0, RNG())
    expect(ctx.estado.fase).toBe('aguardando')
    expect(ctx.estado.vencedor).toBeNull()
    expect(ctx.estado.naPartida).toEqual([])
    expect(ctx.estado.rodada).toBe(1)
    for (const jogador of ctx.estado.jogadores) {
      expect(jogador.fichas).toBe(REGRAS.stackInicial)
      expect(jogador.eliminadoEm).toBeNull()
      expect(jogador.cadeira).toBeNull()
    }
  })

  it('quem não é anfitrião não reinicia', () => {
    let ctx = limparRodadaParaTeste(comDois(REGRAS.alvoVitoria + 100, 10))
    ctx = aplicar(ctx, 'p2', { tipo: 'novaPartida' }, 0, RNG())
    expect(ctx.estado.fase).toBe('fim')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- machine -t "fim de partida"`
Expected: FAIL — a fase `fim` nunca é atingida hoje.

- [ ] **Step 3: Escrever os auxiliares em `machine.ts`**

Perto dos outros auxiliares:

```ts
/**
 * Quem ainda pode disputar: entrou na partida, não foi eliminado e tem
 * fichas para apostar — sentado ou não. Quem perdeu a cadeira por
 * inatividade continua contando porque pode voltar; se fechar a aba, a
 * purga de desconectados o remove de `jogadores` e a contagem se resolve.
 */
function aptos(estado: EstadoJogo): Jogador[] {
  return estado.jogadores.filter(
    (j) => estado.naPartida.includes(j.peerId)
      && j.eliminadoEm === null
      && j.fichas >= REGRAS.apostaMin,
  )
}

function decidirFim(estado: EstadoJogo): { acabou: boolean; vencedor: string | null } {
  const emJogo = aptos(estado)

  const noAlvo = emJogo.filter((j) => j.fichas >= REGRAS.alvoVitoria)
  if (noAlvo.length > 0) {
    const maior = Math.max(...noAlvo.map((j) => j.fichas))
    const lideres = noAlvo.filter((j) => j.fichas === maior)
    return { acabou: true, vencedor: lideres.length === 1 ? lideres[0]!.peerId : null }
  }

  if (emJogo.length === 0) return { acabou: true, vencedor: null }

  // Sobrar um só não encerra partida de um jogador só — ele estaria
  // sozinho desde o início e venceria antes de jogar.
  if (emJogo.length === 1 && estado.naPartida.length >= 2) {
    return { acabou: true, vencedor: emJogo[0]!.peerId }
  }

  return { acabou: false, vencedor: null }
}
```

- [ ] **Step 4: Bifurcar `limparRodada`**

Substituir o bloco que decide a próxima fase:

```ts
  estado.fase = sentados(estado).length >= 1 ? 'apostas' : 'aguardando'
  estado.prazoTurno = estado.fase === 'apostas'
    ? agora + REGRAS.segundosTurno * 1000
    : null
```

por:

```ts
  const fim = decidirFim(estado)
  if (fim.acabou) {
    estado.fase = 'fim'
    estado.vencedor = fim.vencedor
    estado.vezDe = null
    estado.prazoTurno = null
  } else {
    estado.fase = sentados(estado).length >= 1 ? 'apostas' : 'aguardando'
    estado.prazoTurno = estado.fase === 'apostas'
      ? agora + REGRAS.segundosTurno * 1000
      : null
  }
```

- [ ] **Step 5: Acrescentar o `case 'novaPartida'`**

Depois do `case 'iniciar'`:

```ts
    case 'novaPartida': {
      if (estado.fase !== 'fim') break
      if (peerId !== estado.hostAtual) break
      for (const j of estado.jogadores) {
        j.fichas = REGRAS.stackInicial
        j.eliminadoEm = null
        // As cadeiras são liberadas de propósito: sentar de novo é o sinal
        // de que a pessoa quer jogar a próxima, em vez de ser arrastada
        // para uma partida que talvez não queira.
        j.cadeira = null
        j.maos = []
        j.maoAtiva = 0
        j.seguro = 0
        j.decidiuSeguro = false
        j.rodadasInativo = 0
      }
      estado.naPartida = []
      estado.vencedor = null
      estado.rodada = 1
      estado.vezDe = null
      estado.prazoTurno = null
      estado.maoDealer = []
      estado.dealerTemOculta = false
      estado.fase = 'aguardando'
      break
    }
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- machine -t "fim de partida"`
Expected: PASS, 9 testes.

- [ ] **Step 7: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add src/game/machine.ts src/game/machine.test.ts
git commit -m "feat: fim de partida por alvo ou ultimo sobrevivente"
```

---

## Task 5: Classificação final

Função pura, sem UI. Separada porque o empate por rodada de queda é a regra mais
fácil de errar do spec e merece teste próprio.

**Files:**
- Create: `src/game/classificacao.ts`
- Test: `src/game/classificacao.test.ts`

**Interfaces:**
- Consumes: `EstadoJogo`, `Jogador`, `REGRAS`
- Produces: `type Colocacao = { posicao: number; jogadores: Jogador[] }` e `classificacao(estado: EstadoJogo): Colocacao[]`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/game/classificacao.test.ts  (sem o marcador de caminho no arquivo real)
import { describe, it, expect } from 'vitest'
import { classificacao } from './classificacao'
import { REGRAS } from './rules'
import type { EstadoJogo, Jogador } from './types'

function jogador(peerId: string, fichas: number, eliminadoEm: number | null): Jogador {
  return {
    peerId, apelido: peerId.toUpperCase(), cadeira: eliminadoEm === null ? 0 : null,
    fichas, maos: [], maoAtiva: 0, seguro: 0, rodadasInativo: 0,
    desconectadoEm: null, decidiuSeguro: false, eliminadoEm,
  }
}

function estadoCom(jogadores: Jogador[], vencedor: string | null): EstadoJogo {
  return {
    fase: 'fim', jogadores, vezDe: null, prazoTurno: null, maoDealer: [],
    dealerTemOculta: false, cartasRestantes: 0, hostAtual: 'p1', rodada: 20,
    proximoIdMao: 1, vencedor, naPartida: jogadores.map((j) => j.peerId),
  }
}

describe('classificacao', () => {
  it('põe o vencedor em primeiro', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 400, null), jogador('p2', 1520, null),
    ], 'p2'))
    expect(r[0]!.posicao).toBe(1)
    expect(r[0]!.jogadores.map((j) => j.peerId)).toEqual(['p2'])
  })

  it('ordena sobreviventes por saldo decrescente', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 300, null), jogador('p2', 900, null), jogador('p3', 600, null),
    ], null))
    expect(r.map((c) => c.jogadores[0]!.peerId)).toEqual(['p2', 'p3', 'p1'])
  })

  it('ordena eliminados por rodada de queda decrescente', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 0, 6), jogador('p2', 0, 14),
    ], null))
    expect(r.map((c) => c.jogadores[0]!.peerId)).toEqual(['p2', 'p1'])
  })

  it('empata quem caiu na mesma rodada e pula a numeração', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 0, 20), jogador('p2', 0, 20), jogador('p3', 0, 20),
      jogador('p4', 0, 6),
    ], null))
    expect(r).toHaveLength(2)
    expect(r[0]!.posicao).toBe(1)
    expect(r[0]!.jogadores.map((j) => j.peerId).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(r[1]!.posicao).toBe(4)
    expect(r[1]!.jogadores.map((j) => j.peerId)).toEqual(['p4'])
  })

  it('empata sobreviventes com o mesmo saldo', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 500, null), jogador('p2', 500, null), jogador('p3', 200, null),
    ], null))
    expect(r[0]!.jogadores).toHaveLength(2)
    expect(r[1]!.posicao).toBe(3)
  })

  it('sobreviventes vêm sempre antes de eliminados', () => {
    const r = classificacao(estadoCom([
      jogador('p1', 0, 19), jogador('p2', REGRAS.apostaMin, null),
    ], null))
    expect(r[0]!.jogadores[0]!.peerId).toBe('p2')
  })

  it('quem está em jogadores mas não em naPartida fica de fora', () => {
    const estado = estadoCom([jogador('p1', 500, null)], null)
    estado.jogadores.push(jogador('p9', 1000, null))
    const r = classificacao(estado)
    expect(r.flatMap((c) => c.jogadores).map((j) => j.peerId)).toEqual(['p1'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- classificacao`
Expected: FAIL, "Failed to resolve import './classificacao'"

- [ ] **Step 3: Implementar `src/game/classificacao.ts`**

```ts
import { REGRAS } from './rules'
import type { EstadoJogo, Jogador } from './types'

/** Uma posição do placar. Mais de um jogador significa empate real. */
export type Colocacao = {
  posicao: number
  jogadores: Jogador[]
}

/**
 * Ordena por chave decrescente e agrupa os iguais na mesma posição, com
 * numeração de competição: depois de um empate triplo em 1º, o próximo é 4º.
 */
function agrupar(jogadores: Jogador[], chave: (j: Jogador) => number): Colocacao[] {
  const ordenados = [...jogadores].sort((a, b) => chave(b) - chave(a))
  const grupos: Colocacao[] = []
  for (const jogador of ordenados) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && chave(ultimo.jogadores[0]!) === chave(jogador)) {
      ultimo.jogadores.push(jogador)
    } else {
      grupos.push({ posicao: 0, jogadores: [jogador] })
    }
  }
  return grupos
}

/**
 * Placar final: vencedor, depois sobreviventes por saldo, depois eliminados
 * pela rodada em que caíram. Empate é empate — sem critério de desempate.
 */
export function classificacao(estado: EstadoJogo): Colocacao[] {
  const daPartida = estado.jogadores.filter((j) => estado.naPartida.includes(j.peerId))

  const vencedor = daPartida.filter((j) => j.peerId === estado.vencedor)
  const restantes = daPartida.filter((j) => j.peerId !== estado.vencedor)

  const sobreviventes = restantes.filter(
    (j) => j.eliminadoEm === null && j.fichas >= REGRAS.apostaMin,
  )
  const eliminados = restantes.filter((j) => !sobreviventes.includes(j))

  const grupos: Colocacao[] = [
    ...(vencedor.length > 0 ? [{ posicao: 0, jogadores: vencedor }] : []),
    ...agrupar(sobreviventes, (j) => j.fichas),
    ...agrupar(eliminados, (j) => j.eliminadoEm ?? 0),
  ]

  let acumulado = 0
  for (const grupo of grupos) {
    grupo.posicao = acumulado + 1
    acumulado += grupo.jogadores.length
  }
  return grupos
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- classificacao`
Expected: PASS, 7 testes.

- [ ] **Step 5: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add src/game/classificacao.ts src/game/classificacao.test.ts
git commit -m "feat: classificacao final com empate por rodada de queda"
```

---

## Task 6: Telas de sala de espera e fim de partida

**Files:**
- Create: `src/ui/components/fim.ts`
- Create: `src/ui/components/fim.test.ts`
- Modify: `src/ui/components/mesa.ts` (painel inferior na fase `aguardando`)
- Modify: `src/ui/render.ts` (escolher a tela pela fase)
- Modify: `src/ui/theme.css`
- Test: `src/ui/components/mesa.test.ts`

**Interfaces:**
- Consumes: `classificacao`, `Colocacao` (Task 5); ações `iniciar` e `novaPartida`
- Produces: `renderizarFim(estado, meuId, aoAgir): HTMLElement`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/ui/components/fim.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarFim } from './fim'
import type { EstadoJogo, Jogador } from '../../game/types'

function jogador(peerId: string, apelido: string, fichas: number, eliminadoEm: number | null): Jogador {
  return {
    peerId, apelido, cadeira: null, fichas, maos: [], maoAtiva: 0, seguro: 0,
    rodadasInativo: 0, desconectadoEm: null, decidiuSeguro: false, eliminadoEm,
  }
}

function estadoFim(vencedor: string | null, hostAtual = 'p1'): EstadoJogo {
  const jogadores = [
    jogador('p1', 'Alex', 480, null),
    jogador('p2', 'Bruno', 1520, null),
    jogador('p3', 'Carla', 0, 14),
  ]
  return {
    fase: 'fim', jogadores, vezDe: null, prazoTurno: null, maoDealer: [],
    dealerTemOculta: false, cartasRestantes: 0, hostAtual, rodada: 20,
    proximoIdMao: 1, vencedor, naPartida: ['p1', 'p2', 'p3'],
  }
}

describe('tela de fim', () => {
  it('lista todos os jogadores da partida com a posição', () => {
    const el = renderizarFim(estadoFim('p2'), 'p1', vi.fn())
    const linhas = el.querySelectorAll('[data-colocacao]')
    expect(linhas).toHaveLength(3)
    expect(linhas[0]!.textContent).toContain('Bruno')
  })

  it('só o anfitrião vê Nova partida', () => {
    const doHost = renderizarFim(estadoFim('p2', 'p1'), 'p1', vi.fn())
    expect(doHost.querySelector('[data-acao="novaPartida"]')).not.toBeNull()

    const doCliente = renderizarFim(estadoFim('p2', 'p1'), 'p2', vi.fn())
    expect(doCliente.querySelector('[data-acao="novaPartida"]')).toBeNull()
  })

  it('despacha novaPartida ao clicar', () => {
    const aoAgir = vi.fn()
    const el = renderizarFim(estadoFim('p2'), 'p1', aoAgir)
    el.querySelector<HTMLButtonElement>('[data-acao="novaPartida"]')!.click()
    expect(aoAgir).toHaveBeenCalledWith({ tipo: 'novaPartida' })
  })

  it('sem vencedor, não anuncia ninguém como vencedor', () => {
    const el = renderizarFim(estadoFim(null), 'p1', vi.fn())
    expect(el.querySelector('[data-vencedor]')).toBeNull()
  })

  it('marca os empatados com a mesma posição', () => {
    const estado = estadoFim(null)
    estado.jogadores = [
      jogador('p1', 'Alex', 0, 20), jogador('p2', 'Bruno', 0, 20),
      jogador('p3', 'Carla', 0, 6),
    ]
    const el = renderizarFim(estado, 'p1', vi.fn())
    const posicoes = [...el.querySelectorAll('[data-colocacao]')]
      .map((l) => l.getAttribute('data-colocacao'))
    expect(posicoes).toEqual(['1', '1', '3'])
  })
})
```

E em `src/ui/components/mesa.test.ts`, para a sala de espera:

Use os auxiliares que já existem no arquivo — `criarEstado(over)`,
`criarJogador(over)` e `semAcao` — em vez de criar fixtures novos:

```ts
describe('sala de espera', () => {
  it('o anfitrião vê Iniciar partida quando há alguém sentado', () => {
    const estado = criarEstado({
      fase: 'aguardando', hostAtual: 'p1',
      jogadores: [criarJogador({ peerId: 'p1', cadeira: 0 })],
    })
    const el = renderizarMesa(estado, 'p1', semAcao)
    expect(el.querySelector('[data-acao="iniciar"]')).not.toBeNull()
  })

  it('quem não é anfitrião não vê Iniciar partida', () => {
    const estado = criarEstado({
      fase: 'aguardando', hostAtual: 'p1',
      jogadores: [
        criarJogador({ peerId: 'p1', cadeira: 0 }),
        criarJogador({ peerId: 'p2', cadeira: 1 }),
      ],
    })
    const el = renderizarMesa(estado, 'p2', semAcao)
    expect(el.querySelector('[data-acao="iniciar"]')).toBeNull()
  })

  it('o botão fica desabilitado com a mesa vazia', () => {
    const estado = criarEstado({
      fase: 'aguardando', hostAtual: 'p1',
      jogadores: [criarJogador({ peerId: 'p1', cadeira: null })],
    })
    const el = renderizarMesa(estado, 'p1', semAcao)
    expect(el.querySelector<HTMLButtonElement>('[data-acao="iniciar"]')!.disabled).toBe(true)
  })

  it('a sala de espera não mostra painel de mão', () => {
    const estado = criarEstado({
      fase: 'aguardando', hostAtual: 'p1',
      jogadores: [criarJogador({ peerId: 'p1', cadeira: 0 })],
    })
    const el = renderizarMesa(estado, 'p1', semAcao)
    expect(el.querySelector('[data-acao="apostar"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- fim mesa`
Expected: FAIL — `./fim` não existe e não há botão `iniciar`.

- [ ] **Step 3: Acrescentar o CSS**

Ao fim de `src/ui/theme.css`:

```css
.fim {
  max-width: 520px;
  margin: 8vh auto 0;
  padding: 26px 24px;
  background: var(--carvao-700);
  border: 1px solid var(--topazio-900);
  border-radius: 14px;
  text-align: center;
}
.fim h2 { color: var(--topazio-500); font-size: 22px; margin: 0 0 4px; }
.fim .sub { color: var(--texto-fraco); font-size: 13px; margin-bottom: 22px; }

.colocacao {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 9px; margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.028);
  border: 1px solid rgba(201, 162, 39, 0.12);
}
.colocacao.campea { border-color: var(--topazio-600); background: rgba(201, 162, 39, 0.1); }
.colocacao .pos { color: var(--topazio-600); font-size: 15px; min-width: 32px; text-align: left; }
.colocacao .quem { color: var(--texto); font-size: 15px; flex: 1; text-align: left; }
.colocacao .saldo { color: var(--topazio-400); font-size: 15px; font-variant-numeric: tabular-nums; }
.colocacao .caiu { color: var(--texto-fraco); font-size: 12px; }

.espera { text-align: center; }
.espera .aviso { color: var(--texto-fraco); font-size: 13px; margin-top: 10px; }
```

- [ ] **Step 4: Implementar `src/ui/components/fim.ts`**

```ts
import { classificacao } from '../../game/classificacao'
import type { Acao, EstadoJogo } from '../../game/types'

function div(classe: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

export function renderizarFim(
  estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): HTMLElement {
  const tela = div('fim')

  const titulo = document.createElement('h2')
  titulo.textContent = 'Fim de partida'
  tela.append(titulo)

  const campeao = estado.jogadores.find((j) => j.peerId === estado.vencedor)
  const sub = div('sub')
  if (campeao) {
    sub.textContent = `${campeao.apelido} venceu`
    sub.dataset.vencedor = campeao.peerId
  } else {
    sub.textContent = 'Ninguém sobrou com fichas — a mesa quebrou junto'
  }
  tela.append(sub)

  for (const grupo of classificacao(estado)) {
    for (const jogador of grupo.jogadores) {
      const linha = div('colocacao')
      linha.dataset.colocacao = String(grupo.posicao)
      if (jogador.peerId === estado.vencedor) linha.classList.add('campea')

      linha.append(
        div('pos', `${grupo.posicao}º`),
        div('quem', jogador.apelido),
        jogador.eliminadoEm === null
          ? div('saldo', String(jogador.fichas))
          : div('caiu', `eliminado na rodada ${jogador.eliminadoEm}`),
      )
      tela.append(linha)
    }
  }

  if (estado.hostAtual === meuId) {
    const botao = document.createElement('button')
    botao.className = 'botao'
    botao.textContent = 'Nova partida'
    botao.dataset.acao = 'novaPartida'
    botao.style.marginTop = '18px'
    botao.onclick = () => aoAgir({ tipo: 'novaPartida' })
    tela.append(botao)
  } else {
    tela.append(div('sub', 'Aguardando o anfitrião iniciar uma nova partida'))
  }

  return tela
}
```

- [ ] **Step 5: Ligar em `src/ui/render.ts`**

Importar no topo:

```ts
import { renderizarFim } from './components/fim'
```

E dentro de `renderizar`, antes de montar a mesa, desviar pela fase:

```ts
  if (estado.fase === 'fim') {
    raiz.replaceChildren(renderizarFim(estado, meuId, aoAgir))
    raiz.dataset[CHAVE_DATASET] = JSON.stringify(atuais)
    return
  }
```

Mantenha a gravação da contagem para que a volta à mesa não dispare voo de
cartas indevido.

- [ ] **Step 6: Acrescentar os controles de espera em `mesa.ts`**

No `renderizarMesa`, o bloco final que monta o painel inferior passa a tratar a
fase `aguardando` antes dos outros casos:

```ts
  if (estado.fase === 'aguardando') {
    const espera = div('painel-proprio espera')
    espera.append(div('rotulo', 'Sala de espera'))

    if (eu && eu.cadeira === null) {
      const livre = Array.from({ length: REGRAS.maxCadeiras }, (_, i) => i)
        .find((c) => !estado.jogadores.some((j) => j.cadeira === c))
      espera.append(botao('botao', livre === undefined ? 'Mesa cheia' : 'Sentar à mesa',
        () => { if (livre !== undefined) aoAgir({ tipo: 'sentar', cadeira: livre }) },
        { desabilitado: livre === undefined, dataset: { acao: 'sentar' } }))
    }

    if (estado.hostAtual === meuId) {
      const sentados = estado.jogadores.filter((j) => j.cadeira !== null).length
      espera.append(botao('botao', 'Iniciar partida',
        () => aoAgir({ tipo: 'iniciar' }),
        { desabilitado: sentados === 0, dataset: { acao: 'iniciar' } }))
    } else {
      espera.append(div('aviso', 'Aguardando o anfitrião iniciar'))
    }

    mesa.append(espera)
    return mesa
  }
```

Este bloco vai **antes** do `if (eu && eu.cadeira !== null)` existente e retorna
direto, para que a sala de espera não mostre painel de mão nem convite de
espectador.

- [ ] **Step 7: Rodar os testes**

Run: `npm test -- fim mesa`
Expected: PASS.

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/fim.ts src/ui/components/fim.test.ts src/ui/components/mesa.ts src/ui/components/mesa.test.ts src/ui/render.ts src/ui/theme.css
git commit -m "feat: telas de sala de espera e fim de partida"
```

---

## Task 7: Legibilidade

**Files:**
- Modify: `src/ui/theme.css`
- Modify: `src/ui/components/mesa.ts` (selo de fichas)
- Test: `src/ui/components/mesa.test.ts`

**Interfaces:**
- Consumes: nada novo
- Produces: nenhuma API nova; muda marcação das fichas para um selo

- [ ] **Step 1: Escrever o teste que falha**

```ts
  it('o saldo aparece dentro de um selo identificável', () => {
    const estado = estadoBase({ fase: 'apostas' })
    estado.jogadores = [jogadorSentado('p1', 'Alex', 0), jogadorSentado('p2', 'Bruno', 1)]
    estado.jogadores[1]!.fichas = 860
    const el = renderizarMesa(estado, 'p1', vi.fn())
    const selo = el.querySelector('[data-fichas]')
    expect(selo).not.toBeNull()
    expect(selo!.getAttribute('data-fichas')).toBe('860')
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- mesa -t "selo"`
Expected: FAIL — hoje as fichas são um `div.fichas` sem `data-fichas`.

- [ ] **Step 3: Atualizar a escala em `src/ui/theme.css`**

Substituir as três regras existentes:

```css
.nome { font-size: 15px; color: var(--texto); font-weight: 600; }
.total { font-size: 13px; color: var(--texto-fraco); margin-top: 2px; }
```

Remover a regra `.fichas` antiga e acrescentar o selo:

```css
.selo-fichas {
  display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
  background: rgba(201, 162, 39, 0.14);
  border: 1px solid rgba(201, 162, 39, 0.42);
  border-radius: 999px; padding: 3px 11px;
}
.selo-fichas b {
  font-size: 17px; color: var(--topazio-300);
  font-variant-numeric: tabular-nums; line-height: 1;
}
.selo-fichas span {
  font-size: 10px; color: var(--topazio-600);
  letter-spacing: 0.1em; text-transform: uppercase;
}
```

Ajustar rótulos, cartas da grade e botões:

```css
.rotulo { font-size: 11px; }
.peca .carta { width: 40px; height: 57px; font-size: 16px; margin-left: -13px; }
.botao { font-size: 14.5px; padding: 11px 20px; }
```

As regras `.rotulo`, `.peca .carta` e `.botao` já existem — altere os valores
nelas, não acrescente duplicatas.

- [ ] **Step 4: Trocar a marcação das fichas em `mesa.ts`**

São **dois** lugares, e eles estão em formatos diferentes hoje:

- `mesa.ts:144` — a peça do adversário: `peca.append(div('nome', jogador.apelido), div('fichas', String(jogador.fichas)))`
- `mesa.ts:218` — o painel próprio, onde o saldo está **embutido numa frase**: `div('nome', \`${eu.apelido} — ${eu.fichas} fichas\`)`

O segundo precisa ser separado: o nome vira só o apelido, e o saldo vira selo.
Enquanto estiver dentro da frase ele não pode receber destaque próprio, que é a
razão de o usuário não conseguir ler o saldo.

Acrescentar o auxiliar:

```ts
function seloFichas(fichas: number): HTMLElement {
  const selo = document.createElement('div')
  selo.className = 'selo-fichas'
  selo.dataset.fichas = String(fichas)

  const valor = document.createElement('b')
  valor.textContent = fichas.toLocaleString('pt-BR')
  const rotulo = document.createElement('span')
  rotulo.textContent = 'fichas'

  selo.append(valor, rotulo)
  return selo
}
```

E aplicar nos dois locais:

```ts
// mesa.ts:144 — peça do adversário
peca.append(div('nome', jogador.apelido), seloFichas(jogador.fichas))

// mesa.ts:218 — painel próprio
div('nome', eu.apelido),
seloFichas(eu.fichas),
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- mesa`
Expected: PASS. Se algum teste antigo procurava `.fichas`, atualize-o para o selo — a informação continua lá, mudou a marcação.

- [ ] **Step 6: Rodar tudo**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/ui/theme.css src/ui/components/mesa.ts src/ui/components/mesa.test.ts
git commit -m "feat: escala tipografica maior e selo de fichas"
```

---

## Task 8: Painel de ajuda

**Files:**
- Create: `src/ui/components/ajuda.ts`
- Create: `src/ui/components/ajuda.test.ts`
- Modify: `src/ui/components/mesa.ts` (botão na barra de ações)
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: nada de `game/`
- Produces: `botaoAjuda(): HTMLElement` — botão que alterna o painel

- [ ] **Step 1: Escrever os testes que falham**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { botaoAjuda } from './ajuda'

describe('painel de ajuda', () => {
  it('começa fechado', () => {
    const el = botaoAjuda()
    expect(el.querySelector('[data-painel-ajuda]')).toBeNull()
  })

  it('abre ao clicar e fecha ao clicar de novo', () => {
    const el = botaoAjuda()
    const gatilho = el.querySelector<HTMLButtonElement>('[data-acao="ajuda"]')!
    gatilho.click()
    expect(el.querySelector('[data-painel-ajuda]')).not.toBeNull()
    gatilho.click()
    expect(el.querySelector('[data-painel-ajuda]')).toBeNull()
  })

  it('explica as três jogadas que não são autoexplicativas', () => {
    const el = botaoAjuda()
    el.querySelector<HTMLButtonElement>('[data-acao="ajuda"]')!.click()
    const texto = el.textContent ?? ''
    expect(texto).toContain('Dobrar')
    expect(texto).toContain('Dividir')
    expect(texto).toContain('Seguro')
  })

  it('não explica Pedir nem Parar', () => {
    const el = botaoAjuda()
    el.querySelector<HTMLButtonElement>('[data-acao="ajuda"]')!.click()
    const titulos = [...el.querySelectorAll('[data-painel-ajuda] h4')].map((h) => h.textContent)
    expect(titulos).toEqual(['Dobrar', 'Dividir', 'Seguro'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- ajuda`
Expected: FAIL, "Failed to resolve import './ajuda'"

- [ ] **Step 3: Acrescentar o CSS**

```css
.ajuda-gatilho {
  width: 30px; height: 30px; border-radius: 999px;
  background: transparent; color: var(--topazio-500);
  border: 1px solid var(--topazio-600);
  font-family: var(--serif); font-size: 15px; cursor: pointer;
}
.ajuda-painel {
  background: var(--carvao-700); border: 1px solid var(--topazio-900);
  border-radius: 10px; padding: 14px 16px; margin-top: 12px; text-align: left;
}
.ajuda-painel h4 { color: var(--topazio-500); font-size: 14px; margin: 0 0 4px; }
.ajuda-painel p { color: var(--texto-fraco); font-size: 13px; margin: 0 0 12px; line-height: 1.45; }
.ajuda-painel p:last-child { margin-bottom: 0; }
```

- [ ] **Step 4: Implementar `src/ui/components/ajuda.ts`**

```ts
const JOGADAS: { titulo: string; texto: string }[] = [
  {
    titulo: 'Dobrar',
    texto: 'Dobra sua aposta e você recebe exatamente mais uma carta — '
      + 'depois dela a mão encerra. Costuma valer quando você tem 10 ou 11 '
      + 'e o dealer mostra uma carta fraca.',
  },
  {
    titulo: 'Dividir',
    texto: 'Se suas duas cartas têm o mesmo valor, separa em duas mãos '
      + 'independentes, cada uma com uma aposta igual à original. Um par de '
      + 'Ases recebe só uma carta em cada mão.',
  },
  {
    titulo: 'Seguro',
    texto: 'Oferecido quando o dealer mostra um Ás. É uma aposta à parte, '
      + 'de metade do seu valor, que paga 2:1 se o dealer tiver blackjack. '
      + 'Na dúvida, dispense: a matemática favorece a casa.',
  },
]

/**
 * Botão "?" que abre e fecha o painel de regras. Pedir e Parar ficam de
 * fora de propósito — quem não sabe descobre no primeiro clique, e
 * explicar o óbvio faz ninguém ler o resto.
 */
export function botaoAjuda(): HTMLElement {
  const raiz = document.createElement('div')

  const gatilho = document.createElement('button')
  gatilho.className = 'ajuda-gatilho'
  gatilho.textContent = '?'
  gatilho.dataset.acao = 'ajuda'
  gatilho.setAttribute('aria-label', 'Explicação das jogadas')
  raiz.append(gatilho)

  gatilho.onclick = () => {
    const aberto = raiz.querySelector('[data-painel-ajuda]')
    if (aberto) {
      aberto.remove()
      return
    }
    const painel = document.createElement('div')
    painel.className = 'ajuda-painel'
    painel.dataset.painelAjuda = '1'
    for (const jogada of JOGADAS) {
      const titulo = document.createElement('h4')
      titulo.textContent = jogada.titulo
      const texto = document.createElement('p')
      texto.textContent = jogada.texto
      painel.append(titulo, texto)
    }
    raiz.append(painel)
  }

  return raiz
}
```

- [ ] **Step 5: Ligar na barra de ações de `mesa.ts`**

Importar no topo:

```ts
import { botaoAjuda } from './ajuda'
```

E no painel próprio, depois de montar os botões de ação, acrescentar o gatilho
ao container de ações:

```ts
  acoes.append(botaoAjuda())
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- ajuda mesa`
Expected: PASS.

- [ ] **Step 7: Rodar tudo**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: verde.

- [ ] **Step 8: Atualizar a documentação**

Em `README.md`, na descrição do blackjack, acrescentar que a partida tem começo
controlado pelo anfitrião, eliminação e vencedor em 1500 fichas.

Em `docs/verificacao-manual.md`, acrescentar à seção **Partida**:

```markdown
- [ ] O anfitrião vê "Iniciar partida" e os outros veem o aviso de espera
- [ ] Quem quebra vira espectador e não consegue sentar de novo
- [ ] Alguém chegando a 1500 encerra a partida com placar
- [ ] "Nova partida" devolve todos à sala de espera com 1000 fichas
- [ ] O botão "?" explica Dobrar, Dividir e Seguro
```

Manter a linha sobre espectadores em **Decisões em aberto**: a eliminação cria
*mais* espectadores, não menos, então a ausência deles na mesa passa a incomodar
mais, não menos. Reescrevê-la assim:

```markdown
- **Espectadores não aparecem** na mesa para os outros jogadores — inclusive
  quem foi eliminado, que fica invisível para quem continua jogando.
```

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/ajuda.ts src/ui/components/ajuda.test.ts src/ui/components/mesa.ts src/ui/theme.css README.md docs/verificacao-manual.md
git commit -m "feat: painel de ajuda das jogadas e documentacao atualizada"
```

---

## Verificação final

```bash
npm test && npx tsc --noEmit && npm run build
```

Checklist de aceitação, verificado no navegador com três abas:

- [ ] Sentar não inicia mais a partida
- [ ] Só o anfitrião vê "Iniciar partida"; os outros veem o aviso
- [ ] Quem quebra perde a cadeira e não consegue sentar de novo
- [ ] Quem perdeu a cadeira por inatividade consegue voltar a sentar
- [ ] Um retardatário não consegue sentar no meio da partida
- [ ] Atingir 1500 encerra a partida e mostra o placar
- [ ] Sobrando um jogador com fichas, ele vence
- [ ] Jogando sozinho, a partida só acaba em 1500 ou na quebra
- [ ] Empatados na mesma rodada aparecem com a mesma posição
- [ ] "Nova partida" devolve todos à sala de espera com 1000 fichas
- [ ] O saldo de cada jogador é legível de relance
- [ ] O botão "?" abre e fecha o painel das três jogadas
