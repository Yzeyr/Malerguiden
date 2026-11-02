/* Prisberegning: mengder fra rommene → timer, arbeid, materialer og pris.

   Ren logikk uten DOM, så alt kan testes. Formen som lagres på jobben:

   job.kalkyle = {
     modus: 'timer' | 'enhet',          // timer × timepris, eller enhetspriser
     arbeid: {                           // hva som gjøres, felles for alle rom
       vegg:  { sparkling: 'ingen'|'K1'|'K2'|'K3', grunning: bool, strok: 0-3 },  // estetisk klasse, NS 3420-T
       tak:   { sparkling, grunning, strok },
       lister:{ strok },  vinduer: { strok },  dorer: { strok },
     },
     rom: [{ id, navn, lengde, bredde, hoyde,       // tekst, som i skjemaene
             gulv, omkrets,                           // tall fra plantegning (overstyrer L × B)
             vinduer, dorer,                          // antall (tekst)
             trapp: bool,                             // trappehull: høye flater, stillas
             mobler: bool,                            // møbler må flyttes og dekkes til
             med: { vegg, tak, lister, vinduer, dorer, sparkling, dekking, gulvbelegg }, // av/på per rom
             kilde: 'manuell'|'plan'|'ki'|'skann', polygon? }],
     tillegg: [{ id, tekst, timer, kr }],
   }
*/

import { NORMER, STANDARD_PRISER, MED } from './data/normer.js';
import { spannForslag } from './calc.js';

export const DOR_M2 = 1.6;      // samme som romkalkulatoren
export const VINDU_M2 = 1.5;
// Vinduet normtallet «vindu med karm og foring, per stk» regnes for: 1,2 × 1,25 m (1,5 m²),
// altså 4,9 m karm og foring rundt. Etter størrelse teller et vindu like mange slike som
// omkretsen tilsier: et vindu på 2,4 × 1,25 m er 1,5 standardvinduer.
export const STANDARD_VINDU_OMKRETS = 2 * (1.2 + 1.25);
export const DOR_BREDDE = 0.9;  // trekkes fra gulvlist

/* Estetiske klasser i NS 3420-T. K1: funksjonell, skjøter og hull tettes (bod, teknisk rom).
   K2: skjøt- og flekksparklet, ikke helsparklet (vanlig standard). K3: helsparklet, krever
   forsenkede platekanter, anbefalt i stue, kjøkken, soverom og gang. */
export const SPARKLING = [
  { id: 'ingen', label: 'Ingen' },
  { id: 'K1', label: 'K1' },
  { id: 'K2', label: 'K2' },
  { id: 'K3', label: 'K3' },
];
// Før het K2-arbeidet «skjøt» (strimling, fylling, flekk og sliping).
const GAMLE_SPARKLING = { skjot: 'K2' };

export function standardArbeid(klasse = '') {
  const sp = ['K1', 'K2', 'K3'].includes(klasse) ? klasse : 'ingen';
  return {
    vegg: { sparkling: sp, grunning: false, strok: 2 },
    tak: { sparkling: 'ingen', grunning: false, strok: 2 },
    lister: { strok: 0 },
    vinduer: { strok: 0, etterStorrelse: false },
    dorer: { strok: 0 },
    // Overganger som sparkles i stedet for å dekkes med list.
    listefritt: { tak: false, hjorner: false, vinduer: false, dorer: false },
    // Ytterhjørner: hjørnelist og sparkel når veggene sparkles. Kan slås av (f.eks. ingen ytterhjørner).
    ytterhjorner: true,
  };
}

export const MED_ALT = { vegg: true, tak: true, lister: true, vinduer: true, dorer: true, sparkling: true, dekking: true, gulvbelegg: false };

export function tomKalkyle(klasse = '') {
  return { modus: 'timer', arbeid: standardArbeid(klasse), rom: [], tillegg: [], planer: [], justering: {} };
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
    sparkling: SPARKLING.some((s) => s.id === f.sparkling) ? f.sparkling : GAMLE_SPARKLING[f.sparkling] || std.sparkling,
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
      vinduer: { ...strokBare(a.vinduer, std.vinduer), etterStorrelse: a.vinduer?.etterStorrelse === true },
      dorer: strokBare(a.dorer, std.dorer),
      listefritt: Object.fromEntries(['tak', 'hjorner', 'vinduer', 'dorer'].map((x) => [x, !!(a.listefritt && a.listefritt[x] === true)])),
      ytterhjorner: a.ytterhjorner !== false,
    },
    rom: Array.isArray(k.rom) ? k.rom.filter((r) => r && typeof r === 'object' && r.id).map((r) => ({
      id: String(r.id),
      navn: str(r.navn),
      lengde: str(r.lengde), bredde: str(r.bredde), hoyde: str(r.hoyde),
      gulv: Number.isFinite(r.gulv) ? r.gulv : null,
      omkrets: Number.isFinite(r.omkrets) ? r.omkrets : null,
      vegg: Number.isFinite(r.vegg) ? r.vegg : null,
      vinduer: str(r.vinduer), dorer: str(r.dorer),
      ytterhjorner: str(r.ytterhjorner), // tomt: tell fra formen på rommet
      trapp: !!r.trapp,
      mobler: r.mobler === true,
      med: { ...MED_ALT, ...(r.med && typeof r.med === 'object' ? r.med : {}) },
      kilde: ['manuell', 'plan', 'ki', 'skann'].includes(r.kilde) ? r.kilde : 'manuell',
      polygon: Array.isArray(r.polygon) ? r.polygon.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) : null,
      tegning: r.tegning ? String(r.tegning) : null,
      skannplan: rensPlan(r.skannplan),
      justering: rensJustering(r.justering),
      // Steg som er gjort i rommet: { strimling: true, 'grunning-tak': true, … }
      gjort: rensGjort(r.gjort),
      etasje: str(r.etasje).trim().slice(0, 24),
    })) : [],
    tillegg: Array.isArray(k.tillegg) ? k.tillegg.filter((t) => t && typeof t === 'object' && t.id).map((t) => ({
      id: String(t.id), tekst: str(t.tekst), timer: str(t.timer), kr: str(t.kr),
    })) : [],
    planer: rensPlaner(k),
    justering: rensJustering(k.justering),
  };
}

/* Justeringer per linje for denne jobben: { [nokkel]: { av, mengde, timer, kr } } (tekst som i skjemaene). */
function rensJustering(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
  const ut = {};
  for (const [nokkel, v] of Object.entries(j)) {
    if (!v || typeof v !== 'object' || nokkel.length > 120) continue;
    const r = { av: v.av === true, mengde: str(v.mengde).slice(0, 12), timer: str(v.timer).slice(0, 12), kr: str(v.kr).slice(0, 12) };
    if (r.av || r.mengde || r.timer || r.kr) ut[nokkel] = r;
  }
  return ut;
}

/* Plantegningene det måles på, én per etasje: bilde-id, navn og meter per bildepunkt
   (skala er null til målestokken er satt). Før hadde en jobb bare én, i `plan`. */
function rensGjort(g) {
  if (!g || typeof g !== 'object') return {};
  return Object.fromEntries(Object.entries(g).filter(([k, v]) => v === true && STEG.some((s) => s.id === k)));
}

function rensPlaner(k) {
  const liste = Array.isArray(k.planer) ? k.planer : k.plan ? [{ navn: '1. etasje', ...k.plan }] : [];
  const sett = new Set();
  return liste.filter((p) => p && typeof p === 'object' && p.bilde && !sett.has(String(p.bilde)) && sett.add(String(p.bilde))).map((p, i) => ({
    bilde: String(p.bilde),
    navn: str(p.navn).trim().slice(0, 40) || (i + 1) + '. etasje',
    skala: Number.isFinite(p.skala) && p.skala > 0 ? p.skala : null,
  }));
}

/* ---------- Plan fra LiDAR-skanning ---------- */

const punkt = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null);
const malEllerNull = (v) => (Number.isFinite(v) && v > 0 ? v : null);
// fast: målet er skrevet inn for hånd og går foran skanningen. sider: for vegger inne i rommet.
const linjer = (a) => (Array.isArray(a) ? a.map((l) => (l && punkt(l.a) && punkt(l.b)
  ? { a: punkt(l.a), b: punkt(l.b), bredde: malEllerNull(l.bredde), hoyde: malEllerNull(l.hoyde),
    ...(l.fast === true ? { fast: true } : {}), ...([0, 1, 2].includes(l.sider) ? { sider: l.sider } : {}) } : null)).filter(Boolean) : []);

/** Ligger midten av linjen inne på gulvet? (punkt i mangekant) */
export function inniGulv(l, gulv) {
  const x = (l.a.x + l.b.x) / 2, y = (l.a.y + l.b.y) / 2;
  let inne = false;
  for (let i = 0, j = gulv.length - 1; i < gulv.length; j = i++) {
    const a = gulv[i], b = gulv[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inne = !inne;
  }
  return inne;
}

/** Plantegningen fra Romskanner, i meter: gulv (punkter), vegger, dører, vinduer, åpninger (linjer). */
export function rensPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const gulv = Array.isArray(p.gulv) ? p.gulv.map(punkt).filter(Boolean) : [];
  // Vegger utenfor rommet (sett gjennom åpen dør). Tegnes stiplet, regnes ikke med.
  let utenfor = linjer(p.utenfor);
  // Vegger inne i rommet (skillevegger, vegger som stikker inn): begge sider males, med mindre
  // annet er valgt (sider 0–2). Romskanner la dem før blant «utenfor»; de flyttes hit.
  let inne = linjer(p.inne).map((l) => ({ ...l, sider: l.sider ?? 2 }));
  if (gulv.length >= 3) {
    const flytt = utenfor.filter((l) => inniGulv(l, gulv));
    if (flytt.length) {
      inne = [...inne, ...flytt.map((l) => ({ ...l, sider: 2 }))];
      utenfor = utenfor.filter((l) => !inniGulv(l, gulv));
    }
  }
  const plan = { gulv, vegger: linjer(p.vegger), dorer: linjer(p.dorer), vinduer: linjer(p.vinduer), apninger: linjer(p.apninger), utenfor, inne };
  return plan.vegger.length ? plan : null;
}

const linjelengde = (l) => l.bredde || Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

/**
 * Like vinduer, like mål. Skanneren måler samme vindustype ulikt (glasset én gang, foringen
 * neste gang). Vinduer i samme rom med høyst `toleranse` meter forskjell i både bredde og høyde
 * regnes som like, og alle får målet til det største: til veggarealet er det ytterkanten som
 * teller. Et mål skrevet inn for hånd (fast) går foran. Returnerer ny liste.
 */
export function likeVinduer(vinduer, toleranse = 0.15) {
  const v = vinduer.map((l) => ({ ...l }));
  const harMal = (l) => l.bredde > 0 && l.hoyde > 0;
  const gruppe = v.map((_, i) => i);
  const rot = (i) => (gruppe[i] === i ? i : (gruppe[i] = rot(gruppe[i])));
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    if (!harMal(v[i]) || !harMal(v[j])) continue;
    if (Math.abs(v[i].bredde - v[j].bredde) <= toleranse && Math.abs(v[i].hoyde - v[j].hoyde) <= toleranse) gruppe[rot(j)] = rot(i);
  }
  const grupper = new Map();
  v.forEach((l, i) => { if (harMal(l)) { const r = rot(i); if (!grupper.has(r)) grupper.set(r, []); grupper.get(r).push(i); } });
  for (const ider of grupper.values()) {
    if (ider.length < 2) continue;
    const faste = ider.filter((i) => v[i].fast);
    const kilde = (faste.length ? faste : ider).reduce((a, b) => (v[b].bredde * v[b].hoyde > v[a].bredde * v[a].hoyde ? b : a));
    for (const i of ider) if (!v[i].fast) { v[i].bredde = v[kilde].bredde; v[i].hoyde = v[kilde].hoyde; }
  }
  return v;
}

/** Arealet vinduene tar av veggen (m²). Gjelder også dører og åpninger. */
export const vindusareal = (vinduer) => (vinduer || []).reduce((s, l) => s + (l.bredde > 0 && l.hoyde > 0 ? l.bredde * l.hoyde : 0), 0);

/**
 * Veggen i et skannet rom, delt opp som et regnestykke: alle vegger, minus vinduer, dører og
 * åpninger, gir veggen som males. Skilleveggene (inne) er med i både totalen og det som males.
 * null når rommet ikke er skannet.
 */
export function veggRegnestykke(rom) {
  const p = rom?.skannplan;
  if (!p || !(Number.isFinite(rom.vegg) && rom.vegg > 0)) return null;
  const m = romMengder(rom);
  const vinduer = vindusareal(p.vinduer), dorer = vindusareal(p.dorer), apninger = vindusareal(p.apninger);
  const males = m.vegg;
  return { total: males + vinduer + dorer + apninger, vinduer, dorer, apninger, males, inne: m.inneVegg || 0 };
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
/**
 * Ytterhjørner i et rom med kjent form: hjørnene som stikker inn i rommet (innover-knekk i
 * omrisset). Et rektangulært rom har ingen; et L-formet rom har ett. Punkter som [x, y] eller {x, y}.
 */
export function ytterhjornerAuto(poly) {
  const p = (poly || []).map((q) => (Array.isArray(q) ? q : [q.x, q.y])).filter((q) => q.every(Number.isFinite));
  if (p.length < 4) return 0;
  let areal = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; areal += x1 * y2 - x2 * y1; }
  const retning = Math.sign(areal);
  // Små hakk (rester av en døråpning, en smyg) teller ikke: begge veggene må være minst
  // 2,5 % av omkretsen, som for et pipeløp eller en vegg som stikker fram.
  let omkrets = 0;
  for (let i = 0; i < p.length; i++) omkrets += Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1]);
  const kortest = omkrets * 0.025;
  let n = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < kortest || lv < kortest) continue;
    const knekk = (ux * vy - uy * vx) / (lu * lv); // sinus til vinkelen
    if (knekk * retning < -0.3) n++; // bøyer motsatt vei av rommet: et hjørne som stikker inn
  }
  return n;
}

/**
 * Innerhjørner i et rom med kjent form: hjørnene der to vegger møtes inn mot rommet (de som
 * sparkles når rommet er listefritt). Ytterhjørnene får hjørnelist og regnes for seg.
 * Samme regel for små hakk som ytterhjornerAuto. Et rektangel har 4, et L-formet rom 5.
 */
export function innerhjornerAuto(poly) {
  const p = (poly || []).map((q) => (Array.isArray(q) ? q : [q.x, q.y])).filter((q) => q.every(Number.isFinite));
  if (p.length < 3) return 4;
  let areal = 0, omkrets = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    areal += x1 * y2 - x2 * y1;
    omkrets += Math.hypot(x2 - x1, y2 - y1);
  }
  const retning = Math.sign(areal), kortest = omkrets * 0.025;
  let n = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < kortest || lv < kortest) continue;
    if (((ux * vy - uy * vx) / (lu * lv)) * retning > 0.3) n++; // bøyer samme vei som rommet
  }
  return n;
}

export function romMengder(rom) {
  const L = tall(rom.lengde), B = tall(rom.bredde);
  const H = ellers(tall(rom.hoyde), STANDARD_HOYDE);
  const gulv = Number.isFinite(rom.gulv) ? rom.gulv : (L > 0 && B > 0 ? L * B : NaN);
  const omkrets = Number.isFinite(rom.omkrets) ? rom.omkrets : (L > 0 && B > 0 ? 2 * (L + B) : NaN);
  const vinduer = Math.max(0, Math.round(ellers(tall(rom.vinduer), 0)));
  const dorer = Math.max(0, Math.round(ellers(tall(rom.dorer), 0)));
  if (!(gulv > 0) || !(omkrets > 0) || !(H > 0)) {
    return { ok: false, gulv: 0, tak: 0, vegg: 0, lister: 0, omkrets: 0, hoyde: H, vinduer, dorer, ...vindusStorrelse(rom, vinduer) };
  }
  const brutto = omkrets * H;
  // Vegger inne i rommet (skillevegger) kommer i tillegg: én eller begge sider, med lister langs.
  const inne = rom.skannplan?.inne || [];
  const inneVegg = inne.reduce((s, l) => s + (l.sider || 0) * linjelengde(l) * (l.hoyde || H), 0);
  const inneLister = inne.reduce((s, l) => s + (l.sider || 0) * linjelengde(l), 0);
  // Fra LiDAR-skanning er veggarealet målt direkte, med vinduer og dører trukket fra.
  const vegg = (Number.isFinite(rom.vegg) && rom.vegg > 0 ? rom.vegg : Math.max(0, brutto - vinduer * VINDU_M2 - dorer * DOR_M2)) + inneVegg;
  // Ingen list der det er dør eller åpning. Fra skanningen er bredden kjent; ellers 0,9 m per dør.
  const p = rom.skannplan;
  const planDorer = p && Array.isArray(p.dorer) && p.dorer.length === dorer && p.dorer.every((l) => l.bredde > 0) ? p.dorer : null;
  const uten = planDorer
    ? planDorer.reduce((s, l) => s + l.bredde, 0) + (p.apninger || []).reduce((s, l) => s + (l.bredde > 0 ? l.bredde : 0), 0)
    : dorer * DOR_BREDDE;
  const lister = Math.max(0, omkrets - uten) + inneLister;
  // Ytterhjørner: det som er skrevet inn, ellers talt fra formen på rommet (plantegning eller skanning)
  const skrevet = tall(rom.ytterhjorner);
  const ytterhjorner = Number.isFinite(skrevet) ? Math.max(0, Math.round(skrevet)) : ytterhjornerAuto(rom.polygon || rom.skannplan?.gulv);
  // Innerhjørner: fra formen (tegning eller skanning), ellers 4 pluss ett per ytterhjørne (rette
  // vinkler). En vegg inne i rommet som males, gir to innerhjørner der den møter veggen.
  const form = Array.isArray(rom.polygon) && rom.polygon.length >= 3 ? rom.polygon : (rom.skannplan?.gulv?.length >= 3 ? rom.skannplan.gulv : null);
  const innerhjorner = (form ? innerhjornerAuto(form) : 4 + ytterhjorner) + 2 * inne.filter((l) => (l.sider || 0) > 0).length;
  return { ok: true, gulv, tak: gulv, vegg, brutto, lister, omkrets, hoyde: H, vinduer, dorer, ytterhjorner, ytterLm: ytterhjorner * H, innerhjorner, inneVegg, ...vindusStorrelse(rom, vinduer) };
}

/**
 * Vinduene etter størrelse: løpemeter karm og foring (omkretsen av vinduene med mål), og hvor
 * mange standardvinduer det tilsvarer. Vinduer uten mål teller som ett standardvindu hver.
 */
export function vindusStorrelse(rom, antall) {
  const medMal = (rom.skannplan?.vinduer || []).filter((l) => l.bredde > 0 && l.hoyde > 0).slice(0, antall);
  const vindusLm = medMal.reduce((s, l) => s + 2 * (l.bredde + l.hoyde), 0);
  const vinduerEkv = vindusLm / STANDARD_VINDU_OMKRETS + Math.max(0, antall - medMal.length);
  return { vindusLm: rund(vindusLm, 2), vinduerEkv: rund(vinduerEkv, 2), vinduerMedMal: medMal.length };
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
/**
 * Pris og timer for kalkylen. medJustering: true (alle justeringer for jobben), 'bareUt' (bare linjer
 * som er tatt ut) eller false. Justeringer per rom (rom.justering) regnes med så lenge medJustering
 * ikke er false. raa: tallene på linjene avrundes ikke (brukes internt).
 */
export function beregn(kalkyle, lagredePriser, { medFelles = true, medJustering = true, medRomJustering = medJustering !== false, raa = false } = {}) {
  const P = priser(lagredePriser);
  const k = kalkyle || tomKalkyle();
  const a = k.arbeid || standardArbeid();
  const linjer = [];
  const mengder = { vindusLm: 0, vinduerEkv: 0, vinduerMedMal: 0, vegg: 0, tak: 0, lister: 0, vinduer: 0, dorer: 0, gulv: 0, rom: 0, taklinje: 0, hjorner: 0, veggSparkles: 0, takSparkles: 0, dekking: 0, gulvbelegg: 0, ytter: 0 };
  // Trappehull tar lengre tid per m²: samme mengde, men timene ganges med faktoren.
  const flater = { vegg: [], tak: [], taklinje: [], hjorner: [], veggSparkles: [], takSparkles: [], ytter: [] };
  let manglerMal = 0;

  for (const rom of k.rom || []) {
    const m = romMengder(rom);
    if (!m.ok) { manglerMal++; continue; }
    const med = { ...MED_ALT, ...(rom.med || {}) };
    mengder.rom++;
    mengder.gulv += m.gulv;
    // Tildekking kan slås av per rom (betonggulv, eller gulvet skal byttes). Gulvbelegg hukes på per rom.
    if (med.dekking) mengder.dekking += m.gulv;
    if (med.gulvbelegg) mengder.gulvbelegg += m.gulv;
    const faktor = rom.trapp ? P.trappFaktor : 1;
    if (med.vegg) { mengder.vegg += m.vegg; flater.vegg.push({ m2: m.vegg, faktor }); }
    // Rom der sparkling er huket av (står det av, males rommet bare)
    if (med.vegg && med.sparkling) {
      mengder.veggSparkles += m.vegg; flater.veggSparkles.push({ m2: m.vegg, faktor });
      if (m.ytterLm > 0) { mengder.ytter += m.ytterLm; flater.ytter.push({ m2: m.ytterLm, faktor }); }
    }
    if (med.tak && med.sparkling) { mengder.takSparkles += m.tak; flater.takSparkles.push({ m2: m.tak, faktor }); }
    // Overgangen tak/vegg følger omkretsen. Hjørnene: innerhjørner × takhøyde (4 i et firkantet rom).
    if (med.vegg || med.tak) { mengder.taklinje += m.omkrets; flater.taklinje.push({ m2: m.omkrets, faktor }); }
    if (med.vegg) {
      const hjorner = m.innerhjorner * m.hoyde;
      mengder.hjorner += hjorner; flater.hjorner.push({ m2: hjorner, faktor });
    }
    if (med.tak) { mengder.tak += m.tak; flater.tak.push({ m2: m.tak, faktor }); }
    if (med.lister) mengder.lister += m.lister;
    if (med.vinduer) { mengder.vinduer += m.vinduer; mengder.vindusLm += m.vindusLm || 0; mengder.vinduerEkv += m.vinduerEkv ?? m.vinduer; mengder.vinduerMedMal += m.vinduerMedMal || 0; }
    if (med.dorer) mengder.dorer += m.dorer;
  }

  // Justeringer for denne jobben: linjer som er tatt ut, og egen mengde, timer eller kroner.
  const justering = (medJustering && k.justering) || {};
  const utelatt = [];

  // Justeringer for ett rom: forskjellen mellom rommet regnet med og uten justeringene
  // legges på linjene for jobben. Justeringene for hele jobben gjelder til slutt, oppå dette.
  const romDelta = {};
  const utelattRom = [];
  if (medRomJustering) {
    for (const rom of k.rom || []) {
      const rj = rom.justering;
      if (!rj || typeof rj !== 'object' || !Object.keys(rj).length || !romMengder(rom).ok) continue;
      const en = { ...k, rom: [rom], tillegg: [] };
      const opt = { medFelles: false, medRomJustering: false, raa: true };
      const uten = beregn({ ...en, justering: {} }, lagredePriser, { ...opt, medJustering: false });
      const med = beregn({ ...en, justering: rj }, lagredePriser, { ...opt, medJustering: true });
      for (const nokkel of Object.keys(rj)) {
        const u = uten.linjer.find((l) => l.nokkel === nokkel);
        if (!u) continue;
        const m = med.linjer.find((l) => l.nokkel === nokkel) || {};
        const d = romDelta[nokkel] || (romDelta[nokkel] = { mengde: 0, timer: 0, arbeid: 0, materialer: 0, forbruk: 0 });
        for (const f of Object.keys(d)) d[f] += (m[f] || 0) - (u[f] || 0);
      }
      for (const x of med.utelatt) utelattRom.push({ romId: rom.id, ...x });
    }
  }

  const leggTil = (id, mengde, { detalj = '', faktorTimer = null, navn = null } = {}) => {
    const n = P.normer[id];
    if (!n || !(mengde > 0)) return;
    const nokkel = navn ? id + ':' + navn : id;
    const j = justering[nokkel];
    if (j && j.av) { utelatt.push({ nokkel, navn: navn || n.navn }); return; }
    const enhet = k.modus === 'enhet';
    let timer = faktorTimer != null ? faktorTimer * n.timer : mengde * n.timer;
    // Enhetspris: trappehull o.l. med påslag (faktorTimer) gir samme påslag på prisen
    const faktor = faktorTimer != null ? faktorTimer / mengde : 1;
    let arbeid = enhet ? mengde * n.pris * faktor : timer * P.timepris;
    let materialer = mengde * n.forbruk * n.materialpris * (1 + P.paslag / 100);
    let forbruk = mengde * (n.forbruk || 0);
    const d = romDelta[nokkel];
    if (d) {
      mengde += d.mengde; timer += d.timer; arbeid += d.arbeid; materialer += d.materialer; forbruk += d.forbruk;
      // Tatt ut i alle rommene der linjen var med
      if (!(mengde > 1e-9) && !(timer > 1e-9) && !(Math.abs(arbeid) >= 0.5)) return;
    }
    const beregnet = mengde;
    const egenMengde = medJustering === true && j ? tall(j.mengde) : NaN;
    if (egenMengde >= 0) {
      const s = beregnet > 0 ? egenMengde / beregnet : 0;
      timer = beregnet > 0 ? timer * s : egenMengde * n.timer;
      arbeid = beregnet > 0 ? arbeid * s : (enhet ? egenMengde * n.pris : timer * P.timepris);
      materialer = egenMengde * n.forbruk * n.materialpris * (1 + P.paslag / 100);
      forbruk = egenMengde * (n.forbruk || 0);
      mengde = egenMengde;
    }
    const egneTimer = medJustering === true && j ? tall(j.timer) : NaN;
    if (egneTimer >= 0) { timer = egneTimer; if (!enhet) arbeid = timer * P.timepris; }
    const egneKr = medJustering === true && j ? tall(j.kr) : NaN;
    if (egneKr >= 0) arbeid = egneKr;
    linjer.push({ id, nokkel, navn: navn || n.navn, med: MED[id] || '', detalj, mengde, beregnet, enhet: n.enhet, timer, arbeid, materialer,
      forbruk, materialenhet: n.materialenhet || '', justert: !!(egenMengde >= 0 || egneTimer >= 0 || egneKr >= 0), justertRom: !!d });
  };
  // Timer for en flate der noen rom er trappehull: Σ m² × faktor.
  const vektet = (liste) => liste.reduce((s, x) => s + x.m2 * x.faktor, 0);

  // Oppstart per jobb, rigging per rom, tildekking av gulvet og stige/stillas per trappehull.
  if (medFelles && mengder.rom > 0) leggTil('jobb-oppstart', 1, { detalj: 'Per jobb' });
  leggTil('rigging-rom', mengder.rom, { detalj: mengder.rom + ' rom' });
  leggTil('dekking-gulv', mengder.dekking);
  leggTil('gulvbelegg', mengder.gulvbelegg);
  const trapper = (k.rom || []).filter((r) => r.trapp && romMengder(r).ok).length;
  leggTil('rigging-trapp', trapper, { detalj: trapper + ' trappehull' });
  const mobler = (k.rom || []).filter((r) => r.mobler && romMengder(r).ok).length;
  leggTil('mobler-rom', mobler, { detalj: mobler + ' rom' });

  for (const flate of ['vegg', 'tak']) {
    const f = a[flate];
    const m2 = mengder[flate];
    if (!(m2 > 0)) continue;
    const v = vektet(flater[flate]);
    const ord = flate === 'vegg' ? 'vegg' : 'tak';
    // Sparkletallene fra tariffen inkluderer sliping. Bare rommene der sparkling er huket av.
    const m2Sp = mengder[flate + 'Sparkles'], vSp = vektet(flater[flate + 'Sparkles']);
    for (const runde of SPARKEL_RUNDER_FOR[f.sparkling] || []) leggTil(flate + '-sparkling-' + runde, m2Sp, { faktorTimer: vSp });
    // Grunning: hele flaten om det er valgt, ellers det som er sparklet
    if (f.grunning) leggTil(flate + '-grunning', m2, { faktorTimer: v });
    else if (f.sparkling !== 'ingen') leggTil(flate + '-grunning', m2Sp, { faktorTimer: vSp });
    // Første strøk tar lengre tid og bruker mer maling enn de neste.
    for (let s = 1; s <= f.strok; s++) {
      leggTil(flate + (s === 1 ? '-maling-strok1' : '-maling-strok'), m2, { faktorTimer: v, navn: 'Maling ' + ord + ', strøk ' + s });
    }
  }
  // Ytterhjørner sparkles når veggene sparkles
  if (a.vegg?.sparkling !== 'ingen' && a.ytterhjorner !== false) leggTil('ytterhjorne', mengder.ytter, { faktorTimer: vektet(flater.ytter) });
  const lf = a.listefritt || {};
  if (lf.tak) leggTil('listefritt-tak', mengder.taklinje, { faktorTimer: vektet(flater.taklinje) });
  if (lf.hjorner) leggTil('listefritt-hjorne', mengder.hjorner, { faktorTimer: vektet(flater.hjorner) });
  if (lf.vinduer) leggTil('listefritt-vindu', mengder.vinduer);
  if (lf.dorer) leggTil('listefritt-dor', mengder.dorer);
  // Smygen ved listefrie vinduer og dører: tape, fuge og male. Skarp linje mellom vegg- og takfarge.
  leggTil('listefritt-smyg', (lf.vinduer ? mengder.vinduer : 0) + (lf.dorer ? mengder.dorer : 0));
  if (lf.tak) leggTil('listefritt-taklinje', mengder.taklinje, { faktorTimer: vektet(flater.taklinje) });

  for (let s = 1; s <= (a.lister?.strok || 0); s++) leggTil('lister-strok', mengder.lister, { navn: 'Lister, strøk ' + s });
  // Etter størrelse: samme antall vinduer, men timene etter hvor mye karm og foring det er
  const storrelse = a.vinduer?.etterStorrelse && mengder.vinduerMedMal > 0;
  const vinduValg = storrelse
    ? { faktorTimer: mengder.vinduerEkv, detalj: 'etter størrelse: ' + String(rund(mengder.vindusLm, 1)).replace('.', ',') + ' m karm og foring' }
    : {};
  for (let s = 1; s <= (a.vinduer?.strok || 0); s++) leggTil('vindu-strok', mengder.vinduer, { navn: 'Vinduer, strøk ' + s, ...vinduValg });
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
    linjer: raa ? linjer : linjer.map((l) => ({ ...l, timer: rund(l.timer), arbeid: Math.round(l.arbeid), materialer: Math.round(l.materialer), forbruk: rund(l.forbruk || 0, 2) })),
    sum: { timer: rund(timer, 1), arbeid: arbeidKr, materialer: materialKr, eksMva, mva, inklMva: eksMva + mva },
    mengder: Object.fromEntries(Object.entries(mengder).map(([k2, v]) => [k2, rund(v, 1)])),
    manglerMal,
    utelatt,
    utelattRom,
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
    const b = beregn({ ...k, rom: [r] }, lagredePriser, { medFelles: false, medJustering: 'bareUt' });
    return { id: r.id, navn: r.navn || 'Rom', ok: romMengder(r).ok, sum: b.sum };
  });
  const alt = beregn(k, lagredePriser);
  const sumRom = rom.reduce((s, r) => ({ timer: s.timer + r.sum.timer, eksMva: s.eksMva + r.sum.eksMva }), { timer: 0, eksMva: 0 });
  // Det som ikke hører til ett rom: oppstart, tillegg, egne mengder og timer, og øreavrunding
  const felles = { timer: rund(alt.sum.timer - sumRom.timer, 1), eksMva: alt.sum.eksMva - sumRom.eksMva };
  return { rom, felles };
}

/* Hva som går med av materialer, samlet i det man kjøper: liter maling, sparkel osv. */
const MATERIALGRUPPER = [
  { navn: 'Veggmaling', test: (id) => id.startsWith('vegg-maling') || id === 'listefritt-smyg' },
  { navn: 'Takmaling', test: (id) => id.startsWith('tak-maling') },
  { navn: 'Grunning', test: (id) => id.endsWith('-grunning') },
  { navn: 'Ardex A 828 (hurtigsparkel)', test: (id) => id.endsWith('-sparkling-fylling') },
  { navn: 'Sparkel', test: (id) => (id.includes('-sparkling-') && !id.endsWith('-sparkling-fylling')) || (id.startsWith('listefritt-') && !IKKE_SPARKEL.includes(id)) },
  { navn: 'Snekkermaling (lister, vinduer, dører)', test: (id) => id === 'lister-strok' || id === 'vindu-strok' || id === 'dor-strok' },
  { navn: 'Hjørnelist', test: (id) => id === 'ytterhjorne' },
  { navn: 'Dekkpapp', test: (id) => id === 'dekking-gulv' },
  { navn: 'Gulvbelegg', test: (id) => id === 'gulvbelegg' },
  { navn: 'Tape og plast', test: (id) => id === 'rigging-rom' || id === 'mobler-rom', enhet: 'rom' },
];

/**
 * Materialene for jobben fra linjene i beregn(): [{ navn, mengde, enhet, kr }].
 * Mengden er uten svinn, slik normtallene er; kroner er med påslag, som i prisen.
 */
export function materialer(resultat) {
  const ut = [];
  for (const g of MATERIALGRUPPER) {
    const ls = (resultat?.linjer || []).filter((l) => g.test(l.id) && l.forbruk > 0);
    if (!ls.length) continue;
    // Tape og plast: mengden er antall rom (møbelflytting teller ikke et rom til)
    const mengde = g.enhet === 'rom' ? ls.filter((l) => l.id === 'rigging-rom').reduce((s, l) => s + l.mengde, 0) : rund(ls.reduce((s, l) => s + l.forbruk, 0), 1);
    ut.push({ navn: g.navn, mengde, enhet: g.enhet || ls[0].materialenhet, kr: ls.reduce((s, l) => s + l.materialer, 0) });
  }
  return ut;
}

/* Arbeidet delt i det man fører timer på: strimling, 2. strøk, maling osv. */
export const ARBEID = [
  { id: 'fylling', navn: 'Skader og tverrskjøter' },
  { id: 'strimling', navn: 'Strimling' },
  { id: 'strok2', navn: 'Sparkling 2. strøk' },
  { id: 'strok3', navn: 'Sparkling 3. strøk' },
  { id: 'hel', navn: 'Helsparkling' },
  { id: 'sliping', navn: 'Sliping' },
  { id: 'ytterhjorner', navn: 'Ytterhjørner' },
  { id: 'listefritt', navn: 'Listefritt' },
  { id: 'grunning', navn: 'Grunning' },
  { id: 'maling', navn: 'Maling vegg og tak' },
  { id: 'snekker', navn: 'Lister, vinduer og dører' },
  { id: 'gulvbelegg', navn: 'Gulvbelegg' },
  { id: 'rigging', navn: 'Rigging og rydding' },
  { id: 'annet', navn: 'Annet' },
];
/** Hvilket arbeid en linje i beregningen hører til. */
export function arbeidFor(id) {
  const m = /^(?:vegg|tak)-sparkling-(fylling|strimling|strok2|strok3|hel|sliping)$/.exec(id);
  if (m) return m[1];
  if (id === 'ytterhjorne') return 'ytterhjorner';
  if (id.startsWith('listefritt-')) return 'listefritt';
  if (id.endsWith('-grunning')) return 'grunning';
  if (/^(vegg|tak)-maling/.test(id)) return 'maling';
  if (id === 'lister-strok' || id === 'vindu-strok' || id === 'dor-strok') return 'snekker';
  if (id === 'gulvbelegg') return 'gulvbelegg';
  if (['jobb-oppstart', 'rigging-rom', 'mobler-rom', 'dekking-gulv', 'rigging-trapp'].includes(id)) return 'rigging';
  return 'annet';
}
/** Beregnede timer per arbeid: { strimling: 3.2, maling: 6, … }. */
export function timerPerArbeid(resultat) {
  const ut = {};
  for (const l of resultat?.linjer || []) { const a = arbeidFor(l.id); ut[a] = (ut[a] || 0) + l.timer; }
  return ut;
}

/** Arbeidsdager med en gitt dagslengde, avrundet opp til halve dager. */
export function arbeidsdager(timer, timerPerDag = 7.5) {
  return Math.ceil((timer / timerPerDag) * 2) / 2;
}

/** Sparkelrunder som hver trenger et døgn tørk før neste steg. */
// Sparkelrundene per klasse. K2 er strimling, 2. og 3. strøk; K3 er de pluss helsparkling til slutt.
// Sliping av skjøtene etter 3. strøk; i K3 slipes det etter helsparklingen (med i den linjen).
// Alle klassene starter med å gå over skader og tverrskjøter med hurtigsparkel (fylling).
export const SPARKEL_RUNDER_FOR = { K1: ['fylling', 'strimling', 'strok2'], K2: ['fylling', 'strimling', 'strok2', 'strok3', 'sliping'], K3: ['fylling', 'strimling', 'strok2', 'strok3', 'hel'] };
export const SPARKEL_RUNDER = { listefritt: 2, 'listefritt-vindu': 3, 'listefritt-dor': 3, ytterhjorne: 3 };
// Listefritt-linjer som er maling og taping, ikke sparkel
const IKKE_SPARKEL = ['listefritt-smyg', 'listefritt-taklinje'];

/**
 * Hvor mange dager jobben tar med tørketid for sparkel. Sparkelen må tørke et døgn
 * før neste runde, så hver runde tar minst en dag. Grunning og maling kan ikke gjøres
 * før sparkelen er ferdig og slipt, så de kommer etterpå, minst én dag.
 * Annet arbeid (rigging, tildekking, lister) kan gjøres mens sparkelen tørker.
 * På store jobber går rundene i ett (rom for rom), så da blir det ingen ekstra dager.
 * Grunnes taket, står grunningen et døgn før taket males: da får grunningen sin egen dag.
 * Eksempel, ett rom i K2: 3 dager sparkling, 1 dag sliping og grunning, 1 dag maling = 5 dager.
 * Uten grunning i taket: 3 dager sparkling og 1 dag maling = 4 dager.
 */
export function dagerMedTork(resultat, timerPerDag = 7.5) {
  const b = resultat || { linjer: [], sum: { timer: 0 } };
  let runder = 0, sparkel = 0, etter = 0, grunning = 0, takGrunnes = false;
  const perFlate = {}; // antall sparkelrunder på vegg og tak
  for (const l of b.linjer) {
    if (!(l.timer > 0)) continue;
    // Grunning og maling av vegg og tak, og malingen ved listefrie overganger, venter på sparkelen
    if (/^(vegg|tak)-(grunning|maling)/.test(l.id) || IKKE_SPARKEL.includes(l.id)) {
      etter += l.timer;
      if (l.id.endsWith('-grunning')) grunning += l.timer;
      if (l.id === 'tak-grunning') takGrunnes = true;
      continue;
    }
    const m = /^(vegg|tak)-sparkling-(\w+)$/.exec(l.id);
    // Sliping er ingen egen runde med tørk, men gjøres når sparkelen er tørr
    // Hurtigsparkelen (fylling) herder på noen timer og trenger heller ikke et døgn
    if (m) { if (m[2] !== 'sliping' && m[2] !== 'fylling') perFlate[m[1]] = (perFlate[m[1]] || 0) + 1; sparkel += l.timer; continue; }
    // Listefritt vindu: tre strøk sparkel oppå PVC-hjørnelistene i smygen
    const r = SPARKEL_RUNDER[l.id] || (l.id.startsWith('listefritt-') ? SPARKEL_RUNDER.listefritt : 0);
    if (!r) continue;
    runder = Math.max(runder, r);
    sparkel += l.timer;
  }
  runder = Math.max(runder, ...Object.values(perFlate), 0);
  const uten = arbeidsdager(b.sum.timer, timerPerDag);
  if (!runder) return { dager: uten, arbeidsdager: uten, runder: 0 };
  const perRunde = sparkel / runder / timerPerDag;                 // dager arbeid per runde
  const ledig = runder * Math.max(0, 1 - perRunde) * timerPerDag;  // timer igjen på sparkeldagene
  const annet = Math.max(0, b.sum.timer - sparkel - etter);         // kan gjøres mens det tørker
  const tilOvers = Math.max(0, annet - ledig);                      // det som ikke fikk plass
  // Grunning i tak står et døgn: grunningen får en egen dag, malingen kommer dagen etter
  const sluttDager = etter <= 0 ? tilOvers / timerPerDag
    : takGrunnes ? Math.max(1, grunning / timerPerDag) + Math.max(1, (etter - grunning + tilOvers) / timerPerDag)
    : Math.max(1, (etter + tilOvers) / timerPerDag);
  const dager = Math.ceil((runder * Math.max(1, perRunde) + sluttDager) * 2) / 2;
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

/** Gruppene linjene vises i under Utregning og i prisen for et rom. */
export const PRISGRUPPER = [
  { id: 'rigging', navn: 'Rigging og tildekking' },
  { id: 'sparkling', navn: 'Sparkling' },
  { id: 'listefritt', navn: 'Listefritt' },
  { id: 'maling', navn: 'Grunning og maling' },
  { id: 'snekker', navn: 'Lister, vinduer og dører' },
  { id: 'gulv', navn: 'Gulvbelegg' },
  { id: 'annet', navn: 'Tillegg og annet' },
];
const GRUPPE_FOR_ARBEID = {
  fylling: 'sparkling', strimling: 'sparkling', strok2: 'sparkling', strok3: 'sparkling', hel: 'sparkling', sliping: 'sparkling', ytterhjorner: 'sparkling',
  listefritt: 'listefritt', grunning: 'maling', maling: 'maling', snekker: 'snekker', gulvbelegg: 'gulv', rigging: 'rigging',
};
/** Hvilken gruppe en linje vises i. */
export function prisgruppe(l) {
  return l.tillegg ? 'annet' : (GRUPPE_FOR_ARBEID[arbeidFor(l.id)] || 'annet');
}
/* Prisen delt på flatene i stedet for arbeidet: alt på veggene, alt i taket, overgangen mellom dem. */
export const FLATEGRUPPER = [
  { id: 'rigging', navn: 'Rigging og tildekking' },
  { id: 'vegg', navn: 'Vegger' },
  { id: 'tak', navn: 'Tak' },
  { id: 'overgang', navn: 'Overgang tak/vegg' },
  { id: 'snekker', navn: 'Lister, vinduer og dører' },
  { id: 'gulv', navn: 'Gulvbelegg' },
  { id: 'annet', navn: 'Tillegg og annet' },
];
/** Hvilken flate en linje hører til. */
export function flategruppe(l) {
  if (l.tillegg) return 'annet';
  const id = l.id;
  if (id.startsWith('vegg-') || id === 'ytterhjorne' || id === 'listefritt-hjorne') return 'vegg';
  if (id.startsWith('tak-')) return 'tak';
  if (id === 'listefritt-tak' || id === 'listefritt-taklinje') return 'overgang';
  if (['lister-strok', 'vindu-strok', 'dor-strok', 'listefritt-vindu', 'listefritt-dor', 'listefritt-smyg'].includes(id)) return 'snekker';
  const g = prisgruppe(l);
  return g === 'rigging' || g === 'gulv' ? g : 'annet';
}

/** Linjene samlet i grupper med sum, i fast rekkefølge. Tomme grupper er utelatt.
 *  etter: 'arbeid' (sparkling, maling …) eller 'flate' (vegger, tak …). */
export function grupperLinjer(linjer, etter = 'arbeid') {
  const flate = etter === 'flate';
  return (flate ? FLATEGRUPPER : PRISGRUPPER).map((g) => {
    const ls = linjer.filter((l) => (flate ? flategruppe(l) : prisgruppe(l)) === g.id);
    return { ...g, linjer: ls,
      timer: ls.reduce((s, l) => s + (l.timer || 0), 0),
      arbeid: ls.reduce((s, l) => s + (l.arbeid || 0), 0),
      materialer: ls.reduce((s, l) => s + (l.materialer || 0), 0),
      justert: ls.some((l) => l.justert || l.justertRom) };
  }).filter((g) => g.linjer.length);
}

/* ---------- Fremgang per rom ---------- */

/** Stegene i et rom, i den rekkefølgen de vanligvis gjøres. Grunning og maling er delt på tak og vegg. */
export const STEG = [
  { id: 'rigging', navn: 'Rigging og tildekking' },
  { id: 'fylling', navn: 'Skader og tverrskjøter' },
  { id: 'strimling', navn: 'Strimling' },
  { id: 'strok2', navn: 'Sparkling 2. strøk' },
  { id: 'strok3', navn: 'Sparkling 3. strøk' },
  { id: 'hel', navn: 'Helsparkling' },
  { id: 'sliping', navn: 'Sliping' },
  { id: 'ytterhjorner', navn: 'Ytterhjørner' },
  { id: 'listefritt', navn: 'Listefritt' },
  { id: 'grunning-tak', navn: 'Grunning tak' },
  { id: 'grunning-vegg', navn: 'Grunning vegg' },
  { id: 'maling-tak', navn: 'Maling tak' },
  { id: 'maling-vegg', navn: 'Maling vegg' },
  { id: 'snekker', navn: 'Lister, vinduer og dører' },
  { id: 'gulvbelegg', navn: 'Gulvbelegg' },
];
const STEG_IDER = new Set(STEG.map((s) => s.id));

/** Hvilket steg en linje i beregningen hører til, eller null (oppstart, tillegg). */
export function stegFor(id) {
  const a = arbeidFor(id);
  if (a === 'grunning' || a === 'maling') return a + (id.startsWith('tak-') ? '-tak' : '-vegg');
  return STEG_IDER.has(a) ? a : null;
}

/** Hva som er gjort i et rom: stegene med beregnede timer, og hvor langt rommet har kommet. */
export function romFremgang(kalkyle, rom, lagredePriser) {
  const b = beregn({ ...kalkyle, rom: [rom], tillegg: [] }, lagredePriser, { medFelles: false, medJustering: 'bareUt' });
  const per = {};
  for (const l of b.linjer) { const s = stegFor(l.id); if (s) per[s] = (per[s] || 0) + l.timer; }
  const gjort = rom.gjort || {};
  const steg = STEG.filter((s) => per[s.id] > 0).map((s) => ({ ...s, timer: per[s.id], gjort: gjort[s.id] === true }));
  const timer = steg.reduce((s, x) => s + x.timer, 0);
  const gjortTimer = steg.filter((x) => x.gjort).reduce((s, x) => s + x.timer, 0);
  return {
    steg, timer, gjortTimer, igjen: timer - gjortTimer,
    andel: timer > 0 ? gjortTimer / timer : 0,
    neste: steg.find((x) => !x.gjort) || null,
    ferdig: steg.length > 0 && steg.every((x) => x.gjort),
  };
}

/** Etasjen et rom hører til: navnet på plantegningen det er tegnet på, ellers fra romnavnet («Bad 2etg»). */
export function etasjeFor(rom, planer = []) {
  // Skrevet inn på rommet: «2» blir «2. etasje», ellers som skrevet («Loft»)
  const egen = String(rom.etasje || '').trim();
  if (egen) return /^\d+\.?$/.test(egen) ? parseInt(egen, 10) + '. etasje' : egen.charAt(0).toUpperCase() + egen.slice(1);
  const p = rom.tegning && planer.find((x) => x.bilde === rom.tegning);
  if (p && p.navn) return p.navn;
  const navn = rom.navn || '';
  const m = /(\d+)\s*\.?\s*(etg|etasje|et\b)/i.exec(navn);
  if (m) return m[1] + '. etasje';
  if (/kjeller|underetasje/i.test(navn)) return 'Kjeller';
  if (/loft/i.test(navn)) return 'Loft';
  return '';
}

/** Rommene gruppert per etasje, med fremgangen. Rom uten etasje havner sist under «Andre rom». */
export function fremgangPerEtasje(kalkyle, lagredePriser) {
  const k = kalkyle || { rom: [] };
  const grupper = new Map();
  for (const rom of k.rom) {
    const etasje = etasjeFor(rom, k.planer || []);
    if (!grupper.has(etasje)) grupper.set(etasje, []);
    grupper.get(etasje).push({ rom, ...romFremgang(k, rom, lagredePriser) });
  }
  const ut = [...grupper.entries()].map(([navn, rom]) => {
    const timer = rom.reduce((s, x) => s + x.timer, 0);
    const gjortTimer = rom.reduce((s, x) => s + x.gjortTimer, 0);
    return { navn: navn || 'Andre rom', utenNavn: !navn, rom, timer, gjortTimer, igjen: timer - gjortTimer, andel: timer > 0 ? gjortTimer / timer : 0 };
  });
  // Navngitte etasjer i naturlig rekkefølge, rom uten etasje sist
  return ut.sort((a, b) => (a.utenNavn - b.utenNavn) || a.navn.localeCompare(b.navn, 'nb', { numeric: true }));
}

/* ---------- Handleliste: hvor mange spann og sekker ---------- */

// Vanlige størrelser i butikken. Maling som i kalkulatoren (9 / 2,7 / 0,68 L).
// Ferdigsparkel: spann på 10 og 3 L (Jotun, Dalapro). Ardex A 828: sekk 12,5 kg og pose 5 kg (norsk produktark).
const MALING_SPANN = [9, 2.7, 0.68];
export const PAKNINGER = {
  'Veggmaling': MALING_SPANN,
  'Takmaling': MALING_SPANN,
  'Grunning': MALING_SPANN,
  'Snekkermaling (lister, vinduer, dører)': MALING_SPANN,
  'Sparkel': [10, 3],
  'Ardex A 828 (hurtigsparkel)': [12.5, 5],
};

/** Linjene handlelista regnes fra: hele jobben, én etasje, og eventuelt bare steg som ikke er gjort. */
export function linjerForHandel(kalkyle, lagredePriser, { bareIgjen = false, etasje = null } = {}) {
  const k = kalkyle || { rom: [] };
  // Hele jobben uten filter: samme tall som under Materialer i prisen
  if (!bareIgjen && etasje == null) return beregn(k, lagredePriser).linjer;
  const ut = [];
  for (const rom of k.rom) {
    if (etasje != null && (etasjeFor(rom, k.planer || []) || 'Andre rom') !== etasje) continue;
    const b = beregn({ ...k, rom: [rom], tillegg: [] }, lagredePriser, { medFelles: false, medJustering: 'bareUt' });
    for (const l of b.linjer) if (!(bareIgjen && rom.gjort && rom.gjort[stegFor(l.id)] === true)) ut.push(l);
  }
  return ut;
}

/**
 * Linjene som limes inn i Handleliste-appen: én vare per linje. Handleliste leser et tall først
 * i linja som antall og kutter navnet ved komma og parentes, så linjene starter med navnet
 * («Veggmaling: 2 × 9 L + 1 × 2,7 L») og blir stående som de er. Fargene på jobben tas med,
 * så man vet hva som skal blandes.
 */
export function handlelisteLinjer(liste, farger = []) {
  const kort = (navn) => navn.replace(/\s*\(.*\)\s*$/, '');
  const ut = [];
  for (const m of liste) {
    if (m.forslag && m.trenger > 0) ut.push(kort(m.navn) + ': ' + m.forslag.tekst);
    else if (!m.forslag && m.mengde > 0) ut.push(kort(m.navn) + ': ' + String(rund(m.mengde, m.enhet === 'rom' ? 0 : 1)).replace('.', ',') + ' ' + m.enhet);
  }
  for (const f of farger) {
    const navn = [f.produkt, f.kode].map((x) => (x || '').trim()).filter(Boolean).join(' ');
    if (!navn) continue;
    const linje = 'Farge: ' + navn + (f.glans ? ', glans ' + f.glans : '') + (f.rom ? ' (' + f.rom + ')' : '');
    if (!ut.includes(linje)) ut.push(linje);
  }
  return ut;
}

/** Materialene med svinn, og et innkjøpsforslag i spann eller sekker der det finnes vanlige størrelser. */
export function handleliste(linjer, { svinn = 10 } = {}) {
  return materialer({ linjer }).map((m) => {
    const storrelser = PAKNINGER[m.navn];
    if (!storrelser) return { ...m, trenger: m.mengde, forslag: null };
    const trenger = rund(m.mengde * (1 + svinn / 100), 1);
    const f = spannForslag(trenger, storrelser);
    const kombinasjon = f.kombinasjon.map((x) => ({ antall: x.antall, storrelse: x.l, tekst: x.antall + ' × ' + String(x.l).replace('.', ',') + ' ' + m.enhet }));
    return { ...m, trenger, forslag: { kombinasjon, tekst: kombinasjon.map((x) => x.tekst).join(' + '), dekker: f.dekker, tilOvers: f.tilOvers } };
  });
}
