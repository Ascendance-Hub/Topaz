# Onde paramos

Escrito em **2026-08-26**, ao fim de uma sessão longa. Serve para a próxima
começar sabendo o estado real, e não o estado que eu me lembro.

Os companheiros deste documento:

- [`roteiro.md`](roteiro.md) — o que existe e o que falta
- [`diario-de-bordo.md`](diario-de-bordo.md) — como chegamos aqui, e os erros
- [`verificacao-manual.md`](verificacao-manual.md) — o que só uma pessoa confere

---

## O estado agora

**⚠️ Há um PR aberto e não mergeado: o [#57](https://github.com/Ascendance-Hub/Topaz/pull/57).**

Ele devolve o `src/` ao estado do PR 45 — o último que o Alexandre testou e
aprovou. **Enquanto ele não for mergeado, a `main` está com a presença ligada,
e trocar de grupo está lento e inconstante.**

Primeira coisa a fazer na próxima sessão: conferir se o #57 foi mergeado. Se
não foi, perguntar antes de qualquer outra coisa.

### O que funciona

Tudo que estava no PR 45, mais os PRs 46 a 56 que não são do app:

- Sala, call, canais de voz, chat por canal, jogos, formato de partida
- Identidade estável, grupos salvos, troca de foto
- A coluna da esquerda, a roda de rostos, a troca chat ↔ palco

### O que está de fora

**Presença entre grupos** (quem está online em cada sala salva). Quatro
tentativas, quatro vezes atrapalhando a conexão. O código do módulo continua no
repositório, mas **o app não o importa** — só a sonda usa.

---

## A saga da presença, resumida

Está contada por inteiro no Capítulo 13 do diário. O essencial:

**A causa foi encontrada.** A presença ouvia só o nostr, e as máquinas do
Alexandre se acham por **mqtt**. O diagnóstico que provou:

```
sala (15s): relays nostr abertos 16 · peers 1 · por rede: nostr=0 mqtt=1 torrent=0
```

**E mesmo corrigida, ela continuou atrapalhando.** Com as três redes, cada
grupo observado abre três salas — e elas colidem com o ciclo de vida da sala de
verdade. O Trystero:

- devolve **a mesma sala** ao entrar num id já registrado (`strategy.mjs:79`);
- só desregistra a sala ~100 ms depois do `leave` (`room.mjs`);
- destrói a piscina de relays quando a última sala fecha.

Isso cria três colisões ao trocar de grupo, todas corrigidas e nenhuma
suficiente. A última versão esperava a conexão ficar de pé antes de observar —
e ainda assim ficou inconstante.

### O que a próxima tentativa precisa ter

1. **Um id de sala próprio para presença** (`codigo#presenca` ou parecido), para
   que a sala de fundo nunca possa ser confundida com a de verdade. Some a
   família inteira de bug, sem `await` e sem tocar no ciclo de vida.
2. **Nada na entrada da sala.** Nem observar, nem fechar, nem esperar.
3. **Um jeito de reproduzir numa máquina só**, antes de pedir teste ao usuário.

### O que continua sem explicação

Entre as **mesmas duas máquinas**, o nostr acha uma sonda e não acha o app.
Isso foi contornado, não entendido. Se alguém retomar a presença, esta é a
pergunta que ficou.

---

## A sonda

`/Topaz/sonda/` — página à parte, sem link, com `noindex`. Não é
funcionalidade: é o instrumento que respondeu à investigação.

Cinco modos: entrar ativo, observar passivo, observar ativo (controle),
observar pelo módulo do app, e observar pela sala de fundo sem o módulo. Os
dois últimos existem para bissectar o código real em vez de reimplementá-lo.

**Ela pode ser apagada** quando a presença for resolvida ou abandonada de vez.
Enquanto isso, é a única coisa que mede esse comportamento.

---

## O que falta no roteiro

- **Amigos** (item 6). Depende da presença para "amigo online"; a metade que
  não depende — guardar pessoas pela identidade em vez de salas — dá para
  fazer sozinha.
- **Presença entre grupos** (item 3), agora sem data.

E os defeitos conhecidos que sobraram:

- **A conexão reserva não é adotada** quando a rede dona cai.
- **`Reconectar` reentra na conexão velha**, porque `joinRoom` devolve a mesma
  sala num id já registrado. Descoberto nesta sessão; a correção óbvia (esperar
  a saída) destrói a piscina de relays, então ficou sem conserto.
- **Um teste intermitente** em `apresentacao.test.ts` ("reconectar prova de
  novo"), que depende de `crypto.subtle`.
- **Manter o MQTT?** Agora há um argumento novo a favor: é a rede que
  efetivamente conecta as máquinas do Alexandre.

---

## Como a gente trabalha

Registrado porque a próxima sessão não vai lembrar, e porque mudar isso no meio
custa caro.

### O fluxo

`main` atualizada → branch → commits → push → PR. **Ele mesmo mergeia**, sempre.
Nunca commitar direto na `main`.

**Depois de todo push, conferir `gh pr view <n> --json state`.** Ele mergeia
rápido, muitas vezes enquanto eu ainda trabalho, e um commit empurrado para
branch já mergeado fica órfão — some sem erro. Isso aconteceu **seis vezes**
neste projeto. O resgate é `cherry-pick` a partir da `main` atualizada.

### A revisão

Quando o PR mexe em algo visível, subir `npx vite --port 5173 --strictPort` e
ele olha antes de mergear. Matar a tarefa em segundo plano **não mata o vite** —
conferir a porta e matar pelo PID.

Ele testa com **duas máquinas** (PC e notebook) no site publicado. É o teste
que vale, e é caro: cada rodada é tempo dele.

### O tom

Português, informal, direto. Ele quer **o porquê** junto com o quê — decisões
descartadas, limitações e o que não foi resolvido valem tanto quanto o que
funcionou. Ele lê os comentários do código e os corpos de PR.

Ele corrige quando eu erro, e as correções dele costumam estar certas. Vale
tratá-las como dados, não como opinião.

### O que ele já disse explicitamente

- **Não publicar no site o que não protege.** No máximo explicar que os códigos
  de sala são públicos.
- **Não frustra com defeito.** Disse isso quando a presença falhava pela
  terceira vez: *"software é difícil de fazer e estamos fazendo algo que não
  tem documentação nem padrão de nada"*. Isso não é licença para insistir num
  caminho ruim — é permissão para investigar com calma.

---

## O que muda na próxima sessão

Ele foi configurar um **servidor MCP de navegador** (Chrome DevTools). Se
estiver disponível, o método muda:

- **Reproduzir antes de pedir.** Quase tudo que a caçada da presença perseguiu
  era reproduzível numa máquina só — sonda contra sonda, módulo contra sonda.
  Isso deve ser feito aqui, não por ele.
- **Ver a tela antes de teorizar sobre ela.** A barra de controles cobrindo os
  canais custou rodadas de caça a exceção em JavaScript; uma captura resolveria
  em segundos.
- **Ler o console direto**, em vez de pedir que ele copie e cole.

O que **não** muda: duas máquinas de verdade continuam insubstituíveis. NAT
diferente, rede diferente, relays alcançáveis diferentes. Ele continua sendo o
teste final — só deve parar de ser o primeiro.

---

## A lição que eu levaria para qualquer projeto

Instrumentei **três vezes** nesta sessão antes de instrumentar direito:

- a primeira sonda só media sonda contra sonda, nunca contra o app — que era a
  pergunta;
- o primeiro diagnóstico só falava quando alguém entrava, então silêncio não
  distinguia "não achou" de "nem tentou";
- o segundo saía uma vez só, aos 8 s, e não apareceu.

É o mesmo erro do Capítulo 5, com a sonda que media o codificador errado.

> **Antes de medir, perguntar: quais respostas este instrumento NÃO
> distingue?**
