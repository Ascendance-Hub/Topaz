/**
 * Perfis de H.264, do melhor para o pior, pelos dois primeiros bytes do
 * `profile-level-id`. High comprime melhor que Main, que comprime melhor que
 * Baseline — e para conteúdo de tela, com grandes áreas paradas, a diferença
 * aparece.
 */
const PERFIS = ['64', '4d', '42']

function posicaoDoPerfil(codec: RTCRtpCodec): number {
  const id = /profile-level-id=([0-9a-f]{2})/i.exec(codec.sdpFmtpLine ?? '')?.[1]
  const posicao = id ? PERFIS.indexOf(id.toLowerCase()) : -1
  // Desconhecido vai para o fim, sem descartar: é melhor que não ter H.264.
  return posicao === -1 ? PERFIS.length : posicao
}

/**
 * Escolhe o melhor perfil de H.264 que este navegador sabe enviar.
 *
 * Existe porque pegar o primeiro da lista — que era o que este módulo fazia —
 * costuma entregar `packetization-mode=0` e Baseline, e a tela chega feia
 * mesmo com bitrate sobrando. O usuário reportou exatamente isso: "mesmo em
 * 1080p não parece que a qualidade está boa".
 *
 * O modo de empacotamento pesa mais que o perfil: `packetization-mode=1`
 * permite fatiar uma NAL unit em vários pacotes, e sem isso quadros grandes
 * — justamente os de tela — fragmentam mal e aparecem artefatos antes de o
 * perfil fazer qualquer diferença.
 */
export function escolherH264(codecs: readonly RTCRtpCodec[]): RTCRtpCodec | undefined {
  const h264 = codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264')
  if (h264.length === 0) return undefined

  const modo1 = h264.filter((c) => (c.sdpFmtpLine ?? '').includes('packetization-mode=1'))
  const candidatos = modo1.length > 0 ? modo1 : h264

  return [...candidatos].sort((a, b) => posicaoDoPerfil(a) - posicaoDoPerfil(b))[0]
}
