import { corDoGrupo, type Grupo } from '../../grupos/grupos'

/**
 * As salas salvas, no topo da coluna da esquerda.
 *
 * Antes elas só existiam na home, e trocar de sala exigia sair da que você
 * estava. Aqui elas ficam sempre à vista — é o mesmo gesto de todo aplicativo
 * de conversa, e o motivo é o mesmo: mudar de grupo é coisa que se faz o dia
 * inteiro, não uma vez por sessão.
 *
 * **Ícones e não nomes**, ao contrário do trilho logo abaixo. Aqui a
 * iconografia é gerada da própria sala: a cor sai do código (`corDoGrupo`), e
 * a inicial sai do nome que a pessoa deu. Não há charada a decifrar — a pessoa
 * nomeou aquilo, e reconhece a própria cor. E o nome inteiro está no `title` e
 * no rótulo, para quem precisar dele.
 *
 * A sala em que você está fica marcada. Sem isso, uma pessoa com quatro salas
 * salvas não teria como saber em qual delas está.
 */

export interface AcoesDeSalas {
  /** Trocar de sala: desmonta esta e monta a outra. */
  ir: (codigo: string) => void
  /** Voltar à home, que é de onde se entra numa sala que não está salva. */
  outra: () => void
}

/** A inicial que vai no ícone. `[...nome]` porque emoji em nome é comum. */
function inicialDaSala(grupo: Grupo): string {
  const limpo = grupo.nome.trim()
  return limpo ? [...limpo][0]!.toUpperCase() : '#'
}

export function renderizarSalasSalvas(
  lista: Grupo[], codigoAtual: string, acoes: AcoesDeSalas,
): HTMLElement {
  const area = document.createElement('nav')
  area.className = 'salas-salvas'
  area.setAttribute('aria-label', 'Suas salas')

  for (const grupo of lista) {
    const aqui = grupo.codigo === codigoAtual

    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'sala-icone'
    botao.dataset['sala'] = grupo.codigo
    botao.style.setProperty('--cor-sala', corDoGrupo(grupo.codigo))
    botao.textContent = inicialDaSala(grupo)
    // O nome inteiro não cabe no ícone, mas precisa existir: no `title` para
    // quem passa o mouse, no rótulo para quem usa leitor de tela.
    botao.title = grupo.nome
    botao.setAttribute(
      'aria-label', `${grupo.nome}${aqui ? ' — você está aqui' : ''}`)
    if (aqui) {
      botao.dataset['aqui'] = '1'
      botao.setAttribute('aria-current', 'true')
    }
    // Clicar na sala em que já se está não faz nada. Desabilitar tiraria o
    // botão da ordem de tabulação, e quem navega por teclado perderia a
    // referência de onde está.
    botao.onclick = () => { if (!aqui) acoes.ir(grupo.codigo) }

    area.append(botao)
  }

  const outra = document.createElement('button')
  outra.type = 'button'
  outra.className = 'sala-icone sala-outra'
  outra.dataset['sala'] = 'outra'
  outra.textContent = '+'
  outra.title = 'Entrar em outra sala'
  outra.setAttribute('aria-label', 'Entrar em outra sala')
  outra.onclick = () => acoes.outra()
  area.append(outra)

  return area
}
