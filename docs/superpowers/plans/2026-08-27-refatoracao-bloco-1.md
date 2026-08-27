# Refatoração — Bloco 1: chão firme

> **Para quem executa:** use `superpowers:executing-plans` para tocar tarefa a
> tarefa. Os passos usam caixinha (`- [ ]`) para marcação.

**Goal:** Deixar o projeto com um linter que documenta o padrão que já existe,
corrigir quatro defeitos pequenos já localizados, e limpar o que sobrou — antes
de qualquer PR mexer na estrutura.

**Architecture:** Três PRs independentes, nesta ordem. O PR 1 não toca em código
de produção. O PR 2 é o **único** do ciclo inteiro que muda comportamento, e por
isso está sozinho. O PR 3 só remove coisa.

**Tech Stack:** TypeScript 5.6 strict, Vite 8, Vitest 4, happy-dom, ESLint 9 +
typescript-eslint 8.

**Spec:** `docs/superpowers/specs/2026-08-27-refatoracao-design.md`

## Global Constraints

Copiadas do spec — valem para toda tarefa deste plano e dos próximos.

- **Linha de base:** `1179 testes / 67 arquivos / 31,3 s`, `npm run build`
  limpo. Todo PR é comparado contra esses números.
- **A regra que protege as features:** se um PR de refatoração precisar alterar
  um teste existente para passar, o PR está errado. Única exceção: caminho de
  import. **O PR 2 (Tarefa 2) é a exceção declarada** — ele muda comportamento
  de propósito.
- **Nunca commitar direto na `main`.** Partir sempre de uma `main` recém
  atualizada: `git checkout main && git pull --ff-only && git checkout -b <nome>`.
- **Depois de todo push, conferir `gh pr view <n> --json state`.** Um commit
  empurrado para branch já mergeado fica órfão; já aconteceu seis vezes neste
  projeto. Resgate: `cherry-pick` a partir da `main` atualizada.
- **Node do CI está fixado em `22.12.0`** (`.github/workflows/deploy.yml`).
  Nenhuma dependência nova pode exigir mais que isso.
- **Não trocar o `Set<string>` de `observarGrupos` por um contador.** A feature
  de amigos precisa do *quem*; o `Set` é o que a torna uma linha de trabalho em
  vez de uma reescrita.
- **Português nos nomes, comentários e mensagens de commit**, como o resto do
  projeto. Comentário explica o *porquê*, não o *o quê*.

---

## Tarefa 1 — O linter (PR 1)

**Files:**
- Create: `eslint.config.js`
- Create: `.github/workflows/verificar.yml`
- Modify: `package.json` (scripts + devDependencies)
- Modify: `docs/superpowers/specs/2026-08-27-refatoracao-design.md` (§4.3)

**Interfaces:**
- Consumes: nada.
- Produces: o script `npm run lint`. As tarefas seguintes rodam ele junto com
  `npm test` e `npm run build` antes de commitar.

### Por que ESLint 9 e não 10

Medido: `eslint@10` declara `engines: node ^20.19.0 || ^22.13.0 || >=24`. O CI
fixa **`22.12.0`**, que **não** satisfaz `^22.13.0` — o lint passaria aqui e
quebraria lá. `eslint@9` declara `>=21.1.0` e passa nos dois.

A alternativa seria subir o Node do CI, e ela foi descartada: o pino existe com
comentário próprio (o piso do Vite 8) e mexer no caminho de deploy para caber um
linter é trocar risco real por conveniência.

### Correção do spec que esta tarefa carrega

O §4.3 do spec promete proibir `!` não-nulo e diz que o conjunto "passa limpo de
cara". **Medição derrubou isso:** há 155 usos de `!` em `src`, sendo 146 em
testes e 9 em produção — e todos são o idioma que o `noUncheckedIndexedAccess`
obriga depois de uma guarda (`lideres.length === 1 ? lideres[0]!.peerId`).

Aqui o `!` é **consequência de uma configuração mais estrita**, não descuido.
Proibi-lo pioraria o código. A regra sai, e o spec é corrigido nesta mesma
tarefa — afirmação minha que a medição derrubou não fica de pé no documento.

- [ ] **Passo 1: instalar as dependências**

```bash
npm install --save-dev eslint@^9.39.5 @eslint/js@^9.39.5 typescript-eslint@^8.68.0
```

- [ ] **Passo 2: escrever `eslint.config.js`**

O projeto é `"type": "module"`, então o arquivo é ESM. Só `src/` é lintado:
`vite.config.ts` e `sonda/` estão fora do `tsconfig.json`, e regras com tipo
exigem que o arquivo pertença ao projeto.

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Um conjunto pequeno e escolhido a dedo — nada de estilo, nada de formatação.
 *
 * O objetivo não é encontrar problemas: é impedir que o padrão que este projeto
 * já segue se perca num momento de pressa. Por isso cada regra abaixo tem um
 * motivo escrito, e por isso o preset `strict-type-checked` ficou de fora — ele
 * acusaria dezenas de pontos hoje legítimos, e cada um viraria um
 * `eslint-disable`. Regra que precisa de supressão em massa não documenta um
 * padrão; inventa um.
 *
 * O que NÃO está aqui, e por quê:
 *
 * - `no-non-null-assertion`. Há 9 usos em produção e 146 em teste, e todos são
 *   o idioma que o `noUncheckedIndexedAccess` do tsconfig obriga depois de uma
 *   guarda (`lideres.length === 1 ? lideres[0]!.peerId`). Aqui o `!` é
 *   consequência de uma configuração MAIS estrita, não de descuido: proibi-lo
 *   empurraria o código para pior.
 */
export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'sonda/', 'vite.config.ts', 'vitest.config.ts'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Zero ocorrências hoje. A regra guarda o que já é verdade.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      // A regra que mais importa aqui. Vários bugs de mídia deste projeto
      // moraram numa promessa que ninguém escutava — o `InvalidAccessError`
      // do `addTrack` estourava dentro de uma promessa solta e nada aparecia
      // no console. Ver o Capítulo 4 do diário de bordo.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // O `noUnusedLocals` do tsc já pega variável local. Isto pega o resto.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
```

- [ ] **Passo 3: rodar e ver o que ele diz**

```bash
npx eslint .
```

**Este passo é uma medição, não uma formalidade.** O resultado decide o passo
seguinte, e o critério é:

| O que apareceu | O que fazer |
|---|---|
| Nada | Seguir para o passo 5. |
| Até 5 pontos, e cada um é uma melhoria de verdade | Corrigir **nesta tarefa**, e citar cada um no corpo do PR. |
| Mais de 5 pontos, ou código que está certo do jeito que está | **A regra sai**, com um comentário em `eslint.config.js` dizendo o que ela acusou e por que o código continua como está. |

Não existe a opção "espalhar `eslint-disable`". Se a regra precisa ser
silenciada em vários lugares, ela não descreve este projeto.

- [ ] **Passo 4: aplicar a decisão do passo 3**

Corrigir os pontos aceitos, ou remover as regras recusadas com o comentário
exigido. Rodar `npx eslint .` de novo e confirmar saída limpa.

- [ ] **Passo 5: adicionar o script**

Em `package.json`, dentro de `"scripts"`, logo depois de `"test:watch"`:

```json
"lint": "eslint ."
```

- [ ] **Passo 6: criar o workflow de verificação**

Hoje o CI **só roda em push para `main`** — ou seja, depois do merge. Um linter
que só fala depois de o código já estar publicado não protege nada.

Arquivo novo, e **separado do `deploy.yml` de propósito**: acrescentar
`pull_request` ao workflow de deploy faria ele tentar publicar a partir de um
PR.

`.github/workflows/verificar.yml`:

```yaml
name: Verificar

on:
  pull_request:
  workflow_dispatch:

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          # A MESMA versão exata do deploy.yml. Duas versões diferentes fariam
          # o PR passar e o merge quebrar, que é o pior desfecho possível.
          node-version: '22.12.0'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Passo 7: acrescentar o lint ao deploy**

Em `.github/workflows/deploy.yml`, no job `build`, inserir antes de `- run: npm test`:

```yaml
      - run: npm run lint
```

- [ ] **Passo 8: corrigir o §4.3 do spec**

Em `docs/superpowers/specs/2026-08-27-refatoracao-design.md`, trocar a linha

```
`@ts-ignore`, `!` não-nulo, promessa não tratada (`no-floating-promises`) e
```

por

```
`@ts-ignore`, promessa não tratada e mal usada (`no-floating-promises` e
`no-misused-promises`) e
```

E acrescentar, logo depois do parágrafo que termina em "Ruído antes de valor.":

```markdown
**Emenda de 2026-08-27, por medição.** A versão original desta seção também
proibia `!` não-nulo. Medido: 155 usos em `src`, sendo 9 em produção — e todos
são o idioma que o `noUncheckedIndexedAccess` obriga depois de uma guarda
(`lideres.length === 1 ? lideres[0]!.peerId`). Aqui o `!` é **consequência de
uma configuração mais estrita**, não descuido, e proibi-lo pioraria o código. A
regra saiu antes de entrar.
```

- [ ] **Passo 9: rodar tudo e comparar com a linha de base**

```bash
npm run lint && npm test && npm run build
```

Esperado: lint limpo, `1179 testes passando`, build sem erro. Se o número de
testes mudou, algo está errado — esta tarefa não escreve nem apaga teste.

- [ ] **Passo 10: commit, push e PR**

```bash
git add eslint.config.js package.json package-lock.json .github/workflows/ docs/
git commit -m "Poe um linter que guarda o padrao que ja existe"
git push -u origin adiciona-linter
gh pr create --title "Adiciona um linter que guarda o padrão que já existe" --body "..."
gh pr view --json state
```

No corpo do PR, dizer: que regras entraram e por quê, **quais saíram e por
quê**, que o ESLint 9 foi escolhido por causa do pino de Node do CI, e que
agora existe verificação **antes** do merge — que é a mudança de fluxo que ele
precisa aprovar.

---

## Tarefa 2 — As quatro correções (PR 2)

**Files:**
- Modify: `src/call/midia.ts:535-538`
- Modify: `src/call/midia.test.ts` (acrescentar describe no fim)
- Modify: `src/presenca/presenca.ts:118-126, 203`
- Modify: `src/presenca/presenca.test.ts` (acrescentar describe no fim)
- Modify: `src/presenca/sala-de-fundo.ts:129-156`
- Create: `src/presenca/sala-de-fundo.test.ts`
- Modify: `src/main.ts:367-375` (e o `encerrar`, por volta da linha 1010)
- Modify: `src/main.test.ts` (acrescentar describe no fim)

**Interfaces:**
- Consumes: `npm run lint` da Tarefa 1.
- Produces: nada que as tarefas seguintes usem. É um PR terminal.

**Este é o único PR do ciclo que muda comportamento.** Cada correção tem teste
que falha antes e passa depois.

### 2a — `definirQualidade` liga o codificador de quem não assiste

- [ ] **Passo 1: escrever o teste que falha**

Acrescentar no **fim** de `src/call/midia.test.ts`. Self-contained de
propósito: não depende de helper que mora em outro `describe`.

```ts
describe('Midia — trocar a qualidade não acorda o codificador de quem não assiste', () => {
  function senderFalso() {
    const params: { encodings: Record<string, unknown>[] } = { encodings: [{}] }
    const sender = {
      track: { kind: 'video' },
      getParameters: () => params,
      setParameters: vi.fn().mockResolvedValue(undefined),
    }
    return { sender, params }
  }

  it('quem parou de assistir continua com o codificador desligado', async () => {
    const contexto = criarSalaFalsa()
    const midia = new Midia(contexto.sala)
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [],
          getVideoTracks: () => [
            { contentHint: '', onended: null, getSettings: () => ({ height: 1080 }) },
          ],
          getAudioTracks: () => [],
        }),
      },
      configurable: true,
    })
    await midia.compartilharTela(() => {})

    const pa = senderFalso()
    const pb = senderFalso()
    contexto.ctx.definirSenders({
      pa: { getSenders: () => [pa.sender] },
      pb: { getSenders: () => [pb.sender] },
    })

    // Os dois pediram para assistir, depois o pb parou. O envio para o pb
    // continua ESTABELECIDO — é `encoding.active` que desliga, porque
    // desmontar o envio faria o `ontrack` do outro lado nunca mais disparar.
    midia.sincronizarTela(['pa', 'pb'])
    midia.sincronizarTela(['pa'])
    expect(pb.params.encodings[0]!['active']).toBe(false)

    midia.definirQualidade(720)

    // A assinatura explícita é o coração do desenho: o codificador só trabalha
    // por quem está assistindo. Mudar a MINHA qualidade não pode ligá-lo para
    // quem já saiu.
    expect(pb.params.encodings[0]!['active']).toBe(false)
    expect(pa.params.encodings[0]!['active']).toBe(true)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/call/midia.test.ts -t "codificador desligado"
```

Esperado: FALHA, com `expected false to be true` na última asserção do `pb` —
`definirQualidade` ligou o codificador de quem não assiste.

- [ ] **Passo 3: a correção**

`src/call/midia.ts`, substituir o corpo de `definirQualidade`:

```ts
  definirQualidade(altura: number): void {
    this.altura = altura
    // `envioAplicado` guarda a altura junto do `ativo`, então limpar aqui faz a
    // próxima sincronização reaplicar tudo com o `ativo` CERTO de cada peer.
    //
    // A versão anterior fazia `ajustarEnvio(peerId, true)` para todo peer já
    // publicado — inclusive quem tinha parado de assistir. O tique de 500 ms
    // corrigia logo em seguida, mas por essa janela o codificador voltava a
    // trabalhar por quem não pediu nada, que é exatamente o que a assinatura
    // explícita existe para impedir.
    this.envioAplicado.clear()
    for (const peerId of this.telaPara.keys()) {
      this.ajustarEnvio(peerId, this.assistindoAgora.has(peerId))
    }
  }
```

E acrescentar o campo, junto dos outros mapas privados (perto de `telaPara`):

```ts
  /**
   * Quem pediu a tela na última sincronização.
   *
   * `telaPara` responde "para quem o envio já foi estabelecido", que não é a
   * mesma pergunta: o envio é estabelecido uma vez e nunca desmontado, e quem
   * para de assistir continua ali com o codificador desligado. Sem este
   * segundo conjunto não há como reaplicar a qualidade sem reacender todo
   * mundo.
   */
  private assistindoAgora = new Set<string>()
```

E em `sincronizarTela`, logo depois de `if (!this.tela) return`:

```ts
    this.assistindoAgora = new Set(alvos)
```

E em `pararTela`, junto dos outros `clear()`:

```ts
    this.assistindoAgora.clear()
```

**O mesmo defeito mora em mais um lugar, e o conserto é o mesmo.** Em
`sincronizarTela`, o ramo de quem acabou de ser publicado adia o ajuste em
1500 ms e leva o `ativo` **capturado agora** para dentro do `setTimeout`:

```ts
      if (novos.includes(id)) {
        setTimeout(() => {
          if (this.ajustarEnvio(id, ativo)) this.envioAplicado.set(id, desejado)
        }, MS_ATE_O_SENDER_EXISTIR)
        continue
      }
```

Se a pessoa parar de assistir dentro dessa janela, o temporizador dispara com o
valor velho e liga o codificador de quem já saiu — mesma família do 2a, mesma
janela curta fechada pelo tique. Trocar por uma leitura no momento em que ele
dispara:

```ts
      if (novos.includes(id)) {
        setTimeout(() => {
          // Lido AGORA, e não capturado lá atrás: em 1500 ms a pessoa pode ter
          // parado de assistir, e acender o codificador por causa de um pedido
          // que já foi retirado é o mesmo defeito do `definirQualidade`.
          const querAgora = this.assistindoAgora.has(id)
          if (this.ajustarEnvio(id, querAgora)) {
            this.envioAplicado.set(id, `${querAgora}|${comum}`)
          }
        }, MS_ATE_O_SENDER_EXISTIR)
        continue
      }
```

Com isso a variável `desejado` deixa de ser usada nesse ramo; ela continua
valendo no ramo de baixo e não sai de lá.

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/call/midia.test.ts
```

Esperado: PASSA, e **todos** os testes de `midia.test.ts` continuam passando —
inclusive os três de `Midia — escala pela resolução real da fonte`, que chamam
`definirQualidade` depois de `sincronizarTela(['pa'])` e portanto têm o `pa`
assistindo.

### 2b — O diagnóstico da presença sai do ar por padrão

- [ ] **Passo 5: escrever o teste que falha**

Acrescentar no fim de `src/presenca/presenca.test.ts`:

```ts
describe('o diagnóstico não fala sozinho em produção', () => {
  it('sem ?diag=presenca, observar um grupo não imprime nada', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { abrir } = fabrica()

    const p = observarGrupos(['aaa'], abrir)

    // Ele nasceu numa caçada e ficou ligado: um retrato a cada 10 s, para
    // sempre, no console de quem só quer jogar.
    expect(info).not.toHaveBeenCalled()
    p.encerrar()
    info.mockRestore()
  })
})
```

`fabrica()` é o helper que `presenca.test.ts` já define no topo (devolve
`{ abrir, abertas }`) — reaproveitar, sem criar outro.

- [ ] **Passo 6: rodar e ver falhar**

```bash
npx vitest run src/presenca/presenca.test.ts -t "não fala sozinho"
```

Esperado: FALHA — `relatar` é chamado dentro de `sincronizar`, que roda na
montagem.

- [ ] **Passo 7: a correção**

Em `src/presenca/presenca.ts`, acrescentar antes de `observarGrupos`:

```ts
/**
 * O diagnóstico fala? Ligado por `?diag=presenca` na URL.
 *
 * Ele nasceu na caçada do Capítulo 13 e ficou ligado — imprimindo um retrato a
 * cada 10 s, para sempre, no console de quem só quer jogar. O instrumento
 * continua valendo (foi ele que revelou que a presença ouvia só o nostr), e
 * por isso não é apagado: é desligado por padrão.
 *
 * Lido uma vez, e não a cada chamada: `location` pode não existir fora do
 * navegador, e um `try` por linha de log seria pior que o log.
 */
function diagnosticoLigado(): boolean {
  try {
    return new URLSearchParams(location.search).get('diag') === 'presenca'
  } catch {
    return false
  }
}
```

Dentro de `observarGrupos`, logo depois de `let viva = true`:

```ts
  const falando = diagnosticoLigado()
```

Em `relatar`, como primeira linha:

```ts
    if (!falando) return
```

E o `console.info` do teto de `MAX_OBSERVADOS` (linha ~157) fica **como está**:
ele só dispara quando a pessoa tem mais grupos salvos que o teto, é raro, e
avisa de um limite invisível — silenciá-lo faria um grupo não observado parecer
um grupo vazio.

O `setInterval` de 10 s também sai quando o diagnóstico está desligado:

```ts
  const tique = falando
    ? setInterval(() => relatar('a cada 10s'), 10_000)
    : null
```

E no `encerrar`:

```ts
      if (tique !== null) clearInterval(tique)
```

- [ ] **Passo 8: rodar e ver passar**

```bash
npx vitest run src/presenca/presenca.test.ts
```

Esperado: PASSA, e os outros testes do arquivo seguem passando.

### 2c — Os ouvintes da sala de fundo viram listas

Esta é a correção que existe **por causa de amigos** (§5.2 do spec). Ela não
muda nada hoje: só há um consumidor.

- [ ] **Passo 9: escrever o teste que falha**

Arquivo novo `src/presenca/sala-de-fundo.test.ts`. Ele precisa das mesmas
substituições de Trystero que `main.integracao.test.ts` usa:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FakeSala {
  onPeerJoin: ((id: string) => void) | null
  onPeerLeave: ((id: string) => void) | null
  canal: { send: ReturnType<typeof vi.fn>; onMessage: ((d: unknown, c: { peerId: string }) => void) | null }
  leave: ReturnType<typeof vi.fn>
}

const salas: FakeSala[] = []

function fabricarSala(): FakeSala {
  const canal = { send: vi.fn(), onMessage: null }
  const sala = {
    onPeerJoin: null,
    onPeerLeave: null,
    canal,
    makeAction: () => canal,
    leave: vi.fn().mockResolvedValue(undefined),
  } as unknown as FakeSala
  salas.push(sala)
  return sala
}

vi.mock('@trystero-p2p/nostr', () => ({
  selfId: 'eu-mesmo',
  defaultRelayUrls: ['wss://exemplo-a.test'],
  getRelaySockets: () => ({}),
  joinRoom: vi.fn(() => fabricarSala()),
}))
vi.mock('@trystero-p2p/mqtt', () => ({ joinRoom: vi.fn(() => fabricarSala()) }))
vi.mock('@trystero-p2p/torrent', () => ({ joinRoom: vi.fn(() => fabricarSala()) }))

import { abrirSalaDeFundo } from './sala-de-fundo'

/**
 * A armadilha que este arquivo guarda.
 *
 * `onPeerJoin` do Trystero é um slot de handler ÚNICO, e a sala de fundo
 * copiava esse formato: atribuir de novo apagava o anterior, em silêncio. Hoje
 * não dói porque só existe um consumidor, a contagem de presença.
 *
 * A feature de amigos põe um segundo — a `Apresentacao`, que prova a identidade
 * de quem está no grupo. Com slot único, o segundo apagaria o primeiro e a
 * contagem pararia de funcionar sem nenhum erro no console. É o sintoma mais
 * caro de diagnosticar deste projeto, e `net/salas.ts` já resolveu o mesmo
 * problema com lista de ouvintes.
 */
describe('a sala de fundo avisa TODOS os ouvintes', () => {
  beforeEach(() => { salas.length = 0 })

  it('dois inscritos em aoEntrarPeer, os dois são chamados', () => {
    const fundo = abrirSalaDeFundo('AAAA-BBBB-CCCC-DDDD')
    const primeiro = vi.fn()
    const segundo = vi.fn()
    fundo.aoEntrarPeer(primeiro)
    fundo.aoEntrarPeer(segundo)

    // A entrada só conta depois da DECLARAÇÃO: quem só observa fica calado, e
    // é por isso que a contagem não soma observadores.
    salas[0]!.canal.onMessage?.(1, { peerId: 'pa' })

    expect(primeiro).toHaveBeenCalledWith('pa')
    expect(segundo).toHaveBeenCalledWith('pa')
  })

  it('dois inscritos em aoSairPeer, os dois são chamados', () => {
    const fundo = abrirSalaDeFundo('AAAA-BBBB-CCCC-DDDD')
    const primeiro = vi.fn()
    const segundo = vi.fn()
    fundo.aoEntrarPeer(() => {})
    fundo.aoSairPeer(primeiro)
    fundo.aoSairPeer(segundo)

    salas[0]!.canal.onMessage?.(1, { peerId: 'pa' })
    salas[0]!.onPeerLeave?.('pa')

    expect(primeiro).toHaveBeenCalledWith('pa')
    expect(segundo).toHaveBeenCalledWith('pa')
  })

  it('um ouvinte que estoura não impede o outro de ser avisado', () => {
    const fundo = abrirSalaDeFundo('AAAA-BBBB-CCCC-DDDD')
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const segundo = vi.fn()
    fundo.aoEntrarPeer(() => { throw new Error('estourei') })
    fundo.aoEntrarPeer(segundo)

    salas[0]!.canal.onMessage?.(1, { peerId: 'pa' })

    expect(segundo).toHaveBeenCalledWith('pa')
    erro.mockRestore()
  })
})
```

- [ ] **Passo 10: rodar e ver falhar**

```bash
npx vitest run src/presenca/sala-de-fundo.test.ts
```

Esperado: FALHA nos três — o `primeiro` nunca é chamado, porque o `segundo` o
sobrescreveu.

- [ ] **Passo 11: a correção**

Em `src/presenca/sala-de-fundo.ts`, acrescentar o import:

```ts
import { avisarTodos } from '../net/avisar'
```

Trocar as duas variáveis de slot:

```ts
  // Listas, e não um slot só. `onPeerJoin` do Trystero guarda um handler
  // único, e copiar esse formato aqui seria copiar a armadilha: amigos vai
  // querer a `Apresentacao` escutando junto com a contagem, e o segundo
  // inscrito apagaria o primeiro em silêncio. `avisarTodos` ainda isola o
  // estouro de um para que ele não leve os outros junto.
  const aoEntrar: ((peerId: string) => void)[] = []
  const aoSair: ((peerId: string) => void)[] = []
```

Trocar as duas chamadas:

```ts
      aoSair?.(peerId)     →     avisarTodos(aoSair, peerId)
      aoEntrar?.(peerId)   →     avisarTodos(aoEntrar, peerId)
```

E os dois registradores:

```ts
    aoEntrarPeer: (cb) => { aoEntrar.push(cb) },
    aoSairPeer: (cb) => { aoSair.push(cb) },
```

- [ ] **Passo 12: rodar e ver passar**

```bash
npx vitest run src/presenca/ src/main.integracao.test.ts
```

Esperado: os três novos PASSAM, e os 19 testes de integração que cobrem esta
sala continuam passando **sem serem alterados**.

### 2d — O ouvinte de `devicechange` é removido no desmonte

- [ ] **Passo 13: escrever o teste que falha**

Acrescentar no fim de `src/main.test.ts`:

`entrarNaSala` devolve `void` — não há `encerrar` para chamar de fora. O
desmonte acontece pelo **mesmo caminho que trocar de sala usa**, que é o clique
em `button[data-sala="outra"]`. É assim que o teste do anúncio órfão (linha
~1296) já faz, e este segue o mesmo caminho em vez de inventar outro.

```ts
describe('entrarNaSala — o ouvinte de aparelhos não fica pendurado', () => {
  it('sair da sala remove o devicechange que ela registrou', () => {
    vi.useFakeTimers()
    try {
      const registrados: unknown[] = []
      const removidos: unknown[] = []
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          addEventListener: (_evento: string, cb: unknown) => { registrados.push(cb) },
          removeEventListener: (_evento: string, cb: unknown) => { removidos.push(cb) },
        },
        configurable: true,
      })

      const rede = criarRedeFalsa()
      vi.mocked(criarSalasTrystero).mockImplementation(() => criarSalasFalsas([]).salas)
      vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('eu'))

      const app = document.createElement('div')
      entrarNaSala(app, 'Alex', 'CODIGO01')
      rede.bombear()

      expect(registrados).toHaveLength(1)

      // Sair pelo mesmo caminho que trocar de sala usa. A home que sobe em
      // seguida não registra `devicechange` nenhum, então o que sobrar aqui é
      // da sala desmontada.
      app.querySelector<HTMLButtonElement>('button[data-sala="outra"]')!.click()

      // Cada sala desmontada deixava um ouvinte vivo chamando `desenhar()` numa
      // sala morta — um por troca, para sempre. Foi por esse caminho que o
      // anúncio órfão da presença nascia.
      expect(removidos).toEqual(registrados)
    } finally {
      vi.useRealTimers()
    }
  })
})
```

**Um comentário existente fica falso com esta correção, e precisa ser
atualizado.** O teste do anúncio órfão diz, na linha ~1345:

```
      // Um desenho atrasado, pelo ouvinte de `devicechange` que a sala
      // desmontada deixa registrado (ninguém o remove).
```

Depois desta correção, alguém remove. Trocar o parêntese por:

```
      // Um desenho atrasado, pelo ouvinte de `devicechange`. Ele agora é
      // removido no `encerrar`, então este disparo não chega mais à sala
      // desmontada — a invariante que o teste guarda (nenhum anúncio nasce
      // depois do desmonte) continua valendo, e por mais um motivo.
```

Isto **não** viola a regra global: nenhuma asserção muda, só um comentário que
descrevia o defeito corrigido. Comentário que mente é pior que comentário
nenhum — e este projeto lê os comentários.

- [ ] **Passo 14: rodar e ver falhar**

```bash
npx vitest run src/main.test.ts -t "não fica pendurado"
```

Esperado: FALHA — `removidos` está vazio.

- [ ] **Passo 15: a correção**

Em `src/main.ts`, trocar o bloco das linhas 367-375 por:

```ts
  /**
   * Um fone plugado ou arrancado no meio da conversa deixaria a lista velha.
   *
   * Guardado para ser removido no `encerrar`: trocar de sala desmonta esta e
   * monta outra, e um ouvinte esquecido chama `desenhar()` numa sala morta —
   * um por troca, para sempre. Foi por esse caminho que o anúncio órfão da
   * presença nascia.
   */
  const aoTrocarAparelho = (): void => { void aparelhos.reler().then(desenhar) }
  try {
    navigator.mediaDevices.addEventListener('devicechange', aoTrocarAparelho)
  } catch {
    // Navegador sem `mediaDevices`: a call não vai funcionar mesmo, e a sala
    // não pode quebrar por causa disso.
  }
```

E dentro de `encerrar`, junto dos outros desligamentos:

```ts
    try {
      navigator.mediaDevices.removeEventListener('devicechange', aoTrocarAparelho)
    } catch { /* mesmo motivo do registro */ }
```

- [ ] **Passo 16: rodar e ver passar**

```bash
npx vitest run src/main.test.ts
```

- [ ] **Passo 17: a suíte inteira, e comparar com a linha de base**

```bash
npm run lint && npm test && npm run build
```

Esperado: lint limpo, build limpo, e **1179 + os novos testes** passando.
Nenhum teste que já existia pode ter sido alterado.

- [ ] **Passo 18: commit, push e PR**

```bash
git add src docs
git commit -m "Corrige quatro defeitos pequenos, cada um com teste"
git push -u origin corrige-defeitos-pequenos
gh pr create --title "Corrige quatro defeitos pequenos, cada um com teste" --body "..."
gh pr view --json state
```

No corpo do PR, separar as quatro correções, e deixar claro que **2c existe por
causa de amigos** e não muda nada hoje.

- [ ] **Passo 19: conferir no navegador antes do merge**

`npm run dev`, duas abas na mesma sala. Entrar na call, compartilhar tela,
mandar a outra aba assistir e parar de assistir, e então trocar a qualidade —
conferir que a tela de quem parou não volta a ser codificada. E abrir o console
sem `?diag=presenca`: nenhuma linha de presença deve aparecer.

**Matar o vite pelo PID ao terminar** — parar a tarefa em segundo plano não mata
o processo filho, e ele continua servindo código velho na porta.

---

## Tarefa 3 — A limpeza (PR 3)

**Files:**
- Modify: vários em `src/**` (remoção da palavra `export`)
- Modify: `src/ui/theme.css`
- Modify: `docs/roteiro.md`

**Interfaces:**
- Consumes: `npm run lint` da Tarefa 1.
- Produces: nada. PR terminal, e só remove.

- [ ] **Passo 1: levantar os exports que ninguém importa**

```bash
for f in $(git ls-files 'src/**' | grep -v '\.test\.' | grep -v '\.css$'); do
  grep -oE "^export (async )?(function|const|class|interface|type) [A-Za-z0-9_]+" "$f" \
    | awk '{print $NF}' | while read -r nome; do
      usos=$(grep -rl "\b$nome\b" --include=*.ts src sonda 2>/dev/null | grep -v "^$f$" | wc -l)
      if [ "$usos" -eq 0 ]; then echo "$f :: $nome"; fi
    done
done
```

- [ ] **Passo 2: tirar o `export` — com um critério, não em massa**

**Só perde o `export`** o símbolo que a lista acusou **e** que é detalhe interno
do próprio arquivo: constante usada só ali (`ROTULO_COPIAR`, `CHAVE_SAIDA`,
`AVISO_FICHAS`), tipo usado só na assinatura interna.

**Mantém o `export`**, mesmo sem uso externo:
- Tipos que descrevem o **parâmetro público** de uma função exportada
  (`DependenciasDaArea`, `AcoesConfiguracoes`, `ExtrasHome`, `EstadoDetalhes`).
  Quem chama a função precisa poder nomear o que passa.
- `Presenca` — é a interface de retorno de `observarGrupos`, e amigos vai
  encostar nela.

Na dúvida entre os dois, **mantém**. Tirar um `export` que fazia falta é um
erro de compilação no PR seguinte; deixar um a mais não custa nada.

- [ ] **Passo 3: rodar o compilador**

```bash
npx tsc --noEmit && npm test
```

Esperado: limpo. Um erro aqui significa que o levantamento errou — o símbolo
era usado, e o `export` volta.

- [ ] **Passo 4: apagar as classes CSS órfãs**

Em `src/ui/theme.css`, remover as regras de `.nav-sala`, `.nav-sala-item`,
`.nav-sala-marca` (restos do botão "Mesa", substituído pelo `.trilho`) e de
`.home-linha`, `.home-ponto`.

**Depois de apagar, conferir chaves balanceadas** — o diário registra um CSS
quebrado por edição com expressão regular, e regex não sabe contar chave
aninhada:

```bash
node -e "const s=require('fs').readFileSync('src/ui/theme.css','utf8');const a=(s.match(/{/g)||[]).length,f=(s.match(/}/g)||[]).length;console.log('abre',a,'fecha',f,a===f?'OK':'DESBALANCEADO')"
```

- [ ] **Passo 5: reconferir que nenhuma delas era usada**

```bash
for c in nav-sala nav-sala-item nav-sala-marca home-linha home-ponto; do
  echo "$c: $(grep -rc "$c" --include=*.ts src | grep -v ':0' | wc -l) arquivos"
done
```

Esperado: `0 arquivos` para as cinco.

- [ ] **Passo 6: registrar `fecharUm` no roteiro**

Em `docs/roteiro.md`, na seção "Defeitos conhecidos", acrescentar:

```markdown
- **`Presenca.fecharUm` existe, tem 6 testes e ninguém a chama.** Quem sai da
  home para uma sala chama `presencaHome.encerrar()`, que fecha **todas** as
  salas de fundo — e fechar a última sala de um `appId` faz o Trystero destruir
  a piscina de 20 ofertas (`strategy.ts:698`). O `fecharUm` foi escrito
  justamente para fechar só uma e manter a âncora. Não foi ligado porque a
  troca ficou boa do jeito que está, e ligar às cegas já custou uma regressão
  antes. **É medição pendente, com duas abas**, e um candidato à descoberta
  intermitente.
```

- [ ] **Passo 7: rodar tudo**

```bash
npm run lint && npm test && npm run build
```

Esperado: `1179 + os da Tarefa 2`, build limpo. **Nenhum teste alterado.**

- [ ] **Passo 8: conferir no navegador**

`npm run dev`. A limpeza mexeu em CSS: abrir a home e a sala, conferir a coluna
da esquerda, o trilho e a faixa de grupos. Uma classe apagada por engano some
sem erro nenhum — só a tela acusa.

- [ ] **Passo 9: commit, push e PR**

```bash
git add src docs
git commit -m "Limpa o que sobrou: exports sem uso e CSS orfao"
git push -u origin limpa-o-que-sobrou
gh pr create --title "Limpa o que sobrou: exports sem uso e CSS órfão" --body "..."
gh pr view --json state
```

---

## Ao fim do bloco

Com as três tarefas na `main`, o projeto tem verificação antes do merge, quatro
defeitos a menos, e a mina de amigos desarmada. **Aí sim** começa o Bloco 2
(`ui/slot.ts`, `net/emissor.ts`, `ui/el.ts`), que ganha plano próprio — escrito
depois, para poder olhar o código como ele estiver então, e não como eu suponho
que estará.
