/*
 * Malerguiden service worker.
 *
 * Appen skal åpne i en kjeller med svak eller ingen dekning, og samtidig få
 * nye versjoner uten at noe blir hengende. Derfor:
 * - En ny versjon lagres helt eller ikke i det hele tatt. Feiler én fil under
 *   installeringen, beholdes forrige versjon, og det prøves igjen senere.
 * - Siden (index.html): nettet først, men aldri lenger enn 2,5 sekunder.
 * - Resten av appens filer hentes fra lagret kopi av samme versjon, så filer
 *   fra to versjoner aldri blandes. Nye versjoner kommer via installeringen.
 * - Bare vellykkede svar (200, eget opphav) lagres. En feilside fra
 *   GitHub Pages blir aldri lagret som appen.
 *
 * VERSJON oppdateres av tools/versjon.mjs (kjøres før hver publisering).
 */
const VERSJON = 'malerguiden-0ad6f929';
const FILER = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/nav.js',
  './src/dom.js',
  './src/util.js',
  './src/store.js',
  './src/jobs.js',
  './src/egne.js',
  './src/photos.js',
  './src/backup.js',
  './src/calc.js',
  './src/kalkyle.js',
  './src/priser.js',
  './src/ki.js',
  './src/plangjenkjenning.js',
  './src/data/checklists.js',
  './src/data/facts.js',
  './src/data/misc.js',
  './src/data/oppslag.js',
  './src/data/normer.js',
  './src/views/felles.js',
  './src/views/jobber.js',
  './src/views/jobb.js',
  './src/views/regn.js',
  './src/views/oppslag.js',
  './src/views/mitt.js',
  './src/views/pris.js',
  './src/views/hurtigpris.js',
  './src/views/plantegning.js',
];
const VENT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Alle filene forbi HTTP-cachen, så ingen gammel fil blandes inn. Mangler én, feiler
    // installeringen, og forrige versjon fortsetter å virke.
    const svar = await Promise.all(FILER.map(async (url) => {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!godtSvar(res)) throw new Error('Fikk ikke hentet ' + url);
      return [url, res];
    }));
    const cache = await caches.open(VERSJON);
    try {
      for (const [url, res] of svar) await cache.put(url, res);
    } catch (e) {
      await caches.delete(VERSJON); // halvfull kopi skal ikke brukes
      throw e;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Bare egne cacher. Opphavet deles med andre apper (Handleliste, Bitetid).
    for (const navn of await caches.keys()) {
      if (navn.startsWith('malerguiden') && navn !== VERSJON) await caches.delete(navn);
    }
    await self.clients.claim();
  })());
});

function godtSvar(res) { return res && res.ok && res.type === 'basic'; }

async function nettForst(req, nokkel) {
  const cache = await caches.open(VERSJON);
  // Adressen, ikke selve forespørselen: en navigasjon kan ikke kopieres med nye valg.
  const nett = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async (res) => {
    if (godtSvar(res)) await cache.put(nokkel, res.clone());
    return res;
  });
  const tidsfrist = new Promise((resolve) => setTimeout(resolve, VENT_MS, null));
  try {
    const raskest = await Promise.race([nett, tidsfrist]);
    if (raskest && (raskest.ok || !(await cache.match(nokkel)))) return raskest;
  } catch { /* uten nett: bruk kopien */ }
  const lagret = await cache.match(nokkel);
  if (lagret) return lagret;
  return nett; // ingen kopi: vent på nettet likevel
}

/** Appens filer: lagret kopi av denne versjonen. Mangler den, hentes filen fra nettet. */
async function fraKopi(req, nokkel) {
  const cache = await caches.open(VERSJON);
  const lagret = await cache.match(nokkel);
  if (lagret) return lagret;
  const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  if (godtSvar(res)) await cache.put(nokkel, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(nettForst(req, './index.html').catch(() => caches.match('./')));
    return;
  }
  // Egen fil: nøkkel uten søkestreng, så ?v= og lignende ikke gir doble kopier.
  const nokkel = '.' + url.pathname.slice(scope.pathname.length - 1);
  event.respondWith(fraKopi(req, nokkel));
});
