import { grupos, removerGrupo } from '../grupos/grupos'
import { criarAcoesIdentidade } from '../identidade/acoes'
import { identidadeAtual } from '../identidade/atual'
import type { Identidade } from '../identidade/atual'
import { observarGrupos, PAUSA_ENTRE_SALAS_MS } from '../presenca/presenca'
import { abrirSalaDeFundo } from '../presenca/sala-de-fundo'
import { renderizarFaixaGrupos } from '../ui/components/faixa-grupos'
import { renderizarHome } from '../ui/components/home'
import { renderizarIdentidade } from '../ui/components/identidade'
import { apelidoSalvo } from '../ui/components/lobby'
import { criarPainelDeRede } from '../ui/painel-rede'

/**
 * A tela inicial.
 *
 * Ela não sabe montar uma sala — quem sabe é quem a chama. Isso não é cerimônia:
 * a home é a porta, e a sala é o outro lado; amarrar as duas aqui faria a porta
 * depender de tudo que existe lá dentro.
 *
 * O que ela sabe é o resto: a identidade desta máquina, quem está online nos
 * grupos salvos, e o teste de rede — que mora aqui **e** dentro da sala, porque
 * quem recebeu um link e não consegue entrar nunca chega à sala para achá-lo.
 */
export function montarHome(
  app: HTMLElement,
  /** Sair da tela inicial para uma sala. */
  entrarNaSala: (apelido: string, codigo: string) => void,
): void {
  const painelRede = criarPainelDeRede(() => desenharHome())
  let identidade: Identidade | null = null

  /** Redesenha a home depois de qualquer mudança de identidade. */
  const adotar = (nova: Identidade): void => {
    identidade = nova
    desenharHome()
  }

  const acoesIdentidade = criarAcoesIdentidade(() => identidade, adotar)

  identidadeAtual().then(adotar).catch((erro: unknown) => {
    // Cofre indisponível (janela anônima, política do navegador): a home
    // continua servindo para entrar em sala, só sem identidade.
    console.warn('não deu para carregar a identidade', erro)
  })

  /**
   * Quem está online em cada grupo salvo, já na tela inicial.
   *
   * Aqui pode começar na hora: não há sala se formando para competir com ela.
   * As aberturas continuam espaçadas mesmo assim — são três redes por grupo, e
   * abrir todas de uma vez trava a página de quem tem vários.
   */
  const presenca = observarGrupos(
    grupos().map((g) => g.codigo), abrirSalaDeFundo, PAUSA_ENTRE_SALAS_MS)
  presenca.aoMudar(() => desenharHome())

  /**
   * Sair da tela inicial para uma sala.
   *
   * A observação da home é encerrada, e **sem esperar**: as salas de presença
   * têm id próprio (`codigo#presenca`), então nenhuma delas pode ser devolvida
   * no lugar da sala de verdade. Esperar aqui foi o que deixou a entrada lenta
   * nas tentativas anteriores, e não protege de nada neste desenho.
   */
  const irParaSala = (apelido: string, codigo: string): void => {
    presenca.encerrar()
    entrarNaSala(apelido, codigo)
  }

  /**
   * Entrar direto por um cartão de grupo.
   *
   * O apelido guardado é usado sem perguntar — quem tem grupos salvos já passou
   * pela porta da frente pelo menos uma vez. Se ele não existir (o
   * armazenamento pode ter sido limpo pela metade), o cartão não faz nada em
   * silêncio: leva o foco para o campo, que é o que resolve.
   */
  const entrarNoGrupo = (codigo: string): void => {
    const apelido = apelidoSalvo()
    if (!apelido) {
      app.querySelector<HTMLInputElement>('input[placeholder="Seu apelido"]')?.focus()
      return
    }
    irParaSala(apelido, codigo)
  }

  function desenharHome(): void {
    app.replaceChildren(renderizarHome(irParaSala, {
      // Sem a lista de servidores, de propósito: aqui ninguém entrou em sala
      // ainda, nenhum socket está aberto, e "0 de 20" lê como falha
      // catastrófica para quem acabou de abrir a página. A lista só quer dizer
      // alguma coisa DENTRO da sala. O teste de NAT em si funciona sozinho:
      // ele fala com os servidores STUN direto.
      testeRede: painelRede.desenhar(false),
      identidade: renderizarIdentidade(identidade, acoesIdentidade),
      grupos: renderizarFaixaGrupos(grupos(), entrarNoGrupo, (codigo) => {
        removerGrupo(codigo)
        // Grupo removido deixa de ser observado na hora: continuar segurando a
        // sala dele seria pagar por uma contagem que ninguém mais vê.
        presenca.sincronizar(grupos().map((g) => g.codigo))
        desenharHome()
      }, presenca.quantos),
    }))
  }

  desenharHome()
}
