/* Favoritter og egne notater. Samme nøkler og form som den gamle appen. */

import { NOKLER, lesJson, skrivJson, reddOdelagt } from './store.js';
import { nyId } from './util.js';

/* ---------- Favoritter: liste med fakta-id-er ---------- */

let favoritter = [];

export function lastFavoritter() {
  const r = lesJson(NOKLER.favoritter);
  if (r.status === 'odelagt') reddOdelagt(NOKLER.favoritter, r.raa);
  favoritter = r.status === 'ok' && Array.isArray(r.verdi) ? r.verdi.filter((x) => typeof x === 'string') : [];
}
export function alleFavoritter() { return favoritter; }
export function erFavoritt(id) { return favoritter.includes(id); }

/** Slår favoritt av/på. Returnerer ny tilstand, eller null hvis lagringen feilet. */
export function vekslFavoritt(id) {
  const for_ = favoritter;
  favoritter = erFavoritt(id) ? favoritter.filter((x) => x !== id) : [...favoritter, id];
  if (!skrivJson(NOKLER.favoritter, favoritter)) { favoritter = for_; return null; }
  return erFavoritt(id);
}

export function leggTilFavoritter(ider) {
  const nye = ider.filter((x) => typeof x === 'string' && !favoritter.includes(x));
  if (!nye.length) return 0;
  const for_ = favoritter;
  favoritter = [...favoritter, ...nye];
  if (!skrivJson(NOKLER.favoritter, favoritter)) { favoritter = for_; return -1; }
  return nye.length;
}

/* ---------- Notater: { id, title, value, text, created, updated } ---------- */

let notater = [];
let notatSperre = false;

export function lastNotater() {
  const r = lesJson(NOKLER.notater);
  notatSperre = false;
  if (r.status === 'odelagt' || (r.status === 'ok' && !Array.isArray(r.verdi))) {
    reddOdelagt(NOKLER.notater, r.raa);
    notatSperre = true;
    notater = [];
    return;
  }
  notater = (r.verdi || []).filter((n) => n && typeof n.title === 'string' && n.title).map(rensNotat);
}

function rensNotat(n) {
  const naa = Date.now();
  return {
    id: n.id ? String(n.id) : nyId('n-'),
    title: String(n.title).slice(0, 80),
    value: String(n.value || '').slice(0, 40),
    text: String(n.text || '').slice(0, 600),
    created: Number(n.created) || naa,
    updated: Number(n.updated) || Number(n.created) || naa,
  };
}

export function alleNotater() {
  return notater.slice().sort((a, b) => (b.updated || b.created) - (a.updated || a.created));
}

function lagre() { return !notatSperre && skrivJson(NOKLER.notater, notater); }

export function lagreNotat({ id, title, value, text }) {
  const for_ = notater;
  if (id) {
    notater = notater.map((n) => (n.id === id ? { ...n, title, value, text, updated: Date.now() } : n));
  } else {
    notater = [...notater, rensNotat({ title, value, text })];
  }
  if (!lagre()) { notater = for_; return false; }
  return true;
}

export function slettNotat(id) {
  const for_ = notater;
  notater = notater.filter((n) => n.id !== id);
  if (!lagre()) { notater = for_; return false; }
  return true;
}

/** Legger inn notater fra kopi. Hopper over dem som finnes. */
export function importerNotater(liste) {
  let lagtTil = 0;
  const for_ = notater;
  for (const n of Array.isArray(liste) ? liste : []) {
    if (!n || typeof n.title !== 'string' || !n.title.trim()) continue;
    if (n.id && notater.some((x) => x.id === n.id)) continue;
    notater = [...notater, rensNotat(n)];
    lagtTil++;
  }
  if (lagtTil && !lagre()) { notater = for_; return -1; }
  return lagtTil;
}
