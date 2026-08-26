// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { AreaDeMidia } from './area-midia'
import { chaveTela, chaveVoz } from './components/mixer'

/** Um stream de voz: só faixa de áudio. */
function voz(): MediaStream {
  const stream = new MediaStream()
  stream.getVideoTracks = () => []
  return stream
}

/** Um stream de tela: tem faixa de vídeo, e é assim que ele é reconhecido. */
function tela(): MediaStream {
  const stream = new MediaStream()
  stream.getVideoTracks = () => [{} as MediaStreamTrack]
  return stream
}

function montar(saida: string | null = null) {
  const dep = {
    apelidoDe: (id: string) => `nome-${id}`,
    saidaAtual: () => saida,
    aoOuvirVoz: vi.fn(),
    aoPerderVoz: vi.fn(),
  }
  return { area: new AreaDeMidia(dep), dep }
}

describe('receber mídia', () => {
  it('voz vira um <audio> marcado com a pessoa', () => {
    const { area } = montar()

    area.receber(voz(), 'pa', false)

    expect(area.audios.querySelectorAll('audio[data-de="pa"]')).toHaveLength(1)
    expect(area.videos.children).toHaveLength(0)
  })

  it('tela vira uma caixa de vídeo', () => {
    const { area } = montar()

    area.receber(tela(), 'pa', true)

    expect(area.videos.querySelectorAll('[data-de="pa"]')).toHaveLength(1)
    expect(area.audios.children).toHaveLength(0)
  })

  it('classifica pelas FAIXAS, não por metadado', () => {
    // A fila que pareia metadado e faixa no Trystero desalinha, e o rótulo
    // passa a mentir — era isso que fazia alguém sumir do áudio.
    const { area } = montar()

    area.receber(tela(), 'pa', true)
    area.receber(voz(), 'pb', false)

    expect(area.videos.querySelectorAll('[data-de]')).toHaveLength(1)
    expect(area.audios.querySelectorAll('audio')).toHaveLength(1)
  })

  it('voz nova da mesma pessoa substitui, não empilha', () => {
    // Sair e voltar da call traz um stream novo; sem trocar o elemento, os
    // antigos se acumulavam segurando streams mortos.
    const { area } = montar()

    area.receber(voz(), 'pa', false)
    area.receber(voz(), 'pa', false)

    expect(area.audios.querySelectorAll('audio')).toHaveLength(1)
  })

  it('tela nova da mesma pessoa substitui a caixa inteira', () => {
    // Senão fica um quadro congelado da sessão anterior.
    const { area } = montar()

    area.receber(tela(), 'pa', true)
    area.receber(tela(), 'pa', true)

    expect(area.videos.querySelectorAll('[data-de="pa"]')).toHaveLength(1)
  })

  it('passa a medir a voz de quem chegou', () => {
    const { area, dep } = montar()
    const stream = voz()

    area.receber(stream, 'pa', false)

    expect(dep.aoOuvirVoz).toHaveBeenCalledWith('pa', stream)
  })

  it('tela não entra no medidor de voz', () => {
    const { area, dep } = montar()

    area.receber(tela(), 'pa', true)

    expect(dep.aoOuvirVoz).not.toHaveBeenCalled()
  })

  it('quem chega já nasce silenciado quando todos estão silenciados', () => {
    // Sem isto, silenciar todo mundo e alguém entrar depois faria a voz nova
    // furar o silêncio.
    const { area } = montar()
    area.alternarSilenciarTodos()

    area.receber(voz(), 'pa', false)

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(true)
  })
})

describe('ajustar as telas', () => {
  it('quem parou de compartilhar perde a caixa', () => {
    const { area } = montar()
    area.receber(tela(), 'pa', true)

    area.ajustar([], [], ['pa', 'pb', 'pc'])

    expect(area.videos.querySelectorAll('[data-de]')).toHaveLength(0)
  })

  it('quem continua compartilhando mantém a caixa mesmo sem ninguém assistindo', () => {
    // O stream chega UMA vez por sessão. Remover a caixa faria a tela não
    // voltar, porque não haveria stream novo para recriá-la.
    const { area } = montar()
    area.receber(tela(), 'pa', true)

    area.ajustar([], ['pa'], ['pa', 'pb', 'pc'])

    expect(area.videos.querySelectorAll('[data-de]')).toHaveLength(1)
  })

  it('silenciar todos cala os áudios existentes', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)

    area.alternarSilenciarTodos()
    area.ajustar([], [], ['pa', 'pb', 'pc'])

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(true)
  })

  it('alternar de novo devolve o som', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)
    area.alternarSilenciarTodos()

    area.alternarSilenciarTodos()
    area.ajustar([], [], ['pa', 'pb', 'pc'])

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(false)
    expect(area.silenciados()).toBe(false)
  })
})

describe('volumes', () => {
  it('sem ajuste, tudo toca no volume cheio', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)

    area.aplicarVolumes()

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.volume).toBe(1)
  })

  it('o volume ajustado vale para a pessoa certa', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)
    area.receber(voz(), 'pb', false)

    area.definirVolume(chaveVoz('pa'), 0.25)

    const [a, b] = [...area.audios.querySelectorAll<HTMLAudioElement>('audio')]
    expect(a!.volume).toBe(0.25)
    expect(b!.volume).toBe(1)
  })

  it('o volume ajustado antes vale para quem chegar depois', () => {
    // Elementos aparecem e somem conforme a call muda; um volume que só
    // valesse para o elemento presente se perderia a cada reconexão.
    const { area } = montar()
    area.definirVolume(chaveVoz('pa'), 0.4)

    area.receber(voz(), 'pa', false)
    area.aplicarVolumes()

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.volume).toBe(0.4)
  })

  it('voz e tela da mesma pessoa têm volumes independentes', () => {
    const { area } = montar()

    area.definirVolume(chaveVoz('pa'), 0.2)

    expect(area.volumeDe(chaveTela('pa'))).toBe(1)
  })
})

describe('canais do mixer', () => {
  it('uma voz por pessoa na call e uma tela por quem se assiste', () => {
    const { area } = montar()

    const canais = area.canais(['pa', 'pb'], ['pa'])

    expect(canais.map((c) => c.chave)).toEqual([
      chaveVoz('pa'), chaveVoz('pb'), chaveTela('pa'),
    ])
    expect(canais[2]!.nome).toBe('Tela de nome-pa')
  })

  it('o canal carrega o volume atual', () => {
    const { area } = montar()
    area.definirVolume(chaveVoz('pa'), 0.7)

    expect(area.canais(['pa'], [])[0]!.volume).toBe(0.7)
  })
})

describe('a própria tela', () => {
  it('aparece marcada e MUDA', () => {
    // O áudio do sistema voltaria pela própria caixa de som e realimentaria o
    // microfone. Microfonia — e das ruins, porque quem causa não ouve.
    const { area } = montar()

    area.previaDaMinhaTela(tela())

    const video = area.videos.querySelector<HTMLVideoElement>('.video-local')!
    expect(video.muted).toBe(true)
    expect(area.videos.querySelector('.video-nome')!.textContent).toBe('Sua tela')
  })

  it('fica fora do data-de, para não parecer tela de outra pessoa', () => {
    // `ajustar` e `aplicarVolumes` percorrem esse atributo pensando em telas
    // dos outros.
    const { area } = montar()

    area.previaDaMinhaTela(tela())

    expect(area.videos.querySelectorAll('[data-de]')).toHaveLength(0)
  })

  it('parar de compartilhar tira a prévia', () => {
    const { area } = montar()
    area.previaDaMinhaTela(tela())

    area.previaDaMinhaTela(null)

    expect(area.videos.querySelector('.video-local')).toBeNull()
  })

  it('a mesma captura de novo não recria nada', () => {
    const { area } = montar()
    const minha = tela()
    area.previaDaMinhaTela(minha)
    const antes = area.videos.querySelector('.video-local')

    area.previaDaMinhaTela(minha)

    expect(area.videos.querySelector('.video-local')).toBe(antes)
  })

  it('a prévia sobrevive ao ajuste das telas dos outros', () => {
    const { area } = montar()
    area.previaDaMinhaTela(tela())

    area.ajustar([], [], ['pa', 'pb', 'pc'])

    expect(area.videos.querySelector('.video-local')).not.toBeNull()
  })
})

describe('sair da call', () => {
  it('limpa tudo e larga os streams', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)
    area.receber(tela(), 'pb', true)
    const audio = area.audios.querySelector<HTMLAudioElement>('audio')!

    area.limpar()

    expect(area.audios.children).toHaveLength(0)
    expect(area.videos.children).toHaveLength(0)
    expect(audio.srcObject).toBeNull()
  })

  it('remover a voz de alguém para de medir junto', () => {
    // Um analisador esquecido é vazamento, e o anel ficaria aceso para sempre.
    const { area, dep } = montar()
    area.receber(voz(), 'pa', false)

    area.removerVozDe('pa')

    expect(dep.aoPerderVoz).toHaveBeenCalledWith('pa')
    expect(area.audios.children).toHaveLength(0)
  })
})

describe('controles da própria tela', () => {
  it('oferece tela cheia — conferir o que se mostra é quando ampliar ajuda mais', () => {
    // A tela dos OUTROS já tinha isso desde sempre; a prévia da própria
    // nasceu sem nada.
    const { area } = montar()

    area.previaDaMinhaTela(tela())

    expect(area.videos.querySelector('[data-video="tela-cheia"]')).not.toBeNull()
  })

  it('NÃO oferece silenciar — a prévia é muda por construção', () => {
    // Um botão que não faz nada é pior que botão nenhum.
    const { area } = montar()

    area.previaDaMinhaTela(tela())

    expect(area.videos.querySelector('[data-video="som"]')).toBeNull()
  })

  it('os controles somem junto com a prévia', () => {
    const { area } = montar()
    area.previaDaMinhaTela(tela())

    area.previaDaMinhaTela(null)

    expect(area.videos.querySelector('[data-video="tela-cheia"]')).toBeNull()
  })
})

/**
 * A garantia de que canal separa mesmo.
 *
 * Quem troca de canal despublica o microfone, e isso deveria bastar. Não
 * bastava: o elemento aqui segurava um stream que continuava vivo, e dava para
 * se ouvir do outro canal. Aqui é onde a separação passa a valer de verdade,
 * porque é o lado que eu controlo.
 */
describe('voz de fora do meu canal', () => {
  it('quem não está comigo fica calado', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)

    area.ajustar([], [], [])

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(true)
  })

  it('quem está comigo continua audível', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)

    area.ajustar([], [], ['pa'])

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(false)
  })

  it('voltar para o meu canal devolve o som na hora', () => {
    // Por isso cala em vez de remover: o áudio só voltaria se o outro lado
    // publicasse de novo, e ele só republica quando percebe que eu saí da
    // lista dele. Numa ida e volta rápida os dois se cruzam.
    const { area } = montar()
    area.receber(voz(), 'pa', false)
    area.ajustar([], [], [])

    area.ajustar([], [], ['pa'])

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(false)
  })

  it('fora da call eu não ouço ninguém', () => {
    // `comigo` vem vazio quando não estou em call nenhuma.
    const { area } = montar()
    area.receber(voz(), 'pa', false)
    area.receber(voz(), 'pb', false)

    area.ajustar([], [], [])

    const audios = [...area.audios.querySelectorAll<HTMLAudioElement>('audio')]
    expect(audios.every((a) => a.muted)).toBe(true)
  })

  it('silenciar todos continua valendo por cima', () => {
    const { area } = montar()
    area.receber(voz(), 'pa', false)
    area.alternarSilenciarTodos()

    area.ajustar([], [], ['pa'])

    expect(area.audios.querySelector<HTMLAudioElement>('audio')!.muted).toBe(true)
  })
})
