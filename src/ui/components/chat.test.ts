// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { criarChat, LIMITE_TEXTO, MAX_LINHAS } from './chat'
import type { Chat } from './chat'

/** Digita `texto` e submete, como quem aperta Enter no campo. */
function digitarEEnviar(chat: Chat, texto: string): HTMLInputElement {
  const campo = chat.raiz.querySelector('input')!
  campo.value = texto
  chat.raiz.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  return campo
}

describe('envio', () => {
  it('manda o texto digitado e limpa o campo', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)

    const campo = digitarEEnviar(chat, 'boa mão')

    expect(enviado).toHaveBeenCalledWith('boa mão', 'geral')
    expect(campo.value).toBe('')
  })

  it('ignora mensagem vazia ou só de espaços', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)

    digitarEEnviar(chat, '   ')

    expect(enviado).not.toHaveBeenCalled()
  })

  it('corta o texto no limite em vez de mandar mensagem sem fim', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)

    digitarEEnviar(chat, 'a'.repeat(LIMITE_TEXTO + 50))

    expect(enviado).toHaveBeenCalledWith('a'.repeat(LIMITE_TEXTO), 'geral')
  })
})

describe('recepção', () => {
  it('mostra o apelido e o texto de quem falou', () => {
    const chat = criarChat(vi.fn())

    chat.receber('Alex', 'boa mão')

    const linha = chat.raiz.querySelector('.chat-linha')!
    expect(linha.textContent).toContain('Alex')
    expect(linha.textContent).toContain('boa mão')
  })

  it('nunca interpreta a mensagem como HTML — o texto chega de outro navegador', () => {
    const chat = criarChat(vi.fn())
    const malicioso = '<img src=x onerror="window.__xss = true">'

    chat.receber('Alex', malicioso)

    expect(chat.raiz.querySelector('img')).toBeNull()
    expect(chat.raiz.textContent).toContain(malicioso)
  })

  it('nunca interpreta o apelido como HTML — ele também chega de fora', () => {
    const chat = criarChat(vi.fn())

    chat.receber('<img src=x onerror="window.__xss = true">', 'oi')

    expect(chat.raiz.querySelector('img')).toBeNull()
  })

  it('descarta as linhas mais antigas em vez de crescer sem limite', () => {
    const chat = criarChat(vi.fn())

    for (let i = 0; i < MAX_LINHAS + 10; i++) chat.receber('Alex', `msg ${i}`)

    expect(chat.raiz.querySelectorAll('.chat-linha')).toHaveLength(MAX_LINHAS)
    expect(chat.raiz.textContent).not.toContain('msg 0')
    expect(chat.raiz.textContent).toContain(`msg ${MAX_LINHAS + 9}`)
  })
})

describe('rolagem', () => {
  /** happy-dom não faz layout: `scrollHeight` é sempre 0 se não for forjado. */
  function forjarAltura(log: Element, altura: number): void {
    Object.defineProperty(log, 'scrollHeight', { value: altura, configurable: true })
  }

  it('rola até a mensagem mais nova em vez de deixar a conversa parada no topo', () => {
    const chat = criarChat(vi.fn())
    const log = chat.raiz.querySelector('.chat-log')!
    forjarAltura(log, 500)

    chat.receber('Alex', 'oi')

    expect(log.scrollTop).toBe(500)
  })

  it('ao abrir a gaveta, mostra o fim da conversa e não o começo', () => {
    const chat = criarChat(vi.fn())
    const log = chat.raiz.querySelector('.chat-log')!
    chat.receber('Alex', 'oi')
    forjarAltura(log, 800)

    chat.raiz.querySelector<HTMLButtonElement>('.chat-gatilho')!.click()

    expect(log.scrollTop).toBe(800)
  })
})

describe('gaveta', () => {
  function gatilho(chat: Chat): HTMLButtonElement {
    return chat.raiz.querySelector<HTMLButtonElement>('.chat-gatilho')!
  }

  it('começa fechada para não roubar a tela da mesa', () => {
    const chat = criarChat(vi.fn())

    expect(chat.raiz.dataset['aberto']).toBe('0')
    expect(gatilho(chat).getAttribute('aria-expanded')).toBe('false')
  })

  it('o gatilho abre e fecha', () => {
    const chat = criarChat(vi.fn())

    gatilho(chat).click()
    expect(chat.raiz.dataset['aberto']).toBe('1')
    expect(gatilho(chat).getAttribute('aria-expanded')).toBe('true')

    gatilho(chat).click()
    expect(chat.raiz.dataset['aberto']).toBe('0')
  })

  it('conta as mensagens que chegam com a gaveta fechada', () => {
    const chat = criarChat(vi.fn())

    chat.receber('Alex', 'oi')
    chat.receber('Bruno', 'e aí')

    expect(chat.raiz.querySelector('.chat-nao-lidas')!.textContent).toBe('2')
  })

  it('zera o contador ao abrir', () => {
    const chat = criarChat(vi.fn())
    chat.receber('Alex', 'oi')

    gatilho(chat).click()

    expect(chat.raiz.querySelector('.chat-nao-lidas')).toBeNull()
  })

  it('não acumula não-lidas enquanto a gaveta está aberta', () => {
    const chat = criarChat(vi.fn())
    gatilho(chat).click()

    chat.receber('Alex', 'oi')

    expect(chat.raiz.querySelector('.chat-nao-lidas')).toBeNull()
  })
})

describe('o que chega de outro navegador', () => {
  it('corta um texto gigante em vez de despejá-lo na tela', () => {
    // O corte em LIMITE_TEXTO existe no envio, e quem envia pode simplesmente
    // não aplicá-lo. Uma linha de dez mil caracteres — ou dez milhões —
    // trava o navegador de todo mundo na sala.
    const chat = criarChat(vi.fn())

    chat.receber('Alex', 'a'.repeat(10_000))

    const texto = chat.raiz.querySelector('.chat-texto')!.textContent!
    expect(texto).toHaveLength(LIMITE_TEXTO)
  })

  it('corta também o apelido', () => {
    const chat = criarChat(vi.fn())

    chat.receber('A'.repeat(10_000), 'oi')

    expect(chat.raiz.querySelector('.chat-autor')!.textContent!.length)
      .toBeLessThanOrEqual(LIMITE_TEXTO)
  })

  it('não deixa passar o que nem é texto', () => {
    const chat = criarChat(vi.fn())

    chat.receber(null as unknown as string, { toString: () => 'oi' } as unknown as string)

    expect(chat.raiz.querySelector('.chat-linha')!.textContent).toBe('')
  })

  it('mensagem normal continua inteira', () => {
    const chat = criarChat(vi.fn())

    chat.receber('Alex', 'boa sorte')

    expect(chat.raiz.querySelector('.chat-texto')!.textContent).toBe('boa sorte')
  })
})

describe('trocar o chat com o miolo', () => {
  it('sem quem aplique a troca, o botão não existe', () => {
    // Um botão que não muda nada seria um botão que engana.
    const chat = criarChat(() => {})

    expect(chat.raiz.querySelector('[data-chat="trocar"]')).toBeNull()
  })

  it('clicar pede a troca', () => {
    const aoTrocar = vi.fn()
    const chat = criarChat(() => {}, aoTrocar)

    chat.raiz.querySelector<HTMLButtonElement>('[data-chat="trocar"]')!.click()

    expect(aoTrocar).toHaveBeenCalledWith(true)
  })

  it('clicar de novo desfaz', () => {
    const aoTrocar = vi.fn()
    const chat = criarChat(() => {}, aoTrocar)
    const botao = chat.raiz.querySelector<HTMLButtonElement>('[data-chat="trocar"]')!

    botao.click()
    botao.click()

    expect(aoTrocar).toHaveBeenLastCalledWith(false)
  })

  it('o rótulo diz para onde vai, e muda junto', () => {
    // "⇄" sozinho não diz o que acontece, e o que acontece depende de onde a
    // pessoa está agora.
    const chat = criarChat(() => {}, () => {})
    const botao = chat.raiz.querySelector<HTMLButtonElement>('[data-chat="trocar"]')!

    expect(botao.getAttribute('aria-label')).toContain('chat para o meio')

    botao.click()

    expect(botao.getAttribute('aria-label')).toContain('call para o meio')
  })

  it('o estado é anunciado como botão de duas posições', () => {
    const chat = criarChat(() => {}, () => {})
    const botao = chat.raiz.querySelector<HTMLButtonElement>('[data-chat="trocar"]')!

    expect(botao.getAttribute('aria-pressed')).toBe('false')

    botao.click()

    expect(botao.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('as duas conversas', () => {
  const abrir = (chat: ReturnType<typeof criarChat>) => {
    chat.raiz.querySelector<HTMLButtonElement>('.chat-gatilho')!.click()
  }
  const aba = (chat: ReturnType<typeof criarChat>, qual: string) =>
    chat.raiz.querySelector<HTMLButtonElement>(`[data-aba="${qual}"]`)!
  const linhasDe = (chat: ReturnType<typeof criarChat>, escopo: string) =>
    chat.raiz.querySelectorAll(`[data-escopo="${escopo}"] .chat-linha`)

  it('fora da call não há aba de canal', () => {
    // Um lugar de falar com ninguém é pior que não ter o lugar.
    const chat = criarChat(() => {})

    expect(aba(chat, 'canal').hidden).toBe(true)
  })

  it('entrando num canal, a aba aparece', () => {
    const chat = criarChat(() => {})

    chat.definirEmCanal(true)

    expect(aba(chat, 'canal').hidden).toBe(false)
  })

  it('cada mensagem vai para o log do seu escopo', () => {
    const chat = criarChat(() => {})
    chat.definirEmCanal(true)

    chat.receber('Ana', 'oi sala', 'geral')
    chat.receber('Bia', 'oi canal', 'canal')

    expect(linhasDe(chat, 'geral')).toHaveLength(1)
    expect(linhasDe(chat, 'canal')).toHaveLength(1)
  })

  it('o que eu escrever vai para a aba em que estou', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)
    chat.definirEmCanal(true)
    aba(chat, 'canal').click()

    const campo = chat.raiz.querySelector<HTMLInputElement>('.chat-campo')!
    campo.value = 'só para vocês'
    chat.raiz.querySelector('form')!.dispatchEvent(new Event('submit'))

    expect(enviado).toHaveBeenCalledWith('só para vocês', 'canal')
  })

  it('sem canal, tudo vai para a sala', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)

    const campo = chat.raiz.querySelector<HTMLInputElement>('.chat-campo')!
    campo.value = 'oi'
    chat.raiz.querySelector('form')!.dispatchEvent(new Event('submit'))

    expect(enviado).toHaveBeenCalledWith('oi', 'geral')
  })

  it('clicar na aba do canal não faz nada quando não há canal', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)

    aba(chat, 'canal').click()
    const campo = chat.raiz.querySelector<HTMLInputElement>('.chat-campo')!
    campo.value = 'oi'
    chat.raiz.querySelector('form')!.dispatchEvent(new Event('submit'))

    expect(enviado).toHaveBeenCalledWith('oi', 'geral')
  })

  it('mensagem que chega na aba escondida conta como perdida', () => {
    const chat = criarChat(() => {})
    chat.definirEmCanal(true)
    abrir(chat)

    chat.receber('Ana', 'oi canal', 'canal')

    expect(aba(chat, 'canal').querySelector('.chat-nao-lidas')!.textContent).toBe('1')
  })

  it('abrir a aba zera o selo dela', () => {
    const chat = criarChat(() => {})
    chat.definirEmCanal(true)
    abrir(chat)
    chat.receber('Ana', 'oi canal', 'canal')

    aba(chat, 'canal').click()

    expect(aba(chat, 'canal').querySelector('.chat-nao-lidas')).toBeNull()
  })

  it('trocar de canal esquece a conversa de lá', () => {
    // Aquelas mensagens foram endereçadas às pessoas com quem você estava.
    const chat = criarChat(() => {})
    chat.definirEmCanal(true)
    chat.receber('Ana', 'segredo', 'canal')

    chat.limparCanal()

    expect(linhasDe(chat, 'canal')).toHaveLength(0)
  })

  it('mas a conversa da sala continua', () => {
    const chat = criarChat(() => {})
    chat.definirEmCanal(true)
    chat.receber('Ana', 'oi sala', 'geral')

    chat.limparCanal()

    expect(linhasDe(chat, 'geral')).toHaveLength(1)
  })

  it('sair da call devolve o foco para a sala', () => {
    const enviado = vi.fn()
    const chat = criarChat(enviado)
    chat.definirEmCanal(true)
    aba(chat, 'canal').click()

    chat.definirEmCanal(false)

    const campo = chat.raiz.querySelector<HTMLInputElement>('.chat-campo')!
    campo.value = 'oi'
    chat.raiz.querySelector('form')!.dispatchEvent(new Event('submit'))
    expect(enviado).toHaveBeenCalledWith('oi', 'geral')
  })
})
