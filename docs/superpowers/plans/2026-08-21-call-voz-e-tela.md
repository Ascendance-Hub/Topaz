# Call de voz e tela — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam `- [ ]` para acompanhamento.

**Goal:** Uma call 1:1 dentro da sala do Topaz — voz e compartilhamento de tela — usando a mesma conexão Trystero que o jogo já usa.

**Architecture:** Um módulo `src/call/` dividido em duas metades por testabilidade: `protocolo.ts` decide *quem está em quê* sem tocar em nenhuma API de navegador (e é testado de verdade), e `midia.ts` é a casca fina que fala com `getUserMedia`, `getDisplayMedia` e `RTCPeerConnection` (verificada na mão). Compartilhar tela não liga o codificador: só quando alguém pede para assistir.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, happy-dom, Trystero (nostr), WebRTC.

**Spec:** `docs/superpowers/specs/2026-08-21-sala-e-call-design.md`

## Global Constraints

- Node 20.19+ ou 22.12+. CI fixa a versão em `.github/workflows/deploy.yml`.
- `src/game/` não importa nada das outras camadas — há teste que garante.
- **`src/call/protocolo.ts` não pode mencionar `navigator`, `MediaStream`, `document` nem `window`.** Haverá teste garantindo, no mesmo espírito de `src/game/isolamento.test.ts`.
- Mídia **não** entra na interface `Transporte` — ela sustenta a rede falsa que testa quase tudo.
- Comentários e identificadores em português.
- Texto de interface por `textContent`, nunca `innerHTML`.
- `npm test` inteiro passando ao fim de **cada** tarefa. Ao começar, são 378 testes.
- `npm run build` roda `tsc --noEmit` antes do Vite.

## Fora deste plano

Vão para um plano 3: seletor de microfone e de saída de áudio, Picture-in-Picture, "entrar só ouvindo" quando o microfone é negado, e o tratamento fino dos casos de borda da §9 do spec. A primeira versão precisa **funcionar** entre duas pessoas antes de ganhar acabamento.

---

### Task 1: O protocolo da call, sem nenhuma mídia

O coração: quem está na call, quem tem tela disponível, e quem pediu para assistir a quem. Tudo isso é estado de sincronização, não de navegador — e é o que dá para testar de verdade.

**Files:**
- Create: `src/call/protocolo.ts`
- Create: `src/call/canal.fake.ts`
- Test: `src/call/protocolo.test.ts`
- Test: `src/call/isolamento.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `export type MensagemCall = { tipo: 'estado'; naCall: boolean; compartilhando: boolean } | { tipo: 'quero-tela'; quero: boolean }`
  - `export interface CanalCall { meuId(): string; enviar(msg: MensagemCall, para?: string): void; aoReceber(cb: (msg: MensagemCall, de: string) => void): void; aoEntrarPeer(cb: (peerId: string) => void): void; aoSairPeer(cb: (peerId: string) => void): void }`
  - `export interface EstadoCall { euNaCall: boolean; euCompartilhando: boolean; naCall: string[]; compartilhando: string[]; assistindo: string[]; assistidoPor: string[] }`
  - `export class ProtocoloCall` com `entrar()`, `sair()`, `definirCompartilhando(ligado: boolean)`, `assistir(peerId)`, `pararDeAssistir(peerId)`, `estado(): EstadoCall`, `aoMudar(cb: () => void)`
  - `export function criarCanalFalso()` em `canal.fake.ts`, devolvendo `{ conectar(id: string): CanalCall }`

**Decisão de desenho que vale registrar:** a mensagem `estado` é um retrato completo, não um incremento. Assim, reenviar para quem chega depois basta para sincronizar, e nada se perde se uma mensagem cair.

- [ ] **Step 1: Escrever o canal falso**

Criar `src/call/canal.fake.ts`:

```ts
import type { CanalCall, MensagemCall } from './protocolo'

interface No {
  id: string
  aoReceber: ((msg: MensagemCall, de: string) => void)[]
  aoEntrar: ((peerId: string) => void)[]
  aoSair: ((peerId: string) => void)[]
}

/**
 * Rede em memória para o canal da call, com entrega síncrona. Mesma ideia da
 * `transport.fake.ts` do jogo, e pelo mesmo motivo: o protocolo precisa ser
 * testável sem navegador e sem relay.
 */
export function criarCanalFalso() {
  const nos = new Map<string, No>()

  function conectar(id: string): CanalCall {
    const no: No = { id, aoReceber: [], aoEntrar: [], aoSair: [] }
    nos.set(id, no)
    for (const outro of nos.values()) {
      if (outro.id === id) continue
      for (const cb of outro.aoEntrar) cb(id)
      for (const cb of no.aoEntrar) cb(outro.id)
    }

    return {
      meuId: () => id,
      enviar: (msg, para) => {
        for (const outro of nos.values()) {
          if (outro.id === id) continue
          if (para !== undefined && outro.id !== para) continue
          for (const cb of outro.aoReceber) cb(structuredClone(msg), id)
        }
      },
      aoReceber: (cb) => { no.aoReceber.push(cb) },
      aoEntrarPeer: (cb) => { no.aoEntrar.push(cb) },
      aoSairPeer: (cb) => { no.aoSair.push(cb) },
    }
  }

  function desconectar(id: string): void {
    nos.delete(id)
    for (const outro of nos.values()) {
      for (const cb of outro.aoSair) cb(id)
    }
  }

  return { conectar, desconectar }
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/call/protocolo.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ProtocoloCall } from './protocolo'
import { criarCanalFalso } from './canal.fake'

function doisPares() {
  const rede = criarCanalFalso()
  const a = new ProtocoloCall(rede.conectar('pa'))
  const b = new ProtocoloCall(rede.conectar('pb'))
  return { rede, a, b }
}

describe('entrar e sair da call', () => {
  it('quem entra aparece na call para o outro', () => {
    const { a, b } = doisPares()

    a.entrar()

    expect(b.estado().naCall).toEqual(['pa'])
    expect(a.estado().euNaCall).toBe(true)
  })

  it('estar na sala não é estar na call', () => {
    const { a, b } = doisPares()

    expect(b.estado().naCall).toEqual([])
    expect(a.estado().euNaCall).toBe(false)
  })

  it('quem sai some da call do outro', () => {
    const { a, b } = doisPares()
    a.entrar()

    a.sair()

    expect(b.estado().naCall).toEqual([])
  })

  it('quem chega depois é informado de quem já está na call', () => {
    const rede = criarCanalFalso()
    const a = new ProtocoloCall(rede.conectar('pa'))
    a.entrar()

    const b = new ProtocoloCall(rede.conectar('pb'))

    expect(b.estado().naCall).toEqual(['pa'])
  })

  it('quem fecha a aba some da call sem precisar avisar', () => {
    const { rede, a, b } = doisPares()
    a.entrar()
    b.entrar()

    rede.desconectar('pa')

    expect(b.estado().naCall).toEqual([])
  })
})

describe('compartilhar tela', () => {
  it('anuncia a tela disponível para os outros', () => {
    const { a, b } = doisPares()
    a.entrar()

    a.definirCompartilhando(true)

    expect(b.estado().compartilhando).toEqual(['pa'])
  })

  it('sair da call também derruba o compartilhamento', () => {
    const { a, b } = doisPares()
    a.entrar()
    a.definirCompartilhando(true)

    a.sair()

    expect(b.estado().compartilhando).toEqual([])
    expect(a.estado().euCompartilhando).toBe(false)
  })
})

describe('assinatura explícita', () => {
  it('compartilhar sozinho não faz ninguém assistir', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()

    a.definirCompartilhando(true)

    expect(a.estado().assistidoPor).toEqual([])
    expect(b.estado().assistindo).toEqual([])
  })

  it('pedir para assistir aparece do lado de quem compartilha', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)

    b.assistir('pa')

    expect(a.estado().assistidoPor).toEqual(['pb'])
    expect(b.estado().assistindo).toEqual(['pa'])
  })

  it('parar de assistir libera quem compartilhava', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)
    b.assistir('pa')

    b.pararDeAssistir('pa')

    expect(a.estado().assistidoPor).toEqual([])
  })

  it('quem para de compartilhar deixa de ser assistido, sem ninguém pedir', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)
    b.assistir('pa')

    a.definirCompartilhando(false)

    expect(b.estado().assistindo).toEqual([])
    expect(a.estado().assistidoPor).toEqual([])
  })

  it('quem sai da sala some da lista de quem me assiste', () => {
    const { rede, a, b } = doisPares()
    a.entrar(); b.entrar()
    a.definirCompartilhando(true)
    b.assistir('pa')

    rede.desconectar('pb')

    expect(a.estado().assistidoPor).toEqual([])
  })

  it('não dá para assistir quem não está compartilhando', () => {
    const { a, b } = doisPares()
    a.entrar(); b.entrar()

    b.assistir('pa')

    expect(b.estado().assistindo).toEqual([])
    expect(a.estado().assistidoPor).toEqual([])
  })
})

describe('aviso de mudança', () => {
  it('avisa quando alguém entra na call', () => {
    const { a, b } = doisPares()
    const mudou = vi.fn()
    b.aoMudar(mudou)

    a.entrar()

    expect(mudou).toHaveBeenCalled()
  })

  it('não avisa quando nada mudou de fato', () => {
    const { a, b } = doisPares()
    a.entrar()
    const mudou = vi.fn()
    b.aoMudar(mudou)

    // Reenvio do mesmo retrato: acontece toda vez que um peer entra na sala.
    a.entrar()

    expect(mudou).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/call/protocolo.test.ts`
Expected: FAIL — não consegue resolver `./protocolo`.

- [ ] **Step 4: Implementar o protocolo**

Criar `src/call/protocolo.ts`:

```ts
/**
 * A mensagem de estado é um RETRATO completo, não um incremento. Reenviar
 * para quem chega depois basta para sincronizar, e uma mensagem perdida se
 * conserta sozinha no próximo reenvio — não há sequência para dessincronizar.
 */
export type MensagemCall =
  | { tipo: 'estado'; naCall: boolean; compartilhando: boolean }
  | { tipo: 'quero-tela'; quero: boolean }

export interface CanalCall {
  meuId(): string
  /** Sem `para`, vai para todos os peers da sala. */
  enviar(msg: MensagemCall, para?: string): void
  aoReceber(cb: (msg: MensagemCall, de: string) => void): void
  aoEntrarPeer(cb: (peerId: string) => void): void
  aoSairPeer(cb: (peerId: string) => void): void
}

export interface EstadoCall {
  euNaCall: boolean
  euCompartilhando: boolean
  naCall: string[]
  compartilhando: string[]
  /** De quem eu pedi a tela. */
  assistindo: string[]
  /** Quem pediu a minha. Vazio = codificador desligado. */
  assistidoPor: string[]
}

interface Peer {
  naCall: boolean
  compartilhando: boolean
}

export class ProtocoloCall {
  private euNaCall = false
  private euCompartilhando = false
  private peers = new Map<string, Peer>()
  private assistindo = new Set<string>()
  private assistidoPor = new Set<string>()
  private ouvintes: (() => void)[] = []

  constructor(private canal: CanalCall) {
    this.canal.aoReceber((msg, de) => this.receber(msg, de))

    // Quem chega recebe o meu retrato. É isso que torna a entrada tardia
    // indistinguível da entrada no início.
    this.canal.aoEntrarPeer((peerId) => this.anunciar(peerId))

    this.canal.aoSairPeer((peerId) => {
      const tinha = this.peers.delete(peerId)
      const assistia = this.assistindo.delete(peerId)
      const eraAssistido = this.assistidoPor.delete(peerId)
      if (tinha || assistia || eraAssistido) this.notificar()
    })
  }

  private receber(msg: MensagemCall, de: string): void {
    if (msg.tipo === 'quero-tela') {
      // Só aceito espectador enquanto de fato compartilho: sem isso, um pedido
      // atrasado ligaria o codificador depois de eu já ter parado.
      const antes = this.assistidoPor.size
      if (msg.quero && this.euCompartilhando) this.assistidoPor.add(de)
      else this.assistidoPor.delete(de)
      if (this.assistidoPor.size !== antes) this.notificar()
      return
    }

    const anterior = this.peers.get(de)
    if (anterior?.naCall === msg.naCall && anterior?.compartilhando === msg.compartilhando) {
      return
    }
    this.peers.set(de, { naCall: msg.naCall, compartilhando: msg.compartilhando })

    // Quem parou de compartilhar (ou saiu da call) deixa de ser assistido sem
    // que ninguém precise pedir: a tela dele não existe mais.
    if (!msg.compartilhando || !msg.naCall) this.assistindo.delete(de)
    this.notificar()
  }

  private anunciar(para?: string): void {
    this.canal.enviar(
      { tipo: 'estado', naCall: this.euNaCall, compartilhando: this.euCompartilhando },
      para,
    )
  }

  private notificar(): void {
    for (const cb of this.ouvintes) cb()
  }

  entrar(): void {
    if (this.euNaCall) return
    this.euNaCall = true
    this.anunciar()
    this.notificar()
  }

  sair(): void {
    if (!this.euNaCall) return
    this.euNaCall = false
    // Sair da call derruba o compartilhamento junto: uma tela publicada por
    // quem não está mais na conversa seria uma janela aberta sem dono.
    this.euCompartilhando = false
    this.assistidoPor.clear()
    this.assistindo.clear()
    this.anunciar()
    this.notificar()
  }

  definirCompartilhando(ligado: boolean): void {
    if (this.euCompartilhando === ligado) return
    this.euCompartilhando = ligado
    if (!ligado) this.assistidoPor.clear()
    this.anunciar()
    this.notificar()
  }

  assistir(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer?.compartilhando || !peer.naCall) return
    if (this.assistindo.has(peerId)) return
    this.assistindo.add(peerId)
    this.canal.enviar({ tipo: 'quero-tela', quero: true }, peerId)
    this.notificar()
  }

  pararDeAssistir(peerId: string): void {
    if (!this.assistindo.delete(peerId)) return
    this.canal.enviar({ tipo: 'quero-tela', quero: false }, peerId)
    this.notificar()
  }

  estado(): EstadoCall {
    const comFiltro = (teste: (p: Peer) => boolean) =>
      [...this.peers.entries()].filter(([, p]) => teste(p)).map(([id]) => id)

    return {
      euNaCall: this.euNaCall,
      euCompartilhando: this.euCompartilhando,
      naCall: comFiltro((p) => p.naCall),
      compartilhando: comFiltro((p) => p.naCall && p.compartilhando),
      assistindo: [...this.assistindo],
      assistidoPor: [...this.assistidoPor],
    }
  }

  aoMudar(cb: () => void): void {
    this.ouvintes.push(cb)
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/call/protocolo.test.ts`
Expected: PASS, 15 testes.

- [ ] **Step 6: O teste que guarda a fronteira**

Criar `src/call/isolamento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * `protocolo.ts` é a metade testável da call. Se mídia vazar para dentro dele,
 * ela deixa de ser testável sem navegador — e a suíte perde justamente a peça
 * que cobre a assinatura explícita, que é o coração do desenho.
 */
describe('isolamento do protocolo da call', () => {
  it('não menciona nenhuma API de navegador', () => {
    const fonte = readFileSync('src/call/protocolo.ts', 'utf8')

    for (const proibido of ['navigator', 'MediaStream', 'document', 'window', 'RTCPeerConnection']) {
      expect(fonte).not.toContain(proibido)
    }
  })

  it('não importa nada de fora de src/call', () => {
    const fonte = readFileSync('src/call/protocolo.ts', 'utf8')

    expect(fonte).not.toMatch(/from\s+'\.\.\//)
  })
})
```

- [ ] **Step 7: Rodar a suíte inteira e o build**

Run: `npm test && npm run build`
Expected: PASS, 395 testes (378 + 15 + 2). Build sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/call/
git commit -m "Escreve o protocolo da call sem tocar em midia

Quem esta na call, quem tem tela disponivel e quem pediu para assistir a quem.
Tudo isso e sincronizacao, nao navegador — e por isso da para testar de
verdade, com uma rede falsa em memoria.

A mensagem de estado e um retrato completo, nao um incremento: reenviar para
quem chega depois basta para sincronizar, e uma mensagem perdida se conserta
sozinha no reenvio seguinte, sem sequencia para dessincronizar.

O principio central ja esta aqui: compartilhar tela nao faz ninguem assistir.
So um pedido explicito cria o vinculo, e quem para de compartilhar desfaz os
vinculos sem ninguem precisar pedir.

Um teste guarda a fronteira: se midia vazar para dentro do protocolo, a suite
reprova — senao a peca que cobre a assinatura deixaria de ser testavel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: O canal de verdade, por cima do Trystero

A ponte entre o protocolo e a conexão. Fina de propósito, e testável com uma sala falsa — do mesmo jeito que `criarTransporte` passou a ser.

**Files:**
- Create: `src/call/canal.ts`
- Test: `src/call/canal.test.ts`

**Interfaces:**
- Consumes: `CanalCall`, `MensagemCall` da Task 1; `SalaTrystero` de `src/net/transport.ts`.
- Produces: `export function criarCanalCall(sala: SalaTrystero): CanalCall`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/call/canal.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { criarCanalCall } from './canal'
import type { SalaTrystero } from '../net/transport'
import type { MensagemCall } from './protocolo'

type AcaoFalsa = {
  send: ReturnType<typeof vi.fn>
  onMessage: ((dados: never, contexto: { peerId: string }) => void) | null
}

function criarSalaFalsa() {
  const canais = new Map<string, AcaoFalsa>()
  const bruta = {
    makeAction: (nome: string) => {
      const canal: AcaoFalsa = { send: vi.fn(), onMessage: null }
      canais.set(nome, canal)
      return canal
    },
    getPeers: () => ({ p2: {} }),
    leave: vi.fn(),
    onPeerJoin: null as ((id: string) => void) | null,
    onPeerLeave: null as ((id: string) => void) | null,
  }
  return { sala: bruta as unknown as SalaTrystero, canais, bruta }
}

describe('criarCanalCall', () => {
  it('usa um canal próprio, sem encostar nos canais do jogo', () => {
    const { sala, canais } = criarSalaFalsa()

    criarCanalCall(sala)

    expect(canais.has('call')).toBe(true)
    expect(canais.has('acao')).toBe(false)
    expect(canais.has('estado')).toBe(false)
  })

  it('envia para todos quando não há destinatário', () => {
    const { sala, canais } = criarSalaFalsa()
    const msg: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: false }

    criarCanalCall(sala).enviar(msg)

    expect(canais.get('call')!.send).toHaveBeenCalledWith(msg, undefined)
  })

  it('envia só para o destinatário quando há um', () => {
    const { sala, canais } = criarSalaFalsa()
    const msg: MensagemCall = { tipo: 'quero-tela', quero: true }

    criarCanalCall(sala).enviar(msg, 'p2')

    expect(canais.get('call')!.send).toHaveBeenCalledWith(msg, 'p2')
  })

  it('entrega o que chega, com o peerId do remetente', () => {
    const { sala, canais } = criarSalaFalsa()
    const recebido = vi.fn()
    criarCanalCall(sala).aoReceber(recebido)
    const msg: MensagemCall = { tipo: 'estado', naCall: true, compartilhando: true }

    canais.get('call')!.onMessage!(msg as never, { peerId: 'p2' })

    expect(recebido).toHaveBeenCalledWith(msg, 'p2')
  })

  it('repassa entrada e saída de peers', () => {
    const { sala, bruta } = criarSalaFalsa()
    const entrou = vi.fn()
    const saiu = vi.fn()
    const canal = criarCanalCall(sala)
    canal.aoEntrarPeer(entrou)
    canal.aoSairPeer(saiu)

    bruta.onPeerJoin!('p2')
    bruta.onPeerLeave!('p2')

    expect(entrou).toHaveBeenCalledWith('p2')
    expect(saiu).toHaveBeenCalledWith('p2')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/call/canal.test.ts`
Expected: FAIL — não consegue resolver `./canal`.

- [ ] **Step 3: Implementar**

Criar `src/call/canal.ts`:

```ts
import { selfId } from 'trystero/nostr'
import type { SalaTrystero } from '../net/transport'
import type { CanalCall, MensagemCall } from './protocolo'

/**
 * O canal da call por cima da mesma conexão do jogo.
 *
 * Canal próprio (`makeAction('call')`) e não o `Transporte`: o `Transporte`
 * sustenta a rede falsa que testa eleição, migração e split-brain, e não deve
 * ganhar conceitos que não são do jogo. Mensagem de call perdida não tem como
 * corromper partida nenhuma.
 *
 * ATENÇÃO: `onPeerJoin` e `onPeerLeave` do Trystero guardam UM handler cada.
 * Aqui só há um consumidor (o `ProtocoloCall`), mas as listas existem para
 * que um segundo não substitua o primeiro em silêncio — foi o mesmo cuidado
 * que `criarTransporte` já toma.
 */
export function criarCanalCall(sala: SalaTrystero): CanalCall {
  const callAction = sala.makeAction<MensagemCall>('call')

  const aoReceber: ((msg: MensagemCall, de: string) => void)[] = []
  const aoEntrar: ((peerId: string) => void)[] = []
  const aoSair: ((peerId: string) => void)[] = []

  callAction.onMessage = (msg, contexto) => {
    for (const cb of aoReceber) cb(msg, contexto.peerId)
  }
  sala.onPeerJoin = (peerId) => {
    for (const cb of aoEntrar) cb(peerId)
  }
  sala.onPeerLeave = (peerId) => {
    for (const cb of aoSair) cb(peerId)
  }

  return {
    meuId: () => selfId,
    enviar: (msg, para) => {
      void callAction.send(msg, para)
    },
    aoReceber: (cb) => { aoReceber.push(cb) },
    aoEntrarPeer: (cb) => { aoEntrar.push(cb) },
    aoSairPeer: (cb) => { aoSair.push(cb) },
  }
}
```

> **Cuidado ao integrar (Task 4):** `sala.onPeerJoin` já é atribuído por `criarTransporte`. Atribuir de novo aqui **substitui** o handler do jogo e quebra a eleição de anfitrião. A Task 4 resolve isso ligando o canal da call ao `Transporte` que já existe, em vez de à sala crua — e há teste para isso lá.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/call/canal.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Rodar a suíte inteira e o build**

Run: `npm test && npm run build`
Expected: PASS, 400 testes. Build sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/call/canal.ts src/call/canal.test.ts
git commit -m "Liga o protocolo da call a conexao que ja existe

Canal proprio por cima da mesma sala Trystero do jogo, em vez de um segundo
handshake para os mesmos peers. Fica fora da interface \`Transporte\` de
proposito: ela sustenta a rede falsa que testa eleicao e migracao, e nao deve
ganhar conceitos que nao sao do jogo.

Testado com uma sala falsa, incluindo que o canal do jogo nao e tocado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Voz — entrar e sair da call

A primeira mídia de verdade. Daqui em diante existe uma casca que só a verificação manual cobre; o desenho a mantém pequena.

**Files:**
- Create: `src/call/midia.ts`
- Create: `src/ui/components/call.ts`
- Test: `src/ui/components/call.test.ts`
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: `ProtocoloCall`, `EstadoCall` da Task 1.
- Produces:
  - `export const RESTRICOES_MICROFONE` em `midia.ts`
  - `export class Midia` com `ligarMicrofone(): Promise<void>`, `desligarMicrofone()`, `aoReceberFaixa(cb: (faixa: MediaStreamTrack, de: string) => void)`
  - `export function renderizarControlesCall(estado: EstadoCall, acoes: AcoesCall): HTMLElement`
  - `export interface AcoesCall { entrar(): void; sair(): void }`

- [ ] **Step 1: Escrever o teste dos controles**

Criar `src/ui/components/call.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderizarControlesCall } from './call'
import type { EstadoCall } from '../../call/protocolo'

function estado(extras: Partial<EstadoCall> = {}): EstadoCall {
  return {
    euNaCall: false, euCompartilhando: false, naCall: [],
    compartilhando: [], assistindo: [], assistidoPor: [], ...extras,
  }
}

const acoes = () => ({ entrar: vi.fn(), sair: vi.fn() })

describe('controles da call', () => {
  it('fora da call, oferece entrar', () => {
    const controles = renderizarControlesCall(estado(), acoes())

    expect(controles.querySelector('[data-call="entrar"]')).not.toBeNull()
    expect(controles.querySelector('[data-call="sair"]')).toBeNull()
  })

  it('na call, oferece sair', () => {
    const controles = renderizarControlesCall(estado({ euNaCall: true }), acoes())

    expect(controles.querySelector('[data-call="sair"]')).not.toBeNull()
    expect(controles.querySelector('[data-call="entrar"]')).toBeNull()
  })

  it('entrar chama a ação', () => {
    const a = acoes()
    const controles = renderizarControlesCall(estado(), a)

    controles.querySelector<HTMLButtonElement>('[data-call="entrar"]')!.click()

    expect(a.entrar).toHaveBeenCalled()
  })

  it('mostra quantas pessoas estão na call', () => {
    const controles = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa', 'pb'] }), acoes())

    expect(controles.querySelector('.call-contagem')!.textContent).toContain('3')
  })

  it('fora da call, não anuncia contagem nenhuma', () => {
    const controles = renderizarControlesCall(estado({ naCall: ['pa'] }), acoes())

    expect(controles.querySelector('.call-contagem')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/components/call.test.ts`
Expected: FAIL — não consegue resolver `./call`.

- [ ] **Step 3: Implementar os controles**

Criar `src/ui/components/call.ts`:

```ts
import type { EstadoCall } from '../../call/protocolo'

export interface AcoesCall {
  entrar(): void
  sair(): void
}

function botao(chave: string, rotulo: string, aoClicar: () => void): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'call-botao'
  el.dataset['call'] = chave
  el.textContent = rotulo
  el.onclick = aoClicar
  return el
}

/**
 * Barra de controles da call. Fica sempre na tela, fora do palco que
 * `renderizar` reconstrói — um botão de microfone que sумisse a cada broadcast
 * do host seria impossível de acertar com o mouse.
 */
export function renderizarControlesCall(estado: EstadoCall, acoes: AcoesCall): HTMLElement {
  const barra = document.createElement('div')
  barra.className = 'call-controles'

  if (estado.euNaCall) {
    const contagem = document.createElement('span')
    contagem.className = 'call-contagem'
    // Eu conto: "2 na call" com uma pessoa do outro lado descreve a conversa,
    // não a lista de terceiros.
    contagem.textContent = `${estado.naCall.length + 1} na call`
    barra.append(contagem, botao('sair', 'Sair da call', () => acoes.sair()))
  } else {
    barra.append(botao('entrar', 'Entrar na call', () => acoes.entrar()))
  }

  return barra
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/ui/components/call.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Implementar a casca de mídia**

Criar `src/call/midia.ts`:

```ts
import type { SalaTrystero } from '../net/transport'

/**
 * O supressor de ruído do próprio WebRTC, de graça. Não é Krisp, mas resolve
 * ventilador e teclado sem nenhuma dependência.
 */
export const RESTRICOES_MICROFONE: MediaStreamConstraints = {
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  video: false,
}

/**
 * A casca que toca as APIs de mídia do navegador. Fica deliberadamente fina:
 * nada aqui é testável sem navegador, então quanto menos decisão morar neste
 * arquivo, menos fica fora da suíte. Quem decide *quem recebe o quê* é o
 * `ProtocoloCall`.
 */
export class Midia {
  private microfone: MediaStream | null = null
  private aoFaixa: ((faixa: MediaStreamTrack, de: string) => void)[] = []

  /**
   * `sala` é opcional por construção: a call é um módulo que pode não existir,
   * e nos testes a sala do Trystero não é montada. Todo método público começa
   * checando — sem isso, cada chamada precisaria de um guarda do lado de fora.
   */
  constructor(private sala: SalaTrystero | undefined) {
    if (!this.sala) return
    this.sala.onPeerTrack = (faixa, _stream, peerId) => {
      for (const cb of this.aoFaixa) cb(faixa, peerId)
    }
  }

  async ligarMicrofone(alvos: string[]): Promise<void> {
    if (!this.sala || this.microfone) return
    this.microfone = await navigator.mediaDevices.getUserMedia(RESTRICOES_MICROFONE)
    // `target` aceita lista, então uma chamada só alcança todos os alvos.
    if (alvos.length > 0) {
      this.sala.addStream(this.microfone, { target: alvos, metadata: { tipo: 'microfone' } })
    }
  }

  /** Um peer que entrou na call depois de mim vira alvo novo. */
  publicarMicrofonePara(peerId: string): void {
    if (!this.sala || !this.microfone) return
    this.sala.addStream(this.microfone, { target: peerId, metadata: { tipo: 'microfone' } })
  }

  desligarMicrofone(): void {
    if (!this.sala || !this.microfone) return
    this.sala.removeStream(this.microfone)
    for (const faixa of this.microfone.getTracks()) faixa.stop()
    this.microfone = null
  }

  aoReceberFaixa(cb: (faixa: MediaStreamTrack, de: string) => void): void {
    this.aoFaixa.push(cb)
  }
}
```

- [ ] **Step 6: Estilos**

Acrescentar ao final de `src/ui/theme.css`:

```css
.call-controles {
  position: fixed;
  left: 50%; bottom: 16px; transform: translateX(-50%);
  z-index: 15;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; border-radius: 999px;
  background: var(--carvao-700);
  border: 1px solid var(--carvao-500);
}
.call-botao {
  padding: 8px 16px; border-radius: 999px;
  background: transparent; color: var(--topazio-500);
  border: 1px solid var(--topazio-600);
  font-family: var(--serif); font-size: 13px; cursor: pointer;
}
.call-contagem { color: var(--texto-fraco); font-size: 12px; }
```

- [ ] **Step 7: Rodar a suíte e o build**

Run: `npm test && npm run build`
Expected: PASS, 405 testes. Build sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/call/midia.ts src/ui/components/call.ts src/ui/components/call.test.ts src/ui/theme.css
git commit -m "Da voz a call, com a casca de midia o mais fina possivel

`midia.ts` toca `getUserMedia` e o `addStream` do Trystero e para por ai. Nada
nele e testavel sem navegador, entao quanto menos decisao morar ali, menos fica
fora da suite — quem decide quem recebe o que continua sendo o protocolo.

O microfone e dirigido por `target`: estar na sala nao e estar na call, e sem
isso alguem que so queria jogar blackjack receberia a conversa sem ter pedido.

Supressao de ruido vem do proprio WebRTC, de graca, numa linha.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: A call montada na sala

A integração: o `main.ts` passa a montar a call ao lado do jogo e do chat, resolvendo o conflito dos handlers do Trystero.

**Files:**
- Modify: `src/net/transport.ts`
- Modify: `src/net/transport.test.ts`
- Modify: `src/call/canal.ts`
- Modify: `src/call/canal.test.ts`
- Modify: `src/main.ts`
- Modify: `src/main.test.ts`

**Interfaces:**
- Consumes: tudo das tarefas 1 a 3.
- Produces: `Transporte` ganha `aoEntrarPeer`/`aoSairPeer` já existentes reaproveitados pelo canal da call; `criarCanalCall(transporte, sala)` passa a receber os dois.

**O problema a resolver:** `criarTransporte` faz `sala.onPeerJoin = ...` e `criarCanalCall` faria o mesmo. O segundo **apaga** o primeiro, e a eleição de anfitrião para de receber avisos — a sala inteira quebraria em silêncio.

- [ ] **Step 1: Escrever o teste que prova o conflito**

Acrescentar a `src/net/transport.test.ts`:

```ts
describe('convivência com outros consumidores da mesma sala', () => {
  it('o transporte continua avisando entrada de peer depois de outro módulo usar a sala', () => {
    const { sala, bruta } = criarSalaFalsa()
    const transporte = criarTransporte(sala)
    const entrouNoJogo = vi.fn()
    transporte.aoEntrarPeer(entrouNoJogo)

    // Um segundo módulo (a call) pede a mesma notificação.
    const entrouNaCall = vi.fn()
    transporte.aoEntrarPeer(entrouNaCall)

    bruta.onPeerJoin!('p2')

    expect(entrouNoJogo).toHaveBeenCalledWith('p2')
    expect(entrouNaCall).toHaveBeenCalledWith('p2')
  })
})
```

- [ ] **Step 2: Rodar e ver passar (já funciona)**

Run: `npx vitest run src/net/transport.test.ts`
Expected: PASS — `criarTransporte` já mantém uma lista de handlers.

Esse teste não muda código: ele **documenta** a propriedade da qual a Task 4 depende, para que ninguém a remova sem a suíte reclamar.

- [ ] **Step 3: Fazer o canal da call reusar o transporte**

Trocar a assinatura em `src/call/canal.ts`:

```ts
import { selfId } from 'trystero/nostr'
import type { SalaTrystero, Transporte } from '../net/transport'
import type { CanalCall, MensagemCall } from './protocolo'

/**
 * O canal da call por cima da mesma conexão do jogo.
 *
 * Entrada e saída de peers vêm do `Transporte`, NÃO da sala crua. O Trystero
 * guarda um único handler para `onPeerJoin`, então atribuí-lo aqui apagaria o
 * do jogo e a eleição de anfitrião pararia de receber avisos — a sala
 * quebraria em silêncio. O `Transporte` já mantém uma lista, e há teste
 * guardando essa propriedade.
 */
export function criarCanalCall(sala: SalaTrystero, transporte: Transporte): CanalCall {
  const callAction = sala.makeAction<MensagemCall>('call')
  const aoReceber: ((msg: MensagemCall, de: string) => void)[] = []

  callAction.onMessage = (msg, contexto) => {
    for (const cb of aoReceber) cb(msg, contexto.peerId)
  }

  return {
    meuId: () => selfId,
    enviar: (msg, para) => {
      void callAction.send(msg, para)
    },
    aoReceber: (cb) => { aoReceber.push(cb) },
    aoEntrarPeer: (cb) => transporte.aoEntrarPeer(cb),
    aoSairPeer: (cb) => transporte.aoSairPeer(cb),
  }
}
```

- [ ] **Step 4: Ajustar o teste do canal**

Em `src/call/canal.test.ts`, o teste `'repassa entrada e saída de peers'` passa a montar um transporte de verdade sobre a mesma sala falsa. Substituir aquele `it` por:

```ts
  it('repassa entrada e saída de peers sem roubar os handlers do jogo', () => {
    const { sala, bruta } = criarSalaFalsa()
    const transporte = criarTransporte(sala)
    const entrouNoJogo = vi.fn()
    transporte.aoEntrarPeer(entrouNoJogo)

    const entrouNaCall = vi.fn()
    const saiuNaCall = vi.fn()
    const canal = criarCanalCall(sala, transporte)
    canal.aoEntrarPeer(entrouNaCall)
    canal.aoSairPeer(saiuNaCall)

    bruta.onPeerJoin!('p2')
    bruta.onPeerLeave!('p2')

    expect(entrouNaCall).toHaveBeenCalledWith('p2')
    expect(saiuNaCall).toHaveBeenCalledWith('p2')
    // O jogo não pode ter sido silenciado pela chegada da call.
    expect(entrouNoJogo).toHaveBeenCalledWith('p2')
  })
```

E, nos outros `it` do arquivo, trocar `criarCanalCall(sala)` por `criarCanalCall(sala, criarTransporte(sala))`. Acrescentar ao topo:

```ts
import { criarTransporte } from '../net/transport'
```

- [ ] **Step 5: Montar a call no `main.ts`**

Em `src/main.ts`, a sala crua passa a ser guardada, e a call entra ao lado do chat:

```ts
import { criarCanalCall } from './call/canal'
import { ProtocoloCall } from './call/protocolo'
import { Midia } from './call/midia'
import { renderizarControlesCall } from './ui/components/call'
```

Dentro de `entrarNaSala`, trocar a criação do transporte e acrescentar a call:

```ts
  const salaTrystero = criarSalaTrystero(codigo)
  const transporte = criarTransporte(salaTrystero)
  const sessao = new Sessao(transporte, rngDaSessao)

  const protocolo = new ProtocoloCall(criarCanalCall(salaTrystero, transporte))
  const midia = new Midia(salaTrystero)

  // Um peer que entra na call depois de mim precisa receber meu microfone —
  // o `addStream` inicial só alcançou quem já estava.
  let naCallAntes: string[] = []
  protocolo.aoMudar(() => {
    for (const peerId of protocolo.estado().naCall) {
      if (!naCallAntes.includes(peerId)) midia.publicarMicrofonePara(peerId)
    }
    naCallAntes = protocolo.estado().naCall
    desenhar()
  })

  const acoesCall = {
    entrar: () => {
      void midia.ligarMicrofone(protocolo.estado().naCall)
        .then(() => protocolo.entrar())
    },
    sair: () => {
      protocolo.sair()
      midia.desligarMicrofone()
    },
  }

  // A área de áudio remoto é criada uma vez e nunca substituída, pelo mesmo
  // motivo do chat: recriar um <audio> reinicia o fluxo.
  const audios = document.createElement('div')
  audios.className = 'call-audios'
  midia.aoReceberFaixa((faixa) => {
    const el = document.createElement('audio')
    el.autoplay = true
    el.srcObject = new MediaStream([faixa])
    audios.append(el)
  })
```

E a montagem passa a incluir os dois nós novos:

```ts
  let controles = renderizarControlesCall(protocolo.estado(), acoesCall)
  app.replaceChildren(barra, nav, palco, chat.raiz, controles, audios)
```

Dentro de `desenhar()`, junto das outras trocas:

```ts
    const novosControles = renderizarControlesCall(protocolo.estado(), acoesCall)
    controles.replaceWith(novosControles)
    controles = novosControles
```

- [ ] **Step 6: Escrever o teste de integração**

Acrescentar ao final de `src/main.test.ts`:

```ts
describe('entrarNaSala — a call convive com o jogo', () => {
  it('montar a call não silencia a eleição de anfitrião', () => {
    vi.useFakeTimers()
    try {
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

      // Se a call tivesse roubado `onPeerJoin`, a sala nunca resolveria quem
      // manda e o palco ficaria preso em "conectando".
      expect(app.querySelector('.conexao')).toBeNull()
      expect(app.querySelector('.sala-parada')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra o botão de entrar na call, e ninguém entra sozinho', () => {
    vi.useFakeTimers()
    try {
      const rede = criarRedeFalsa({ conexaoDiferida: true })
      vi.mocked(criarSalaTrystero).mockReturnValue(undefined as never)
      vi.mocked(criarTransporte).mockImplementation(() => rede.conectar('pb'))

      const app = document.createElement('div')
      entrarNaSala(app, 'Bruno', 'CODIGO01')
      vi.advanceTimersByTime(MS_DESCOBERTA + 600)

      expect(app.querySelector('[data-call="entrar"]')).not.toBeNull()
      expect(app.querySelector('[data-call="sair"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
```

> **Nota sobre o mock:** `criarSalaTrystero` devolve `undefined` nos testes. É
> por isso que `Midia` recebe `SalaTrystero | undefined` desde a Task 3 — sem
> aquele guarda, montar a call dentro de `entrarNaSala` estouraria em toda a
> suíte de `main.test.ts`.

- [ ] **Step 7: Rodar a suíte e o build**

Run: `npm test && npm run build`
Expected: PASS, 408 testes. Build sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/net/transport.test.ts src/call/ src/main.ts src/main.test.ts
git commit -m "Monta a call na sala sem silenciar o jogo

O Trystero guarda UM handler para `onPeerJoin`. A call atribuindo o dela
apagaria o do jogo, e a eleicao de anfitriao pararia de receber avisos — a sala
quebraria em silencio, do jeito mais dificil de diagnosticar. O canal da call
passa a receber entrada e saida de peers pelo `Transporte`, que ja mantem uma
lista, e ha teste guardando essa propriedade nos dois lados.

Os controles e a area de audio remoto sao irmaos persistentes do palco, como o
chat: recriar um <audio> reiniciaria o fluxo a cada broadcast do host.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Compartilhar tela, com assinatura e H.264

A entrega final: a tela, ligada só para quem pediu, no codec que aciona o encoder de hardware.

**Files:**
- Modify: `src/call/midia.ts`
- Modify: `src/ui/components/call.ts`
- Modify: `src/ui/components/call.test.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/theme.css`
- Modify: `README.md`, `docs/verificacao-manual.md`, `docs/roteiro.md`

**Interfaces:**
- Consumes: tudo anterior.
- Produces: `Midia` ganha `compartilharTela(): Promise<MediaStreamTrack>`, `pararTela()`, `publicarTelaPara(peerId)`, `despublicarTelaDe(peerId)`, `aplicarQualidade()`; `AcoesCall` ganha `compartilhar()`, `pararTela()`, `assistir(peerId)`, `pararDeAssistir(peerId)`.

- [ ] **Step 1: Escrever os testes dos controles de tela**

Acrescentar a `src/ui/components/call.test.ts`:

Primeiro, ampliar o helper que já existe no topo do arquivo — a interface
`AcoesCall` vai ganhar quatro membros, e um helper com dois pararia de
compilar:

```ts
const acoes = () => ({
  entrar: vi.fn(), sair: vi.fn(), compartilhar: vi.fn(),
  pararTela: vi.fn(), assistir: vi.fn(), pararDeAssistir: vi.fn(),
})
```

Depois, acrescentar o bloco novo, que reusa esse mesmo helper:

```ts
describe('controles de tela', () => {
  const acoesTela = acoes

  it('na call, oferece compartilhar a tela', () => {
    const c = renderizarControlesCall(estado({ euNaCall: true }), acoesTela())

    expect(c.querySelector('[data-call="compartilhar"]')).not.toBeNull()
  })

  it('fora da call, não oferece compartilhar', () => {
    const c = renderizarControlesCall(estado(), acoesTela())

    expect(c.querySelector('[data-call="compartilhar"]')).toBeNull()
  })

  it('compartilhando, oferece parar', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true }), acoesTela())

    expect(c.querySelector('[data-call="parar-tela"]')).not.toBeNull()
    expect(c.querySelector('[data-call="compartilhar"]')).toBeNull()
  })

  it('oferece assistir a tela de quem está compartilhando', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa'], compartilhando: ['pa'] }), acoesTela())

    expect(c.querySelector('[data-assistir="pa"]')).not.toBeNull()
  })

  it('clicar em assistir pede a tela daquele peer', () => {
    const a = acoesTela()
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa'], compartilhando: ['pa'] }), a)

    c.querySelector<HTMLButtonElement>('[data-assistir="pa"]')!.click()

    expect(a.assistir).toHaveBeenCalledWith('pa')
  })

  it('já assistindo, oferece parar de assistir', () => {
    const a = acoesTela()
    const c = renderizarControlesCall(
      estado({ euNaCall: true, naCall: ['pa'], compartilhando: ['pa'], assistindo: ['pa'] }), a)

    c.querySelector<HTMLButtonElement>('[data-parar-assistir="pa"]')!.click()

    expect(a.pararDeAssistir).toHaveBeenCalledWith('pa')
  })

  it('avisa quando ninguém está assistindo, porque aí o codificador está desligado', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true, assistidoPor: [] }), acoesTela())

    expect(c.querySelector('.call-sem-espectador')).not.toBeNull()
  })

  it('não avisa quando há espectador', () => {
    const c = renderizarControlesCall(
      estado({ euNaCall: true, euCompartilhando: true, assistidoPor: ['pb'] }), acoesTela())

    expect(c.querySelector('.call-sem-espectador')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/components/call.test.ts`
Expected: FAIL — os seletores de tela não existem.

- [ ] **Step 3: Estender os controles**

Em `src/ui/components/call.ts`, ampliar a interface e a renderização:

```ts
export interface AcoesCall {
  entrar(): void
  sair(): void
  compartilhar(): void
  pararTela(): void
  assistir(peerId: string): void
  pararDeAssistir(peerId: string): void
}

export const AVISO_SEM_ESPECTADOR = 'ninguém está assistindo — sua tela não está sendo codificada'
```

Dentro do bloco `if (estado.euNaCall)`, depois do botão de sair:

```ts
    if (estado.euCompartilhando) {
      barra.append(botao('parar-tela', 'Parar de compartilhar', () => acoes.pararTela()))
      if (estado.assistidoPor.length === 0) {
        const aviso = document.createElement('span')
        aviso.className = 'call-sem-espectador'
        // Não é erro: é a assinatura funcionando. Dizer isso evita a pessoa
        // achar que o compartilhamento falhou.
        aviso.textContent = AVISO_SEM_ESPECTADOR
        barra.append(aviso)
      }
    } else {
      barra.append(botao('compartilhar', 'Compartilhar tela', () => acoes.compartilhar()))
    }

    for (const peerId of estado.compartilhando) {
      const assistindo = estado.assistindo.includes(peerId)
      const el = botao(
        assistindo ? 'parar-assistir' : 'assistir',
        assistindo ? 'Parar de assistir' : 'Assistir tela',
        () => (assistindo ? acoes.pararDeAssistir(peerId) : acoes.assistir(peerId)),
      )
      el.dataset[assistindo ? 'pararAssistir' : 'assistir'] = peerId
      barra.append(el)
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/ui/components/call.test.ts`
Expected: PASS, 13 testes.

- [ ] **Step 5: A tela na casca de mídia**

Acrescentar a `src/call/midia.ts`:

```ts
/** Teto padrão. O probe mostrou que o custo salta ~3× de 720p para 1080p. */
export const ALTURA_PADRAO = 720
export const BITRATE_PADRAO = 3_000_000

export const RESTRICOES_TELA: DisplayMediaStreamOptions = {
  // Sem áudio nesta versão: captura irregular entre plataformas, e som do
  // sistema com microfone aberto cria eco de verdade.
  video: { frameRate: { ideal: 30 } },
  audio: false,
}
```

E os métodos, dentro da classe `Midia`:

```ts
  private tela: MediaStream | null = null

  async compartilharTela(aoEncerrarPeloNavegador: () => void): Promise<void> {
    if (!this.sala || this.tela) return
    this.tela = await navigator.mediaDevices.getDisplayMedia(RESTRICOES_TELA)
    const faixa = this.tela.getVideoTracks()[0]
    if (!faixa) return
    // Diz ao codificador o que priorizar. A escolha errada aqui é a causa
    // clássica de "tela travando", e é o botão que Discord e Meet não expõem.
    faixa.contentHint = 'motion'
    // O Chrome mostra a barra dele com "Parar de compartilhar". Sem tratar o
    // fim por esse caminho, a interface continuaria dizendo que você
    // compartilha depois de você já ter parado.
    faixa.onended = () => aoEncerrarPeloNavegador()
  }

  publicarTelaPara(peerId: string): void {
    if (!this.sala || !this.tela) return
    this.sala.addStream(this.tela, { target: peerId, metadata: { tipo: 'tela' } })
    this.ajustarEnvio(peerId)
  }

  despublicarTelaDe(peerId: string): void {
    if (!this.sala || !this.tela) return
    this.sala.removeStream(this.tela, { target: peerId })
  }

  pararTela(): void {
    if (!this.sala || !this.tela) return
    this.sala.removeStream(this.tela)
    for (const faixa of this.tela.getTracks()) faixa.stop()
    this.tela = null
  }

  /**
   * Qualidade e codec, aplicados DEPOIS da negociação.
   *
   * Medido em 2026-08-21 com duas abas ligadas por Trystero real:
   * `setCodecPreferences` não serve, porque logo após o `addStream` ainda não
   * existe transceiver nenhum. `setParameters` serve, porque só escolhe entre
   * o que já foi negociado — e o H.264 entra no SDP por padrão mesmo sem ser
   * o preferido. É o que aciona o encoder de hardware (Quick Sync e afins).
   */
  private ajustarEnvio(peerId: string): void {
    const pc = this.sala?.getPeers()[peerId]
    if (!pc) return
    const h264 = RTCRtpSender.getCapabilities?.('video')?.codecs
      .find((c) => c.mimeType.toLowerCase() === 'video/h264')

    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      const encoding = params.encodings?.[0]
      if (!encoding) continue
      encoding.maxBitrate = BITRATE_PADRAO
      encoding.scaleResolutionDownBy = Math.max(1, 1080 / ALTURA_PADRAO)
      if (h264) encoding.codec = h264
      // Falhar aqui degrada a qualidade, não a conversa: nunca derrubar a call
      // por causa de um ajuste de codificação.
      void sender.setParameters(params).catch(() => {})
    }
  }
```

> `sala.addStream` com `target` cria o sender só depois de renegociar, então `ajustarEnvio` precisa rodar um pouco depois. Chamar assim em `publicarTelaPara`: `setTimeout(() => this.ajustarEnvio(peerId), 1500)`.

- [ ] **Step 6: Reconciliar no `main.ts`**

A reconciliação é idempotente: a cada mudança do protocolo, publicar para quem falta e despublicar de quem sobra.

```ts
  let assistidoAntes: string[] = []
  let assistindoAntes: string[] = []

  protocolo.aoMudar(() => {
    const atual = protocolo.estado()

    for (const peerId of atual.naCall) {
      if (!naCallAntes.includes(peerId)) midia.publicarMicrofonePara(peerId)
    }
    naCallAntes = atual.naCall

    // A assinatura vira efeito: quem entrou na lista ganha a tela, quem saiu
    // perde. Sem espectador, o `removeStream` do último desliga o encoder.
    for (const peerId of atual.assistidoPor) {
      if (!assistidoAntes.includes(peerId)) midia.publicarTelaPara(peerId)
    }
    for (const peerId of assistidoAntes) {
      if (!atual.assistidoPor.includes(peerId)) midia.despublicarTelaDe(peerId)
    }
    assistidoAntes = atual.assistidoPor

    for (const peerId of assistindoAntes) {
      if (!atual.assistindo.includes(peerId)) removerVideoDe(peerId)
    }
    assistindoAntes = atual.assistindo

    desenhar()
  })
```

As ações ganham os quatro membros novos:

```ts
  const acoesCall: AcoesCall = {
    entrar: () => {
      void midia.ligarMicrofone(protocolo.estado().naCall)
        .then(() => protocolo.entrar())
    },
    sair: () => {
      protocolo.sair()
      midia.desligarMicrofone()
      midia.pararTela()
    },
    compartilhar: () => {
      void midia.compartilharTela(() => {
        protocolo.definirCompartilhando(false)
        midia.pararTela()
      }).then(() => protocolo.definirCompartilhando(true))
    },
    pararTela: () => {
      protocolo.definirCompartilhando(false)
      midia.pararTela()
    },
    assistir: (peerId) => protocolo.assistir(peerId),
    pararDeAssistir: (peerId) => protocolo.pararDeAssistir(peerId),
  }
```

E a faixa de vídeo que chega vira um `<video>` na área persistente:

```ts
  const videos = document.createElement('div')
  videos.className = 'call-videos'

  function removerVideoDe(peerId: string): void {
    videos.querySelector(`[data-de="${peerId}"]`)?.remove()
  }

  midia.aoReceberFaixa((faixa, de) => {
    if (faixa.kind === 'audio') {
      const el = document.createElement('audio')
      el.autoplay = true
      el.srcObject = new MediaStream([faixa])
      audios.append(el)
      return
    }
    removerVideoDe(de)
    const el = document.createElement('video')
    el.autoplay = true
    el.playsInline = true
    el.muted = true
    el.dataset['de'] = de
    el.srcObject = new MediaStream([faixa])
    videos.append(el)
  })
```

Acrescentar `videos` ao `app.replaceChildren(...)`.

- [ ] **Step 7: Estilos**

Acrescentar ao final de `src/ui/theme.css`:

```css
.call-videos {
  position: fixed;
  left: 16px; bottom: 72px;
  z-index: 14;
  display: flex; flex-direction: column; gap: 8px;
}
.call-videos video {
  width: min(420px, calc(100vw - 32px));
  border-radius: 10px;
  border: 1px solid var(--carvao-500);
  background: #000;
}
.call-sem-espectador { color: var(--texto-fraco); font-size: 11px; max-width: 200px; }
.call-audios { display: none; }
```

- [ ] **Step 8: Rodar a suíte e o build**

Run: `npm test && npm run build`
Expected: PASS, 416 testes. Build sem erro.

- [ ] **Step 9: Documentar**

Em `README.md`, acrescentar antes da seção **Privacidade**:

```markdown
### Call

Voz e compartilhamento de tela entre duas pessoas, pela mesma conexão direta
que o jogo usa — não há servidor de mídia no meio.

Entrar na call é um ato explícito: estar na sala não abre seu microfone. E
compartilhar a tela não liga o codificador — ele só começa a trabalhar quando
alguém clica em "Assistir", e desliga quando o último espectador sai. Isso é o
que permite várias pessoas compartilharem ao mesmo tempo sem derreter a
máquina de ninguém.

Não tem câmera, não captura o áudio do sistema (então assistir vídeo junto
entrega imagem sem som), e não funciona em celular.
```

Em `docs/verificacao-manual.md`, atualizar a contagem para 416 e acrescentar uma seção **Call** com, no mínimo:

```markdown
## Call

- [ ] Entrar na call em duas abas e ouvir um ao outro
- [ ] Estar na sala sem entrar na call não faz receber áudio de ninguém
- [ ] Compartilhar tela e **conferir que nada é codificado** até alguém clicar
      em Assistir (o aviso "ninguém está assistindo" aparece)
- [ ] Clicar em Assistir mostra a tela do outro
- [ ] Parar de assistir faz o aviso voltar
- [ ] Parar pela barra nativa do Chrome atualiza a interface corretamente
- [ ] Em `chrome://webrtc-internals`, confirmar codec **H264** e
      `encoderImplementation` citando MediaFoundation ou Quick Sync
- [ ] Fechar a aba de quem compartilhava limpa o vídeo do outro lado
- [ ] O anfitrião cair no meio da call não interrompe a conversa
```

Em `docs/roteiro.md`, marcar o plano 2 como executado.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Compartilha a tela so para quem pediu para assistir

O principio que veio da observacao do Alexandre: compartilhar tela nao liga o
codificador. A tela vira `addStream` com `target` apenas quando alguem pede, e
o `removeStream` do ultimo espectador desliga o encoder. A barra avisa quando
ninguem esta assistindo, para nao parecer que o compartilhamento falhou.

Qualidade e codec sao aplicados DEPOIS da negociacao, por `setParameters`,
como a sonda de 2026-08-21 mostrou ser o unico caminho pelo Trystero. Vao
juntos o teto de 720p — o probe mostrou o custo saltando ~3x em 1080p — e o
H.264, que e o que aciona o encoder de hardware.

`contentHint = 'motion'` e o botao que Discord e Meet nao expoem, e escolher
errado ali e a causa classica de tela travando.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Depois deste plano

A call 1:1 funciona: voz e tela, com assinatura explícita e H.264. Falta o acabamento, que vai para um plano 3: seletor de microfone e de saída, Picture-in-Picture, "entrar só ouvindo" quando o microfone é negado, e o resto dos casos de borda da §9 do spec.

**Nada da experiência foi verificado por teste automatizado** — só a lógica. Antes de abrir o PR, a call precisa ser aberta entre duas pessoas de verdade, com a lista de `docs/verificacao-manual.md` na mão.
