# Blackjack Multiplayer P2P — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blackjack completo para até 7 jogadores, jogável entre amigos por um link, rodando como site estático no GitHub Pages sem servidor algum.

**Architecture:** Três camadas isoladas. `game/` contém as regras como funções puras que não sabem que rede ou DOM existem. `net/` põe o Trystero por trás de uma interface `Transporte`, elege um host autoritativo que valida ações e transmite snapshots completos do estado. `ui/` renderiza estado em DOM e anima com FLIP. A sapata vive só na memória do host e nunca é serializada.

**Tech Stack:** TypeScript, Vite, vitest, Trystero (estratégia Nostr). Sem framework de UI. Sem biblioteca de animação.

**Spec:** `docs/superpowers/specs/2026-08-15-blackjack-topaz-design.md`

## Global Constraints

- Todo código, nome de variável, tipo e comentário em **português**, seguindo os nomes já fixados no spec (`Carta`, `Mao`, `Jogador`, `EstadoJogo`, `Fase`, `Acao`).
- `src/game/` **não pode importar** nada de `src/net/` nem de `src/ui/`. Essa regra é verificada por teste na Task 2.
- A sapata (`Carta[]` completo) nunca entra em `EstadoJogo`, nunca é serializada, nunca é transmitida.
- Toda aleatoriedade passa por uma função `Rng = () => number` injetada, nunca `Math.random()` direto — sem isso os testes não são determinísticos.
- Constantes de regra vivem só em `REGRAS` (`src/game/rules.ts`). Nenhum número mágico espalhado.
- Node 20+, TypeScript em `strict: true`.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Valores fixos do spec: 6 baralhos · reembaralha abaixo de 25% · dealer para em soft 17 · blackjack paga 3:2 · seguro paga 2:1 · split até 3 mãos · stack inicial 1000 · aposta mínima 25 · máxima 500 · fichas de 25/100/500 · 7 cadeiras · turno de 30s · 2 rodadas inativo vira espectador · reconexão em 60s.

---

## Task 1: Scaffold do projeto e pipeline de deploy

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Create: `index.html`, `src/main.ts`
- Create: `.github/workflows/deploy.yml`
- Test: `src/scaffold.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `npm run dev`, `npm run build`, `npm test` funcionando; deploy automático na `main`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "topaz",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "trystero": "^0.25.3"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar `vite.config.ts`**

O `base` é obrigatório: sem ele o GitHub Pages serve a página em branco porque os assets apontam para a raiz do domínio.

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Topaz/',
})
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Criar `index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Topaz — Blackjack</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Criar `src/main.ts` provisório**

```ts
const app = document.querySelector<HTMLDivElement>('#app')!
app.textContent = 'Topaz'
```

- [ ] **Step 7: Escrever o teste que trava a configuração**

Este teste existe para impedir dois erros que quebram o deploy silenciosamente.

```ts
// src/scaffold.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('configuração do projeto', () => {
  it('define base como /Topaz/ para o GitHub Pages', () => {
    const config = readFileSync('vite.config.ts', 'utf-8')
    expect(config).toContain("base: '/Topaz/'")
  })

  it('mantém o modo strict do TypeScript ligado', () => {
    const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8'))
    expect(tsconfig.compilerOptions.strict).toBe(true)
  })
})
```

- [ ] **Step 8: Rodar os testes**

Run: `npm install && npm test`
Expected: PASS, 2 testes

- [ ] **Step 9: Criar `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 10: Verificar que o build passa**

Run: `npm run build`
Expected: sucesso, gera `dist/` com `index.html` referenciando `/Topaz/assets/…`

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html src/main.ts src/scaffold.test.ts .github/workflows/deploy.yml
git commit -m "chore: scaffold do projeto com Vite, vitest e deploy no Pages"
```

---

## Task 2: Tipos do domínio e regra de isolamento de camada

**Files:**
- Create: `src/game/types.ts`
- Test: `src/game/isolamento.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: todos os tipos usados pelas tasks seguintes — `Carta`, `Naipe`, `Valor`, `Mao`, `Jogador`, `Fase`, `EstadoJogo`, `Acao`, `Rng`

- [ ] **Step 1: Criar `src/game/types.ts`**

```ts
export type Naipe = 'copas' | 'ouros' | 'paus' | 'espadas'

export type Valor =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Carta {
  naipe: Naipe
  valor: Valor
}

export type Rng = () => number

export type ResultadoMao = 'ganhou' | 'perdeu' | 'empatou' | 'blackjack'

export interface Mao {
  id: string
  cartas: Carta[]
  aposta: number
  dobrada: boolean
  vindaDeSplit: boolean
  encerrada: boolean
  resultado?: ResultadoMao
}

export interface Jogador {
  peerId: string
  apelido: string
  cadeira: number | null
  fichas: number
  maos: Mao[]
  maoAtiva: number
  seguro: number
  rodadasInativo: number
  /** Timestamp da queda. `null` = conectado. Cadeira e fichas ficam
   *  reservadas até expirar `REGRAS.segundosReconexao`. */
  desconectadoEm: number | null
}

export type Fase =
  | 'aguardando'
  | 'apostas'
  | 'distribuindo'
  | 'seguro'
  | 'turnos'
  | 'dealer'
  | 'acerto'

export interface EstadoJogo {
  fase: Fase
  jogadores: Jogador[]
  vezDe: string | null
  prazoTurno: number | null
  maoDealer: Carta[]
  dealerTemOculta: boolean
  cartasRestantes: number
  hostAtual: string
  rodada: number
}

export type Acao =
  | { tipo: 'entrar'; apelido: string }
  | { tipo: 'sentar'; cadeira: number }
  | { tipo: 'levantar' }
  | { tipo: 'apostar'; valor: number }
  | { tipo: 'seguro'; aceitar: boolean }
  | { tipo: 'pedir'; maoId: string }
  | { tipo: 'parar'; maoId: string }
  | { tipo: 'dobrar'; maoId: string }
  | { tipo: 'dividir'; maoId: string }

export type TipoAcao = Acao['tipo']
```

- [ ] **Step 2: Escrever o teste de isolamento de camada**

Esta é a regra estrutural que sustenta o projeto inteiro. Se `game/` importar `net/` ou `ui/`, as regras deixam de ser testáveis sem navegador e o segundo jogo não conseguirá reaproveitar nada. O teste falha em CI antes de a violação chegar longe.

```ts
// src/game/isolamento.test.ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho)
    return caminho.endsWith('.ts') ? [caminho] : []
  })
}

describe('isolamento da camada game/', () => {
  it('não importa nada de net/ nem de ui/', () => {
    const violacoes = arquivosTs('src/game').filter((caminho) => {
      const conteudo = readFileSync(caminho, 'utf-8')
      return /from\s+['"].*\/(net|ui)\//.test(conteudo)
    })
    expect(violacoes).toEqual([])
  })

  it('não referencia APIs de navegador', () => {
    const violacoes = arquivosTs('src/game').filter((caminho) => {
      if (caminho.endsWith('.test.ts')) return false
      const conteudo = readFileSync(caminho, 'utf-8')
      return /\b(document|window|localStorage)\b/.test(conteudo)
    })
    expect(violacoes).toEqual([])
  })
})
```

- [ ] **Step 3: Rodar os testes**

Run: `npm test -- isolamento`
Expected: PASS, 2 testes

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/game/isolamento.test.ts
git commit -m "feat: tipos do domínio e teste de isolamento da camada game"
```

---

## Task 3: Sapata — criação, embaralhamento e reconstrução

**Files:**
- Create: `src/game/shoe.ts`
- Test: `src/game/shoe.test.ts`

**Interfaces:**
- Consumes: `Carta`, `Naipe`, `Valor`, `Rng` de `src/game/types.ts`
- Produces:
  - `criarBaralho(): Carta[]` — 52 cartas
  - `embaralhar(cartas: Carta[], rng: Rng): Carta[]` — novo array, não muta
  - `criarSapata(numBaralhos: number, rng: Rng): Carta[]`
  - `precisaReembaralhar(restantes: number, numBaralhos: number): boolean`
  - `reconstruirSapata(numBaralhos: number, cartasVistas: Carta[], rng: Rng): Carta[]`
  - `rngSemente(semente: number): Rng` — gerador determinístico para testes

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/game/shoe.test.ts
import { describe, it, expect } from 'vitest'
import {
  criarBaralho, embaralhar, criarSapata,
  precisaReembaralhar, reconstruirSapata, rngSemente,
} from './shoe'
import type { Carta } from './types'

describe('criarBaralho', () => {
  it('produz 52 cartas', () => {
    expect(criarBaralho()).toHaveLength(52)
  })

  it('produz 13 cartas de cada naipe', () => {
    const baralho = criarBaralho()
    for (const naipe of ['copas', 'ouros', 'paus', 'espadas'] as const) {
      expect(baralho.filter((c) => c.naipe === naipe)).toHaveLength(13)
    }
  })

  it('não repete nenhuma carta', () => {
    const chaves = criarBaralho().map((c) => `${c.valor}-${c.naipe}`)
    expect(new Set(chaves).size).toBe(52)
  })
})

describe('embaralhar', () => {
  it('preserva todas as cartas', () => {
    const baralho = criarBaralho()
    const mexido = embaralhar(baralho, rngSemente(42))
    expect(mexido).toHaveLength(52)
    expect(new Set(mexido.map((c) => `${c.valor}-${c.naipe}`)).size).toBe(52)
  })

  it('não muta o array original', () => {
    const baralho = criarBaralho()
    const copia = [...baralho]
    embaralhar(baralho, rngSemente(1))
    expect(baralho).toEqual(copia)
  })

  it('é determinístico para a mesma semente', () => {
    const a = embaralhar(criarBaralho(), rngSemente(7))
    const b = embaralhar(criarBaralho(), rngSemente(7))
    expect(a).toEqual(b)
  })

  it('produz ordens diferentes para sementes diferentes', () => {
    const a = embaralhar(criarBaralho(), rngSemente(1))
    const b = embaralhar(criarBaralho(), rngSemente(2))
    expect(a).not.toEqual(b)
  })
})

describe('criarSapata', () => {
  it('junta 6 baralhos em 312 cartas', () => {
    expect(criarSapata(6, rngSemente(3))).toHaveLength(312)
  })

  it('contém exatamente 24 Ases numa sapata de 6', () => {
    const sapata = criarSapata(6, rngSemente(3))
    expect(sapata.filter((c) => c.valor === 'A')).toHaveLength(24)
  })
})

describe('precisaReembaralhar', () => {
  it('é falso acima de 25% restante', () => {
    expect(precisaReembaralhar(100, 6)).toBe(false)
  })

  it('é verdadeiro abaixo de 25% restante', () => {
    expect(precisaReembaralhar(70, 6)).toBe(true)
  })

  it('é verdadeiro exatamente no limiar', () => {
    expect(precisaReembaralhar(78, 6)).toBe(true)
  })
})

describe('reconstruirSapata', () => {
  it('remove as cartas já vistas da composição', () => {
    const vistas: Carta[] = [
      { valor: 'A', naipe: 'copas' },
      { valor: 'A', naipe: 'copas' },
      { valor: 'K', naipe: 'espadas' },
    ]
    const sapata = reconstruirSapata(6, vistas, rngSemente(9))
    expect(sapata).toHaveLength(312 - 3)
    expect(sapata.filter((c) => c.valor === 'A' && c.naipe === 'copas')).toHaveLength(4)
  })

  it('ignora cartas vistas além do que a sapata continha', () => {
    const vistas: Carta[] = Array.from({ length: 10 }, () => ({
      valor: 'A' as const, naipe: 'copas' as const,
    }))
    const sapata = reconstruirSapata(6, vistas, rngSemente(9))
    expect(sapata.filter((c) => c.valor === 'A' && c.naipe === 'copas')).toHaveLength(0)
    expect(sapata).toHaveLength(312 - 6)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- shoe`
Expected: FAIL, "Failed to resolve import './shoe'"

- [ ] **Step 3: Implementar `src/game/shoe.ts`**

```ts
import type { Carta, Naipe, Rng, Valor } from './types'

const NAIPES: readonly Naipe[] = ['copas', 'ouros', 'paus', 'espadas']
const VALORES: readonly Valor[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
]

const LIMIAR_REEMBARALHO = 0.25

/** Gerador determinístico (mulberry32) — usado nos testes e na semente da partida. */
export function rngSemente(semente: number): Rng {
  let estado = semente >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function criarBaralho(): Carta[] {
  return NAIPES.flatMap((naipe) => VALORES.map((valor) => ({ naipe, valor })))
}

/** Fisher-Yates sobre uma cópia — o array recebido nunca é mutado. */
export function embaralhar(cartas: Carta[], rng: Rng): Carta[] {
  const copia = [...cartas]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = copia[i]!
    const b = copia[j]!
    copia[i] = b
    copia[j] = a
  }
  return copia
}

export function criarSapata(numBaralhos: number, rng: Rng): Carta[] {
  const cartas = Array.from({ length: numBaralhos }, criarBaralho).flat()
  return embaralhar(cartas, rng)
}

export function precisaReembaralhar(restantes: number, numBaralhos: number): boolean {
  return restantes <= numBaralhos * 52 * LIMIAR_REEMBARALHO
}

/**
 * Monta uma sapata nova descontando as cartas já visíveis na mesa.
 * Usada quando um novo host assume: ele nunca viu a sapata do anterior,
 * mas sabe o que foi distribuído.
 */
export function reconstruirSapata(
  numBaralhos: number,
  cartasVistas: Carta[],
  rng: Rng,
): Carta[] {
  const restantes = Array.from({ length: numBaralhos }, criarBaralho).flat()
  for (const vista of cartasVistas) {
    const indice = restantes.findIndex(
      (c) => c.valor === vista.valor && c.naipe === vista.naipe,
    )
    if (indice !== -1) restantes.splice(indice, 1)
  }
  return embaralhar(restantes, rng)
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- shoe`
Expected: PASS, 14 testes

- [ ] **Step 5: Commit**

```bash
git add src/game/shoe.ts src/game/shoe.test.ts
git commit -m "feat: sapata de 6 baralhos com embaralhamento determinístico e reconstrução"
```

---

## Task 4: Avaliação de mão

**Files:**
- Create: `src/game/hand.ts`
- Test: `src/game/hand.test.ts`

**Interfaces:**
- Consumes: `Carta`, `Mao` de `src/game/types.ts`
- Produces:
  - `valorCarta(carta: Carta): number` — Ás vale 1 aqui; a promoção a 11 é decidida em `avaliar`
  - `avaliar(cartas: Carta[]): { total: number; soft: boolean }`
  - `estourou(cartas: Carta[]): boolean`
  - `ehBlackjackNatural(mao: Mao): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Estes são os casos que mais quebram implementação de blackjack. O Ás é a fonte de quase todo bug: ele vale 11 até isso estourar, e aí passa a valer 1 — e uma mão pode ter vários.

```ts
// src/game/hand.test.ts
import { describe, it, expect } from 'vitest'
import { avaliar, estourou, ehBlackjackNatural, valorCarta } from './hand'
import type { Carta, Mao } from './types'

const c = (valor: Carta['valor']): Carta => ({ valor, naipe: 'copas' })

function mao(cartas: Carta[], extras: Partial<Mao> = {}): Mao {
  return {
    id: 'm1', cartas, aposta: 100, dobrada: false,
    vindaDeSplit: false, encerrada: false, ...extras,
  }
}

describe('valorCarta', () => {
  it('dá 10 para todas as figuras', () => {
    expect(valorCarta(c('J'))).toBe(10)
    expect(valorCarta(c('Q'))).toBe(10)
    expect(valorCarta(c('K'))).toBe(10)
  })

  it('dá o valor numérico para cartas numeradas', () => {
    expect(valorCarta(c('7'))).toBe(7)
  })

  it('dá 1 para o Ás — a promoção a 11 é decidida em avaliar', () => {
    expect(valorCarta(c('A'))).toBe(1)
  })
})

describe('avaliar', () => {
  it('soma mão simples sem Ás', () => {
    expect(avaliar([c('9'), c('7')])).toEqual({ total: 16, soft: false })
  })

  it('conta o Ás como 11 quando cabe', () => {
    expect(avaliar([c('A'), c('6')])).toEqual({ total: 17, soft: true })
  })

  it('rebaixa o Ás para 1 quando 11 estouraria', () => {
    expect(avaliar([c('A'), c('6'), c('9')])).toEqual({ total: 16, soft: false })
  })

  it('promove apenas um Ás quando há dois', () => {
    expect(avaliar([c('A'), c('A')])).toEqual({ total: 12, soft: true })
  })

  it('rebaixa os dois Ases quando necessário', () => {
    expect(avaliar([c('A'), c('A'), c('9'), c('K')])).toEqual({ total: 21, soft: false })
  })

  it('reconhece 21 com Ás e figura', () => {
    expect(avaliar([c('A'), c('K')])).toEqual({ total: 21, soft: true })
  })

  it('avalia mão vazia como zero', () => {
    expect(avaliar([])).toEqual({ total: 0, soft: false })
  })
})

describe('estourou', () => {
  it('é falso em 21', () => {
    expect(estourou([c('K'), c('6'), c('5')])).toBe(false)
  })

  it('é verdadeiro acima de 21', () => {
    expect(estourou([c('K'), c('Q'), c('5')])).toBe(true)
  })

  it('é falso quando o Ás salva a mão', () => {
    expect(estourou([c('A'), c('K'), c('5')])).toBe(false)
  })
})

describe('ehBlackjackNatural', () => {
  it('reconhece Ás mais figura nas duas primeiras cartas', () => {
    expect(ehBlackjackNatural(mao([c('A'), c('K')]))).toBe(true)
  })

  it('recusa 21 formado com três cartas', () => {
    expect(ehBlackjackNatural(mao([c('7'), c('7'), c('7')]))).toBe(false)
  })

  it('recusa 21 numa mão vinda de split', () => {
    expect(ehBlackjackNatural(mao([c('A'), c('K')], { vindaDeSplit: true }))).toBe(false)
  })

  it('recusa mão de duas cartas que não soma 21', () => {
    expect(ehBlackjackNatural(mao([c('A'), c('9')]))).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- hand`
Expected: FAIL, "Failed to resolve import './hand'"

- [ ] **Step 3: Implementar `src/game/hand.ts`**

```ts
import type { Carta, Mao } from './types'

export function valorCarta(carta: Carta): number {
  if (carta.valor === 'A') return 1
  if (carta.valor === 'J' || carta.valor === 'Q' || carta.valor === 'K') return 10
  return Number(carta.valor)
}

/**
 * Soma tudo com Ás valendo 1 e promove um único Ás a 11 se couber.
 * Promover mais de um sempre estouraria (11 + 11 = 22), então um basta.
 * `soft` indica que há um Ás valendo 11 — ou seja, a mão não estoura
 * na próxima carta.
 */
export function avaliar(cartas: Carta[]): { total: number; soft: boolean } {
  const base = cartas.reduce((soma, carta) => soma + valorCarta(carta), 0)
  const temAs = cartas.some((carta) => carta.valor === 'A')

  if (temAs && base + 10 <= 21) {
    return { total: base + 10, soft: true }
  }
  return { total: base, soft: false }
}

export function estourou(cartas: Carta[]): boolean {
  return avaliar(cartas).total > 21
}

/**
 * Blackjack natural exige 21 nas duas cartas iniciais e mão que não
 * veio de split — 21 após split paga como vitória comum.
 */
export function ehBlackjackNatural(mao: Mao): boolean {
  return (
    !mao.vindaDeSplit &&
    mao.cartas.length === 2 &&
    avaliar(mao.cartas).total === 21
  )
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- hand`
Expected: PASS, 17 testes

- [ ] **Step 5: Commit**

```bash
git add src/game/hand.ts src/game/hand.test.ts
git commit -m "feat: avaliação de mão com tratamento de Ás soft e hard"
```

---

## Task 5: Regras — ações disponíveis e pagamentos

**Files:**
- Create: `src/game/rules.ts`
- Test: `src/game/rules.test.ts`

**Interfaces:**
- Consumes: `avaliar`, `ehBlackjackNatural` de `./hand`; tipos de `./types`
- Produces:
  - `REGRAS` — objeto congelado com todas as constantes do spec
  - `acoesDisponiveis(mao: Mao, jogador: Jogador): TipoAcao[]`
  - `pagamento(mao: Mao, cartasDealer: Carta[]): number` — total devolvido em fichas, já incluindo a aposta original
  - `resultadoDe(mao: Mao, cartasDealer: Carta[]): ResultadoMao`
  - `dealerDeveComprar(cartas: Carta[]): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/game/rules.test.ts
import { describe, it, expect } from 'vitest'
import { REGRAS, acoesDisponiveis, pagamento, resultadoDe, dealerDeveComprar } from './rules'
import type { Carta, Jogador, Mao } from './types'

const c = (valor: Carta['valor']): Carta => ({ valor, naipe: 'copas' })
const c2 = (valor: Carta['valor']): Carta => ({ valor, naipe: 'paus' })

function mao(cartas: Carta[], extras: Partial<Mao> = {}): Mao {
  return {
    id: 'm1', cartas, aposta: 100, dobrada: false,
    vindaDeSplit: false, encerrada: false, ...extras,
  }
}

function jogador(extras: Partial<Jogador> = {}): Jogador {
  return {
    peerId: 'p1', apelido: 'Alex', cadeira: 0, fichas: 1000,
    maos: [], maoAtiva: 0, seguro: 0, rodadasInativo: 0,
    desconectadoEm: null, ...extras,
  }
}

describe('REGRAS', () => {
  it('reflete os valores fixados no spec', () => {
    expect(REGRAS.numBaralhos).toBe(6)
    expect(REGRAS.stackInicial).toBe(1000)
    expect(REGRAS.apostaMin).toBe(25)
    expect(REGRAS.apostaMax).toBe(500)
    expect(REGRAS.maxCadeiras).toBe(7)
    expect(REGRAS.maxMaos).toBe(3)
    expect(REGRAS.segundosTurno).toBe(30)
    expect(REGRAS.fichas).toEqual([25, 100, 500])
  })
})

describe('dealerDeveComprar', () => {
  it('compra com 16', () => {
    expect(dealerDeveComprar([c('10'), c('6')])).toBe(true)
  })

  it('para com 17 duro', () => {
    expect(dealerDeveComprar([c('10'), c('7')])).toBe(false)
  })

  it('para com 17 soft — a casa para em soft 17', () => {
    expect(dealerDeveComprar([c('A'), c('6')])).toBe(false)
  })

  it('para com 21', () => {
    expect(dealerDeveComprar([c('A'), c('K')])).toBe(false)
  })
})

describe('acoesDisponiveis', () => {
  it('oferece pedir, parar, dobrar e dividir num par inicial', () => {
    const m = mao([c('8'), c2('8')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] })).sort())
      .toEqual(['dividir', 'dobrar', 'parar', 'pedir'])
  })

  it('não oferece dividir quando as cartas têm valores diferentes', () => {
    const m = mao([c('8'), c('9')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).not.toContain('dividir')
  })

  it('oferece dividir para figuras distintas de mesmo valor', () => {
    const m = mao([c('K'), c2('Q')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toContain('dividir')
  })

  it('não oferece dobrar nem dividir com três cartas', () => {
    const m = mao([c('5'), c('3'), c('4')])
    const acoes = acoesDisponiveis(m, jogador({ maos: [m] }))
    expect(acoes).not.toContain('dobrar')
    expect(acoes).not.toContain('dividir')
  })

  it('não oferece dividir ao atingir o limite de 3 mãos', () => {
    const m = mao([c('8'), c2('8')])
    const j = jogador({ maos: [m, mao([c('2'), c('3')]), mao([c('4'), c('5')])] })
    expect(acoesDisponiveis(m, j)).not.toContain('dividir')
  })

  it('não oferece dobrar sem fichas suficientes', () => {
    const m = mao([c('5'), c('6')], { aposta: 500 })
    expect(acoesDisponiveis(m, jogador({ fichas: 100, maos: [m] }))).not.toContain('dobrar')
  })

  it('permite dobrar depois de split', () => {
    const m = mao([c('5'), c('6')], { vindaDeSplit: true })
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toContain('dobrar')
  })

  it('não oferece nada para mão encerrada', () => {
    const m = mao([c('K'), c('9')], { encerrada: true })
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toEqual([])
  })

  it('não oferece nada para mão estourada', () => {
    const m = mao([c('K'), c('9'), c('5')])
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toEqual([])
  })

  it('trava Ases divididos em exatamente uma carta', () => {
    const m = mao([c('A'), c('7')], { vindaDeSplit: true })
    expect(acoesDisponiveis(m, jogador({ maos: [m] }))).toEqual([])
  })
})

describe('resultadoDe', () => {
  it('marca blackjack natural', () => {
    expect(resultadoDe(mao([c('A'), c('K')]), [c('10'), c('8')])).toBe('blackjack')
  })

  it('empata blackjack contra blackjack', () => {
    expect(resultadoDe(mao([c('A'), c('K')]), [c('A'), c('Q')])).toBe('empatou')
  })

  it('marca derrota quando o jogador estoura, mesmo com dealer estourado', () => {
    expect(resultadoDe(mao([c('K'), c('Q'), c('5')]), [c('K'), c('Q'), c('5')])).toBe('perdeu')
  })

  it('marca vitória quando o dealer estoura', () => {
    expect(resultadoDe(mao([c('K'), c('8')]), [c('K'), c('Q'), c('5')])).toBe('ganhou')
  })

  it('compara totais quando ninguém estoura', () => {
    expect(resultadoDe(mao([c('K'), c('9')]), [c('K'), c('8')])).toBe('ganhou')
    expect(resultadoDe(mao([c('K'), c('7')]), [c('K'), c('8')])).toBe('perdeu')
    expect(resultadoDe(mao([c('K'), c('8')]), [c('K'), c('8')])).toBe('empatou')
  })

  it('não trata 21 pós-split como blackjack', () => {
    const m = mao([c('A'), c('K')], { vindaDeSplit: true })
    expect(resultadoDe(m, [c('10'), c('8')])).toBe('ganhou')
  })
})

describe('pagamento', () => {
  it('paga blackjack a 3:2 mais a aposta', () => {
    expect(pagamento(mao([c('A'), c('K')], { aposta: 100 }), [c('10'), c('8')])).toBe(250)
  })

  it('paga vitória comum 1:1 mais a aposta', () => {
    expect(pagamento(mao([c('K'), c('9')], { aposta: 100 }), [c('K'), c('8')])).toBe(200)
  })

  it('devolve a aposta no empate', () => {
    expect(pagamento(mao([c('K'), c('8')], { aposta: 100 }), [c('K'), c('8')])).toBe(100)
  })

  it('não devolve nada na derrota', () => {
    expect(pagamento(mao([c('K'), c('7')], { aposta: 100 }), [c('K'), c('8')])).toBe(0)
  })

  it('paga sobre a aposta dobrada', () => {
    const m = mao([c('5'), c('6'), c('K')], { aposta: 200, dobrada: true })
    expect(pagamento(m, [c('K'), c('8')])).toBe(400)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- rules`
Expected: FAIL, "Failed to resolve import './rules'"

- [ ] **Step 3: Implementar `src/game/rules.ts`**

```ts
import { avaliar, ehBlackjackNatural, valorCarta } from './hand'
import type { Carta, Jogador, Mao, ResultadoMao, TipoAcao } from './types'

export const REGRAS = Object.freeze({
  numBaralhos: 6,
  stackInicial: 1000,
  apostaMin: 25,
  apostaMax: 500,
  fichas: [25, 100, 500] as const,
  maxCadeiras: 7,
  maxMaos: 3,
  segundosTurno: 30,
  segundosReconexao: 60,
  rodadasParaEspectador: 2,
  pagaBlackjack: 1.5,
  pagaSeguro: 2,
})

export function dealerDeveComprar(cartas: Carta[]): boolean {
  return avaliar(cartas).total < 17
}

export function acoesDisponiveis(mao: Mao, jogador: Jogador): TipoAcao[] {
  if (mao.encerrada) return []

  const { total } = avaliar(mao.cartas)
  if (total > 21) return []

  // Ás dividido recebe exatamente uma carta e encerra.
  const asDividido =
    mao.vindaDeSplit && mao.cartas[0]?.valor === 'A' && mao.cartas.length >= 2
  if (asDividido) return []

  const acoes: TipoAcao[] = ['pedir', 'parar']

  const inicial = mao.cartas.length === 2
  const temFichas = jogador.fichas >= mao.aposta

  if (inicial && temFichas) acoes.push('dobrar')

  if (inicial && temFichas && jogador.maos.length < REGRAS.maxMaos) {
    const [a, b] = mao.cartas
    if (a && b && valorCarta(a) === valorCarta(b)) acoes.push('dividir')
  }

  return acoes
}

export function resultadoDe(mao: Mao, cartasDealer: Carta[]): ResultadoMao {
  const jogador = avaliar(mao.cartas).total
  if (jogador > 21) return 'perdeu'

  const dealer = avaliar(cartasDealer).total
  const jogadorBJ = ehBlackjackNatural(mao)
  const dealerBJ = cartasDealer.length === 2 && dealer === 21

  if (jogadorBJ && dealerBJ) return 'empatou'
  if (jogadorBJ) return 'blackjack'
  if (dealerBJ) return 'perdeu'

  if (dealer > 21) return 'ganhou'
  if (jogador > dealer) return 'ganhou'
  if (jogador < dealer) return 'perdeu'
  return 'empatou'
}

/** Total devolvido ao jogador em fichas, já incluindo a aposta original. */
export function pagamento(mao: Mao, cartasDealer: Carta[]): number {
  switch (resultadoDe(mao, cartasDealer)) {
    case 'blackjack':
      return mao.aposta + mao.aposta * REGRAS.pagaBlackjack
    case 'ganhou':
      return mao.aposta * 2
    case 'empatou':
      return mao.aposta
    case 'perdeu':
      return 0
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- rules`
Expected: PASS, 25 testes

- [ ] **Step 5: Commit**

```bash
git add src/game/rules.ts src/game/rules.test.ts
git commit -m "feat: regras da casa, ações disponíveis e tabela de pagamentos"
```

---

## Task 6: Máquina de estados da rodada

**Files:**
- Create: `src/game/machine.ts`
- Test: `src/game/machine.test.ts`

**Interfaces:**
- Consumes: tudo de `./types`, `./shoe`, `./hand`, `./rules`
- Produces:
  - `interface Contexto { estado: EstadoJogo; sapata: Carta[]; ocultaDealer: Carta | null }`
  - `criarContexto(hostId: string, rng: Rng): Contexto`
  - `aplicar(ctx: Contexto, peerId: string, acao: Acao, agora: number, rng: Rng): Contexto`
  - `avancar(ctx: Contexto, agora: number, rng: Rng): Contexto`
  - `cartasVisiveis(estado: EstadoJogo): Carta[]`

`Contexto` é o que o host guarda. Só `ctx.estado` é transmitido — `sapata` e `ocultaDealer` ficam na memória do host.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/game/machine.test.ts
import { describe, it, expect } from 'vitest'
import { criarContexto, aplicar, avancar, cartasVisiveis } from './machine'
import { rngSemente } from './shoe'
import { REGRAS } from './rules'
import type { Contexto } from './machine'

const RNG = () => rngSemente(1234)

function comDoisJogadores(): Contexto {
  let ctx = criarContexto('p1', RNG())
  ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
  ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
  ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
  ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
  return ctx
}

describe('criarContexto', () => {
  it('começa aguardando, sem jogadores', () => {
    const ctx = criarContexto('p1', RNG())
    expect(ctx.estado.fase).toBe('aguardando')
    expect(ctx.estado.jogadores).toEqual([])
  })

  it('começa com a sapata cheia', () => {
    const ctx = criarContexto('p1', RNG())
    expect(ctx.sapata).toHaveLength(REGRAS.numBaralhos * 52)
  })
})

describe('entrar e sentar', () => {
  it('adiciona o jogador como espectador', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    expect(ctx.estado.jogadores[0]).toMatchObject({
      peerId: 'p1', apelido: 'Alex', cadeira: null, fichas: REGRAS.stackInicial,
    })
  })

  it('senta o jogador na cadeira pedida', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 3 }, 0, RNG())
    expect(ctx.estado.jogadores[0]!.cadeira).toBe(3)
  })

  it('recusa cadeira já ocupada', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.cadeira).toBe(1)
  })

  it('vai para apostas com dois jogadores sentados', () => {
    expect(comDoisJogadores().estado.fase).toBe('apostas')
  })
})

describe('apostas', () => {
  it('debita as fichas ao apostar', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    const p1 = ctx.estado.jogadores.find((j) => j.peerId === 'p1')!
    expect(p1.fichas).toBe(REGRAS.stackInicial - 100)
    expect(p1.maos[0]!.aposta).toBe(100)
  })

  it('recusa aposta abaixo do mínimo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 10 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.maos).toHaveLength(0)
  })

  it('recusa aposta acima do máximo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 900 }, 0, RNG())
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p1')!.maos).toHaveLength(0)
  })

  it('distribui quando todos apostaram', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    expect(ctx.estado.jogadores[0]!.maos[0]!.cartas).toHaveLength(2)
    expect(ctx.estado.maoDealer).toHaveLength(1)
    expect(ctx.estado.dealerTemOculta).toBe(true)
    expect(ctx.ocultaDealer).not.toBeNull()
  })

  it('deixa de fora quem não apostou até o prazo', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.fase).not.toBe('apostas')
    expect(ctx.estado.jogadores.find((j) => j.peerId === 'p2')!.maos).toHaveLength(0)
  })
})

describe('sapata nunca vaza no estado', () => {
  it('EstadoJogo não contém a sapata nem a carta oculta', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    const serializado = JSON.stringify(ctx.estado)
    expect(serializado).not.toContain('sapata')
    expect(serializado).not.toContain('oculta')
    expect(ctx.estado.maoDealer).toHaveLength(1)
  })
})

describe('turnos', () => {
  function emTurnos(): Contexto {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    return avancar(ctx, 0, RNG())
  }

  it('dá a vez ao jogador da primeira cadeira', () => {
    expect(emTurnos().estado.vezDe).toBe('p1')
  })

  it('define prazo do turno', () => {
    const ctx = emTurnos()
    expect(ctx.estado.prazoTurno).toBe(REGRAS.segundosTurno * 1000)
  })

  it('adiciona carta ao pedir', () => {
    let ctx = emTurnos()
    const maoId = ctx.estado.jogadores[0]!.maos[0]!.id
    ctx = aplicar(ctx, 'p1', { tipo: 'pedir', maoId }, 0, RNG())
    expect(ctx.estado.jogadores[0]!.maos[0]!.cartas).toHaveLength(3)
  })

  it('ignora ação de quem não é a vez', () => {
    let ctx = emTurnos()
    const maoId = ctx.estado.jogadores[1]!.maos[0]!.id
    ctx = aplicar(ctx, 'p2', { tipo: 'pedir', maoId }, 0, RNG())
    expect(ctx.estado.jogadores[1]!.maos[0]!.cartas).toHaveLength(2)
  })

  it('passa a vez ao parar', () => {
    let ctx = emTurnos()
    const maoId = ctx.estado.jogadores[0]!.maos[0]!.id
    ctx = aplicar(ctx, 'p1', { tipo: 'parar', maoId }, 0, RNG())
    expect(ctx.estado.vezDe).toBe('p2')
  })

  it('para automaticamente quando o prazo expira', () => {
    let ctx = emTurnos()
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.vezDe).toBe('p2')
    expect(ctx.estado.jogadores[0]!.maos[0]!.encerrada).toBe(true)
    expect(ctx.estado.jogadores[0]!.rodadasInativo).toBe(1)
  })

  it('vira espectador após duas rodadas inativo', () => {
    let ctx = emTurnos()
    ctx.estado.jogadores[0]!.rodadasInativo = 1
    ctx = avancar(ctx, REGRAS.segundosTurno * 1000 + 1, RNG())
    expect(ctx.estado.jogadores[0]!.cadeira).toBeNull()
  })
})

describe('dividir', () => {
  it('cria duas mãos e debita a aposta extra', () => {
    let ctx = criarContexto('p1', RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'entrar', apelido: 'Alex' }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'sentar', cadeira: 0 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'entrar', apelido: 'Bruno' }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'sentar', cadeira: 1 }, 0, RNG())
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    // força um par para tornar o teste determinístico
    const jogador = ctx.estado.jogadores[0]!
    jogador.maos[0]!.cartas = [
      { valor: '8', naipe: 'copas' },
      { valor: '8', naipe: 'paus' },
    ]
    const maoId = jogador.maos[0]!.id
    const fichasAntes = jogador.fichas

    ctx = aplicar(ctx, 'p1', { tipo: 'dividir', maoId }, 0, RNG())

    const depois = ctx.estado.jogadores[0]!
    expect(depois.maos).toHaveLength(2)
    expect(depois.maos[0]!.cartas).toHaveLength(2)
    expect(depois.maos[1]!.cartas).toHaveLength(2)
    expect(depois.maos[1]!.vindaDeSplit).toBe(true)
    expect(depois.fichas).toBe(fichasAntes - 100)
  })
})

describe('cartasVisiveis', () => {
  it('junta cartas de todas as mãos e do dealer', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())
    // 2 jogadores x 2 cartas + 1 do dealer
    expect(cartasVisiveis(ctx.estado)).toHaveLength(5)
  })
})

describe('acerto', () => {
  it('credita o pagamento e volta para apostas', () => {
    let ctx = comDoisJogadores()
    ctx = aplicar(ctx, 'p1', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = aplicar(ctx, 'p2', { tipo: 'apostar', valor: 100 }, 0, RNG())
    ctx = avancar(ctx, 0, RNG())

    let guarda = 0
    while (ctx.estado.fase !== 'apostas' && guarda++ < 50) {
      if (ctx.estado.vezDe) {
        const jogador = ctx.estado.jogadores.find((j) => j.peerId === ctx.estado.vezDe)!
        const m = jogador.maos[jogador.maoAtiva]!
        ctx = aplicar(ctx, jogador.peerId, { tipo: 'parar', maoId: m.id }, 0, RNG())
      }
      ctx = avancar(ctx, 0, RNG())
    }

    expect(ctx.estado.fase).toBe('apostas')
    expect(ctx.estado.rodada).toBe(2)
    for (const j of ctx.estado.jogadores) {
      expect(j.maos).toHaveLength(0)
    }
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- machine`
Expected: FAIL, "Failed to resolve import './machine'"

- [ ] **Step 3: Implementar `src/game/machine.ts`**

```ts
import { criarSapata, precisaReembaralhar } from './shoe'
import { avaliar, estourou } from './hand'
import { REGRAS, acoesDisponiveis, dealerDeveComprar, pagamento, resultadoDe } from './rules'
import type { Acao, Carta, EstadoJogo, Jogador, Mao, Rng } from './types'

export interface Contexto {
  estado: EstadoJogo
  sapata: Carta[]
  ocultaDealer: Carta | null
}

let sequenciaMao = 0
function novoIdMao(): string {
  sequenciaMao += 1
  return `m${sequenciaMao}`
}

function clonar(ctx: Contexto): Contexto {
  return {
    estado: structuredClone(ctx.estado),
    sapata: [...ctx.sapata],
    ocultaDealer: ctx.ocultaDealer,
  }
}

function comprar(ctx: Contexto, rng: Rng): Carta {
  if (ctx.sapata.length === 0) {
    ctx.sapata = criarSapata(REGRAS.numBaralhos, rng)
  }
  const carta = ctx.sapata.pop()!
  ctx.estado.cartasRestantes = ctx.sapata.length
  return carta
}

function sentados(estado: EstadoJogo): Jogador[] {
  return estado.jogadores
    .filter((j) => j.cadeira !== null)
    .sort((a, b) => a.cadeira! - b.cadeira!)
}

function maoNova(aposta: number, vindaDeSplit = false): Mao {
  return {
    id: novoIdMao(), cartas: [], aposta,
    dobrada: false, vindaDeSplit, encerrada: false,
  }
}

export function criarContexto(hostId: string, rng: Rng): Contexto {
  const sapata = criarSapata(REGRAS.numBaralhos, rng)
  return {
    sapata,
    ocultaDealer: null,
    estado: {
      fase: 'aguardando',
      jogadores: [],
      vezDe: null,
      prazoTurno: null,
      maoDealer: [],
      dealerTemOculta: false,
      cartasRestantes: sapata.length,
      hostAtual: hostId,
      rodada: 1,
    },
  }
}

export function cartasVisiveis(estado: EstadoJogo): Carta[] {
  const daMesa = estado.jogadores.flatMap((j) => j.maos.flatMap((m) => m.cartas))
  return [...daMesa, ...estado.maoDealer]
}

export function aplicar(
  ctx: Contexto, peerId: string, acao: Acao, agora: number, rng: Rng,
): Contexto {
  const novo = clonar(ctx)
  const estado = novo.estado
  const jogador = estado.jogadores.find((j) => j.peerId === peerId)

  switch (acao.tipo) {
    case 'entrar': {
      if (jogador) {
        jogador.apelido = acao.apelido
        jogador.desconectadoEm = null
        break
      }
      // Reconexão: um jogador ausente com o mesmo apelido recupera
      // cadeira, fichas e mãos, assumindo o novo peerId.
      const ausente = estado.jogadores.find(
        (j) => j.desconectadoEm !== null && j.apelido === acao.apelido,
      )
      if (ausente) {
        ausente.peerId = peerId
        ausente.desconectadoEm = null
        break
      }
      estado.jogadores.push({
        peerId, apelido: acao.apelido, cadeira: null,
        fichas: REGRAS.stackInicial, maos: [], maoAtiva: 0,
        seguro: 0, rodadasInativo: 0, desconectadoEm: null,
      })
      break
    }

    case 'sentar': {
      if (!jogador || jogador.cadeira !== null) break
      if (acao.cadeira < 0 || acao.cadeira >= REGRAS.maxCadeiras) break
      if (estado.jogadores.some((j) => j.cadeira === acao.cadeira)) break
      jogador.cadeira = acao.cadeira
      break
    }

    case 'levantar': {
      if (!jogador) break
      jogador.cadeira = null
      jogador.maos = []
      break
    }

    case 'apostar': {
      if (!jogador || estado.fase !== 'apostas') break
      if (jogador.cadeira === null || jogador.maos.length > 0) break
      if (acao.valor < REGRAS.apostaMin || acao.valor > REGRAS.apostaMax) break
      if (acao.valor > jogador.fichas) break
      jogador.fichas -= acao.valor
      jogador.maos = [maoNova(acao.valor)]
      jogador.maoAtiva = 0
      break
    }

    case 'seguro': {
      if (!jogador || estado.fase !== 'seguro') break
      if (!acao.aceitar) break
      const metade = Math.floor((jogador.maos[0]?.aposta ?? 0) / 2)
      if (metade > jogador.fichas) break
      jogador.fichas -= metade
      jogador.seguro = metade
      break
    }

    case 'pedir':
    case 'parar':
    case 'dobrar':
    case 'dividir': {
      if (!jogador || estado.fase !== 'turnos') break
      if (estado.vezDe !== peerId) break

      const mao = jogador.maos.find((m) => m.id === acao.maoId)
      if (!mao || mao.id !== jogador.maos[jogador.maoAtiva]?.id) break
      if (!acoesDisponiveis(mao, jogador).includes(acao.tipo)) break

      jogador.rodadasInativo = 0

      if (acao.tipo === 'pedir') {
        mao.cartas.push(comprar(novo, rng))
        if (estourou(mao.cartas)) mao.encerrada = true
      }

      if (acao.tipo === 'parar') {
        mao.encerrada = true
      }

      if (acao.tipo === 'dobrar') {
        jogador.fichas -= mao.aposta
        mao.aposta *= 2
        mao.dobrada = true
        mao.cartas.push(comprar(novo, rng))
        mao.encerrada = true
      }

      if (acao.tipo === 'dividir') {
        const movida = mao.cartas.pop()!
        jogador.fichas -= mao.aposta
        const filha = maoNova(mao.aposta, true)
        filha.cartas = [movida]
        mao.vindaDeSplit = true
        jogador.maos.splice(jogador.maoAtiva + 1, 0, filha)
        mao.cartas.push(comprar(novo, rng))
        filha.cartas.push(comprar(novo, rng))
        // Ás dividido recebe uma carta só e encerra imediatamente.
        if (movida.valor === 'A') {
          mao.encerrada = true
          filha.encerrada = true
        }
      }

      avancarTurnoSeNecessario(novo, agora)
      break
    }
  }

  return transicionar(novo, agora, rng)
}

function avancarTurnoSeNecessario(ctx: Contexto, agora: number): void {
  const estado = ctx.estado
  const jogador = estado.jogadores.find((j) => j.peerId === estado.vezDe)
  if (!jogador) return

  while (jogador.maoAtiva < jogador.maos.length) {
    const mao = jogador.maos[jogador.maoAtiva]!
    if (!mao.encerrada && !estourou(mao.cartas)) return
    jogador.maoAtiva += 1
  }

  passarVez(ctx, agora)
}

function passarVez(ctx: Contexto, agora: number): void {
  const estado = ctx.estado
  const naMesa = sentados(estado).filter((j) => j.maos.length > 0)
  const indice = naMesa.findIndex((j) => j.peerId === estado.vezDe)
  const proximo = naMesa[indice + 1]

  if (proximo) {
    estado.vezDe = proximo.peerId
    proximo.maoAtiva = 0
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
  } else {
    estado.vezDe = null
    estado.prazoTurno = null
    estado.fase = 'dealer'
  }
}

function distribuir(ctx: Contexto, agora: number, rng: Rng): void {
  const estado = ctx.estado
  const jogando = sentados(estado).filter((j) => j.maos.length > 0)

  for (let volta = 0; volta < 2; volta++) {
    for (const jogador of jogando) {
      jogador.maos[0]!.cartas.push(comprar(ctx, rng))
    }
    if (volta === 0) {
      estado.maoDealer = [comprar(ctx, rng)]
    } else {
      ctx.ocultaDealer = comprar(ctx, rng)
      estado.dealerTemOculta = true
    }
  }

  const mostraAs = estado.maoDealer[0]?.valor === 'A'
  estado.fase = mostraAs ? 'seguro' : 'turnos'
  estado.vezDe = jogando[0]?.peerId ?? null
  estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
}

function jogarDealer(ctx: Contexto, rng: Rng): void {
  const estado = ctx.estado
  if (ctx.ocultaDealer) {
    estado.maoDealer.push(ctx.ocultaDealer)
    ctx.ocultaDealer = null
    estado.dealerTemOculta = false
  }
  while (dealerDeveComprar(estado.maoDealer)) {
    estado.maoDealer.push(comprar(ctx, rng))
  }
  estado.fase = 'acerto'
}

function acertar(ctx: Contexto, agora: number, rng: Rng): void {
  const estado = ctx.estado
  const dealerBJ = estado.maoDealer.length === 2 && avaliar(estado.maoDealer).total === 21

  for (const jogador of estado.jogadores) {
    for (const mao of jogador.maos) {
      mao.resultado = resultadoDe(mao, estado.maoDealer)
      jogador.fichas += pagamento(mao, estado.maoDealer)
    }
    if (jogador.seguro > 0 && dealerBJ) {
      jogador.fichas += jogador.seguro * (1 + REGRAS.pagaSeguro)
    }
  }

  for (const jogador of estado.jogadores) {
    jogador.maos = []
    jogador.maoAtiva = 0
    jogador.seguro = 0
    if (jogador.fichas < REGRAS.apostaMin) jogador.fichas = REGRAS.stackInicial
  }

  estado.maoDealer = []
  estado.dealerTemOculta = false
  estado.rodada += 1
  estado.fase = sentados(estado).length >= 1 ? 'apostas' : 'aguardando'
  estado.prazoTurno = estado.fase === 'apostas'
    ? agora + REGRAS.segundosTurno * 1000
    : null

  if (precisaReembaralhar(ctx.sapata.length, REGRAS.numBaralhos)) {
    ctx.sapata = criarSapata(REGRAS.numBaralhos, rng)
    estado.cartasRestantes = ctx.sapata.length
  }
}

function transicionar(ctx: Contexto, agora: number, rng: Rng): Contexto {
  const estado = ctx.estado

  if (estado.fase === 'aguardando' && sentados(estado).length >= 1) {
    estado.fase = 'apostas'
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
  }

  if (estado.fase === 'apostas') {
    const naMesa = sentados(estado)
    if (naMesa.length > 0 && naMesa.every((j) => j.maos.length > 0)) {
      distribuir(ctx, agora, rng)
    }
  }

  if (estado.fase === 'dealer') {
    jogarDealer(ctx, rng)
  }

  if (estado.fase === 'acerto') {
    acertar(ctx, agora, rng)
  }

  return ctx
}

/** Chamado pelo host em intervalo curto: aplica prazos vencidos e transições pendentes. */
export function avancar(ctx: Contexto, agora: number, rng: Rng): Contexto {
  const novo = clonar(ctx)
  const estado = novo.estado
  const venceu = estado.prazoTurno !== null && agora >= estado.prazoTurno

  if (estado.fase === 'apostas' && venceu) {
    const semAposta = sentados(estado).filter((j) => j.maos.length === 0)
    if (sentados(estado).some((j) => j.maos.length > 0)) {
      distribuir(novo, agora, rng)
    } else {
      estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
    }
    for (const jogador of semAposta) jogador.rodadasInativo += 1
    return transicionar(novo, agora, rng)
  }

  if (estado.fase === 'seguro' && venceu) {
    estado.fase = 'turnos'
    estado.prazoTurno = agora + REGRAS.segundosTurno * 1000
    return transicionar(novo, agora, rng)
  }

  if (estado.fase === 'turnos' && venceu) {
    const jogador = estado.jogadores.find((j) => j.peerId === estado.vezDe)
    if (jogador) {
      for (const mao of jogador.maos) mao.encerrada = true
      jogador.rodadasInativo += 1
      if (jogador.rodadasInativo >= REGRAS.rodadasParaEspectador) {
        jogador.cadeira = null
      }
      avancarTurnoSeNecessario(novo, agora)
    }
    return transicionar(novo, agora, rng)
  }

  return transicionar(novo, agora, rng)
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- machine`
Expected: PASS, 22 testes

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, todos os testes de `game/`

- [ ] **Step 6: Commit**

```bash
git add src/game/machine.ts src/game/machine.test.ts
git commit -m "feat: máquina de estados da rodada com split, seguro e prazos"
```

---

## Task 7: Transporte — interface, fake para testes e implementação Trystero

**Files:**
- Create: `src/net/transport.ts`
- Create: `src/net/transport.fake.ts`
- Test: `src/net/transport.fake.test.ts`

**Interfaces:**
- Consumes: `Acao`, `EstadoJogo` de `src/game/types.ts`
- Produces:
  - `interface Transporte` — contrato usado por host e cliente
  - `criarTransporteTrystero(codigoSala: string): Transporte`
  - `criarRedeFalsa()` — fábrica de transportes conectados em memória, para testes

- [ ] **Step 1: Criar a interface em `src/net/transport.ts`**

```ts
import { joinRoom } from 'trystero/nostr'
import type { Acao, EstadoJogo } from '../game/types'

export const APP_ID = 'topaz-ascendance-hub'

export interface Transporte {
  meuId(): string
  peers(): string[]
  enviarAcao(acao: Acao): void
  aoReceberAcao(cb: (acao: Acao, peerId: string) => void): void
  enviarEstado(estado: EstadoJogo): void
  aoReceberEstado(cb: (estado: EstadoJogo, peerId: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
  sair(): void
}

export function criarTransporteTrystero(codigoSala: string): Transporte {
  const sala = joinRoom({ appId: APP_ID }, codigoSala)
  const [enviarAcao, receberAcao] = sala.makeAction<Acao>('acao')
  const [enviarEstado, receberEstado] = sala.makeAction<EstadoJogo>('estado')

  return {
    meuId: () => sala.selfId,
    peers: () => Object.keys(sala.getPeers()),
    enviarAcao: (acao) => { void enviarAcao(acao) },
    aoReceberAcao: (cb) => receberAcao((acao, peerId) => cb(acao, peerId)),
    enviarEstado: (estado) => { void enviarEstado(estado) },
    aoReceberEstado: (cb) => receberEstado((estado, peerId) => cb(estado, peerId)),
    aoEntrarPeer: (cb) => sala.onPeerJoin(cb),
    aoSairPeer: (cb) => sala.onPeerLeave(cb),
    sair: () => sala.leave(),
  }
}
```

- [ ] **Step 2: Escrever o teste da rede falsa**

```ts
// src/net/transport.fake.test.ts
import { describe, it, expect, vi } from 'vitest'
import { criarRedeFalsa } from './transport.fake'

describe('rede falsa', () => {
  it('entrega ação de um peer a outro', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const recebido = vi.fn()
    b.aoReceberAcao(recebido)

    a.enviarAcao({ tipo: 'entrar', apelido: 'Alex' })

    expect(recebido).toHaveBeenCalledWith({ tipo: 'entrar', apelido: 'Alex' }, 'p1')
  })

  it('não entrega a mensagem de volta ao remetente', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    rede.conectar('p2')
    const recebido = vi.fn()
    a.aoReceberAcao(recebido)

    a.enviarAcao({ tipo: 'levantar' })

    expect(recebido).not.toHaveBeenCalled()
  })

  it('avisa os existentes quando um peer entra', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const entrou = vi.fn()
    a.aoEntrarPeer(entrou)

    rede.conectar('p2')

    expect(entrou).toHaveBeenCalledWith('p2')
  })

  it('avisa os restantes quando um peer sai', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    const b = rede.conectar('p2')
    const saiu = vi.fn()
    a.aoSairPeer(saiu)

    b.sair()

    expect(saiu).toHaveBeenCalledWith('p2')
    expect(a.peers()).toEqual([])
  })

  it('lista os peers conectados sem incluir a si mesmo', () => {
    const rede = criarRedeFalsa()
    const a = rede.conectar('p1')
    rede.conectar('p2')
    rede.conectar('p3')

    expect(a.peers().sort()).toEqual(['p2', 'p3'])
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- transport`
Expected: FAIL, "Failed to resolve import './transport.fake'"

- [ ] **Step 4: Implementar `src/net/transport.fake.ts`**

```ts
import type { Acao, EstadoJogo } from '../game/types'
import type { Transporte } from './transport'

interface No {
  id: string
  aoAcao: ((acao: Acao, peerId: string) => void)[]
  aoEstado: ((estado: EstadoJogo, peerId: string) => void)[]
  aoEntrar: ((peerId: string) => void)[]
  aoSair: ((peerId: string) => void)[]
}

/**
 * Rede em memória com entrega síncrona. Substitui o Trystero nos testes,
 * permitindo testar eleição, migração e validação sem navegador.
 */
export function criarRedeFalsa() {
  const nos = new Map<string, No>()

  function conectar(id: string): Transporte {
    const no: No = { id, aoAcao: [], aoEstado: [], aoEntrar: [], aoSair: [] }

    for (const outro of nos.values()) {
      for (const cb of outro.aoEntrar) cb(id)
    }
    nos.set(id, no)

    return {
      meuId: () => id,
      peers: () => [...nos.keys()].filter((k) => k !== id),
      enviarAcao: (acao) => {
        for (const outro of nos.values()) {
          if (outro.id === id) continue
          for (const cb of outro.aoAcao) cb(structuredClone(acao), id)
        }
      },
      aoReceberAcao: (cb) => { no.aoAcao.push(cb) },
      enviarEstado: (estado) => {
        for (const outro of nos.values()) {
          if (outro.id === id) continue
          for (const cb of outro.aoEstado) cb(structuredClone(estado), id)
        }
      },
      aoReceberEstado: (cb) => { no.aoEstado.push(cb) },
      aoEntrarPeer: (cb) => { no.aoEntrar.push(cb) },
      aoSairPeer: (cb) => { no.aoSair.push(cb) },
      sair: () => {
        nos.delete(id)
        for (const outro of nos.values()) {
          for (const cb of outro.aoSair) cb(id)
        }
      },
    }
  }

  return { conectar }
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- transport`
Expected: PASS, 5 testes

- [ ] **Step 6: Commit**

```bash
git add src/net/transport.ts src/net/transport.fake.ts src/net/transport.fake.test.ts
git commit -m "feat: interface de transporte com implementação Trystero e rede falsa"
```

---

## Task 8: Sessão — eleição de host, autoridade e migração

**Files:**
- Create: `src/net/sessao.ts`
- Test: `src/net/sessao.test.ts`

**Interfaces:**
- Consumes: `Transporte` de `./transport`; `Contexto`, `criarContexto`, `aplicar`, `avancar`, `cartasVisiveis` de `../game/machine`; `reconstruirSapata` de `../game/shoe`
- Produces:
  - `elegerHost(ids: string[]): string`
  - `class Sessao` com `entrar(apelido)`, `despachar(acao)`, `estado()`, `souHost()`, `aoMudar(cb)`, `tique(agora)`, `encerrar()`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/net/sessao.test.ts
import { describe, it, expect, vi } from 'vitest'
import { criarRedeFalsa } from './transport.fake'
import { elegerHost, Sessao } from './sessao'
import { rngSemente } from '../game/shoe'
import { REGRAS } from '../game/rules'

const rng = () => rngSemente(99)

describe('elegerHost', () => {
  it('escolhe o menor id em ordem lexicográfica', () => {
    expect(elegerHost(['pc', 'pa', 'pb'])).toBe('pa')
  })

  it('é estável independente da ordem de entrada', () => {
    expect(elegerHost(['pb', 'pa'])).toBe(elegerHost(['pa', 'pb']))
  })

  it('devolve o único id quando só há um', () => {
    expect(elegerHost(['pz'])).toBe('pz')
  })
})

describe('Sessao', () => {
  it('o menor peerId se reconhece como host', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    expect(a.souHost()).toBe(true)
    expect(b.souHost()).toBe(false)
  })

  it('propaga o estado do host para o cliente', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    a.entrar('Alex')
    b.entrar('Bruno')

    expect(b.estado().jogadores.map((j) => j.apelido).sort()).toEqual(['Alex', 'Bruno'])
  })

  it('o cliente não altera o próprio estado diretamente', () => {
    const rede = criarRedeFalsa()
    new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)

    b.despachar({ tipo: 'entrar', apelido: 'Bruno' })

    // o estado do cliente só muda quando o snapshot do host chega
    expect(b.estado().jogadores).toHaveLength(1)
    expect(b.estado().jogadores[0]!.peerId).toBe('pb')
  })

  it('o host descarta ação inválida em silêncio', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    b.despachar({ tipo: 'apostar', valor: 999999 })

    expect(b.estado().jogadores.find((j) => j.peerId === 'pb')!.maos).toHaveLength(0)
  })

  it('notifica os assinantes quando o estado muda', () => {
    const rede = criarRedeFalsa()
    const a = new Sessao(rede.conectar('pa'), rng)
    const mudou = vi.fn()
    a.aoMudar(mudou)

    a.entrar('Alex')

    expect(mudou).toHaveBeenCalled()
  })
})

describe('migração de host', () => {
  it('o próximo peer assume quando o host sai', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    expect(b.souHost()).toBe(false)
    tA.sair()

    expect(b.souHost()).toBe(true)
    expect(b.estado().hostAtual).toBe('pb')
  })

  it('o novo host preserva jogadores e fichas', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    b.despachar({ tipo: 'sentar', cadeira: 0 })

    tA.sair()

    const bruno = b.estado().jogadores.find((j) => j.peerId === 'pb')!
    expect(bruno.fichas).toBe(REGRAS.stackInicial)
    expect(bruno.cadeira).toBe(0)
  })

  it('o novo host reconstrói uma sapata sem as cartas já vistas', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    a.despachar({ tipo: 'sentar', cadeira: 0 })
    b.despachar({ tipo: 'sentar', cadeira: 1 })
    a.despachar({ tipo: 'apostar', valor: 100 })
    b.despachar({ tipo: 'apostar', valor: 100 })

    const vistasAntes = b.estado().jogadores.flatMap((j) =>
      j.maos.flatMap((m) => m.cartas),
    ).length

    tA.sair()

    expect(b.souHost()).toBe(true)
    // a sapata reconstruída desconta as cartas visíveis
    expect(b.estado().cartasRestantes)
      .toBe(REGRAS.numBaralhos * 52 - vistasAntes - b.estado().maoDealer.length)
  })

  it('marca quem saiu como ausente em vez de remover na hora', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    tA.sair()

    const alex = b.estado().jogadores.find((j) => j.apelido === 'Alex')
    expect(alex).toBeDefined()
    expect(alex!.desconectadoEm).not.toBeNull()
  })
})

describe('reconexão', () => {
  it('devolve cadeira e fichas a quem volta dentro da janela', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const b = new Sessao(rede.conectar('pb'), rng)
    a.entrar('Alex')
    b.entrar('Bruno')
    b.despachar({ tipo: 'sentar', cadeira: 2 })

    const tB = rede.conectar('pb-novo')
    rede.conectar('pz') // mantém 'pa' fora da eleição para simplificar
    // Bruno cai e volta com outro peerId, mesmo apelido
    const bruno = new Sessao(tB, rng)
    bruno.entrar('Bruno')

    const voltou = a.estado().jogadores.find((j) => j.apelido === 'Bruno')!
    expect(voltou.cadeira).toBe(2)
    expect(voltou.fichas).toBe(REGRAS.stackInicial)
  })

  it('remove o ausente depois da janela de reconexão', () => {
    const rede = criarRedeFalsa()
    const tA = rede.conectar('pa')
    const a = new Sessao(tA, rng)
    const tB = rede.conectar('pb')
    const b = new Sessao(tB, rng)
    a.entrar('Alex')
    b.entrar('Bruno')

    tB.sair()
    expect(a.estado().jogadores).toHaveLength(2)

    a.tique(Date.now() + REGRAS.segundosReconexao * 1000 + 1)

    expect(a.estado().jogadores.map((j) => j.apelido)).toEqual(['Alex'])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- sessao`
Expected: FAIL, "Failed to resolve import './sessao'"

- [ ] **Step 3: Implementar `src/net/sessao.ts`**

```ts
import { aplicar, avancar, cartasVisiveis, criarContexto } from '../game/machine'
import type { Contexto } from '../game/machine'
import { reconstruirSapata } from '../game/shoe'
import { REGRAS } from '../game/rules'
import type { Acao, EstadoJogo, Rng } from '../game/types'
import type { Transporte } from './transport'

/** Determinística: todo cliente com a mesma lista chega ao mesmo host. */
export function elegerHost(ids: string[]): string {
  return [...ids].sort()[0]!
}

export class Sessao {
  private ctx: Contexto
  private hostId: string
  private ouvintes: (() => void)[] = []
  private apelido = ''

  constructor(
    private transporte: Transporte,
    private rng: () => Rng,
  ) {
    this.hostId = elegerHost(this.todosIds())
    this.ctx = criarContexto(this.hostId, this.rng())

    this.transporte.aoReceberAcao((acao, peerId) => {
      if (!this.souHost()) return
      this.ctx = aplicar(this.ctx, peerId, acao, Date.now(), this.rng())
      this.publicar()
    })

    this.transporte.aoReceberEstado((estado, peerId) => {
      if (this.souHost()) return
      if (peerId !== this.hostId) return
      this.ctx = { ...this.ctx, estado }
      this.notificar()
    })

    this.transporte.aoEntrarPeer(() => {
      this.reeleger()
      if (this.souHost()) this.publicar()
    })

    this.transporte.aoSairPeer((peerId) => {
      const eraHost = peerId === this.hostId
      this.reeleger()

      if (this.souHost()) {
        // Marca como ausente em vez de remover: cadeira e fichas ficam
        // reservadas durante a janela de reconexão.
        const caiu = this.ctx.estado.jogadores.find((j) => j.peerId === peerId)
        if (caiu) caiu.desconectadoEm = Date.now()
        this.ctx.estado.hostAtual = this.hostId
        if (eraHost) this.assumirSapata()
        this.publicar()
      }
    })
  }

  /** Remove quem passou da janela de reconexão. Só o host executa. */
  private purgarAusentes(agora: number): boolean {
    const limite = REGRAS.segundosReconexao * 1000
    const antes = this.ctx.estado.jogadores.length
    this.ctx.estado.jogadores = this.ctx.estado.jogadores.filter(
      (j) => j.desconectadoEm === null || agora - j.desconectadoEm < limite,
    )
    return this.ctx.estado.jogadores.length !== antes
  }

  private todosIds(): string[] {
    return [this.transporte.meuId(), ...this.transporte.peers()]
  }

  private reeleger(): void {
    this.hostId = elegerHost(this.todosIds())
  }

  /**
   * Assumindo o posto: o host anterior levou a sapata embora.
   * Reconstruímos descontando as cartas visíveis. A carta oculta do dealer
   * nunca foi transmitida, então compramos uma nova — ninguém a viu.
   */
  private assumirSapata(): void {
    const vistas = cartasVisiveis(this.ctx.estado)
    const sapata = reconstruirSapata(REGRAS.numBaralhos, vistas, this.rng())
    this.ctx.sapata = sapata
    this.ctx.ocultaDealer = this.ctx.estado.dealerTemOculta
      ? (sapata.pop() ?? null)
      : null
    this.ctx.estado.cartasRestantes = this.ctx.sapata.length
  }

  private publicar(): void {
    this.ctx.estado.hostAtual = this.hostId
    this.transporte.enviarEstado(this.ctx.estado)
    this.notificar()
  }

  private notificar(): void {
    for (const cb of this.ouvintes) cb()
  }

  souHost(): boolean {
    return this.hostId === this.transporte.meuId()
  }

  estado(): EstadoJogo {
    return this.ctx.estado
  }

  meuId(): string {
    return this.transporte.meuId()
  }

  aoMudar(cb: () => void): void {
    this.ouvintes.push(cb)
  }

  entrar(apelido: string): void {
    this.apelido = apelido
    this.despachar({ tipo: 'entrar', apelido })
  }

  /** Cliente envia intenção; host aplica localmente e transmite. */
  despachar(acao: Acao): void {
    if (this.souHost()) {
      this.ctx = aplicar(this.ctx, this.transporte.meuId(), acao, Date.now(), this.rng())
      this.publicar()
    } else {
      this.transporte.enviarAcao(acao)
    }
  }

  /** Chamado em intervalo curto pela UI; só o host faz efeito. */
  tique(agora: number): void {
    if (!this.souHost()) return
    const antes = JSON.stringify(this.ctx.estado)
    const purgou = this.purgarAusentes(agora)
    this.ctx = avancar(this.ctx, agora, this.rng())
    if (purgou || JSON.stringify(this.ctx.estado) !== antes) this.publicar()
  }

  meuApelido(): string {
    return this.apelido
  }

  encerrar(): void {
    this.transporte.sair()
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- sessao`
Expected: PASS, 14 testes

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/net/sessao.ts src/net/sessao.test.ts
git commit -m "feat: sessão com eleição de host, autoridade e migração de sapata"
```

---

## Task 9: Tema topázio e componente de carta

**Files:**
- Create: `src/ui/theme.css`
- Create: `src/ui/components/carta.ts`
- Modify: `index.html` (adicionar `<link>` do tema)

**Interfaces:**
- Consumes: `Carta` de `../../game/types`
- Produces:
  - `elementoCarta(carta: Carta | null, opcoes?: { grande?: boolean }): HTMLElement` — `null` renderiza verso
  - `simboloNaipe(naipe: Naipe): string`

- [ ] **Step 1: Criar `src/ui/theme.css`**

```css
:root {
  --topazio-300: #FFCE6B;
  --topazio-400: #F5B942;
  --topazio-500: #E8A317;
  --topazio-600: #C9A227;
  --topazio-700: #A4801A;
  --topazio-900: #4A3A0E;

  --feltro-400: #1D5641;
  --feltro-600: #123528;
  --feltro-800: #0B2117;

  --carvao-900: #0E0F12;
  --carvao-700: #1A1C21;
  --carvao-500: #2A2E36;
  --texto: #EFE6CF;
  --texto-fraco: #CFC4A4;

  --carta-face: #F6F1E3;
  --carta-borda: #D8CDB0;
  --naipe-vermelho: #A3232A;

  --serif: Georgia, 'Times New Roman', serif;
  --dur-carta: 380ms;
  --dur-virada: 300ms;
  --easing: cubic-bezier(0.22, 0.61, 0.36, 1);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--carvao-900);
  color: var(--texto);
  font-family: var(--serif);
}

.carta {
  width: 42px;
  height: 60px;
  border-radius: 5px;
  background: var(--carta-face);
  color: var(--carvao-900);
  border: 1px solid var(--carta-borda);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 700;
  margin-left: -14px;
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.4);
  transition: transform var(--dur-carta) var(--easing);
}

.carta:first-child { margin-left: 0; }
.carta.vermelha { color: var(--naipe-vermelho); }

.carta.grande {
  width: 57px;
  height: 81px;
  font-size: 22px;
  margin-left: -17px;
}
.carta.grande:first-child { margin-left: 0; }

.carta.verso {
  background: repeating-linear-gradient(45deg, #7C1D22 0 4px, #651418 4px 8px);
  border-color: var(--topazio-600);
  color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: Adicionar o tema ao `index.html`**

Dentro de `<head>`, antes do `</head>`:

```html
    <link rel="stylesheet" href="/src/ui/theme.css" />
```

- [ ] **Step 3: Implementar `src/ui/components/carta.ts`**

```ts
import type { Carta, Naipe } from '../../game/types'

const SIMBOLOS: Record<Naipe, string> = {
  copas: '♥', ouros: '♦', paus: '♣', espadas: '♠',
}

export function simboloNaipe(naipe: Naipe): string {
  return SIMBOLOS[naipe]
}

export function elementoCarta(
  carta: Carta | null,
  opcoes: { grande?: boolean } = {},
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'carta'
  if (opcoes.grande) el.classList.add('grande')

  if (carta === null) {
    el.classList.add('verso')
    el.setAttribute('aria-label', 'carta virada para baixo')
    return el
  }

  const vermelha = carta.naipe === 'copas' || carta.naipe === 'ouros'
  if (vermelha) el.classList.add('vermelha')
  el.textContent = `${carta.valor}${simboloNaipe(carta.naipe)}`
  el.setAttribute('aria-label', `${carta.valor} de ${carta.naipe}`)
  return el
}
```

- [ ] **Step 4: Verificar visualmente**

Run: `npm run dev`
Adicione temporariamente em `src/main.ts`:

```ts
import { elementoCarta } from './ui/components/carta'

const app = document.querySelector<HTMLDivElement>('#app')!
app.style.padding = '40px'
app.style.display = 'flex'
app.append(
  elementoCarta({ valor: 'A', naipe: 'copas' }),
  elementoCarta({ valor: 'K', naipe: 'espadas' }),
  elementoCarta(null),
)
```

Expected: três cartas na tela, Ás em vermelho, verso listrado com borda topázio. Reverta `main.ts` depois de conferir.

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.css src/ui/components/carta.ts index.html
git commit -m "feat: tema topázio e componente de carta"
```

---

## Task 10: Renderização da mesa

**Files:**
- Create: `src/ui/components/mesa.ts`
- Create: `src/ui/render.ts`
- Modify: `src/ui/theme.css` (blocos da mesa)

**Interfaces:**
- Consumes: `elementoCarta` de `./carta`; `avaliar` de `../../game/hand`; `acoesDisponiveis`, `REGRAS` de `../../game/rules`; tipos de `../../game/types`
- Produces:
  - `renderizarMesa(estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void): HTMLElement`

- [ ] **Step 1: Acrescentar os estilos da mesa em `src/ui/theme.css`**

```css
.mesa {
  max-width: 940px;
  margin: 0 auto;
  padding: 22px 18px 18px;
  background: radial-gradient(ellipse at 50% -12%,
    var(--feltro-400) 0%, var(--feltro-600) 58%, var(--feltro-800) 100%);
  border: 1px solid var(--topazio-900);
  border-radius: 14px;
}

.rotulo {
  color: var(--topazio-600);
  letter-spacing: 0.22em;
  font-size: 9.5px;
  text-transform: uppercase;
  margin-bottom: 7px;
}

.dealer { text-align: center; margin-bottom: 16px; }
.mao-cartas { display: flex; justify-content: center; margin-bottom: 6px; }

.separador {
  height: 1px;
  background: linear-gradient(90deg, transparent,
    rgba(201, 162, 39, 0.22), transparent);
  margin-bottom: 14px;
}

.grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 11px;
}
.grade.poucos { grid-template-columns: repeat(auto-fit, minmax(150px, 200px)); justify-content: center; }
@media (min-width: 640px) { .grade { grid-template-columns: repeat(3, 1fr); } }

.peca {
  text-align: center;
  padding: 10px 6px 8px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.028);
  border: 1px solid rgba(201, 162, 39, 0.12);
  transition: opacity 200ms var(--easing), border-color 200ms var(--easing);
}
.peca.vez {
  border-color: var(--topazio-600);
  background: rgba(201, 162, 39, 0.1);
  box-shadow: 0 0 20px rgba(201, 162, 39, 0.28);
}
.peca.encerrada { opacity: 0.42; }
.peca .carta { width: 32px; height: 46px; font-size: 13px; margin-left: -11px; }
.peca .carta:first-child { margin-left: 0; }

.nome { font-size: 11.5px; color: var(--texto); }
.fichas { font-size: 10.5px; color: var(--topazio-600); font-variant-numeric: tabular-nums; }
.total { font-size: 10px; color: var(--texto-fraco); }

.painel-proprio {
  border: 1px solid rgba(201, 162, 39, 0.5);
  border-radius: 11px;
  background: linear-gradient(rgba(201,162,39,0.09), rgba(201,162,39,0.03));
  padding: 15px 14px 13px;
  text-align: center;
  margin-top: 16px;
}

.acoes { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 13px; }

.botao {
  padding: 9px 17px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  font-family: var(--serif);
  cursor: pointer;
  background: linear-gradient(var(--topazio-600), var(--topazio-700));
  color: var(--topazio-900);
  border: 1px solid var(--topazio-400);
}
.botao.fantasma { background: transparent; color: var(--topazio-600); border-color: var(--topazio-900); }
.botao:disabled { opacity: 0.4; cursor: not-allowed; }

.vazio { text-align: center; color: var(--texto-fraco); padding: 30px 10px; }

.barra-prazo { height: 3px; background: rgba(0,0,0,0.3); border-radius: 2px; overflow: hidden; margin-top: 8px; }
.barra-prazo > div { height: 100%; background: var(--topazio-500); transition: width 250ms linear; }
```

- [ ] **Step 2: Implementar `src/ui/components/mesa.ts`**

```ts
import { elementoCarta } from './carta'
import { avaliar } from '../../game/hand'
import { REGRAS, acoesDisponiveis } from '../../game/rules'
import type { Acao, EstadoJogo, Jogador, TipoAcao } from '../../game/types'

const ROTULO_ACAO: Record<TipoAcao, string> = {
  entrar: 'Entrar', sentar: 'Sentar', levantar: 'Levantar',
  apostar: 'Apostar', seguro: 'Seguro',
  pedir: 'Pedir', parar: 'Parar', dobrar: 'Dobrar', dividir: 'Dividir',
}

function div(classe: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

function descreverEstado(jogador: Jogador, vezDele: boolean): string {
  const mao = jogador.maos[jogador.maoAtiva]
  if (!mao) return 'aguardando'
  const { total } = avaliar(mao.cartas)
  if (total > 21) return `${total} · estourou`
  if (mao.encerrada) return `${total} · parou`
  return vezDele ? `${total} · jogando…` : String(total)
}

function pecaJogador(jogador: Jogador, vezDele: boolean): HTMLElement {
  const peca = div('peca')
  if (vezDele) peca.classList.add('vez')

  const mao = jogador.maos[jogador.maoAtiva]
  if (mao && (mao.encerrada || avaliar(mao.cartas).total > 21)) {
    peca.classList.add('encerrada')
  }

  const cartas = div('mao-cartas')
  for (const carta of mao?.cartas ?? []) cartas.append(elementoCarta(carta))
  peca.append(cartas, div('nome', jogador.apelido),
    div('fichas', String(jogador.fichas)),
    div('total', descreverEstado(jogador, vezDele)))
  return peca
}

function areaDealer(estado: EstadoJogo): HTMLElement {
  const area = div('dealer')
  const cartas = div('mao-cartas')
  for (const carta of estado.maoDealer) cartas.append(elementoCarta(carta))
  if (estado.dealerTemOculta) cartas.append(elementoCarta(null))

  const visivel = estado.maoDealer[0]
  const legenda = estado.dealerTemOculta && visivel
    ? `mostra ${avaliar([visivel]).total}`
    : estado.maoDealer.length > 0
      ? `total ${avaliar(estado.maoDealer).total}`
      : ''

  area.append(div('rotulo', 'Dealer'), cartas, div('total', legenda))
  return area
}

function painelProprio(
  estado: EstadoJogo, eu: Jogador, aoAgir: (acao: Acao) => void,
): HTMLElement {
  const painel = div('painel-proprio')
  const mao = eu.maos[eu.maoAtiva]

  const cartas = div('mao-cartas')
  for (const carta of mao?.cartas ?? []) cartas.append(elementoCarta(carta, { grande: true }))

  const rotuloMaos = eu.maos.length > 1
    ? `Sua mão ${eu.maoAtiva + 1} de ${eu.maos.length}`
    : 'Sua mão'

  painel.append(
    div('rotulo', rotuloMaos),
    cartas,
    div('nome', `${eu.apelido} — ${eu.fichas} fichas`),
    div('total', mao ? `${avaliar(mao.cartas).total} · aposta ${mao.aposta}` : 'sem aposta'),
  )

  const acoes = div('acoes')

  if (estado.fase === 'apostas' && eu.maos.length === 0) {
    for (const valor of REGRAS.fichas) {
      const botao = document.createElement('button')
      botao.className = 'botao'
      botao.textContent = `Apostar ${valor}`
      botao.disabled = valor > eu.fichas
      botao.onclick = () => aoAgir({ tipo: 'apostar', valor })
      acoes.append(botao)
    }
  }

  if (estado.fase === 'seguro' && eu.maos.length > 0 && eu.seguro === 0) {
    for (const [rotulo, aceitar] of [['Fazer seguro', true], ['Dispensar', false]] as const) {
      const botao = document.createElement('button')
      botao.className = aceitar ? 'botao' : 'botao fantasma'
      botao.textContent = rotulo
      botao.onclick = () => aoAgir({ tipo: 'seguro', aceitar })
      acoes.append(botao)
    }
  }

  if (estado.fase === 'turnos' && estado.vezDe === eu.peerId && mao) {
    for (const tipo of acoesDisponiveis(mao, eu)) {
      const botao = document.createElement('button')
      botao.className = tipo === 'pedir' || tipo === 'parar' ? 'botao' : 'botao fantasma'
      botao.textContent = ROTULO_ACAO[tipo]
      botao.onclick = () => aoAgir({ tipo, maoId: mao.id } as Acao)
      acoes.append(botao)
    }
  }

  painel.append(acoes)

  if (estado.prazoTurno !== null && estado.vezDe === eu.peerId) {
    const barra = div('barra-prazo')
    const preenchida = document.createElement('div')
    const restante = Math.max(0, estado.prazoTurno - Date.now())
    preenchida.style.width = `${(restante / (REGRAS.segundosTurno * 1000)) * 100}%`
    barra.append(preenchida)
    painel.append(barra)
  }

  return painel
}

export function renderizarMesa(
  estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): HTMLElement {
  const mesa = div('mesa')
  mesa.append(areaDealer(estado), div('separador'))

  const eu = estado.jogadores.find((j) => j.peerId === meuId)
  const outros = estado.jogadores
    .filter((j) => j.peerId !== meuId && j.cadeira !== null)
    .sort((a, b) => a.cadeira! - b.cadeira!)

  if (outros.length === 0) {
    mesa.append(div('vazio', 'Aguardando jogadores… compartilhe o link da sala.'))
  } else {
    const grade = div('grade')
    if (outros.length <= 3) grade.classList.add('poucos')
    for (const jogador of outros) {
      grade.append(pecaJogador(jogador, estado.vezDe === jogador.peerId))
    }
    mesa.append(grade)
  }

  if (eu && eu.cadeira !== null) {
    mesa.append(painelProprio(estado, eu, aoAgir))
  } else if (eu) {
    const convite = div('painel-proprio')
    const livre = Array.from({ length: REGRAS.maxCadeiras }, (_, i) => i)
      .find((c) => !estado.jogadores.some((j) => j.cadeira === c))
    const botao = document.createElement('button')
    botao.className = 'botao'
    botao.textContent = livre === undefined ? 'Mesa cheia' : 'Sentar à mesa'
    botao.disabled = livre === undefined
    botao.onclick = () => { if (livre !== undefined) aoAgir({ tipo: 'sentar', cadeira: livre }) }
    convite.append(div('rotulo', 'Espectador'), botao)
    mesa.append(convite)
  }

  return mesa
}
```

- [ ] **Step 3: Implementar `src/ui/render.ts`**

```ts
import { renderizarMesa } from './components/mesa'
import type { Acao, EstadoJogo } from '../game/types'

/**
 * Re-render completo a cada mudança. O estado é pequeno o bastante
 * para isso ser imperceptível, e elimina divergência entre DOM e estado.
 */
export function renderizar(
  raiz: HTMLElement, estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): void {
  raiz.replaceChildren(renderizarMesa(estado, meuId, aoAgir))
}
```

- [ ] **Step 4: Verificar visualmente com estado falso**

Run: `npm run dev` com este `src/main.ts` temporário:

```ts
import { renderizar } from './ui/render'
import type { EstadoJogo } from './game/types'

const estado: EstadoJogo = {
  fase: 'turnos', vezDe: 'p2', prazoTurno: Date.now() + 20000,
  maoDealer: [{ valor: 'K', naipe: 'espadas' }], dealerTemOculta: true,
  cartasRestantes: 300, hostAtual: 'p1', rodada: 1,
  jogadores: [
    { peerId: 'p1', apelido: 'Você', cadeira: 0, fichas: 1240, maoAtiva: 0, seguro: 0, rodadasInativo: 0, desconectadoEm: null,
      maos: [{ id: 'm1', cartas: [{ valor: 'A', naipe: 'copas' }, { valor: '10', naipe: 'paus' }],
        aposta: 100, dobrada: false, vindaDeSplit: false, encerrada: false }] },
    { peerId: 'p2', apelido: 'Bruno', cadeira: 1, fichas: 860, maoAtiva: 0, seguro: 0, rodadasInativo: 0, desconectadoEm: null,
      maos: [{ id: 'm2', cartas: [{ valor: '9', naipe: 'espadas' }, { valor: '7', naipe: 'ouros' }],
        aposta: 100, dobrada: false, vindaDeSplit: false, encerrada: false }] },
  ],
}

renderizar(document.querySelector<HTMLDivElement>('#app')!, estado, 'p1', console.log)
```

Expected: dealer no topo com carta virada e "mostra 10", Bruno na grade com destaque dourado, seu painel embaixo com cartas grandes e os botões. Redimensione a janela para conferir a grade reflui. Reverta `main.ts` depois.

- [ ] **Step 5: Commit**

```bash
git add src/ui/render.ts src/ui/components/mesa.ts src/ui/theme.css
git commit -m "feat: renderização da mesa com grade responsiva e painel próprio"
```

---

## Task 11: Animação de distribuição e virada

**Files:**
- Create: `src/ui/animate.ts`
- Modify: `src/ui/render.ts`

**Interfaces:**
- Consumes: nada de `game/`
- Produces:
  - `animarEntrada(raiz: HTMLElement, origem: DOMRect): void`
  - `guardarPosicoes(raiz: HTMLElement): Map<string, DOMRect>`

- [ ] **Step 1: Implementar `src/ui/animate.ts`**

```ts
/**
 * FLIP: depois que o DOM novo já está montado, calculamos a diferença
 * entre a posição anterior e a atual, aplicamos o deslocamento inverso
 * e deixamos a transição CSS levar de volta ao lugar.
 */
export function animarEntrada(raiz: HTMLElement, origem: DOMRect): void {
  const cartas = raiz.querySelectorAll<HTMLElement>('.carta[data-nova="1"]')

  cartas.forEach((carta, indice) => {
    const destino = carta.getBoundingClientRect()
    const dx = origem.left - destino.left
    const dy = origem.top - destino.top

    carta.style.transition = 'none'
    carta.style.transform = `translate(${dx}px, ${dy}px) scale(0.85)`
    carta.style.opacity = '0'

    requestAnimationFrame(() => {
      carta.style.transition = ''
      carta.style.transitionDelay = `${indice * 90}ms`
      carta.style.transform = ''
      carta.style.opacity = '1'
      carta.removeAttribute('data-nova')
    })
  })
}

/** Retângulo de onde as cartas "saem" — o canto superior direito da mesa. */
export function origemSapata(raiz: HTMLElement): DOMRect {
  const mesa = raiz.querySelector('.mesa')
  if (!mesa) return new DOMRect(0, 0, 0, 0)
  const r = mesa.getBoundingClientRect()
  return new DOMRect(r.right - 60, r.top + 20, 42, 60)
}
```

- [ ] **Step 2: Marcar cartas novas em `src/ui/components/carta.ts`**

Adicione o parâmetro `nova` às opções e o atributo correspondente:

```ts
export function elementoCarta(
  carta: Carta | null,
  opcoes: { grande?: boolean; nova?: boolean } = {},
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'carta'
  if (opcoes.grande) el.classList.add('grande')
  if (opcoes.nova) el.dataset.nova = '1'
  // …resto igual
```

- [ ] **Step 3: Ligar a animação em `src/ui/render.ts`**

```ts
import { renderizarMesa } from './components/mesa'
import { animarEntrada, origemSapata } from './animate'
import type { Acao, EstadoJogo } from '../game/types'

let contagemAnterior = 0

function contarCartas(estado: EstadoJogo): number {
  const daMesa = estado.jogadores.reduce(
    (soma, j) => soma + j.maos.reduce((s, m) => s + m.cartas.length, 0), 0)
  return daMesa + estado.maoDealer.length
}

export function renderizar(
  raiz: HTMLElement, estado: EstadoJogo, meuId: string, aoAgir: (acao: Acao) => void,
): void {
  const agora = contarCartas(estado)
  const houveDistribuicao = agora > contagemAnterior
  contagemAnterior = agora

  raiz.replaceChildren(renderizarMesa(estado, meuId, aoAgir))

  if (houveDistribuicao) {
    animarEntrada(raiz, origemSapata(raiz))
  }
}
```

- [ ] **Step 3b: Marcar as cartas como novas em `src/ui/components/mesa.ts`**

Três laços passam a marcar `nova`. A marcação é removida assim que a animação
começa, então cartas já presentes na tela não reanimam.

Em `pecaJogador`:

```ts
  const cartas = div('mao-cartas')
  for (const carta of mao?.cartas ?? []) cartas.append(elementoCarta(carta, { nova: true }))
```

Em `areaDealer`:

```ts
  const cartas = div('mao-cartas')
  for (const carta of estado.maoDealer) cartas.append(elementoCarta(carta, { nova: true }))
  if (estado.dealerTemOculta) cartas.append(elementoCarta(null, { nova: true }))
```

Em `painelProprio`:

```ts
  const cartas = div('mao-cartas')
  for (const carta of mao?.cartas ?? []) {
    cartas.append(elementoCarta(carta, { grande: true, nova: true }))
  }
```

- [ ] **Step 4: Verificar visualmente**

Run: `npm run dev` com o `main.ts` de teste da Task 10, adicionando um botão que acrescenta uma carta à mão do Bruno e chama `renderizar` de novo.
Expected: a carta nova voa do canto superior direito até a mão, em cascata quando há várias. Com `prefers-reduced-motion` ativo no sistema operacional, ela simplesmente aparece.

- [ ] **Step 5: Commit**

```bash
git add src/ui/animate.ts src/ui/render.ts src/ui/components/carta.ts src/ui/components/mesa.ts
git commit -m "feat: animação FLIP de distribuição de cartas"
```

---

## Task 12: Lobby, apelido e roteamento por hash

**Files:**
- Create: `src/ui/components/lobby.ts`
- Create: `src/ui/sala.ts`
- Test: `src/ui/sala.test.ts`
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: nada de `net/`
- Produces:
  - `gerarCodigoSala(rng: Rng): string` — 8 caracteres do alfabeto sem ambiguidade
  - `lerCodigoDaUrl(hash: string): string | null`
  - `montarLinkSala(base: string, codigo: string): string`
  - `renderizarLobby(aoEntrar: (apelido: string, codigo: string) => void): HTMLElement`

- [ ] **Step 1: Escrever os testes que falham**

O código de sala precisa ser longo e sem caracteres ambíguos: curto demais e um estranho adivinha a sala, o que expõe o IP dos jogadores.

```ts
// src/ui/sala.test.ts
import { describe, it, expect } from 'vitest'
import { gerarCodigoSala, lerCodigoDaUrl, montarLinkSala } from './sala'
import { rngSemente } from '../game/shoe'

describe('gerarCodigoSala', () => {
  it('tem 8 caracteres', () => {
    expect(gerarCodigoSala(rngSemente(1))).toHaveLength(8)
  })

  it('evita caracteres ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoSala(rngSemente(i))).not.toMatch(/[O0I1L]/)
    }
  })

  it('produz códigos diferentes para sementes diferentes', () => {
    expect(gerarCodigoSala(rngSemente(1))).not.toBe(gerarCodigoSala(rngSemente(2)))
  })
})

describe('lerCodigoDaUrl', () => {
  it('extrai o código do hash', () => {
    expect(lerCodigoDaUrl('#sala=K7X2QW9F')).toBe('K7X2QW9F')
  })

  it('devolve null sem hash', () => {
    expect(lerCodigoDaUrl('')).toBeNull()
  })

  it('devolve null para hash de outro assunto', () => {
    expect(lerCodigoDaUrl('#outra-coisa')).toBeNull()
  })

  it('normaliza para maiúsculas', () => {
    expect(lerCodigoDaUrl('#sala=k7x2qw9f')).toBe('K7X2QW9F')
  })
})

describe('montarLinkSala', () => {
  it('põe o código no hash, nunca no path', () => {
    const link = montarLinkSala('https://ascendance-hub.github.io/Topaz/', 'K7X2QW9F')
    expect(link).toBe('https://ascendance-hub.github.io/Topaz/#sala=K7X2QW9F')
  })

  it('não duplica o hash quando a base já tem um', () => {
    const link = montarLinkSala('https://exemplo.com/Topaz/#sala=ANTIGO', 'NOVO1234')
    expect(link).toBe('https://exemplo.com/Topaz/#sala=NOVO1234')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- sala`
Expected: FAIL, "Failed to resolve import './sala'"

- [ ] **Step 3: Implementar `src/ui/sala.ts`**

```ts
import type { Rng } from '../game/types'

// Sem O, 0, I, 1 e L — pares que as pessoas confundem ao digitar.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const TAMANHO_CODIGO = 8

export function gerarCodigoSala(rng: Rng): string {
  let codigo = ''
  for (let i = 0; i < TAMANHO_CODIGO; i++) {
    codigo += ALFABETO[Math.floor(rng() * ALFABETO.length)]
  }
  return codigo
}

export function lerCodigoDaUrl(hash: string): string | null {
  const encontrado = /^#sala=([A-Za-z0-9]+)$/.exec(hash)
  return encontrado ? encontrado[1]!.toUpperCase() : null
}

export function montarLinkSala(base: string, codigo: string): string {
  const semHash = base.split('#')[0]!
  return `${semHash}#sala=${codigo}`
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- sala`
Expected: PASS, 9 testes

- [ ] **Step 5: Acrescentar estilos do lobby em `src/ui/theme.css`**

```css
.lobby {
  max-width: 420px;
  margin: 12vh auto 0;
  padding: 32px 28px;
  background: var(--carvao-700);
  border: 1px solid var(--topazio-900);
  border-radius: 14px;
  text-align: center;
}

.lobby h1 {
  margin: 0 0 4px;
  font-size: 30px;
  letter-spacing: 0.06em;
  color: var(--topazio-500);
}

.lobby .sub { color: var(--texto-fraco); font-size: 13px; margin-bottom: 26px; }

.campo {
  width: 100%;
  padding: 11px 13px;
  margin-bottom: 12px;
  border-radius: 7px;
  background: var(--carvao-900);
  border: 1px solid var(--carvao-500);
  color: var(--texto);
  font-family: var(--serif);
  font-size: 15px;
  text-align: center;
}
.campo:focus { outline: none; border-color: var(--topazio-600); }

.lobby .botao { width: 100%; padding: 12px; font-size: 14px; margin-top: 4px; }
.ou { color: var(--texto-fraco); font-size: 11px; margin: 16px 0 12px; letter-spacing: 0.14em; }
```

- [ ] **Step 6: Implementar `src/ui/components/lobby.ts`**

```ts
import { gerarCodigoSala, lerCodigoDaUrl } from '../sala'
import { rngSemente } from '../../game/shoe'

const CHAVE_APELIDO = 'topaz:apelido'

export function apelidoSalvo(): string {
  return localStorage.getItem(CHAVE_APELIDO) ?? ''
}

export function salvarApelido(apelido: string): void {
  localStorage.setItem(CHAVE_APELIDO, apelido)
}

export function renderizarLobby(
  aoEntrar: (apelido: string, codigo: string) => void,
): HTMLElement {
  const codigoDaUrl = lerCodigoDaUrl(location.hash)

  const lobby = document.createElement('div')
  lobby.className = 'lobby'

  const titulo = document.createElement('h1')
  titulo.textContent = 'Topaz'

  const sub = document.createElement('p')
  sub.className = 'sub'
  sub.textContent = codigoDaUrl
    ? `Entrando na sala ${codigoDaUrl}`
    : 'Blackjack com os amigos'

  const campoApelido = document.createElement('input')
  campoApelido.className = 'campo'
  campoApelido.placeholder = 'Seu apelido'
  campoApelido.maxLength = 16
  campoApelido.value = apelidoSalvo()

  lobby.append(titulo, sub, campoApelido)

  const campoCodigo = document.createElement('input')
  campoCodigo.className = 'campo'
  campoCodigo.placeholder = 'Código da sala'
  campoCodigo.maxLength = 8

  function entrar(codigo: string): void {
    const apelido = campoApelido.value.trim()
    if (!apelido) { campoApelido.focus(); return }
    salvarApelido(apelido)
    aoEntrar(apelido, codigo)
  }

  if (codigoDaUrl) {
    const botao = document.createElement('button')
    botao.className = 'botao'
    botao.textContent = 'Entrar na sala'
    botao.onclick = () => entrar(codigoDaUrl)
    lobby.append(botao)
  } else {
    const criar = document.createElement('button')
    criar.className = 'botao'
    criar.textContent = 'Criar sala'
    criar.onclick = () => {
      const codigo = gerarCodigoSala(rngSemente(Date.now() ^ Math.floor(Math.random() * 1e9)))
      location.hash = `sala=${codigo}`
      entrar(codigo)
    }

    const ou = document.createElement('div')
    ou.className = 'ou'
    ou.textContent = 'OU ENTRAR COM CÓDIGO'

    const entrarBotao = document.createElement('button')
    entrarBotao.className = 'botao fantasma'
    entrarBotao.textContent = 'Entrar'
    entrarBotao.onclick = () => {
      const codigo = campoCodigo.value.trim().toUpperCase()
      if (codigo.length === 8) {
        location.hash = `sala=${codigo}`
        entrar(codigo)
      }
    }

    lobby.append(criar, ou, campoCodigo, entrarBotao)
  }

  return lobby
}
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/sala.ts src/ui/sala.test.ts src/ui/components/lobby.ts src/ui/theme.css
git commit -m "feat: lobby com apelido, criação de sala e roteamento por hash"
```

---

## Task 13: Fiação final e verificação no navegador

**Files:**
- Modify: `src/main.ts`
- Create: `src/ui/components/barra-sala.ts`
- Modify: `src/ui/theme.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: tudo das tasks anteriores
- Produces: aplicação completa funcionando de ponta a ponta

- [ ] **Step 1: Acrescentar estilos da barra em `src/ui/theme.css`**

```css
.barra-sala {
  max-width: 940px;
  margin: 18px auto 12px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--carvao-700);
  border: 1px solid var(--carvao-500);
  border-radius: 10px;
  font-size: 12px;
  color: var(--texto-fraco);
}
.barra-sala .codigo { color: var(--topazio-500); letter-spacing: 0.12em; font-weight: 700; }
.barra-sala .botao { padding: 6px 12px; font-size: 11px; }
```

- [ ] **Step 2: Implementar `src/ui/components/barra-sala.ts`**

```ts
import { montarLinkSala } from '../sala'

export function renderizarBarraSala(codigo: string, souHost: boolean): HTMLElement {
  const barra = document.createElement('div')
  barra.className = 'barra-sala'

  const info = document.createElement('span')
  info.innerHTML = `Sala <span class="codigo">${codigo}</span>${souHost ? ' · você é o anfitrião' : ''}`

  const copiar = document.createElement('button')
  copiar.className = 'botao'
  copiar.textContent = 'Copiar link'
  copiar.onclick = async () => {
    await navigator.clipboard.writeText(montarLinkSala(location.href, codigo))
    copiar.textContent = 'Copiado!'
    setTimeout(() => { copiar.textContent = 'Copiar link' }, 1600)
  }

  barra.append(info, copiar)
  return barra
}
```

- [ ] **Step 3: Escrever `src/main.ts` definitivo**

```ts
import { Sessao } from './net/sessao'
import { criarTransporteTrystero } from './net/transport'
import { renderizarLobby } from './ui/components/lobby'
import { renderizarBarraSala } from './ui/components/barra-sala'
import { renderizar } from './ui/render'
import { rngSemente } from './game/shoe'

const app = document.querySelector<HTMLDivElement>('#app')!

function rngDaSessao() {
  return rngSemente(Date.now() ^ Math.floor(Math.random() * 1e9))
}

function iniciarPartida(apelido: string, codigo: string): void {
  const sessao = new Sessao(criarTransporteTrystero(codigo), rngDaSessao)

  const barra = renderizarBarraSala(codigo, sessao.souHost())
  const palco = document.createElement('div')
  app.replaceChildren(barra, palco)

  function desenhar(): void {
    barra.replaceWith(renderizarBarraSala(codigo, sessao.souHost()))
    renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
  }

  sessao.aoMudar(desenhar)
  sessao.entrar(apelido)
  desenhar()

  // O host avalia prazos vencidos; nos clientes o tique não faz nada.
  setInterval(() => sessao.tique(Date.now()), 500)

  window.addEventListener('beforeunload', () => sessao.encerrar())
}

app.replaceChildren(renderizarLobby(iniciarPartida))
```

- [ ] **Step 4: Rodar a suíte completa**

Run: `npm test`
Expected: PASS, todos os testes

- [ ] **Step 5: Verificar o type-check e o build**

Run: `npm run build`
Expected: sucesso, sem erro de TypeScript

- [ ] **Step 6: Teste manual de ponta a ponta**

Run: `npm run dev`

Abra a URL em **três abas** (uma delas anônima, para simular navegador separado) e confirme:

1. Criar sala na aba 1; copiar o link; abrir nas abas 2 e 3
2. Os três aparecem na mesa com 1000 fichas
3. Todos apostam; as cartas são distribuídas com animação em cascata
4. A vez circula na ordem das cadeiras, com destaque dourado e barra de tempo
5. Pedir, parar, dobrar funcionam; forçar um par e conferir dividir
6. O dealer vira a carta oculta e compra até 17
7. As fichas são creditadas e uma nova rodada começa
8. **Fechar a aba 1 (o host):** as abas 2 e 3 continuam a partida, e a barra passa a indicar outro anfitrião
9. Deixar um jogador sem agir: em 30s ele para sozinho e a mesa segue

- [ ] **Step 7: Atualizar o `README.md`**

```markdown
# Topaz

Hub de jogos de mesa para jogar com amigos direto do navegador. Sem servidor,
sem cadastro: os navegadores conversam entre si por WebRTC.

**Jogar:** https://ascendance-hub.github.io/Topaz/

## Blackjack

Até 7 jogadores. Regras completas — pedir, parar, dobrar, dividir e seguro.
Dealer automático que para em 17. Fichas valem só durante a sessão.

Crie uma sala, copie o link e mande para os amigos. Se o anfitrião cair, outro
jogador assume automaticamente e a partida continua.

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm test         # suíte de testes
npm run build    # build de produção
```

### Estrutura

| Pasta | Responsabilidade |
|---|---|
| `src/game/` | regras puras — sem rede, sem DOM, testadas isoladamente |
| `src/net/` | Trystero, eleição de anfitrião, migração |
| `src/ui/` | renderização e animação |

`src/game/` não importa nada das outras camadas — há um teste que garante isso.

Design e plano de implementação em `docs/superpowers/`.
```

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/ui/components/barra-sala.ts src/ui/theme.css README.md
git commit -m "feat: fiação da aplicação, barra de sala e documentação"
```

- [ ] **Step 9: Publicar**

```bash
git push origin main
```

Depois do push, em **Settings → Pages** do repositório, defina **Source: GitHub Actions**. Acompanhe a aba Actions e confirme que o site sobe em `https://ascendance-hub.github.io/Topaz/`.

---

## Verificação final

Rode antes de considerar o trabalho concluído:

```bash
npm test && npm run build
```

Checklist de aceitação, todos verificados no navegador:

- [ ] Três jogadores em abas separadas jogam uma rodada completa
- [ ] Dobrar debita a aposta extra e entrega exatamente uma carta
- [ ] Dividir cria duas mãos jogadas em sequência
- [ ] Split de Ases recebe uma carta por mão e encerra
- [ ] Seguro aparece só quando o dealer mostra Ás
- [ ] Blackjack natural paga 3:2
- [ ] Fechar a aba do anfitrião não encerra a partida
- [ ] Jogador inativo é pulado em 30s e vira espectador em duas rodadas
- [ ] Recarregar a aba de um jogador dentro de 60s devolve cadeira e fichas
- [ ] Passados 60s sem voltar, ele some da mesa e a cadeira é liberada
- [ ] A grade reflui de 3 para 2 colunas em tela estreita
- [ ] O site publicado carrega em `https://ascendance-hub.github.io/Topaz/`
