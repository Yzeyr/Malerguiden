/* Måling på plantegning.

   1. Bilde av tegningen (lagres på jobben som et bilde i kategorien «Tegning»).
   2. Målestokk: trykk på to punkter og skriv inn avstanden mellom dem.
   3. Rom: trykk på hjørnene. Gulv, omkrets og veggareal vises underveis.

   Én finger flytter, to fingre zoomer, et kort trykk setter et punkt.
   Koordinatene lagres i bildets egne punkter, så de stemmer neste gang. */

import { h, tom, ikon, toast, ark, bekreft, velg } from '../dom.js';
import { nyId, fmt, flertall } from '../util.js';
import { hentJobb, endreJobb, vedEndring } from '../jobs.js';
import { lagreNyttBilde, hentBilde, slettBilde } from '../photos.js';
import { polygonMal, STANDARD_HOYDE, tall } from '../kalkyle.js';
import { endreKalkyle, romArk } from './pris.js';
import { finnRom, graatoner, arealPx } from '../plangjenkjenning.js';

const TEGNING_MAKS = 2600; // høyere enn vanlige bilder, så små mål på tegningen kan leses

const planer = (jobId) => hentJobb(jobId)?.kalkyle?.planer || [];
const romPa = (jobId, bilde) => (hentJobb(jobId)?.kalkyle?.rom || []).filter((r) => r.tegning === bilde).length;
/** Setter målestokken på én av tegningene. */
const settSkala = (k, bilde, skala) => { const p = (k.planer || []).find((x) => x.bilde === bilde); if (p) p.skala = skala; };

/** Plantegning-knappen: ingen tegning ennå → velg en. Ellers en liste: åpne, gi nytt navn, fjern eller legg til. */
export function apnePlantegning(jobId) {
  if (!planer(jobId).length) { velgTegning(jobId); return; }
  tegningsListe(jobId);
}

function tegningsListe(jobId) {
  ark((lukk) => {
    const liste = h('div.valgliste');
    const tegnListe = () => tom(liste, planer(jobId).map((p) => {
      const n = romPa(jobId, p.bilde);
      return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'stretch' } },
        h('button', { type: 'button', style: { flex: '1' }, onclick: () => { lukk(); verktoy(jobId, p.bilde); } },
          ikon('kart'), h('span', p.navn, h('small', (n ? n + ' rom' : 'Ingen rom ennå') + (p.skala ? '' : ' · målestokk mangler')))),
        h('button', { type: 'button', 'aria-label': 'Valg for ' + p.navn, style: { width: '56px', justifyContent: 'center' }, onclick: () => tegningValg(jobId, p, tegnListe) }, '⋯'));
    }));
    tegnListe();
    return h('div',
      h('h2', 'Plantegninger'),
      liste,
      h('button.knapp.hel', { type: 'button', style: { marginTop: '12px' }, onclick: () => { lukk(); velgTegning(jobId); } },
        ikon('pluss'), 'Ny tegning, f.eks. ' + (planer(jobId).length + 1) + '. etasje'));
  });
}

async function tegningValg(jobId, p, oppdater) {
  const valg = await velg({ tittel: p.navn, valg: [
    { verdi: 'navn', tekst: 'Endre navn', under: 'F.eks. 1. etasje, kjeller, loft' },
    { verdi: 'fjern', tekst: 'Fjern tegningen', under: 'Rommene beholdes med målene' },
  ] });
  if (valg === 'navn') {
    const navn = await spørNavn('Navn på tegningen', p.navn);
    if (navn) { endreKalkyle(jobId, (k) => { const x = k.planer.find((y) => y.bilde === p.bilde); if (x) x.navn = navn; }); oppdater(); }
  } else if (valg === 'fjern') {
    const n = romPa(jobId, p.bilde);
    if (!await bekreft({ tittel: 'Fjerne «' + p.navn + '»?', tekst: n ? flertall(n, 'rom', 'rom') + ' fra tegningen blir liggende under Mål, med målene.' : 'Tegningen fjernes fra jobben.', ja: 'Fjern', fare: true })) return;
    endreKalkyle(jobId, (k) => {
      k.planer = k.planer.filter((x) => x.bilde !== p.bilde);
      for (const r of k.rom) if (r.tegning === p.bilde) { r.tegning = null; r.polygon = null; }
    });
    endreJobb(jobId, (j) => { j.bilder = j.bilder.filter((b) => b.id !== p.bilde); });
    slettBilde(p.bilde).catch(() => {});
    toast('Tegningen er fjernet.');
    oppdater();
  }
}

function spørNavn(tittel, verdi) {
  return new Promise((resolve) => {
    let svar = null;
    ark((lukk) => {
      const inn = h('input', { type: 'text', value: verdi || '', maxlength: 40, autocomplete: 'off' });
      setTimeout(() => { inn.focus(); inn.select(); }, 250);
      return h('form', { onsubmit: (e) => { e.preventDefault(); svar = inn.value.trim() || null; lukk(); } },
        h('h2', tittel), h('label.felt', h('span', 'Navn'), inn),
        h('div.knapprad', h('button.knapp.sekundar', { type: 'button', onclick: () => lukk() }, 'Avbryt'), h('button.knapp', { type: 'submit' }, 'Lagre')));
    }, { vedLukk: () => resolve(svar) });
  });
}

/** Lar brukeren velge et bilde av tegningen og lagrer det på jobben som en ny tegning. Løses med bilde-id eller null. */
export function velgTegningFil(jobId) {
  return new Promise((resolve) => {
    let svar = null;
    ark((lukk) => {
      const fil = (attrs) => h('input', {
        type: 'file', accept: 'image/*', hidden: true, ...attrs,
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          toast('Klargjør tegningen …', { ms: 30000 });
          const id = nyId('img-');
          try {
            await lagreNyttBilde(f, id, { maks: TEGNING_MAKS });
            endreJobb(jobId, (j) => { j.bilder.push({ id, kategori: 'tegning', tatt: Date.now() }); });
            endreKalkyle(jobId, (k) => { k.planer = [...(k.planer || []), { bilde: id, navn: ((k.planer || []).length + 1) + '. etasje', skala: null }]; });
            toast('Tegningen er klar.');
            svar = id;
          } catch (err) { toast('Klarte ikke lese bildet: ' + (err?.message || '')); }
          lukk();
        },
      });
      return h('div',
        h('h2', 'Plantegning'),
        h('p.dempet', { style: { marginTop: '-6px' } }, 'Ta bilde av tegningen rett ovenfra, eller velg en skjermdump. Fra en LiDAR-skanneapp som Polycam eller 3D Scanner App: eksporter plantegningen som bilde og velg den her.'),
        h('div.bildeknapper',
          h('label.knapp', ikon('kamera'), 'Ta bilde', fil({ capture: 'environment' })),
          h('label.knapp.sekundar', ikon('galleri'), 'Velg bilde', fil({}))));
    }, { vedLukk: () => resolve(svar) });
  });
}

async function velgTegning(jobId) {
  const id = await velgTegningFil(jobId);
  if (id) verktoy(jobId, id);
}

async function verktoy(jobId, bildeId) {
  const blob = await hentBilde(bildeId).catch(() => null);
  if (!blob) { toast('Fant ikke tegningen. Velg den på nytt.'); endreKalkyle(jobId, (k) => { k.planer = (k.planer || []).filter((p) => p.bilde !== bildeId); }); velgTegning(jobId); return; }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((r, f) => { img.onload = r; img.onerror = f; img.src = url; }).catch(() => {});
  const W = img.naturalWidth, H = img.naturalHeight;

  const job = () => hentJobb(jobId);
  const denne = () => job().kalkyle?.planer?.find((p) => p.bilde === bildeId);
  let skala = denne()?.skala; // meter per bildepunkt
  let modus = Number.isFinite(skala) && skala > 0 ? 'rom' : 'skala';
  let punkter = [];

  /* ---------- Oppsett ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible' });
  const flate = h('div', { style: { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', transformOrigin: '0 0', touchAction: 'none' } },
    h('img', { src: url, alt: 'Plantegning', draggable: 'false', style: { width: W + 'px', height: H + 'px', display: 'block', userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'none', background: '#fff' } }), svg);
  const vindu = h('div', { style: { position: 'relative', flex: '1', overflow: 'hidden', background: '#0d0b09', touchAction: 'none' } }, flate);
  // Panelet kan rulles om det blir høyere enn plassen, så knappene alltid kan nås
  const panel = h('div', { style: { background: 'var(--lerret)', color: 'var(--blekk)', borderRadius: '22px 22px 0 0', padding: '14px 16px calc(14px + var(--bunn))', maxHeight: '55%', overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', flexShrink: '0' } });
  const el = h('div.planverktoy', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Måling på plantegning' },
    h('div.plinje',
      h('button', { type: 'button', onclick: () => lukk() }, 'Lukk'),
      h('span', { style: { flex: '1', color: '#fff', fontWeight: '650', fontSize: '15px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, denne()?.navn || ''),
      h('button', { type: 'button', 'aria-label': 'Zoom ut', onclick: () => zoomRundt(1 / 1.5) }, '−'),
      h('button', { type: 'button', 'aria-label': 'Zoom inn', onclick: () => zoomRundt(1.5) }, '+'),
      h('button', { type: 'button', 'aria-label': 'Angre siste hjørne', onclick: () => { if (lukket) lukket = false; else punkter.pop(); tegn(); } }, ikon('angre'))),
    vindu, panel);
  document.body.append(el);

  // iPhone: to fingre på tegningen skal zoome tegningen, ikke hele siden. Zoomes siden,
  // havner knappene utenfor skjermen, og verktøyet ligger fast så det ikke kan rulles tilbake.
  const stopp = (e) => e.preventDefault();
  el.addEventListener('gesturestart', stopp);
  el.addEventListener('gesturechange', stopp);
  vindu.addEventListener('touchmove', stopp, { passive: false });
  el.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // Er siden zoomet fra før (eller tastaturet er oppe), legges verktøyet over det som faktisk vises.
  const vv = window.visualViewport;
  let forrige = '';
  const passInn = () => {
    if (!vv) return;
    const zoomet = vv.scale > 1.01 || vv.height < innerHeight - 1;
    Object.assign(el.style, zoomet
      ? { inset: 'auto', left: vv.offsetLeft + 'px', top: vv.offsetTop + 'px', width: vv.width + 'px', height: vv.height + 'px' }
      : { inset: '0', left: '', top: '', width: '', height: '' });
    const str = Math.round(vv.width) + 'x' + Math.round(vv.height);
    if (str !== forrige) { forrige = str; if (s !== 1 || tx || ty) tilpass(); }
  };
  vv?.addEventListener('resize', passInn);
  vv?.addEventListener('scroll', passInn);

  // Rom som lagres fra arket, tegnes inn med en gang.
  const av = vedEndring((id) => { if (id === jobId) tegn(); });
  let stoppObs = () => {};
  const lukk = () => {
    av(); stoppObs(); window.removeEventListener('resize', tilpass);
    vv?.removeEventListener('resize', passInn); vv?.removeEventListener('scroll', passInn);
    URL.revokeObjectURL(url); el.remove();
  };

  /* ---------- Zoom og flytting ---------- */
  let s = 1, tx = 0, ty = 0;
  const bruk = () => { flate.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; tegn(); };
  const tilpass = () => {
    const r = vindu.getBoundingClientRect();
    s = Math.min(r.width / W, r.height / H) * 0.96;
    tx = (r.width - W * s) / 2; ty = (r.height - H * s) / 2;
    bruk();
  };
  const zoomRundt = (f, cx, cy) => {
    const r = vindu.getBoundingClientRect();
    cx ??= r.width / 2; cy ??= r.height / 2;
    const ny = Math.max(0.05, Math.min(12, s * f));
    tx = cx - (cx - tx) * (ny / s); ty = cy - (cy - ty) * (ny / s); s = ny;
    bruk();
  };
  const tilBilde = (cx, cy) => [(cx - tx) / s, (cy - ty) / s];

  /* ---------- Tilstand for rommet som tegnes eller justeres ---------- */
  let lukket = false;     // mangekanten er lukket: trykk legger ikke til flere hjørner
  let redigerer = null;   // id på et lagret rom som endres
  let fraForslag = null;  // forslaget som justeres (legges tilbake ved Avbryt)
  let apnRom = null;      // { dorer, vinduer } funnet for rommet som justeres
  let forslag = [];       // rom funnet automatisk: { polygon, dorer, vinduer }
  let dra = null;         // indeks til hjørnet som dras

  const pekere = new Map();
  let start = null; // { tx, ty, s, avstand, midt, flyttet }
  const nesteHjorne = (cx, cy) => {
    let best = -1, min = 26;
    punkter.forEach(([x, y], i) => { const d = Math.hypot(x * s + tx - cx, y * s + ty - cy); if (d < min) { min = d; best = i; } });
    return best;
  };
  vindu.addEventListener('pointerdown', (e) => {
    try { vindu.setPointerCapture(e.pointerId); } catch { /* ikke alle pekere kan fanges */ }
    const r = vindu.getBoundingClientRect();
    const p = [e.clientX - r.left, e.clientY - r.top];
    pekere.set(e.pointerId, p);
    // Én finger på et hjørne: dra hjørnet i stedet for å flytte tegningen
    dra = pekere.size === 1 && modus === 'rom' ? nesteHjorne(p[0], p[1]) : -1;
    if (dra < 0) dra = null;
    start = { tx, ty, s, flyttet: pekere.size > 1 || dra != null, ...maal() };
  });
  vindu.addEventListener('pointermove', (e) => {
    if (!pekere.has(e.pointerId) || !start) return;
    const r = vindu.getBoundingClientRect();
    pekere.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    const m = maal();
    if (dra != null && pekere.size === 1) {
      flyttHjorne(dra, ...tilBilde(m.midt[0], m.midt[1]));
      return;
    }
    if (pekere.size === 1) {
      const dx = m.midt[0] - start.midt[0], dy = m.midt[1] - start.midt[1];
      if (Math.hypot(dx, dy) > 12) start.flyttet = true;
      if (start.flyttet) { tx = start.tx + dx; ty = start.ty + dy; bruk(); }
    } else if (pekere.size === 2 && start.avstand) {
      dra = null;
      start.flyttet = true;
      const ny = Math.max(0.05, Math.min(12, start.s * (m.avstand / start.avstand)));
      // Punktet under fingrene skal bli liggende under fingrene.
      const [bx, by] = [(start.midt[0] - start.tx) / start.s, (start.midt[1] - start.ty) / start.s];
      s = ny; tx = m.midt[0] - bx * s; ty = m.midt[1] - by * s;
      bruk();
    }
  });
  const slipp = (e) => {
    if (!pekere.has(e.pointerId)) return;
    const [x, y] = pekere.get(e.pointerId);
    pekere.delete(e.pointerId);
    if (start && !start.flyttet && pekere.size === 0) trykk(...tilBilde(x, y));
    if (pekere.size === 0) dra = null;
    start = pekere.size ? { tx, ty, s, flyttet: true, ...maal() } : null;
  };
  vindu.addEventListener('pointerup', slipp);
  vindu.addEventListener('pointercancel', (e) => { pekere.delete(e.pointerId); start = null; dra = null; });
  vindu.addEventListener('wheel', (e) => { e.preventDefault(); const r = vindu.getBoundingClientRect(); zoomRundt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  function maal() {
    const p = [...pekere.values()];
    if (!p.length) return { midt: [0, 0], avstand: 0 };
    if (p.length === 1) return { midt: p[0], avstand: 0 };
    return { midt: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], avstand: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) };
  }

  /** Flytter et hjørne. Står det nesten på linje med naboen, rettes det inn (rette vinkler). */
  function flyttHjorne(i, x, y) {
    const n = punkter.length;
    const naboer = n >= 2 ? [punkter[(i + n - 1) % n], punkter[(i + 1) % n]] : [];
    const grense = 10 / s;
    for (const [nx, ny] of naboer) {
      if (Math.abs(x - nx) < grense) x = nx;
      if (Math.abs(y - ny) < grense) y = ny;
    }
    punkter[i] = [x, y];
    tegn();
  }

  function inni([x, y], poly) {
    let inne = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inne = !inne;
    }
    return inne;
  }

  /* ---------- Trykk ---------- */
  function trykk(x, y) {
    if (x < -W * 0.05 || y < -H * 0.05 || x > W * 1.05 || y > H * 1.05) return;
    if (modus === 'skala') {
      // Trykk på et funnet rom: målestokken kan settes fra arealet
      const f = !punkter.length && forslag.find((r) => inni([x, y], r.polygon));
      if (f) { spørAreal([f]); return; }
      punkter.push([x, y]);
      if (punkter.length === 2) { spørAvstand(); return; }
      tegn();
      return;
    }
    if (!punkter.length) {
      // Trykk på et forslag: juster det. Trykk på et lagret rom: endre eller slett det.
      const f = forslag.find((r) => inni([x, y], r.polygon));
      if (f) {
        forslag = forslag.filter((r) => r !== f);
        fraForslag = f; apnRom = { dorer: f.dorer.length, vinduer: f.vinduer.length, trapp: !!f.trapp };
        punkter = f.polygon.map((p) => p.slice()); lukket = true;
        tegn();
        return;
      }
      const lagret = (job().kalkyle?.rom || []).find((r) => r.tegning === bildeId && r.polygon && inni([x, y], r.polygon));
      if (lagret) {
        redigerer = lagret.id;
        punkter = lagret.polygon.map((p) => p.slice()); lukket = true;
        tegn();
        return;
      }
    }
    if (lukket) return;
    // Trykk på første hjørne lukker rommet
    if (punkter.length >= 3) {
      const [fx, fy] = punkter[0];
      if (Math.hypot(fx - x, fy - y) * s < 22) { lukket = true; tegn(); return; }
    }
    punkter.push([x, y]);
    tegn();
  }

  function nullstill({ leggTilbake = false } = {}) {
    if (leggTilbake && fraForslag) forslag.push(fraForslag);
    punkter = []; lukket = false; redigerer = null; fraForslag = null; apnRom = null;
    tegn();
  }

  function spørAvstand() {
    tegn();
    const px = Math.hypot(punkter[1][0] - punkter[0][0], punkter[1][1] - punkter[0][1]);
    ark((lukkArk) => {
      const inn = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'F.eks. 4,2', autocomplete: 'off' });
      setTimeout(() => inn.focus(), 250);
      return h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          let m = tall(inn.value);
          if (!(m > 0)) return;
          if (m > 100) m = m / 1000; // skrevet i millimeter, slik tegninger ofte gjør
          skala = m / px;
          endreKalkyle(jobId, (k) => settSkala(k, bildeId, skala));
          lukkArk();
          skalaSatt('Målestokken er satt.');
        },
      },
        h('h2', 'Hvor langt er det?'),
        h('p.dempet', { style: { marginTop: '-6px' } }, 'Avstanden mellom de to punktene i virkeligheten. Mål fra tegningen i millimeter går også, f.eks. 4200.'),
        h('label.felt', h('span', 'Meter'), inn),
        h('div.knapprad',
          h('button.knapp.sekundar', { type: 'button', onclick: () => { punkter = []; lukkArk(); tegn(); } }, 'Prøv igjen'),
          h('button.knapp', { type: 'submit' }, 'Bruk')));
    });
  }

  /** Målestokken er satt: lagre rommene hvis brukeren trykket «Lagre rommene». */
  let lagreEtterSkala = false;
  function skalaSatt(melding) {
    modus = 'rom'; punkter = [];
    forslag = forslag.filter((r) => malFor(r.polygon).gulv >= 1);
    if (lagreEtterSkala && forslag.length) { lagreEtterSkala = false; leggTilAlle(); return; }
    lagreEtterSkala = false;
    toast(melding, { ms: 4000 });
    tegn();
  }

  /** Målestokk fra arealet til ett eller flere rom som er funnet automatisk. */
  function spørAreal(liste) {
    const px = liste.reduce((s, f) => s + arealPx(f.polygon), 0);
    const ett = liste.length === 1;
    ark((lukkArk) => {
      const inn = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'F.eks. 12,5', autocomplete: 'off' });
      setTimeout(() => inn.focus(), 250);
      return h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const m2 = tall(inn.value);
          if (!(m2 > 0) || !(px > 0)) return;
          skala = Math.sqrt(m2 / px);
          endreKalkyle(jobId, (k) => settSkala(k, bildeId, skala));
          lukkArk();
          skalaSatt('Målestokken er satt. Sjekk et rom mot tegningen.');
        },
      },
        h('h2', ett ? 'Hvor stort er rommet?' : 'Hvor store er rommene til sammen?'),
        h('p.dempet', { style: { marginTop: '-6px' } }, ett
          ? 'Gulvarealet til det blå rommet, slik det står på tegningen. Målene regnes ut fra det.'
          : 'Gulvarealet til alle de blå rommene til sammen. Målene regnes ut fra det.'),
        h('label.felt', h('span', 'Kvadratmeter'), inn),
        h('div.knapprad',
          h('button.knapp.sekundar', { type: 'button', onclick: () => { lagreEtterSkala = false; lukkArk(); } }, 'Avbryt'),
          h('button.knapp', { type: 'submit' }, lagreEtterSkala ? 'Lagre' : 'Bruk')));
    });
  }

  /** «Lagre rommene» før målestokken er satt: spør hvordan den skal settes, og lagre etterpå. */
  function lagreUtenSkala() {
    lagreEtterSkala = true;
    ark((lukkArk) => h('div',
      h('h2', 'Først trengs målestokken'),
      h('p.dempet', { style: { marginTop: '-6px' } }, 'Så vet appen hvor store rommene er. Velg det du kan lese på tegningen.'),
      h('div.valgliste',
        h('button', { type: 'button', onclick: () => { lukkArk(); spørAreal(forslag); } },
          h('span', 'Jeg vet arealet', h('small', forslag.length === 1 ? 'Gulvarealet til det blå rommet' : 'Gulvarealet til de blå rommene til sammen'))),
        h('button', { type: 'button', onclick: () => { lukkArk(); toast('Trykk på to punkter med kjent avstand, f.eks. endene av et mål.', { ms: 4000 }); tegn(); } },
          h('span', 'Jeg vet en lengde', h('small', 'Trykk på to punkter, f.eks. endene av et mål på tegningen')))),
      h('button.lenkeknapp', { type: 'button', style: { marginTop: '10px' }, onclick: () => { lagreEtterSkala = false; lukkArk(); } }, 'Avbryt')));
  }

  function malFor(poly) {
    const { areal, omkrets } = polygonMal(poly.map(([x, y]) => [x * skala, y * skala]));
    return { gulv: Math.round(areal * 100) / 100, omkrets: Math.round(omkrets * 100) / 100 };
  }

  function ferdigRom() {
    if (punkter.length < 3) return;
    const polygon = punkter.map(([x, y]) => [Math.round(x), Math.round(y)]);
    const mal = malFor(polygon);
    if (redigerer) {
      const id = redigerer;
      endreKalkyle(jobId, (k) => { const r = k.rom.find((x) => x.id === id); if (r) Object.assign(r, mal, { polygon }); });
      toast('Rommet er oppdatert.');
      nullstill();
      return;
    }
    const tellere = apnRom ? { vinduer: String(apnRom.vinduer), dorer: String(apnRom.dorer), trapp: !!apnRom.trapp } : {};
    nullstill();
    romArk(jobId, null, { navn: tellere.trapp ? 'Trappehull' : 'Rom ' + ((job().kalkyle?.rom.length || 0) + 1), ...mal, ...tellere, kilde: 'plan', polygon, tegning: bildeId });
  }

  async function slettRommet() {
    const id = redigerer;
    const r = job().kalkyle?.rom.find((x) => x.id === id);
    if (!r || !await bekreft({ tittel: 'Slette rommet?', tekst: r.navn || 'Rom', ja: 'Slett', fare: true })) return;
    endreKalkyle(jobId, (k) => { k.rom = k.rom.filter((x) => x.id !== id); });
    nullstill();
    toast('Rommet er slettet.');
  }

  /* ---------- Finn rom automatisk ---------- */
  async function finnAutomatisk() {
    toast('Leter etter rom …', { ms: 20000 });
    await new Promise((r) => setTimeout(r, 40)); // la meldingen vises før arbeidet starter
    // Regn på en mindre kopi av tegningen; ca. 1400 px holder og går raskt.
    const f = Math.min(1, 1400 / Math.max(W, H));
    const cw = Math.round(W * f), chh = Math.round(H * f);
    const lerret = document.createElement('canvas');
    lerret.width = cw; lerret.height = chh;
    const cx = lerret.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, chh);
    cx.drawImage(img, 0, 0, cw, chh);
    const data = cx.getImageData(0, 0, cw, chh).data;
    lerret.width = lerret.height = 0;
    let resultat;
    try { resultat = finnRom(graatoner(data, cw, chh), cw, chh); }
    catch (e) { toast('Klarte ikke lese tegningen.'); console.error(e); return; }
    const tilbake = (p) => [p[0] / f, p[1] / f];
    const lagrede = (job().kalkyle?.rom || []).filter((r) => r.tegning === bildeId && r.polygon);
    forslag = resultat.rom
      .map((r) => ({
        polygon: r.polygon.map(tilbake),
        dorer: r.dorer.map((l) => ({ a: tilbake(l.a), b: tilbake(l.b) })),
        vinduer: r.vinduer.map((l) => ({ a: tilbake(l.a), b: tilbake(l.b) })),
        trapp: !!r.trapp, // trinnstreker funnet: trappehull
      }))
      // Ikke foreslå rom som allerede er lagt inn
      .filter((r) => {
        const m = r.polygon.reduce(([a, b], [x, y]) => [a + x / r.polygon.length, b + y / r.polygon.length], [0, 0]);
        return !lagrede.some((l) => inni(m, l.polygon));
      })
      // Bort med «rom» under 1 m² (skap, sjakter, symboler). Uten målestokk: når den settes.
      .filter((r) => modus === 'skala' || malFor(r.polygon).gulv >= 1);
    const hva = modus === 'skala' ? ' Trykk på et rom du vet arealet på.' : ' Trykk på et rom for å justere det.';
    toast(forslag.length ? 'Fant ' + flertall(forslag.length, 'rom', 'rom') + '.' + hva : 'Fant ingen rom. Tegn dem selv ved å trykke på hjørnene.', { ms: 4000 });
    tegn();
  }

  function leggTilAlle() {
    const antall = job().kalkyle?.rom.length || 0;
    const nye = forslag.map((f, i) => ({
      id: nyId('r-'), navn: f.trapp ? 'Trappehull' : 'Rom ' + (antall + i + 1), lengde: '', bredde: '', hoyde: '',
      ...malFor(f.polygon), vinduer: String(f.vinduer.length), dorer: String(f.dorer.length), trapp: !!f.trapp,
      med: { vegg: true, tak: true, lister: true, vinduer: true, dorer: true }, kilde: 'plan',
      polygon: f.polygon.map(([x, y]) => [Math.round(x), Math.round(y)]), tegning: bildeId,
    }));
    if (!nye.length) return;
    endreKalkyle(jobId, (k) => { k.rom.push(...nye); });
    forslag = [];
    toast(flertall(nye.length, 'rom', 'rom') + ' lagt til. Gi dem navn under Mål.');
    tegn();
  }

  /* ---------- Tegning av lag og panel ---------- */
  const STROK = 3;
  function tegn() {
    const k = 1 / s; // linjer og punkter i fast skjermstørrelse
    svg.innerHTML = '';
    const ny = (navn, attrs) => { const e = document.createElementNS(NS, navn); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); svg.append(e); return e; };
    const etikett = (poly, tekst, farge) => {
      const [cx, cy] = poly.reduce(([a, b], [x, y]) => [a + x / poly.length, b + y / poly.length], [0, 0]);
      const t = ny('text', { x: cx, y: cy, 'text-anchor': 'middle', 'font-size': 15 * k, 'font-weight': 700, fill: farge, 'font-family': 'system-ui, sans-serif' });
      t.textContent = tekst;
    };
    const linjer = (ls, farge) => ls.forEach((l) => ny('line', { x1: l.a[0], y1: l.a[1], x2: l.b[0], y2: l.b[1], stroke: farge, 'stroke-width': 6 * k, 'stroke-linecap': 'round', opacity: 0.85 }));
    for (const r of job().kalkyle?.rom || []) {
      if (!r.polygon || r.tegning !== bildeId || r.id === redigerer) continue;
      ny('polygon', { points: r.polygon.map((p) => p.join(',')).join(' '), fill: 'rgba(30,107,116,.18)', stroke: '#1E6B74', 'stroke-width': STROK * k });
      etikett(r.polygon, r.navn || 'Rom', '#1E6B74');
    }
    forslag.forEach((f, i) => {
      ny('polygon', { points: f.polygon.map((p) => p.join(',')).join(' '), fill: 'rgba(59,76,160,.14)', stroke: '#3B4CA0', 'stroke-width': STROK * k, 'stroke-dasharray': `${8 * k} ${6 * k}` });
      linjer(f.dorer, '#B9482A');
      linjer(f.vinduer, '#4F8FD1');
      etikett(f.polygon, 'Forslag ' + (i + 1) + (f.trapp ? ' · trapp' : ''), '#3B4CA0');
    });
    if (fraForslag) { linjer(fraForslag.dorer, '#B9482A'); linjer(fraForslag.vinduer, '#4F8FD1'); }
    const farge = modus === 'skala' ? '#3B4CA0' : '#B9482A';
    if (punkter.length > 1) {
      ny(modus === 'rom' && punkter.length > 2 ? 'polygon' : 'polyline', {
        points: punkter.map((p) => p.join(',')).join(' '), fill: modus === 'rom' ? 'rgba(185,72,42,.2)' : 'none', stroke: farge, 'stroke-width': STROK * k, 'stroke-linejoin': 'round',
      });
    }
    // Hjørnene: store nok til å ta tak i med en finger
    punkter.forEach(([x, y], i) => ny('circle', { cx: x, cy: y, r: (i === 0 && !lukket && modus === 'rom' && punkter.length >= 3 ? 12 : 10) * k, fill: i === dra ? farge : '#fff', stroke: farge, 'stroke-width': STROK * k }));
    tegnPanel();
  }

  function tegnPanel() {
    if (modus === 'skala') {
      const tittel = punkter.length ? 'Trykk på det andre punktet'
        : forslag.length ? 'Trykk på et rom du vet arealet på' : 'Trykk på to punkter med kjent avstand';
      const tekst = punkter.length ? 'Zoom inn med to fingre for å treffe nøyaktig.'
        : forslag.length ? 'Skriv inn gulvarealet som står på tegningen. Eller trykk på to punkter med kjent avstand.'
        : 'For eksempel endene av et målsatt mål. Eller finn rommene først, og bruk arealet til ett av dem.';
      tom(panel,
        h('div.overtittel', { style: { color: 'var(--ultramarin)' } }, 'Trinn 1 · Målestokk'),
        h('h2', { style: { margin: '3px 0 4px', fontSize: '20px' } }, tittel),
        h('p.dempet.liten', { style: { margin: '0' } }, tekst),
        h('div.knapprad', { style: { marginTop: '10px' } },
          punkter.length
            ? h('button.knapp.sekundar', { type: 'button', onclick: () => { punkter = []; tegn(); } }, 'Start på nytt')
            : h('button.knapp.sekundar', { type: 'button', onclick: () => lukk() }, 'Lukk'),
          !punkter.length && (forslag.length
            ? h('button.knapp', { type: 'button', onclick: lagreUtenSkala }, ikon('hake'), forslag.length === 1 ? 'Lagre rommet' : 'Lagre ' + forslag.length + ' rom')
            : h('button.knapp', { type: 'button', onclick: finnAutomatisk }, '✨ Finn rom'))),
        !punkter.length && forslag.length > 0 && h('button.lenkeknapp', { type: 'button', style: { marginTop: '4px' }, onclick: () => { forslag = []; tegn(); } }, 'Fjern forslag'));
      return;
    }
    const nyMalestokk = h('button.lenkeknapp', { type: 'button', style: { padding: '0' }, onclick: () => { modus = 'skala'; forslag = []; nullstill(); } }, 'Ny målestokk');

    // Ingenting valgt: finn rom automatisk eller tegn selv
    if (!punkter.length) {
      tom(panel,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
          h('div.overtittel', { style: { color: 'var(--terrakotta)', flex: '1' } }, 'Trinn 2 · Rom'), nyMalestokk),
        h('h2', { style: { margin: '3px 0 8px', fontSize: '20px' } }, forslag.length ? 'Trykk på et forslag for å justere det' : 'Finn rommene, eller trykk på hjørnene selv'),
        forslag.length
          ? h('div.knapprad', { style: { marginTop: '0' } },
              h('button.knapp', { type: 'button', onclick: leggTilAlle }, ikon('hake'), forslag.length === 1 ? 'Lagre rommet' : 'Lagre alle ' + forslag.length + ' rom'),
              h('button.knapp.sekundar', { type: 'button', onclick: () => { forslag = []; tegn(); } }, 'Fjern forslag'))
          : h('button.knapp.hel', { type: 'button', onclick: finnAutomatisk }, '✨ Finn rom automatisk'),
        h('p.dempet.liten', { style: { margin: '8px 0 0' } }, 'Trykk på et lagret rom for å endre eller slette det. Dra i hjørnene for å justere.'));
      return;
    }

    const m = punkter.length >= 3 ? malFor(punkter) : { gulv: 0, omkrets: punkter.length === 2 ? Math.hypot(punkter[1][0] - punkter[0][0], punkter[1][1] - punkter[0][1]) * skala : 0 };
    const vegg = m.omkrets * STANDARD_HOYDE;
    const boks = (navn, verdi) => h('div', { style: { flex: '1', background: 'var(--kort)', borderRadius: '12px', padding: '8px 10px', boxShadow: 'var(--skygge)' } },
      h('small.dempet', { style: { display: 'block', fontSize: '12px', fontWeight: '650' } }, navn), h('b', { style: { fontFamily: 'var(--serif)', fontSize: '19px' } }, verdi));
    const navn = redigerer ? (job().kalkyle?.rom.find((r) => r.id === redigerer)?.navn || 'Rom') : 'Nytt rom';
    const tittel = redigerer || fraForslag ? 'Dra i hjørnene for å justere'
      : lukket ? 'Rommet er lukket. Dra i hjørnene om noe sitter feil'
      : punkter.length < 3 ? 'Trykk på hjørnene i rommet' : 'Trykk på første hjørne for å lukke';
    tom(panel,
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
        h('div.overtittel', { style: { color: 'var(--terrakotta)', flex: '1' } }, navn + ' · ' + punkter.length + ' hjørner' + (apnRom ? ' · ' + flertall(apnRom.dorer, 'dør', 'dører') + ', ' + flertall(apnRom.vinduer, 'vindu', 'vinduer') : '')),
        nyMalestokk),
      h('h2', { style: { margin: '3px 0 8px', fontSize: '19px' } }, tittel),
      h('div', { style: { display: 'flex', gap: '8px' } }, boks('Gulv', fmt(m.gulv, 1) + ' m²'), boks('Omkrets', fmt(m.omkrets, 1) + ' m'), boks('Vegg (' + fmt(STANDARD_HOYDE, 1) + ' m)', fmt(vegg, 1) + ' m²')),
      h('div.knapprad', { style: { marginTop: '10px' } },
        redigerer
          ? h('button.knapp.fare', { type: 'button', onclick: slettRommet }, ikon('slett'), 'Slett')
          : h('button.knapp.sekundar', { type: 'button', onclick: () => nullstill({ leggTilbake: true }) }, 'Avbryt'),
        h('button.knapp', { type: 'button', disabled: punkter.length < 3, onclick: ferdigRom }, ikon('hake'), redigerer ? 'Lagre' : 'Ferdig med rommet')),
      redigerer && h('button.lenkeknapp', { type: 'button', style: { marginTop: '4px' }, onclick: () => nullstill() }, 'Avbryt'));
  }

  // Rett etter at visningen er lagt inn, er størrelsen kjent. Snus telefonen, tilpasses den på nytt.
  // Panelet fylles før tegningen tilpasses, så den havner midt i plassen som er igjen.
  tegnPanel();
  passInn();
  tilpass();
  window.addEventListener('resize', tilpass);
  // Endres høyden på panelet (nytt trinn, flere knapper), holdes tegningen på samme sted midt i vinduet.
  if (window.ResizeObserver) {
    let forrigeStr = null;
    const ro = new ResizeObserver(() => {
      const r = vindu.getBoundingClientRect();
      if (forrigeStr) { tx += (r.width - forrigeStr.w) / 2; ty += (r.height - forrigeStr.h) / 2; bruk(); }
      forrigeStr = { w: r.width, h: r.height };
    });
    ro.observe(vindu);
    stoppObs = () => ro.disconnect();
  }
}
