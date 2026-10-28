/* Bilder i IndexedDB.

   Databasen «malerguiden-bilder» og storen «bilder» er de samme som i den
   gamle appen (nøkkel = bilde-id, verdi = JPEG-blob på maks 1600 px).
   Versjon 2 legger til storen «miniatyrer» med små bilder til galleriet,
   så det ikke lastes 100 fullstore bilder for å vise et rutenett.
   Storen «bilder» røres aldri ved oppgradering.

   Én tilkobling gjenbrukes. Transaksjoner lytter også på abort, ellers
   henger et løfte når lagringen er full (det kommer bare som abort). */

const DB = 'malerguiden-bilder';
const VERSJON = 2;
const BILDER = 'bilder';
const MINI = 'miniatyrer';
export const MAKS_KANT = 1600;
const MINI_KANT = 360;

let dbLofte = null;

function apne() {
  if (dbLofte) return dbLofte;
  dbLofte = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('Bildelagring er ikke tilgjengelig i denne nettleseren.')); return; }
    const req = indexedDB.open(DB, VERSJON);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BILDER)) db.createObjectStore(BILDER);
      if (!db.objectStoreNames.contains(MINI)) db.createObjectStore(MINI);
    };
    req.onsuccess = () => {
      const db = req.result;
      // En nyere versjon et annet sted: slipp taket så den kan oppgradere.
      db.onversionchange = () => { db.close(); dbLofte = null; };
      db.onclose = () => { dbLofte = null; };
      resolve(db);
    };
    req.onerror = () => { dbLofte = null; reject(req.error); };
    req.onblocked = () => { /* en gammel fane holder databasen; open fortsetter når den lukkes */ };
  });
  return dbLofte;
}

function tx(stores, modus, arbeid) {
  return apne().then((db) => new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(stores, modus); }
    catch (e) { dbLofte = null; reject(e); return; }
    let resultat;
    Promise.resolve(arbeid(t, (v) => { resultat = v; })).catch(reject);
    t.oncomplete = () => resolve(resultat);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Lagringen ble avbrutt. Er telefonen full?'));
  }));
}

function get(store, id) {
  return tx([store], 'readonly', (t, sett) => {
    const r = t.objectStore(store).get(id);
    r.onsuccess = () => sett(r.result || null);
  });
}

export function hentBilde(id) { return get(BILDER, id); }

export async function finnesBilde(id) { return !!(await hentBilde(id)); }

/** Lagrer en blob under en id (brukes ved gjenoppretting). */
export function leggInnBilde(id, blob) {
  return tx([BILDER], 'readwrite', (t) => { t.objectStore(BILDER).put(blob, id); });
}

export function slettBilde(id) {
  return tx([BILDER, MINI], 'readwrite', (t) => {
    t.objectStore(BILDER).delete(id);
    t.objectStore(MINI).delete(id);
  });
}

/* ---------- Skalering ---------- */

function lastBilde(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Klarte ikke lese bildet.')); };
    img.src = url;
  });
}

async function skaler(kilde, maks, kvalitet) {
  const img = kilde instanceof Blob ? await lastBilde(kilde) : kilde;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, maks / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', kvalitet));
  c.width = c.height = 0; // frigjør minnet med en gang på iOS
  if (!blob) throw new Error('Klarte ikke lage bildefil.');
  return blob;
}

/** Skalerer ned og lagrer bilde + miniatyr i én transaksjon. Returnerer id. */
export async function lagreNyttBilde(fil, id, { maks = MAKS_KANT } = {}) {
  const img = await lastBilde(fil);
  const stor = await skaler(img, maks, 0.82);
  const mini = await skaler(img, MINI_KANT, 0.75);
  await tx([BILDER, MINI], 'readwrite', (t) => {
    t.objectStore(BILDER).put(stor, id);
    t.objectStore(MINI).put(mini, id);
  });
  return id;
}

/** Miniatyr til galleriet. Lages fra det store bildet første gang (eldre bilder har ingen). */
export async function hentMiniatyr(id) {
  const m = await get(MINI, id);
  if (m) return m;
  const stor = await hentBilde(id);
  if (!stor) return null;
  try {
    const mini = await skaler(stor, MINI_KANT, 0.75);
    tx([MINI], 'readwrite', (t) => { t.objectStore(MINI).put(mini, id); }).catch(() => {});
    return mini;
  } catch { return stor; }
}

/* Objekt-URL-er til <img>, ryddet når de ikke trengs lenger. */
const urler = new Map();
export async function miniatyrUrl(id) {
  if (urler.has(id)) return urler.get(id);
  const b = await hentMiniatyr(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urler.set(id, u);
  return u;
}
export function slippUrler() { for (const u of urler.values()) URL.revokeObjectURL(u); urler.clear(); }
