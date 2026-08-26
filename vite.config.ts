import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/Topaz/',
  build: {
    rollupOptions: {
      input: {
        // A sonda de presença é uma página à parte, sem link de lugar nenhum.
        // Instrumento de medição, não funcionalidade — e fora do aplicativo de
        // propósito, para que nenhuma medição possa quebrar uma sala de
        // verdade, que foi exatamente o que já aconteceu.
        principal: resolve(__dirname, 'index.html'),
        sonda: resolve(__dirname, 'sonda/index.html'),
      },
    },
  },
})
