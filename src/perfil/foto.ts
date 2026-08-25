/**
 * A foto de perfil: um `data:` de imagem que NÓS geramos, nunca um endereço.
 *
 * A alternativa pedida era colar um link de imagem. Ela foi descartada por um
 * motivo de projeto, não de dificuldade: cada pessoa da sala buscaria um
 * arquivo num servidor de terceiro escolhido por outra pessoa. Acabamos de
 * gastar um ciclo tirando o Google Fonts justamente por isso, e o CSP
 * (`img-src 'self' data:`) foi fechado para impedir exatamente esse tipo de
 * busca. Gerar a imagem aqui dentro mantém as duas decisões de pé.
 *
 * **Por que um executável não passa por aqui:** o arquivo escolhido nunca é
 * transmitido. Ele é decodificado num `<img>` e redesenhado num `<canvas>`, e
 * o que viaja é a saída do canvas — pixels que nós desenhamos. Um arquivo que
 * não for imagem simplesmente falha ao decodificar e não produz nada. De
 * quebra, o redesenho descarta tudo que não é pixel: EXIF (inclusive as
 * coordenadas de GPS que celular grava), miniatura embutida, e o truque de
 * colar um ZIP no fim de um JPEG válido.
 */

/** Lado do quadrado gerado. O círculo na tela tem 52px; 96 cobre telas de
 *  alta densidade sem virar peso na rede. */
export const LADO_FOTO = 96

/**
 * Teto de bytes do texto que trafega.
 *
 * O nosso encolhimento produz uns 4 a 8 mil bytes. O teto é folgado para caber
 * uma foto com muito detalhe, e apertado o bastante para que ninguém mande
 * dezenas de megabytes e trave o navegador de todo mundo na sala.
 */
export const MAX_BYTES_FOTO = 64_000

/**
 * Só os formatos que o `canvas.toDataURL` sabe produzir.
 *
 * SVG fica de fora de propósito: ele pode carregar script, e — mais decisivo —
 * o canvas nunca gera SVG, então nenhuma foto legítima chega assim. O que
 * chegar nesse formato foi forjado à mão.
 */
const PADRAO_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]*$/

/**
 * Se este texto pode ser mostrado como foto de alguém.
 *
 * Aplicado em quem RECEBE, não só em quem envia: o limite de quem envia só
 * vale para quem é honesto, e do outro lado da sala pode estar um cliente
 * modificado.
 */
export function ehFotoValida(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  if (valor.length > MAX_BYTES_FOTO) return false
  return PADRAO_FOTO.test(valor)
}

/**
 * O maior quadrado central de uma imagem qualquer.
 *
 * Cortar e não esticar: esticar uma foto larga para caber num quadrado achata
 * o rosto de todo mundo. É o erro clássico de avatar, e ele só aparece quando
 * alguém usa uma foto que não é quadrada — ou seja, quase sempre.
 */
export function recorteQuadrado(
  largura: number, altura: number,
): { x: number; y: number; lado: number } {
  const lado = Math.min(largura, altura)
  return {
    x: Math.floor((largura - lado) / 2),
    y: Math.floor((altura - lado) / 2),
    lado,
  }
}
