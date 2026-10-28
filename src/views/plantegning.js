/* Måling på plantegning.

   1. Bilde av tegningen (lagres på jobben som et bilde i kategorien «Tegning»).
   2. Målestokk: trykk på to punkter og skriv inn avstanden mellom dem.
   3. Rom: trykk på hjørnene. Gulv, omkrets og veggareal vises underveis.

   Én finger flytter, to fingre zoomer, et kort trykk setter et punkt.
   Koordinatene lagres i bildets egne punkter, så de stemmer neste gang. */

import { h, tom, ikon, toast, ark } from '../dom.js';
import { nyId, fmt } from '../util.js';
import { hentJobb, endreJobb, vedEndring } from '../jobs.js';
import { lagreNyttBilde, hentBilde } from '../photos.js';
import { polygonMal, STANDARD_HOYDE, tall } from '../kalkyle.js';
import { endreKalkyle, romArk } from './pris.js';

const TEGNING_MAKS = 2600; // høyere enn vanlige bilder, så små mål på tegningen kan leses

export function apnePlantegning(jobId) {
  const job = hentJobb(jobId);
  const plan = job.kalkyle?.plan;
  if (plan) { verktoy(jobId, plan.bilde); return; }
  velgTegning(jobId);
}

/** Lar brukeren velge et bilde av tegningen og lagrer det på jobben. Løses med bilde-id eller null. */
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
            endreKalkyle(jobId, (k) => { k.plan = { bilde: id, skala: null }; });
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
  if (!blob) { toast('Fant ikke tegningen. Velg den på nytt.'); endreKalkyle(jobId, (k) => { k.plan = null; }); velgTegning(jobId); return; }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((r, f) => { img.onload = r; img.onerror = f; img.src = url; }).catch(() => {});
  const W = img.naturalWidth, H = img.naturalHeight;

  const job = () => hentJobb(jobId);
  let skala = job().kalkyle?.plan?.skala; // meter per bildepunkt
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
  const panel = h('div', { style: { background: 'var(--lerret)', color: 'var(--blekk)', borderRadius: '22px 22px 0 0', padding: '14px 16px calc(14px + var(--bunn))' } });
  const el = h('div.planverktoy', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Måling på plantegning' },
    h('div.plinje',
      h('button', { type: 'button', onclick: () => lukk() }, 'Lukk'),
      h('span', { style: { flex: '1' } }),
      h('button', { type: 'button', 'aria-label': 'Zoom ut', onclick: () => zoomRundt(1 / 1.5) }, '−'),
      h('button', { type: 'button', 'aria-label': 'Zoom inn', onclick: () => zoomRundt(1.5) }, '+'),
      h('button', { type: 'button', onclick: () => { punkter.pop(); tegn(); } }, ikon('angre'))),
    vindu, panel);
  document.body.append(el);

  // Rom som lagres fra arket, tegnes inn med en gang.
  const av = vedEndring((id) => { if (id === jobId) tegn(); });
  const lukk = () => { av(); window.removeEventListener('resize', tilpass); URL.revokeObjectURL(url); el.remove(); };

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

  const pekere = new Map();
  let start = null; // { x, y, tx, ty, s, avstand, midt, flyttet }
  vindu.addEventListener('pointerdown', (e) => {
    try { vindu.setPointerCapture(e.pointerId); } catch { /* ikke alle pekere kan fanges */ }
    const r = vindu.getBoundingClientRect();
    pekere.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    start = { tx, ty, s, flyttet: pekere.size > 1, ...maal() };
  });
  vindu.addEventListener('pointermove', (e) => {
    if (!pekere.has(e.pointerId) || !start) return;
    const r = vindu.getBoundingClientRect();
    pekere.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    const m = maal();
    if (pekere.size === 1) {
      const dx = m.midt[0] - start.midt[0], dy = m.midt[1] - start.midt[1];
      if (Math.hypot(dx, dy) > 8) start.flyttet = true;
      if (start.flyttet) { tx = start.tx + dx; ty = start.ty + dy; bruk(); }
    } else if (pekere.size === 2 && start.avstand) {
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
    if (start && !start.flyttet && pekere.size === 0) settPunkt(...tilBilde(x, y));
    start = pekere.size ? { tx, ty, s, flyttet: true, ...maal() } : null;
  };
  vindu.addEventListener('pointerup', slipp);
  vindu.addEventListener('pointercancel', (e) => { pekere.delete(e.pointerId); start = null; });
  vindu.addEventListener('wheel', (e) => { e.preventDefault(); const r = vindu.getBoundingClientRect(); zoomRundt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  function maal() {
    const p = [...pekere.values()];
    if (!p.length) return { midt: [0, 0], avstand: 0 };
    if (p.length === 1) return { midt: p[0], avstand: 0 };
    return { midt: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], avstand: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) };
  }

  /* ---------- Punkter ---------- */
  function settPunkt(x, y) {
    if (x < -W * 0.05 || y < -H * 0.05 || x > W * 1.05 || y > H * 1.05) return;
    // Trykk på første hjørne lukker rommet.
    if (modus === 'rom' && punkter.length >= 3) {
      const [fx, fy] = punkter[0];
      if (Math.hypot(fx - x, fy - y) * s < 22) { ferdigRom(); return; }
    }
    punkter.push([x, y]);
    if (modus === 'skala' && punkter.length === 2) { spørAvstand(); return; }
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
          endreKalkyle(jobId, (k) => { k.plan = { bilde: bildeId, skala }; });
          modus = 'rom'; punkter = [];
          lukkArk();
          toast('Målestokken er satt.');
          tegn();
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

  function ferdigRom() {
    if (punkter.length < 3) return;
    const meter = punkter.map(([x, y]) => [x * skala, y * skala]);
    const { areal, omkrets } = polygonMal(meter);
    const polygon = punkter.map(([x, y]) => [Math.round(x), Math.round(y)]);
    punkter = [];
    tegn();
    romArk(jobId, null, { navn: 'Rom ' + ((job().kalkyle?.rom.length || 0) + 1), gulv: Math.round(areal * 100) / 100, omkrets: Math.round(omkrets * 100) / 100, kilde: 'plan', polygon, tegning: bildeId });
  }

  /* ---------- Tegning av lag og panel ---------- */
  const STROK = 3;
  function tegn() {
    const k = 1 / s; // linjer og punkter i fast skjermstørrelse
    svg.innerHTML = '';
    const ny = (navn, attrs) => { const e = document.createElementNS(NS, navn); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); svg.append(e); return e; };
    for (const r of job().kalkyle?.rom || []) {
      if (!r.polygon || r.tegning !== bildeId) continue;
      ny('polygon', { points: r.polygon.map((p) => p.join(',')).join(' '), fill: 'rgba(30,107,116,.18)', stroke: '#1E6B74', 'stroke-width': STROK * k });
      const [cx, cy] = r.polygon.reduce(([a, b], [x, y]) => [a + x / r.polygon.length, b + y / r.polygon.length], [0, 0]);
      const t = ny('text', { x: cx, y: cy, 'text-anchor': 'middle', 'font-size': 15 * k, 'font-weight': 700, fill: '#1E6B74', 'font-family': 'system-ui, sans-serif' });
      t.textContent = r.navn || 'Rom';
    }
    const farge = modus === 'skala' ? '#3B4CA0' : '#B9482A';
    if (punkter.length > 1) {
      ny(modus === 'rom' && punkter.length > 2 ? 'polygon' : 'polyline', {
        points: punkter.map((p) => p.join(',')).join(' '), fill: modus === 'rom' ? 'rgba(185,72,42,.2)' : 'none', stroke: farge, 'stroke-width': STROK * k, 'stroke-linejoin': 'round',
      });
    }
    punkter.forEach(([x, y], i) => ny('circle', { cx: x, cy: y, r: (i === 0 && modus === 'rom' && punkter.length >= 3 ? 11 : 8) * k, fill: '#fff', stroke: farge, 'stroke-width': STROK * k }));
    tegnPanel();
  }

  function tegnPanel() {
    if (modus === 'skala') {
      tom(panel,
        h('div.overtittel', { style: { color: 'var(--ultramarin)' } }, 'Trinn 1 · Målestokk'),
        h('h2', { style: { margin: '3px 0 4px', fontSize: '20px' } }, punkter.length ? 'Trykk på det andre punktet' : 'Trykk på to punkter med kjent avstand'),
        h('p.dempet.liten', { style: { margin: '0' } }, 'For eksempel endene av et målsatt mål, eller en vegg du kjenner lengden på. Zoom inn med to fingre for å treffe nøyaktig.'));
      return;
    }
    const meter = punkter.map(([x, y]) => [x * skala, y * skala]);
    const m = punkter.length >= 3 ? polygonMal(meter) : { areal: 0, omkrets: punkter.length === 2 ? Math.hypot(meter[1][0] - meter[0][0], meter[1][1] - meter[0][1]) : 0 };
    const vegg = m.omkrets * STANDARD_HOYDE;
    const boks = (navn, verdi) => h('div', { style: { flex: '1', background: 'var(--kort)', borderRadius: '12px', padding: '8px 10px', boxShadow: 'var(--skygge)' } },
      h('small.dempet', { style: { display: 'block', fontSize: '12px', fontWeight: '650' } }, navn), h('b', { style: { fontFamily: 'var(--serif)', fontSize: '19px' } }, verdi));
    const antall = job().kalkyle?.rom.filter((r) => r.tegning === bildeId).length || 0;
    tom(panel,
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
        h('div.overtittel', { style: { color: 'var(--terrakotta)', flex: '1' } }, 'Rom ' + (antall + 1) + ' · ' + punkter.length + ' hjørner'),
        h('button.lenkeknapp', { type: 'button', style: { padding: '0' }, onclick: () => { modus = 'skala'; punkter = []; tegn(); } }, 'Ny målestokk')),
      h('h2', { style: { margin: '3px 0 8px', fontSize: '20px' } }, punkter.length < 3 ? 'Trykk på hjørnene i rommet' : 'Trykk på første hjørne for å lukke'),
      h('div', { style: { display: 'flex', gap: '8px' } }, boks('Gulv', fmt(m.areal, 1) + ' m²'), boks('Omkrets', fmt(m.omkrets, 1) + ' m'), boks('Vegg (' + fmt(STANDARD_HOYDE, 1) + ' m)', fmt(vegg, 1) + ' m²')),
      h('button.knapp.hel', { type: 'button', style: { marginTop: '10px' }, disabled: punkter.length < 3, onclick: ferdigRom }, ikon('hake'), 'Ferdig med rommet'));
  }

  // Rett etter at visningen er lagt inn, er størrelsen kjent. Snus telefonen, tilpasses den på nytt.
  tilpass();
  window.addEventListener('resize', tilpass);
}
