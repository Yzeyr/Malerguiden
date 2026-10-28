/* Hurtigpris: rom, plantegning, skanning og pris uten å lage en jobb først.
   Når prisen ser riktig ut, kopieres alt over til en ny eller eksisterende jobb.
   Siden kan også vises inne i Forbrukskalkulator-appen (samme nettsted, samme data). */

import { h, tom, ikon, toast, ark, velg, bekreft } from '../dom.js';
import { flertall } from '../util.js';
import { hentJobb, alleJobber, vedEndring, KLADD_ID, kladdTilJobb, tomKladd, jobbNavn } from '../jobs.js';
import { slettBilde, slippUrler } from '../photos.js';
import { gaTil, tilbake } from '../nav.js';
import { romPanel, prisPanel } from './pris.js';
import { beregn } from '../kalkyle.js';
import { egnePriser } from '../priser.js';
import { fmt } from '../util.js';

const FANER = [{ id: 'maal', navn: 'Rom' }, { id: 'pris', navn: 'Pris' }];
/** Vist inne i en annen app (iframe): uten meny nederst, og jobben åpnes i hele vinduet. */
export const innebygd = (() => { try { return window.self !== window.top; } catch { return true; } })();

export function visHurtigpris(rot, fane = 'maal') {
  if (!FANER.some((f) => f.id === fane)) fane = 'maal';
  document.body.classList.add('farget-topp', 'f-maling');
  const side = h('div.visning.uten-topp.f-maling');
  const hodeEl = h('div');
  const fanerEl = h('div.faner', { role: 'tablist' });
  const panel = h('div', { role: 'tabpanel' });
  side.append(hodeEl, fanerEl, panel);
  rot.append(side);
  const kladd = () => hentJobb(KLADD_ID);

  const tegnHode = () => {
    const k = kladd();
    const antall = k.kalkyle?.rom.length || 0;
    const sum = antall ? beregn(k.kalkyle, egnePriser()).sum : null;
    tom(hodeEl, h('div.hode',
      h('div.rad',
        innebygd ? h('span') : h('button.tilbake', { type: 'button', onclick: () => tilbake('regn') }, ikon('tilbake'), 'Regn'),
        antall > 0 && h('button.statusknapp', { type: 'button', onclick: tom_ }, 'Tøm')),
      h('h1', 'Hurtigpris'),
      h('div.under', antall ? flertall(antall, 'rom', 'rom') + ' · ' + fmt(sum.eksMva, 0) + ' kr eks. mva · ' + fmt(sum.timer, 1) + ' t' : 'Rask pris uten å lage en jobb. Legg inn rommene, så kommer prisen.'),
      h('div.handlinger', { style: { gridTemplateColumns: '1fr' } },
        h('button', { type: 'button', 'aria-disabled': antall ? null : 'true', onclick: kopier }, ikon('kopier'), 'Kopier til jobb'))));
  };
  const tegnFaner = () => tom(fanerEl, FANER.map((x) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(x.id === fane),
    onclick: () => { if (x.id !== fane) gaTil('hurtigpris/' + x.id, { erstatt: true }); },
  }, x.navn)));
  const tegnPanel = () => {
    tom(panel);
    if (fane === 'pris') panel.append(prisPanel(kladd()));
    else panel.append(romPanel(kladd()));
  };
  const tegnAlt = () => {
    tegnHode(); tegnFaner();
    const aktiv = document.activeElement;
    const skriver = aktiv && panel.contains(aktiv) && aktiv.matches('input:not([type=checkbox]):not([type=file]), textarea, select');
    if (!skriver) {
      const y = scrollY;
      panel.style.minHeight = panel.offsetHeight + 'px';
      tegnPanel();
      panel.style.minHeight = '';
      scrollTo(0, y);
    }
  };

  async function kopier() {
    const k = kladd();
    if (!k.kalkyle?.rom.length) { toast('Legg inn minst ett rom først.'); return; }
    const aktive = alleJobber().filter((j) => j.status !== 'ferdig').sort((a, b) => b.updated - a.updated).slice(0, 12);
    const valg = await velg({ tittel: 'Kopier til jobb', valg: [
      { verdi: 'ny', tekst: 'Ny jobb', under: 'Lag en jobb med disse rommene og prisvalgene' },
      ...aktive.map((j) => ({ verdi: j.id, tekst: jobbNavn(j), under: j.kalkyle?.rom.length ? 'Rommene legges til de ' + j.kalkyle.rom.length + ' som er der' : 'Ingen rom ennå' })),
    ] });
    if (!valg) return;
    let navn = '';
    if (valg === 'ny') { navn = await sporNavn(); if (navn == null) return; }
    const id = kladdTilJobb(valg === 'ny' ? null : valg, navn);
    if (!id) { toast('Klarte ikke kopiere.'); return; }
    if (await bekreft({ tittel: 'Kopiert til jobben', tekst: 'Vil du tømme hurtigprisen? Rommene ligger nå i jobben.', ja: 'Tøm', nei: 'Behold' })) tomOgSlett();
    if (innebygd) {
      // Inne i Forbrukskalkulator: åpne jobben i Malerguiden i hele vinduet
      window.top.location.href = new URL('./#jobb-' + id + '/pris', location.href).href;
    } else gaTil('jobb-' + id + '/pris');
  }

  function tomOgSlett() {
    const brukt = new Set(alleJobber().flatMap((j) => j.bilder.map((b) => b.id)));
    for (const b of tomKladd()) if (!brukt.has(b.id)) slettBilde(b.id).catch(() => {});
  }
  async function tom_() {
    if (!await bekreft({ tittel: 'Tømme hurtigprisen?', tekst: 'Rommene, tegningene og prisvalgene her fjernes. Jobber du har kopiert til, beholder sine.', ja: 'Tøm', fare: true })) return;
    tomOgSlett();
    toast('Hurtigprisen er tømt.');
  }

  tegnAlt();
  const av = vedEndring((endret) => { if (endret === KLADD_ID || endret == null) tegnAlt(); });
  return () => { av(); slippUrler(); };
}

function sporNavn() {
  return new Promise((resolve) => {
    let svar = null;
    ark((lukk) => {
      const inn = h('input', { type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'F.eks. Hansen – stue og gang' });
      setTimeout(() => inn.focus(), 250);
      return h('form', { onsubmit: (e) => { e.preventDefault(); svar = inn.value.trim() || 'Ny jobb'; lukk(); } },
        h('h2', 'Navn på jobben'), h('label.felt', h('span', 'Kunde eller jobb'), inn),
        h('div.knapprad', h('button.knapp.sekundar', { type: 'button', onclick: () => lukk() }, 'Avbryt'), h('button.knapp', { type: 'submit' }, 'Lag jobben')));
    }, { vedLukk: () => resolve(svar) });
  });
}
