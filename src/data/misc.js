/* ------------------------------------------------------------------ *
 * Diverse små tabeller fra gamle index.html. Alle id-er er nøkler i
 * brukerens lagrede jobber og må aldri endres. Alle tekster er ren tekst.
 * ------------------------------------------------------------------ */

// De fem som faktisk gjentar seg. Fritekstfeltet står under for resten.
// Id-ene lagres i `job.forbeholdValgt`. (Gamle linje 3828–3834.)
export const FORBEHOLD_VALG = [
  { id: 'sluk', tekst: 'Sluk ikke kontrollert innvendig' },
  { id: 'fukt', tekst: 'Underlag ikke fuktmålt' },
  { id: 'sprekker', tekst: 'Eksisterende sprekker i underlaget' },
  { id: 'glans', tekst: 'Glans ikke avklart' },
  { id: 'rom', tekst: 'Rom ikke ryddet ved oppstart' }
];

/* ---------- Mål ---------- *
 * Målene tas på stedet, før man regner på noe. Feltene bruker samme id-er
 * som kalkulatorene, så et mål skrevet inn her er det samme tallet som
 * kalkulatoren regner med — ingen oversettelse mellom to vokabularer.
 *
 * Dette løser også at kalkulatorfeltene er felles for hele appen: måler du
 * Hansens bad og så Bergs, ville tallene overskrevet hverandre. På jobben
 * blir de liggende hver for seg.
 *
 * Verdien lagres som rå streng i `job.maal[<felt-id>]`.
 * `gjelder(deler)` tar jobbens `deler`-array. (Gamle linje 3877–3896.)
 * ------------------------------------------------------------------- */
export const MAAL_GRUPPER = [
  { id: 'bad', tittel: 'Bad og fall', calc: 'calc-bad', gruppe: 'avretting',
    gjelder: (deler) => deler.some((d) => d.fag === 'bad'),
    felt: [
      { id: 'bad-areal', navn: 'Gulvareal', hint: 'hele rommet', enhet: 'm²' },
      { id: 'bad-areal-dusj', navn: 'Areal dusjsone', enhet: 'm²' },
      { id: 'bad-sluk', navn: 'Høyde gulv → sluk', hint: 'tykkelsen ved lavpunktet', enhet: 'mm' },
      { id: 'bad-avstand-dusj', navn: 'Sluk → kant dusjsone', enhet: 'm' },
      { id: 'bad-avstand-hoyeste', navn: 'Sluk → høyeste punkt', hint: 'normalt dørterskelen', enhet: 'm' }
    ] },
  { id: 'rom', tittel: 'Rommet', calc: 'calc-rom', gruppe: 'maling',
    gjelder: (deler) => deler.some((d) => d.fag !== 'bad'),
    felt: [
      { id: 'rom-lengde', navn: 'Lengde', enhet: 'm' },
      { id: 'rom-bredde', navn: 'Bredde', enhet: 'm' },
      { id: 'rom-hoyde', navn: 'Takhøyde', enhet: 'm' },
      { id: 'rom-dorer', navn: 'Antall dører', enhet: 'stk' },
      { id: 'rom-vinduer', navn: 'Antall vinduer', enhet: 'stk' }
    ] }
];

/** Fritekstfeltet under målene (`job.maalFritekst`, maks 600 tegn). Gamle linje 1190–1191. */
export const MAAL_FRITEKST = {
  label: 'Andre mål',
  hint: 'Oppkant, terskelhøyde, nisjer — det som ikke har eget felt',
  placeholder: 'F.eks. «Oppkant terskel 15 mm», «Nisje 40 × 60»',
  maxlength: 600
};

// Bildekategorier (`job.bilder[].kategori`). Gamle linje 4443–4448.
export const BILDE_KATEGORIER = [
  { id: 'for', label: 'Før' },
  { id: 'underveis', label: 'Underveis' },
  { id: 'ferdig', label: 'Ferdig' },
  { id: 'avvik', label: 'Avvik' },
  // Plantegninger som er målt på under Mål. Vises ikke som valg for nye bilder.
  { id: 'tegning', label: 'Tegning', skjult: true }
];

// Jobbstatus (`job.status`). Rekkefølgen er arbeidsgangen — planlagt, pågår,
// ferdig — med pauset som sidespor. Gamle linje 3142–3143 (inkl. prikkene).
export const JOB_STATUS = [
  { id: 'planlagt', label: 'Planlagt', dot: '⚪' },
  { id: 'pagar', label: 'Pågår', dot: '🟢' },
  { id: 'pauset', label: 'Pauset', dot: '🟡' },
  { id: 'ferdig', label: 'Ferdig', dot: '🔵' }
];

// Avtalt sparklingsklasse (`job.klasse`). Gamle linje 1220–1224.
export const KLASSER = [
  { id: '', label: 'Ikke avtalt' },
  { id: 'K2', label: 'K2 — helsparklet i ett strøk' },
  { id: 'K3', label: 'K3 — ekstra finstrøk over hele flaten' }
];
/** Forklaringen under klassevalget (gamle linje 1226). */
export const KLASSE_MERKNAD = 'Klassen avgjør pris, og om en synlig bulk er reklamasjon eller innenfor avtalen. Står den som «ikke avtalt», er det verdt å avklare den skriftlig før oppstart.';

// Fargeprotokoll (`job.farger[]`). `id` er feltnavnet i det lagrede
// objektet; gammel DOM-id var `farge-<id>`. Gamle linje 2069–2102.
// Produkt ELLER kode må fylles; alle verdier trimmes (unntatt dato).
// Standard ved ny rad: rom = jobbens `rom`, strok = '2', dato = i dag.
export const FARGE_FELT = [
  { id: 'rom', label: 'Rom', hint: 'F.eks. «Stue» eller «Bad, tak»', maxlength: 60 },
  { id: 'produkt', label: 'Produkt', hint: 'Merke og type', maxlength: 80 },
  { id: 'kode', label: 'Fargekode', hint: 'F.eks. «S 0500-N» eller «10557 Egghvit»', maxlength: 60 },
  { id: 'glans', label: 'Glans', hint: 'Tallet på spannet', maxlength: 12, inputmode: 'decimal' },
  { id: 'strok', label: 'Antall strøk', hint: '', maxlength: 4, inputmode: 'numeric' },
  { id: 'dato', label: 'Dato', hint: '', type: 'date' }
];
export const FARGE_FEIL_TOM = 'Fyll inn produkt eller fargekode — ellers er raden ikke til hjelp senere.';
