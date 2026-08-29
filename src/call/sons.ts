import type { EstadoCall } from './protocolo'

/**
 * Os avisos sonoros da call.
 *
 * Sintetizados, e não tocados de arquivo: **zero byte no bundle, nenhum
 * terceiro, nenhuma regra nova de CSP.** Combina com a regra do projeto de não
 * buscar nada de fora — o `<link>` para o Google Fonts saiu daqui por menos.
 *
 * O preço é honesto: som sintetizado soa mais "bip" que Discord. Em troca, o
 * site continua sendo um arquivo que não pede nada a ninguém.
 */
export type TipoDeSom = 'entrar' | 'sair' | 'mudo' | 'desmudo' | 'tela'

/** O que se compara entre dois instantes para saber o que fazer barulho. */
export interface InstanteDaCall {
  euNaCall: boolean
  /** Quem está no MEU canal — é com essas pessoas que eu falo. */
  comigo: readonly string[]
  /** Quem compartilha tela no meu canal. */
  compartilhando: readonly string[]
  euCompartilhando: boolean
  meuMicrofoneMudo: boolean
}

export function instanteDaCall(estado: EstadoCall, meuMicrofoneMudo: boolean): InstanteDaCall {
  return {
    euNaCall: estado.euNaCall,
    comigo: estado.comigo,
    compartilhando: estado.compartilhando,
    euCompartilhando: estado.euCompartilhando,
    meuMicrofoneMudo,
  }
}

/**
 * Que sons a mudança pede.
 *
 * **Isto é detecção de borda — e aqui ela é a forma certa**, ao contrário do
 * resto da mídia deste projeto, que é toda reconciliação. A diferença é o que
 * se perde ao errar: uma publicação perdida é alguém que fica mudo para
 * sempre; um som perdido é um som perdido.
 *
 * A regra que evita o erro clássico: **entrar numa call que já tem gente não
 * toca nada**. Quem entra numa conversa de três pessoas ouviria três "entrou"
 * em sequência, o que é ruído puro. A entrada semeia a comparação e fica
 * calada — daí em diante, cada mudança é uma pessoa de verdade chegando.
 *
 * Fora da call, silêncio absoluto: quem não está lá não é avisado do que
 * acontece lá.
 */
export function sonsDaMudanca(
  antes: InstanteDaCall, agora: InstanteDaCall,
): TipoDeSom[] {
  // Eu entrei: um som só, o meu. O resto do estado vira a semente.
  if (!antes.euNaCall && agora.euNaCall) return ['entrar']
  // Eu saí: um som só, e a comparação recomeça do zero na próxima entrada.
  if (antes.euNaCall && !agora.euNaCall) return ['sair']
  if (!agora.euNaCall) return []

  const sons: TipoDeSom[] = []

  // Chegou ou saiu gente do MEU canal. Trocar de canal conta como as duas
  // coisas, e é o certo: para quem ficou, a pessoa saiu mesmo.
  if (agora.comigo.some((id) => !antes.comigo.includes(id))) sons.push('entrar')
  if (antes.comigo.some((id) => !agora.comigo.includes(id))) sons.push('sair')

  // Uma tela nova ao alcance — minha ou de outra pessoa.
  const telaNova = agora.compartilhando.some((id) => !antes.compartilhando.includes(id))
    || (agora.euCompartilhando && !antes.euCompartilhando)
  if (telaNova) sons.push('tela')

  // O meu mudo, que é confirmação: o clique precisa de resposta, senão a
  // pessoa fica olhando o botão para saber se pegou.
  if (agora.meuMicrofoneMudo !== antes.meuMicrofoneMudo) {
    sons.push(agora.meuMicrofoneMudo ? 'mudo' : 'desmudo')
  }
  return sons
}

/** Uma nota: frequência, duração, e quando começa depois da anterior. */
interface Nota {
  hz: number
  ms: number
}

/**
 * Os desenhos de cada som.
 *
 * Duas notas subindo para chegar, as mesmas descendo para partir — a direção
 * é o que a pessoa entende sem aprender. O mudo é grave e curto; o desmudo é o
 * mesmo par ao contrário. A tela é um sino de duas notas mais altas, para não
 * ser confundido com gente entrando.
 */
const DESENHOS: Record<TipoDeSom, Nota[]> = {
  entrar: [{ hz: 587, ms: 70 }, { hz: 880, ms: 110 }],
  sair: [{ hz: 880, ms: 70 }, { hz: 587, ms: 110 }],
  mudo: [{ hz: 392, ms: 90 }],
  desmudo: [{ hz: 659, ms: 90 }],
  tela: [{ hz: 784, ms: 60 }, { hz: 1175, ms: 90 }],
}

/** Baixo de propósito: aviso não pode competir com a voz de quem fala. */
const VOLUME = 0.05

export interface DependenciasDeSons {
  /** A preferência de quem usa. Lida a cada som, não guardada. */
  ligado(): boolean
  /** Trocado nos testes. Criado na primeira vez que se toca algo, porque
   *  navegador não deixa criar contexto de áudio sem gesto do usuário. */
  criarContexto?: () => AudioContext
}

export interface Sons {
  tocar(tipo: TipoDeSom): void
}

export function criarSons(dep: DependenciasDeSons): Sons {
  let contexto: AudioContext | null = null

  function pegarContexto(): AudioContext | null {
    if (contexto) return contexto
    try {
      contexto = (dep.criarContexto ?? (() => new AudioContext()))()
      return contexto
    } catch {
      // Navegador sem WebAudio, ou política que impede criar o contexto. Um
      // aviso sonoro ausente não pode derrubar a call.
      return null
    }
  }

  return {
    tocar: (tipo) => {
      if (!dep.ligado()) return
      const ctx = pegarContexto()
      if (!ctx) return
      try {
        let quando = ctx.currentTime
        for (const nota of DESENHOS[tipo]) {
          const osc = ctx.createOscillator()
          const ganho = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = nota.hz
          const fim = quando + nota.ms / 1000
          // Envelope: sem ele, ligar e desligar o oscilador estala.
          ganho.gain.setValueAtTime(0, quando)
          ganho.gain.linearRampToValueAtTime(VOLUME, quando + 0.012)
          ganho.gain.exponentialRampToValueAtTime(0.0001, fim)
          osc.connect(ganho)
          ganho.connect(ctx.destination)
          osc.start(quando)
          osc.stop(fim)
          quando = fim
        }
      } catch (erro) {
        console.warn('não deu para tocar o aviso sonoro', erro)
      }
    },
  }
}

const CHAVE = 'topaz:sons'

/**
 * Ligados por padrão, e desligáveis.
 *
 * App que faz barulho sem interruptor é app que a pessoa silencia no sistema
 * inteiro — e aí perde junto a voz de quem está falando.
 */
export function sonsLigados(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'nao'
  } catch {
    // Armazenamento bloqueado: o padrão vale, e ninguém fica sem som por isso.
    return true
  }
}

export function definirSons(ligados: boolean): void {
  try {
    localStorage.setItem(CHAVE, ligados ? 'sim' : 'nao')
  } catch {
    // Sem armazenamento, a escolha vale só nesta sessão.
  }
}
