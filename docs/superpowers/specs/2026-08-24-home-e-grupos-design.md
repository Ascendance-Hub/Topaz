# Home de apresentação, call mais limpa e grupos persistentes

Ciclo de dois PRs. Este documento guarda as decisões e **por que** foram
tomadas — inclusive as que contrariam o que eu tinha proposto.

- **PR 1:** home de apresentação, tela de call mais limpa, quem está falando.
- **PR 2:** grupos persistentes, por cima da home.

A ordem não é arbitrária: os grupos moram na home, então a home precisa
existir antes.

---

## 1. O problema

A tela inicial é "uma tela com botões", e a tela de sala acumulou avisos de
diagnóstico que só interessam quando algo dá errado. Quem recebe um link não
descobre o que o site é, e quem usa não vê as pessoas — vê um número.

## 2. O que é um grupo (decidido: marcador local)

**Um grupo é um atalho salvo no navegador:** nome, código da sala, cor. Quem
"está no grupo" é quem está na sala **agora**.

Descartado: sincronizar a lista de membros entre peers, para ver quem faz
parte mesmo offline. Seria mais parecido com servidor do Discord, mas custa
uma superfície nova de sincronização — juntar listas divergentes, sem
autoridade, forjável — logo depois de um ciclo inteiro estabilizando conexão.
Fica registrado como possível evolução, não como falta.

Consequência honesta: um grupo é **por dispositivo**. Entrar no mesmo grupo
noutro computador exige o link de novo. É o preço de não ter banco de dados, e
a interface não deve fingir o contrário.

## 3. A home (decidido: híbrida)

Quem chega pela primeira vez vê apresentação. Quem já tem grupos salvos vê os
grupos em cima e a apresentação abaixo. Dá para saber qual é o caso lendo o
`localStorage`, então não custa nada — e cada pessoa vê o que serve para ela.

No PR 1 só existe a apresentação, porque grupos ainda não existem.

### O herói

**"Sem ninguém no meio."** É a única coisa que o Topaz tem e o Discord não, e
é literalmente verdade: DTLS ponta a ponta, sem servidor no caminho. A ousadia
visual é gasta aí.

### O que a home diz sobre segurança — e o que ela NÃO diz

Minha proposta original era publicar a tabela inteira de "quem vê o quê",
**incluindo o que não conseguimos proteger**, com o argumento de que admitir
limites gera confiança.

**Rejeitado pelo dono do projeto, e com razão.** Numa página pública isso é
entregar mapa de superfície de ataque, e é má escrita de produto: uma vitrine
não é lugar de modelo de ameaça.

A home diz o que **é** protegido e a única coisa sobre a qual a pessoa pode
agir:

> O conteúdo é cifrado de ponta a ponta — voz, tela e mensagens não passam por
> servidor nenhum. **O código da sala é a chave dela:** quem tem o link, entra.
> Trate como senha.

O levantamento completo continua em `docs/diario-de-bordo.md`, que é
documentação de engenharia e não vitrine.

### O teste de rede

A *explicação* (o que é, o que cada resultado significa, os servidores de
descoberta) vai para a home. Mas **o teste em si continua acessível de dentro
da sala**, porque é lá que ele serve: na máquina que está falhando, no momento
em que a pessoa está sozinha. Sai o bloco grande do palco; fica uma linha que
abre o painel.

## 4. Diferenciar do Discord sem quebrar a mão — Lei de Jakob

> As pessoas passam a maior parte do tempo em outros sites, e por isso esperam
> que o seu funcione como os que elas já conhecem.

A saída é separar duas camadas:

| Camada | Decisão |
|---|---|
| Onde a mão vai | **convenção**: barra de controles no rodapé, ordem microfone → tela → sair, círculo para pessoa, anel para quem fala |
| Material | **nosso**: feltro e latão, Bodoni nos títulos, a luz do abajur, anel de topázio em vez do verde |

A pessoa reconhece *como usar* em segundos, e percebe que não é o Discord no
mesmo tempo.

## 5. Quem está falando

`AudioContext` único, um `AnalyserNode` por stream, RMS do domínio do tempo
lido no `requestAnimationFrame`.

**Dois limiares, não um.** Sobe em `LIMIAR_LIGA`, e só desce depois de ficar
abaixo de `LIMIAR_DESLIGA` por `MS_SEGURA`. Com um limiar só, o anel pisca em
cada pausa entre palavras — o que chama mais atenção que o próprio falar.

Três regras que saem de erros já pagos neste projeto:

1. **O analisador morre junto com o stream.** Sem isso é vazamento — a mesma
   família do `srcObject` que ficava pendurado.
2. **É independente do mudo.** Silenciar alguém não pode apagar o anel dela:
   quem silenciou precisa saber que a pessoa está falando, senão pergunta "cadê
   você?" para alguém que está respondendo.
3. **Vale para você também.** Ver o próprio anel acender é como a pessoa
   descobre que o microfone funciona sem precisar perguntar "tá me ouvindo?".

A decisão de limiar fica num módulo **puro**, separada da captura, pelo mesmo
motivo que `protocolo.ts` é separado de `midia.ts`: histerese se testa com
números, não com microfone.

Os valores nascem estimados e **precisam de ajuste com voz real** — está na
verificação manual.

## 6. O que NÃO muda

- Regras do jogo (`src/game/`) e `Sessao`.
- A camada de rede: nada de novo trafega. O nível de voz é medido **localmente**
  sobre o áudio que já chega.
- O código da sala, o transporte, as três redes de descoberta.
