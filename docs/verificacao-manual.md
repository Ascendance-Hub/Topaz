# Verificação manual — pendente

Tudo neste projeto foi verificado por testes automatizados (245, rodando sem
navegador) e por revisão de código. **Nada foi verificado num navegador de
verdade.** Os itens abaixo só podem ser conferidos por uma pessoa.

Para rodar: `npm run dev`, e abra **três abas** — uma delas anônima, para
simular um navegador separado.

## Partida

- [ ] Três jogadores em abas separadas completam uma rodada
- [ ] Dobrar debita a aposta extra e entrega exatamente uma carta
- [ ] Dividir cria duas mãos, jogadas em sequência, e **as duas ficam visíveis**
- [ ] Split de Ases recebe uma carta por mão e encerra
- [ ] Seguro só aparece quando o dealer mostra Ás, e a fase termina assim que
      todos respondem (sem esperar os 30s)
- [ ] Blackjack natural paga 3:2
- [ ] As cartas de quem parou continuam na tela até o fim da rodada, com o
      resultado
- [ ] O dealer compra uma carta por vez, com pausa visível entre elas
- [ ] A barra de tempo do turno anda de verdade

## Rede

- [ ] Fechar a aba do anfitrião não encerra a partida — outro jogador assume e
      a mão em andamento continua
- [ ] Depois da migração, a barra do topo passa a indicar o novo anfitrião
- [ ] Recarregar a aba de um jogador dentro de 60s devolve cadeira e fichas
- [ ] Passados 60s sem voltar, ele some da mesa e a cadeira é liberada
- [ ] Jogador inativo é pulado em 30s e vira espectador em duas rodadas

> **O item mais importante da lista é a migração de anfitrião com três abas.**
> Toda a lógica de eleição e migração foi validada contra uma rede falsa em
> memória. Ela imita o comportamento do Trystero de perto, inclusive a demora
> para os peers aparecerem — mas continua sendo uma imitação. Se algo tiver
> escapado, é aqui.

## Aparência

- [ ] A grade reflui de 3 para 2 colunas em tela estreita
- [ ] Com "reduzir movimento" ligado no sistema operacional, as cartas aparecem
      no lugar certo (sem voo) e a barra de tempo mostra uma posição estática
      correta em vez de ficar cheia

## Publicação

- [ ] O site publicado carrega em `https://ascendance-hub.github.io/Topaz/`

Para publicar: fazer merge na `main` e, em **Settings → Pages**, definir
**Source: GitHub Actions**. O workflow já existe e roda os testes antes do
build.

---

## Limitações conhecidas

Não são defeitos a corrigir — são consequências assumidas do desenho, listadas
para você saber o que esperar.

**Se duas mesas se formarem separadamente e depois se encontrarem**, uma delas
vence (a que tiver mais jogo) e a outra é descartada com as fichas. É raro:
exige a conexão demorar mais de 2,5s *e* alguém ter entrado no lado perdedor.

**Se dois jogadores nunca conseguirem se enxergar entre si mas ambos enxergarem
um terceiro**, esse terceiro pode ver a mesa alternando entre as duas — cada
troca é para uma mesa com mais jogo que a anterior, então não gira em círculo,
mas pisca enquanto as duas avançam. Isso é uma divisão que não tem como ser
resolvida sem os dois primeiros se conectarem; nenhuma escolha nossa conserta.

**Se o relay de descoberta estiver totalmente inacessível**, cada jogador vê uma
mesa normal com "aguardando jogadores" — indistinguível de uma sala vazia. O
aviso explícito de falha só aparece quando existe um peer visível mas silencioso.

**Se vários jogadores entrarem ao longo de mais de 15 segundos**, a tela pode
mostrar "não foi possível conectar" mesmo com a sala ainda se formando. Corrige
sozinho quando as conexões assentam.

**Criar uma sala sozinho custa até 2,5 segundos** numa tela de "conectando".
É o preço de não decidir quem manda a partir de uma lista de peers vazia.

**Entrar numa sala expõe o seu IP aos outros participantes.** Isso é inerente ao
WebRTC, não uma falha desta implementação. O código de sala de 8 caracteres
(gerado com `crypto.getRandomValues`, ~8,5 × 10¹¹ combinações) é o que impede um
estranho de entrar. Mande o link só para quem você quer na mesa.

## Decisões em aberto

Coisas deliberadamente não implementadas, para você decidir:

- **Apostas** são 25, 100 ou 500 — valores fixos, não combináveis. Não dá para
  apostar 250.
- **Sem *dealer peek***: com Ás ou dez à mostra, os jogadores jogam a mão inteira
  antes de o dealer revelar um blackjack natural, e perdem também o que
  dobraram ou dividiram.
- **Espectadores não aparecem** na mesa para os outros jogadores.
- **Faltam duas animações** do spec: a virada da carta oculta do dealer e o
  contador de fichas interpolado.
