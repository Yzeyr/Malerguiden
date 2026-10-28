/* ------------------------------------------------------------------ *
 * FAKTA — én kilde, gjenbrukt i både Måltall og fagstoffet.
 * Endrer TEK17 seg, rettes tallet her og slår gjennom overalt.
 *
 * Fakta-id-ene er nøkler i favorittlagringen (`malerguiden-favoritter`)
 * og i delte lenker `#f-<id>` — de må aldri endres.
 * Alle felt er ren tekst (ingen HTML i originalen).
 * Flyttet ordrett fra gamle index.html, linje 2192–2325.
 * ------------------------------------------------------------------ */
export const FACTS = {
  fall: [
    { id: 'fall-dusj-over-sluk', label: 'Dusj rett over sluk', value: '1:50',
      note: 'Min. 0,8 m ut fra sluket',
      why: 'Funksjonskravet er «tilstrekkelig fall» mot sluk — 1:50 er den preaksepterte ytelsen som oppfyller det når dusjen står rett over sluket. Fallet måles på ferdig gulv.',
      src: 'Preakseptert ytelse — veiledningen til TEK17 §13-15. Ikke et tall i forskriftsteksten.' },
    { id: 'fall-dusj-ikke-over-sluk', label: 'Dusj ikke over sluk', value: '1:50',
      note: 'Fra nedslagsfelt til sluk',
      why: 'Samme funksjonskrav om tilstrekkelig fall, men fallet regnes fra der vannet faktisk treffer gulvet og fram til sluket.',
      src: 'Preakseptert ytelse — veiledningen til TEK17 §13-15.' },
    { id: 'fall-nedsenket-dusjsone', label: 'Nedsenket dusjsone', value: '1:100',
      note: 'Sonen min. 10 mm lavere',
      why: 'Senkes dusjsonen minst 10 mm under resten av gulvet, holder 1:100 i nedslagsfeltet.',
      src: 'Preakseptert ytelse — veiledningen til TEK17 §13-15.' },
    { id: 'fall-resten-av-gulvet', label: 'Resten av gulvet', value: '1:100',
      note: 'Alternativ: hele gulvet',
      why: 'Tredje løsning: la hele gulvet, ikke bare dusjsonen, ha minst 1:100 fall til sluket.',
      src: 'Preakseptert ytelse — veiledningen til TEK17 §13-15.' },
    { id: 'fall-motfall', label: 'Motfall', value: '0 mm',
      note: 'Ikke tillatt noe sted',
      why: 'Gulvet skal aldri lede vann bort fra sluket, uansett hvor lite arealet er.',
      src: 'Følger av selve funksjonskravet i TEK17 §13-15: lekkasjevann skal ledes til sluk.' },
    { id: 'fall-oppkant-ytterkant', label: 'Oppkant ytterkant', value: '25 mm',
      note: 'Over ferdig gulv',
      why: 'Tettesjiktets oppkant ved alle ytterkanter, unntatt døråpninger.',
      src: 'Preakseptert ytelse — veiledningen til TEK17 §13-15.' },
    { id: 'fall-oppkant-dor', label: 'Oppkant døråpning', value: '15 mm',
      note: 'Unntaket fra kravet over',
      why: 'Redusert minstekrav der terskelen er en døråpning.',
      src: 'Preakseptert ytelse — veiledningen til TEK17 §13-15.' }
  ],
  vinyl: [
    { id: 'vinyl-tykkelse', label: 'Beleggtykkelse våtrom', value: '1,5 mm',
      note: 'Veiledende minstemål, sveisbart',
      why: 'Tommelfingerregel for sveisbart våtromsbelegg. Det bindende er at produktet er dokumentert og godkjent for våtrom.',
      src: 'Bransjeveiledning (Gulvfakta) — ikke forskrift. Produktdatablad går foran.' },
    { id: 'vinyl-skjot-sluk', label: 'Skjøt til sluk', value: '100 mm',
      note: 'Minste avstand',
      why: 'Skjøter skal ikke plasseres nærmere sluket enn dette. Systemleverandøren kan kreve mer.',
      src: 'NS 3420-T, postgruppe for gulvbelegg — kontraktsbestemt. Konkret postnummer er ikke slått opp her (standarden er ikke fritt tilgjengelig); sjekk gjeldende utgave eller beskrivelsestekst før bruk som dokumentasjon.' },
    { id: 'vinyl-skjot-hjorne', label: 'Skjøt i ytterhjørne', value: 'Ikke tillatt',
      note: 'Utvendige hjørner',
      why: 'Skjøter skal ikke legges direkte på et utvendig hjørne.',
      src: 'NS 3420-T, postgruppe for gulvbelegg — kontraktsbestemt. Konkret postnummer er ikke slått opp her (standarden er ikke fritt tilgjengelig); sjekk gjeldende utgave eller beskrivelsestekst før bruk som dokumentasjon.' },
    { id: 'vinyl-minste-stykke', label: 'Minste beleggstykke', value: '150×150 mm',
      note: 'Ved innskjøting',
      why: 'Mindre lapper skal ikke skjøtes inn.',
      src: 'NS 3420-T, postgruppe for gulvbelegg — kontraktsbestemt. Konkret postnummer er ikke slått opp her (standarden er ikke fritt tilgjengelig); sjekk gjeldende utgave eller beskrivelsestekst før bruk som dokumentasjon.' },
    { id: 'vinyl-akklimatisering', label: 'Akklimatisering', value: '≥ 24 t',
      note: 'Romtemperatur, før legging',
      why: 'Lenger ved store temperatur- eller fuktforskjeller mellom lager og monteringsrom.',
      src: 'Bransjepraksis og produsentanvisning — ikke forskrift.' },
    { id: 'vinyl-vent-sveising', label: 'Vent før sveising', value: '≈ 24 t',
      note: 'Avhenger av lim og forhold',
      why: 'Tommelfingerregelen er å sveise dagen etter, så limet får satt seg. Faktisk tid varierer med limtype, sug, temperatur og luftfuktighet.',
      src: 'Limprodusentens datablad er det bindende — 24 t er ingen universell regel.' }
  ],
  gulv: [
    { id: 'gulv-planhet', label: 'Tillatt ugjevnhet, flatt gulv', value: '3 mm',
      note: 'Målt med 2 m rettholt',
      why: 'Toleranseklasse PB — vanlig krav til undergulv rett før belegg/flis legges. Selve råbygget (støpt betonggulv) leveres normalt grovere, toleranseklasse PD (±8 mm/2 m), og må derfor avrettes ned til PB.',
      src: 'NS 3420-1, Tabell 1 — normalkrav til toleranser for ferdig overflate. Kontraktsbestemt, ikke forskrift.' },
    { id: 'gulv-lagtykkelse', label: 'Lagtykkelse', value: '4–50 mm',
      note: 'weberfloor 120 Reno',
      why: 'Produktspesifikt spenn for én bestemt renoveringssparkel. Andre produkter har andre grenser.',
      src: 'Produktdatablad, weberfloor 120 Reno.' },
    { id: 'gulv-forbruk', label: 'Forbruk', value: '1,75 kg',
      note: 'Per mm per m²',
      why: 'Brukes til å regne ut massebehov: areal × snitt lagtykkelse × 1,75. Se Kalkulator-fanen.',
      src: 'Produktdatablad, weberfloor 120 Reno. Sekk 20 kg, blandes med 3,6 l vann.' },
    { id: 'gulv-herdetid-30', label: 'Herdetid, 30 mm', value: '~1 døgn',
      note: 'Til belegningsklart',
      why: 'Forutsetter tørt underlag og normale forhold.',
      src: 'Produktdatablad, weberfloor 120 Reno.' },
    { id: 'gulv-herdetid-40', label: 'Herdetid, 40 mm', value: '~2 døgn',
      note: 'Til belegningsklart',
      why: 'Tid til belegningsklart øker med lagtykkelsen.',
      src: 'Produktdatablad, weberfloor 120 Reno.' },
    { id: 'gulv-herdetid-50', label: 'Herdetid, 50 mm', value: '~3 døgn',
      note: 'Til belegningsklart',
      why: 'Ved tykkere lag: bygg opp i flere omganger med priming mellom.',
      src: 'Produktdatablad, weberfloor 120 Reno.' }
  ],
  sparkling: [
    { id: 'sparkling-antall-strok', label: 'Minste antall strøk', value: '3',
      note: 'Taping medregnet',
      why: 'Taping, fyllstrøk og fintstrøk. Aldri færre enn tre på gipsskjøter.',
      src: 'Bransjepraksis og produsentanvisning — ikke forskrift.' },
    { id: 'sparkling-k1', label: 'K1', value: 'Funksjonell',
      note: 'Bod, teknisk rom',
      why: 'Skjøter og hull tettes. Ingen krav til pent utseende.',
      src: 'Estetisk klasse K1 i NS 3420-T (2019). Klassen avtales i kontrakten; standarden krever ingen bestemt klasse.' },
    { id: 'sparkling-k2', label: 'K2', value: 'Skjøt og flekk',
      note: 'Ikke helsparklet, vanlig standard',
      why: 'Strimling, fyllstrøk og finstrøk over skjøter og skruehull, så slip. Ser bra ut i vanlig lys, men ikke i sterkt sidelys. Perforerte plater og plater med V-fas kan høyst bli K2.',
      src: 'Estetisk klasse K2 i NS 3420-T (2019). Klassen avtales i kontrakten.' },
    { id: 'sparkling-k3', label: 'K3', value: 'Helsparklet',
      note: 'Sidelys, stue, kjøkken, soverom, gang',
      why: 'Skjøtene sparkles først, så hele flaten, vanligvis i to strøk. Krever forsenkede platekanter i alle skjøter. NS 3420-T anbefaler K3 i primære rom i boliger.',
      src: 'Estetisk klasse K3 i NS 3420-T (2019). K3 krever helsparkling og forsenkede platekanter (TB4.32).' },
    { id: 'sparkling-slip-grov', label: 'Sliping, grovt', value: 'P80–P120',
      note: 'Fjerner overflødig masse',
      why: 'Slipenett (type Mirka Abranet) gir mindre støv med avsug og går sjeldnere tett enn slipepapir.',
      src: 'Praksis og produsentanbefaling.' },
    { id: 'sparkling-slip-fin', label: 'Sliping, fint', value: 'P180–P240',
      note: 'Siste finslip',
      why: 'Kjøres etter grovslipingen, rett før grunning.',
      src: 'Praksis og produsentanbefaling.' }
  ],
  maling: [
    { id: 'maling-ikke-tettesjikt', label: 'Maling som fuktsperre', value: 'Aldri',
      note: 'Tettesjikt er noe annet',
      why: 'Våtromsmaling er en fuktbestandig, slitesterk overflate — ikke et tettesjikt. Våtsonen skal ha dokumentert tettesjikt uansett malingtype.',
      src: 'Følger av TEK17 §13-15 om tettesjikt i våtrom.' },
    { id: 'maling-bad', label: 'Bad, tak og vegg', value: 'Våtromsmaling',
      note: 'På flater utenfor tettesjiktet',
      why: 'Typisk akrylbasert, ofte med sopphindrende tilsetning, testet for høy luftfuktighet og avvasking.',
      src: 'Produktvalg — ikke forskriftsregulert.' },
    { id: 'maling-overmalbar', label: 'Overmalbar etter', value: '≈ 2 t',
      note: 'Vannbasert, ved 23 °C / 50 % RF',
      why: 'Støvtørr etter ca. 1 time, overmalbar etter ca. 2. Flaten kjennes tørr lenge før den tåler nytt strøk — går du på for tidlig, løses strøket under opp.',
      src: 'Veiledende produsenttall. Databladets tider forutsetter 23 °C og 50 % relativ luftfuktighet.' },
    { id: 'maling-temperatur', label: 'Minstetemperatur', value: '10–15 °C',
      note: 'I luft OG underlag',
      why: 'Flere malinger tørker rett og slett ikke under dette. Kaldt underlag teller like mye som kald luft — et nybygg om vinteren er sjelden i nærheten av databladets forutsetninger.',
      src: 'Veiledende produsenttall — sjekk databladet for det aktuelle produktet.' }
  ],
  fasade: [
    { id: 'fasade-mur', label: 'Mur og puss', value: 'Diffusjonsåpen',
      note: 'Hovedregel utvendig',
      why: 'Lar fukt i underlaget tørke ut gjennom malingen. Silikat- og silikonharpiksmaling er typiske kategorier.',
      src: 'Produktveiledning. Underlagets tilstand og eksisterende system styrer endelig valg.' },
    { id: 'fasade-treverk', label: 'Utvendig treverk', value: 'Annen logikk',
      note: 'Alkyd eller akryl',
      why: 'Styres av treverkets eget fuktopptak, lufting bak kledningen og eksisterende malingssystem — ikke av diffusjonsevne alene.',
      src: 'Produktveiledning.' }
  ]
};

/** id → fakta, med `group` (FACTS-nøkkelen) lagt til på hvert element. */
export const FACT_BY_ID = {};
Object.keys(FACTS).forEach((group) => {
  FACTS[group].forEach((fact) => { FACT_BY_ID[fact.id] = { ...fact, group }; });
});

/**
 * Gruppene slik Måltall-seksjonen viser dem (gamle linje 955–968).
 * `grupper` = hvilke FACTS-nøkler gruppen dekker, i rekkefølge.
 */
export const FACT_GROUPS = [
  { id: 'fall', tittel: 'Fall til sluk', tag: 'Preakseptert ytelse', grupper: ['fall'] },
  { id: 'vinyl', tittel: 'Vinylbelegg', tag: 'Norm + produktkrav', grupper: ['vinyl'] },
  { id: 'gulv', tittel: 'Klargjøring gulv', tag: 'Produktdatablad', grupper: ['gulv'] },
  { id: 'sparkling', tittel: 'Sparkling', tag: 'NS 3420 + praksis', grupper: ['sparkling'] },
  { id: 'maling', tittel: 'Maling', tag: 'Produktvalg', grupper: ['maling', 'fasade'] }
];

/** Innledningen over Måltall (gamle linje 953). */
export const MALTALL_INTRO = 'Alle tallene på ett sted, med hjemmel: forskrift, veiledning, norm eller produktdatablad. Trykk ☆ for å favorittmerke, 🔗 for å kopiere en lenke rett til tallet.';
