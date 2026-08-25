// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderizarLobby, apelidoSalvo, salvarApelido, MENSAGEM_LINK_INVALIDO } from './lobby'

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})

describe('apelido em localStorage', () => {
  it('carrega vazio quando nada foi salvo ainda', () => {
    expect(apelidoSalvo()).toBe('')
  })

  it('persiste e recarrega o apelido salvo', () => {
    salvarApelido('Bruno')
    expect(apelidoSalvo()).toBe('Bruno')
  })

  it('o campo de apelido nasce preenchido com o valor salvo', () => {
    salvarApelido('Bruno')
    const lobby = renderizarLobby(() => {})
    const campo = lobby.querySelector<HTMLInputElement>('.campo')!
    expect(campo.value).toBe('Bruno')
  })

  it('ao entrar, o apelido digitado é gravado em localStorage', () => {
    location.hash = '#sala=K7X2QW9FM3PRTVN4'
    const lobby = renderizarLobby(() => {})
    const campo = lobby.querySelector<HTMLInputElement>('.campo')!
    campo.value = 'Ana'
    // Pelo texto, não por posição: o lobby ganhou os botões do retrato de
    // perfil, e "o primeiro botão" deixou de descrever o que este teste quer.
    const botao = [...lobby.querySelectorAll('button')]
      .find((b) => b.textContent === 'Entrar na sala')!
    botao.click()
    expect(apelidoSalvo()).toBe('Ana')
  })
})

describe('roteamento pela URL', () => {
  it('sem código no hash, renderiza o caminho de criar sala ou digitar código', () => {
    const lobby = renderizarLobby(() => {})
    const botoes = [...lobby.querySelectorAll('button')].map((b) => b.textContent)
    expect(botoes).toContain('Criar sala')
    expect(botoes).toContain('Entrar')
    expect(lobby.querySelector('input[placeholder="Código da sala"]')).not.toBeNull()
  })

  it('com código no hash, renderiza o caminho de entrar na sala existente', () => {
    location.hash = '#sala=K7X2QW9FM3PRTVN4'
    const lobby = renderizarLobby(() => {})
    // Só os botões de navegação: os do retrato de perfil aparecem nos dois
    // caminhos e não dizem nada sobre roteamento.
    const botoes = [...lobby.querySelectorAll('button')]
      .filter((b) => !b.dataset['perfil'])
      .map((b) => b.textContent)
    expect(botoes).toEqual(['Entrar na sala'])
    expect(lobby.querySelector('.sub')?.textContent).toBe('Entrando na sala K7X2-QW9F-M3PR-TVN4')
  })
})

describe('apelido em branco', () => {
  it('não chama aoEntrar quando o apelido está vazio', () => {
    location.hash = '#sala=K7X2QW9FM3PRTVN4'
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const campo = lobby.querySelector<HTMLInputElement>('.campo')!
    campo.value = '   '
    const botao = lobby.querySelector<HTMLButtonElement>('.botao')!
    botao.click()
    expect(aoEntrar).not.toHaveBeenCalled()
  })

  it('criar sala com apelido vazio não gera código nem mexe no hash', () => {
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const hashAntes = location.hash
    const criar = [...lobby.querySelectorAll('button')].find((b) => b.textContent === 'Criar sala')!
    criar.click()
    expect(aoEntrar).not.toHaveBeenCalled()
    // Antes da correção, um código era gerado e o hash reescrito mesmo com
    // o apelido vazio — um código de sala desperdiçado e uma URL alterada
    // à toa antes da rejeição por falta de apelido.
    expect(location.hash).toBe(hashAntes)
  })

  it('entrar com código digitado e apelido vazio não mexe no hash', () => {
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const hashAntes = location.hash
    const campoCodigo = lobby.querySelector<HTMLInputElement>(
      'input[placeholder="Código da sala"]',
    )!
    campoCodigo.value = 'K7X2QW9FM3PRTVN4'
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).not.toHaveBeenCalled()
    // Mesmo defeito do caminho de criar sala: antes da correção o hash era
    // escrito antes de checar o apelido, então digitar um código válido com
    // apelido em branco reescrevia a URL e só depois recusava por falta de
    // apelido.
    expect(location.hash).toBe(hashAntes)
  })
})

describe('normalização do código digitado à mão', () => {
  it('maiusculiza e remove espaços antes de entrar na sala', () => {
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const campoApelido = lobby.querySelector<HTMLInputElement>('.campo')!
    campoApelido.value = 'Ana'
    const campoCodigo = lobby.querySelector<HTMLInputElement>(
      'input[placeholder="Código da sala"]',
    )!
    campoCodigo.value = ' k7x2qw9fm3prtvn4 '
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).toHaveBeenCalledWith('Ana', 'K7X2QW9FM3PRTVN4')
    expect(location.hash).toBe('#sala=K7X2-QW9F-M3PR-TVN4')
  })

  it('remove também espaço interno (código colado quebrado no meio)', () => {
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const campoApelido = lobby.querySelector<HTMLInputElement>('.campo')!
    campoApelido.value = 'Ana'
    const campoCodigo = lobby.querySelector<HTMLInputElement>(
      'input[placeholder="Código da sala"]',
    )!
    // Espaço no meio, não só nas pontas — .trim() sozinho não resolveria isto.
    campoCodigo.value = 'k7x2 qw9fm3pr tvn4'
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).toHaveBeenCalledWith('Ana', 'K7X2QW9FM3PRTVN4')
    expect(location.hash).toBe('#sala=K7X2-QW9F-M3PR-TVN4')
  })

  it('aceita o código colado com os hífens, que é a forma que o link mostra', () => {
    // O link copiado traz `K7X2-QW9F-M3PR-TVN4`. Quem copia o código de uma
    // conversa cola exatamente isso — se os hífens barrassem a entrada, o
    // caminho mais provável seria o que não funciona.
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    lobby.querySelector<HTMLInputElement>('.campo')!.value = 'Ana'
    const campoCodigo = lobby.querySelector<HTMLInputElement>(
      'input[placeholder="Código da sala"]',
    )!
    campoCodigo.value = 'K7X2-QW9F-M3PR-TVN4'
    // O campo precisa caber a forma agrupada inteira, senão o fim é cortado.
    expect(campoCodigo.maxLength).toBeGreaterThanOrEqual('K7X2-QW9F-M3PR-TVN4'.length)

    ;[...lobby.querySelectorAll('button')].find((b) => b.textContent === 'Entrar')!.click()

    expect(aoEntrar).toHaveBeenCalledWith('Ana', 'K7X2QW9FM3PRTVN4')
  })

  it('não entra quando o código tem o comprimento certo mas algum está fora do alfabeto', () => {
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const hashAntes = location.hash
    const campoApelido = lobby.querySelector<HTMLInputElement>('.campo')!
    campoApelido.value = 'Ana'
    const campoCodigo = lobby.querySelector<HTMLInputElement>(
      'input[placeholder="Código da sala"]',
    )!
    // 8 caracteres certinhos, mas com "O" e "1" — fora do alfabeto sem
    // ambiguidade (ehCodigoValido rejeita; um length-check sozinho não).
    campoCodigo.value = 'K7X2QWO1'
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).not.toHaveBeenCalled()
    expect(location.hash).toBe(hashAntes)
  })

  it('não entra quando o código normalizado não tem 8 caracteres', () => {
    const aoEntrar = vi.fn()
    const lobby = renderizarLobby(aoEntrar)
    const campoApelido = lobby.querySelector<HTMLInputElement>('.campo')!
    campoApelido.value = 'Ana'
    const campoCodigo = lobby.querySelector<HTMLInputElement>(
      'input[placeholder="Código da sala"]',
    )!
    campoCodigo.value = 'curto'
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).not.toHaveBeenCalled()
  })
})

describe('apelido quando o armazenamento está bloqueado', () => {
  it('apelidoSalvo devolve vazio, sem lançar, se localStorage.getItem lançar', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado (janela privada, por exemplo)')
    }
    try {
      expect(apelidoSalvo()).toBe('')
    } finally {
      Storage.prototype.getItem = original
    }
  })

  it('salvarApelido não lança se localStorage.setItem lançar', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado')
    }
    try {
      expect(() => salvarApelido('Ana')).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
  })

  it('renderizarLobby não lança e ainda produz o formulário com storage bloqueado', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado')
    }
    try {
      const lobby = renderizarLobby(() => {})
      expect(lobby.querySelector('.campo')).not.toBeNull()
    } finally {
      Storage.prototype.getItem = original
    }
  })
})

describe('link de convite com código inválido', () => {
  it('avisa que o código do link não presta em vez de cair calado em criar sala', () => {
    // Link truncado no mensageiro: aponta para uma sala, mas o código não
    // chegou inteiro.
    location.hash = '#sala=K7X2'
    const lobby = renderizarLobby(() => {})

    const aviso = lobby.querySelector('.aviso')
    expect(aviso).not.toBeNull()
    expect(aviso!.textContent).toBe(MENSAGEM_LINK_INVALIDO)
    // Ele continua podendo digitar o código ou criar sala — só não fica
    // achando que entrou na sala do amigo.
    expect([...lobby.querySelectorAll('button')].map((b) => b.textContent))
      .toContain('Criar sala')
  })

  it('avisa também quando o hash aponta para uma sala sem código nenhum', () => {
    location.hash = '#sala='
    const lobby = renderizarLobby(() => {})
    expect(lobby.querySelector('.aviso')).not.toBeNull()
  })

  it('não avisa nada quando a URL não fala de sala alguma', () => {
    location.hash = ''
    expect(renderizarLobby(() => {}).querySelector('.aviso')).toBeNull()
  })

  it('não avisa nada quando o código do link é válido', () => {
    location.hash = '#sala=K7X2QW9FM3PRTVN4'
    expect(renderizarLobby(() => {}).querySelector('.aviso')).toBeNull()
  })
})

describe('foto de perfil no lobby', () => {
  const foto = 'data:image/jpeg;base64,AAAA'

  it('oferece escolher uma foto, junto do apelido', () => {
    // Apelido e foto são a mesma coisa: quem você é. Separá-los em telas
    // diferentes faria a foto virar um ajuste escondido que ninguém acha.
    const lobby = renderizarLobby(vi.fn())

    expect(lobby.querySelector('[data-perfil="escolher"]')).not.toBeNull()
    expect(lobby.querySelector<HTMLInputElement>('input[type="file"]')).not.toBeNull()
  })

  it('só aceita imagem no seletor de arquivo', () => {
    // Não é segurança — o `accept` é uma dica ao sistema, e o portão de
    // verdade é o redesenho no canvas. Mas evita a pessoa escolher um PDF e
    // levar um erro que ela não entende.
    const lobby = renderizarLobby(vi.fn())
    const campo = lobby.querySelector<HTMLInputElement>('input[type="file"]')!

    expect(campo.accept).toContain('image/')
  })

  it('mostra a foto já guardada', () => {
    localStorage.setItem('topaz:foto', foto)

    const lobby = renderizarLobby(vi.fn())

    expect(lobby.querySelector<HTMLImageElement>('.perfil-previa')!.src).toBe(foto)
  })

  it('sem foto guardada, mostra a inicial do apelido', () => {
    localStorage.setItem('topaz:apelido', 'Alex')

    const lobby = renderizarLobby(vi.fn())

    expect(lobby.querySelector('.perfil-inicial')!.textContent).toBe('A')
  })

  it('dá como tirar a foto de novo, mas só quando existe uma', () => {
    const semFoto = renderizarLobby(vi.fn())
      .querySelector<HTMLElement>('[data-perfil="remover"]')!
    // `hidden` e não ausente: escondido já sai da ordem de tabulação e da
    // árvore de acessibilidade, então some de verdade para quem usa.
    expect(semFoto.hidden).toBe(true)

    localStorage.setItem('topaz:foto', foto)
    const comFoto = renderizarLobby(vi.fn())
      .querySelector<HTMLElement>('[data-perfil="remover"]')!
    expect(comFoto.hidden).toBe(false)
  })

  it('foto adulterada no armazenamento não vira <img>', () => {
    localStorage.setItem('topaz:foto', 'https://exemplo.com/rastreador.png')

    const lobby = renderizarLobby(vi.fn())

    expect(lobby.querySelector('.perfil-previa')).toBeNull()
    expect(lobby.querySelector('img')).toBeNull()
  })
})
