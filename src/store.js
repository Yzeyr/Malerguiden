/* Lagring i localStorage, med feil som vises i stedet for å forsvinne.

   Den gamle appen svelget skrivefeil: var lagringen full eller blokkert,
   så det ut som endringen tok, men den var borte neste gang. Her går all
   skriving gjennom skriv(), som melder fra til lytterne (UI viser et banner).

   Opphavet yzeyr.github.io deles med Handleliste og Bitetid. Derfor:
   aldri localStorage.clear(), og bare nøkler med prefikset «malerguiden». */

export const NOKLER = {
  jobber: 'malerguiden:jobber',
  notater: 'malerguiden:notater',
  favoritter: 'malerguiden-favoritter', // bindestrek, slik den gamle appen lagret den
  sistKopi: 'malerguiden:sist-sikkerhetskopi',
  sistKopiBilder: 'malerguiden:sist-sikkerhetskopi-bilder',
  calcPrefiks: 'malerguiden:calc:',
  ui: 'malerguiden:ui:',
  hurtigpris: 'malerguiden:hurtigpris', // kladden for en rask pris uten jobb
};

const feilLyttere = new Set();
/** fn({ nokkel, feil, melding }) kalles hver gang en skriving feiler. */
export function vedLagringsfeil(fn) { feilLyttere.add(fn); return () => feilLyttere.delete(fn); }

function meld(nokkel, feil, melding) {
  for (const fn of feilLyttere) { try { fn({ nokkel, feil, melding }); } catch { /* lytterfeil skal ikke stoppe lagring */ } }
}

export function erFull(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

/** Rå lesing. null hvis nøkkelen mangler eller lagringen er blokkert. */
export function les(nokkel) {
  try { return localStorage.getItem(nokkel); } catch { return null; }
}

/** Skriver en streng. Returnerer true/false, og melder fra ved feil. */
export function skriv(nokkel, verdi) {
  try { localStorage.setItem(nokkel, verdi); return true; }
  catch (e) {
    meld(nokkel, e, erFull(e)
      ? 'Lagringen på telefonen er full. Det siste du gjorde er ikke lagret. Ta en sikkerhetskopi og slett gamle bilder.'
      : 'Klarte ikke lagre. Er privat nettlesing slått på?');
    return false;
  }
}

export function fjern(nokkel) { try { localStorage.removeItem(nokkel); } catch { /* ingenting å gjøre */ } }

/**
 * Leser JSON. Skiller mellom «finnes ikke» og «finnes, men er ødelagt»:
 * { status: 'tom' | 'ok' | 'odelagt', verdi, raa }
 */
export function lesJson(nokkel) {
  const raa = les(nokkel);
  if (raa == null || raa === '') return { status: 'tom', verdi: null, raa };
  try { return { status: 'ok', verdi: JSON.parse(raa), raa }; }
  catch { return { status: 'odelagt', verdi: null, raa }; }
}

export function skrivJson(nokkel, verdi) { return skriv(nokkel, JSON.stringify(verdi)); }

/** Tar vare på data som ikke kunne leses, så de aldri blir skrevet over. */
export function reddOdelagt(nokkel, raa) {
  const kopi = nokkel + ':odelagt-' + Date.now();
  try { localStorage.setItem(kopi, raa); return kopi; } catch { return null; }
}

/* ---------- Utsatt lagring ----------
   Tekstfelt lagres litt etter siste tastetrykk. Går appen i bakgrunnen før
   det, tvinges lagringen gjennom med en gang (iOS kan drepe appen der). */
const ventende = new Map(); // nøkkel → { timer, fn }

export function senere(nokkel, fn, ms = 300) {
  const gammel = ventende.get(nokkel);
  if (gammel) clearTimeout(gammel.timer);
  const timer = setTimeout(() => { ventende.delete(nokkel); fn(); }, ms);
  ventende.set(nokkel, { timer, fn });
}

export function lagreVentende() {
  for (const [nokkel, { timer, fn }] of ventende) {
    clearTimeout(timer);
    ventende.delete(nokkel);
    try { fn(); } catch { /* feilen er alt meldt av skriv() */ }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', lagreVentende);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') lagreVentende(); });
}

/* ---------- Varig lagring ----------
   Uten dette kan iOS rydde bort data når telefonen får lite plass. */
export async function beOmVarigLagring() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function plassBrukt() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { brukt: usage || 0, kvote: quota || 0 };
  } catch { return null; }
}

/* Små UI-valg (åpen/lukket, sist valgte fane). Feil her er uviktige. */
export function uiLes(navn, standard = null) { const v = les(NOKLER.ui + navn); return v == null ? standard : v; }
export function uiSkriv(navn, verdi) { try { localStorage.setItem(NOKLER.ui + navn, String(verdi)); } catch { /* uviktig */ } }
