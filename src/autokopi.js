/* Automatisk sikkerhetskopi i iPhone-appen.

   Én gang om dagen, når appen åpnes, lages en full kopi (med bilder) og
   sendes til appen i biter. Appen legger den i mappen du har valgt under
   Mitt (f.eks. iCloud Drive), og beholder de sju nyeste. Uten valgt mappe
   havner den i appens egen mappe i Filer, som slettes sammen med appen. */

import { iApp, appInfo, kall } from './native.js';
import { les, skriv } from './store.js';
import { byggKopi, markerKopiTatt } from './backup.js';
import { alleJobber } from './jobs.js';
import { iDagIso } from './util.js';

const SIST = 'malerguiden:autokopi-sist';
// Biter på 3 MB: delelig på 3, så hver bit blir hel base64 for seg
const BIT = 3 * 1024 * 1024;

/** Kan appen ta automatisk kopi? (Eldre app-versjoner kan ikke.) */
export async function kanAutokopi() {
  return iApp && !!(await appInfo())?.autokopi;
}

/** Siste automatiske kopi: { dato, mappe, mb, utenforAppen } eller null. */
export function sisteAutokopi() {
  try { const d = JSON.parse(les(SIST) || 'null'); return d && d.dato ? d : null; } catch { return null; }
}

function tilBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

let pagar = null;
/** Tar kopien hvis den ikke er tatt i dag (tving: uansett). Svarer med resultatet, eller null. */
export function taAutokopi({ tving = false } = {}) {
  if (!pagar) pagar = kjor(tving).finally(() => { pagar = null; });
  return pagar;
}

async function kjor(tving) {
  if (!(await kanAutokopi())) return null;
  const idag = iDagIso();
  if (!tving && sisteAutokopi()?.dato === idag) return null;
  if (!alleJobber().length) return null;
  const kopi = await byggKopi({ medBilder: true });
  const navn = 'Malerguiden-kopi-' + idag + '.json';
  const av = Math.max(1, Math.ceil(kopi.fil.size / BIT));
  let svar = null;
  for (let i = 0; i < av; i++) {
    const data = await tilBase64(kopi.fil.slice(i * BIT, (i + 1) * BIT));
    svar = await kall('autoKopi', { del: i, av, data, navn });
  }
  const resultat = { dato: idag, mappe: svar?.mappe || '', mb: Math.round(kopi.fil.size / 104857.6) / 10, utenforAppen: !!svar?.utenforAppen };
  skriv(SIST, JSON.stringify(resultat));
  // Bare en kopi utenfor appen teller som sikkerhetskopi (den overlever at appen slettes)
  if (resultat.utenforAppen) markerKopiTatt(kopi.medBilder);
  return resultat;
}

/** Starter den daglige kopien: litt etter oppstart, og når appen kommer fram igjen. */
export function startAutokopi() {
  if (!iApp) return;
  const prov = () => taAutokopi().catch(() => { /* prøves igjen neste gang appen åpnes */ });
  setTimeout(prov, 8000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(prov, 3000); });
}
