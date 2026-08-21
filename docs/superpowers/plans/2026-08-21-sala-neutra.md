# Sala neutra — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam `- [ ]` para acompanhamento.

**Goal:** Transformar a sala do Topaz num espaço neutro onde a mesa de blackjack é uma das coisas que se abre, sem alterar uma linha das regras do jogo.

**Architecture:** A conexão Trystero se separa da interface `Transporte`, para que outros módulos (a call, no plano seguinte) possam usar a mesma conexão. O `main.ts` deixa de montar uma partida e passa a montar uma sala, com uma navegação entre "Sala" e "Mesa". Abrir a mesa é escolha local de visualização, não estado compartilhado.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, happy-dom, Trystero (estratégia nostr).

**Spec:** `docs/superpowers/specs/2026-08-21-sala-e-call-design.md`

## Global Constraints

- Node 20.19+ ou 22.12+ (piso do Vite 8). CI fixa a versão em `.github/workflows/deploy.yml`.
- `src/game/` não importa nada de `src/net/` nem de `src/ui/`, e não menciona `document`, `window` ou `localStorage`. Há teste que garante (`src/game/isolamento.test.ts`).
- Comentários e identificadores em português, como todo o repositório.
- Texto de interface entra por `textContent`, nunca `innerHTML`.
- A suíte inteira (`npm test`) precisa passar ao fim de **cada** tarefa. Ao começar, são 338 testes.
- `npm run build` roda `tsc --noEmit` antes do Vite: erro de tipo quebra o build.

## Desvio deliberado do spec

A §13 do spec põe "confirmar se dá para forçar H.264 pelo Trystero" como passo 1. **Esse passo foi movido para o plano da call**, porque é uma investigação manual em navegador que não bloqueia nada aqui — a reestruturação não depende de codec. O risco continua registrado e continua sendo a primeira coisa do plano seguinte.

---

### Task 1: Partir o transporte em conexão e interface

Hoje `criarTransporteTrystero` cria a conexão Trystero **e** a embrulha na interface `Transporte`. A call precisará da mesma conexão para mandar mídia. Separar também torna `criarTransporte` testável pela primeira vez, com uma sala falsa.

**Files:**
- Modify: `src/net/transport.ts`
- Create: `src/net/transport.test.ts`
- Modify: `src/main.ts:29`
- Modify: `src/main.test.ts:8-10` (o `vi.mock`), `src/main.test.ts:12` (o import) e `src/main.test.ts:41,80,107,163` (os quatro `mockImplementation`)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `export type SalaTrystero = ReturnType<typeof joinRoom>`
  - `export function criarSalaTrystero(codigoSala: string): SalaTrystero`
  - `export function criarTransporte(sala: SalaTrystero): Transporte`
  - `criarTransporteTrystero` deixa de existir.
  - A interface `Transporte` **não muda**.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/net/transport.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { criarTransporte } from './transport'
import type { SalaTrystero } from './transport'
import type { Acao } from '../game/types'

type AcaoFalsa = {
  send: ReturnType<typeof vi.fn>
  onMessage: ((dados: unknown, contexto: { peerId: string }) => void) | null
}

/**
 * Uma sala do Trystero de mentira: guarda os canais criados por `makeAction`
 * para que o teste possa disparar mensagens de fora, como o relay faria.
 */
function criarSalaFalsa() {
  const canais = new Map<string, AcaoFalsa>()
  const sala = {
    makeAction: (nome: string) => {
      const canal: AcaoFalsa = { send: vi.fn(), onMessage: null }
      canais.set(nome, canal)
      return canal
    },
    getPeers: () => ({ p2: {}, p3: {} }),
    leave: vi.fn(),
    onPeerJoin: null,
    onPeerLeave: null,
  }
  return { sala: sala as unknown as SalaTrystero, canais, bruta: sala }
}

describe('criarTransporte', () => {
  it('envia a ação pelo canal "acao" da sala que recebeu', () => {
    const { sala, canais } = criarSalaFalsa()
    const transporte = criarTransporte(sala)

    transporte.enviarAcao({ tipo: 'levantar' })

    expect(canais.get('acao')!.send).toHaveBeenCalledWith({ tipo: 'levantar' })
  })

  it('entrega ao ouvinte o que chega pelo canal, com o peerId do remetente', () => {
    const { sala, canais } = criarSalaFalsa()
    const transporte = criarTransporte(sala)
    const recebido = vi.fn()
    transporte.aoReceberAcao(recebido)

    const acao: Acao = { tipo: 'entrar', apelido: 'Alex' }
    canais.get('acao')!.onMessage!(acao, { peerId: 'p1' })

    expect(recebido).toHaveBeenCalledWith(acao, 'p1')
  })

  it('lista os peers a partir do getPeers da sala', () => {
    const { sala } = criarSalaFalsa()

    expect(criarTransporte(sala).peers().sort()).toEqual(['p2', 'p3'])
  })

  it('sair() encerra a sala que recebeu', () => {
    const { sala, bruta } = criarSalaFalsa()

    criarTransporte(sala).sair()

    expect(bruta.leave).toHaveBeenCalled()
  })

  it('mensagem de chat sai pelo canal "chat", separado do canal do jogo', () => {
    const { sala, canais } = criarSalaFalsa()

    criarTransporte(sala).enviarMensagem('boa mão')

    expect(canais.get('chat')!.send).toHaveBeenCalledWith('boa mão')
    expect(canais.get('acao')!.send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/net/transport.test.ts`
Expected: FAIL — `criarTransporte is not a function` (o módulo só exporta `criarTransporteTrystero`).

- [ ] **Step 3: Partir a função**

Em `src/net/transport.ts`, trocar a assinatura de `criarTransporteTrystero` por duas funções. O corpo interno (canais, listas de callbacks, o objeto devolvido) fica **exatamente como está** — só sai o `joinRoom` de dentro:

```ts
/** A conexão crua do Trystero. Dados e mídia viajam por ela. */
export type SalaTrystero = ReturnType<typeof joinRoom>

/**
 * Abre a conexão. Fica separada de `criarTransporte` porque a mesma conexão
 * carrega dados do jogo e, no módulo de call, mídia — e porque separar torna
 * `criarTransporte` testável com uma sala falsa, sem navegador.
 */
export function criarSalaTrystero(codigoSala: string): SalaTrystero {
  return joinRoom({ appId: APP_ID }, codigoSala)
}

export function criarTransporte(sala: SalaTrystero): Transporte {
  const acaoAction = sala.makeAction<Acao>('acao')
  const estadoAction = sala.makeAction<EstadoJogo>('estado')
  const chatAction = sala.makeAction<string>('chat')
  // ...resto do corpo atual, sem alteração...
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/net/transport.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Ajustar o `main.ts`**

Em `src/main.ts`, trocar o import e a linha 29:

```ts
import { criarSalaTrystero, criarTransporte } from './net/transport'
```

```ts
  const transporte = criarTransporte(criarSalaTrystero(codigo))
```

- [ ] **Step 6: Ajustar o mock do `main.test.ts`**

O mock precisa passar a oferecer as duas funções. Trocar o bloco `vi.mock` do topo:

```ts
vi.mock('./net/transport', () => ({
  criarSalaTrystero: vi.fn(),
  criarTransporte: vi.fn(),
}))
```

Trocar o import correspondente:

```ts
import { criarSalaTrystero, criarTransporte } from './net/transport'
```

E, nos **quatro** pontos que hoje fazem `vi.mocked(criarTransporteTrystero).mockImplementation(...)` — linhas 41, 80, 107 e 163 —, trocar cada um por:

```ts
vi.mocked(criarSalaTrystero).mockReturnValue(undefined as never)
vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))
```

A sala falsa pode ser `undefined` porque, com `criarTransporte` também mockado, ninguém a usa.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, 343 testes (338 + 5 novos). Nenhum falhando.

- [ ] **Step 8: Conferir tipos e build**

Run: `npm run build`
Expected: sem erro de `tsc`, build concluído.

- [ ] **Step 9: Commit**

```bash
git add src/net/transport.ts src/net/transport.test.ts src/main.ts src/main.test.ts
git commit -m "Separa a conexao do transporte que a embrulha

A call vai precisar da mesma conexao Trystero para mandar midia, e hoje
`criarTransporteTrystero` abre a conexao e a embrulha no mesmo passo. Separar
em `criarSalaTrystero` e `criarTransporte` deixa a conexao disponivel para
outros modulos sem abrir uma segunda.

De quebra, `criarTransporte` fica testavel pela primeira vez: recebendo uma
sala falsa, da para verificar que cada canal vai para o lugar certo — o que
antes exigia navegador. A interface \`Transporte\` nao muda.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Renomear `src/ui/sala.ts` para `src/ui/codigo.ts`

O arquivo guarda utilidades de *código* de sala (gerar, validar, montar link) e vai passar a conviver com um componente de sala de verdade. Dois "sala" com sentidos diferentes confunde quem lê.

**Files:**
- Rename: `src/ui/sala.ts` → `src/ui/codigo.ts`
- Rename: `src/ui/sala.test.ts` → `src/ui/codigo.test.ts`
- Modify: `src/ui/components/barra-sala.ts:1`
- Modify: `src/ui/components/lobby.ts:3`

**Interfaces:**
- Consumes: nada.
- Produces: os mesmos símbolos de hoje (`gerarCodigo`, `ehCodigoValido`, `montarLinkSala`, `codigoDaUrl`, `TAMANHO_CODIGO`, `ALFABETO`, `PADRAO_HASH_SALA`), agora em `src/ui/codigo.ts`.

- [ ] **Step 1: Renomear pelos comandos do git**

```bash
git mv src/ui/sala.ts src/ui/codigo.ts
git mv src/ui/sala.test.ts src/ui/codigo.test.ts
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `barra-sala.ts` e `lobby.ts` importam `'../sala'`, que não existe mais.

- [ ] **Step 3: Corrigir os três imports**

Em `src/ui/components/barra-sala.ts` linha 1:

```ts
import { montarLinkSala } from '../codigo'
```

Em `src/ui/components/lobby.ts`, o import que termina na linha 3:

```ts
} from '../codigo'
```

Em `src/ui/codigo.test.ts`, o import do próprio módulo:

```ts
} from './codigo'
```

- [ ] **Step 4: Confirmar que não sobrou referência**

Run: `grep -rn "ui/sala'\|from '\.\./sala'\|from '\./sala'" src/`
Expected: nenhuma saída.

- [ ] **Step 5: Rodar a suíte e o build**

Run: `npm test && npm run build`
Expected: PASS, 343 testes. Build sem erro.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Renomeia ui/sala para ui/codigo

O arquivo guarda utilidades de codigo de sala — gerar, validar, montar link —
e vai passar a conviver com um componente de sala de verdade. Manter os dois
chamados de \"sala\" obrigaria quem le a abrir o arquivo para saber de qual
sala se fala.

Rename puro: nenhum simbolo muda de nome ou de comportamento.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Componentes da sala — navegação e sala parada

Duas peças pequenas: a navegação entre "Sala" e "Mesa", e a tela da sala sem mesa aberta, que lista quem está.

A lista sai de `estado.jogadores`, que já existe e já é sincronizada — `Sessao.entrar` coloca quem chega ali mesmo sem sentar. Não há presença nova a inventar.

**Files:**
- Create: `src/ui/components/sala.ts`
- Test: `src/ui/components/sala.test.ts`
- Modify: `src/ui/theme.css` (estilos, ao final do arquivo)

**Interfaces:**
- Consumes: `EstadoJogo` de `src/game/types.ts`.
- Produces:
  - `export function renderizarNavSala(mesaAberta: boolean, aoAlternar: (aberta: boolean) => void): HTMLElement`
  - `export function renderizarSalaParada(estado: EstadoJogo, meuId: string): HTMLElement`
  - `export const AVISO_SOZINHO = 'Você é o único aqui. Mande o link para alguém.'`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/ui/components/sala.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarNavSala, renderizarSalaParada, AVISO_SOZINHO } from './sala'
import type { EstadoJogo, Jogador } from '../../game/types'

function jogador(peerId: string, apelido: string): Jogador {
  return {
    peerId, apelido, cadeira: null, fichas: 1000, maos: [], maoAtiva: 0,
    seguro: 0, rodadasInativo: 0, desconectadoEm: null, decidiuSeguro: false,
    eliminadoEm: null,
  }
}

function estadoCom(...jogadores: Jogador[]): EstadoJogo {
  return {
    fase: 'aguardando', jogadores, vezDe: null, prazoTurno: null,
    maoDealer: [], dealerTemOculta: false, cartasRestantes: 312,
    hostAtual: 'eu', rodada: 0, proximoIdMao: 1, vencedor: null, naPartida: [],
  }
}

describe('renderizarNavSala', () => {
  it('marca a sala como atual quando a mesa está fechada', () => {
    const nav = renderizarNavSala(false, vi.fn())

    expect(nav.querySelector('[data-nav="sala"]')!.getAttribute('aria-current')).toBe('page')
    expect(nav.querySelector('[data-nav="mesa"]')!.getAttribute('aria-current')).toBeNull()
  })

  it('marca a mesa como atual quando ela está aberta', () => {
    const nav = renderizarNavSala(true, vi.fn())

    expect(nav.querySelector('[data-nav="mesa"]')!.getAttribute('aria-current')).toBe('page')
  })

  it('clicar em Mesa pede para abrir', () => {
    const alternar = vi.fn()
    const nav = renderizarNavSala(false, alternar)

    nav.querySelector<HTMLButtonElement>('[data-nav="mesa"]')!.click()

    expect(alternar).toHaveBeenCalledWith(true)
  })

  it('clicar em Sala pede para fechar a mesa', () => {
    const alternar = vi.fn()
    const nav = renderizarNavSala(true, alternar)

    nav.querySelector<HTMLButtonElement>('[data-nav="sala"]')!.click()

    expect(alternar).toHaveBeenCalledWith(false)
  })
})

describe('renderizarSalaParada', () => {
  it('lista quem está na sala', () => {
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), jogador('p2', 'Bruno')), 'eu')

    const nomes = [...tela.querySelectorAll('.sala-quem')].map((n) => n.textContent)
    expect(nomes).toEqual(['Alex', 'Bruno'])
  })

  it('avisa quando você está sozinho, em vez de mostrar uma lista de um', () => {
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex')), 'eu')

    expect(tela.textContent).toContain(AVISO_SOZINHO)
  })

  it('não avisa que está sozinho quando há mais gente', () => {
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), jogador('p2', 'Bruno')), 'eu')

    expect(tela.textContent).not.toContain(AVISO_SOZINHO)
  })

  it('não esconde quem está desconectado, mas marca', () => {
    const caido = { ...jogador('p2', 'Bruno'), desconectadoEm: 1000 }
    const tela = renderizarSalaParada(estadoCom(jogador('eu', 'Alex'), caido), 'eu')

    const marcado = tela.querySelector('.sala-quem[data-caiu="1"]')
    expect(marcado!.textContent).toBe('Bruno')
  })

  it('nunca interpreta o apelido como HTML — ele vem de outro navegador', () => {
    const malicioso = '<img src=x onerror="window.__xss = true">'
    const tela = renderizarSalaParada(estadoCom(jogador('p2', malicioso)), 'eu')

    expect(tela.querySelector('img')).toBeNull()
    expect(tela.textContent).toContain(malicioso)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/components/sala.test.ts`
Expected: FAIL — não consegue resolver `./sala`.

- [ ] **Step 3: Implementar**

Criar `src/ui/components/sala.ts`:

```ts
import type { EstadoJogo } from '../../game/types'

export const AVISO_SOZINHO = 'Você é o único aqui. Mande o link para alguém.'

function botaoNav(chave: string, rotulo: string, atual: boolean, aoClicar: () => void): HTMLElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'nav-sala-item'
  botao.dataset['nav'] = chave
  botao.textContent = rotulo
  // `aria-current` em vez de só uma classe: é o que leitor de tela usa para
  // dizer onde a pessoa está, e é o que o teste verifica.
  if (atual) botao.setAttribute('aria-current', 'page')
  botao.onclick = aoClicar
  return botao
}

/**
 * Alterna entre a sala e a mesa. Abrir a mesa é escolha local de
 * visualização, não estado compartilhado: a mesa está sempre disponível, e
 * quem decide se ela ocupa a tela é cada um. Sentar, esse sim, é
 * compartilhado — e já era antes desta tela existir.
 */
export function renderizarNavSala(
  mesaAberta: boolean, aoAlternar: (aberta: boolean) => void,
): HTMLElement {
  const nav = document.createElement('nav')
  nav.className = 'nav-sala'
  nav.append(
    botaoNav('sala', 'Sala', !mesaAberta, () => aoAlternar(false)),
    botaoNav('mesa', 'Mesa', mesaAberta, () => aoAlternar(true)),
  )
  return nav
}

/**
 * A sala sem a mesa aberta: quem está aqui. A lista sai de
 * `estado.jogadores`, que já recebe quem entra mesmo sem sentar — presença
 * não precisou ser inventada para esta tela.
 */
export function renderizarSalaParada(estado: EstadoJogo, meuId: string): HTMLElement {
  const tela = document.createElement('div')
  tela.className = 'sala-parada'

  const titulo = document.createElement('h2')
  titulo.className = 'sala-titulo'
  titulo.textContent = 'Na sala'
  tela.append(titulo)

  const lista = document.createElement('div')
  lista.className = 'sala-lista'
  for (const jogador of estado.jogadores) {
    const quem = document.createElement('span')
    quem.className = 'sala-quem'
    // `textContent`: o apelido vem de outro navegador, e ninguém aqui
    // escolheu executar o que o outro digitou.
    quem.textContent = jogador.apelido
    if (jogador.peerId === meuId) quem.dataset['eu'] = '1'
    if (jogador.desconectadoEm !== null) quem.dataset['caiu'] = '1'
    lista.append(quem)
  }
  tela.append(lista)

  if (estado.jogadores.length <= 1) {
    const aviso = document.createElement('p')
    aviso.className = 'sala-aviso'
    aviso.textContent = AVISO_SOZINHO
    tela.append(aviso)
  }

  return tela
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/ui/components/sala.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Estilos**

Acrescentar ao final de `src/ui/theme.css`:

```css
.nav-sala {
  max-width: 940px;
  margin: 0 auto 14px;
  display: flex;
  gap: 8px;
}
.nav-sala-item {
  padding: 8px 18px; border-radius: 8px;
  background: transparent; color: var(--texto-fraco);
  border: 1px solid var(--carvao-500);
  font-family: var(--serif); font-size: 13px; cursor: pointer;
}
.nav-sala-item[aria-current="page"] {
  color: var(--topazio-500);
  border-color: var(--topazio-600);
  background: rgba(201, 162, 39, 0.1);
}

.sala-parada { max-width: 940px; margin: 0 auto; text-align: center; }
.sala-titulo { color: var(--topazio-500); font-size: 18px; margin: 18px 0 14px; }
.sala-lista { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.sala-quem {
  color: var(--texto); font-size: 15px;
  padding: 6px 12px; border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(201, 162, 39, 0.22);
}
.sala-quem[data-eu="1"] { border-color: var(--topazio-600); }
.sala-quem[data-caiu="1"] { opacity: 0.5; font-style: italic; }
.sala-aviso { color: var(--texto-fraco); font-size: 13px; margin-top: 16px; }
```

- [ ] **Step 6: Rodar a suíte e o build**

Run: `npm test && npm run build`
Expected: PASS, 352 testes (343 + 9). Build sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/sala.ts src/ui/components/sala.test.ts src/ui/theme.css
git commit -m "Da a sala uma tela propria, separada da mesa

Ate agora entrar numa sala era sentar numa mesa de blackjack: nao existia
\"estar junto\" sem estar jogando. A tela da sala lista quem esta presente e a
navegacao alterna entre a sala e a mesa.

A lista nao inventa presenca nenhuma: sai de \`estado.jogadores\`, que ja
recebe quem entra mesmo sem sentar, e que ja e sincronizado e testado. Quem
caiu aparece marcado em vez de sumir, porque a cadeira dele fica reservada
durante a janela de reconexao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: O `main.ts` monta uma sala em vez de uma partida

Última peça: a composição. A mesa passa a ser um dos conteúdos do palco, e o chat continua sendo irmão persistente.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/main.test.ts` (testes novos ao final)
- Modify: `README.md`
- Modify: `docs/verificacao-manual.md`

**Interfaces:**
- Consumes: `renderizarNavSala`, `renderizarSalaParada` da Task 3; `criarSalaTrystero`, `criarTransporte` da Task 1.
- Produces: `export function entrarNaSala(app: HTMLElement, apelido: string, codigo: string): void` — substitui `iniciarPartida`, mesma assinatura.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `src/main.test.ts`:

```ts
describe('entrarNaSala — a sala é o espaço, a mesa é uma escolha', () => {
  function salaConectada() {
    const rede = criarRedeFalsa({ conexaoDiferida: true })
    const outraAba = new Sessao(rede.conectar('pa'), () => rngSemente(1))
    outraAba.entrar('Alex')

    vi.mocked(criarSalaTrystero).mockReturnValue(undefined as never)
    vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

    const app = document.createElement('div')
    entrarNaSala(app, 'Bruno', 'CODIGO01')

    rede.bombear()
    vi.advanceTimersByTime(MS_DESCOBERTA + 600)
    outraAba.tique(Date.now())
    return { app, outraAba }
  }

  function clicar(app: HTMLElement, alvo: string): void {
    app.querySelector<HTMLButtonElement>(`[data-nav="${alvo}"]`)!.click()
  }

  it('ao entrar, mostra a sala com quem está — não a mesa', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaConectada()

      expect(app.querySelector('.sala-parada')).not.toBeNull()
      expect(app.querySelector('.mesa')).toBeNull()
      expect(app.textContent).toContain('Alex')
    } finally {
      vi.useRealTimers()
    }
  })

  it('abrir a mesa troca o palco, e voltar devolve a sala', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaConectada()

      clicar(app, 'mesa')
      expect(app.querySelector('.mesa')).not.toBeNull()
      expect(app.querySelector('.sala-parada')).toBeNull()

      clicar(app, 'sala')
      expect(app.querySelector('.mesa')).toBeNull()
      expect(app.querySelector('.sala-parada')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('o chat sobrevive a alternar entre sala e mesa, com o que estava digitado', () => {
    vi.useFakeTimers()
    try {
      const { app } = salaConectada()
      const campo = app.querySelector<HTMLInputElement>('.chat-campo')!
      campo.value = 'escrevendo ainda'

      clicar(app, 'mesa')
      clicar(app, 'sala')

      expect(app.querySelectorAll('.chat')).toHaveLength(1)
      expect(app.querySelector<HTMLInputElement>('.chat-campo')!.value)
        .toBe('escrevendo ainda')
    } finally {
      vi.useRealTimers()
    }
  })

  it('com a mesa aberta, um broadcast do host não devolve o palco para a sala', () => {
    vi.useFakeTimers()
    try {
      const { app, outraAba } = salaConectada()
      clicar(app, 'mesa')

      // Cada despacho do host publica um snapshot, e cada snapshot redesenha.
      // Se `mesaAberta` morasse no estado do jogo em vez de ser escolha local,
      // era aqui que a tela pularia de volta sozinha.
      for (let i = 0; i < 3; i++) outraAba.entrar('Alex')

      expect(app.querySelector('.mesa')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
```

E, no topo do arquivo, acrescentar `entrarNaSala` ao import de `./main`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main.test.ts`
Expected: FAIL — `entrarNaSala is not a function`.

- [ ] **Step 3: Implementar a composição**

Em `src/main.ts`, renomear `iniciarPartida` para `entrarNaSala` e trocar o corpo do `desenhar` mais a montagem. O bloco do chat e o `apelidoDe` ficam **exatamente como estão**:

```ts
import { renderizarNavSala, renderizarSalaParada } from './ui/components/sala'
```

```ts
export function entrarNaSala(app: HTMLElement, apelido: string, codigo: string): void {
  const transporte = criarTransporte(criarSalaTrystero(codigo))
  const sessao = new Sessao(transporte, rngDaSessao)

  // ...apelidoDe e o bloco do chat, sem alteração...

  // Escolha local de visualização, de propósito fora do `EstadoJogo`: se
  // morasse lá, abrir a mesa arrastaria todo mundo junto, e cada broadcast do
  // host devolveria a tela de quem tivesse voltado para a sala.
  let mesaAberta = false

  let barra = renderizarBarraSala(codigo, sessao.souHost())
  let nav = renderizarNavSala(mesaAberta, alternarMesa)
  const palco = document.createElement('div')
  app.replaceChildren(barra, nav, palco, chat.raiz)

  function alternarMesa(aberta: boolean): void {
    mesaAberta = aberta
    desenhar()
  }

  function desenhar(): void {
    const novaBarra = renderizarBarraSala(codigo, sessao.souHost())
    barra.replaceWith(novaBarra)
    barra = novaBarra

    const novaNav = renderizarNavSala(mesaAberta, alternarMesa)
    nav.replaceWith(novaNav)
    nav = novaNav

    // Enquanto ninguém é anfitrião a mesa ainda não existe: mostrar a mesa
    // vazia com "Aguardando jogadores…" confundiria "ninguém entrou ainda"
    // com "a conexão falhou" (spec §14).
    const status = sessao.statusConexao()
    if (status !== 'conectado') {
      palco.replaceChildren(renderizarConexao(status))
      return
    }
    if (mesaAberta) {
      renderizar(palco, sessao.estado(), sessao.meuId(), (acao) => sessao.despachar(acao))
    } else {
      palco.replaceChildren(renderizarSalaParada(sessao.estado(), sessao.meuId()))
    }
  }

  // ...sessao.aoMudar(desenhar), sessao.entrar(apelido), desenhar(),
  //    setInterval e beforeunload, sem alteração...
}
```

Atualizar também a chamada dentro de `iniciarApp`:

```ts
    app.replaceChildren(renderizarLobby((apelido, codigo) => entrarNaSala(app, apelido, codigo)))
```

> **Atenção ao `renderizar`:** ele guarda a contagem de cartas no `dataset` do palco para decidir animação. Ao voltar da sala para a mesa, o palco foi trocado por `replaceChildren` mas o **mesmo** elemento `palco` continua ali, então o dataset sobrevive e nenhuma carta voa à toa. É de propósito que `palco` não é recriado.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main.test.ts`
Expected: PASS, incluindo os 4 testes novos.

- [ ] **Step 5: Rodar a suíte inteira e o build**

Run: `npm test && npm run build`
Expected: PASS, 356 testes (352 + 4). Build sem erro.

- [ ] **Step 6: Atualizar o README**

Em `README.md`, na seção do Blackjack, trocar o parágrafo que começa com "A partida começa quando o anfitrião aperta" para refletir que a sala vem antes da mesa:

```markdown
Entrar numa sala não é sentar numa mesa: a sala mostra quem está presente, e a
mesa é uma das coisas que se abre lá dentro, pela navegação no topo. A partida
começa quando o anfitrião aperta "Iniciar partida" — sentar não inicia nada
sozinho, então os outros esperam com um aviso na tela.
```

- [ ] **Step 7: Atualizar a verificação manual**

Em `docs/verificacao-manual.md`, atualizar a contagem de testes na linha 3 para `356` e acrescentar, antes da seção `## Rede`:

```markdown
## Sala

- [ ] Ao entrar, a tela mostra a sala com quem está — não a mesa
- [ ] A navegação alterna entre Sala e Mesa, e a mesa em andamento continua
      valendo quando você volta para ela
- [ ] Quem está na sala aparece na lista mesmo sem ter sentado
- [ ] Quem fecha a aba aparece marcado como caído antes de sumir
- [ ] Abrir a mesa não arrasta os outros junto — cada um escolhe o que vê
```

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/main.test.ts README.md docs/verificacao-manual.md
git commit -m "Faz da sala o espaco, e da mesa uma escolha de quem esta nela

O \`main.ts\` montava uma partida; passa a montar uma sala, com a mesa como um
dos conteudos do palco. Isso conserta o que o uso real do jogo mostrou: nao
existia \"estar junto\" sem estar jogando.

\`mesaAberta\` mora numa variavel local, nao no \`EstadoJogo\`, e isso e a
decisao central. Se morasse no estado compartilhado, abrir a mesa arrastaria
todo mundo junto e cada broadcast do host devolveria a tela de quem tivesse
voltado para a sala — ha teste cobrindo exatamente esse segundo caso.

Nenhuma regra de jogo foi tocada: \`src/game/\`, a \`Sessao\`, a eleicao de
anfitriao e a reconexao seguem identicas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Depois deste plano

A sala existe e o jogo funciona dentro dela, sem nada de mídia. O plano seguinte — a call — começa confirmando o risco da §12 do spec: se dá para forçar H.264 através do Trystero.

Antes de abrir o PR, vale rodar `npm run dev` e conferir na mão os itens novos de `docs/verificacao-manual.md`, porque nenhuma dessas telas foi vista num navegador de verdade.
