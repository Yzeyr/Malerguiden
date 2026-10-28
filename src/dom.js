/* Små byggeklosser for UI: elementer, ikoner, toast og ark (dialog nedenfra). */

/** h('div.kort', { onclick }, barn...) — klasser med punktum, attributter som objekt. */
export function h(tag, attrs, ...barn) {
  const [navn, ...klasser] = tag.split('.');
  const el = document.createElement(navn || 'div');
  if (klasser.length) el.className = klasser.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { barn.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // bare for fast innhold fra data-filene
    else if (k === 'value' || k === 'checked') el[k] = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  leggTil(el, barn);
  return el;
}

function leggTil(el, barn) {
  for (const b of barn.flat(Infinity)) {
    // `liste.length && h(...)` gir tallet 0 når lista er tom; det skal ikke vises.
    // Tall som skal stå som tekst, sendes alltid inn som streng.
    if (b == null || b === false || b === 0 || b === '') continue;
    el.append(b instanceof Node ? b : document.createTextNode(String(b)));
  }
}

export function tom(el, ...barn) { el.textContent = ''; leggTil(el, barn); return el; }
/** Som el.append, men hopper over null/false/0 (fra `x && h(...)`). */
export function fyll(el, ...barn) { leggTil(el, barn); return el; }

/* Strekikoner, 24×24. Enkle og like, så menyen ser ut som et verktøy. */
const STI = {
  jobber: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18M10 12.5v1.5h4v-1.5"/>',
  regn: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
  oppslag: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  mitt: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  pluss: '<path d="M12 5v14M5 12h14"/>',
  sok: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  tilbake: '<path d="M15 5l-7 7 7 7"/>',
  pil: '<path d="M9 5l7 7-7 7"/>',
  kart: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>',
  ring: '<path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4z"/>',
  kamera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  galleri: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
  kopier: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  hake: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  kryss: '<path d="M6 6l12 12M18 6L6 18"/>',
  slett: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4.5h6V7"/>',
  rediger: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  mer: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  del: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6"/>',
  lastned: '<path d="M12 4v11.5M7.5 11L12 15.5 16.5 11"/><path d="M5 19.5h14"/>',
  kalender: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  bil: '<path d="M4 16.5V12l2-5h12l2 5v4.5"/><path d="M3.5 16.5h17M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  skjold: '<path d="M12 3.5l7 2.8v5.2c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6.3z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
  advarsel: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/>',
  dupliser: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M14 11v6M11 14h6M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  angre: '<path d="M8 5L4 9l4 4"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  notat: '<path d="M6 3.5h8.5L19 8v12a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5z"/><path d="M14 3.5V8.5h5M9 13h6M9 16.5h4"/>',
};

export function ikon(navn) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ik');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = STI[navn] || '';
  return s;
}

/* ---------- Toast ---------- */
let toastEl = null, toastTimer = null;
/** Kort melding nederst. Med angre gir den en «Angre»-knapp. */
export function toast(tekst, { angre = null, ms = 2800 } = {}) {
  if (!toastEl) { toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(toastEl); }
  tom(toastEl, h('span', tekst), angre && h('button', { type: 'button', onclick: () => { skjul(); angre(); } }, 'Angre'));
  clearTimeout(toastTimer);
  requestAnimationFrame(() => toastEl.classList.add('vis'));
  const skjul = () => toastEl.classList.remove('vis');
  toastTimer = setTimeout(skjul, angre ? Math.max(ms, 5000) : ms);
}

/* ---------- Ark ---------- */
/**
 * Åpner et ark. bygg(lukk) returnerer innholdet. Returnerer lukk().
 * Arket fjernes fra DOM når det lukkes.
 */
export function ark(bygg, { vedLukk } = {}) {
  const d = h('dialog.ark');
  const inn = h('div.ark-innhold');
  d.append(inn);
  let lukket = false;
  const lukk = (verdi) => {
    if (lukket) return;
    lukket = true;
    try { d.close(); } catch { /* allerede lukket */ }
    d.remove();
    vedLukk && vedLukk(verdi);
  };
  d.addEventListener('click', (e) => { if (e.target === d) lukk(); });
  d.addEventListener('cancel', (e) => { e.preventDefault(); lukk(); });
  inn.append(bygg(lukk));
  document.body.append(d);
  d.showModal();
  return lukk;
}

/** Ja/nei-spørsmål som et ark. Løses med true/false. */
export function bekreft({ tittel, tekst, ja = 'Ja', nei = 'Avbryt', fare = false }) {
  return new Promise((resolve) => {
    let svar = false;
    ark((lukk) => h('div',
      h('h2', tittel),
      tekst && h('p.dempet', { style: { marginTop: '-6px' } }, tekst),
      h('div.knapprad',
        h('button.knapp.sekundar', { type: 'button', onclick: () => lukk() }, nei),
        h('button.knapp' + (fare ? '.fare' : ''), { type: 'button', onclick: () => { svar = true; lukk(); } }, ja)),
    ), { vedLukk: () => resolve(svar) });
  });
}

/** Velg ett av flere valg i et ark. valg: [{ verdi, tekst, under?, klasse? }]. Løses med verdi eller null. */
export function velg({ tittel, valg, valgt }) {
  return new Promise((resolve) => {
    let svar = null;
    ark((lukk) => h('div',
      h('h2', tittel),
      h('div.valgliste', valg.map((v) => h('button', {
        type: 'button', class: v.klasse || '', 'aria-pressed': String(v.verdi === valgt),
        onclick: () => { svar = v.verdi; lukk(); },
      }, v.klasse && h('span.prikk'), h('span', v.tekst, v.under && h('small', v.under))))),
    ), { vedLukk: () => resolve(svar) });
  });
}

/** Kopierer tekst, med reserve for eldre nettlesere. */
export async function kopierTekst(tekst) {
  try { await navigator.clipboard.writeText(tekst); return true; }
  catch {
    const t = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    t.value = tekst;
    document.body.append(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    return ok;
  }
}
