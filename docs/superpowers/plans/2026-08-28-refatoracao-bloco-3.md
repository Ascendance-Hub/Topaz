# Refatoração — Bloco 3: partir o `main.ts`

> **Para quem executa:** use `superpowers:executing-plans` para tocar tarefa a
> tarefa. Os passos usam caixinha (`- [ ]`) para marcação.

**Goal:** Tirar do `main.ts` as seis peças que têm responsabilidade própria, até
ele sobrar como fiação — monta, liga uma coisa na outra, e acaba.

**Architecture:** Seis PRs, cada um extraindo uma peça, **nenhum mudando
comportamento**. A ordem vai do mais seguro (duplicação literal) ao mais sutil
(a tranca da presença).

**Tech Stack:** TypeScript 5.6 strict, Vite 8, Vitest 4, happy-dom, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-08-27-refatoracao-design.md`

**Planos anteriores:** Bloco 1 (`2026-08-27`, PRs 64–66) e Bloco 2
(`2026-08-28`, PRs 67–68), os dois concluídos.

## Global Constraints

- **Linha de base:** `1202 testes / 69 arquivos`, `npm run lint`, `npm test` e
  `npm run build` limpos. `main.ts` com **1.217 linhas**.
- **Se um PR precisar alterar um teste existente para passar, o PR está
  errado.** Única exceção: caminho de import. **Nenhum PR deste bloco tem
  exceção declarada** — os seis são movimento puro.
- Partir sempre de `main` recém atualizada; nunca commitar nela. Conferir
  `gh pr view <n> --json state` depois de todo push.
- **Passada no navegador em toda mudança**, com duas abas e dispositivos
  sintéticos (`AudioContext` para microfone, `canvas.captureStream` para tela),
  injetados por `initScript` num **reload** — trocar só o hash não cria
  documento novo. **Matar o vite pelo PID** ao terminar.
- Não trocar o `Set<string>` de `observarGrupos` por contador (amigos precisa
  do *quem*).

## Sobre o `ui/el.ts`

O spec previa um helper tipado de DOM, e o Bloco 2 o adiou para cá, "onde nasce
junto com os arquivos extraídos".

**Ele provavelmente não vai nascer aqui também, e isso está certo.** As peças
deste bloco são *lógica*, não marcação: `identidade/acoes.ts` e
`sala/presenca-local.ts` não criam elemento nenhum, e `sala/desenho.ts` e
`sala/home.ts` só chamam os `renderizar*` que já existem. Os cinco
`createElement` do `main.ts` (`lateral`, `palco`, `coluna`, `conteudo`,
`convite`) ficam na montagem, e são duas linhas cada.

Se ao fim do bloco nenhum arquivo novo tiver marcação de verdade, o `el.ts`
**não entra** — e a varredura dos 28 componentes continua no cardápio, sem data.
Um helper que ninguém usa é pior que helper nenhum, e isso vale a terceira vez
que a gente olha para ele.

---

## Tarefa 1 — as duas duplicações literais (PR 7)

**Files:**
- Create: `src/identidade/acoes.ts`, `src/identidade/acoes.test.ts`
- Create: `src/ui/painel-rede.ts`, `src/ui/painel-rede.test.ts`
- Modify: `src/main.ts` (os dois blocos, na sala e na home)

**Interfaces:**
- Produces: `criarAcoesIdentidade(atual, adotar)` e `criarPainelDeRede(aoMudar)`.

É a extração mais segura do bloco: os dois pedaços já existem **duas vezes**,
com a mesma lógica, e a diferença entre as cópias é só onde o resultado é
guardado. Extrair não é adivinhar uma fronteira — é dar nome a uma que já está
desenhada em duplicata.

### 1a — `identidade/acoes.ts`

As duas cópias fazem o mesmo: marcar o segredo como guardado, entrar com um
segredo, e sair. Diferem só no que fazem com a identidade nova — na sala,
`identidade = nova; desenhar()`; na home, `adotar(nova)`.

- [ ] **Passo 1: escrever o teste que falha**

`src/identidade/acoes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { criarAcoesIdentidade } from './acoes'

vi.mock('./atual', () => ({
  entrarComSegredo: vi.fn(),
  sairDaIdentidade: vi.fn(),
  identidadeAtual: vi.fn(),
}))

import { entrarComSegredo, identidadeAtual, sairDaIdentidade } from './atual'

const identidadeFalsa = (selo: string) =>
  ({ par: {} as CryptoKeyPair, selo })

describe('criarAcoesIdentidade', () => {
  it('guardei: para de mostrar o segredo, sem apagá-lo de lugar nenhum', () => {
    // Ele nunca foi guardado: só existia na variável. "Guardei" é a pessoa
    // afirmando que copiou, e a única consequência é a tela parar de mostrar.
    const adotar = vi.fn()
    const acoes = criarAcoesIdentidade(
      () => ({ ...identidadeFalsa('AAA'), segredoNovo: 'segredo' }), adotar)

    acoes.guardei()

    expect(adotar).toHaveBeenCalledWith(
      expect.objectContaining({ selo: 'AAA', segredoNovo: undefined }))
  })

  it('guardei: sem identidade ainda, não faz nada', () => {
    const adotar = vi.fn()
    criarAcoesIdentidade(() => null, adotar).guardei()

    expect(adotar).not.toHaveBeenCalled()
  })

  it('entrarComSegredo: adota a identidade que voltou', async () => {
    const nova = identidadeFalsa('BBB')
    vi.mocked(entrarComSegredo).mockResolvedValue(nova)
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).entrarComSegredo('sem')
    await vi.waitFor(() => expect(adotar).toHaveBeenCalledWith(nova))
  })

  it('entrarComSegredo: um segredo que não abre nada não derruba a sala', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(entrarComSegredo).mockRejectedValue(new Error('torto'))
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).entrarComSegredo('torto')
    await vi.waitFor(() => expect(aviso).toHaveBeenCalled())

    expect(adotar).not.toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('sair: apaga a daqui e adota a nova que nasce no lugar', async () => {
    const nova = identidadeFalsa('CCC')
    vi.mocked(sairDaIdentidade).mockResolvedValue(undefined)
    vi.mocked(identidadeAtual).mockResolvedValue(nova)
    const adotar = vi.fn()

    criarAcoesIdentidade(() => null, adotar).sair()
    await vi.waitFor(() => expect(adotar).toHaveBeenCalledWith(nova))
  })
})
```

- [ ] **Passo 2: rodar e ver falhar** — `npx vitest run src/identidade/acoes.test.ts`

Esperado: FALHA com "Failed to resolve import ./acoes".

- [ ] **Passo 3: escrever `src/identidade/acoes.ts`**

```ts
import { entrarComSegredo, identidadeAtual, sairDaIdentidade } from './atual'
import type { Identidade } from './atual'

/**
 * O que a interface pode fazer com a identidade desta máquina.
 *
 * Existia **duas vezes** — uma na sala e uma na home —, com a mesma lógica e a
 * mesma mensagem de erro. A diferença entre as cópias era só onde a identidade
 * nova ia parar, e isso virou o parâmetro `adotar`.
 *
 * Nenhuma das três derruba a tela quando falha: sem identidade a sala continua
 * funcionando e a home continua servindo para entrar em sala — ninguém ganha
 * selo, e é só isso. Trocar um enfeite ausente por uma página em branco seria
 * o pior desfecho.
 */
export interface AcoesIdentidade {
  guardei(): void
  entrarComSegredo(segredo: string): void
  sair(): void
}

export function criarAcoesIdentidade(
  /** A identidade em uso agora, ou `null` enquanto o cofre não respondeu. */
  atual: () => Identidade | null,
  adotar: (nova: Identidade) => void,
): AcoesIdentidade {
  return {
    // A pessoa afirmou ter guardado: paramos de mostrar o segredo. Ele não é
    // apagado de lugar nenhum porque nunca foi guardado — só existia numa
    // variável, e a chave no cofre é não extraível de propósito.
    guardei: () => {
      const eu = atual()
      if (eu) adotar({ ...eu, segredoNovo: undefined })
    },
    entrarComSegredo: (segredo) => {
      entrarComSegredo(segredo).then(adotar).catch((erro: unknown) => {
        console.warn('não deu para entrar com esse ID', erro)
      })
    },
    sair: () => {
      sairDaIdentidade()
        .then(() => identidadeAtual())
        .then(adotar)
        .catch((erro: unknown) => console.warn('não deu para sair', erro))
    },
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: usar nos dois lugares do `main.ts`**

Na sala, dentro de `acoesConfiguracoes`:

```ts
    identidade: criarAcoesIdentidade(() => identidade, (nova) => {
      identidade = nova
      desenhar()
    }),
```

Na home, no lugar do `const acoesIdentidade = { ... }`:

```ts
    const acoesIdentidade = criarAcoesIdentidade(() => identidade, adotar)
```

### 1b — `ui/painel-rede.ts`

O teste de rede aparece na sala e na home. As duas cópias guardam `analise` e
`rodando`, e chamam `coletarCandidatos` do mesmo jeito. A única diferença real
é que **a home não conta relays** — fora de uma sala não há socket aberto, e a
contagem sairia "0 de 20", que lê como falha catastrófica para quem acabou de
abrir a página.

- [ ] **Passo 6: escrever o teste que falha**

`src/ui/painel-rede.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'

vi.mock('../net/coletar-candidatos', () => ({ coletarCandidatos: vi.fn() }))
vi.mock('../net/transport', () => ({
  relaysDetalhados: vi.fn(() => [
    { url: 'wss://a.test', nome: 'a.test', conectado: true },
  ]),
}))

import { coletarCandidatos } from '../net/coletar-candidatos'
import { criarPainelDeRede } from './painel-rede'

describe('criarPainelDeRede', () => {
  it('na home NÃO lista servidores: fora da sala não há socket aberto', () => {
    const painel = criarPainelDeRede(() => {})

    const el = painel.desenhar(false)

    // "0 de 20" lê como falha catastrófica para quem acabou de abrir a página.
    expect(el.textContent).not.toContain('de 20')
    expect(el.textContent).not.toContain('a.test')
  })

  it('na sala lista, porque lá o número quer dizer alguma coisa', () => {
    const painel = criarPainelDeRede(() => {})

    const el = painel.desenhar(true)

    expect(el.textContent).toContain('a.test')
  })

  it('testar avisa quem desenha, no começo e no fim', async () => {
    let resolver: (v: unknown) => void = () => {}
    vi.mocked(coletarCandidatos).mockReturnValue(
      new Promise((r) => { resolver = r }) as ReturnType<typeof coletarCandidatos>)
    const avisou = vi.fn()
    const painel = criarPainelDeRede(avisou)

    painel.testar()
    expect(avisou).toHaveBeenCalledTimes(1)

    resolver({ candidatos: [], erros: [] })
    await vi.waitFor(() => expect(avisou).toHaveBeenCalledTimes(2))
  })

  it('clicar duas vezes não dispara dois testes', () => {
    vi.mocked(coletarCandidatos).mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof coletarCandidatos>)
    const painel = criarPainelDeRede(() => {})

    painel.testar()
    painel.testar()

    expect(vi.mocked(coletarCandidatos)).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Passo 7: rodar e ver falhar**

- [ ] **Passo 8: escrever `src/ui/painel-rede.ts`**

```ts
import { coletarCandidatos } from '../net/coletar-candidatos'
import { analisarCandidatos } from '../net/diagnostico-rede'
import type { Analise } from '../net/diagnostico-rede'
import { relaysDetalhados } from '../net/transport'
import { renderizarTesteRede } from './components/teste-rede'

/**
 * O teste de rede, com o estado dele.
 *
 * Aparece em dois lugares — na home, para quem recebeu um link e não consegue
 * entrar, e dentro da sala, para quem está sozinho. As duas cópias guardavam
 * `analise` e `rodando` e chamavam `coletarCandidatos` igual.
 *
 * `comRelays` é a única diferença de verdade: **a home não conta servidores**.
 * Lá ninguém entrou em sala ainda, nenhum socket está aberto, e a contagem
 * sairia "0 de 20" — que lê como falha catastrófica para quem acabou de abrir
 * a página. O teste de NAT em si funciona sozinho: ele fala com os servidores
 * STUN direto.
 *
 * `detalhesAbertos` sobrevive ao redesenho porque mora aqui: dentro da sala o
 * painel é reconstruído a cada clique na call, e um `<details>` que fecha
 * sozinho enquanto a pessoa lê é a mesma família de bug do chat que perdia o
 * texto.
 */
export function criarPainelDeRede(aoMudar: () => void) {
  let analise: Analise | null = null
  let rodando = false
  let detalhesAbertos: boolean | undefined

  const estadoDetalhes = {
    get aberto() { return detalhesAbertos },
    aoAlternar: (aberto: boolean) => { detalhesAbertos = aberto },
  }

  function testar(): void {
    if (rodando) return
    rodando = true
    aoMudar()
    void coletarCandidatos().then(({ candidatos, erros }) => {
      analise = analisarCandidatos(candidatos, erros)
      rodando = false
      aoMudar()
    })
  }

  return {
    testar,
    desenhar: (comRelays: boolean): HTMLElement => (comRelays
      ? renderizarTesteRede(analise, rodando, testar, relaysDetalhados(), estadoDetalhes)
      : renderizarTesteRede(analise, rodando, testar)),
  }
}
```

- [ ] **Passo 9: rodar e ver passar**

- [ ] **Passo 10: usar nos dois lugares do `main.ts`**

Na sala, apagar `analiseRede`, `detalhesRede`, `estadoDetalhes`, `testandoRede`
e `testarRede`, e pôr `const painelRede = criarPainelDeRede(desenhar)`. As duas
chamadas de `renderizarTesteRede(...)` viram `painelRede.desenhar(true)`.

Na home, apagar `analise`, `rodando` e `testar`, e pôr
`const painelRede = criarPainelDeRede(desenharHome)`. A chamada vira
`painelRede.desenhar(false)`.

**Conferir que os imports que ficaram órfãos saem** — `coletarCandidatos`,
`analisarCandidatos`, `Analise`, `renderizarTesteRede`. O `noUnusedLocals` e o
linter pegam, mas é o tipo de coisa que dá para deixar passar num diff grande.

- [ ] **Passo 11: a suíte inteira**

```bash
npm run lint && npm test && npm run build
```

Esperado: **1202 + os novos**, nenhum dos antigos alterado, e `main.ts` uns 70
linhas menor.

- [ ] **Passo 12: navegador**

Duas abas. O que olhar, porque é o que este PR mexe:

1. **Na home**, "Testar minha rede" roda e mostra o resultado — e **não** mostra
   lista de servidores.
2. **Na sala sozinho**, o teste aparece, roda, e **mostra** a lista de
   servidores com quais estão conectados.
3. Abrir o `<details>` dos detalhes, entrar na call e sair: ele continua aberto.
4. Em **Ajustes**, "Já guardei" some com o segredo; "Sair desta máquina" gera
   uma identidade nova com selo diferente.

- [ ] **Passo 13: commit, push, PR, conferir estado**

---

## Tarefas 2 a 6 — as peças da sala

Estas cinco só ganham passo a passo detalhado **quando chegar a vez de cada
uma**, e de propósito: o `main.ts` muda a cada PR, e um plano escrito hoje para
a Tarefa 6 descreveria um arquivo que não vai mais existir. O que fica agora é
o contrato de cada uma.

### Tarefa 2 — `sala/pessoas.ts` (PR 8) ⭐ amigos

Leva `fotos`, `selos`, `falantes`, `apelidoDe`, `fonteDeParticipantes` e
`invalidarRostos`. É o registro de **quem é quem** na sala, e é a peça que a
feature de amigos vai usar para dizer *quem* está online em vez de *quantos*.

Cuidado registrado: `invalidarRostos` existe porque as assinaturas de desenho
comparam **quem está onde**, não como cada um está desenhado — incluir a foto
obrigaria a concatenar dezenas de milhares de caracteres a cada mudança de quem
fala. Isso não pode virar "simplificação" na mudança.

### Tarefa 3 — `sala/presenca-local.ts` (PR 9) ⭐ amigos · **o mais perigoso**

Leva `anuncio`, `presencaLiberada`, `desmontado` e
`liberarPresencaSeAConexaoDeuCerto`.

**É o PR mais arriscado do ciclo inteiro.** A tranca existe porque a falta dela
já produziu anúncio órfão em uso real — sair de um grupo deixava ele marcando
"1 pessoa online" para sempre, para todo mundo. O teste
`main.test.ts` › "todo anúncio criado é fechado ao sair da sala" guarda
exatamente essa invariante, e **não pode ser alterado**.

Regra específica: `desmontado = true`, e **nunca** `presencaLiberada = false`.
Baixar a tranca a re-armaria, e um desenho atrasado abriria um anúncio órfão.

### Tarefa 4 — `sala/sincronizacao.ts` (PR 10)

Leva `sincronizarMidia`, `sincronizarMedidorDeVoz` e o tique de 500 ms.

Mexe no caminho de mídia, que é onde moraram quase todos os bugs do projeto. O
que torna isso seguro é a propriedade que já existe: a sincronização é
**idempotente por construção** — ela descreve o que deveria estar publicado
agora, não o que mudou. Mover código idempotente é mais seguro que mover código
que detecta borda.

### Tarefa 5 — `sala/desenho.ts` (PR 11)

Leva o roteador de telas de `desenhar()` — o `if (tela === 'mesa')`, o de
`jogos`, o de `config` com a assinatura que impede o `<input type="file">` de
ser recriado, e o miolo da call.

### Tarefa 6 — `sala/home.ts` (PR 12) ⭐ amigos

Tira `iniciarApp` do `main.ts`. É onde a faixa de amigos vai morar.

---

## Ao fim do bloco

`main.ts` sobra como fiação: monta as peças, liga uma na outra, e acaba.
Estimativa de 200 a 300 linhas, contra as 1.217 de hoje.

E aí o ciclo de refatoração acaba. O que sobra é o cardápio do spec (unificar
`sala-de-fundo` com `salas.ts` — junto com amigos —, tipos mais estritos na
fronteira de rede, a varredura de UI e acelerar a suíte), e a próxima feature.
