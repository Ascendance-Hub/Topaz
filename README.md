# Topaz

Hub de jogos de mesa para jogar com amigos direto do navegador. Sem servidor,
sem cadastro: os navegadores conversam entre si por WebRTC.

Para se acharem, usam **três redes de descoberta ao mesmo tempo** — nostr, MQTT
e BitTorrent. São infraestruturas diferentes, então um antivírus que bloqueie
os endereços de uma dificilmente bloqueia as três. Quem for encontrado por mais
de uma conta uma vez só.

**Jogar:** https://ascendance-hub.github.io/Topaz/

## Blackjack

Até 7 jogadores. Regras completas — pedir, parar, dobrar, dividir e seguro,
com um botão "?" explicando as três que não são óbvias para quem não joga.
Dealer automático que para em 17, com o avanço pausado no tempo (turnos e a
compra do dealer têm prazo visível, não resolvem tudo instantaneamente).

Entrar numa sala não é sentar numa mesa: a sala mostra quem está presente, e a
mesa é uma das coisas que se abre lá dentro, pela navegação no topo. Abrir a
mesa é escolha de cada um — não arrasta os outros junto.

A partida começa quando o anfitrião aperta "Iniciar partida" — sentar não
inicia mais nada sozinho, então os outros esperam com um aviso na tela. Quem
quebra (fica sem fichas) vira espectador e não consegue sentar de novo até a
próxima partida. Fichas valem só durante a sessão: todos começam com 1000, e
a partida termina assim que alguém chega a 1500, mostrando o placar final.
"Nova partida" devolve todo mundo à sala de espera com 1000 fichas de novo.

Crie uma sala — o código é gerado com `crypto.getRandomValues`, então não dá
para adivinhar — copie o link e mande para os amigos. Ao entrar, o navegador
espera alguns segundos para descobrir quem já está mandando na sala; só
reivindica o posto de anfitrião se ninguém aparecer e a eleição cair nele.
Se o anfitrião cair, outro jogador já conectado assume automaticamente e a
partida continua; quem entra depois não vira anfitrião só por entrar.

### Chat

Um painel no canto abre a conversa da mesa. Todo mundo na sala fala — sentados,
espectadores e quem já quebrou — e o nome que aparece é o apelido registrado na
partida, não um texto que o remetente escolhe, então ninguém se passa por outro.

As mensagens trafegam por um canal próprio, direto entre os navegadores: não
passam pelo anfitrião nem entram no estado do jogo, de modo que nada que
aconteça no chat pode atrapalhar a partida. Em troca, **não existe histórico**:
quem entra depois começa em branco, e recarregar a página apaga a conversa. Não
há como moderar nem bloquear alguém — sem servidor, não haveria onde. Mande o
link só para quem você conhece.

### Call

Voz e compartilhamento de tela entre duas pessoas, pela mesma conexão direta que
o jogo usa — não há servidor de mídia no meio.

Entrar na call é um ato explícito: estar na sala não abre o seu microfone. E
compartilhar a tela não liga o codificador — ele só começa a trabalhar quando
alguém clica em "Assistir", e desliga quando o último espectador sai. É isso que
permite várias pessoas compartilharem ao mesmo tempo sem derreter a máquina de
ninguém, e a barra avisa quando ninguém está assistindo, para não parecer que o
compartilhamento falhou.

Cada voz e cada tela têm volume próprio, num mixer ao lado da mesa — dá para
deixar o jogo de alguém baixo e a voz dele alta, ou o contrário.

Quem assiste pode expandir a tela recebida ou jogá-la numa janela flutuante do
sistema (Picture-in-Picture), que continua visível mesmo fora do navegador. Quem
compartilha escolhe entre 720p e 1080p — o salto de custo entre as duas é de
cerca de 3× na codificação, então 720p é o padrão.

Quem compartilha também escolhe se a tela é "jogo/vídeo" ou "código/texto" — o
codificador não consegue fluidez e nitidez ao mesmo tempo com o mesmo bitrate, e
essa é a escolha que faz letra pequena parar de embolar. O áudio do que está
sendo compartilhado vai junto quando o navegador oferece (no Chrome, para aba e
para tela inteira no Windows).

Não tem câmera e não funciona em celular.

### Privacidade

Entrar numa sala expõe o endereço IP dos participantes uns aos outros. Isso é
inerente ao WebRTC, que conecta os navegadores diretamente, sem servidor no
meio — é o mesmo que acontece em qualquer chamada de vídeo peer-to-peer. Só
mande o link para quem você conhece.

## Desenvolvimento

Requer Node 20.19+ ou 22.12+ (piso do Vite 8). O CI fixa a versão exata em
`.github/workflows/deploy.yml`.

```bash
npm install
npm run dev      # servidor local
npm test         # suíte de testes
npm run build    # build de produção
```

### Estrutura

| Pasta | Responsabilidade |
|---|---|
| `src/game/` | regras puras — sem rede, sem DOM, testadas isoladamente |
| `src/net/` | Trystero, eleição de anfitrião, migração |
| `src/ui/` | renderização e animação |

`src/game/` não importa nada das outras camadas — há um teste que garante isso.

Design e plano de implementação em `docs/superpowers/`. O que aprendemos sobre
Trystero e WebRTC pelo caminho — quase tudo saído de bug em uso real, e nada
disso na documentação oficial — está em
[`docs/aprendizados-trystero-webrtc.md`](docs/aprendizados-trystero-webrtc.md).

Como o projeto chegou até aqui — o que foi tentado, o que deu errado e o que
cada erro ensinou — está no
[diário de bordo](docs/diario-de-bordo.md). Inclui o levantamento de quem
enxerga o quê numa sala, e o que **não** dá para fechar sem servidor.
