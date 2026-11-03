/* Handlelista på jobben: det som skal kjøpes, med forslag til utstyr.

   Hver vare: { id, tekst, antall, hva, farge, rom, kjopt, created }.
   hva sier hva slags vare det er, så forslagene til utstyr passer. */

import { norm } from './util.js';

export const HVA = ['maling', 'grunning', 'sparkel', 'utstyr', 'annet'];

/** Spannstørrelser i butikken. Jotun selger 0,68 / 2,7 / 9 L, flere andre 3 og 10 L. */
export const MALING_STORRELSER = [10, 9, 3, 2.7, 0.68];

export const SPARKEL_VALG = ['Ferdigsparkel 10 L', 'Ferdigsparkel 3 L', 'Lettsparkel 10 L', 'Hurtigsparkel 12,5 kg'];

/** Utstyr som hører til hver vare. Det første er det som oftest mangler. */
export const UTSTYR = {
  maling: ['Malerrull', 'Rulleskaft', 'Malerbrett', 'Pensel', 'Malertape', 'Dekkpapir', 'Dekkplast'],
  sparkel: ['Bredsparkel', 'Sparkelspade', 'Sparkelbrett', 'Slipepapir', 'Slipekloss', 'Papirremse til skjøter', 'Støvmaske'],
};
UTSTYR.grunning = UTSTYR.maling;

/** Alt utstyret, gruppert, til «Utstyr»-knappen. */
export const UTSTYR_GRUPPER = [
  { navn: 'Maling', ting: ['Malerrull', 'Rulleskaft', 'Malerbrett', 'Pensel', 'Skråpensel', 'Liten rull til lister'] },
  { navn: 'Sparkling', ting: ['Bredsparkel', 'Sparkelspade', 'Sparkelbrett', 'Slipepapir', 'Slipekloss', 'Papirremse til skjøter'] },
  { navn: 'Dekking og rydding', ting: ['Malertape', 'Dekkpapir', 'Dekkplast', 'Støvmaske', 'Søppelsekker'] },
];

const lik = (a, b) => norm(a) === norm(b);

/**
 * Forslag til utstyr for en vare. Det som allerede står på lista, eller er kjøpt
 * til denne jobben før, foreslås ikke: da har man det.
 */
export function utstyrForslag(hva, handel = []) {
  return (UTSTYR[hva] || []).filter((t) => !handel.some((v) => lik(v.tekst, t)));
}

/** Navnet på en farge fra jobben: produkt, kode og glans. */
export function fargeTekst(f) {
  if (!f) return '';
  return [f.produkt, f.kode, f.glans && 'glans ' + f.glans].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
}

/** Hvordan en størrelse skrives: 2,7 L. */
export const literTekst = (l) => String(l).replace('.', ',') + ' L';

/** Varen som én linje: «Maling 10 L × 2 – Lady 1453 Egghvit glans 5». */
export function vareTekst(v) {
  return v.tekst + (v.antall > 1 ? ' × ' + v.antall : '') + (v.farge ? ' – ' + v.farge : '');
}

/**
 * Linjene som limes inn i Handleliste-appen. Handleliste kutter navnet ved komma og
 * parentes, så de tas bort, ellers forsvinner fargen.
 */
export function handelLinjer(handel = []) {
  return handel.filter((v) => !v.kjopt)
    .sort((a, b) => (a.created || 0) - (b.created || 0))
    .map((v) => vareTekst(v).replace(/[(),]/g, (t) => (t === ',' ? ' ' : '')).replace(/\s+/g, ' ').trim());
}

/**
 * Legger varer til lista. Står samme vare (og farge) der allerede og ikke er kjøpt,
 * økes antallet i stedet for å få to rader. Endrer lista og returnerer den.
 */
export function leggTilVarer(handel, nye, { lagId, naa = Date.now() }) {
  let i = 0;
  for (const n of nye) {
    const tekst = String(n.tekst || '').trim();
    if (!tekst) continue;
    const farge = String(n.farge || '').trim();
    const antall = Math.max(1, Math.min(99, Math.round(Number(n.antall) || 1)));
    const finnes = handel.find((v) => !v.kjopt && lik(v.tekst, tekst) && lik(v.farge || '', farge));
    if (finnes) { finnes.antall = Math.min(99, finnes.antall + antall); continue; }
    handel.push({
      id: lagId(), tekst, antall, hva: HVA.includes(n.hva) ? n.hva : 'annet',
      farge, rom: String(n.rom || '').trim(), kjopt: false, created: naa + i++,
    });
  }
  return handel;
}

/** Gjør lagrede varer om til garantert form. */
export function rensHandel(liste) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((v) => v && typeof v === 'object' && v.id && typeof v.tekst === 'string' && v.tekst.trim())
    .map((v) => ({
      id: String(v.id),
      tekst: v.tekst.trim().slice(0, 120),
      antall: Math.max(1, Math.min(99, Math.round(Number(v.antall) || 1))),
      hva: HVA.includes(v.hva) ? v.hva : 'annet',
      farge: String(v.farge || '').slice(0, 120),
      rom: String(v.rom || '').slice(0, 60),
      kjopt: !!v.kjopt,
      created: Number(v.created) || 0,
    }));
}

/**
 * Spannene fra utregningen av rommene som varer på lista:
 * «Veggmaling 9 L» × 2 osv. Det i parentes i navnet tas bort.
 */
export function varerFraUtregning(liste = []) {
  const ut = [];
  for (const m of liste) {
    if (!m.forslag || !(m.trenger > 0)) continue;
    const navn = m.navn.replace(/\s*\(.*\)\s*$/, '');
    const hva = /sparkel|ardex/i.test(m.navn) ? 'sparkel' : /grunning/i.test(m.navn) ? 'grunning' : 'maling';
    for (const x of m.forslag.kombinasjon) {
      ut.push({ tekst: navn + ' ' + String(x.storrelse).replace('.', ',') + ' ' + m.enhet, antall: x.antall, hva });
    }
  }
  return ut;
}
