/* Oppstart og ruting.

   Adressene (hash) er bakoverkompatible: gamle lenker som #maltall,
   #f-<fakta-id>, #jobb-<id> og #kalkulator virker fortsatt. */

import { h, tom, ikon, toast } from './dom.js';
import { vedLagringsfeil, beOmVarigLagring } from './store.js';
import { lastJobber, lagringSperret, vedEndring } from './jobs.js';
import { lastFavoritter, lastNotater } from './egne.js';
import { lastPriser } from './priser.js';
import { settRuter, noter, gaTil, visBanner, fjernBanner } from './nav.js';
import { visJobber } from './views/jobber.js';
import { visJobb } from './views/jobb.js';
import { visRegn } from './views/regn.js';
import { visOppslag } from './views/oppslag.js';
import { visMitt } from './views/mitt.js';
import { visHurtigpris, innebygd } from './views/hurtigpris.js';

const FANER = [
  { id: 'jobber', navn: 'Jobber', ikon: 'jobber' },
  { id: 'regn', navn: 'Regn', ikon: 'regn' },
  { id: 'oppslag', navn: 'Oppslag', ikon: 'oppslag' },
  { id: 'mitt', navn: 'Mitt', ikon: 'mitt' },
];

const GAMLE_FAGPANEL = ['gulvfall', 'vatrom', 'sparkling', 'maling', 'fasade', 'feil', 'maltall', 'kilder'];

/** Gjør en hash om til { fane, sti: [...] }. */
export function tolkHash(hash) {
  let raa = String(hash || '').replace(/^#/, '');
  try { raa = decodeURIComponent(raa); } catch { /* behold rå */ }
  const [hode, ...rest] = raa.split('/');
  if (!hode || hode === 'jobber') return { fane: 'jobber', sti: [] };
  // Hurtigprisen er en kladd som ser ut som en jobb; lenker til den går hit
  if (hode === 'hurtigpris' || hode === 'jobb-hurtigpris') return { fane: 'regn', hurtigpris: true, sti: rest };
  if (hode.startsWith('jobb-')) return { fane: 'jobber', jobb: hode.slice(5), sti: rest };
  if (hode === 'regn' || hode === 'kalkulator') return { fane: 'regn', sti: rest };
  if (hode === 'oppslag' || hode === 'fagstoff') return { fane: 'oppslag', sti: rest };
  if (hode === 'sok') return { fane: 'oppslag', sti: ['sok'] };
  if (hode.startsWith('f-')) return { fane: 'oppslag', sti: ['maltall'], fakta: hode.slice(2) };
  if (GAMLE_FAGPANEL.includes(hode)) return { fane: 'oppslag', sti: [hode] };
  if (hode === 'mitt' || hode === 'favoritter') return { fane: 'mitt', sti: rest };
  return { fane: 'jobber', sti: [] };
}

const visningEl = document.getElementById('visning');
const menyEl = document.getElementById('meny');
let rydd = null;
let forrige = null;
const rullPos = {};

function byggMeny(aktiv) {
  tom(menyEl, FANER.map((f) => h('a', {
    href: '#' + f.id, 'aria-current': f.id === aktiv ? 'page' : null,
    onclick: (e) => {
      // Trykk på fanen du står i tar deg til toppen, som i iOS-apper.
      if ((location.hash || '#jobber') === '#' + f.id) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); }
    },
  }, h('span.ikon', ikon(f.ikon)), f.navn)));
}

function rute() {
  const hash = location.hash || '#jobber';
  const r = tolkHash(hash);
  noter(hash);
  if (forrige) rullPos[forrige] = scrollY;
  if (rydd) { try { rydd(); } catch (e) { console.error(e); } rydd = null; }
  document.body.className = '';
  tom(visningEl);
  byggMeny(r.fane);
  try {
    if (r.hurtigpris) rydd = visHurtigpris(visningEl, r.sti[0]);
    else if (r.jobb) rydd = visJobb(visningEl, r.jobb, r.sti[0]);
    else if (r.fane === 'jobber') rydd = visJobber(visningEl);
    else if (r.fane === 'regn') rydd = visRegn(visningEl, r.sti[0]);
    else if (r.fane === 'oppslag') rydd = visOppslag(visningEl, r.sti, { fakta: r.fakta });
    else if (r.fane === 'mitt') rydd = visMitt(visningEl, r.sti[0]);
  } catch (e) {
    console.error(e);
    tom(visningEl, h('div.visning', h('div.tom', h('b', 'Noe gikk galt'), 'Gå tilbake og prøv igjen. Dataene dine er ikke rørt.')));
  }
  forrige = hash;
  if (!r.fakta) { const pos = rullPos[hash] || 0; requestAnimationFrame(() => scrollTo(0, pos)); }
}
settRuter(rute);

/* ---------- Lagringsfeil ---------- */
let sistToast = 0;
vedLagringsfeil(({ melding }) => {
  visBanner('lagring', { tittel: 'Ikke lagret', tekst: melding, type: 'fare' });
  if (Date.now() - sistToast > 4000) toast('Ikke lagret!');
  sistToast = Date.now();
});

function sjekkSperre() {
  const s = lagringSperret();
  if (s) visBanner('sperre', { tittel: 'Jobbene kunne ikke leses', tekst: s.melding, type: 'fare', knapp: 'Gjenopprett', vedKnapp: () => gaTil('mitt/kopi'), kanLukkes: false });
  else fjernBanner('sperre');
}
vedEndring(sjekkSperre);

/* ---------- Service worker ---------- */
function registrerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadde = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Første installasjon tar kontroll uten at noe har endret seg for brukeren.
    if (!hadde) return;
    visBanner('ny', { tittel: 'Ny versjon er klar', tekst: 'Trykk Oppdater for å bruke den.', knapp: 'Oppdater', vedKnapp: () => location.reload() });
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => { /* uten offline virker appen likevel med nett */ });
}

/* ---------- Oppstart ---------- */
// Vist inne i Malerkalk: uten menyen nederst
if (innebygd) document.documentElement.classList.add('innebygd');
lastPriser();
lastJobber();
lastNotater();
lastFavoritter();
sjekkSperre();
window.addEventListener('hashchange', rute);
rute();
registrerSW();
beOmVarigLagring();
