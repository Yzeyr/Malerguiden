/* ------------------------------------------------------------------ *
 * KALKULATORER — rene funksjoner, ingen DOM.
 *
 * Formlene er flyttet fra gamle index.html (calcBad 5358–5415,
 * calcMaling 5452–5478, calcRom 5486–5524, calcSparkel 5539–5561,
 * calcForbruk 5563–5591, smartsøk 5843–5930). Felt-id-ene er de samme
 * som i originalen — de er nøkler i `malerguiden:calc:<id>` og i
 * `job.beregninger[].input`, og må aldri endres.
 *
 * Rettet i forhold til originalen (nummer = inventaret kap. 7):
 *  12  spannforslaget er et uttømmende søk, ikke grådig (se spannForslag)
 *  13  malingadvarselen: grense og tekst stemmer (6–14 m²/L)
 *  15  sparkel sier «sekker/spann», ikke bare «sekker»
 *  16  bad-sluk = 0 gir advarselen om minst 4 mm
 *  17/20 romTilAreal() gir vegg/tak/total til både maling og sparkel
 *  24  smartsøket matcher hele ord, mest spesifikke ord først
 *  25  «150x150» o.l. gir ikke romareal-forslag
 * ------------------------------------------------------------------ */

/* ----------------------------- Felles ------------------------------ */

// Norske brukere skriver komma. Godta begge. Som originalens num():
// fjern alt whitespace (inkl. NBSP), bytt FØRSTE komma med punktum.
export function tall(s) {
  if (s === null || s === undefined || typeof s === 'boolean') return NaN;
  const raw = String(s).replace(/\s/g, '').replace(',', '.');
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : NaN;
}

// Som originalen. NB: nb-NO bruker NBSP/smalt mellomrom som tusenskille.
export function fmt(v, dec) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('nb-NO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Trimmer overflødige nuller (9 → «9 L», 11.7 → «11,7 L», 9.68 → «9,68 L»).
export function fmtLiter(v) {
  const r = Math.round(v * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 1e-9) return fmt(r, 0) + ' L';
  if (Math.abs(r * 10 - Math.round(r * 10)) < 1e-9) return fmt(r, 1) + ' L';
  return fmt(r, 2) + ' L';
}

const flertall = (n, en, flere) => n + (n === 1 ? ' ' + en : ' ' + flere);
const svinnFaktor = (svinn) => 1 + (Number.isFinite(svinn) ? svinn : 0) / 100;

/* -------------------------- Definisjoner --------------------------- */

const VARMEKABEL_TEKST = 'Varmekabel i gulvet: minste dekktykkelse over kabelen styres ofte av kabelprodusenten, ikke bare av massens eget minstemål på 4 mm — sjekk kabeldatabladet';

// Snittstørrelser for fratrekk i romareal. Bevisst faste tall.
const DOR_M2 = 1.6;
const VINDU_M2 = 1.5;

export const KALKULATORER = [
  {
    id: 'calc-maling', navn: 'Maling', under: 'Liter og spann', farge: 'terrakotta', fag: 'maling', enhet: 'liter',
    beskrivelse: 'Areal, strøk og svinn → liter og et konkret innkjøpsforslag i vanlige spannstørrelser.',
    felt: [
      { id: 'mal-areal', label: 'Areal', enhet: 'm²', hint: 'Det som skal males', standard: '60', type: 'tall', steg: 1, min: 0 },
      { id: 'mal-strok', label: 'Antall strøk', enhet: 'strøk', hint: 'Vanligvis 2', standard: '2', type: 'heltall', steg: 1, min: 1 },
      { id: 'mal-forbruk', label: 'Forbruk', enhet: 'm²/L', hint: 'm² per liter, 8–12 er vanlig', standard: '10', type: 'tall', steg: 1, min: 0, avansert: true },
      { id: 'mal-svinn', label: 'Svinn', enhet: '%', hint: '% påslag', standard: '10', type: 'tall', steg: 5, min: 0, avansert: true },
    ],
  },
  {
    id: 'calc-sparkel', navn: 'Sparkel', under: 'Kg og sekker', farge: 'oker', fag: 'sparkling', enhet: 'kg',
    beskrivelse: 'Areal og forbruk → kg og antall sekker/spann. Forbrukstallet er veiledende — overskriv med ditt eget.',
    felt: [
      { id: 'sp-areal', label: 'Areal', enhet: 'm²', hint: 'Det som skal sparkles', standard: '60', type: 'tall', steg: 1, min: 0 },
      { id: 'sp-forbruk', label: 'Forbruk', enhet: 'kg/m²', hint: 'Totalt for alle strøk, ikke per strøk', standard: '1,5', type: 'tall', steg: 0.1, min: 0, avansert: true },
      { id: 'sp-svinn', label: 'Svinn', enhet: '%', hint: '% påslag', standard: '10', type: 'tall', steg: 5, min: 0, avansert: true },
      { id: 'sp-sekk', label: 'Sekk/spann', enhet: 'kg', hint: 'kg per sekk eller spann', standard: '25', type: 'tall', steg: 5, min: 0, avansert: true },
    ],
  },
  {
    id: 'calc-bad', navn: 'Bad og fall', under: 'Masse med fall til sluk', farge: 'petrol', fag: 'bad', enhet: 'kg',
    beskrivelse: 'Avrettingsmasse for et ekte bad — dusjsonen med 1:50 og resten av gulvet med 1:100, regnet som én kombinert masse.',
    felt: [
      { id: 'bad-areal', label: 'Areal totalt', enhet: 'm²', hint: 'Hele gulvarealet, dusjsonen inkludert.', standard: '6', type: 'tall', steg: 1, min: 0 },
      { id: 'bad-areal-dusj', label: 'Areal dusjsone', enhet: 'm²', hint: 'Delen av gulvet som har 1:50-fall. Vanlig størrelse er ca. 0,9–1,5 m².', standard: '1,2', type: 'tall', steg: 0.1, min: 0 },
      { id: 'bad-sluk', label: 'Høyde gulv → sluk', enhet: 'mm', hint: 'Sluktoppens høyde over eksisterende undergulv. Dette er tykkelsen ved sluket — lavpunktet.', standard: '10', type: 'tall', steg: 1, min: 0 },
      { id: 'bad-avstand-dusj', label: 'Sluk → kant dusjsone', enhet: 'm', hint: 'Vannrett avstand fra sluket til der dusjsonen slutter. 1:50 gjelder i hele denne sonen.', standard: '1', type: 'tall', steg: 0.1, min: 0 },
      { id: 'bad-avstand-hoyeste', label: 'Sluk → høyeste punkt', enhet: 'm', hint: 'Vannrett avstand fra sluket til det høyeste punktet — normalt dørterskelen. Fallet stiger videre med 1:100 utenfor dusjsonen.', standard: '2,5', type: 'tall', steg: 0.1, min: 0 },
      { id: 'bad-form', label: 'Fallform', enhet: '', hint: 'Avgjør hvordan snittykkelsen regnes ut i hver sone.', standard: '0.6667', type: 'valg',
        valg: [
          { verdi: '0.6667', label: 'Fall fra alle kanter mot punktsluk (snitt = ⅔ av fallet)' },
          { verdi: '0.5', label: 'Ensidig fall, én retning (snitt = ½ av fallet)' },
        ] },
      { id: 'bad-varmekabel', label: 'Varmekabel i gulvet', enhet: '', standard: false, type: 'avkrysning' },
      { id: 'bad-forbruk', label: 'Forbruk', enhet: 'kg/mm/m²', standard: '1,75', type: 'tall', steg: 0.05, min: 0, avansert: true },
      { id: 'bad-svinn', label: 'Svinn', enhet: '%', hint: '% påslag', standard: '10', type: 'tall', steg: 5, min: 0, avansert: true },
      { id: 'bad-sekk', label: 'Sekkestørrelse', enhet: 'kg', hint: 'kg per sekk. weberfloor 120 Reno leveres i 20 kg.', standard: '20', type: 'tall', steg: 5, min: 0, avansert: true },
    ],
  },
  {
    id: 'calc-forbruk', navn: 'Avretting', under: 'Flatt gulv', farge: 'ultramarin', fag: 'bad', enhet: 'kg',
    beskrivelse: 'Flatt gulv, jevn lagtykkelse over hele arealet. Skal du bygge fall, bruk «Bad og fall».',
    felt: [
      { id: 'fb-areal', label: 'Areal', enhet: 'm²', standard: '20', type: 'tall', steg: 1, min: 0 },
      { id: 'fb-tykk', label: 'Lagtykkelse', enhet: 'mm', standard: '5', type: 'tall', steg: 1, min: 0 },
      { id: 'fb-varmekabel', label: 'Varmekabel i gulvet', enhet: '', standard: false, type: 'avkrysning' },
      { id: 'fb-forbruk', label: 'Forbruk', enhet: 'kg/mm/m²', standard: '1,75', type: 'tall', steg: 0.05, min: 0, avansert: true },
      { id: 'fb-svinn', label: 'Svinn', enhet: '%', hint: '% påslag', standard: '10', type: 'tall', steg: 5, min: 0, avansert: true },
      { id: 'fb-sekk', label: 'Sekkestørrelse', enhet: 'kg', hint: 'kg per sekk', standard: '20', type: 'tall', steg: 5, min: 0, avansert: true },
    ],
  },
  {
    id: 'calc-rom', navn: 'Romareal', under: 'Vegg og tak', farge: 'salvie', fag: 'maling', enhet: null,
    beskrivelse: 'Mål lengde, bredde og takhøyde — få vegg- og takareal ferdig utregnet, og send det videre til maling eller sparkel.',
    felt: [
      { id: 'rom-lengde', label: 'Lengde', enhet: 'm', standard: '4', type: 'tall', steg: 0.1, min: 0 },
      { id: 'rom-bredde', label: 'Bredde', enhet: 'm', standard: '3', type: 'tall', steg: 0.1, min: 0 },
      { id: 'rom-hoyde', label: 'Takhøyde', enhet: 'm', standard: '2,4', type: 'tall', steg: 0.1, min: 0 },
      { id: 'rom-dorer', label: 'Dører', enhet: 'stk', hint: 'à 1,6 m²', standard: '1', type: 'heltall', steg: 1, min: 0 },
      { id: 'rom-vinduer', label: 'Vinduer', enhet: 'stk', hint: 'à 1,5 m²', standard: '1', type: 'heltall', steg: 1, min: 0 },
    ],
  },
];

const KALK_MAP = Object.fromEntries(KALKULATORER.map((k) => [k.id, k]));

function hentKalk(calcId) {
  const k = KALK_MAP[calcId];
  if (!k) throw new Error('Ukjent kalkulator: ' + calcId);
  return k;
}

export function standardverdier(calcId) {
  const out = {};
  for (const f of hentKalk(calcId).felt) out[f.id] = f.standard;
  return out;
}

/* --------------------------- Spannforslag -------------------------- */

/*
 * Rett feil 12. Originalen var grådig («fyll med store spann, topp opp med
 * ett 0,68 L») og ga f.eks. 7 L → 2 × 2,7 + 3 × 0,68 (fem spann).
 *
 * Regel: søk uttømmende over små antall av hver størrelse. Blant
 * kombinasjonene som dekker behovet med et overskudd på høyst
 * max(0,7 L, 30 % av behovet), velg den med FÆRREST spann; ved likt antall
 * spann, minst overskudd. Finnes ingen slik, velg minst overskudd (og ved
 * likt innen 0,05 L, færrest spann).
 *
 * Hvorfor ikke bare «minst overskudd»? Det gir nesten alltid en haug små
 * spann (7 L → fem spann), som er dyrt per liter og upraktisk. Hvorfor
 * ikke bare «færrest spann»? Da blir 2 L til et 9 L-spann. Toleransen
 * er en avveiing: ingen i butikken kjøper fem småspann for å spare 1–2 L,
 * men heller ikke et 9 L-spann for 2 L.
 *
 * Hvorfor 30 % og ikke 15 %? Med 15 % får 7 L fortsatt fem spann
 * (3 × 2,7 L gir 1,1 L overskudd, rett over grensen på 1,05 L, og 1 × 9 L
 * gir 2 L). Med 30 % blir 7 L → 1 × 9 L, slik feillista (7.3 nr. 12) sier
 * er riktig, og 8,8 L → 1 × 9 L, 13,2 L → 1 × 9 + 2 × 2,7 L,
 * 20 L → 2 × 9 + 1 × 2,7 L, 2 L og 2,2 L → 1 × 2,7 L, 0,5 L → 1 × 0,68 L.
 * Den faste nedre grensen på 0,7 L gjør at små behov kan rundes opp til
 * neste spann (2,0 L → 2,7 L i stedet for 3 × 0,68 L).
 */
export const SPANN_TOLERANSE_MIN_L = 0.7;
export const SPANN_TOLERANSE_ANDEL = 0.3;

export function spannForslag(liter, storrelser = [9, 2.7, 0.68]) {
  const sizes = [...storrelser].filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => b - a);
  if (!Number.isFinite(liter) || liter <= 0 || sizes.length === 0) {
    return { kombinasjon: [], tekst: '0 L', dekker: 0, tilOvers: 0 };
  }

  // Øvre grense per størrelse: nok til å dekke alt alene (+1), men for
  // de mindre størrelsene aldri flere enn det som tilsvarer neste større
  // spann (+2) — flere enn det er aldri et fornuftig forslag og holder
  // søket lite også for store behov.
  const maks = sizes.map((s, i) => {
    const alene = Math.ceil(liter / s - 1e-9) + 1;
    return i === 0 ? alene : Math.min(alene, Math.ceil(sizes[i - 1] / s) + 2);
  });

  const EPS = 1e-9;
  const toleranse = Math.max(SPANN_TOLERANSE_MIN_L, SPANN_TOLERANSE_ANDEL * liter);
  let bestInnen = null; // færrest spann innen toleransen
  let bestUtenfor = null; // minst overskudd

  const antall = new Array(sizes.length).fill(0);
  const vurder = () => {
    let dekker = 0, n = 0;
    for (let i = 0; i < sizes.length; i++) { dekker += antall[i] * sizes[i]; n += antall[i]; }
    if (dekker + EPS < liter) return;
    const over = dekker - liter;
    const kand = { antall: [...antall], dekker, over, n };
    if (over <= toleranse + EPS) {
      if (!bestInnen || n < bestInnen.n || (n === bestInnen.n && over < bestInnen.over - EPS)) bestInnen = kand;
    }
    if (!bestUtenfor || over < bestUtenfor.over - 0.05 ||
        (Math.abs(over - bestUtenfor.over) <= 0.05 && n < bestUtenfor.n)) bestUtenfor = kand;
  };
  const sok = (i) => {
    if (i === sizes.length) { vurder(); return; }
    for (let k = 0; k <= maks[i]; k++) { antall[i] = k; sok(i + 1); }
    antall[i] = 0;
  };
  sok(0);

  const valgt = bestInnen || bestUtenfor;
  const kombinasjon = sizes
    .map((l, i) => ({ l, antall: valgt.antall[i], label: fmtLiter(l) }))
    .filter((k) => k.antall > 0);
  const dekker = Math.round(valgt.dekker * 100) / 100;
  return {
    kombinasjon,
    tekst: kombinasjon.length ? kombinasjon.map((k) => k.antall + ' × ' + k.label).join(' + ') : '0 L',
    dekker,
    tilOvers: Math.round((valgt.dekker - liter) * 100) / 100,
  };
}

/* ---------------------------- Utregning ---------------------------- */

function ugyldig(detaljLabels, melding, enhet) {
  return {
    ok: false,
    hoved: { tall: NaN, tekst: '—', enhet },
    detaljer: detaljLabels.map((label) => ({ label, tekst: '—' })),
    advarsler: [melding],
    mengde: null,
    sammendrag: '',
  };
}

function regnMaling(v) {
  const areal = tall(v['mal-areal']);
  const strok = tall(v['mal-strok']);
  const forbruk = tall(v['mal-forbruk']);
  const svinn = tall(v['mal-svinn']);
  const merknad = 'Spannstørrelser regnet i 9 L, 2,7 L og 0,68 L — vanlige størrelser fra Jotun/Nordsjø. Første strøk suger normalt mer enn strøk nummer to, så reelt forbruk kan avvike noe fra et jevnt snitt.';

  if (![areal, strok, forbruk].every((x) => Number.isFinite(x) && x > 0)) {
    return { ...ugyldig(['Anbefalt innkjøp', 'Det gir'], 'Fyll inn areal, antall strøk og forbruk.', 'liter'), merknad };
  }

  const liter = (areal * strok / forbruk) * svinnFaktor(svinn);
  const spann = spannForslag(liter);
  const literTekst = fmtLiter(liter);

  const advarsler = [];
  if (forbruk < 6 || forbruk > 14) advarsler.push('Forbruket (' + fmt(forbruk, forbruk % 1 === 0 ? 0 : 1) + ' m²/L) er utenfor 6–14 m²/L, som er vanlig for vegg- og takmaling — dobbeltsjekk tallet fra produktdatabladet.');
  if (Math.round(strok) !== strok || strok < 1) advarsler.push('Antall strøk bør være et helt tall, minst 1.');

  return {
    ok: true,
    hoved: { tall: liter, tekst: literTekst, enhet: 'liter' },
    detaljer: [
      { label: 'Anbefalt innkjøp', tekst: spann.tekst },
      { label: 'Det gir', tekst: fmtLiter(spann.dekker) },
    ],
    advarsler,
    merknad,
    mengde: Math.round(liter * 100) / 100,
    sammendrag: 'Maling: ' + spann.tekst + ' (' + literTekst + ')',
    spann,
  };
}

function regnSparkel(v) {
  const areal = tall(v['sp-areal']);
  const forbruk = tall(v['sp-forbruk']);
  const svinn = tall(v['sp-svinn']);
  const sekk = tall(v['sp-sekk']);
  const merknad = 'Forbruket i kg/m² er totalt for alle strøk. 1,5 kg/m² er et vanlig snitt for helsparkling. Tommelfingerregel ellers: ca. 1 kg/m² per mm sjikt. Bare K3 er helsparkling; K2 er skjøt og flekk og bruker langt mindre — legg inn forbruket etter hva du gjør. Sjekk alltid sekken; produktene varierer.';

  if (![areal, forbruk, sekk].every((x) => Number.isFinite(x) && x > 0)) {
    return { ...ugyldig(['Masse inkl. svinn', 'Fordelt'], 'Fyll inn areal, forbruk og sekkestørrelse.', 'sekker'), merknad };
  }

  const kg = areal * forbruk * svinnFaktor(svinn);
  const enheter = Math.ceil(kg / sekk);
  const hovedTekst = flertall(enheter, 'sekk/spann', 'sekker/spann');
  const kgTekst = fmt(kg, 0) + ' kg';

  const advarsler = [];
  if (forbruk > 4) advarsler.push('Over 4 kg/m² tilsvarer et ganske tykt sjikt — bygg heller opp i flere omganger, og la hvert strøk tørke.');

  return {
    ok: true,
    hoved: { tall: enheter, tekst: hovedTekst, enhet: 'sekker' },
    detaljer: [
      { label: 'Masse inkl. svinn', tekst: kgTekst },
      { label: 'Fordelt', tekst: enheter + ' × ' + fmt(sekk, sekk % 1 === 0 ? 0 : 1) + ' kg' },
    ],
    advarsler,
    merknad,
    mengde: Math.round(kg),
    sammendrag: 'Sparkelmasse: ' + hovedTekst + ' (' + kgTekst + ')',
  };
}

function regnBad(v) {
  const arealTotal = tall(v['bad-areal']);
  const arealDusj = tall(v['bad-areal-dusj']);
  const hSluk = tall(v['bad-sluk']);
  const avstandDusj = tall(v['bad-avstand-dusj']);
  const avstandHoyeste = tall(v['bad-avstand-hoyeste']);
  let faktor = parseFloat(v['bad-form']);
  if (!Number.isFinite(faktor) || faktor <= 0) faktor = 0.6667;
  const varmekabel = v['bad-varmekabel'] === true || v['bad-varmekabel'] === 'true';
  const forbruk = tall(v['bad-forbruk']);
  const svinn = tall(v['bad-svinn']);
  const sekk = tall(v['bad-sekk']);
  const merknad = 'Modellen antar jevnt fall i hver sone: 1:50 fra sluket til dusjsonekanten, deretter 1:100 videre ut til høyeste punkt. Rørgjennomføringer og ujevnt undergulv endrer forbruket utover dette — legg på ekstra ved tvil.';
  const labels = ['Masse inkl. svinn', 'Snitt lagtykkelse, dusjsone', 'Snitt lagtykkelse, resten', 'Sluk → dusjsonekant → høyeste punkt'];

  const ok = [arealTotal, arealDusj, hSluk, avstandDusj, avstandHoyeste, forbruk, sekk]
    .every((x) => Number.isFinite(x) && x >= 0) && arealTotal > 0 && forbruk > 0 && sekk > 0;
  if (!ok) return { ...ugyldig(labels, 'Fyll inn areal, avstander, forbruk og sekkestørrelse.', 'sekker'), merknad };

  // Dusjsonen faller 1:50 (20 mm/m) fra sluket til sonekanten, resten av
  // gulvet fortsetter derfra med 1:100 (10 mm/m) ut til høyeste punkt.
  const arealRest = Math.max(arealTotal - arealDusj, 0);
  const fallDusj = avstandDusj * 20;
  const hDusjKant = hSluk + fallDusj;
  const strekkRest = Math.max(avstandHoyeste - avstandDusj, 0);
  const fallRest = strekkRest * 10;
  const hHoyeste = hDusjKant + fallRest;
  const snittDusj = hSluk + fallDusj * faktor;
  const snittRest = hDusjKant + fallRest * faktor;

  const kgRent = arealDusj * snittDusj * forbruk + arealRest * snittRest * forbruk;
  const kg = kgRent * svinnFaktor(svinn);
  const sekker = Math.ceil(kg / sekk);
  const hovedTekst = flertall(sekker, 'sekk', 'sekker');
  const kgTekst = fmt(kg, 0) + ' kg';

  const advarsler = [];
  if (arealDusj > arealTotal) advarsler.push('Dusjsonen kan ikke være større enn totalarealet — sjekk arealtallene.');
  if (avstandHoyeste < avstandDusj) advarsler.push('Avstanden til høyeste punkt er kortere enn avstanden til dusjsonekanten — sjekk måltallene.');
  // Feil 16: 0 mm ved sluket er også under minstemålet.
  if (hSluk < 4) advarsler.push('Tykkelsen ved sluket (' + fmt(hSluk, 0) + ' mm) er under minste lagtykkelse på 4 mm for weberfloor 120 Reno.');
  if (hHoyeste > 50) advarsler.push('Høyeste punkt blir ' + fmt(hHoyeste, 0) + ' mm — over maks 50 mm i ett sjikt. Bygg opp i flere omganger med priming mellom.');
  if (fallDusj === 0 && fallRest === 0) advarsler.push('Fallhøyden er 0 mm i begge soner — da regnes gulvet som plant, uten fall til sluk.');
  if (varmekabel) advarsler.push(VARMEKABEL_TEKST + ', særlig nær sluket der laget er tynnest.');

  return {
    ok: true,
    hoved: { tall: sekker, tekst: hovedTekst, enhet: 'sekker' },
    detaljer: [
      { label: labels[0], tekst: kgTekst },
      { label: labels[1], tekst: fmt(snittDusj, 1) + ' mm' },
      { label: labels[2], tekst: fmt(snittRest, 1) + ' mm' },
      { label: labels[3], tekst: fmt(hSluk, 0) + ' → ' + fmt(hDusjKant, 0) + ' → ' + fmt(hHoyeste, 0) + ' mm' },
    ],
    advarsler,
    merknad,
    mengde: Math.round(kg),
    sammendrag: 'Masse til bad: ' + hovedTekst + ' (' + kgTekst + ')',
  };
}

function regnForbruk(v) {
  const areal = tall(v['fb-areal']);
  const tykk = tall(v['fb-tykk']);
  const forbruk = tall(v['fb-forbruk']);
  const svinn = tall(v['fb-svinn']);
  const sekk = tall(v['fb-sekk']);
  const varmekabel = v['fb-varmekabel'] === true || v['fb-varmekabel'] === 'true';
  const merknad = 'Vannmengden regnes med 3,6 liter per 20 kg sekk (weberfloor 120 Reno). Andre produkter har annet blandeforhold — sjekk sekken.';

  if (![areal, tykk, forbruk, sekk].every((x) => Number.isFinite(x) && x > 0)) {
    return { ...ugyldig(['Masse inkl. svinn', 'Vann til blanding'], 'Fyll inn areal, lagtykkelse, forbruk og sekkestørrelse.', 'sekker'), merknad };
  }

  const kg = areal * tykk * forbruk * svinnFaktor(svinn);
  const sekker = Math.ceil(kg / sekk);
  const vann = sekker * (3.6 / 20) * sekk;
  const hovedTekst = flertall(sekker, 'sekk', 'sekker');
  const kgTekst = fmt(kg, 0) + ' kg';

  const advarsler = [];
  if (tykk < 4) advarsler.push('Lagtykkelsen er under minste lagtykkelse på 4 mm for weberfloor 120 Reno.');
  if (tykk > 50) advarsler.push('Lagtykkelsen er over maks 50 mm i ett sjikt — bygg opp i flere omganger med priming mellom.');
  if (varmekabel) advarsler.push(VARMEKABEL_TEKST + '.');

  return {
    ok: true,
    hoved: { tall: sekker, tekst: hovedTekst, enhet: 'sekker' },
    detaljer: [
      { label: 'Masse inkl. svinn', tekst: kgTekst },
      { label: 'Vann til blanding', tekst: fmt(vann, 1) + ' liter' },
    ],
    advarsler,
    merknad,
    mengde: Math.round(kg),
    sammendrag: 'Avrettingsmasse: ' + hovedTekst + ' (' + kgTekst + ')',
  };
}

/** Vegg-, tak- og totalareal fra rom-feltene, eller null ved ugyldige mål.
 *  UI-et kan sende `vegg` eller `total` videre til mal-areal OG sp-areal. */
export function romTilAreal(verdier) {
  const v = { ...standardverdier('calc-rom'), ...(verdier || {}) };
  const L = tall(v['rom-lengde']);
  const B = tall(v['rom-bredde']);
  const H = tall(v['rom-hoyde']);
  const dorer = tall(v['rom-dorer']);
  const vinduer = tall(v['rom-vinduer']);
  if (![L, B, H].every((x) => Number.isFinite(x) && x > 0)) return null;

  const omkrets = 2 * (L + B);
  const brutto = omkrets * H;
  const fratrekk = (Number.isFinite(dorer) && dorer > 0 ? dorer * DOR_M2 : 0)
                 + (Number.isFinite(vinduer) && vinduer > 0 ? vinduer * VINDU_M2 : 0);
  const netto = brutto - fratrekk;
  const vegg = netto > 0 ? netto : 0;
  const tak = L * B;
  return { vegg, tak, total: vegg + tak, omkrets, H, fratrekkForStort: netto <= 0 };
}

function regnRom(v) {
  const a = romTilAreal(v);
  const merknad = 'Dør regnes som 1,6 m² (0,9 × 2,0 minus karm) og vindu som 1,5 m², som er vanlige snitt. Har du avvikende størrelser, mål dem og trekk fra selv — eller bruk 0 her og juster arealet i kalkulatoren.';
  if (!a) {
    return { ...ugyldig(['Takareal', 'Vegg + tak', 'Omkrets (til lister)'], 'Fyll inn lengde, bredde og takhøyde.', 'm²'), merknad };
  }

  const advarsler = [];
  if (a.fratrekkForStort) advarsler.push('Fratrekket for dører og vinduer er større enn hele veggflaten. Sjekk antallet.');
  if (a.H < 2 || a.H > 5) advarsler.push('Takhøyden ser uvanlig ut — er den i meter?');

  const totalTekst = fmt(a.total, 1) + ' m²';
  return {
    ok: true,
    hoved: { tall: a.vegg, tekst: fmt(a.vegg, 1) + ' m²', enhet: 'm²' },
    detaljer: [
      { label: 'Takareal', tekst: fmt(a.tak, 1) + ' m²' },
      { label: 'Vegg + tak', tekst: totalTekst },
      { label: 'Omkrets (til lister)', tekst: fmt(a.omkrets, 2) + ' m' },
    ],
    advarsler,
    merknad,
    mengde: null,
    sammendrag: 'Romareal: ' + totalTekst,
    areal: { vegg: a.vegg, tak: a.tak, total: a.total },
  };
}

const REGNERE = {
  'calc-maling': regnMaling,
  'calc-sparkel': regnSparkel,
  'calc-bad': regnBad,
  'calc-forbruk': regnForbruk,
  'calc-rom': regnRom,
};

/**
 * Regn ut én kalkulator. `verdier` er råverdiene fra feltene
 * ({feltId: streng | boolean}); felt som mangler (undefined) får
 * standardverdien. En tom streng er derimot «ikke fylt inn».
 */
export function regn(calcId, verdier) {
  hentKalk(calcId);
  const v = { ...standardverdier(calcId) };
  for (const [k, x] of Object.entries(verdier || {})) if (x !== undefined) v[k] = x;
  return REGNERE[calcId](v);
}

/* ----------------------------- Smartsøk ---------------------------- */

const CHARMAP = { 'å': 'a', 'ä': 'a', 'æ': 'a', 'ø': 'o', 'ö': 'o', 'é': 'e', 'è': 'e', 'ü': 'u', 'ç': 'c' };
export function norm(s) {
  s = String(s || '').toLowerCase();
  let out = '';
  for (const ch of s) out += CHARMAP[ch] || ch;
  return out;
}

/*
 * Rett feil 24. Ord matches mot HELE ord i den normaliserte teksten.
 * Ord som slutter på * matcher også ord som begynner slik (bøyninger og
 * sammensetninger: «fallet», «dusjsone», «våtromsgulv»). Korte, tvetydige
 * ord («mal», «bad») er uten * så de ikke treffer inne i andre ord.
 *
 * Gruppene sjekkes i rekkefølge — mest spesifikke først:
 *  1. fall/sluk      → bad (flatt-gulv-kalkulatoren kan ikke regne fall)
 *  2. avretting, flytsparkel, sparkelmasse → avretting
 *  3. maling          (verbet/materialet sier mer enn rommet: «male bad»)
 *  4. sparkel
 *  5. bad/våtrom/dusj → bad
 *  6. gulv            → avretting (generelt ord, sist)
 */
const SMART_TARGETS = [
  { ord: ['fall*', 'sluk*'], calc: 'calc-bad', felt: 'bad-areal' },
  { ord: ['avrett*', 'flytsparkel*', 'sparkelmasse*', 'flytmasse*'], calc: 'calc-forbruk', felt: 'fb-areal' },
  { ord: ['maling*', 'male', 'maler', 'malt', 'mal', 'males', 'malte', 'maleren'], calc: 'calc-maling', felt: 'mal-areal' },
  { ord: ['sparkel*', 'sparkl*'], calc: 'calc-sparkel', felt: 'sp-areal' },
  { ord: ['bad', 'badet', 'baderom*', 'badegulv*', 'vatrom*', 'dusj*'], calc: 'calc-bad', felt: 'bad-areal' },
  { ord: ['gulv*'], calc: 'calc-forbruk', felt: 'fb-areal' },
];

const RE_AREAL = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|kvm|kvadratmeter|kvadrat)(?![a-z0-9])/;
const RE_MAL = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm)?/;
const MAKS_ROMMAAL = 30; // meter; ≥ 100 er uansett millimeter («150x150»)

const nordiskTall = (s) => parseFloat(String(s).replace(',', '.'));
const visTall = (n) => fmt(n, n % 1 === 0 ? 0 : 1);
const somFeltverdi = (s) => String(s).replace('.', ',');

function ordTreff(ord, kandidat) {
  return kandidat.endsWith('*') ? ord.startsWith(kandidat.slice(0, -1)) : ord === kandidat;
}

const plausibeltRommaal = (n) => Number.isFinite(n) && n > 0 && n <= MAKS_ROMMAAL;

/**
 * Tolker et søk som en utregning. Returnerer null eller
 * { calcId, verdier: {feltId: streng}, tekst }.
 */
export function tolkSok(query) {
  const q = norm(query);
  if (!q.trim()) return null;

  // «4x3» eller «4 x 3 x 2,4» → Romareal, men bare når tallene kan være
  // et rom i meter (feil 25: «150x150» er en flis i mm, ikke et rom).
  const mal = q.match(RE_MAL);
  if (mal && !mal[4]) {
    const L = nordiskTall(mal[1]), B = nordiskTall(mal[2]);
    const H = mal[3] ? nordiskTall(mal[3]) : null;
    if (plausibeltRommaal(L) && plausibeltRommaal(B) && (H === null || plausibeltRommaal(H))) {
      const verdier = { 'rom-lengde': somFeltverdi(mal[1]), 'rom-bredde': somFeltverdi(mal[2]) };
      if (H !== null) verdier['rom-hoyde'] = somFeltverdi(mal[3]);
      return {
        calcId: 'calc-rom',
        verdier,
        tekst: 'Romareal for ' + visTall(L) + ' × ' + visTall(B) + (H !== null ? ' × ' + visTall(H) : '') + ' m',
      };
    }
  }

  // «<tall> m2» + et nøkkelord som peker på én bestemt kalkulator.
  const areal = q.match(RE_AREAL);
  if (!areal) return null;
  const verdi = nordiskTall(areal[1]);
  if (!Number.isFinite(verdi) || verdi <= 0) return null;

  const ord = q.match(/[a-z]+/g) || [];
  const treff = SMART_TARGETS.find((t) => t.ord.some((k) => ord.some((o) => ordTreff(o, k))));
  if (!treff) return null; // areal uten nøkkelord — for utrygt å gjette

  return {
    calcId: treff.calc,
    verdier: { [treff.felt]: somFeltverdi(areal[1]) },
    tekst: KALK_MAP[treff.calc].navn + ' for ' + visTall(verdi) + ' m²',
  };
}
