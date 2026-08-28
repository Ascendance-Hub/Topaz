# Onde paramos

Escrito em **2026-08-27**. Serve para a próxima sessão começar sabendo o estado
real, e não o estado que eu me lembro.

Os companheiros deste documento:

- [`roteiro.md`](roteiro.md) — o que existe e o que falta
- [`aprendizados-trystero-webrtc.md`](aprendizados-trystero-webrtc.md) — **leia
  a seção "A 0.25 mudou a arquitetura" antes de tocar em rede ou mídia**
- [`diario-de-bordo.md`](diario-de-bordo.md) — como chegamos aqui, e os erros
- [`verificacao-manual.md`](verificacao-manual.md) — o que só uma pessoa confere

---

## O estado agora

**Ciclo de refatoração em andamento**, desenhado em
`docs/superpowers/specs/2026-08-27-refatoracao-design.md` e planejado em
`docs/superpowers/plans/2026-08-27-refatoracao-bloco-1.md` e
`docs/superpowers/plans/2026-08-28-refatoracao-bloco-2.md`.

O pedido foi "melhoria de código, boas práticas, otimizações, tipagens", com
duas restrições dele: **não estragar feature existente** e **não atrapalhar
amigos**, que é a próxima feature.

| PR | O quê | Estado |
|---|---|---|
| 63 | O spec do ciclo | mergeado |
| 64 | Linter (ESLint 9 + typescript-eslint) e verificação **antes** do merge | mergeado |
| 65 | Quatro defeitos pequenos, cada um com teste | mergeado |
| 66 | Limpeza: exports internos, CSS órfão, comentários que mentiam | mergeado |
| 67 | `ui/slot.ts` — o `replaceWith` que congelava a tela | mergeado |
| 68 | `criarEmissor` — um lugar só para "avisar um ouvinte" | mergeado |
| 69 | Solta a voz de quem sai da sala | mergeado |

Fecham os Blocos 1 e 2. **Falta o Bloco 3**: partir o `main.ts` em seis peças
(`identidade/acoes`, `sala/pessoas`, `sala/presenca-local`, `sala/sincronizacao`,
`sala/desenho`, `sala/home`). Ele ainda não tem plano escrito — de propósito,
para ser escrito olhando o código como ele estiver então.

### O que o ciclo já pagou

Duas minas desarmadas **por causa de amigos**, e nenhuma das duas doía hoje:

- `sala-de-fundo.ts` guardava ouvintes em **slot único** — o segundo inscrito
  apagaria o primeiro em silêncio (PR 65).
- `apresentacao.ts` percorria a lista de ouvintes **viva e sem isolamento** — um
  estouro impedia os seguintes de saberem que alguém provou a identidade
  (PR 68).

As duas mordem no dia em que a `Apresentacao` for escutar a sala de presença,
que é exatamente o que amigos precisa.

### Um achado grande, e ele NÃO é refatoração

**O botão `Reconectar` racha a sala, de forma determinística** — medido com
controle em 2026-08-28. Está detalhado no
[roteiro](roteiro.md), na seção "A família não conecta".

Isso inverte o papel do botão: o Alexandre relata apertá-lo e continuar sozinho,
e por este caminho ele é a **causa**. É a caçada mais promissora que existe
agora, e ela tem PR próprio — **não** entra em PR de refatoração.

## O que a próxima sessão precisa saber antes de mexer em rede

**A Trystero 0.25 mudou a arquitetura sem nota de release.** Quatro defeitos
sérios desta sessão saíram daí. Está tudo em
[`aprendizados-trystero-webrtc.md`](aprendizados-trystero-webrtc.md), e o
resumo é:

- Uma `RTCPeerConnection` é **compartilhada entre salas** (`shared-peer.ts`).
- `removeStream` casa pelo **objeto**, não pelas faixas. Mudou na 0.25.
- `occupiedRooms` é indexado **só pelo `roomId`** — a config é ignorada.
- SDP de renegociação é **descartada** enquanto o peer não está ativo na sala.
- Uma sala **passiva se ativa** ao ser tocada, e passa a anunciar.
- A piscina de 20 ofertas morre quando a **última** sala fecha.

**E o truque que destrava tudo:** o `node_modules` só traz `dist`, mas a fonte
TypeScript inteira está nos **sourcemaps**. Extraia e leia antes de investigar.

---

## Defeitos conhecidos

**A fonte é o [roteiro](roteiro.md)**, seção "Defeitos conhecidos" — ela foi
reescrita em 2026-08-28 para juntar os três relatos de conexão numa família só,
separando o que está **medido** do que está **suposto**.

O resumo, para decidir se vale abrir:

- **`Reconectar` racha a sala** — determinístico, com controle. A caçada.
- **Trocar de grupo demora no notebook** — relatado, sem padrão.
- **Descoberta intermitente** — 2 de 4 em 44 s, com e sem presença.
- **A conexão reserva não é adotada** quando a rede dona cai.
- **Um teste intermitente** em `apresentacao.test.ts`, que depende de
  `crypto.subtle`.

Consertados no ciclo de refatoração, e por isso já **fora** da lista: o ouvinte
de `devicechange` pendurado, o codificador acordando por quem não assiste, o
diagnóstico da presença falando sozinho no console, e o `<audio>` órfão de quem
sai da sala.

## Decisão em aberto, agora com número

**Manter o MQTT?** Medido nesta sessão, com o app rodando sozinho numa sala
vazia: **60 `RTCPeerConnection` ociosas** (20 por estratégia × 3), ~26
websockets vivos, heap ~23 MB. **Nenhum vazamento** — cinco reconexões
deixaram tudo igual.

As 60 são a piscina do Trystero (`poolSize = 20`, constante da lib), então o
único botão real é o **número de estratégias**. O MQTT é justamente a rede que
conecta as máquinas do Alexandre, então quem estaria no banco dos réus é o
**torrent** — mas isso é uma medição só, e a decisão é dele.

---

## Como a gente trabalha

### O fluxo

`main` atualizada → branch → commits → push → PR. **Ele mesmo mergeia**, sempre.
Nunca commitar direto na `main`.

**Depois de todo push, conferir `gh pr view <n> --json state`.** Ele mergeia
rápido, e um commit empurrado para branch já mergeado fica órfão. Já aconteceu
seis vezes. O resgate é `cherry-pick` a partir da `main` atualizada.

### O navegador mudou o método

Esta sessão foi a primeira com **Chrome DevTools MCP**, e a diferença é de
natureza:

- **Reproduzir antes de pedir.** Os quatro defeitos foram reproduzidos aqui,
  com duas abas, antes de qualquer teste dele.
- **Dois só apareceram rodando o app de verdade** — o anúncio órfão e a
  contagem de observadores. Nenhum teste os pegaria.
- **Estrangular uma aba** (4× CPU, Slow 4G) imita a máquina lenta e torna a
  corrida reproduzível de propósito.
- **Matar o vite pelo PID.** Parar a tarefa em segundo plano não mata o
  processo filho, e ele continua servindo código velho na porta.

**O que o navegador não substitui:** NAT diferente, wifi de verdade, relays
alcançáveis diferentes por máquina. Duas abas conectam por candidato de host.
Ele continua sendo o teste final — só parou de ser o primeiro.

### O tom

Português, informal, direto. Ele quer **o porquê** junto com o quê — decisões
descartadas, limitações e o que não foi resolvido valem tanto quanto o que
funcionou. Ele lê os comentários do código e os corpos de PR.

Ele corrige quando eu erro, e as correções dele costumam estar certas.

### O que ele já disse explicitamente

- **Não publicar no site o que não protege.** No máximo explicar que os códigos
  de sala são públicos.
- **Não frustra com defeito.** *"Software é difícil de fazer e estamos fazendo
  algo que não tem documentação nem padrão de nada."* Não é licença para
  insistir num caminho ruim — é permissão para investigar com calma.
- **Presença conta *quantos*, não *quem*.** O quem é a feature de amigos.

---

## A lição que eu levaria para qualquer projeto

Quatro defeitos sérios caíram numa sessão só, e nenhum foi resolvido pensando:
todos foram resolvidos **lendo a fonte da biblioteca** e **rodando o app**.

> O que a biblioteca casa por objeto e o que ela casa por faixa, o que ela
> indexa e o que ela ignora, quando ela descarta uma mensagem em silêncio —
> **isso é contrato**, e pode mudar numa versão menor sem ninguém avisar.
> Depois de subir de versão, reler os próprios aprendizados perguntando "isto
> ainda é verdade?".

E o corolário, que custou três investigações nesta sessão e uma na anterior:

> **Antes de medir, perguntar: quais respostas este instrumento NÃO distingue?**
> E sempre medir o **controle** — sem o controle, eu teria "consertado" a coisa
> errada pela quinta vez.
