/* Navigasjon og bannere, delt av alle skjermene. */

import { h, ikon } from './dom.js';

let ruter = () => {};
export function settRuter(fn) { ruter = fn; }

/** Går til en adresse. erstatt: uten nytt steg i historikken. */
export function gaTil(hash, { erstatt = false } = {}) {
  const ny = '#' + String(hash).replace(/^#/, '');
  if (erstatt) { history.replaceState(history.state, '', ny); ruter(); return; }
  if (location.hash === ny) { ruter(); return; }
  location.hash = ny;
}

/* Hvor vi har vært i denne økta, så «tilbake» vet om det finnes et steg
   bakover i appen, eller om jobben ble åpnet rett fra en lenke. */
const spor = [];
export function noter(hash) {
  if (spor.length > 1 && spor[spor.length - 2] === hash) spor.pop();
  else if (spor[spor.length - 1] !== hash) spor.push(hash);
}

/** Tilbake hvis vi kom fra appen selv, ellers til en fast adresse. */
export function tilbake(reserve) {
  if (spor.length > 1) history.back();
  else { spor.length = 0; gaTil(reserve, { erstatt: true }); }
}

/* ---------- Bannere ---------- */
const bannere = new Map();
const rot = () => document.getElementById('bannere');

export function visBanner(id, { tittel, tekst, type = '', knapp, vedKnapp, kanLukkes = true }) {
  const el = h('div.banner' + (type ? '.' + type : ''), { role: type === 'fare' ? 'alert' : 'status' },
    ikon(type === 'fare' ? 'advarsel' : 'skjold'),
    h('div.tekst', tittel && h('b', tittel), tekst),
    knapp && h('button', { type: 'button', onclick: vedKnapp }, knapp),
    kanLukkes && h('button', { type: 'button', 'aria-label': 'Lukk', onclick: () => fjernBanner(id) }, '✕'));
  bannere.get(id)?.remove();
  bannere.set(id, el);
  rot()?.append(el);
}
export function fjernBanner(id) { bannere.get(id)?.remove(); bannere.delete(id); }
