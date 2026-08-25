import { encolherImagem, esquecerFoto, fotoLembrada, lembrarFoto } from '../../perfil/foto-navegador'

/**
 * O retrato de perfil: prévia redonda, botão de escolher e botão de tirar.
 *
 * Mora num arquivo próprio porque aparece em dois lugares — no lobby, ao lado
 * do apelido, e nos Ajustes de dentro da sala. Duplicá-lo faria a correção de
 * um bug precisar acontecer duas vezes.
 *
 * A foto escolhida NÃO é o arquivo: `encolherImagem` decodifica e redesenha
 * num canvas, e o que fica guardado são os pixels que nós desenhamos. É por
 * isso que um executável renomeado não passa daqui — ele falha ao decodificar
 * e a função rejeita.
 *
 * Devolve `atualizar` para quem monta chamar quando a inicial muda: a prévia
 * não pode ficar mostrando a letra de um nome que a pessoa já trocou.
 */
export function renderizarRetrato(
  inicial: () => string, aoMudar: () => void = () => {},
): { raiz: HTMLElement; atualizar: () => void } {
  const area = document.createElement('div')
  area.className = 'perfil'

  const previa = document.createElement('div')
  previa.className = 'perfil-circulo'

  const arquivo = document.createElement('input')
  arquivo.type = 'file'
  // Dica ao seletor do sistema, não segurança: o portão de verdade é o
  // redesenho no canvas. Serve para a pessoa não escolher um PDF e levar um
  // erro que não explica nada.
  arquivo.accept = 'image/*'
  arquivo.hidden = true

  const escolher = document.createElement('button')
  escolher.type = 'button'
  escolher.className = 'botao fantasma perfil-botao'
  escolher.dataset['perfil'] = 'escolher'
  escolher.textContent = 'Escolher foto'
  escolher.onclick = () => arquivo.click()

  const remover = document.createElement('button')
  remover.type = 'button'
  remover.className = 'botao fantasma perfil-botao'
  remover.dataset['perfil'] = 'remover'
  remover.textContent = 'Tirar foto'
  remover.onclick = () => {
    esquecerFoto()
    desenharPrevia()
    aoMudar()
  }

  const erro = document.createElement('p')
  erro.className = 'perfil-erro'
  erro.hidden = true

  const letra = inicial

  function desenharPrevia(): void {
    const foto = fotoLembrada()
    previa.replaceChildren()
    if (foto) {
      const img = document.createElement('img')
      img.className = 'perfil-previa'
      img.src = foto
      img.alt = 'Sua foto de perfil'
      previa.append(img)
    } else {
      const inicial = document.createElement('span')
      inicial.className = 'perfil-inicial'
      inicial.textContent = letra()
      previa.append(inicial)
    }
    // O botão de tirar só existe quando há o que tirar.
    remover.hidden = !foto
  }

  arquivo.onchange = () => {
    const escolhido = arquivo.files?.[0]
    // Limpa o valor para escolher o MESMO arquivo de novo disparar `change`
    // — sem isto, tentar de novo depois de um erro não faria nada.
    arquivo.value = ''
    if (!escolhido) return
    erro.hidden = true
    void encolherImagem(escolhido)
      .then((foto) => {
        lembrarFoto(foto)
        desenharPrevia()
        aoMudar()
      })
      .catch(() => {
        // Um arquivo que não decodifica como imagem chega aqui — inclusive um
        // executável renomeado. Dizer o que houve importa: sem isto, escolher
        // um arquivo e nada acontecer parece o site quebrado.
        erro.hidden = false
        erro.textContent = 'Não deu para ler essa imagem. Escolha um arquivo de foto.'
      })
  }

  desenharPrevia()
  area.append(previa, escolher, remover, arquivo, erro)
  return { raiz: area, atualizar: desenharPrevia }
}
