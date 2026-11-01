/* Fargekoder med omtrentlig sRGB-farge, til fargeprøven og prøvemaling i AR.
   Fylles fra offentlige fargesider (se kilde per farge). Skjermfarger er
   omtrentlige: endelig valg gjøres alltid med fargevifte eller prøvestrøk. */

export const FARGER = [];

const normKode = (k) => String(k || '').toUpperCase().replace(/^NCS\s*/, '').replace(/\s+/g, ' ').replace(/^S(\d)/, 'S $1').trim();

const indeks = new Map();
function bygg() {
  if (indeks.size === FARGER.length) return;
  indeks.clear();
  for (const f of FARGER) indeks.set(normKode(f.kode), f);
}

/** Finner en farge fra koden, også inni en tekst («1453 Cotton Ball», «NCS S 0502-Y», «ncs s0502-y»). */
export function finnFarge(kode) {
  bygg();
  const t = String(kode || '');
  const hel = indeks.get(normKode(t));
  if (hel) return hel;
  const ncs = t.match(/S\s?\d{4}\s?-\s?[NYRGB](?:\d{2}[YRGB])?/i);
  if (ncs) { const f = indeks.get(normKode(ncs[0].replace(/\s?-\s?/, '-'))); if (f) return f; }
  for (const m of t.matchAll(/\d{3,5}/g)) { const f = indeks.get(m[0]); if (f) return f; }
  return null;
}

/** Søk i navn og kode. */
export function sokFarger(tekst, maks = 40) {
  const t = String(tekst || '').toLowerCase().trim();
  if (!t) return FARGER.slice(0, maks);
  return FARGER.filter((f) => (f.kode + ' ' + (f.navn || '') + ' ' + f.merke).toLowerCase().includes(t)).slice(0, maks);
}

export function fargeNavn(f) {
  return f ? [f.merke === 'NCS' ? 'NCS' : f.merke, f.kode, f.navn].filter(Boolean).join(' ') : '';
}
