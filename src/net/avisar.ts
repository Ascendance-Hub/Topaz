/**
 * Avisa uma lista de ouvintes sem deixar um derrubar os outros.
 *
 * Uma única entrada de peer alimenta três assinantes que não se conhecem: a
 * `Sessao` (jogo), o `ProtocoloCall` (voz e tela) e o anúncio de foto. Um
 * `for` cru entrega isso a todos até o primeiro estouro — e, a partir dali,
 * tudo que vinha depois simplesmente não roda.
 *
 * O sintoma é cruel de diagnosticar: a sala conecta, o chat funciona, o jogo
 * funciona, e a call fica vazia para sempre. Nada aparece quebrado, porque a
 * peça que quebrou é a que deveria ter falado.
 *
 * O estouro é registrado em vez de engolido: isolar ouvintes é para o
 * problema de um não virar problema de todos, não para esconder que houve
 * problema.
 */
export function avisarTodos<A extends unknown[]>(
  ouvintes: readonly ((...args: A) => void)[], ...args: A
): void {
  // Cópia antes de percorrer: um ouvinte pode se inscrever ou se desinscrever
  // enquanto é avisado, e mexer na lista durante o laço pularia o vizinho.
  for (const cb of [...ouvintes]) {
    try {
      cb(...args)
    } catch (erro) {
      console.error('um ouvinte estourou; os demais seguem avisados', erro)
    }
  }
}
