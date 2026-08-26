import {
  joinRoom as entrarNostr, selfId, getRelaySockets, defaultRelayUrls,
} from '@trystero-p2p/nostr'
import { observarGrupos } from '../src/presenca/presenca'
import { abrirSalaDeFundo } from '../src/presenca/sala-de-fundo'

/**
 * Sonda de presença — instrumento, não funcionalidade.
 *
 * Duas tentativas de fazer presença entre grupos falharam, e a segunda ainda
 * degradou o que importa. Antes de uma terceira, a pergunta a responder é uma
 * só: **o modo passivo enxerga alguém?**
 *
 * Ela mora fora do aplicativo de propósito. Nada aqui é importado pelo site, e
 * o site não sabe que ela existe — assim nenhuma medição pode quebrar uma
 * sala de verdade, que foi exatamente o que aconteceu.
 *
 * Usa o MESMO `appId` do site para poder observar salas reais: o teste que
 * interessa é com o Topaz aberto de verdade do outro lado.
 *
 * O modo "observar (ativo)" existe como CONTROLE. Sem ele, "não vi ninguém"
 * não distingue "o passivo não funciona" de "os dois não se acharam". Uma
 * medição que não separa as duas coisas não vale a viagem — já perdi uma
 * sessão inteira com uma sonda que media o instrumento errado.
 */

const APP_ID = 'topaz-ascendance-hub'
const REDUNDANCIA = 20

const raiz = document.querySelector<HTMLDivElement>('#sonda')!
raiz.innerHTML = `
<style>
  body { margin: 0; background: #061511; color: #F4EBD7;
         font: 14px/1.5 ui-monospace, Consolas, monospace; }
  #sonda { padding: 20px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.sub { color: #9db3a8; margin: 0 0 18px; }
  input { background: #0b2018; color: #F4EBD7; border: 1px solid #B98A2E55;
          border-radius: 6px; padding: 9px 12px; font: inherit; width: 24ch; }
  button { background: transparent; color: #F0B34A; border: 1px solid #B98A2E55;
           border-radius: 999px; padding: 9px 16px; font: inherit;
           cursor: pointer; margin-right: 8px; }
  button:hover { border-color: #F0B34A; }
  button:disabled { opacity: .4; cursor: default; }
  #estado { margin: 16px 0; color: #9db3a8; }
  #estado b { color: #F0B34A; }
  #log { background: #04100c; border: 1px solid #B98A2E33; border-radius: 8px;
         padding: 12px; height: 46vh; overflow-y: auto; white-space: pre-wrap;
         font-size: 12.5px; }
  .t { color: #6f8a7f; }
  .ok { color: #7FC8A0; }
  .no { color: #E08A7A; }
</style>
<h1>Sonda de presença</h1>
<p class="sub">Instrumento de medição. Não é parte do Topaz.</p>
<div>
  <input id="codigo" placeholder="código da sala" autocomplete="off" />
  <button id="ativo">Entrar (ativo)</button>
  <button id="passivo">Observar (passivo)</button>
  <button id="controle">Observar (ativo) — controle</button>
  <button id="modulo">Observar pelo MÓDULO do app</button>
</div>
<div id="estado"></div>
<div id="log"></div>
`

const campo = raiz.querySelector<HTMLInputElement>('#codigo')!
const log = raiz.querySelector<HTMLDivElement>('#log')!
const estado = raiz.querySelector<HTMLDivElement>('#estado')!
const botoes = [...raiz.querySelectorAll<HTMLButtonElement>('button')]

const inicio = Date.now()
function escrever(texto: string, classe = ''): void {
  const linha = document.createElement('div')
  // `textContent` em tudo, mesmo aqui. Um peerId vem da rede, e o resto da
  // sonda não vale nada se ela mesma for o caminho de entrada.
  const marca = document.createElement('span')
  marca.className = 't'
  marca.textContent = `${((Date.now() - inicio) / 1000).toFixed(1).padStart(6)}s `
  linha.append(marca)
  const corpo = document.createElement('span')
  if (classe) corpo.className = classe
  corpo.textContent = texto
  linha.append(corpo)
  log.append(linha)
  log.scrollTop = log.scrollHeight
}

interface SalaCrua {
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
  getPeers(): Record<string, unknown>
  leave(): Promise<void> | void
}

const vistos = new Set<string>()
let sala: SalaCrua | null = null
let modo = ''

function entrar(codigo: string, passivo: boolean, rotulo: string): void {
  modo = rotulo
  for (const b of botoes) b.disabled = true
  escrever(`meu id: ${selfId}`)
  escrever(`entrando em "${codigo}" — modo ${rotulo}`)
  escrever(`appId ${APP_ID}, ${REDUNDANCIA} relays de ${defaultRelayUrls.length}`)

  sala = entrarNostr(
    {
      appId: APP_ID,
      ...(passivo ? { passive: true } : {}),
      relayConfig: { redundancy: REDUNDANCIA },
    } as Parameters<typeof entrarNostr>[0],
    codigo,
  ) as unknown as SalaCrua

  // Propriedade, não método: nesta versão do Trystero `onPeerJoin` se atribui.
  sala.onPeerJoin = (peerId) => {
    vistos.add(peerId)
    escrever(`ENTROU ${peerId}`, 'ok')
  }
  sala.onPeerLeave = (peerId) => {
    vistos.delete(peerId)
    escrever(`SAIU ${peerId}`, 'no')
  }
}

/**
 * O retrato a cada segundo.
 *
 * Relay conectado é o que separa "ninguém está lá" de "não estou ouvindo
 * ninguém" — e essa é a distinção que a investigação anterior não tinha.
 */
setInterval(() => {
  if (!sala) return
  const sockets = getRelaySockets() as unknown as Record<string, { readyState: number }>
  const urls = Object.keys(sockets)
  const abertos = urls.filter((u) => sockets[u]?.readyState === 1)
  const peers = Object.keys(sala.getPeers())
  estado.textContent = `modo ${modo} · relays abertos ${abertos.length}`
    + ` de ${urls.length} · peers conectados ${peers.length}`
    + ` · vistos ${vistos.size}`
}, 1000)

/** O código vem do fragmento para dar para colar o mesmo link nas duas máquinas. */
const doHash = new URLSearchParams(location.hash.slice(1)).get('sala')
if (doHash) campo.value = doHash

const clicar = (id: string, passivo: boolean, rotulo: string): void => {
  raiz.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = () => {
    const codigo = campo.value.trim()
    if (!codigo) {
      escrever('preencha o código da sala', 'no')
      return
    }
    location.hash = `sala=${codigo}`
    entrar(codigo, passivo, rotulo)
  }
}

/**
 * O quarto modo usa o MÓDULO de verdade, não uma reimplementação.
 *
 * A sonda passiva funciona entre duas sondas; a presença do app não vê
 * ninguém. Uma das duas coisas explica isso: ou o app não é descoberto por um
 * observador passivo, ou o meu módulo faz algo diferente do que eu escrevi
 * aqui. Reimplementar de novo mediria uma terceira coisa — então este botão
 * chama o código que está no ar.
 */
raiz.querySelector<HTMLButtonElement>('#modulo')!.onclick = () => {
  const codigo = campo.value.trim()
  if (!codigo) {
    escrever('preencha o código da sala', 'no')
    return
  }
  location.hash = `sala=${codigo}`
  modo = 'módulo do app'
  for (const b of botoes) b.disabled = true
  escrever(`meu id: ${selfId}`)
  escrever(`observando "${codigo}" pelo módulo real do app`)

  const p = observarGrupos([codigo], abrirSalaDeFundo)
  p.aoMudar(() => {
    const n = p.quantos(codigo)
    escrever(`MÓDULO diz: ${n} pessoa(s) em ${codigo}`, n > 0 ? 'ok' : 'no')
  })
  setInterval(() => {
    const sockets = getRelaySockets() as unknown as Record<string, { readyState: number }>
    const urls = Object.keys(sockets)
    const abertos = urls.filter((u) => sockets[u]?.readyState === 1)
    estado.textContent = `modo ${modo} · relays abertos ${abertos.length}`
      + ` de ${urls.length} · módulo conta ${p.quantos(codigo)}`
  }, 1000)
}

clicar('ativo', false, 'ativo')
clicar('passivo', true, 'passivo')
clicar('controle', false, 'observador ativo')

escrever('pronto. cole o mesmo código nas duas máquinas.')
escrever('uma clica "Entrar (ativo)"; a outra, "Observar (passivo)".')
escrever('se o passivo não vir ninguém, repita com "controle" para comparar.')
escrever('para testar contra o Topaz de verdade: abra a sala no site noutra')
escrever('máquina e use aqui "Observar (passivo)" com o MESMO código.')
