# Topaz

Hub de jogos de mesa para jogar com amigos direto do navegador. Sem servidor,
sem cadastro: os navegadores conversam entre si por WebRTC.

**Jogar:** https://ascendance-hub.github.io/Topaz/

## Blackjack

Até 7 jogadores. Regras completas — pedir, parar, dobrar, dividir e seguro.
Dealer automático que para em 17, com o avanço pausado no tempo (turnos e a
compra do dealer têm prazo visível, não resolvem tudo instantaneamente).
Fichas valem só durante a sessão.

Crie uma sala — o código é gerado com `crypto.getRandomValues`, então não dá
para adivinhar — copie o link e mande para os amigos. Ao entrar, o navegador
espera alguns segundos para descobrir quem já está mandando na sala; só
reivindica o posto de anfitrião se ninguém aparecer e a eleição cair nele.
Se o anfitrião cair, outro jogador já conectado assume automaticamente e a
partida continua; quem entra depois não vira anfitrião só por entrar.

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

Design e plano de implementação em `docs/superpowers/`.
