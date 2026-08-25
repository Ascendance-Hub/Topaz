import { ehFotoValida, LADO_FOTO, recorteQuadrado } from './foto'

/**
 * O lado da imagem que se aceita ao decodificar o que chega da rede.
 *
 * Existe por causa da bomba de descompressão: um PNG de poucos quilobytes pode
 * decodificar para 20000×20000 pixels e comer gigabytes de memória. O teto de
 * bytes de `ehFotoValida` não pega isso — só o tamanho decodificado pega.
 *
 * ⚠️ Mitiga, não elimina: a conferência acontece DEPOIS de o navegador
 * decodificar, então o pico de memória já ocorreu. Aceito num aplicativo entre
 * amigos que entram por convite; num site aberto ao público não seria.
 */
const MAX_LADO_RECEBIDO = 512

/** Carrega um `data:` numa imagem, ou rejeita se não for decodificável. */
function carregar(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rejeitar) => {
    const img = new Image()
    img.onload = () => resolver(img)
    img.onerror = () => rejeitar(new Error('não é uma imagem'))
    img.src = dataUrl
  })
}

function lerArquivo(arquivo: Blob): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader()
    leitor.onload = () => resolver(String(leitor.result))
    leitor.onerror = () => rejeitar(new Error('não deu para ler o arquivo'))
    leitor.readAsDataURL(arquivo)
  })
}

/**
 * Transforma um arquivo escolhido pela pessoa numa foto de perfil.
 *
 * **É aqui que um executável morre.** O arquivo original nunca é transmitido:
 * ele é decodificado num `<img>` e redesenhado num `<canvas>`, e o que sai é a
 * saída do canvas — pixels que nós desenhamos. Um `.exe` renomeado para `.jpg`
 * falha no `onerror` do `<img>` e esta função rejeita; não existe caminho em
 * que os bytes originais cheguem a outra pessoa.
 *
 * O redesenho também descarta tudo que não é pixel: EXIF (inclusive as
 * coordenadas de GPS que celular grava em foto), miniatura embutida, e o
 * truque de anexar um ZIP ao fim de um JPEG válido.
 *
 * Rejeita se o resultado não passar em `ehFotoValida` — o mesmo portão que a
 * foto dos outros atravessa, para que não existam duas regras diferentes para
 * a mesma coisa.
 */
export async function encolherImagem(arquivo: Blob): Promise<string> {
  const img = await carregar(await lerArquivo(arquivo))

  const tela = document.createElement('canvas')
  tela.width = LADO_FOTO
  tela.height = LADO_FOTO
  const pincel = tela.getContext('2d')
  if (!pincel) throw new Error('canvas indisponível')

  const { x, y, lado } = recorteQuadrado(img.naturalWidth, img.naturalHeight)
  pincel.drawImage(img, x, y, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO)

  // JPEG e não PNG: foto de gente comprime muito melhor em JPEG, e a
  // transparência que o PNG guardaria não serve para nada dentro de um
  // círculo recortado.
  const foto = tela.toDataURL('image/jpeg', 0.82)
  if (!ehFotoValida(foto)) throw new Error('a imagem não virou uma foto válida')
  return foto
}

/**
 * Confere uma foto que CHEGOU da rede, incluindo o tamanho decodificado.
 *
 * `ehFotoValida` já barrou formato e bytes; o que sobra é a bomba de
 * descompressão, que só se enxerga depois de decodificar. Devolve `null`
 * quando a foto não serve, para quem chama simplesmente ignorar em vez de
 * tratar erro.
 */
export async function fotoRecebida(valor: unknown): Promise<string | null> {
  if (!ehFotoValida(valor)) return null
  try {
    const img = await carregar(valor)
    if (img.naturalWidth > MAX_LADO_RECEBIDO) return null
    if (img.naturalHeight > MAX_LADO_RECEBIDO) return null
    return valor
  } catch {
    // Passou no formato mas não decodifica: é lixo bem-formatado.
    return null
  }
}

export const CHAVE_FOTO = 'topaz:foto'

/**
 * A foto fica no navegador de quem escolheu, junto com o apelido — os dois
 * juntos são a identidade da pessoa, e nenhum dos dois existe em servidor
 * nenhum. Trocar de computador significa escolher de novo, e isso é o preço
 * declarado de não ter banco de dados.
 */
export function lembrarFoto(foto: string): void {
  try {
    localStorage.setItem(CHAVE_FOTO, foto)
  } catch {
    // Armazenamento bloqueado ou cheio: a foto vale só nesta sessão.
  }
}

export function fotoLembrada(): string | null {
  try {
    const guardada = localStorage.getItem(CHAVE_FOTO)
    // Passa pelo mesmo portão do que vem da rede: o localStorage é editável
    // por qualquer script que rode nesta origem, e uma extensão basta.
    return ehFotoValida(guardada) ? guardada : null
  } catch {
    return null
  }
}

export function esquecerFoto(): void {
  try {
    localStorage.removeItem(CHAVE_FOTO)
  } catch {
    // Nada a fazer: sem armazenamento não havia o que remover.
  }
}
