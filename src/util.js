/* Små hjelpere som brukes overalt: id-er, datoer, tekst. Ingen DOM. */

/** Samme id-form som den gamle appen: prefiks + tid i base36 + fem tilfeldige tegn. */
export function nyId(prefiks) {
  return prefiks + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/* En jobbdato er en dagsdato, ikke et klokkeslett. Alt regnes i hele døgn
   fra midnatt lokal tid, ellers ville «i dag» byttet betydning klokka 12. */
export function isoDag(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function iDagIso(naa = new Date()) { return isoDag(naa); }
export function tilDato(iso) {
  const b = String(iso).split('-');
  return new Date(Number(b[0]), Number(b[1]) - 1, Number(b[2]));
}
export function erIsoDag(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

/** Antall døgn fra i dag til datoen. Negativt betyr forfalt. */
export function dagerTil(iso, naa = new Date()) {
  return Math.round((tilDato(iso) - new Date(naa.getFullYear(), naa.getMonth(), naa.getDate())) / 86400000);
}

export const UKEDAG = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const UKEDAG_LANG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
export const MND_LANG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** «I dag», «I morgen», «I går», ellers «tir 4. nov» (+ « — forfalt»). Som i den gamle appen. */
export function datoEtikett(iso, naa = new Date()) {
  if (!iso) return '';
  const n = dagerTil(iso, naa);
  if (n === 0) return 'I dag';
  if (n === 1) return 'I morgen';
  if (n === -1) return 'I går';
  const d = tilDato(iso);
  const tekst = UKEDAG[d.getDay()] + ' ' + d.getDate() + '. ' + MND[d.getMonth()];
  return n < 0 ? tekst + ' — forfalt' : tekst;
}

/** «28. okt. 2026» — samme som den gamle appens formatNoteDate. */
export function visTidspunkt(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}
export function visDato(iso) { return erIsoDag(iso) ? visTidspunkt(tilDato(iso).getTime()) : ''; }

/** «Tirsdag 28. oktober» til toppen av jobblista. */
export function langDato(naa = new Date()) {
  const d = UKEDAG_LANG[naa.getDay()];
  return d[0].toUpperCase() + d.slice(1) + ' ' + naa.getDate() + '. ' + MND_LANG[naa.getMonth()];
}

/* Søk: små bokstaver og æøå → ao a, ett tegn for ett så markering stemmer. */
const CHARMAP = { å: 'a', ä: 'a', æ: 'a', ø: 'o', ö: 'o', é: 'e', è: 'e', ü: 'u', ç: 'c' };
export function norm(s) {
  return String(s || '').toLowerCase().replace(/[åäæøöéèüç]/g, (c) => CHARMAP[c]);
}

/** Tall med norsk komma. Tomt/ugyldig → '—'. */
export function fmt(v, dec = 0) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('nb-NO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function flertall(n, en, flere) { return n + ' ' + (n === 1 ? en : flere); }

/** Fjerner HTML-tegn fra brukertekst som skal inn i en HTML-streng. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function avkort(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
