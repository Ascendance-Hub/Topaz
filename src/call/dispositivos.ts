export const CHAVE_MICROFONE = 'topazMicrofone'

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
