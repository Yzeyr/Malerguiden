/* ------------------------------------------------------------------ *
 * Fag, jobbtyper og sjekklister. Flyttet ordrett fra gamle index.html
 * (linje 2798–3133).
 *
 * VIKTIG: fag-id-er, jobbtype-id-er og sjekkpunkt-id-er er nøkler i
 * brukerens lagrede jobber (`del.fag`, `del.jobbtype`, `del.sjekkliste`).
 * De må aldri endres. Samme punkt-id kan forekomme i flere lister
 * (unik innen én liste). Alle tekster er ren tekst.
 * ------------------------------------------------------------------ */

// En jobb er ikke alltid et bad — appen dekker fire fag, så sjekklista må
// det også. Fag velges når jobben opprettes (eller settes fra hvilken
// kalkulator «Lagre til jobb» ble trykket i) og styrer hvilket sett som
// vises. Alle punktene er hentet fra de samme fallgruvene som «Vanlige
// feil» og fagfanene dokumenterer andre steder i appen.
//
// `label` er originalens tekst; `emoji` og `navn` er den delt i to;
// `kort` er ett ord til små merker.
export const FAG_DEFS = [
  { id: 'annet', label: '🔧 Annet', emoji: '🔧', navn: 'Annet', kort: 'Annet' },
  { id: 'bad', label: '🚿 Bad / våtrom', emoji: '🚿', navn: 'Bad / våtrom', kort: 'Bad' },
  { id: 'maling', label: '🎨 Maling', emoji: '🎨', navn: 'Maling', kort: 'Maling' },
  { id: 'sparkling', label: '🧱 Sparkling', emoji: '🧱', navn: 'Sparkling', kort: 'Sparkling' },
  { id: 'fasade', label: '🏠 Fasade', emoji: '🏠', navn: 'Fasade', kort: 'Fasade' }
];

/** id → fag-definisjon. */
export const FAG_BY_ID = {};
FAG_DEFS.forEach((f) => { FAG_BY_ID[f.id] = f; });

// Sjekklista følger arbeidsgangen i faser, ikke én lang liste: en maler
// står ikke og leser «alt som skal gjøres», han står i én fase og trenger
// å se hva som gjenstår i den. Rekkefølgen og punktene er de samme som
// fremgangsmåtene i fagfanene beskriver.
// Under hvert fag ligger jobbtyper der arbeidet faktisk er forskjellig.
// Maling har ingen: tak, vegg og listverk har samme arbeidsgang, og en
// ekstra meny der ville bare vært et ekstra trykk.
export const JOBBTYPER = {
  bad: [
    { id: 'full', label: 'Full jobb — avretting og belegg' },
    { id: 'avretting', label: 'Kun avretting og fall' },
    { id: 'belegg', label: 'Kun belegg' }
  ],
  sparkling: [
    { id: 'hel', label: 'Helsparkling' },
    { id: 'skjot', label: 'Skjøtsparkling / taping' },
    { id: 'reparasjon', label: 'Reparasjon alene', praksis: true }
  ],
  fasade: [
    { id: 'mur', label: 'Mur og puss' },
    { id: 'treverk', label: 'Treverk og kledning' }
  ]
};

// Sjekklister for fag uten jobbtyper.
export const SJEKKLISTE_BY_FAG = {
  maling: [
    { fase: 'Før oppstart', items: [
      { id: 'bilde-for', label: '📸 Før-bilde tatt' },
      { id: 'underlag', label: 'Underlag kontrollert' },
      { id: 'produkttype', label: 'Produkttype valgt etter underlag og forhold' },
      { id: 'farge', label: 'Farge og glans avklart med kunde' },
      { id: 'temperatur', label: 'Temperatur ≥ 10–15 °C i luft og underlag' }
    ]},
    { fase: 'Klargjøring', items: [
      { id: 'vask', label: 'Vasket og rengjort' },
      { id: 'sparkling', label: 'Sparklet og reparert der det trengs' },
      { id: 'grunning', label: 'Grunnet' },
      { id: 'tildekking', label: 'Tildekket og tapet' }
    ]},
    { fase: 'Maling', items: [
      { id: 'strok1', label: 'Første strøk' },
      { id: 'mellomslip', label: 'Lett slipt og støvtørket mellom strøk' },
      { id: 'strok2', label: 'Siste strøk' }
    ]},
    { fase: 'Kontroll', items: [
      { id: 'slepelys', label: 'Kontrollert med slepelys' },
      { id: 'tape', label: 'Tape og tildekking fjernet' },
      { id: 'bilder', label: '📸 Etter-bilder tatt' }
    ]}
  ],
  annet: [
    { fase: 'Før oppstart', items: [
      { id: 'bilde-for', label: '📸 Før-bilde tatt' },
      { id: 'underlag', label: 'Underlag kontrollert' },
      { id: 'avtalt', label: 'Produkt, farge eller klasse avtalt skriftlig' }
    ]},
    { fase: 'Utførelse', items: [
      { id: 'tildekking', label: 'Tildekking lagt der det trengs' },
      { id: 'utfort', label: 'Arbeidet utført' }
    ]},
    { fase: 'Kontroll', items: [
      { id: 'sluttkontroll', label: 'Sluttkontroll i godt lys' },
      { id: 'bilder', label: '📸 Etter-bilder tatt' }
    ]}
  ]
};

// Sjekklister per jobbtype. Den første typen i JOBBTYPER er også den
// gamle, udelte lista for faget — så jobber laget før typene fantes
// beholder nøyaktig sine avhukinger.
export const SJEKKLISTE_BY_TYPE = {
  bad: {
    full: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'underlag', label: 'Underlag kontrollert (planhet, skader)' },
        { id: 'fall-mal', label: 'Fall målt opp, høyder satt ut' },
        { id: 'sluk', label: 'Sluk kontrollert — nivå og plassering' },
        { id: 'fukt', label: 'Fukt målt' },
        { id: 'produkt', label: 'Produkt/system dokumentert for våtrom' }
      ]},
      { fase: 'Klargjøring', items: [
        { id: 'rengjor', label: 'Rengjort, gammelt belegg fjernet' },
        { id: 'slip', label: 'Slipt' },
        { id: 'primer', label: 'Primet' },
        { id: 'avrett', label: 'Avrettet / fall bygget' }
      ]},
      { fase: 'Belegg', items: [
        { id: 'akklim', label: 'Akklimatisert ≥ 24 t i romtemperatur' },
        { id: 'lim', label: 'Limt — full liming (helflating)' },
        { id: 'oppbrett', label: 'Oppbrett på vegg utført' },
        { id: 'slukdetalj', label: 'Slukdetalj (klemring/mansjett) utført' },
        { id: 'sveis', label: 'Skjøter sveist' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'kontroll-fall', label: 'Fall kontrollert på ferdig gulv' },
        { id: 'kontroll-skjot', label: 'Skjøter kontrollert — 100 mm fra sluk, ikke i ytterhjørne' },
        { id: 'kontroll-oppbrett', label: 'Oppbrett og slukdetalj kontrollert' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ],
    avretting: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'underlag', label: 'Underlag kontrollert (planhet, skader)' },
        { id: 'sluk', label: 'Sluk kontrollert — nivå og plassering' },
        { id: 'fall-mal', label: 'Høyder satt ut mot terskel og oppkant' },
        { id: 'fukt', label: 'Fukt målt' }
      ]},
      { fase: 'Klargjøring', items: [
        { id: 'rengjor', label: 'Rengjort og støvsugd' },
        { id: 'skader', label: 'Skader og hull reparert' },
        { id: 'slip', label: 'Slipt' },
        { id: 'primer', label: 'Primet' }
      ]},
      { fase: 'Avretting', items: [
        { id: 'produktvalg', label: 'Produkt egnet for fallforming — ikke ren selvutjevnende masse' },
        { id: 'avrett', label: 'Avrettet og fall formet' },
        { id: 'herding', label: 'Herdet etter databladets tid for lagtykkelsen' },
        { id: 'sluttslip', label: 'Sluttslipt' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'kontroll-fall', label: 'Fall kontrollert på herdet flate' },
        { id: 'kontroll-motfall', label: 'Kontrollert for motfall ved sluk og langs vegger' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ],
    belegg: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'underlag', label: 'Avrettet underlag kontrollert — planhet og fall' },
        { id: 'fukt', label: 'Fukt målt i underlaget' },
        { id: 'produkt', label: 'Belegg, lim, sveisetråd og sluk hører til samme dokumenterte system' },
        { id: 'skjotplan', label: 'Beleggretning og skjøter planlagt før kutting' }
      ]},
      { fase: 'Belegg', items: [
        { id: 'akklim', label: 'Akklimatisert ≥ 24 t i romtemperatur' },
        { id: 'lim', label: 'Limt — full liming (helflating)' },
        { id: 'oppbrett', label: 'Oppbrett på vegg utført' },
        { id: 'slukdetalj', label: 'Slukdetalj (klemring/mansjett) utført' },
        { id: 'sveis', label: 'Skjøter sveist etter at limet har satt seg' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'kontroll-fall', label: 'Fall kontrollert på ferdig gulv, belegget medregnet' },
        { id: 'kontroll-skjot', label: 'Skjøter kontrollert — 100 mm fra sluk, ikke i ytterhjørne' },
        { id: 'kontroll-oppbrett', label: 'Oppbrett og slukdetalj kontrollert' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ]
  },
  sparkling: {
    hel: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'klasse', label: 'Estetisk klasse (K1–K3) avtalt skriftlig' },
        { id: 'underlag', label: 'Underlag kontrollert' },
        { id: 'hurtigsparkel', label: 'Skader, tverrskjøter og glipper over 2 mm fylt med hurtigsparkel (Ardex A 828)' }
      ]},
      { fase: 'Utførelse', items: [
        { id: 'taping', label: 'Strimling i skjøter og hjørner — skruehull i samme omgang' },
        { id: 'fyllstrok', label: 'Fyll- og finstrøk på skjøtene — skruehull i samme omgang' },
        { id: 'fintstrok', label: 'Helsparkling over hele flaten, vanligvis to strøk (K3)' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'torketid', label: 'Tørket fullt før sliping' },
        { id: 'sliping', label: 'Slipt — grovt P80–P120, fint P180–P240' },
        { id: 'sidelys', label: 'Kontrollert med strøkende sidelys' },
        { id: 'grunning', label: 'Sparklede flater grunnet før maling' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ],
    // K2 er tre strøk: strimling, ett fyllstrøk, ett finstrøk. Skruehullene
    // tas i samme omgang som hvert strøk — ikke som en egen runde til slutt,
    // for da får de færre strøk enn skjøtene og kommer fram i sidelys.
    // (Id-en «taping» er beholdt fra før så gamle avhukinger står igjen.)
    skjot: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'klasse', label: 'Estetisk klasse (K1–K3) avtalt skriftlig' },
        { id: 'underlag', label: 'Plateskjøter kontrollert, skruehoder senket' },
        { id: 'hurtigsparkel', label: 'Skader, tverrskjøter og glipper over 2 mm fylt med hurtigsparkel (Ardex A 828)' }
      ]},
      { fase: 'Utførelse — tre strøk ved K2', items: [
        { id: 'taping', label: '1. Strimling i alle skjøter og hjørner — skruehull i samme omgang' },
        { id: 'fyllstrok', label: '2. Fyllstrøk over skjøtene — skruehull i samme omgang' },
        { id: 'fintstrok', label: '3. Finstrøk med bred sparkel — skruehull i samme omgang' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'torketid', label: 'Tørket fullt mellom hvert strøk' },
        { id: 'sliping', label: 'Slipt jevnt med resten av veggen' },
        { id: 'sidelys', label: 'Kontrollert med strøkende sidelys' },
        { id: 'grunning', label: 'Sparklede flater grunnet før maling' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ],
    reparasjon: [
      { fase: 'Før oppstart', items: [
        { id: 'omfang', label: 'Skadeomfang vurdert og avtalt med kunde' },
        { id: 'arsak', label: 'Årsak vurdert — fukt, bevegelse eller feste' },
        { id: 'bilde-for', label: '📸 Bilde av skaden tatt før utbedring' }
      ]},
      { fase: 'Utførelse', items: [
        { id: 'rens', label: 'Løs masse og gammel maling skrapet bort, støvfritt' },
        { id: 'hurtigsparkel', label: 'Hurtigsparkel i alle glipper over 2 mm' },
        { id: 'armering', label: 'Sprekk armert med strimmel eller duk der det er bevegelse' },
        { id: 'fyll', label: 'Resten fylt i flere tynne omganger, ikke ett tykt lag' },
        { id: 'fintstrok', label: 'Fintstrøk trukket ut i flaten rundt' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'torketid', label: 'Tørket fullt før sliping' },
        { id: 'sliping', label: 'Slipt jevnt med flaten rundt' },
        { id: 'sidelys', label: 'Kontrollert med strøkende sidelys' },
        { id: 'grunning', label: 'Flekkgrunnet — sparkel suger annerledes enn veggen' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ]
  },
  fasade: {
    mur: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'underlag', label: 'Underlagets tilstand vurdert — puss, sprekker, saltutslag' },
        { id: 'eksisterende', label: 'Eksisterende system sjekket — diffusjonsåpen maling nytter ikke over et tett sjikt' },
        { id: 'fukt', label: 'Fuktvurdering gjort ved tvil om oppbygningen' },
        { id: 'vaer', label: 'Værmelding sjekket — ingen nedbør eller frost i tørketiden' },
        { id: 'tilkomst', label: 'Stillas eller tilkomst sikret' }
      ]},
      { fase: 'Klargjøring', items: [
        { id: 'vask', label: 'Vasket' },
        { id: 'skader', label: 'Pussskader utbedret' },
        { id: 'tildekking', label: 'Vinduer, dører og beplantning tildekket' },
        { id: 'grunning', label: 'Grunnet etter systemets anvisning' }
      ]},
      { fase: 'Maling', items: [
        { id: 'strok1', label: 'Første strøk' },
        { id: 'strok2', label: 'Siste strøk' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'dekning', label: 'Dekning kontrollert i dagslys' },
        { id: 'rydding', label: 'Tildekking fjernet og ryddet' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ],
    treverk: [
      { fase: 'Før oppstart', items: [
        { id: 'bilde-for', label: '📸 Før-bilde tatt' },
        { id: 'underlag', label: 'Kledningens tilstand vurdert — råte, løs maling' },
        { id: 'lufting', label: 'Lufting bak kledningen vurdert' },
        { id: 'eksisterende', label: 'Eksisterende malingssystem identifisert' },
        { id: 'vaer', label: 'Værmelding sjekket — ingen nedbør eller frost i tørketiden' },
        { id: 'tilkomst', label: 'Stillas eller tilkomst sikret' }
      ]},
      { fase: 'Klargjøring', items: [
        { id: 'vask', label: 'Vasket' },
        { id: 'skrap', label: 'Løs maling skrapet, skadet virke skiftet' },
        { id: 'slip', label: 'Slipt' },
        { id: 'tildekking', label: 'Vinduer, dører og beplantning tildekket' },
        { id: 'grunning', label: 'Bart trevirke grunnet eller impregnert' }
      ]},
      { fase: 'Maling', items: [
        { id: 'strok1', label: 'Første strøk' },
        { id: 'strok2', label: 'Siste strøk' }
      ]},
      { fase: 'Kontroll', items: [
        { id: 'dekning', label: 'Dekning kontrollert i dagslys' },
        { id: 'rydding', label: 'Tildekking fjernet og ryddet' },
        { id: 'bilder', label: '📸 Etter-bilder tatt' }
      ]}
    ]
  }
};

/** Jobbtypene for et fag, eller null for fag uten typer (maling, annet). */
export function jobbtyperFor(fag) { return JOBBTYPER[fag] || null; }

/** Standard jobbtype (den første) for et fag, eller '' for fag uten typer. */
export function standardType(fag) {
  const t = jobbtyperFor(fag);
  return t ? t[0].id : '';
}

/** Typedefinisjonen; ukjent type faller tilbake til den første. null for fag uten typer. */
export function jobbtypeDef(fag, type) {
  const t = jobbtyperFor(fag);
  if (!t) return null;
  for (let i = 0; i < t.length; i++) { if (t[i].id === type) return t[i]; }
  return t[0];
}

// En jobb består av ett eller flere ARBEIDER (deler). Et bad begynner ofte
// som ren avretting og vokser til belegg og sparkling underveis — da er det
// fortsatt én jobb på én adresse, ikke tre jobber.
export function sjekklisteFor(del) {
  const perType = SJEKKLISTE_BY_TYPE[del.fag];
  if (perType) return perType[del.jobbtype] || perType[standardType(del.fag)];
  return SJEKKLISTE_BY_FAG[del.fag] || SJEKKLISTE_BY_FAG.annet;
}

// «🚿 Bad / våtrom — Full jobb — avretting og belegg» er to bindestreker
// for mye. Emojien bærer faget; typen sier resten.
// (Originalen kræsjet på ukjent fag; her faller den tilbake til «Annet».)
export function delTittel(del) {
  const type = jobbtypeDef(del.fag, del.jobbtype);
  const fag = FAG_BY_ID[del.fag] || FAG_BY_ID.annet;
  if (!type) return fag.label;
  return fag.emoji + ' ' + type.label;
}

// Reparasjon alene er skrevet fra alminnelig praksis, ikke hentet
// fra fagfanene eller en norm. Det skal stå på lista, ikke bare i hodet
// på den som skrev den. (Gamle linje 4172–4182; vises når typeDef.praksis.)
export const PRAKSIS_MERKE = '🔧 Praksis, ikke norm';
export function praksisTekst(typeDef) {
  return 'Punktene for ' + typeDef.label.toLowerCase() + ' bygger på alminnelig malerpraksis. ' +
    'De står ikke i fagfanene, og er ikke hentet fra NS 3420 eller TEK17.';
}
