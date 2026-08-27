# Refatoração: qualidade de código sem estragar o que funciona

Ciclo de refatoração em 12 PRs. Este documento guarda o que foi encontrado, o
que foi decidido, o que foi **descartado** e por quê.

O pedido do dono do projeto foi "melhoria de código, boas práticas,
otimizações, tipagens", com uma restrição em letra garrafal: **não estragar
feature existente**. E, no meio do desenho, uma segunda: **não atrapalhar a
próxima feature, que é amigos e saber quem está online em cada sala.**

As duas restrições moldaram o plano mais do que qualquer preferência de
arquitetura.

---

## 1. O que este ciclo é — e o que ele não é

**Não é limpeza de bagunça.** O levantamento apontou o contrário: zero `any`,
zero `@ts-ignore`, zero `!` não-nulo em código de produção, `strict` e
`noUncheckedIndexedAccess` ligados, testes de isolamento guardando as camadas,
e comentários que explicam o *porquê* melhor que a maioria dos projetos pagos.

O que existe é um problema específico e alguns restos. O ciclo trata deles e
para. Refatoração que vira reescrita é a forma mais comum de estragar software
que funcionava.

---

## 2. A linha de base, medida antes de tocar em nada

```
1179 testes em 67 arquivos, todos passando, 31,3 s
npm run build limpo
bundle: 100 kB (principal) + 427 kB (as três redes)
```

Registrada por causa da lição do Capítulo 14 do diário: uma suíte que "passou
de 18 s para 32 s" custou uma investigação inteira porque ninguém tinha medido
o baseline — os 18 s eram cache quente, e a `main` já estava em 31,75 s.

**Todo PR deste ciclo é comparado contra esses números.**

---

## 3. O que foi encontrado

### 3.1 Estrutura

- **`main.ts` tem 1.175 linhas**, e `entrarNaSala` é uma closure de ~1.000
  delas: ~20 variáveis mutáveis e ~25 funções internas se enxergando. A função
  `desenhar()` sozinha tem 140 linhas.
- **`iniciarApp` duplica** as ações de identidade e o painel de teste de rede
  que já existem dentro de `entrarNaSala` — ~50 linhas escritas duas vezes.
- **`presenca/sala-de-fundo.ts` reimplementa "entrar nas três redes"** à parte
  de `net/salas.ts`, com três `as unknown as`. Duas versões do mesmo conceito.

### 3.2 Repetição mecânica

| Padrão | Ocorrências |
|---|---|
| `document.createElement` | 226, em 28 arquivos |
| `.className = ` | 198 |
| `.textContent = ` | 127 |
| `replaceWith` + reatribuir a variável | 9, só no `main.ts` |
| `aoX(cb) { lista.push(cb) }` | 6 implementações do mesmo emissor |
| memoização por string de assinatura | 3, cada uma com regra própria |

Sobre o emissor repetido, uma ressalva que muda o conserto: **cinco das seis
podem compartilhar, a sexta não.** `src/call/protocolo.ts` tem um teste que
proíbe `from '../` (`isolamento.test.ts`), justamente para a metade testável da
call continuar testável sem navegador — e é por isso que o `notificar` dele foi
escrito à mão, com um comentário dizendo que é cópia de propósito. O guarda
está certo e não vai ser afrouxado: a cópia local fica, com o comentário
apontando para o guarda.

O par `replaceWith` + reatribuir merece nota: o comentário no topo do `main.ts`
explica que chamar `replaceWith` sobre uma referência antiga mexe num nó já
órfão e a tela para de acompanhar. A defesa contra isso hoje é lembrar de
reatribuir, nove vezes.

### 3.3 Defeitos pequenos, achados na leitura

1. **`Midia.definirQualidade` liga o codificador de quem não assiste.** Ela
   chama `ajustarEnvio(peerId, true)` para todo peer já publicado, e não só
   para quem está assistindo. O tique de 500 ms reconcilia, então a janela é
   curta — mas é real, e vai contra o desenho inteiro da assinatura explícita.
2. **`presenca` imprime `console.info` a cada 10 s em produção, para sempre.**
   Instrumento da caçada do Capítulo 13 que ficou ligado.
3. **O ouvinte de `devicechange` nunca é removido** — já registrado no roteiro.
4. **`sala-de-fundo.ts` guarda ouvintes em slot único** (`aoEntrar = cb`).
   Ver §5, porque este é o que importa.

### 3.4 Sobra

- ~43 exports que nenhum outro arquivo importa (constantes e tipos internos).
- 5 classes CSS órfãs: `.nav-sala`, `.nav-sala-item`, `.nav-sala-marca`,
  `.home-linha`, `.home-ponto` — restos do botão "Mesa" e da home antiga.
- `Presenca.fecharUm`: 6 testes, **zero uso em produção**.
- Não há linter. Todo o rigor de tipos é disciplina, não garantia.
- 36 dos 67 arquivos de teste sobem happy-dom: 135 s de *environment* para
  31 s de suíte.

### 3.5 A biblioteca

A fonte da Trystero 0.25.3 foi extraída dos sourcemaps (6.822 linhas) e os
contratos documentados em `aprendizados-trystero-webrtc.md` foram reconferidos
um por um. **Todos continuam valendo:**

| Afirmação | Confirmado em |
|---|---|
| `occupiedRooms` indexado só pelo `roomId` | `strategy.ts:213` |
| `leave` espera um envio + 99 ms | `room.ts:162` |
| `poolSize = 20`, piscina destruída na última sala | `offer-pool.ts:7`, `strategy.ts:698` |
| `removeStream` casa pelo objeto (`streamOwners`) | `shared-peer.ts:350` |
| `onPeerJoin` é propriedade de handler único | `room.ts:374` |
| SDP de renegociação descartada fora do `activePeerMap` | `room.ts:222` |

Nenhuma decisão deste ciclo depende de contrato não verificado.

---

## 4. Decisões

### 4.1 Profundidade: moderado

Três caminhos foram apresentados. O escolhido inclui partir o `main.ts`; a
varredura dos 28 componentes de UI e a unificação das duas implementações de
rede ficam de fora, como cardápio para depois.

**Por que não o conservador:** deixaria o `main.ts` com 1.175 linhas, que é o
problema principal.

**Por que não o agressivo agora:** tocar praticamente todo arquivo do projeto
de uma vez é o oposto de "não estragar o que funciona". E o moderado é prefixo
do agressivo — nada aqui fecha porta nenhuma. Depois de o `main.ts` estar
partido, cada varredura mexe em arquivos pequenos e isolados, com risco menor
por PR do que teria hoje.

### 4.2 Como partir o `main.ts`: extrair peças coesas

**Descartado — virar uma classe `Sala`.** Mecanicamente é o mais seguro
possível (closures viram métodos, quase um rename). Mas trocaria uma closure de
mil linhas por uma **classe** de mil linhas: as ~20 variáveis virariam ~20
campos que os ~25 métodos continuam todos enxergando. Muda a forma, não o
acoplamento.

**Descartado — estado central com desenho derivado.** É o caminho "moderno" e é
o mais perigoso aqui, com a evidência vindo do próprio diário: os Capítulos 1 e
11 registram **quatro** ocorrências da mesma família de bug — elemento com
estado vivo (campo de texto, `<video>`, `<details>`, `<input type="file">`)
recriado por um desenho periódico. A defesa atual é a disciplina de "o que
guarda estado vivo é irmão do que é redesenhado", espalhada por dezenas de
decisões pontuais dentro do arquivo. Um render derivado teria que reconstruir
essa defesa inteira do zero, e nenhum teste acusaria a falta dela.

### 4.3 Linter: focado, não recomendado-completo

ESLint + typescript-eslint com um conjunto pequeno e escolhido: proibir `any`,
`@ts-ignore`, `!` não-nulo, promessa não tratada (`no-floating-promises`) e
variável/import morto. **Nada de estilo, nada de formatação.**

O preset `strict-type-checked` foi descartado: acusaria dezenas de pontos hoje
legítimos, e cada um viraria decisão ou `eslint-disable`. Ruído antes de valor.

O conjunto escolhido passa limpo no código atual — ele **documenta o padrão que
já existe** em vez de criar trabalho. `no-floating-promises` merece destaque:
vários dos bugs de mídia deste projeto moraram exatamente numa promessa que
ninguém escutava.

### 4.4 Os defeitos pequenos: PR próprio

Eles entram no ciclo, mas **num PR só, separado de tudo**. O ganho não é de
organização: é que assim **todo PR de refatoração fica estritamente sem mudança
de comportamento**, e se algo quebrar em uso real dá para saber qual PR foi
olhando só o título.

### 4.5 `Presenca.fecharUm` fica

É código morto hoje — mas é o que o código *deveria* estar chamando. O caminho
que existe (`presencaHome.encerrar()` antes de entrar na sala) fecha **todas**
as salas de fundo, e os aprendizados dizem que fechar a última sala destrói a
piscina de 20 ofertas do Trystero. Isso é candidato à descoberta intermitente,
e a resposta é **medir com duas abas**, não apagar nem ligar às cegas.

Fica registrado no roteiro como medição pendente.

---

## 5. Amigos: a restrição que moldou o ciclo

A próxima feature é **amigos + saber quem está online em cada sala** (PR 6 do
spec de 2026-08-25, que depende de identidade e de presença). O ciclo de
refatoração não pode atrapalhá-la. Três achados:

### 5.1 O que já está pronto e não deve ser tocado

`Apresentacao` recebe uma interface **estreita** — `CanalIdentidade`, com
`enviarIdentidade`/`aoReceberIdentidade`/`aoEntrarPeer`/`aoSairPeer` — e **não**
o `Transporte`. A prova de identidade pluga na sala de presença sem mudar uma
linha dela. Isso foi bem desenhado; o ciclo não encosta.

`observarGrupos` guarda `gente: Set<string>` por grupo, não um contador —
`quem(codigo)` é uma linha. **Regra do ciclo: esse `Set` não vira número.**
Trocá-lo por um contador seria "otimizar" 8 bytes destruindo a feature
seguinte.

### 5.2 A mina, e por que ela entra no PR 2

`sala-de-fundo.ts` guarda os ouvintes em slot único:

```ts
let aoEntrar: ((peerId: string) => void) | null = null
// ...
aoEntrarPeer: (cb) => { aoEntrar = cb },     // ← o segundo apaga o primeiro
```

É exatamente a armadilha do Trystero que `net/salas.ts` já resolveu com lista +
`avisarTodos`, e que o diário registra assim: *"um módulo novo funciona e um
módulo antigo para de receber avisos, em silêncio, sem erro no console"*.

Hoje não dói: só existe um consumidor, a contagem. No dia em que amigos puser a
`Apresentacao` na sala de presença, são **dois** — e o segundo apaga o primeiro
sem erro nenhum. É o sintoma mais caro de diagnosticar deste projeto.

Trocar os dois slots por listas **não muda nada hoje** e tira a mina do
caminho. Há 19 testes de integração cobrindo essa sala.

### 5.3 O que fica para quando amigos chegar

A unificação `sala-de-fundo.ts` ↔ `net/salas.ts` — as duas implementações
paralelas das três redes — **não entra neste ciclo**. Amigos vai precisar dela
(a sala de presença vai querer mais de uma ação e mais de um ouvinte), e o
momento natural é *junto com* a feature, quando o requisito estiver na mesa em
vez de suposto. Nada neste ciclo a dificulta.

---

## 6. O plano: 12 PRs em quatro blocos

### Bloco 1 — chão firme (risco praticamente nulo)

| PR | O quê |
|---|---|
| 1 | **Linter.** ESLint + typescript-eslint com as regras de §4.3, passo no CI. |
| 2 | **Correções.** `definirQualidade` · `console.info` da presença atrás de `?diag=presenca` · `devicechange` removido no `encerrar` · os dois slots únicos de `sala-de-fundo.ts` viram listas. **Único PR do ciclo que muda comportamento.** |
| 3 | **Limpeza.** Exports desnecessários, classes CSS órfãs, `fecharUm` registrado no roteiro. |

### Bloco 2 — helpers

| PR | O quê |
|---|---|
| 4 | **`ui/slot.ts`** — o par `replaceWith` + reatribuir. Mata a classe de bug do nó órfão. |
| 5 | **`net/emissor.ts`** — o emissor repetido, unificado sobre o `avisarTodos` que já existe. Cinco dos seis lugares; `call/protocolo.ts` mantém a cópia local por causa do guarda de isolamento (§3.2). |
| 6 | **`ui/el.ts`** — helper tipado de DOM. Aplicado nos 5 `createElement` do próprio `main.ts` e em todo arquivo novo dos blocos seguintes. A varredura dos 28 componentes existentes **não** entra. |

O critério do PR 6 é deliberado: um helper que ninguém usa é pior que helper
nenhum, e uma varredura de 28 arquivos é pior que os dois. Aplicá-lo só onde o
ciclo já mexe prova o helper em código de verdade sem inflar diff nenhum.

### Bloco 3 — partir o `main.ts`

| PR | Peça | O que leva |
|---|---|---|
| 7 | `identidade/acoes.ts` + `ui/painel-rede.ts` | as duas duplicações **literais** entre sala e home |
| 8 | `sala/pessoas.ts` | `fotos`, `selos`, `falantes`, `apelidoDe`, `fonteDeParticipantes`, `invalidarRostos` |
| 9 | `sala/presenca-local.ts` | `anuncio`, `presencaLiberada`, `desmontado`, a tranca |
| 10 | `sala/sincronizacao.ts` | `sincronizarMidia`, `sincronizarMedidorDeVoz`, o tique |
| 11 | `sala/desenho.ts` | o roteador de telas de `desenhar()` |
| 12 | `sala/home.ts` | tirar `iniciarApp` do `main.ts` |

Os PRs 8, 9 e 12 são os que amigos vai usar: o registro de quem é quem, a
presença local, e a home onde a faixa de amigos vai morar.

Ao fim, `main.ts` é fiação: monta as peças, liga uma na outra, e acaba.
Estimativa: 200 a 300 linhas.

### Bloco 4 — o cardápio (fora deste ciclo)

Decididos um a um, depois, e nesta ordem de valor:

1. Unificar `sala-de-fundo.ts` com `net/salas.ts` — junto com amigos.
2. Tipos mais estritos na fronteira de rede.
3. Varredura do `ui/el.ts` pelos 28 componentes — por último, porque é a de
   pior relação valor/risco: toca quase todo arquivo e não muda um pixel.
4. Acelerar a suíte (os 135 s de *environment*).

---

## 7. A regra que protege as features

> **Se um PR de refatoração precisar alterar um teste existente para passar, o
> PR está errado.**

A única exceção é caminho de import. Os 1.179 testes de hoje são o contrato do
comportamento atual; refatoração que renegocia o contrato não é refatoração.

O PR 2 é a exceção declarada — ele muda comportamento de propósito, e por isso
está sozinho.

Além disso, e valendo para todo PR:

- `npm test` e `npm run build` limpos, comparados contra a linha de base de §2.
- Servidor local antes do merge, conferido no navegador.
- O dono do projeto mergeia. Nunca commitar direto na `main`.
- Conferir `gh pr view <n> --json state` depois de todo push — já custou seis
  commits órfãos neste projeto.

---

## 8. Riscos conhecidos

**O PR 9 é o mais perigoso.** A presença local carrega a tranca (`desmontado`,
`presencaLiberada`) cuja ausência já produziu anúncio órfão em uso real, e a
lógica é sutil o bastante para caber num comentário de 15 linhas. Mitigação: o
teste "todo anúncio criado é fechado ao sair da sala" já existe e guarda
exatamente essa invariante — e ele **não pode** ser alterado.

**O PR 10 mexe no caminho de mídia**, que é onde moraram quase todos os bugs do
projeto. Mitigação: é movimento puro, sem mudança de lógica, e a
`sincronizarMidia` é idempotente por construção — a propriedade que a torna
segura de mover é a mesma que a fez funcionar.

**Cobertura desigual.** `main.test.ts` tem 1.363 linhas e cobre bem o que
quebraria (chat sobrevivendo a re-render, sala↔mesa, a marca da mesa, a call
convivendo com a eleição, os canais, o anúncio órfão). Mas **não** cobre
diretamente as ações de identidade, `acenderQuemFala` nem as três memoizações.
Onde faltar teste, ele é escrito **antes** do movimento, no mesmo PR.
