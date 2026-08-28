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
 *
 * **Quem tem uma lista própria em mãos usa `criarEmissor`**, logo abaixo — em
 * produção esta função só é chamada por ele. Ela continua exportada e testada
 * porque os testes dela são a **especificação da semântica**: é o que a cópia
 * à mão de `call/protocolo.ts` (que não pode importar daqui) precisa espelhar.
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

/**
 * Uma lista de ouvintes com nome.
 *
 * O padrão — declarar `((...) => void)[]`, empurrar em `aoX(cb)` e chamar
 * `avisarTodos` — aparecia em **vinte declarações** espalhadas por dez
 * arquivos, e em **três** implementações diferentes de "avisar". Uma delas, em
 * `identidade/apresentacao.ts`, percorria a lista VIVA e sem isolamento: um
 * ouvinte que estourasse levava junto todos os que vinham depois.
 *
 * Isto não é açúcar sintático. É um lugar só para decidir a semântica que este
 * projeto pagou caro para aprender:
 *
 * - **isolar o estouro**, porque uma entrada de peer alimenta o jogo, a call e
 *   as fotos pelo mesmo laço, e uma falha na primeira peça apagava as outras
 *   em silêncio (Capítulo 9 do diário);
 * - **percorrer uma cópia**, porque um ouvinte pode se inscrever enquanto está
 *   sendo avisado, e mexer na lista durante o laço pularia o vizinho.
 *
 * `ouvir` e `avisar` são closures, não métodos: os consumidores expõem
 * `aoReceberAcao: aoAcao.ouvir` passando a referência solta, e um método
 * perderia o `this` ali.
 *
 * Fica neste arquivo, junto de `avisarTodos`, porque é o mesmo assunto — e um
 * arquivo novo para quinze linhas seria pior.
 *
 * **`src/call/protocolo.ts` não usa isto**, e é de propósito:
 * `isolamento.test.ts` proíbe aquele arquivo de importar de fora de `src/call`,
 * para a metade testável da call continuar testável sem navegador. Lá a cópia
 * é escrita à mão, com comentário dizendo por quê.
 */
export interface Emissor<A extends unknown[]> {
  ouvir(cb: (...args: A) => void): void
  avisar(...args: A): void
}

export function criarEmissor<A extends unknown[]>(): Emissor<A> {
  const ouvintes: ((...args: A) => void)[] = []
  return {
    ouvir: (cb) => { ouvintes.push(cb) },
    avisar: (...args) => avisarTodos(ouvintes, ...args),
  }
}
