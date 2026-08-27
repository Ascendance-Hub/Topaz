/**
 * O id da sala de presença de um grupo — NUNCA o código do grupo.
 *
 * Módulo próprio, sem importar nada, porque esta regra é a peça mais
 * importante do desenho e merece poder ser lida e testada sozinha: quem abre
 * as salas puxa 425 kB de Trystero junto, e uma regra de uma linha não deveria
 * custar isso para ser verificada.
 *
 * ## Por que existe
 *
 * O Trystero indexa as salas abertas **só pelo `roomId`** e devolve a que já
 * existe, ignorando a config (`strategy.ts:213`):
 *
 *     if (occupiedRooms[appId]?.[roomId]) return occupiedRooms[appId][roomId]
 *
 * As quatro tentativas anteriores de presença usavam o MESMO código nas duas
 * salas. Medido com o grupo observado no fundo e depois aberto:
 *
 *     mesmoObjeto: true · isPassive: true · conexões pré-fabricadas: 0
 *
 * Entrar no grupo devolvia a sala de fundo **passiva**. Passivo não anuncia e
 * não pré-fabrica ofertas: a pessoa entrava invisível e sem munição, e só
 * conectava se alguém a achasse primeiro. Era o "trocar de grupo está lento e
 * inconstante" — e não era a presença atrapalhando de fora, era o app entrando
 * na sala errada.
 *
 * Com id próprio, a mesma medição deu `mesmoObjeto: false` e a sala de verdade
 * ativa. Some a família inteira de bug, sem `await` e sem tocar no ciclo de
 * vida da sala.
 *
 * ## A outra metade da regra
 *
 * Observador e anunciante precisam chegar no MESMO id, senão a presença não vê
 * ninguém — que é o outro sintoma que já custou três dias. Por isso a derivação
 * mora aqui, num lugar só, e não em cada chamador.
 */
export function idDePresenca(codigo: string): string {
  return `${codigo}#presenca`
}
