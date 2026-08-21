/**
 * Um stream que chega é tela ou microfone?
 *
 * A resposta sai das FAIXAS do próprio stream, e não do metadado que o
 * remetente mandou — de propósito.
 *
 * O Trystero pareia metadado e faixa por uma fila FIFO por peer
 * (`pendingStreamMetas`), e microfone e tela da mesma pessoa dividem essa
 * fila. Um metadado que chegue sem faixa correspondente — o que acontece
 * quando alguém entra e a conexão ainda está sendo estabelecida — desalinha a
 * fila para sempre: dali em diante todo stream recebe o rótulo do anterior.
 *
 * Na prática isso fazia o microfone de alguém ser tratado como tela e ir
 * parar num `<video>` mudo: você parava de ouvir quem já ouvia, sem erro
 * nenhum aparecer. As faixas não têm como mentir.
 */
export function ehTela(stream: MediaStream): boolean {
  return stream.getVideoTracks().length > 0
}
