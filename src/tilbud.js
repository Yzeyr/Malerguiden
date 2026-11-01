/* Tilbudstekst til kunden, laget av kalkylen på jobben.

   Tallene (pris, mva, m²) settes alltid inn her, aldri av en språkmodell.
   Apples språkmodell på telefonen får bare skrive om arbeidsbeskrivelsen til
   vanlig, vennlig norsk. Uten appen (eller uten Apple Intelligence) brukes
   malteksten som den er. */

import { romMengder, MED_ALT } from './kalkyle.js';

const tall = (v, d = 0) => Number(v || 0).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
const kr = (v) => tall(Math.round(v)) + ' kr';
const m2 = (v) => tall(v, 1).replace(/,0$/, '') + ' m²';

const SPARKLING_TEKST = {
  K1: 'enkel sparkling av skjøter og skruehull (K1)',
  K2: 'sparkling av skjøter, hjørner og skader (K2)',
  K3: 'helsparkling av hele flaten med sliping (K3)',
};

function flateTekst(navn, f, m) {
  if (!f || !(m > 0)) return null;
  const deler = [];
  if (f.sparkling && f.sparkling !== 'ingen') deler.push(SPARKLING_TEKST[f.sparkling] || 'sparkling');
  if (f.grunning || (f.sparkling && f.sparkling !== 'ingen')) deler.push('grunning');
  if (f.strok > 0) deler.push(f.strok + ' strøk maling');
  if (!deler.length) return null;
  return navn + ' (' + m2(m) + '): ' + deler.join(', ') + '.';
}

/**
 * Det tilbudet bygger på, hentet fra jobben og beregningen.
 * job: jobben, r: beregn(...), tork: dagerMedTork(r), forbehold: liste med tekster.
 */
export function tilbudsData(job, r, { tork = null, forbehold = [] } = {}) {
  const k = job.kalkyle || { rom: [], arbeid: {}, tillegg: [] };
  const a = k.arbeid || {};
  const rom = (k.rom || []).map((x) => ({ x, m: romMengder(x) })).filter(({ m }) => m.ok).map(({ x, m }) => {
    const med = { ...MED_ALT, ...(x.med || {}) };
    const flater = [med.vegg && 'vegger', med.tak && 'tak', med.lister && a.lister?.strok > 0 && 'lister',
      med.vinduer && m.vinduer > 0 && a.vinduer?.strok > 0 && 'vinduer', med.dorer && m.dorer > 0 && a.dorer?.strok > 0 && 'dører'].filter(Boolean);
    return { navn: x.navn || 'Rom', vegg: med.vegg ? m.vegg : 0, tak: med.tak ? m.tak : 0, flater, trapp: !!x.trapp, bareMaling: med.sparkling === false };
  });
  const arbeid = [
    flateTekst('Vegger', a.vegg, r.mengder.vegg),
    flateTekst('Tak', a.tak, r.mengder.tak),
    a.lister?.strok > 0 && r.mengder.lister > 0 && 'Lister (' + tall(r.mengder.lister, 1).replace(/,0$/, '') + ' m): ' + a.lister.strok + ' strøk.',
    a.vinduer?.strok > 0 && r.mengder.vinduer > 0 && 'Vinduer (' + r.mengder.vinduer + ' stk): ' + a.vinduer.strok + ' strøk.',
    a.dorer?.strok > 0 && r.mengder.dorer > 0 && 'Dører (' + r.mengder.dorer + ' stk): ' + a.dorer.strok + ' strøk.',
    a.listefritt?.tak && 'Listefri overgang mellom vegg og tak, sparklet og malt med skarp linje.',
    a.listefritt?.hjorner && 'Listefrie innerhjørner, sparklet.',
    (a.listefritt?.vinduer || a.listefritt?.dorer) && 'Listefritt rundt ' + [a.listefritt.vinduer && 'vinduer', a.listefritt.dorer && 'dører'].filter(Boolean).join(' og ') + ', med sparklet og malt smyg.',
    r.mengder.dekking > 0 && 'Tildekking av gulv og maskering, og rydding etter oss.',
    (k.rom || []).some((x) => x.mobler) && 'Flytting og tildekking av møbler.',
    r.mengder.gulvbelegg > 0 && 'Gulvbelegg (' + m2(r.mengder.gulvbelegg) + ').',
    ...(k.tillegg || []).filter((t) => t.tekst).map((t) => t.tekst.replace(/\.?$/, '.')),
  ].filter(Boolean);
  const farger = (job.farger || []).filter((f) => f.produkt || f.kode)
    .map((f) => [f.rom, [f.produkt, f.kode].filter(Boolean).join(' '), f.glans && 'glans ' + f.glans].filter(Boolean).join(': ').replace(/: glans/, ', glans'));
  return {
    kunde: job.kunde?.navn || '',
    adresse: job.kunde?.adresse || '',
    sted: job.rom || '',
    rom, arbeid, farger,
    sum: { eksMva: r.sum.eksMva, mva: r.sum.mva, inklMva: r.sum.inklMva },
    dager: tork ? { arbeid: tork.arbeidsdager, totalt: tork.dager } : null,
    forbehold: forbehold.filter(Boolean),
  };
}

/** Arbeidsbeskrivelsen alene: rommene og hva som gjøres. */
export function arbeidMal(d) {
  const linjer = [];
  if (d.rom.length) {
    linjer.push('Rom: ' + d.rom.map((x) => x.navn + (x.flater.length ? ' (' + x.flater.join(', ') + ')' : '')).join('; ') + '.');
  }
  linjer.push('', 'Arbeidet:', ...d.arbeid.map((a) => '• ' + a));
  if (d.farger.length) linjer.push('', 'Farger:', ...d.farger.map((f) => '• ' + f));
  return linjer.join('\n').trim();
}

/** Hele tilbudet. beskrivelse: en omskrevet arbeidsbeskrivelse, ellers brukes malen. */
export function tilbudTekst(d, { beskrivelse = null, gyldigDager = 30 } = {}) {
  const hode = ['Tilbud på malerarbeid', [d.kunde, d.adresse].filter(Boolean).join(', ')].filter(Boolean);
  const pris = [
    'Pris:',
    'Arbeid og materialer: ' + kr(d.sum.eksMva) + ' eks. mva.',
    'Mva: ' + kr(d.sum.mva),
    'Totalt: ' + kr(d.sum.inklMva) + ' inkl. mva.',
  ];
  const tid = d.dager && d.dager.arbeid > 0
    ? 'Arbeidet tar omtrent ' + dagTekst(d.dager.arbeid) + (d.dager.totalt > d.dager.arbeid + 0.25 ? ', og ca. ' + dagTekst(d.dager.totalt, 'dag', 'dager') + ' fra start til ferdig med tørketid.' : '.')
    : null;
  const deler = [
    hode.join('\n'),
    d.sted && 'Gjelder: ' + d.sted,
    (beskrivelse || arbeidMal(d)).trim(),
    pris.join('\n'),
    tid,
    d.forbehold.length && 'Forbehold:\n' + d.forbehold.map((f) => '• ' + f).join('\n'),
    'Tilbudet gjelder i ' + gyldigDager + ' dager.',
  ].filter(Boolean);
  return deler.join('\n\n');
}

function dagTekst(dager, en = 'arbeidsdag', flere = 'arbeidsdager') {
  const n = Math.max(0.5, Math.round(dager * 2) / 2);
  return tall(n, n % 1 ? 1 : 0) + ' ' + (n === 1 ? en : flere);
}

/** Instrukser og spørsmål til språkmodellen på telefonen. */
export function tilbudPrompt(d) {
  const instrukser = [
    'Du er en erfaren norsk malermester som skriver tilbud til privatkunder.',
    'Skriv på norsk bokmål, kort, vennlig og konkret, uten salgsfloskler.',
    'Bruk bare arbeidet og rommene som står i dataene. Ikke legg til arbeid, materialer, garantier eller løfter som ikke står der.',
    'Ikke skriv priser, timer eller datoer; de settes inn etterpå.',
    'Behold målene (m², meter, antall) nøyaktig som de står.',
    'Forklar fagord kort i parentes første gang, for eksempel sparkling og grunning.',
  ].join(' ');
  const sporsmal = [
    'Skriv arbeidsbeskrivelsen i et tilbud: én innledende setning, så en punktliste med arbeidet, og til slutt fargene hvis de finnes.',
    'Svar bare med teksten, uten overskrift.',
    '',
    arbeidMal(d),
  ].join('\n');
  return { instrukser, sporsmal };
}

/** Sjekker at modellen ikke har funnet på tall som ikke står i dataene. */
export function tallStemmer(tekst, d) {
  const kilde = arbeidMal(d);
  const tallIKilde = new Set((kilde.match(/\d+(?:[.,]\d+)?/g) || []).map((t) => t.replace('.', ',')));
  const nye = (String(tekst).match(/\d+(?:[.,]\d+)?/g) || []).map((t) => t.replace('.', ',')).filter((t) => !tallIKilde.has(t));
  // «1.» og «2.» i en nummerert liste og strøk-tall som «to» er greit; ellers er det et nytt tall
  return nye.filter((t) => !/^[1-9]$/.test(t)).length === 0;
}
