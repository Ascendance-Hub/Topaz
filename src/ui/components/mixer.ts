export interface CanalAudio {
  chave: string
  nome: string
  /** 0 a 1, como o `volume` de um elemento de mídia. */
  volume: number
}

/**
 * Voz e tela da mesma pessoa são canais separados de propósito: assistir a
 * tela de alguém com o jogo alto e a voz baixa é um caso real, e o contrário
 * também.
 */
export const chaveVoz = (peerId: string): string => `voz:${peerId}`
export const chaveTela = (peerId: string): string => `tela:${peerId}`

export function renderizarMixer(
  canais: CanalAudio[], aoMudar: (chave: string, volume: number) => void,
): HTMLElement {
  const mixer = document.createElement('div')
  mixer.className = 'mixer'
  // Sem canal nenhum não há o que ajustar, e um painel vazio é só ruído.
  if (canais.length === 0) return mixer

  const titulo = document.createElement('h3')
  titulo.className = 'mixer-titulo'
  titulo.textContent = 'Volumes'
  mixer.append(titulo)

  for (const canal of canais) {
    const linha = document.createElement('div')
    linha.className = 'mixer-linha'

    const nome = document.createElement('span')
    nome.className = 'mixer-nome'
    // `textContent`: o apelido vem de outro navegador.
    nome.textContent = canal.nome

    const entrada = document.createElement('input')
    entrada.type = 'range'
    entrada.min = '0'
    entrada.max = '100'
    // Percentual na interface, fração no código: `input[type=range]` trabalha
    // com inteiros, e `HTMLMediaElement.volume` vai de 0 a 1.
    entrada.value = String(Math.round(canal.volume * 100))
    entrada.dataset['canal'] = canal.chave
    // Sem rótulo, um leitor de tela anuncia "controle deslizante, 100" e não
    // diz de quem é.
    entrada.setAttribute('aria-label', `Volume de ${canal.nome}`)
    entrada.oninput = () => aoMudar(canal.chave, Number(entrada.value) / 100)

    linha.append(nome, entrada)
    mixer.append(linha)
  }

  return mixer
}
