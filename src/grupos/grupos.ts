import { ehCodigoValido } from '../ui/codigo'

/**
 * Os grupos salvos: atalhos para salas que a pessoa costuma usar.
 *
 * **Um grupo é um marcador local**, não um cadastro. Nome, código e cor ficam
 * no navegador de quem salvou, e "quem está no grupo" é quem está na sala
 * agora. Sem servidor não existe lista de membros que alguém possa manter —
 * fingir que existe seria mentir sobre o que o produto é.
 *
 * A consequência precisa aparecer na interface: entrar no mesmo grupo noutro
 * computador exige o link de novo. É o mesmo preço da foto e da identidade.
 */

export interface Grupo {
  /** O código da sala, na forma canônica. É a identidade do grupo. */
  codigo: string
  nome: string
}

export const CHAVE_GRUPOS = 'topaz:grupos'

/** Teto de nome. Cabe "Os manos do trampo" com folga e não estoura o trilho. */
export const MAX_NOME = 32

/**
 * Teto de grupos guardados.
 *
 * Não é limite de produto: é o que impede uma lista corrompida — ou uma aba
 * com defeito escrevendo em laço — de virar centenas de salas abertas ao mesmo
 * tempo quando a presença entre grupos existir.
 */
export const MAX_GRUPOS = 24

/**
 * A paleta dos grupos.
 *
 * A cor sai do CÓDIGO, não de uma escolha guardada: assim o mesmo grupo tem a
 * mesma cor em qualquer máquina, sem nada precisar ser sincronizado — e não há
 * um campo a mais para corromper. Todas nascem do mesmo abajur da sala, então
 * nenhuma briga com o feltro.
 */
const PALETA = [
  '#F0B34A', // topázio
  '#7FB08A', // sálvia
  '#C98A6B', // terracota
  '#8FA6C4', // aço azulado
  '#B98AC4', // ameixa
  '#D4A05C', // âmbar
] as const

/** A cor de um grupo, sempre a mesma para o mesmo código. */
export function corDoGrupo(codigo: string): string {
  let soma = 0
  for (const letra of codigo) soma = (soma + letra.charCodeAt(0)) % 4096
  return PALETA[soma % PALETA.length]!
}

/** Corta e limpa um nome digitado. Vazio vira o próprio código, para nenhum
 *  grupo aparecer como um retângulo sem rótulo. */
export function nomeLimpo(bruto: string, codigo: string): string {
  const nome = bruto.replace(/\s+/g, ' ').trim().slice(0, MAX_NOME)
  return nome || codigo
}

function ehGrupo(valor: unknown): valor is Grupo {
  if (typeof valor !== 'object' || valor === null) return false
  const g = valor as Record<string, unknown>
  if (typeof g['nome'] !== 'string' || g['nome'].length > MAX_NOME) return false
  // O código passa pelo MESMO portão da URL e do campo digitado. Um código
  // inválido aqui levaria a uma sala que nunca vai ter ninguém.
  return typeof g['codigo'] === 'string' && ehCodigoValido(g['codigo'])
}

/**
 * Os grupos salvos, já conferidos.
 *
 * O `localStorage` é editável por qualquer script desta origem — uma extensão
 * basta — e também guarda o que versões antigas do site escreveram. Ler de lá
 * é tão pouco confiável quanto ler da rede, e recebe o mesmo tratamento:
 * o que não passa é descartado em silêncio, sem derrubar o resto da lista.
 */
export function grupos(): Grupo[] {
  try {
    const cru: unknown = JSON.parse(localStorage.getItem(CHAVE_GRUPOS) ?? '[]')
    if (!Array.isArray(cru)) return []
    return cru.filter(ehGrupo).slice(0, MAX_GRUPOS)
  } catch {
    // Armazenamento bloqueado, ou JSON corrompido: começa vazio.
    return []
  }
}

function gravar(lista: Grupo[]): void {
  try {
    localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(lista.slice(0, MAX_GRUPOS)))
  } catch {
    // Sem armazenamento, os grupos valem só nesta sessão.
  }
}

/**
 * Salva um grupo, ou renomeia o que já existe com aquele código.
 *
 * O código é a identidade: salvar a mesma sala duas vezes com nomes diferentes
 * daria dois cartões que abrem o mesmo lugar, e a pessoa não teria como saber
 * qual apagar.
 */
export function salvarGrupo(codigo: string, nome: string): Grupo[] {
  if (!ehCodigoValido(codigo)) return grupos()
  const grupo: Grupo = { codigo, nome: nomeLimpo(nome, codigo) }
  const outros = grupos().filter((g) => g.codigo !== codigo)
  // O mais recente na frente: quem acabou de salvar procura ele primeiro.
  const lista = [grupo, ...outros].slice(0, MAX_GRUPOS)
  gravar(lista)
  return lista
}

export function removerGrupo(codigo: string): Grupo[] {
  const lista = grupos().filter((g) => g.codigo !== codigo)
  gravar(lista)
  return lista
}

/** Se esta sala já está salva — o que decide entre "Salvar" e "Salvo". */
export function grupoSalvo(codigo: string): Grupo | null {
  return grupos().find((g) => g.codigo === codigo) ?? null
}
