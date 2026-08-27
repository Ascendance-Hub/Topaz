# Refatoração — Bloco 2: os dois padrões que se repetem

> **Para quem executa:** use `superpowers:executing-plans` para tocar tarefa a
> tarefa. Os passos usam caixinha (`- [ ]`) para marcação.

**Goal:** Dar nome aos dois padrões que o `main.ts` e a camada de rede repetem à
mão, para que o Bloco 3 mova código já limpo — e para que a repetição pare de
poder ser feita errado.

**Architecture:** Dois PRs independentes, ambos **sem mudança de comportamento**
exceto por um defeito latente que o segundo conserta de passagem.

**Tech Stack:** TypeScript 5.6 strict, Vite 8, Vitest 4, happy-dom, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-08-27-refatoracao-design.md`

**Plano anterior:** `docs/superpowers/plans/2026-08-27-refatoracao-bloco-1.md`
(concluído — PRs 64, 65 e 66)

## Global Constraints

- **Linha de base, medida ao fim do Bloco 1:** `1191 testes / 68 arquivos`,
  `npm run lint`, `npm test` e `npm run build` limpos.
- **Se um PR precisar alterar um teste existente para passar, o PR está
  errado.** Única exceção: caminho de import.
- Partir sempre de `main` recém atualizada; nunca commitar nela. Conferir
  `gh pr view <n> --json state` depois de todo push.
- **Passada no navegador em toda mudança de código**, com o Chrome DevTools:
  duas abas, microfone sintético (`AudioContext` → `createMediaStreamDestination`)
  e tela sintética (`canvas.captureStream`), injetados por `initScript` num
  `reload` — trocar só o hash não cria documento novo e o script não roda.
  **Matar o vite pelo PID** ao terminar.
- Não trocar o `Set<string>` de `observarGrupos` por contador (amigos precisa do
  *quem*).

## Mudança de escopo em relação ao spec

O spec previa um terceiro PR neste bloco, `ui/el.ts` — um helper tipado de DOM
aplicado aos 5 `createElement` do `main.ts`.

**Ele sai do Bloco 2.** Olhando o código, os cinco são triviais (duas linhas
cada: `createElement` + `className`), e um helper aplicado só a eles economiza
cinco linhas enquanto inventa uma API desenhada às cegas. O próprio spec diz que
"um helper que ninguém usa é pior que helper nenhum".

Ele passa para o **Bloco 3**, onde nasce junto com os arquivos extraídos do
`main.ts` — usado em código de verdade, com a forma decidida pelo uso. A
varredura dos 28 componentes continua no cardápio, sem data.

---

## Tarefa 1 — `ui/slot.ts` (PR 4)

**Files:**
- Create: `src/ui/slot.ts`
- Create: `src/ui/slot.test.ts`
- Modify: `src/main.ts` (9 `replaceWith` e as ~25 referências aos nós)

**Interfaces:**
- Consumes: nada.
- Produces: `criarSlot<T extends Element>(inicial: T): Slot<T>`, com
  `Slot<T> = { readonly atual: T; trocar(novo: T): void }`.

### Por que existe

O cabeçalho do `main.ts` já explica o defeito:

> `Node.replaceWith` só substitui o nó no DOM uma vez — chamar de novo sobre a
> MESMA referência antiga mexe num nó já órfão, e a tela para de acompanhar.

A defesa contra isso hoje é **lembrar de reatribuir a variável**, nove vezes:

```ts
barra.replaceWith(novaBarra)
barra = novaBarra          // ← esquecer esta linha congela a tela, em silêncio
```

Há teste guardando o caso da barra (`main.test.ts`, "reflete a migração de
anfitrião mesmo depois de vários desenhar()"), e ele existe porque o defeito já
aconteceu. Um `Slot` torna a segunda linha impossível de esquecer: quem troca
não tem acesso à variável.

- [ ] **Passo 1: escrever o teste que falha**

`src/ui/slot.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { criarSlot } from './slot'

/**
 * O defeito que este arquivo existe para tornar impossível: `replaceWith` só
 * funciona uma vez sobre a mesma referência. A segunda chamada mexe num nó já
 * órfão, e a página para de acompanhar sem erro nenhum.
 */
describe('criarSlot', () => {
  it('troca o nó que está de fato na página, e não um órfão', () => {
    const pai = document.createElement('div')
    const primeiro = document.createElement('p')
    primeiro.textContent = 'um'
    const slot = criarSlot(primeiro)
    pai.append(slot.atual)

    const segundo = document.createElement('p')
    segundo.textContent = 'dois'
    slot.trocar(segundo)

    const terceiro = document.createElement('p')
    terceiro.textContent = 'três'
    slot.trocar(terceiro)

    // Sem o slot, a terceira troca mexeria no `primeiro`, que já saiu da
    // árvore — e a página continuaria mostrando "dois" para sempre.
    expect(pai.children).toHaveLength(1)
    expect(pai.textContent).toBe('três')
    expect(pai.contains(terceiro)).toBe(true)
  })

  it('`atual` acompanha a última troca', () => {
    const slot = criarSlot(document.createElement('span'))
    const novo = document.createElement('span')
    novo.dataset['marca'] = 'sim'

    slot.trocar(novo)

    expect(slot.atual).toBe(novo)
    expect(slot.atual.dataset['marca']).toBe('sim')
  })

  it('trocar antes de estar na página não estoura', () => {
    const slot = criarSlot(document.createElement('div'))
    const novo = document.createElement('div')

    expect(() => slot.trocar(novo)).not.toThrow()
    expect(slot.atual).toBe(novo)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/ui/slot.test.ts
```

Esperado: FALHA com "Failed to resolve import ./slot".

- [ ] **Passo 3: escrever `src/ui/slot.ts`**

```ts
/**
 * Um lugar na página cujo conteúdo é trocado inteiro.
 *
 * Existe por causa de um defeito que já aconteceu aqui: `Node.replaceWith` só
 * substitui o nó **uma vez**. Chamar de novo sobre a mesma referência mexe num
 * nó já órfão — o que está na página nunca é tocado, e a tela para de
 * acompanhar sem erro nenhum. Foi assim que um "você é o anfitrião" ficou sem
 * aparecer depois de uma migração de host.
 *
 * A defesa era lembrar de reatribuir a variável a cada troca, nove vezes no
 * `main.ts`. Aqui a variável não existe para quem chama: `trocar` mexe sempre
 * no nó que está de fato na árvore.
 *
 * Não guarda quem é o pai de propósito. Um slot recém-criado ainda não foi
 * anexado, e `replaceWith` num nó solto simplesmente não faz nada — o que é o
 * comportamento certo, porque quem monta anexa `atual` logo em seguida.
 */
export interface Slot<T extends Element> {
  /** O nó que está na página agora. Use para anexar e para consultar. */
  readonly atual: T
  trocar(novo: T): void
}

export function criarSlot<T extends Element>(inicial: T): Slot<T> {
  let atual = inicial
  return {
    get atual() {
      return atual
    },
    trocar(novo) {
      atual.replaceWith(novo)
      atual = novo
    },
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/ui/slot.test.ts
```

- [ ] **Passo 5: adotar no `main.ts`**

Trocar as nove variáveis `let` por slots. Cada uma segue o mesmo molde:

```ts
// antes
let barra = renderizarBarraSala(...)
// ...
barra.replaceWith(novaBarra)
barra = novaBarra

// depois
const barra = criarSlot(renderizarBarraSala(...))
// ...
barra.trocar(renderizarBarraSala(...))
```

As nove: `barra`, `nav`, `mixer`, `controles`, `roda`, `naSala`, `salasSalvas`,
`canais`. (São oito variáveis e nove chamadas — `salasSalvas` é trocada em dois
lugares.)

**Os pontos que precisam de `.atual`**, e que o compilador vai apontar um a um:

- `app.replaceChildren(barra.atual, naSala.atual, coluna, conteudo, controles.atual, lateral, area.audios)`
- `coluna.append(salasSalvas.atual, canais.atual, nav.atual)`
- `conteudo.append(roda.atual, palco, area.videos)`
- `lateral.append(chat.raiz, mixer.atual)`
- `acenderQuemFala`: `roda.atual.querySelectorAll(...)` e
  `canais.atual.querySelectorAll(...)`

**Cuidado com o comentário do cabeçalho do arquivo.** Ele descreve a disciplina
de reatribuir `barra` e `nav`, que deixa de existir. Reescrever para dizer que a
disciplina agora mora no `Slot` — comentário que descreve código que saiu é pior
que comentário nenhum.

- [ ] **Passo 6: a suíte inteira**

```bash
npm run lint && npm test && npm run build
```

Esperado: **1191 + 3 = 1194 testes**, nenhum dos antigos alterado. Em especial,
`main.test.ts` "reflete a migração de anfitrião mesmo depois de vários
desenhar()" precisa continuar passando **sem ser tocado** — é ele que guarda
exatamente esta invariante.

- [ ] **Passo 7: navegador**

Duas abas na mesma sala. O que olhar, porque é o que o slot mexe:

1. A barra do topo muda de "Sala X" para "Sala X · você é o anfitrião" quando a
   outra aba sai. **É o caso do defeito original.**
2. O trilho (SALA/JOGOS/AJUSTES) acende o destino certo ao navegar.
3. Entrar na call: a fileira de canais e a roda de rostos aparecem e somem.
4. `2 de 2 conectados` acompanha a entrada e a saída.

- [ ] **Passo 8: commit, push, PR, conferir estado**

```bash
git add -A && git commit -m "Da nome ao lugar da pagina que se troca inteiro"
git push -u origin da-nome-ao-slot
gh pr create --title "Dá nome ao lugar da página que se troca inteiro" --body "..."
gh pr view --json state
```

---

## Tarefa 2 — o emissor unificado (PR 5)

**Files:**
- Modify: `src/net/avisar.ts` (acrescenta `criarEmissor`)
- Modify: `src/net/avisar.test.ts`
- Modify: `src/net/transport.ts` (7 listas)
- Modify: `src/net/salas.ts` (4 listas)
- Modify: `src/net/sessao.ts` (1)
- Modify: `src/call/canal.ts` (1)
- Modify: `src/call/midia.ts` (1)
- Modify: `src/call/monitor-voz.ts` (1)
- Modify: `src/identidade/apresentacao.ts` (1) — **e é aqui que há defeito**
- Modify: `src/presenca/presenca.ts` (1)
- Modify: `src/presenca/sala-de-fundo.ts` (2)

**Interfaces:**
- Consumes: `avisarTodos`, que já existe.
- Produces: `criarEmissor<A extends unknown[]>(): Emissor<A>`, com
  `Emissor<A> = { ouvir(cb: (...args: A) => void): void; avisar(...args: A): void }`.

### O que fica de fora, e por quê

**`src/call/protocolo.ts` mantém a cópia à mão.** `isolamento.test.ts` proíbe
`from '../` naquele arquivo, para a metade testável da call continuar testável
sem navegador. O guarda está certo e não vai ser afrouxado; o comentário que já
está lá explicando que é cópia de propósito ganha uma linha apontando para
`criarEmissor`.

### O defeito que esta tarefa conserta de passagem

`identidade/apresentacao.ts:121`:

```ts
for (const cb of this.ouvintes) cb(peerId, selo)
```

**Sem cópia e sem isolamento.** Um ouvinte que estoure impede todos os
seguintes de serem avisados — a forma exata do defeito do Capítulo 9 do diário
("um ouvinte que estoura levava os outros junto", e o sintoma é "entrei na sala
e estou sozinho", com o chat funcionando por cima).

Hoje há um consumidor só. **Amigos põe outro**, porque `Apresentacao` é
justamente quem diz *quem é quem*. É a irmã da mina que o PR 65 desarmou na
sala de fundo.

- [ ] **Passo 1: escrever o teste que falha**

Acrescentar em `src/net/avisar.test.ts`:

```ts
describe('criarEmissor', () => {
  it('avisa todos os inscritos, na ordem', () => {
    const emissor = criarEmissor<[string]>()
    const vistos: string[] = []
    emissor.ouvir((x) => vistos.push('a:' + x))
    emissor.ouvir((x) => vistos.push('b:' + x))

    emissor.avisar('oi')

    expect(vistos).toEqual(['a:oi', 'b:oi'])
  })

  it('um que estoura não impede os outros', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const emissor = criarEmissor<[]>()
      const segundo = vi.fn()
      emissor.ouvir(() => { throw new Error('estourei') })
      emissor.ouvir(segundo)

      emissor.avisar()

      expect(segundo).toHaveBeenCalled()
      expect(erro).toHaveBeenCalled()
    } finally {
      erro.mockRestore()
    }
  })

  it('inscrever-se durante o aviso não pula o vizinho', () => {
    const emissor = criarEmissor<[]>()
    const tardio = vi.fn()
    const segundo = vi.fn()
    emissor.ouvir(() => emissor.ouvir(tardio))
    emissor.ouvir(segundo)

    emissor.avisar()

    // O que entra durante o aviso só é chamado no PRÓXIMO — mas quem já
    // estava não pode ser pulado por a lista ter mudado no meio do laço.
    expect(segundo).toHaveBeenCalledTimes(1)
    expect(tardio).not.toHaveBeenCalled()
  })
})
```

E em `src/identidade/apresentacao.test.ts`:

```ts
it('um ouvinte que estoura não impede o outro de receber o selo', async () => {
  const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    // Montar a apresentação como os outros casos deste arquivo já fazem.
    const segundo = vi.fn()
    apresentacao.aoVerificar(() => { throw new Error('estourei') })
    apresentacao.aoVerificar(segundo)

    // ...provocar a verificação pelo mesmo caminho dos outros casos...

    expect(segundo).toHaveBeenCalled()
  } finally {
    erro.mockRestore()
  }
})
```

**Antes de escrever este segundo:** ler `apresentacao.test.ts` e montar a
verificação pelo caminho que o arquivo já usa (`ola` → `prova` com chaves de
verdade), sem inventar outro.

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/net/avisar.test.ts src/identidade/apresentacao.test.ts
```

Esperado: os de `criarEmissor` falham por não existir; o de `apresentacao`
falha porque o `for` cru para no primeiro estouro.

- [ ] **Passo 3: acrescentar `criarEmissor` a `src/net/avisar.ts`**

```ts
/**
 * Uma lista de ouvintes com nome.
 *
 * O padrão — declarar `((...) => void)[]`, empurrar em `aoX(cb)` e chamar
 * `avisarTodos` — aparecia em **vinte** declarações espalhadas por dez
 * arquivos, e em três implementações diferentes de "avisar". Uma delas, em
 * `identidade/apresentacao.ts`, percorria a lista viva e sem isolamento: um
 * ouvinte que estourasse levava junto todos os que vinham depois.
 *
 * Isto não é açúcar. É um lugar só para decidir a semântica que o projeto já
 * pagou caro para aprender: **isolar o estouro** (Capítulo 9 do diário) e
 * **percorrer uma cópia** (um ouvinte pode se inscrever enquanto é avisado).
 *
 * Fica neste arquivo, junto de `avisarTodos`, porque é o mesmo assunto — e um
 * arquivo novo para quinze linhas seria pior.
 */
export interface Emissor<A extends unknown[]> {
  ouvir(cb: (...args: A) => void): void
  avisar(...args: A): void
}

export function criarEmissor<A extends unknown[]>(): Emissor<A> {
  const ouvintes: ((...args: A) => void)[] = []
  return {
    ouvir: (cb) => { ouvintes.push(cb) },
    avisar: (...args) => avisarTodos(ouvintes, ...args),
  }
}
```

- [ ] **Passo 4: adotar, arquivo por arquivo**

Molde, em `transport.ts`:

```ts
// antes
const aoAcao: ((acao: Acao, peerId: string) => void)[] = []
// ...
avisarTodos(aoAcao, acao, de)
// ...
aoReceberAcao: (cb) => { aoAcao.push(cb) },

// depois
const aoAcao = criarEmissor<[acao: Acao, peerId: string]>()
// ...
aoAcao.avisar(acao, de)
// ...
aoReceberAcao: aoAcao.ouvir,
```

Ordem sugerida, do mais mecânico ao mais delicado: `transport.ts`, `salas.ts`,
`canal.ts`, `midia.ts`, `monitor-voz.ts`, `sessao.ts`, `sala-de-fundo.ts`,
`presenca.ts`, `apresentacao.ts`.

**Rodar `npm test` depois de CADA arquivo.** Nove arquivos numa tacada e um
teste vermelho no fim não diz qual foi.

Em `presenca.ts` a implementação à mão sai junto (ela tinha `try/catch` próprio
e uma linha de diagnóstico; a linha continua, o `try/catch` vira `criarEmissor`).

- [ ] **Passo 5: a suíte inteira**

```bash
npm run lint && npm test && npm run build
```

Esperado: `1194 + 4 = 1198`, nenhum dos antigos alterado.

- [ ] **Passo 6: navegador**

Este PR mexe na entrega de **toda** mensagem da rede. Duas abas:

1. As duas se veem: `2 de 2 conectados`.
2. Chat funciona nos dois sentidos.
3. Entrar na call nos dois: os dois se escutam (`<audio>` com faixa `live` e
   `currentTime` andando).
4. Compartilhar tela e assistir.
5. Uma aba sai: a outra vira anfitriã e a lista atualiza.

O item 5 é o que exercita `aoSairPeer` chegando à `Sessao` **e** ao
`ProtocoloCall` **e** à `Apresentacao` — que é o ponto inteiro do isolamento.

- [ ] **Passo 7: commit, push, PR, conferir estado**

---

## Ao fim do bloco

Com os dois na `main`, o `main.ts` para de repetir os dois padrões à mão e a
camada de rede tem um lugar só decidindo o que "avisar" significa. **Aí começa o
Bloco 3**, que ganha plano próprio — e é onde o `ui/el.ts` nasce, junto com o
primeiro arquivo extraído.
