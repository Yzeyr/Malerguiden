/* Biter som brukes på flere skjermer: jobbkort og skjema for ny jobb. */

import { h, ikon, ark, toast } from '../dom.js';
import { datoEtikett, dagerTil, visTidspunkt, iDagIso } from '../util.js';
import { FAG_DEFS, FAG_BY_ID, JOBBTYPER } from '../data/checklists.js';
import { framdrift, nesteSteg, hovedfag, arbeidTekst, STATUS_LABEL, nyJobb, leggTilJobb } from '../jobs.js';
import { gaTil } from '../nav.js';

export const FAGFARGE = { annet: 'plomme', bad: 'petrol', maling: 'terrakotta', sparkling: 'oker', fasade: 'salvie' };

export function topp(overtittel, tittel, ...hoyre) {
  return h('div.topp', h('div', overtittel && h('div.overtittel', overtittel), h('h1', tittel)), ...hoyre);
}

export function palett() {
  return h('div.palett', { 'aria-hidden': 'true' },
    ['terrakotta', 'oker', 'salvie', 'petrol', 'ultramarin', 'plomme'].map((f) => h('i', { style: { background: `var(--${f})` } })));
}

const UKE = 7 * 86400000;

/** Kortet i jobblista: farget stripe med faget, navn, neste steg og framdrift. */
export function jobbkort(job) {
  const fag = hovedfag(job);
  const def = FAG_BY_ID[fag] || FAG_BY_ID.annet;
  const f = framdrift(job);
  const neste = job.status !== 'ferdig' ? nesteSteg(job) : null;
  const ferdig = job.status === 'ferdig';
  const under = [job.rom, job.kunde.adresse].filter(Boolean).join(' · ') || arbeidTekst(job);
  const merker = [];
  if (job.dato && !ferdig) {
    const n = dagerTil(job.dato);
    merker.push(h('span.merke' + (n === 0 ? '.m-idag' : n < 0 ? '.m-forfalt' : ''), datoEtikett(job.dato)));
  }
  if (job.status === 'pauset') merker.push(h('span.merke', 'Pauset'));
  if (ferdig) merker.push(h('span.merke', 'Ferdig ' + visTidspunkt(job.updated)));
  else if (Date.now() - job.updated > UKE) merker.push(h('span.merke', 'Urørt siden ' + visTidspunkt(job.updated)));
  const segmenter = 8;
  const fylt = Math.round(f.andel * segmenter);

  return h('a.jobbkort.f-' + fag, { href: '#jobb-' + job.id, style: ferdig ? { opacity: '.72' } : null },
    h('div.stripe', h('span', def.emoji), h('small', def.kort)),
    h('div.tekst',
      h('div.navn', h('span', job.kunde.navn || 'Uten navn')),
      h('div.under', under),
      neste && h('div.neste', '→ ' + neste.item.label),
      !neste && !ferdig && f.av > 0 && h('div.neste', '✓ Alt er huket av'),
      merker.length && h('div.merker', merker),
      !ferdig && job.status !== 'planlagt' && h('div.strok', { 'aria-label': f.gjort + ' av ' + f.av + ' ferdig' },
        Array.from({ length: segmenter }, (_, i) => h('i' + (i < fylt ? '.på' : '')))),
    ));
}

/** Velger med fargede knapper for fag. */
export function fagVelger(valgt, vedValg) {
  const el = h('div.velger', { role: 'radiogroup', 'aria-label': 'Fag' });
  const tegn = () => {
    el.textContent = '';
    for (const d of FAG_DEFS) {
      el.append(h('button.f-' + d.id, {
        type: 'button', role: 'radio', 'aria-pressed': String(d.id === valgt), 'aria-checked': String(d.id === valgt),
        onclick: () => { valgt = d.id; tegn(); vedValg(d.id); },
      }, d.emoji + ' ' + d.kort));
    }
  };
  tegn();
  return el;
}

export function typeVelger(fag, valgt, vedValg) {
  const typer = JOBBTYPER[fag];
  const el = h('div.velger', { role: 'radiogroup', 'aria-label': 'Jobbtype' });
  if (!typer) { el.hidden = true; return el; }
  const tegn = () => {
    el.textContent = '';
    for (const t of typer) {
      el.append(h('button.f-' + fag, {
        type: 'button', role: 'radio', 'aria-pressed': String(t.id === valgt), 'aria-checked': String(t.id === valgt),
        onclick: () => { valgt = t.id; tegn(); vedValg(t.id); },
      }, t.label + (t.praksis ? ' 🔧' : '')));
    }
  };
  tegn();
  return el;
}

/** Ark for ny jobb. Kunde er det eneste som må fylles ut. */
export function nyJobbArk({ fag: startFag = 'annet', etter } = {}) {
  let fag = startFag;
  let jobbtype = JOBBTYPER[fag]?.[0]?.id || '';
  ark((lukk) => {
    const navn = h('input', { type: 'text', maxlength: 80, autocomplete: 'off', enterkeyhint: 'next', placeholder: 'F.eks. Hansen' });
    const adresse = h('input', { type: 'text', maxlength: 140, autocomplete: 'off', placeholder: 'Valgfritt' });
    const rom = h('input', { type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'F.eks. Bad 2. etg' });
    const dato = h('input', { type: 'date' });
    const feil = h('p.feilmelding', { hidden: true });
    const typeBoks = h('div');
    const tegnType = () => typeBoks.replaceChildren(typeVelger(fag, jobbtype, (t) => { jobbtype = t; }));
    tegnType();

    const lagre = (e) => {
      e.preventDefault();
      if (!navn.value.trim()) { feil.textContent = 'Skriv inn hvem jobben er for.'; feil.hidden = false; navn.focus(); return; }
      const job = nyJobb({ navn: navn.value, fag, jobbtype, adresse: adresse.value, dato: dato.value, rom: rom.value.trim() });
      if (!leggTilJobb(job)) { feil.textContent = 'Fikk ikke lagret jobben.'; feil.hidden = false; return; }
      lukk();
      if (etter) etter(job); else gaTil('jobb-' + job.id);
    };
    setTimeout(() => navn.focus(), 250);
    return h('form', { onsubmit: lagre },
      h('h2', 'Ny jobb'),
      h('label.felt', h('span', 'Kunde'), navn),
      h('div.felt', h('span', 'Fag'), fagVelger(fag, (f) => { fag = f; jobbtype = JOBBTYPER[f]?.[0]?.id || ''; tegnType(); })),
      h('div.felt', typeBoks),
      h('label.felt', h('span', 'Rom', h('small', 'valgfritt')), rom),
      h('label.felt', h('span', 'Adresse', h('small', 'valgfritt')), adresse),
      h('label.felt', h('span', 'Dato', h('small', 'valgfritt')), dato),
      feil,
      h('button.knapp.hel', { type: 'submit' }, ikon('pluss'), 'Opprett jobb'));
  });
}

export function iDag() { return iDagIso(); }
export { STATUS_LABEL, toast };
