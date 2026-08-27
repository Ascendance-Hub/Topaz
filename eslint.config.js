import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Um conjunto pequeno e escolhido a dedo — nada de estilo, nada de formatação.
 *
 * O objetivo não é encontrar problemas: o código já obedece a quase tudo isto.
 * É impedir que o padrão se perca num momento de pressa, porque hoje ele existe
 * só enquanto alguém lembrar dele.
 *
 * Por isso cada regra abaixo tem um motivo escrito, e por isso o preset
 * `strict-type-checked` ficou de fora: ele acusaria dezenas de pontos hoje
 * legítimos, e cada um viraria um `eslint-disable`. Regra que precisa de
 * supressão em massa não documenta um padrão — inventa um.
 *
 * **ESLint 9 e não 10, de propósito.** A 10 declara
 * `engines: node ^20.19.0 || ^22.13.0 || >=24`, e o CI fixa `22.12.0` (o piso
 * do Vite 8, com comentário próprio em `deploy.yml`). O lint passaria na
 * máquina de quem escreve e quebraria no CI. A 9 declara `>=21.1.0` e passa
 * nos dois. Subir o Node do deploy para caber um linter seria trocar risco
 * real por conveniência.
 *
 * **O que NÃO está aqui, e por quê:**
 *
 * `no-non-null-assertion`. Medido antes de decidir: 155 usos de `!` em `src`,
 * sendo 9 em produção — e todos são o idioma que o `noUncheckedIndexedAccess`
 * do `tsconfig.json` obriga depois de uma guarda
 * (`lideres.length === 1 ? lideres[0]!.peerId`). Aqui o `!` é **consequência
 * de uma configuração mais estrita**, não descuido, e proibi-lo empurraria o
 * código para pior.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      // Fora do `include` do tsconfig.json, e regras com tipo exigem que o
      // arquivo pertença ao projeto.
      'sonda/',
      'vite.config.ts',
      'vitest.config.ts',
      'eslint.config.js',
    ],
  },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Zero ocorrências hoje, em produção e em teste. A regra guarda o que já
      // é verdade em vez de pedir trabalho.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',

      // A regra que mais importa neste projeto. Vários bugs de mídia moraram
      // numa promessa que ninguém escutava: o `InvalidAccessError` do
      // `addTrack` estourava dentro de uma promessa solta, depois de o
      // metadado já ter sido enviado, e nada aparecia no console — o receptor
      // ficava com um metadado órfão na fila FIFO e toda mídia daquela pessoa
      // passava a chegar com o rótulo da anterior. Ver o Capítulo 4 do diário.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // O `noUnusedLocals` do tsc já pega variável local. Isto pega o resto,
      // e o prefixo `_` continua sendo a forma de dizer "existe de propósito".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
