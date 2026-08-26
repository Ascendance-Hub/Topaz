import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guarda uma contradição que o navegador resolve calado.
 *
 * `grid-row` só vale para quem está no fluxo. Um elemento `position: fixed`
 * ignora a faixa que lhe deram e flutua por cima — e o CSS continua parecendo
 * certo, porque a regra que reserva a faixa está lá, escrita.
 *
 * Foi assim que a barra de controles passou a cobrir os canais e os avatares:
 * a regra dizia "quinta faixa", o navegador entendia "flutue", e ninguém viu
 * até a barra crescer o bastante para alcançar o que estava embaixo.
 */
function regra(css: string, seletor: string): string {
  const i = css.indexOf(seletor)
  if (i === -1) throw new Error(`não achei a regra de ${seletor}`)
  const abre = css.indexOf('{', i)
  return css.slice(abre, css.indexOf('}', abre))
}

describe('a barra de controles ocupa a faixa que o grid reserva', () => {
  const css = readFileSync('src/ui/theme.css', 'utf8')

  it('dentro do grid ela volta ao fluxo', () => {
    const dentro = regra(css, '#app:has(.trilho) .call-controles')

    expect(dentro).toContain('grid-row: 5')
    expect(dentro).toContain('position: static')
  })

  it('fora do grid ela continua flutuando, que é o certo no celular', () => {
    // Lá a página rola, e a barra precisa acompanhar. O conserto vale só onde
    // a tela não rola.
    expect(regra(css, '\n.call-controles')).toContain('position: fixed')
  })
})
