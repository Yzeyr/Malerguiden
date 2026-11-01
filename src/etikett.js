/* Tolker teksten fra et bilde av et malingsspann, en sekk eller et produktdatablad.

   Tekstgjenkjenningen på telefonen gir linjer med tekst, ofte med små feil:
   «m²/l» kan komme som «m2/1», «m?/I» eller «m² / ltr». Her plukkes det ut
   det kalkylen trenger: forbruk (m² per liter), spannstørrelse, pris, glans,
   fargekode og produktnavn. Alt som ikke finnes, blir null. */

const TALL = '(\\d+(?:[.,]\\d+)?)';
const tilTall = (s) => Number(String(s).replace(',', '.'));
const STREK = '\\s*(?:-|–|—|til|à)\\s*';

// «m²», «m2», «m?», «m 2», «kvm»
const M2 = '(?:m\\s?[²2?³]|kvm)';
// «/l», «/ L», «/ltr», «/liter», «pr. liter», «per l», og OCR-feil der l blir I eller 1
const PER_L = '(?:\\s*/\\s*|\\s+(?:pr\\.?|per)\\s+)(?:liter|ltr|lit|[lLI1|])(?![a-zæøå])';

/** Produkter som er vanlige i Norge. Lengste navn først, så «Lady Pure Color» slår «Lady». */
const PRODUKTER = [
  'Lady Pure Color', 'Lady Supreme Finish', 'Lady Balance', 'Lady Minerals', 'Lady Wonderwall', 'Lady Aqua', 'Lady Perfection', 'Lady Design',
  'Jotaproff Pro', 'Jotaproff', 'Jotun Sens', 'Jotun Fenomastic', 'Jotun Kjøkken og Bad', 'Jotun Grunning', 'Jotun Takmaling',
  'Flügger Flutex Pro', 'Flutex Pro', 'Flutex', 'Flügger Dekso', 'Dekso', 'Flügger Wet Room', 'Flügger Interior',
  'Nordsjö Original', 'Nordsjø Original', 'Nordsjø Professional', 'Beckers Elegant', 'Beckers Perfekt', 'Beckers Designer',
  'Alcro Bestå', 'Alcro', 'Gjøco Interiør', 'Gjøco',
  'Ardex A 828', 'Ardex A828', 'Ardex', 'Gyproc ProMix', 'Gyproc', 'Dyrup',
].sort((a, b) => b.length - a.length);

const SPANN = [0.68, 0.75, 0.9, 1, 2.5, 2.7, 3, 4.5, 5, 9, 10, 12, 15, 20];

function finnForbruk(t) {
  // 1) m² per liter: «8–10 m²/l», «ca. 10 m2/liter», «6 til 8 m² pr. liter»
  let m = t.match(new RegExp(TALL + '(?:' + STREK + TALL + ')?\\s*' + M2 + PER_L, 'i'));
  if (m) {
    const a = tilTall(m[1]), b = m[2] ? tilTall(m[2]) : a;
    const min = Math.min(a, b), max = Math.max(a, b);
    if (min > 0 && max <= 30) return { min, max, snitt: (min + max) / 2, enhet: 'm²/L' };
  }
  // 2) liter per m²: «0,10–0,12 l/m²» → m² per liter
  m = t.match(new RegExp(TALL + '(?:' + STREK + TALL + ')?\\s*(?:liter|ltr|l)\\s*/\\s*' + M2, 'i'));
  if (m) {
    const a = tilTall(m[1]), b = m[2] ? tilTall(m[2]) : a;
    if (a > 0 && b > 0 && Math.max(a, b) < 1) {
      const min = 1 / Math.max(a, b), max = 1 / Math.min(a, b);
      return { min: rund(min), max: rund(max), snitt: rund((min + max) / 2), enhet: 'm²/L' };
    }
  }
  // 3) Rekkeevne uten enhet etter tallet, men med ordet foran: «Rekkeevne: 8-10»
  m = t.match(new RegExp('(?:rekkeevne|forbruk|dekkevne)[^0-9\\n]{0,20}' + TALL + '(?:' + STREK + TALL + ')?\\s*' + M2, 'i'));
  if (m) {
    const a = tilTall(m[1]), b = m[2] ? tilTall(m[2]) : a;
    const min = Math.min(a, b), max = Math.max(a, b);
    if (min >= 2 && max <= 30) return { min, max, snitt: (min + max) / 2, enhet: 'm²/L' };
  }
  return null;
}

/** Sparkel og masse: «Forbruk ca. 1 kg/m²/mm» eller «0,5–0,8 kg/m²». */
function finnKgForbruk(t) {
  const m = t.match(new RegExp(TALL + '(?:' + STREK + TALL + ')?\\s*kg\\s*/\\s*' + M2 + '(\\s*/\\s*mm)?', 'i'));
  if (!m) return null;
  const a = tilTall(m[1]), b = m[2] ? tilTall(m[2]) : a;
  return { min: Math.min(a, b), max: Math.max(a, b), snitt: (a + b) / 2, enhet: m[3] ? 'kg/m²/mm' : 'kg/m²' };
}

function finnVolum(t) {
  // Tall med L/liter som IKKE er en del av «m²/l» eller «l/m²»
  const re = new RegExp('(^|[^0-9/.,])' + TALL + '\\s?(liter|ltr|l)(?![a-zæøå/²2])', 'gi');
  const funnet = [];
  for (const m of t.matchAll(re)) {
    const v = tilTall(m[2]);
    if (v > 0 && v <= 20) funnet.push(v);
  }
  // Vanlige spannstørrelser først, så den største (etiketten nevner ofte mindre spann også)
  const vanlige = funnet.filter((v) => SPANN.includes(v));
  const liste = vanlige.length ? vanlige : funnet;
  return liste.length ? Math.max(...liste) : null;
}

function finnVekt(t) {
  const m = t.match(new RegExp('(^|[^0-9/.,])' + TALL + '\\s?kg(?![a-zæøå/])', 'i'));
  if (!m) return null;
  const v = tilTall(m[2]);
  return v > 0 && v <= 40 ? v : null;
}

function finnPris(t) {
  // «kr 1 299», «1 299,-», «1299,00 kr», «899.-»
  const kandidater = [];
  for (const m of t.matchAll(/kr\.?\s*(\d{1,3}(?:[ .\u00a0]\d{3})*|\d+)(?:[,.](\d{2}|-))?/gi)) kandidater.push(m[1]);
  for (const m of t.matchAll(/(\d{1,3}(?:[ \u00a0]\d{3})*|\d+)\s?(?:,|\.)(?:-|—|–)/g)) kandidater.push(m[1]);
  for (const m of t.matchAll(/(\d{1,3}(?:[ \u00a0]\d{3})*|\d+),(\d{2})\s?kr/gi)) kandidater.push(m[1]);
  const tall = kandidater.map((k) => Number(String(k).replace(/[ .\u00a0]/g, ''))).filter((v) => v >= 10 && v <= 20000);
  return tall.length ? Math.max(...tall) : null;
}

function finnGlans(t) {
  const m = t.match(/glans(?:grad)?\.?\s*:?\s*(\d{1,2})(?!\d)/i) || t.match(/(?:^|\s)gl\.\s*(\d{1,2})(?!\d)/i);
  if (m) return String(Number(m[1]));
  if (/helmatt|dypmatt/i.test(t)) return '2';
  return null;
}

function finnNcs(t) {
  // «NCS S 0502-Y», «S 1002-Y50R», «S0500-N». OCR kan lese 0 som O.
  const m = t.match(/(?:NCS\s*)?S\s?([0-9O]{4})\s?-\s?([NYRGB](?:[0-9O]{2}[YRGB])?)/i);
  if (!m) return null;
  return 'S ' + m[1].replace(/O/gi, '0') + '-' + m[2].toUpperCase().replace(/O/g, '0');
}

function finnProdukt(t) {
  const lav = t.toLowerCase();
  for (const p of PRODUKTER) if (lav.includes(p.toLowerCase())) return p;
  return null;
}

const rund = (v) => Math.round(v * 10) / 10;

/**
 * Tolker linjene fra tekstgjenkjenningen.
 * kjentKode(kode): valgfri, sier om en kode (f.eks. «1453») finnes i fargelista.
 * Svar: { forbruk, kgForbruk, liter, kg, pris, prisPerLiter, glans, kode, produkt }
 */
export function tolkEtikett(linjer, { kjentKode = null } = {}) {
  const t = (Array.isArray(linjer) ? linjer : [linjer]).map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const forbruk = finnForbruk(t);
  const kgForbruk = forbruk ? null : finnKgForbruk(t);
  const liter = finnVolum(t);
  const kg = liter ? null : finnVekt(t);
  const pris = finnPris(t);
  let kode = finnNcs(t);
  if (!kode && kjentKode) {
    for (const m of t.matchAll(/(?:^|[^\d])(\d{4,5})(?!\d)/g)) { if (kjentKode(m[1])) { kode = m[1]; break; } }
  }
  return {
    forbruk, kgForbruk, liter, kg, pris,
    prisPerLiter: pris && liter ? Math.round(pris / liter) : null,
    glans: finnGlans(t),
    kode,
    produkt: finnProdukt(t),
  };
}

/** Kort oppsummering av det som ble funnet, til en toast. */
export function etikettTekst(e) {
  const fmt = (v) => String(v).replace('.', ',');
  const d = [];
  if (e.produkt) d.push(e.produkt);
  if (e.kode) d.push(e.kode);
  if (e.glans) d.push('glans ' + e.glans);
  if (e.forbruk) d.push((e.forbruk.min === e.forbruk.max ? fmt(e.forbruk.min) : fmt(e.forbruk.min) + '–' + fmt(e.forbruk.max)) + ' m²/L');
  if (e.kgForbruk) d.push(fmt(e.kgForbruk.snitt) + ' ' + e.kgForbruk.enhet);
  if (e.liter) d.push(fmt(e.liter) + ' L');
  if (e.kg) d.push(fmt(e.kg) + ' kg');
  if (e.pris) d.push(e.pris + ' kr');
  return d.join(' · ');
}
