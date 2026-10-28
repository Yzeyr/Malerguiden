/* Sikkerhetskopi til fil, og gjenoppretting.

   Filformatet er det samme som før ({ malerguiden: 1, laget, jobber,
   notater, favoritter, kalkulator, bilder }), så gamle kopier kan leses.

   Forskjeller fra den gamle appen:
   - Fila bygges først. Delingen starter med et eget trykk etterpå, fordi
     iPhone bare tillater deling rett etter et trykk. Feiler delingen,
     lastes fila ned i stedet, og feilen vises.
   - Fila settes sammen av biter (ett bilde om gangen), ikke én stor
     tekststreng, så minnet tåler mange bilder.
   - Gjenopprettingen teller det som faktisk ble lagt inn. */

import { NOKLER, les, skriv } from './store.js';
import { iDagIso } from './util.js';
import { alleJobber, importerJobber, lagringSperret, opphevSperre, lastJobber } from './jobs.js';
import { alleNotater, alleFavoritter, importerNotater, leggTilFavoritter } from './egne.js';
import { hentBilde, finnesBilde, leggInnBilde } from './photos.js';

function blobTilDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function kalkulatorVerdier() {
  const ut = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NOKLER.calcPrefiks)) ut[k] = localStorage.getItem(k);
    }
  } catch { /* blokkert lagring: tom */ }
  return ut;
}

/**
 * Bygger kopien som en File. framdrift(n, av) kalles per bilde.
 * Returnerer { fil, navn, antallBilder, manglerBilder, medBilder }.
 */
export async function byggKopi({ medBilder = true, framdrift = () => {} } = {}) {
  const jobber = alleJobber();
  const hode = {
    malerguiden: 1,
    laget: new Date().toISOString(),
    jobber,
    notater: alleNotater(),
    favoritter: alleFavoritter(),
    kalkulator: kalkulatorVerdier(),
  };
  // JSON uten den avsluttende } — bildene legges til som egne biter.
  const start = JSON.stringify(hode);
  const deler = [start.slice(0, -1) + ',"bilder":{'];
  let antall = 0, mangler = 0;
  if (medBilder) {
    const ider = [...new Set(jobber.flatMap((j) => j.bilder.map((b) => b.id)))];
    for (let i = 0; i < ider.length; i++) {
      framdrift(i + 1, ider.length);
      try {
        const blob = await hentBilde(ider[i]);
        if (!blob) { mangler++; continue; }
        const url = await blobTilDataUrl(blob);
        deler.push((antall ? ',' : '') + JSON.stringify(ider[i]) + ':' + JSON.stringify(url));
        antall++;
      } catch { mangler++; }
    }
  }
  deler.push('}}');
  const navn = 'malerguiden-' + iDagIso() + '.json';
  const fil = new File(deler, navn, { type: 'application/json' });
  return { fil, navn, antallBilder: antall, manglerBilder: mangler, medBilder };
}

export function markerKopiTatt(medBilder) {
  skriv(NOKLER.sistKopi, String(Date.now()));
  if (medBilder) skriv(NOKLER.sistKopiBilder, String(Date.now()));
}

export function dagerSidenKopi() {
  const sist = Number(les(NOKLER.sistKopi));
  return sist ? Math.floor((Date.now() - sist) / 86400000) : null;
}

/** Kan denne nettleseren dele en fil (iPhone: til Filer, AirDrop, e-post)? */
export function kanDele(fil) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [fil] })); } catch { return false; }
}

/** Last ned fila med en vanlig lenke. */
export function lastNed(fil) {
  const url = URL.createObjectURL(fil);
  const a = document.createElement('a');
  a.href = url;
  a.download = fil.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Deler fila. MÅ kalles direkte fra et trykk.
 * Returnerer 'delt' | 'avbrutt' | 'lastet-ned' (delingen feilet, fila ble lastet ned i stedet).
 */
export async function delKopi(fil) {
  if (!kanDele(fil)) { lastNed(fil); return 'lastet-ned'; }
  try {
    await navigator.share({ files: [fil], title: fil.name });
    return 'delt';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'avbrutt';
    lastNed(fil);
    return 'lastet-ned';
  }
}

/* ---------- Gjenoppretting ---------- */

export function lesFil(fil) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Klarte ikke lese filen.'));
    r.readAsText(fil);
  });
}

/**
 * Legger innholdet fra en kopi til det som finnes. Overskriver aldri jobber
 * eller notater. Returnerer { ok, melding }.
 */
export async function gjenopprett(tekst) {
  let data;
  try { data = JSON.parse(tekst); }
  catch { return { ok: false, melding: 'Klarte ikke lese innholdet. Er hele kopien med?' }; }
  if (Array.isArray(data)) data = { notater: data }; // eldste format: bare notater
  if (!data || typeof data !== 'object' || !('jobber' in data || 'notater' in data || 'malerguiden' in data)) {
    return { ok: false, melding: 'Dette ser ikke ut som en sikkerhetskopi fra Malerguiden.' };
  }

  // Kunne ikke de lagrede jobbene leses, er kopien nettopp løsningen.
  // Den ødelagte teksten er alt tatt vare på under en egen nøkkel.
  // Ble den ikke tatt vare på (full lagring), skal vi heller ikke skrive over den.
  const sperre = lagringSperret();
  if (sperre && sperre.kopi && Array.isArray(data.jobber) && data.jobber.length) opphevSperre();

  const deler = [];
  const feil = [];

  const n = importerNotater(data.notater);
  if (n < 0) feil.push('notatene');
  else if (n) deler.push(n + (n === 1 ? ' notat' : ' notater'));

  const j = importerJobber(data.jobber);
  if (!j.ok) feil.push('jobbene');
  else if (j.lagtTil) deler.push(j.lagtTil + (j.lagtTil === 1 ? ' jobb' : ' jobber'));

  if (Array.isArray(data.favoritter)) {
    const f = leggTilFavoritter(data.favoritter);
    if (f < 0) feil.push('favorittene');
    else if (f) deler.push(f + (f === 1 ? ' favoritt' : ' favoritter'));
  }

  // Kalkulatortall: bare de som ikke finnes fra før (kopien skal ikke overskrive).
  if (data.kalkulator && typeof data.kalkulator === 'object') {
    for (const [k, v] of Object.entries(data.kalkulator)) {
      if (k.startsWith(NOKLER.calcPrefiks) && les(k) == null) skriv(k, String(v));
    }
  }

  let bilder = 0, bildeFeil = 0;
  if (data.bilder && typeof data.bilder === 'object') {
    for (const [id, url] of Object.entries(data.bilder)) {
      try {
        if (await finnesBilde(id)) continue;
        const blob = await (await fetch(url)).blob();
        await leggInnBilde(id, blob);
        bilder++;
      } catch { bildeFeil++; }
    }
  }
  if (bilder) deler.push(bilder + (bilder === 1 ? ' bilde' : ' bilder'));
  if (bildeFeil) feil.push(bildeFeil + (bildeFeil === 1 ? ' bilde' : ' bilder'));

  lastJobber();
  let melding = deler.length ? 'La inn ' + deler.join(', ') + '.' : 'Ingenting nytt. Alt fantes allerede.';
  if (feil.length) melding += ' Klarte ikke legge inn ' + feil.join(', ') + '.';
  return { ok: !feil.length, melding };
}
