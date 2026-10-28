/* Prisberegning: mengder fra rommene → timer, arbeid, materialer og pris.

   Ren logikk uten DOM, så alt kan testes. Formen som lagres på jobben:

   job.kalkyle = {
     modus: 'timer' | 'enhet',          // timer × timepris, eller enhetspriser
     arbeid: {                           // hva som gjøres, felles for alle rom
       vegg:  { sparkling: 'ingen'|'skjot'|'K2'|'K3', grunning: bool, strok: 0-3 },
       tak:   { sparkling, grunning, strok },
       lister:{ strok },  vinduer: { strok },  dorer: { strok },
     },
     rom: [{ id, navn, lengde, bredde, hoyde,       // tekst, som i skjemaene
             gulv, omkrets,                           // tall fra plantegning (overstyrer L × B)
             vinduer, dorer,                          // antall (tekst)
             trapp: bool,                             // trappehull: høye flater, stillas
             med: { vegg, tak, lister, vinduer, dorer }, // av/på per rom
             kilde: 'manuell'|'plan'|'ki'|'skann', polygon? }],
     tillegg: [{ id, tekst, timer, kr }],
   }
*/

import { NORMER, STANDARD_PRISER } from './data/normer.js';

export const DOR_M2 = 1.6;      // samme som romkalkulatoren
export const VINDU_M2 = 1.5;
export const DOR_BREDDE = 0.9;  // trekkes fra gulvlist

export const SPARKLING = [
  { id: 'ingen', label: 'Ingen' },
  { id: 'skjot', label: 'Skjøt' },
  { id: 'K2', label: 'K2' },
  { id: 'K3', label: 'K3' },
];

export function standardArbeid(klasse = '') {
  const sp = klasse === 'K2' || klasse === 'K3' ? klasse : 'ingen';
  return {
    vegg: { sparkling: sp, grunning: false, strok: 2 },
    tak: { sparkling: 'ingen', grunning: false, strok: 2 },
    lister: { strok: 0 },
    vinduer: { strok: 0 },
    dorer: { strok: 0 },
    // Overganger som sparkles i stedet for å dekkes med list.
    listefritt: { tak: false, hjorner: false, vinduer: false, dorer: false },
  };
}

export const MED_ALT = { vegg: true, tak: true, lister: true, vinduer: true, dorer: true };

export function tomKalkyle(klasse = '') {
  return { modus: 'timer', arbeid: standardArbeid(klasse), rom: [], tillegg: [], plan: null };
}

/* ---------- Tall ---------- */

export function tall(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : NaN;
  const v = parseFloat(String(s ?? '').replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}
const ellers = (v, std) => (Number.isFinite(v) ? v : std);
const rund = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/* ---------- Normalisering (lagret data er en ekstern grense) ---------- */

const bool = (v, std) => (typeof v === 'boolean' ? v : std);
const str = (v) => (v == null ? '' : String(v));

function rensFlate(f, std) {
  f = f && typeof f === 'object' ? f : {};
  return {
    sparkling: SPARKLING.some((s) => s.id === f.sparkling) ? f.sparkling : std.sparkling,
    grunning: bool(f.grunning, std.grunning),
    strok: Number.isInteger(f.strok) && f.strok >= 0 && f.strok <= 4 ? f.strok : std.strok,
  };
}

export function rensKalkyle(k, klasse = '') {
  const std = standardArbeid(klasse);
  if (!k || typeof k !== 'object') return null;
  const a = k.arbeid && typeof k.arbeid === 'object' ? k.arbeid : {};
  const strokBare = (x, s) => ({ strok: Number.isInteger(x?.strok) && x.strok >= 0 && x.strok <= 4 ? x.strok : s.strok });
  return {
    modus: k.modus === 'enhet' ? 'enhet' : 'timer',
    arbeid: {
      vegg: rensFlate(a.vegg, std.vegg),
      tak: rensFlate(a.tak, std.tak),
      lister: strokBare(a.lister, std.lister),
      vinduer: strokBare(a.vinduer, std.vinduer),
      dorer: strokBare(a.dorer, std.dorer),
      listefritt: Object.fromEntries(['tak', 'hjorner', 'vinduer', 'dorer'].map((x) => [x, !!(a.listefritt && a.listefritt[x] === true)])),
    },
    rom: Array.isArray(k.rom) ? k.rom.filter((r) => r && typeof r === 'object' && r.id).map((r) => ({
      id: String(r.id),
      navn: str(r.navn),
      lengde: str(r.lengde), bredde: str(r.bredde), hoyde: str(r.hoyde),
      gulv: Number.isFinite(r.gulv) ? r.gulv : null,
      omkrets: Number.isFinite(r.omkrets) ? r.omkrets : null,
      vegg: Number.isFinite(r.vegg) ? r.vegg : null,
      vinduer: str(r.vinduer), dorer: str(r.dorer),
      trapp: !!r.trapp,
      med: { ...MED_ALT, ...(r.med && typeof r.med === 'object' ? r.med : {}) },
      kilde: ['manuell', 'plan', 'ki', 'skann'].includes(r.kilde) ? r.kilde : 'manuell',
      polygon: Array.isArray(r.polygon) ? r.polygon.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) : null,
      tegning: r.tegning ? String(r.tegning) : null,
      skannplan: rensPlan(r.skannplan),
    })) : [],
    tillegg: Array.isArray(k.tillegg) ? k.tillegg.filter((t) => t && typeof t === 'object' && t.id).map((t) => ({
      id: String(t.id), tekst: str(t.tekst), timer: str(t.timer), kr: str(t.kr),
    })) : [],
    // Plantegningen det måles på: bilde-id og meter per bildepunkt.
    // skala er null til målestokken er satt.
    plan: k.plan && typeof k.plan === 'object' && k.plan.bilde
      ? { bilde: String(k.plan.bilde), skala: Number.isFinite(k.plan.skala) && k.plan.skala > 0 ? k.plan.skala : null } : null,
  };
}

/* ---------- Plan fra LiDAR-skanning ---------- */

const punkt = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null);
const malEllerNull = (v) => (Number.isFinite(v) && v > 0 ? v : null);
const linjer = (a) => (Array.isArray(a) ? a.map((l) => (l && punkt(l.a) && punkt(l.b)
  ? { a: punkt(l.a), b: punkt(l.b), bredde: malEllerNull(l.bredde), hoyde: malEllerNull(l.hoyde) } : null)).filter(Boolean) : []);

/** Plantegningen fra Romskanner, i meter: gulv (punkter), vegger, dører, vinduer, åpninger (linjer). */
export function rensPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const plan = {
    gulv: Array.isArray(p.gulv) ? p.gulv.map(punkt).filter(Boolean) : [],
    vegger: linjer(p.vegger), dorer: linjer(p.dorer), vinduer: linjer(p.vinduer), apninger: linjer(p.apninger),
    // Vegger utenfor rommet (sett gjennom åpen dør). Tegnes stiplet, regnes ikke med.
    utenfor: linjer(p.utenfor),
  };
  return plan.vegger.length ? plan : null;
}

/* ---------- Mengder per rom ---------- */

export const STANDARD_HOYDE = 2.4;

/** Arealet og omkretsen til en mangekant (koordinater i meter). */
export function polygonMal(punkter) {
  let a = 0, o = 0;
  for (let i = 0; i < punkter.length; i++) {
    const [x1, y1] = punkter[i];
    const [x2, y2] = punkter[(i + 1) % punkter.length];
    a += x1 * y2 - x2 * y1;
    o += Math.hypot(x2 - x1, y2 - y1);
  }
  return { areal: Math.abs(a) / 2, omkrets: o };
}

/** Mengdene for ett rom. ok:false når målene mangler. */
export function romMengder(rom) {
  const L = tall(rom.lengde), B = tall(rom.bredde);
  const H = ellers(tall(rom.hoyde), STANDARD_HOYDE);
  const gulv = Number.isFinite(rom.gulv) ? rom.gulv : (L > 0 && B > 0 ? L * B : NaN);
  const omkrets = Number.isFinite(rom.omkrets) ? rom.omkrets : (L > 0 && B > 0 ? 2 * (L + B) : NaN);
  const vinduer = Math.max(0, Math.round(ellers(tall(rom.vinduer), 0)));
  const dorer = Math.max(0, Math.round(ellers(tall(rom.dorer), 0)));
  if (!(gulv > 0) || !(omkrets > 0) || !(H > 0)) {
    return { ok: false, gulv: 0, tak: 0, vegg: 0, lister: 0, omkrets: 0, hoyde: H, vinduer, dorer };
  }
  const brutto = omkrets * H;
  // Fra LiDAR-skanning er veggarealet målt direkte, med vinduer og dører trukket fra.
  const vegg = Number.isFinite(rom.vegg) && rom.vegg > 0 ? rom.vegg : Math.max(0, brutto - vinduer * VINDU_M2 - dorer * DOR_M2);
  const lister = Math.max(0, omkrets - dorer * DOR_BREDDE);
  return { ok: true, gulv, tak: gulv, vegg, brutto, lister, omkrets, hoyde: H, vinduer, dorer };
}

/* ---------- Priser og normtall ---------- */

/** Brukerens priser over standardverdiene. lagret = { timepris, mva, paslag, normer: { id: {...} } } */
export function priser(lagret) {
  const p = lagret && typeof lagret === 'object' ? lagret : {};
  const normer = {};
  for (const n of NORMER) {
    const egen = p.normer && typeof p.normer === 'object' && p.normer[n.id] && typeof p.normer[n.id] === 'object' ? p.normer[n.id] : {};
    normer[n.id] = {
      ...n,
      timer: ellers(tall(egen.timer), n.timer),
      pris: ellers(tall(egen.pris), n.pris),
      forbruk: ellers(tall(egen.forbruk), n.forbruk ?? 0),
      materialpris: ellers(tall(egen.materialpris), n.materialpris ?? 0),
    };
  }
  return {
    timepris: ellers(tall(p.timepris), STANDARD_PRISER.timepris),
    mva: ellers(tall(p.mva), STANDARD_PRISER.mva),
    paslag: ellers(tall(p.paslag), STANDARD_PRISER.paslag),
    trappFaktor: ellers(tall(p.trappFaktor), STANDARD_PRISER.trappFaktor),
    normer,
  };
}

/* ---------- Selve beregningen ---------- */

/**
 * Lager linjene (én per operasjon) og summene.
 * Returnerer { linjer, sum: { timer, arbeid, materialer, eksMva, mva, inklMva }, mengder, manglerMal }
 * Hver linje: { id, navn, detalj, mengde, enhet, timer, arbeid, materialer }
 */
export function beregn(kalkyle, lagredePriser, { medFelles = true } = {}) {
  const P = priser(lagredePriser);
  const k = kalkyle || tomKalkyle();
  const a = k.arbeid || standardArbeid();
  const linjer = [];
  const mengder = { vegg: 0, tak: 0, lister: 0, vinduer: 0, dorer: 0, gulv: 0, rom: 0, taklinje: 0, hjorner: 0 };
  // Trappehull tar lengre tid per m²: samme mengde, men timene ganges med faktoren.
  const flater = { vegg: [], tak: [], taklinje: [], hjorner: [] };
  let manglerMal = 0;

  for (const rom of k.rom || []) {
    const m = romMengder(rom);
    if (!m.ok) { manglerMal++; continue; }
    const med = { ...MED_ALT, ...(rom.med || {}) };
    mengder.rom++;
    mengder.gulv += m.gulv;
    const faktor = rom.trapp ? P.trappFaktor : 1;
    if (med.vegg) { mengder.vegg += m.vegg; flater.vegg.push({ m2: m.vegg, faktor }); }
    // Overgangen tak/vegg følger omkretsen. Hjørnene: antall hjørner × takhøyde (4 i et firkantet rom).
    if (med.vegg || med.tak) { mengder.taklinje += m.omkrets; flater.taklinje.push({ m2: m.omkrets, faktor }); }
    if (med.vegg) {
      const hjorner = (Array.isArray(rom.polygon) && rom.polygon.length >= 3 ? rom.polygon.length : 4) * m.hoyde;
      mengder.hjorner += hjorner; flater.hjorner.push({ m2: hjorner, faktor });
    }
    if (med.tak) { mengder.tak += m.tak; flater.tak.push({ m2: m.tak, faktor }); }
    if (med.lister) mengder.lister += m.lister;
    if (med.vinduer) mengder.vinduer += m.vinduer;
    if (med.dorer) mengder.dorer += m.dorer;
  }

  const leggTil = (id, mengde, { detalj = '', faktorTimer = null, navn = null } = {}) => {
    const n = P.normer[id];
    if (!n || !(mengde > 0)) return;
    const timer = faktorTimer != null ? faktorTimer * n.timer : mengde * n.timer;
    const arbeid = k.modus === 'enhet' ? mengde * n.pris : timer * P.timepris;
    const materialer = mengde * n.forbruk * n.materialpris * (1 + P.paslag / 100);
    linjer.push({ id, navn: navn || n.navn, detalj, mengde, enhet: n.enhet, timer, arbeid, materialer });
  };
  // Timer for en flate der noen rom er trappehull: Σ m² × faktor.
  const vektet = (liste) => liste.reduce((s, x) => s + x.m2 * x.faktor, 0);

  // Oppstart per jobb, rigging per rom, tildekking av gulvet og stige/stillas per trappehull.
  if (medFelles && mengder.rom > 0) leggTil('jobb-oppstart', 1, { detalj: 'Per jobb' });
  leggTil('rigging-rom', mengder.rom, { detalj: mengder.rom + ' rom' });
  leggTil('dekking-gulv', mengder.gulv);
  const trapper = (k.rom || []).filter((r) => r.trapp && romMengder(r).ok).length;
  leggTil('rigging-trapp', trapper, { detalj: trapper + ' trappehull' });

  for (const flate of ['vegg', 'tak']) {
    const f = a[flate];
    const m2 = mengder[flate];
    if (!(m2 > 0)) continue;
    const v = vektet(flater[flate]);
    const ord = flate === 'vegg' ? 'vegg' : 'tak';
    // Sparkletallene fra tariffen inkluderer sliping.
    if (f.sparkling !== 'ingen') leggTil(flate + '-sparkling-' + f.sparkling.toLowerCase(), m2, { faktorTimer: v });
    if (f.grunning || f.sparkling !== 'ingen') leggTil(flate + '-grunning', m2, { faktorTimer: v });
    // Første strøk tar lengre tid og bruker mer maling enn de neste.
    for (let s = 1; s <= f.strok; s++) {
      leggTil(flate + (s === 1 ? '-maling-strok1' : '-maling-strok'), m2, { faktorTimer: v, navn: 'Maling ' + ord + ', strøk ' + s });
    }
  }
  const lf = a.listefritt || {};
  if (lf.tak) leggTil('listefritt-tak', mengder.taklinje, { faktorTimer: vektet(flater.taklinje) });
  if (lf.hjorner) leggTil('listefritt-hjorne', mengder.hjorner, { faktorTimer: vektet(flater.hjorner) });
  if (lf.vinduer) leggTil('listefritt-vindu', mengder.vinduer);
  if (lf.dorer) leggTil('listefritt-dor', mengder.dorer);

  for (let s = 1; s <= (a.lister?.strok || 0); s++) leggTil('lister-strok', mengder.lister, { navn: 'Lister, strøk ' + s });
  for (let s = 1; s <= (a.vinduer?.strok || 0); s++) leggTil('vindu-strok', mengder.vinduer, { navn: 'Vinduer, strøk ' + s });
  for (let s = 1; s <= (a.dorer?.strok || 0); s++) leggTil('dor-strok', mengder.dorer, { navn: 'Dører, strøk ' + s });

  for (const t of medFelles ? k.tillegg || [] : []) {
    const timer = Math.max(0, ellers(tall(t.timer), 0));
    const kr = Math.max(0, ellers(tall(t.kr), 0));
    if (!timer && !kr) continue;
    linjer.push({ id: 'tillegg-' + t.id, navn: t.tekst || 'Tillegg', detalj: '', mengde: 1, enhet: 'stk', timer, arbeid: timer * P.timepris + kr, materialer: 0, tillegg: true });
  }

  const timer = linjer.reduce((s, l) => s + l.timer, 0);
  const arbeid = linjer.reduce((s, l) => s + l.arbeid, 0);
  const materialer = linjer.reduce((s, l) => s + l.materialer, 0);
  // Summene regnes av avrundede deler, så tallene på skjermen alltid går opp.
  const arbeidKr = Math.round(arbeid), materialKr = Math.round(materialer);
  const eksMva = arbeidKr + materialKr;
  const mva = Math.round(eksMva * P.mva / 100);
  return {
    linjer: linjer.map((l) => ({ ...l, timer: rund(l.timer), arbeid: Math.round(l.arbeid), materialer: Math.round(l.materialer) })),
    sum: { timer: rund(timer, 1), arbeid: arbeidKr, materialer: materialKr, eksMva, mva, inklMva: eksMva + mva },
    mengder: Object.fromEntries(Object.entries(mengder).map(([k2, v]) => [k2, rund(v, 1)])),
    manglerMal,
    timepris: P.timepris,
    modus: k.modus,
  };
}

/**
 * Pris og timer for hvert rom for seg, og det som er felles for jobben
 * (oppstart og tillegg). Rommene pluss det felles blir summen for jobben.
 */
export function perRom(kalkyle, lagredePriser) {
  const k = kalkyle || tomKalkyle();
  const rom = (k.rom || []).map((r) => {
    const b = beregn({ ...k, rom: [r] }, lagredePriser, { medFelles: false });
    return { id: r.id, navn: r.navn || 'Rom', ok: romMengder(r).ok, sum: b.sum };
  });
  const alt = beregn(k, lagredePriser);
  const sumRom = rom.reduce((s, r) => ({ timer: s.timer + r.sum.timer, eksMva: s.eksMva + r.sum.eksMva }), { timer: 0, eksMva: 0 });
  // Det som ikke hører til ett rom: oppstart, tillegg, og øreavrunding
  const felles = { timer: rund(alt.sum.timer - sumRom.timer, 1), eksMva: alt.sum.eksMva - sumRom.eksMva };
  return { rom, felles };
}

/** Arbeidsdager med en gitt dagslengde, avrundet opp til halve dager. */
export function arbeidsdager(timer, timerPerDag = 7.5) {
  return Math.ceil((timer / timerPerDag) * 2) / 2;
}

/** Sparkelrunder som hver trenger et døgn tørk før neste steg. */
export const SPARKEL_RUNDER = { skjot: 2, k2: 2, k3: 3, listefritt: 2, 'listefritt-vindu': 3 };

/**
 * Hvor mange dager jobben tar med tørketid for sparkel. Hver sparkelrunde tar minst
 * en dag, fordi sparkelen må tørke et døgn før neste runde, sliping og maling.
 * Resten av arbeidet (grunning, maling, rigging) kommer i tillegg.
 */
export function dagerMedTork(resultat, timerPerDag = 7.5) {
  const b = resultat || { linjer: [], sum: { timer: 0 } };
  let runder = 0, sparkel = 0;
  for (const l of b.linjer) {
    const m = /-sparkling-(skjot|k2|k3)$/.exec(l.id);
    // Listefritt vindu: tre strøk sparkel oppå PVC-hjørnelistene i smygen
    const r = m ? SPARKEL_RUNDER[m[1]] : SPARKEL_RUNDER[l.id] || (l.id.startsWith('listefritt-') ? SPARKEL_RUNDER.listefritt : 0);
    if (!r || !(l.timer > 0)) continue;
    runder = Math.max(runder, r);
    sparkel += l.timer;
  }
  const uten = arbeidsdager(b.sum.timer, timerPerDag);
  if (!runder) return { dager: uten, arbeidsdager: uten, runder: 0 };
  const perRunde = Math.max(1, Math.ceil(sparkel / runder / timerPerDag));
  const dager = runder * perRunde + arbeidsdager(Math.max(0, b.sum.timer - sparkel), timerPerDag);
  return { dager: Math.max(dager, uten), arbeidsdager: uten, runder };
}

/** Leser eksporten fra Romskanner-appen. Returnerer rom uten id, eller kaster med norsk melding. */
export function fraSkanning(tekst) {
  let d;
  try { d = JSON.parse(String(tekst || '').trim()); } catch { throw new Error('Dette ser ikke ut som en skanning fra Romskanner.'); }
  if (!d || d.format !== 'malerguiden-rom' || !Array.isArray(d.rom)) throw new Error('Dette ser ikke ut som en skanning fra Romskanner.');
  const tallEllerNull = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  const heltall = (v) => (Number.isInteger(v) && v >= 0 ? String(v) : '');
  return d.rom.filter((r) => r && typeof r === 'object').map((r) => ({
    navn: String(r.navn || 'Rom').slice(0, 40),
    lengde: '', bredde: '',
    hoyde: tallEllerNull(r.takhoyde) ? String(Math.round(r.takhoyde * 100) / 100).replace('.', ',') : '',
    gulv: tallEllerNull(r.gulv),
    omkrets: tallEllerNull(r.omkrets),
    vegg: tallEllerNull(r.vegg),
    vinduer: heltall(r.vinduer),
    dorer: heltall(r.dorer),
    kilde: 'skann',
    skannplan: rensPlan(r.plan),
  })).filter((r) => r.gulv && r.omkrets);
}
