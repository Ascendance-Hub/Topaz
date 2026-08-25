/**
 * As buscas de elementos de mídia por pessoa.
 *
 * Existe separado de `main.ts` por causa de uma armadilha: o identificador de
 * uma pessoa (`peerId`) vem da rede, e durante um bom tempo ele era
 * interpolado direto num seletor CSS — `querySelector('[data-de="' + peerId +
 * '"]')`. Isso dava dois problemas de uma vez. Um `peerId` com aspas produz um
 * seletor inválido e `querySelector` LANÇA, matando no meio o tratador de
 * saída de peer (o vídeo nunca some, e nada aparece no console além de uma
 * exceção solta). E um identificador forjado pode montar um seletor que casa
 * com a caixa de OUTRA pessoa, removendo o vídeo errado.
 *
 * Aqui não existe seletor a forjar: a comparação é de string, e o único
 * seseletor usado é a constante `[data-de]`.
 */

/** Os elementos marcados com `data-de` igual a este peerId. */
export function elementosDe(container: ParentNode, peerId: string): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-de]')]
    .filter((el) => el.dataset['de'] === peerId)
}

/**
 * Larga o stream que um elemento de mídia segura.
 *
 * `remove()` sozinho não basta. Enquanto o elemento aponta para o
 * `srcObject`, o stream e o decodificador continuam vivos — e um `<video>`
 * fora da árvore ainda pode estar tocando o áudio da tela de alguém, que foi
 * exatamente o sintoma de "parei de assistir e o som continuou saindo".
 */
export function soltarMidia(el: HTMLMediaElement): void {
  el.pause()
  el.srcObject = null
}

/** Larga a mídia de um elemento e de tudo que ele contém. */
function soltarTudoDentro(el: Element): void {
  // O `data-de` pode estar no próprio elemento de mídia (o <audio> da voz) ou
  // na caixa que embrulha o <video> da tela.
  if (el instanceof HTMLMediaElement) soltarMidia(el)
  for (const midia of el.querySelectorAll('video, audio')) {
    soltarMidia(midia as HTMLMediaElement)
  }
}

/** Tira do DOM o que for daquela pessoa, largando a mídia antes. */
export function removerMidiaDe(container: ParentNode, peerId: string): void {
  for (const el of elementosDe(container, peerId)) {
    soltarTudoDentro(el)
    el.remove()
  }
}

/** Esvazia a área inteira — o caminho de sair da call. */
export function limparMidia(container: ParentNode): void {
  for (const el of [...container.children]) soltarTudoDentro(el)
  container.replaceChildren()
}

/**
 * `setSinkId` manda um elemento de mídia para uma saída de áudio específica.
 * Existe no Chrome e no Edge; Safari não tem, e o Firefox só ganhou tarde.
 */
type MidiaComSaida = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }

/**
 * Se este navegador sabe trocar a saída de áudio.
 *
 * Quem monta a interface pergunta antes de desenhar o seletor: um controle que
 * a pessoa mexe e não muda nada é pior do que não ter controle nenhum — ela
 * conclui que o site está quebrado, em vez de que o navegador não suporta.
 */
export function suportaTrocarSaida(): boolean {
  return typeof HTMLMediaElement !== 'undefined'
    && 'setSinkId' in HTMLMediaElement.prototype
}

/**
 * Manda todo o áudio e vídeo da área para a saída escolhida.
 *
 * O vídeo entra junto de propósito: a tela compartilhada leva o áudio do
 * sistema, e mandar a voz para o fone deixando o som do jogo no alto-falante
 * seria resolver metade do problema.
 *
 * Roda sobre os elementos que existem AGORA, então precisa ser chamada de novo
 * quando alguém novo aparece — a saída escolhida é estado da pessoa, e um
 * elemento criado depois nasceria na saída padrão.
 */
export function aplicarSaida(container: ParentNode, deviceId: string): void {
  if (!suportaTrocarSaida()) return
  for (const el of container.querySelectorAll('video, audio')) {
    // A promessa pode ser recusada (permissão, aparelho que sumiu). Sem o
    // catch isso vira rejeição não tratada: enche o console e, dependendo de
    // onde foi chamada, derruba o tratador que a chamou.
    void (el as MidiaComSaida).setSinkId?.(deviceId).catch((erro: unknown) => {
      console.warn('não deu para trocar a saída de áudio:', erro)
    })
  }
}
