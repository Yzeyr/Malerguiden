/* Blokker og rader som brukes flere steder: Pris, Mer, Mål, Mitt og Oppslag.
   En blokk er én del av en side med overskrift øverst og en fargekant til venstre.
   En rad har tekst til venstre, et beløp eller en verdi i fast kolonne, og en pil helt til høyre. */

import { h, ikon } from '../dom.js';

/** En blokk med overskrift. hoyre er en kort tekst til høyre i overskriften (f.eks. en sum). */
export function blokk(tittel, hoyre, ...innhold) {
  return h('section.blokk',
    h('header', h('h3', tittel), hoyre && h('span', hoyre)),
    ...innhold);
}

/** Innhold med vanlig luft rundt (tekstfelt, knapper) inne i en blokk. */
export function blokkInnhold(...innhold) {
  return h('div.blokk-innhold', ...innhold);
}

/** En rad: navn og tekst til venstre, beløp i fast kolonne, pil helt til høyre.
    pil: 'hoyre' åpner et ark, 'ned' legger sammen/åpner, '' ingen. ekstra erstatter beløpet (f.eks. en knapp). */
export function prisRad({ tittel, under = [], belop = '', valg = false, klikk = null, pil = klikk ? 'hoyre' : '', inn = false, sterk = false, ut = false, ekstra = null }) {
  const attrs = klikk ? { role: 'button', tabindex: '0', onclick: klikk, onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); klikk(); } } } : {};
  return h('div.rad.prisrad' + (inn ? '.innrykk' : '') + (sterk ? '.sterk' : ''), attrs,
    h('div.hoved', h('b' + (ut ? '.ut' : ''), tittel), [].concat(under).filter(Boolean).map((t) => h('small', t))),
    ekstra || h('span.belop' + (valg ? '.valg' : ''), belop),
    h('span.pil' + (pil === 'ned' ? '.ned' : ''), pil ? ikon('pil') : ''));
}

// Det som er åpnet, så det forblir åpent når siden tegnes på nytt
const apne = new Set();

/** En rad som åpner og lukker innholdet under seg. Husker om den er åpen. */
export function sammenlegg(nokkel, hode, innhold) {
  const under = h('div.gruppe-linjer', { hidden: !apne.has(nokkel) }, innhold);
  const rad = prisRad({ ...hode, pil: 'ned', klikk: () => {
    if (apne.has(nokkel)) apne.delete(nokkel); else apne.add(nokkel);
    const apen = apne.has(nokkel);
    under.hidden = !apen;
    rad.setAttribute('aria-expanded', String(apen));
  } });
  rad.setAttribute('aria-expanded', String(apne.has(nokkel)));
  return h('div', rad, under);
}
