// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderizarLobby, apelidoSalvo, salvarApelido } from './lobby'

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
    location.hash = '#sala=K7X2QW9F'
    const lobby = renderizarLobby(() => {})
    const campo = lobby.querySelector<HTMLInputElement>('.campo')!
    campo.value = 'Ana'
    const botao = lobby.querySelector<HTMLButtonElement>('.botao')!
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
    location.hash = '#sala=K7X2QW9F'
    const lobby = renderizarLobby(() => {})
    const botoes = [...lobby.querySelectorAll('button')].map((b) => b.textContent)
    expect(botoes).toEqual(['Entrar na sala'])
    expect(lobby.querySelector('.sub')?.textContent).toBe('Entrando na sala K7X2QW9F')
  })
})

describe('apelido em branco', () => {
  it('não chama aoEntrar quando o apelido está vazio', () => {
    location.hash = '#sala=K7X2QW9F'
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
    campoCodigo.value = 'K7X2QW9F'
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
    campoCodigo.value = ' k7x2qw9f '
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).toHaveBeenCalledWith('Ana', 'K7X2QW9F')
    expect(location.hash).toBe('#sala=K7X2QW9F')
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
    campoCodigo.value = 'k7x2 qw9f'
    const entrarBotao = [...lobby.querySelectorAll('button')].find(
      (b) => b.textContent === 'Entrar',
    )!
    entrarBotao.click()
    expect(aoEntrar).toHaveBeenCalledWith('Ana', 'K7X2QW9F')
    expect(location.hash).toBe('#sala=K7X2QW9F')
  })

  it('não entra quando o código tem 8 caracteres mas algum está fora do alfabeto', () => {
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
