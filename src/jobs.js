/* Jobbene: lesing, normalisering, endring og lagring.

   Formen på en jobb er den samme som den gamle appen lagret, så alt som
   ligger på telefonen leses som før. Forskjellene er i hvordan feil
   håndteres:
   - Ødelagt JSON gjør ikke lista tom. Råteksten tas vare på, og lagring
     sperres til brukeren har fått beskjed, så ingenting skrives over.
   - En enkelt jobb som ikke kan leses, legges til side og skrives tilbake
     uendret ved neste lagring i stedet for å forsvinne.
   - Hver skriving sier fra om den feilet (se store.js). */

import { NOKLER, lesJson, skrivJson, reddOdelagt, senere } from './store.js';
import { nyId, erIsoDag, datoEtikett, visTidspunkt, visDato, fmt } from './util.js';
import { FAG_BY_ID, JOBBTYPER, sjekklisteFor, delTittel } from './data/checklists.js';
import { MAAL_GRUPPER, FORBEHOLD_VALG, BILDE_KATEGORIER } from './data/misc.js';
import { rensKalkyle, beregn } from './kalkyle.js';
import { egnePriser } from './priser.js';

export const STATUS = ['planlagt', 'pagar', 'pauset', 'ferdig'];
export const STATUS_LABEL = { planlagt: 'Planlagt', pagar: 'Pågår', pauset: 'Pauset', ferdig: 'Ferdig' };
const KATEGORI_IDER = BILDE_KATEGORIER.map((k) => k.id);

const str = (v) => (v == null ? '' : String(v));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/* ---------- Normalisering ---------- */

function normaliserDel(del) {
  const fag = FAG_BY_ID[del.fag] ? del.fag : 'annet';
  const typer = JOBBTYPER[fag] || null;
  let jobbtype = '';
  if (typer) jobbtype = typer.some((t) => t.id === del.jobbtype) ? del.jobbtype : typer[0].id;
  return {
    id: del.id ? String(del.id) : nyId('d-'),
    fag,
    jobbtype,
    sjekkliste: obj(del.sjekkliste) || {},
    lagtTil: Number(del.lagtTil) || Date.now(),
  };
}

/** Gjør en rå jobb om til garantert form. Kaster bare hvis j ikke er et objekt med id. */
export function normaliserJobb(j) {
  if (!obj(j) || !j.id) throw new Error('ikke en jobb');
  const kunde = obj(j.kunde) || {};
  const job = {
    id: String(j.id),
    created: Number(j.created) || Date.now(),
    updated: Number(j.updated) || Number(j.created) || Date.now(),
    // «befaring» var et eldre navn på planlagt.
    status: STATUS.includes(j.status) ? j.status : 'planlagt',
    deler: [],
    kunde: { navn: str(kunde.navn), adresse: str(kunde.adresse), tlf: str(kunde.tlf) },
    rom: str(j.rom),
    dato: erIsoDag(j.dato) ? j.dato : '',
    utstyr: Array.isArray(j.utstyr)
      ? j.utstyr.filter((u) => obj(u) && u.id && typeof u.tekst === 'string' && u.tekst)
          .map((u) => ({ id: String(u.id), tekst: u.tekst, checked: !!u.checked, created: Number(u.created) || 0 }))
      : [],
    bilder: Array.isArray(j.bilder)
      ? j.bilder.filter((b) => obj(b) && b.id)
          .map((b) => ({ id: String(b.id), kategori: KATEGORI_IDER.includes(b.kategori) ? b.kategori : 'underveis', tatt: Number(b.tatt) || 0 }))
      : [],
    beregninger: Array.isArray(j.beregninger)
      ? j.beregninger.filter((b) => obj(b)).map((b) => ({
          id: b.id ? String(b.id) : nyId('b-'),
          calcId: str(b.calcId),
          tidspunkt: Number(b.tidspunkt) || 0,
          sammendrag: str(b.sammendrag),
          input: obj(b.input) || {},
          planlagtMengde: Number.isFinite(b.planlagtMengde) ? b.planlagtMengde : null,
          enhet: b.enhet ? String(b.enhet) : null,
          faktiskMengde: Number.isFinite(b.faktiskMengde) ? b.faktiskMengde : null,
        }))
      : [],
    klasse: j.klasse === 'K2' || j.klasse === 'K3' ? j.klasse : '',
    maal: {},
    maalFritekst: str(j.maalFritekst),
    farger: Array.isArray(j.farger)
      ? j.farger.filter((f) => obj(f) && f.id).map((f) => ({
          id: String(f.id), rom: str(f.rom), produkt: str(f.produkt), kode: str(f.kode),
          glans: str(f.glans), strok: str(f.strok), dato: erIsoDag(f.dato) ? f.dato : '',
        }))
      : [],
    forbeholdValgt: Array.isArray(j.forbeholdValgt) ? j.forbeholdValgt.filter((x) => typeof x === 'string') : [],
    notat: str(j.notat),
    forbehold: str(j.forbehold),
    // Prisberegningen (rom, arbeid, tillegg). null til den tas i bruk.
    kalkyle: null,
  };
  // Mål kan ha blitt lagret som tall i en redigert kopi; UI-et regner med tekst.
  const maal = obj(j.maal) || {};
  for (const k of Object.keys(maal)) if (maal[k] != null) job.maal[k] = String(maal[k]);

  // Jobber fra før «arbeider» fantes har fag/jobbtype/sjekkliste rett på seg.
  // De blir til ett arbeid med avhukingene i behold.
  let deler = Array.isArray(j.deler) ? j.deler.filter((d) => obj(d)) : [];
  if (!deler.length) deler = [{ fag: j.fag, jobbtype: j.jobbtype, sjekkliste: j.sjekkliste, lagtTil: j.created }];
  job.deler = deler.map(normaliserDel);
  job.kalkyle = rensKalkyle(j.kalkyle, job.klasse);
  return job;
}

/* ---------- Tilstand i minnet ---------- */

let jobber = [];
let ulesbare = []; // rå elementer som ikke kunne normaliseres; skrives tilbake uendret
let sperret = null; // { melding, kopi } når lagret data ikke kunne leses
const lyttere = new Set();

export function vedEndring(fn) { lyttere.add(fn); return () => lyttere.delete(fn); }
function varsle(id) { for (const fn of lyttere) { try { fn(id); } catch (e) { console.error(e); } } }

/** Leser jobbene fra lagringen. Kalles ved oppstart og når en annen fane endrer dem. */
export function lastJobber() {
  const r = lesJson(NOKLER.jobber);
  ulesbare = [];
  sperret = null;
  if (r.status === 'tom') { jobber = []; return; }
  if (r.status === 'odelagt' || !Array.isArray(r.verdi)) {
    const kopi = reddOdelagt(NOKLER.jobber, r.raa);
    jobber = [];
    sperret = {
      kopi,
      melding: 'Jobbene på telefonen kunne ikke leses. Ingenting er slettet, og appen lagrer ikke nye endringer før dette er løst. Gjenopprett fra en sikkerhetskopi under Mitt.',
    };
    return;
  }
  const ok = [];
  for (const raa of r.verdi) {
    try { ok.push(normaliserJobb(raa)); }
    catch { if (raa != null) ulesbare.push(raa); }
  }
  jobber = ok;
}

export function lagringSperret() { return sperret; }

/** Etter gjenoppretting fra kopi kan brukeren selv oppheve sperren. */
export function opphevSperre() { sperret = null; }

function lagreNa() {
  if (sperret) return false;
  return skrivJson(NOKLER.jobber, [...jobber, ...ulesbare]);
}

export function alleJobber() { return jobber; }
export function hentJobb(id) { return jobber.find((j) => j.id === id) || null; }

/**
 * Endrer en jobb. fn(job) endrer objektet direkte.
 * Med { utsatt: true } lagres det litt senere (for tekstfelt).
 * Returnerer false hvis lagringen feilet (UI har da fått beskjed via store).
 */
export function endreJobb(id, fn, { utsatt = false, stille = false } = {}) {
  const job = hentJobb(id);
  if (!job) return false;
  fn(job);
  job.updated = Date.now();
  if (utsatt) {
    senere('jobber', lagreNa, 350);
    if (!stille) varsle(id);
    return true;
  }
  const ok = lagreNa();
  if (!stille) varsle(id);
  return ok;
}

export function leggTilJobb(job) {
  jobber.push(job);
  const ok = lagreNa();
  if (!ok) jobber = jobber.filter((j) => j !== job);
  varsle(job.id);
  return ok;
}

/** Fjerner jobben og returnerer den (så UI kan slette bildene), eller null. */
export function slettJobb(id) {
  const job = hentJobb(id);
  if (!job) return null;
  const for_ = jobber;
  jobber = jobber.filter((j) => j.id !== id);
  if (!lagreNa()) { jobber = for_; varsle(id); return null; }
  varsle(id);
  return job;
}

export function nyJobb({ navn, fag = 'annet', jobbtype = '', adresse = '', dato = '', rom = '' }) {
  return normaliserJobb({
    id: nyId('j-'), created: Date.now(), status: 'planlagt',
    kunde: { navn: String(navn || '').trim(), adresse: String(adresse || '').trim() },
    rom, dato,
    deler: [{ id: nyId('d-'), fag, jobbtype, sjekkliste: {}, lagtTil: Date.now() }],
  });
}

/** Samme kunde og arbeider, blank sjekkliste. Som i den gamle appen. */
export function dupliserJobb(kilde, { notat = false, beregninger = false } = {}) {
  return normaliserJobb({
    id: nyId('j-'), created: Date.now(), status: 'planlagt',
    rom: kilde.rom, klasse: kilde.klasse,
    deler: kilde.deler.map((d) => ({ id: nyId('d-'), fag: d.fag, jobbtype: d.jobbtype, sjekkliste: {}, lagtTil: Date.now() })),
    kunde: { ...kilde.kunde },
    notat: notat ? kilde.notat : '',
    forbehold: notat ? kilde.forbehold : '',
    forbeholdValgt: notat ? kilde.forbeholdValgt.slice() : [],
    beregninger: beregninger
      ? kilde.beregninger.map((b) => ({ ...b, id: nyId('b-'), tidspunkt: Date.now(), faktiskMengde: null }))
      : [],
    // Valgene for arbeidet følger med, men rommene hører til jobben som ble målt opp.
    kalkyle: kilde.kalkyle ? { ...kilde.kalkyle, rom: [], tillegg: [] } : null,
  });
}

/** Legger inn jobber fra en sikkerhetskopi. Overskriver aldri en jobb som finnes. */
export function importerJobber(liste) {
  let lagtTil = 0, fantes = 0, feil = 0;
  const nye = [];
  for (const raa of Array.isArray(liste) ? liste : []) {
    if (!raa || !raa.id) { feil++; continue; }
    if (hentJobb(String(raa.id)) || nye.some((j) => j.id === String(raa.id))) { fantes++; continue; }
    try { nye.push(normaliserJobb(raa)); } catch { feil++; }
  }
  if (!nye.length) return { lagtTil, fantes, feil, ok: true };
  const for_ = jobber;
  jobber = [...jobber, ...nye];
  if (!lagreNa()) { jobber = for_; return { lagtTil: 0, fantes, feil: feil + nye.length, ok: false }; }
  lagtTil = nye.length;
  varsle(null);
  return { lagtTil, fantes, feil, ok: true };
}

// En annen fane (eller Safari ved siden av hjemskjerm-appen) har endret jobbene.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === NOKLER.jobber) { lastJobber(); varsle(null); } });
}

/* ---------- Avledet informasjon ---------- */

export function sjekkpunkter(del) { return sjekklisteFor(del).flatMap((g) => g.items); }

export function delFramdrift(del) {
  const p = sjekkpunkter(del);
  return { gjort: p.filter((x) => del.sjekkliste[x.id]).length, av: p.length };
}

export function framdrift(job) {
  let gjort = 0, av = 0;
  for (const d of job.deler) { const f = delFramdrift(d); gjort += f.gjort; av += f.av; }
  return { gjort, av, andel: av ? gjort / av : 0 };
}

/** Første uavhukede punkt på tvers av arbeidene. */
export function nesteSteg(job) {
  for (const del of job.deler) {
    for (const gruppe of sjekklisteFor(del)) {
      for (const item of gruppe.items) {
        if (!del.sjekkliste[item.id]) return { del, fase: gruppe.fase, item, flereDeler: job.deler.length > 1 };
      }
    }
  }
  return null;
}

export function hovedfag(job) { return job.deler[0]?.fag || 'annet'; }
export function arbeidTekst(job) { return job.deler.map(delTittel).join(' + '); }

export function maalGrupperFor(job) { return MAAL_GRUPPER.filter((g) => g.gjelder(job.deler)); }

export function jobbNavn(job) {
  return (job.kunde.navn || 'Uten navn') + (job.rom ? ' – ' + job.rom : '');
}

export function fargeDetaljer(f) {
  const d = [];
  if (f.glans) d.push('Glans ' + f.glans);
  if (f.strok) d.push(f.strok + ' strøk');
  if (f.dato) d.push(visDato(f.dato));
  return d.join(' · ');
}

export function forbeholdTekster(job) {
  const valgt = job.forbeholdValgt.map((id) => FORBEHOLD_VALG.find((f) => f.id === id)?.tekst).filter(Boolean);
  const egne = job.forbehold.split('\n').map((l) => l.trim()).filter(Boolean);
  return [...valgt, ...egne];
}

/** Jobben som ren tekst til e-post eller melding. Samme format som den gamle appen. */
export function eksportTekst(job) {
  const L = [];
  L.push((job.kunde.navn || 'Uten navn') + (job.rom ? ' — ' + job.rom : ''));
  if (job.kunde.adresse) L.push('Adresse: ' + job.kunde.adresse);
  if (job.kunde.tlf) L.push('Tlf: ' + job.kunde.tlf);
  L.push('Arbeid: ' + arbeidTekst(job));
  L.push('Status: ' + STATUS_LABEL[job.status]);
  if (job.dato) L.push('Dato: ' + job.dato + ' (' + datoEtikett(job.dato) + ')');
  if (job.klasse) L.push('Avtalt sparklingsklasse: ' + job.klasse);

  for (const del of job.deler) {
    const df = delFramdrift(del);
    L.push('', '=== ' + delTittel(del) + ' (' + df.gjort + '/' + df.av + ') ===');
    for (const g of sjekklisteFor(del)) {
      L.push('', g.fase.toUpperCase());
      for (const item of g.items) L.push((del.sjekkliste[item.id] ? '✓ ' : '☐ ') + item.label);
    }
  }
  if (job.utstyr.length) {
    L.push('', 'Neste besøk:');
    job.utstyr.slice().sort((a, b) => (a.created || 0) - (b.created || 0))
      .forEach((u) => L.push((u.checked ? '✓ ' : '☐ ') + u.tekst));
  }
  if (job.beregninger.length) {
    L.push('', 'Beregninger:');
    job.beregninger.slice().sort((a, b) => a.tidspunkt - b.tidspunkt).forEach((b) => {
      let rad = '- ' + b.sammendrag;
      if (b.faktiskMengde != null) rad += ' — faktisk: ' + fmt(b.faktiskMengde, 1) + ' ' + b.enhet;
      L.push(rad);
    });
  }
  if (job.bilder.length) {
    const per = BILDE_KATEGORIER.map((k) => {
      const n = job.bilder.filter((b) => b.kategori === k.id).length;
      return n ? n + ' ' + k.label.toLowerCase() : null;
    }).filter(Boolean);
    L.push('', 'Bilder: ' + job.bilder.length + ' (' + per.join(', ') + ') — ligger i appen på telefonen');
  }
  if (job.notat.trim()) L.push('', 'Notat:', job.notat.trim());
  const maal = [];
  for (const g of maalGrupperFor(job)) {
    for (const f of g.felt) {
      const v = (job.maal[f.id] || '').trim();
      if (v) maal.push('- ' + f.navn + ': ' + v + ' ' + f.enhet);
    }
  }
  job.maalFritekst.split('\n').forEach((l) => { if (l.trim()) maal.push('- ' + l.trim()); });
  if (maal.length) L.push('', 'Mål:', ...maal);
  if (job.farger.length) {
    L.push('', 'Fargeprotokoll:');
    job.farger.slice().sort((a, b) => (a.dato || '').localeCompare(b.dato || '')).forEach((f) => {
      let rad = '- ' + (f.rom || 'Uten rom') + ': ' + [f.produkt, f.kode].filter(Boolean).join(' · ');
      const d = fargeDetaljer(f);
      if (d) rad += ' (' + d + ')';
      L.push(rad);
    });
  }
  if (job.kalkyle && job.kalkyle.rom.length) {
    const r = beregn(job.kalkyle, egnePriser());
    if (r.sum.timer > 0) {
      L.push('', 'Overslag:');
      L.push('- ' + job.kalkyle.rom.map((x) => x.navn || 'Rom').join(', '));
      L.push('- Vegg ' + fmt(r.mengder.vegg, 1) + ' m², tak ' + fmt(r.mengder.tak, 1) + ' m², lister ' + fmt(r.mengder.lister, 1) + ' m');
      L.push('- ' + fmt(r.sum.timer, 1) + ' timer, ' + fmt(r.sum.eksMva, 0) + ' kr eks. mva (' + fmt(r.sum.inklMva, 0) + ' kr inkl.)');
    }
  }
  const fb = forbeholdTekster(job);
  if (fb.length) L.push('', 'Forbehold:', ...fb.map((l) => '⚠️ ' + l));
  L.push('', 'Sist oppdatert: ' + visTidspunkt(job.updated));
  return L.join('\n');
}

/** Ting som skal med i bilen, fra alle jobber som ikke er ferdige. */
export function taMedOversikt() {
  return jobber
    .filter((j) => j.status !== 'ferdig')
    .map((j) => ({ job: j, ting: j.utstyr.filter((u) => !u.checked).sort((a, b) => (a.created || 0) - (b.created || 0)) }))
    .filter((x) => x.ting.length);
}
