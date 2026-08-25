import { gerarIdentidade, importarSegredo, impressaoDigital } from './chaves'
import { esquecerIdentidade, guardarIdentidade, identidadeGuardada } from './cofre'

/**
 * A identidade desta máquina: carrega a que existe, ou cria uma na primeira
 * visita.
 *
 * O campo `segredoNovo` só vem preenchido quando a identidade **acabou de ser
 * criada**. Ele existe para a interface mostrar o segredo UMA vez e insistir
 * que a pessoa guarde — depois disso não há como recuperá-lo, porque a chave
 * guardada é não extraível de propósito.
 *
 * Isso é um trato, não um descuido: em troca de a chave não poder ser roubada
 * do navegador, ela também não pode ser lida de volta por nós. Quem não
 * guardar o segredo perde a identidade ao limpar o navegador ou trocar de
 * máquina, e a tela precisa dizer isso alto.
 */
export interface Identidade {
  par: CryptoKeyPair
  /** O selo curto, para mostrar e comparar. */
  selo: string
  /** Só na criação. Mostre uma vez e esqueça. */
  segredoNovo?: string
}

let emCurso: Promise<Identidade> | null = null

async function carregarOuCriar(): Promise<Identidade> {
  const guardada = await identidadeGuardada()
  if (guardada) {
    return { par: guardada, selo: await impressaoDigital(guardada.publicKey) }
  }
  const { par, segredo } = await gerarIdentidade()
  await guardarIdentidade(par)
  return { par, selo: await impressaoDigital(par.publicKey), segredoNovo: segredo }
}

/**
 * A identidade em uso, criando uma se for a primeira visita.
 *
 * A promessa é guardada em cache para que duas partes da interface pedindo ao
 * mesmo tempo não criem DUAS identidades — a segunda sobrescreveria a primeira
 * no cofre, e quem tivesse guardado o primeiro segredo ficaria com um papel
 * que não abre mais nada.
 */
export function identidadeAtual(): Promise<Identidade> {
  emCurso ??= carregarOuCriar()
  return emCurso
}

/**
 * Entra com um segredo guardado — o "logar noutro dispositivo".
 *
 * Substitui a identidade desta máquina. Quem estava aqui antes só volta se
 * tiver o próprio segredo guardado, e a interface precisa avisar antes.
 */
export async function entrarComSegredo(segredo: string): Promise<Identidade> {
  const par = await importarSegredo(segredo)
  await guardarIdentidade(par)
  const identidade = { par, selo: await impressaoDigital(par.publicKey) }
  emCurso = Promise.resolve(identidade)
  return identidade
}

/**
 * Apaga a identidade desta máquina — o "sair", para quem usou computador
 * emprestado.
 *
 * A próxima chamada de `identidadeAtual` cria uma nova, com segredo novo para
 * mostrar. Sem o segredo antigo guardado, a identidade anterior acabou aqui.
 */
export async function sairDaIdentidade(): Promise<void> {
  await esquecerIdentidade()
  emCurso = null
}

/** Só para os testes: joga fora o cache entre um caso e outro. */
export function esquecerCache(): void {
  emCurso = null
}
