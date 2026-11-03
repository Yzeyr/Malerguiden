/* Handle-fanen på jobben: store knapper for maling, grunning, sparkel og utstyr.
   Maling spør om fargen fra jobben og foreslår utstyr. «Har alt utstyret» hopper over forslagene. */

import { h, tom, ikon, toast, ark, kopierTekst } from '../dom.js';
import { nyId, avkort, flertall } from '../util.js';
import { hentJobb, endreJobb } from '../jobs.js';
import { uiLes, uiSkriv } from '../store.js';
import { finnFarge } from '../data/farger.js';
import { blokk, blokkInnhold } from './blokk.js';
import {
  MALING_STORRELSER, SPARKEL_VALG, UTSTYR_GRUPPER, utstyrForslag, fargeTekst, literTekst,
  handelLinjer, leggTilVarer,
} from '../handel.js';

const NAVN = { maling: 'Maling', grunning: 'Grunning', sparkel: 'Sparkel' };

function legg(jobId, nye) {
  return endreJobb(jobId, (x) => { leggTilVarer(x.handel, nye, { lagId: () => nyId('h-') }); });
}

/** Fanen. fraRommene: åpner utregningen av spann fra rommene. */
export function handelPanel(j, { fraRommene } = {}) {
  const ut = h('div');
  const igjen = j.handel.filter((v) => !v.kjopt).sort((a, b) => (a.created || 0) - (b.created || 0));
  const kjopt = j.handel.filter((v) => v.kjopt).sort((a, b) => (a.created || 0) - (b.created || 0));

  const flis = (hva, emoji, navn, klasse, klikk) => h('button.handleflis.' + klasse, { type: 'button', onclick: klikk },
    h('span.emoji', { 'aria-hidden': 'true' }, emoji), h('b', navn));
  ut.append(h('div.handlefliser',
    flis('maling', '🎨', 'Maling', 'k-terrakotta', () => vareArk(j.id, 'maling')),
    flis('grunning', '🪣', 'Grunning', 'k-salvie', () => vareArk(j.id, 'grunning')),
    flis('sparkel', '🧱', 'Sparkel', 'k-oker', () => vareArk(j.id, 'sparkel')),
    flis('utstyr', '🧰', 'Utstyr', 'k-plomme', () => utstyrArk(j.id))));
  if (fraRommene && j.kalkyle?.rom.length) {
    ut.append(h('button.knapp.sekundar.hel', { type: 'button', style: { marginTop: '10px' }, onclick: fraRommene }, ikon('regn'), 'Regn ut spann fra rommene'));
  }

  // Det som skal kjøpes. Hele raden huker av.
  const ny = h('input', { type: 'text', maxlength: 120, placeholder: 'Annen vare, f.eks. silikon', enterkeyhint: 'done', autocomplete: 'off' });
  const leggTilTekst = (e) => {
    e.preventDefault();
    const tekst = ny.value.trim();
    if (!tekst) return;
    legg(j.id, [{ tekst, hva: 'annet' }]);
    setTimeout(() => document.querySelector('.handel-ny input')?.focus(), 30);
  };
  ut.append(blokk('Å kjøpe', igjen.length ? String(igjen.length) : '',
    h('div.rad-liste',
      igjen.length ? igjen.map((v) => vareRad(j, v)) : h('p.dempet', { style: { margin: '10px 14px' } }, 'Ingenting ennå. Trykk på en knapp over.'),
      h('form.leggtil-rad.handel-ny', { onsubmit: leggTilTekst }, ny, h('button.knapp', { type: 'submit' }, 'Legg til')))));

  if (igjen.length) {
    ut.append(h('div.knapprad', { style: { marginTop: '10px' } },
      h('button.knapp.sekundar', { type: 'button', onclick: async () => toast(await kopierTekst(handelLinjer(j.handel).join('\n')) ? 'Lista er kopiert.' : 'Klarte ikke kopiere.') }, ikon('kopier'), 'Kopier'),
      h('button.knapp', { type: 'button', onclick: async () => {
        toast(await kopierTekst(handelLinjer(j.handel).join('\n')) ? 'Kopiert. Åpne Handleliste og lim inn i feltet øverst.' : 'Klarte ikke kopiere.', { ms: 5000 });
      } }, 'Til Handleliste')));
  }

  if (kjopt.length) {
    ut.append(blokk('Kjøpt', String(kjopt.length),
      h('div.rad-liste', kjopt.map((v) => vareRad(j, v))),
      blokkInnhold(h('button.lenkeknapp', { type: 'button', onclick: () => {
        const kopi = kjopt.map((v) => ({ ...v }));
        endreJobb(j.id, (x) => { x.handel = x.handel.filter((v) => !v.kjopt); });
        toast('Fjernet ' + flertall(kopi.length, 'vare', 'varer'), { angre: () => endreJobb(j.id, (x) => { x.handel.push(...kopi); }) });
      } }, ikon('slett'), 'Fjern det som er kjøpt'))));
  }
  return ut;
}

function vareRad(j, v) {
  const under = [v.farge, v.rom].filter(Boolean).join(' · ');
  const hex = v.farge ? finnFarge(v.farge)?.hex : null;
  return h('div.rad',
    h('button.helrad', {
      type: 'button', role: 'checkbox', 'aria-checked': String(v.kjopt),
      onclick: () => endreJobb(j.id, (x) => { const y = x.handel.find((z) => z.id === v.id); if (y) y.kjopt = !y.kjopt; }),
    },
      h('span.boks' + (v.kjopt ? '.ja' : ''), ikon('hake')),
      h('span.hoved', { style: v.kjopt ? { textDecoration: 'line-through', color: 'var(--blekk2)' } : null },
        h('b', v.tekst + (v.antall > 1 ? ' × ' + v.antall : '')),
        under && h('small', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          hex && h('span.fargeprikk', { style: { background: hex } }), under))),
    h('button.ikonknapp', {
      type: 'button', 'aria-label': 'Fjern ' + v.tekst,
      onclick: () => {
        const kopi = { ...v };
        endreJobb(j.id, (x) => { x.handel = x.handel.filter((z) => z.id !== v.id); });
        toast('Fjernet «' + avkort(v.tekst, 24) + '»', { angre: () => endreJobb(j.id, (x) => { x.handel.push(kopi); }) });
      },
    }, ikon('kryss')));
}

/** Knapper der ett valg er trykket inn. */
function enValg(verdier, start, tekst, vedValg) {
  let valgt = start;
  const el = h('div.velger');
  const knapper = verdier.map((v) => h('button.k-terrakotta', {
    type: 'button', 'aria-pressed': String(v === valgt),
    onclick: () => { valgt = v; knapper.forEach((b, i) => b.setAttribute('aria-pressed', String(verdier[i] === valgt))); vedValg(v); },
  }, tekst(v)));
  el.append(...knapper);
  return el;
}

function teller(start, vedEndring) {
  let n = start;
  const tall = h('b', String(n));
  const sett = (ny) => { n = Math.max(1, Math.min(99, ny)); tall.textContent = String(n); vedEndring(n); };
  return h('div.teller',
    h('button', { type: 'button', 'aria-label': 'Færre', onclick: () => sett(n - 1) }, '−'),
    tall,
    h('button', { type: 'button', 'aria-label': 'Flere', onclick: () => sett(n + 1) }, '+'));
}

/** Utstyrsknapper som kan trykkes av og på. valgt er et Set som endres. */
function utstyrValg(ting, valgt) {
  return h('div.velger', ting.map((t) => {
    const b = h('button.k-plomme', { type: 'button', 'aria-pressed': String(valgt.has(t)), onclick: () => {
      if (valgt.has(t)) valgt.delete(t); else valgt.add(t);
      b.setAttribute('aria-pressed', String(valgt.has(t)));
      vedEndring?.();
    } }, t);
    return b;
  }));
}
let vedEndring = null;

/** Maling, grunning eller sparkel: størrelse, antall, farge fra jobben og utstyr. */
export function vareArk(jobId, hva) {
  const j = hentJobb(jobId);
  if (!j) return;
  const sist = uiLes('handel-' + hva, '');
  let storrelse = hva === 'sparkel'
    ? (SPARKEL_VALG.includes(sist) ? sist : SPARKEL_VALG[0])
    : (MALING_STORRELSER.includes(Number(sist)) ? Number(sist) : 10);
  let antall = 1;
  const farger = hva === 'sparkel' ? [] : j.farger.slice().sort((a, b) => (a.rom || '').localeCompare(b.rom || '', 'nb'));
  // Én farge på jobben: den er valgt fra start. Grunning er som regel uten farge.
  let fargeId = hva === 'maling' && farger.length === 1 ? farger[0].id : null;
  const forslag = utstyrForslag(hva, j.handel);
  const valgt = new Set(forslag);

  ark((lukk) => {
    const annen = h('input', { type: 'text', maxlength: 80, placeholder: 'Annen farge, f.eks. 1453 Egghvit', autocomplete: 'off' });
    const fargeKnapper = [];
    const markerFarge = () => fargeKnapper.forEach(({ el, id }) => el.setAttribute('aria-pressed', String(id === fargeId && !annen.value.trim())));
    annen.addEventListener('input', markerFarge);
    const fargeValg = (id, tittel, under, hex) => {
      const el = h('button', { type: 'button', onclick: () => { fargeId = id; annen.value = ''; markerFarge(); } },
        hex ? h('span.fargeprove-liten', { style: { background: hex } }) : h('span.fargeprove-liten.tom'),
        h('span', tittel, under && h('small', under)));
      fargeKnapper.push({ el, id });
      return el;
    };

    const leggTil = (medUtstyr) => {
      const f = farger.find((x) => x.id === fargeId);
      const egen = annen.value.trim();
      const tekst = hva === 'sparkel' ? storrelse : NAVN[hva] + ' ' + literTekst(storrelse);
      const nye = [{ tekst, antall, hva, farge: egen || fargeTekst(f), rom: egen ? '' : (f?.rom || '') }];
      if (medUtstyr) for (const t of forslag) if (valgt.has(t)) nye.push({ tekst: t, hva: 'utstyr' });
      uiSkriv('handel-' + hva, String(storrelse));
      if (legg(jobId, nye)) toast(nye.length > 1 ? 'Lagt til ' + tekst + ' og ' + flertall(nye.length - 1, 'ting', 'ting') + ' utstyr.' : 'Lagt til ' + tekst + '.');
      lukk();
    };
    const leggKnapp = h('button.knapp', { type: 'button', onclick: () => leggTil(true) });
    const oppdaterKnapp = () => {
      const n = forslag.filter((t) => valgt.has(t)).length;
      leggKnapp.textContent = n ? 'Legg til med ' + flertall(n, 'ting', 'ting') : 'Legg til';
    };
    vedEndring = oppdaterKnapp;
    oppdaterKnapp();

    return h('div',
      h('h2', NAVN[hva]),
      h('div.felt', h('span', hva === 'sparkel' ? 'Hva slags' : 'Spann'),
        hva === 'sparkel'
          ? enValg(SPARKEL_VALG, storrelse, (v) => v, (v) => { storrelse = v; })
          : enValg(MALING_STORRELSER, storrelse, literTekst, (v) => { storrelse = v; })),
      h('div.felt', h('span', 'Antall'), teller(antall, (n) => { antall = n; })),
      hva !== 'sparkel' && h('div.felt', h('span', 'Farge'),
        h('div.valgliste.fargevalg',
          farger.map((f) => fargeValg(f.id, [f.produkt, f.kode].filter(Boolean).join(' ') || 'Uten navn', [f.rom, f.glans && 'glans ' + f.glans].filter(Boolean).join(' · '), finnFarge(f.kode)?.hex)),
          fargeValg(null, hva === 'grunning' ? 'Uten farge' : 'Velg i butikken', farger.length ? '' : 'Ingen farger er lagt inn på jobben ennå')),
        annen),
      forslag.length > 0 && h('div.felt', h('span', 'Utstyr som ofte trengs'),
        h('p.dempet.liten', { style: { margin: '0 2px 8px' } }, 'Trykk bort det du har.'),
        utstyrValg(forslag, valgt)),
      h('div.knapprad',
        forslag.length > 0 && h('button.knapp.sekundar', { type: 'button', onclick: () => leggTil(false) }, 'Har alt utstyret'),
        leggKnapp),
      void queueMicrotask(markerFarge));
  }, { vedLukk: () => { vedEndring = null; } });
}

/** Utstyr: alt i grupper, trykk på det som trengs. */
export function utstyrArk(jobId) {
  const j = hentJobb(jobId);
  if (!j) return;
  const valgt = new Set();
  ark((lukk) => {
    const knapp = h('button.knapp.hel', { type: 'button', onclick: () => {
      if (!valgt.size) { lukk(); return; }
      if (legg(jobId, [...valgt].map((t) => ({ tekst: t, hva: 'utstyr' })))) toast('Lagt til ' + flertall(valgt.size, 'ting', 'ting') + '.');
      lukk();
    } });
    const oppdater = () => { knapp.textContent = valgt.size ? 'Legg til ' + flertall(valgt.size, 'ting', 'ting') : 'Lukk'; };
    vedEndring = oppdater;
    oppdater();
    const paLista = new Set(j.handel.filter((v) => !v.kjopt).map((v) => v.tekst.toLowerCase()));
    return h('div',
      h('h2', 'Utstyr'),
      UTSTYR_GRUPPER.map((g) => h('div.felt', h('span', g.navn), utstyrValg(g.ting.filter((t) => !paLista.has(t.toLowerCase())), valgt))),
      knapp);
  }, { vedLukk: () => { vedEndring = null; } });
}

