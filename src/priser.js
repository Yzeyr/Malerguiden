/* Brukerens egne priser og normtall (overstyrer standardverdiene i data/normer.js). */

import { lesJson, skrivJson, reddOdelagt } from './store.js';

export const PRIS_NOKKEL = 'malerguiden:priser';
let egne = {};

export function lastPriser() {
  const r = lesJson(PRIS_NOKKEL);
  if (r.status === 'odelagt') reddOdelagt(PRIS_NOKKEL, r.raa);
  egne = r.status === 'ok' && r.verdi && typeof r.verdi === 'object' && !Array.isArray(r.verdi) ? r.verdi : {};
}

export function egnePriser() { return egne; }

/** Setter ett felt. sti: ['timepris'] eller ['normer', id, 'timer']. Tom verdi fjerner overstyringen. */
export function settPris(sti, verdi) {
  const kopi = JSON.parse(JSON.stringify(egne));
  let o = kopi;
  for (const del of sti.slice(0, -1)) { if (!o[del] || typeof o[del] !== 'object') o[del] = {}; o = o[del]; }
  const siste = sti[sti.length - 1];
  if (verdi === '' || verdi == null) delete o[siste]; else o[siste] = String(verdi);
  if (!skrivJson(PRIS_NOKKEL, kopi)) return false;
  egne = kopi;
  return true;
}

export function nullstillPriser() {
  if (!skrivJson(PRIS_NOKKEL, {})) return false;
  egne = {};
  return true;
}

/** Fra sikkerhetskopi: bare hvis det ikke finnes egne priser her fra før. */
export function importerPriser(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(egne).length) return false;
  if (!skrivJson(PRIS_NOKKEL, p)) return false;
  egne = p;
  return true;
}
