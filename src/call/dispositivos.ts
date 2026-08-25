export const CHAVE_MICROFONE = 'topazMicrofone'
export const CHAVE_SAIDA = 'topazSaidaAudio'

export interface Dispositivo {
  id: string
  nome: string
}

/**
 * As entradas de áudio, com nome utilizável.
 *
 * O navegador só entrega os nomes depois da permissão concedida — antes disso
 * a lista vem anônima. Um seletor com opções em branco é pior que um seletor
 * com "Microfone 1" e "Microfone 2": pelo menos dá para alternar entre eles e
 * descobrir qual é qual.
 */
export function microfones(dispositivos: MediaDeviceInfo[]): Dispositivo[] {
  return dispositivos
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
    .map((d, i) => ({ id: d.deviceId, nome: d.label || `Microfone ${i + 1}` }))
}

export function lembrarMicrofone(id: string): void {
  try {
    localStorage.setItem(CHAVE_MICROFONE, id)
  } catch {
    // Navegador com armazenamento bloqueado: a escolha vale só nesta sessão.
  }
}

export function microfoneLembrado(): string | null {
  try {
    return localStorage.getItem(CHAVE_MICROFONE)
  } catch {
    return null
  }
}

/**
 * Qual microfone usar: o lembrado, se ainda existir; senão o primeiro.
 *
 * O "se ainda existir" é o ponto. Um fone desconectado entre uma sessão e
 * outra deixa para trás um id que não resolve mais, e insistir nele faria o
 * `getUserMedia` falhar — a pessoa entraria muda sem entender por quê.
 */
export function escolherMicrofone(
  lista: Dispositivo[], lembrado: string | null,
): string | null {
  if (lembrado && lista.some((m) => m.id === lembrado)) return lembrado
  return lista[0]?.id ?? null
}

/**
 * Por que o microfone não abriu, em texto que a pessoa possa usar.
 *
 * Existe porque negar a permissão **matava o botão em silêncio**: o
 * `getUserMedia` rejeitava, a entrada na call nunca acontecia, e clicar em
 * "Entrar na call" não fazia nada visível. A pessoa ficava sem entender se o
 * site estava quebrado ou se ela tinha feito algo errado.
 *
 * A leitura do nome é por propriedade, não por `instanceof DOMException`:
 * exceção vinda de outro contexto (worker, iframe) falha o `instanceof` mesmo
 * sendo exatamente o erro que a gente quer reconhecer.
 */
export function motivoSemMicrofone(erro: unknown): string {
  const nome =
    typeof erro === 'object' && erro !== null && 'name' in erro
      ? String((erro as { name: unknown }).name)
      : ''

  switch (nome) {
    case 'NotAllowedError':
    case 'SecurityError':
      // O único caso que a pessoa resolve sozinha — então diz onde.
      return 'O navegador bloqueou o microfone. Libere no cadeado da barra de '
        + 'endereços e clique em Ativar microfone.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhum microfone encontrado neste computador.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'O microfone está ocupado por outro programa. Feche o outro '
        + 'programa e clique em Ativar microfone.'
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'O microfone escolhido não está mais disponível. Escolha outro no '
        + 'seletor.'
    default:
      // Nunca vazio: um aviso em branco é quase tão ruim quanto o botão mudo
      // que este código veio consertar.
      return 'Não foi possível abrir o microfone.'
  }
}

/**
 * As saídas de áudio, com nome utilizável. Mesma regra dos microfones: id
 * vazio não serve para `setSinkId`, e nome ausente vira um rótulo numerado
 * para dar ao menos com o que alternar.
 */
export function saidasDeAudio(dispositivos: MediaDeviceInfo[]): Dispositivo[] {
  return dispositivos
    .filter((d) => d.kind === 'audiooutput' && d.deviceId !== '')
    .map((d, i) => ({ id: d.deviceId, nome: d.label || `Saída ${i + 1}` }))
}

export function lembrarSaida(id: string): void {
  try {
    localStorage.setItem(CHAVE_SAIDA, id)
  } catch {
    // Navegador com armazenamento bloqueado: a escolha vale só nesta sessão.
  }
}

export function saidaLembrada(): string | null {
  try {
    return localStorage.getItem(CHAVE_SAIDA)
  } catch {
    return null
  }
}

/** Mesma regra de `escolherMicrofone`: o lembrado só vale se ainda existir. */
export function escolherSaida(
  lista: Dispositivo[], lembrado: string | null,
): string | null {
  if (lembrado && lista.some((s) => s.id === lembrado)) return lembrado
  return lista[0]?.id ?? null
}
