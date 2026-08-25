import type { AcoesCall } from './components/call'
import type { TipoConteudo } from '../call/midia'

/**
 * O que cada botão da barra da call faz.
 *
 * Estava dentro do `main.ts` como um objeto de 125 linhas. Aqui fora, os
 * caminhos que mais quebraram no projeto — entrar sem microfone, sair sem
 * deixar som tocando — ganham teste próprio, em vez de só serem exercitados de
 * lado por testes de integração da sala inteira.
 *
 * As dependências são estruturais de propósito: nenhum tipo concreto é
 * importado, então um teste passa objetos simples em vez de montar uma sala.
 */

export interface DependenciasDasAcoes {
  protocolo: {
    entrar(): void
    sair(): void
    estado(): { assistindo: string[]; compartilhando: string[] }
    assistir(peerId: string): void
    pararDeAssistir(peerId: string): void
    definirCompartilhando(sim: boolean): void
  }
  midia: {
    desligarMicrofone(): void
    pararTela(): void
    alternarMicrofone(): void
    compartilharTela(aoParar: () => void): Promise<void>
    definirQualidade(altura: number): void
    definirTipoConteudo(tipo: TipoConteudo): void
  }
  aparelhos: {
    abrir(): Promise<void>
    reler(): Promise<void>
    usarMicrofone(deviceId: string): Promise<void>
    usarSaida(deviceId: string): void
    esquecerFalha(): void
  }
  area: {
    limpar(): void
    alternarSilenciarTodos(): boolean
    ajustar(assistindo: string[], compartilhando: string[]): void
  }
  /** Fecha o contexto de áudio e esquece quem estava falando. */
  pararDeMedirVoz(): void
  sincronizarMidia(): void
  desenhar(): void
}

export function criarAcoesCall(dep: DependenciasDasAcoes): AcoesCall {
  /** Abre o microfone e põe tudo em dia. Usado ao entrar e ao tentar de novo. */
  const abrirEPor = async (): Promise<void> => {
    // Só agora os nomes dos aparelhos existem: a permissão acabou de ser
    // concedida. (Com a permissão negada a lista vem anônima, o que é
    // exatamente o motivo de o seletor não aparecer nesse caso.)
    await dep.aparelhos.reler()
    // E sincroniza de novo depois de capturar: quem anunciou durante a janela
    // de permissão só é alcançado aqui.
    dep.sincronizarMidia()
    dep.desenhar()
  }

  return {
    entrar: () => {
      // O microfone sobe ANTES de anunciar: anunciar primeiro faria os outros
      // esperarem um áudio que ainda não existe.
      //
      // Mas a falha dele NÃO impede a entrada. Antes, `ligarMicrofone()` sem
      // `catch` fazia a permissão negada matar o botão em silêncio — nada
      // acontecia e a pessoa não sabia por quê. Agora ela entra só ouvindo, e
      // a barra diz o motivo.
      void dep.aparelhos.abrir().then(() => {
        dep.protocolo.entrar()
        return abrirEPor()
      })
    },

    tentarMicrofone: () => {
      // A pessoa liberou a permissão no cadeado, ou fechou o programa que
      // segurava o aparelho. Só o microfone sobe — ela já está na call.
      void dep.aparelhos.abrir().then(abrirEPor)
    },

    sair: () => {
      dep.protocolo.sair()
      // O motivo era do estado "entrei sem microfone". Fora da call ele não
      // descreve mais nada, e ficaria pendurado na próxima entrada.
      dep.aparelhos.esquecerFalha()
      dep.midia.desligarMicrofone()
      dep.midia.pararTela()
      // Sair precisa calar tudo de verdade: um `<video>` escondido continua
      // tocando, e era isso que deixava o som da tela saindo depois de sair.
      dep.area.limpar()
      // O contexto de áudio vai junto: mantê-lo aberto fora da call segura a
      // placa de som sem motivo.
      dep.pararDeMedirVoz()
    },

    compartilhar: () => {
      void dep.midia.compartilharTela(() => {
        // Chegou aqui porque a pessoa usou a barra nativa do navegador. Sem
        // isto, a interface continuaria dizendo que ela compartilha.
        dep.protocolo.definirCompartilhando(false)
        dep.midia.pararTela()
      }).then(() => {
        dep.protocolo.definirCompartilhando(true)
        dep.sincronizarMidia()
      })
    },

    pararTela: () => {
      dep.protocolo.definirCompartilhando(false)
      dep.midia.pararTela()
    },

    alternarMeuMicrofone: () => {
      dep.midia.alternarMicrofone()
      dep.desenhar()
    },

    alternarSilenciarTodos: () => {
      dep.area.alternarSilenciarTodos()
      const atual = dep.protocolo.estado()
      // O ajuste é imediato, e não só no próximo tique: meio segundo de som de
      // quem se acabou de silenciar é meio segundo a mais do que ninguém quer.
      dep.area.ajustar(atual.assistindo, atual.compartilhando)
      dep.desenhar()
    },

    trocarMicrofone: (deviceId) => {
      void dep.aparelhos.usarMicrofone(deviceId).then(() => dep.desenhar())
    },

    trocarSaida: (deviceId) => {
      dep.aparelhos.usarSaida(deviceId)
      dep.desenhar()
    },

    assistir: (peerId) => dep.protocolo.assistir(peerId),
    pararDeAssistir: (peerId) => dep.protocolo.pararDeAssistir(peerId),

    definirQualidade: (altura) => {
      dep.midia.definirQualidade(altura)
      dep.desenhar()
    },

    definirTipoConteudo: (tipo) => {
      dep.midia.definirTipoConteudo(tipo)
      dep.desenhar()
    },
  }
}
