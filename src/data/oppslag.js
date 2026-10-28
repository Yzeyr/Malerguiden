/* ------------------------------------------------------------------ *
 * Fagstoffet (oppslag), flyttet ordrett fra gamle index.html
 * (seksjonene gulvfall/vatrom/sparkling/maling/fasade 1623–1869,
 * Vanlige feil 1872–1946, fagstoff-meny 1949–1986, intro-note 942–947,
 * kilder 2143–2182). Bare strukturen er ny — teksten er uendret.
 *
 * Felt som heter `html` (og `intro` på steg-blokker, `hvorfor`/`feil`,
 * KILDER_MERKNAD, KILDER_INTRO, FAGSTOFF_INTRO, FEIL_INFO.intro) inneholder
 * enkel HTML (p, strong, em, code, og i steg også div.callout) og settes
 * med innerHTML. Alle andre felt (tittel, tekst, tag, undertittel …) er
 * ren tekst.
 *
 * Blokktyper i SEKSJONER[].blokker:
 *   { type:'tekst', html, intro? }         ett avsnitt (innhold uten <p>);
 *                                          intro:true = originalens .section-intro
 *   { type:'overskrift', tekst, tag? }
 *   { type:'callout', variant:'krav'|'tips'|'advarsel', tittel, html, praksis? }
 *                                          praksis:true = merket «🔧 Praksis, ikke krav»
 *   { type:'steg', tittel, intro?, steg:[{ tittel, html }] }
 *                                          tittel er h3-en foran lista, '' om den mangler
 *   { type:'kort', tittel, tag?, html }    html er ett eller flere <p>
 *   { type:'fakta', gruppe }               gruppe = nøkkel i FACTS (facts.js)
 *
 * FEIL: «❌ » foran feil og «→ » foran hvorfor er fjernet (ren pynt;
 * legges på i visningen).
 * ------------------------------------------------------------------ */

/** Merket som vises på callouts med praksis:true. */
export const PRAKSIS_MERKE = '🔧 Praksis, ikke krav';

export const SEKSJONER = [
  {
    id: 'gulvfall',
    tittel: 'Gulv & fall',
    ikon: '〰️',
    undertittel: 'Klargjøring av undergulv og fallbygging',
    fakta: ['fall', 'gulv'],
    blokker: [
      {
        type: 'tekst',
        html: 'Klargjøring av undergulvet og fall til sluk hører sammen — i våtrom formes fallet som del av avrettingen, ikke som et løsrevet steg etterpå.',
        intro: true
      },
      { type: 'overskrift', tekst: 'Fall til sluk — de preaksepterte løsningene' },
      { type: 'fakta', gruppe: 'fall' },
      {
        type: 'callout',
        variant: 'krav',
        tittel: 'Funksjonskrav vs. preakseptert ytelse',
        html: 'Forskriften krever at vann ledes til sluk og at gulvet har fall — den fastsetter ikke 1:50 og 1:100 direkte. Tallene over er preaksepterte ytelser fra veiledningen: den trygge veien, og den man normalt skal følge. Avvik er mulig, men må verifiseres ved analyse etter TEK17 §2-1 og hører hjemme hos den prosjekterende, ikke på byggeplassen.'
      },
      {
        type: 'callout',
        variant: 'tips',
        tittel: 'Fall er et minstekrav, ikke et måltall å ramme nøyaktig',
        html: 'For bratt fall nær sluket gir gjerne dårligere gangkomfort og økt snublefare uten at det tilfører noe — de fleste sikter seg inn nær minstekravet i praksis, ikke godt over det. Husk at kravet gjelder <em>ferdig gulv</em>, altså inkludert beleggets tykkelse.',
        praksis: true
      },
      {
        type: 'steg',
        tittel: 'Klargjøring — rekkefølgen',
        intro: 'Undergulvet avgjør sluttresultatet mer enn selve leggingen. Rekkefølgen gjelder både våtrom og tørre rom.',
        steg: [
          {
            tittel: 'Rydding og rengjøring',
            html: 'Fjern gammelt gulvbelegg, limrester, spiker og løse partikler. Underlaget skal være rent, jevnt, tørt og fritt for sprekker før noe annet gjøres.'
          },
          {
            tittel: 'Sliping',
            html: 'Slip betonggulvet for å fjerne ru overflate, gamle limrester eller malingsflak, slik at avrettingsmassen får godt feste. Støvsug grundig etterpå — støv på flaten svekker vedheften.'
          },
          {
            tittel: 'Reparer skader',
            html: 'Større hull eller sprekker fylles og rettes opp med egnet fyllmasse eller betong før hele flaten avrettes — avrettingsmasse er ikke ment å bygge opp store forskjeller alene.'
          },
          {
            tittel: 'Sett ut høyder først',
            html: 'Sluket er det faste lavpunktet. Mål opp og marker ønsket høyde langs vegger og ved dørterskel før du blander masse — med laser, nivellerpinner eller høydemerker. Regn ut nødvendig høydeforskjell (1:50 = 20 mm per meter, 1:100 = 10 mm per meter — se <strong>Kalkulator</strong>) og kontroller at det går opp mot terskelhøyde og oppkant. Uten utsatte høyder er fallforming gjetting.'
          },
          {
            tittel: 'Priming',
            html: 'Påfør grunning over hele flaten. Grunningen hindrer at avrettingsmassen tørker for fort og gir bedre vedheft mot underlaget.'
          },
          {
            tittel: 'Avretting og fallforming',
            html: 'Bruk et produkt som er egnet for fallforming — en ren selvutjevnende masse med normal vannmengde søker vannrett og <em>holder ikke</em> fall av seg selv. Fallforming gjøres med en fallformingsmasse, eller en fiberarmert renoveringsmasse blandet stivere (mindre vann) enn til plan avretting; da må du jobbe raskt, for stivere masse gir kortere åpentid. <div class="callout"><strong>Metoden varierer med produktet</strong> For <code>weberfloor 120 Reno</code> er produsentens anvisning å legge ut massen ved fallets høyeste punkt, la den flyte mot lavpunktet, og dra overskytende masse tilbake mot høydepunktet med rakel til den slutter å flyte. Andre produkter beskriver andre metoder — noen bygges opp i to trinn (plan avretting først, fall i våtsonen etterpå). Følg det aktuelle databladet, ikke en generell regel.</div>'
          },
          {
            tittel: 'Ved tykke lag eller stort fall',
            html: 'Bygg opp i flere omganger med priming mellom hvert lag fremfor ett tykt strøk. Herdetiden øker med tykkelsen — for weberfloor 120 Reno oppgis rundt 1 døgn opp til 30 mm, 2 døgn opp til 40 mm og 3 døgn opp til 50 mm på tørt underlag. Andre produkter har andre tall.'
          },
          {
            tittel: 'Herding og sluttsliping',
            html: 'La massen herde fullt iht. produktets angitte tid før du går videre. Sjekk planheten med en 2 m rettholt — normalkravet før belegg er maks <code>3 mm</code> avvik (toleranseklasse PB). Slip lett ved behov for å fjerne ujevnheter utover det, rett før belegg legges.'
          },
          {
            tittel: 'Fuktmåling',
            html: 'Mål restfukt i betongen før legging, særlig i nybygg eller etter vannskade. For høy restfukt kan skade lim og belegg over tid — grenseverdien står i lim- og beleggprodusentens datablad.'
          },
          {
            tittel: 'Kontroller fallet på ferdig herdet flate',
            html: 'Sjekk med vater eller laser når massen er herdet, før belegget legges. Kontroller også for lokalt motfall rundt sluket og langs vegger — det er der feilene sitter. Etterjusteringer er langt lettere nå enn etter at gulvet er dekket.'
          }
        ]
      },
      { type: 'overskrift', tekst: 'Produkttall — avrettingsmasse' },
      { type: 'fakta', gruppe: 'gulv' }
    ]
  },
  {
    id: 'vatrom',
    tittel: 'Våtrom',
    ikon: '🚿',
    undertittel: 'Legging og sveising av vinylbelegg',
    fakta: ['vinyl'],
    blokker: [
      {
        type: 'tekst',
        html: 'Legging av vinylbelegg i våtrom, fra ferdig klargjort undergulv (se <strong>Gulv &amp; fall</strong>) til ferdig sveiset gulv. Strammere enn tørre rom, fordi belegget med sine skjøter <em>er</em> tettesjiktet.',
        intro: true
      },
      {
        type: 'callout',
        variant: 'krav',
        tittel: 'Belegget er tettesjiktet — det stiller krav til systemet, ikke bare til rullen',
        html: 'I et våtrom med beleggløsning utgjør belegget, skjøtesveisene og oppbrettene på vegg det dokumenterte tettesjiktet. Det betyr at belegg, lim, sveisetråd og eventuell slukmansjett skal være et system som er dokumentert for våtrom og monteres etter produsentens anvisning. Våtsonen på vegg skal også ha tettesjikt — maling er aldri tettesjikt. Tallene under er nyttige tommelfingerregler, men systemleverandørens anvisning går foran dem.'
      },
      { type: 'fakta', gruppe: 'vinyl' },
      {
        type: 'steg',
        tittel: '',
        steg: [
          {
            tittel: 'Sjekk at produktet er dokumentert for våtrom',
            html: 'Ikke alle vinylbelegg er godkjent for våtromsbruk. Kontroller produktdatablad og at lim, sveisetråd og slukløsning hører til samme dokumenterte system. Veiledende minstemål er <code>1,5 mm</code> tykt og sveisbart.'
          },
          {
            tittel: 'Akklimatisering',
            html: 'La belegget ligge i romtemperatur i minst 24 timer før montering — lenger ved store temperatur- eller fuktforskjeller mellom lager og monteringsrom. Legges belegget kaldt eller fra annen luftfuktighet, kan det jobbe seg ut av form etterpå.'
          },
          {
            tittel: 'Kontroller fallet før liming',
            html: 'Fall mot sluk kontrolleres på ferdig underlag — se <strong>Gulv &amp; fall</strong>. Dette gjøres før liming, ikke som etterkontroll, og husk at kravet gjelder ferdig gulv inkludert belegget.'
          },
          {
            tittel: 'Liming',
            html: 'Belegget limes fullt til undergulvet (helflating) i våtrom — flytende legging uten fullt lim er ikke egnet der skjøtene skal være vanntette. Limtype, tannsparkel og åpentid følger limprodusentens datablad.'
          },
          {
            tittel: 'Oppbrett og slukdetalj',
            html: 'Belegget brettes opp på vegg i våtsonen og avsluttes etter systemets anvisning. Slukdetaljen — klemring eller mansjett — er den vanligste lekkasjekilden i et beleggbad og skal utføres nøyaktig etter slukprodusentens anvisning, med riktig type sluk for beleggløsning.'
          },
          {
            tittel: 'Sveising av skjøter',
            html: 'Vent til limet har satt seg — normalt dagen etter legging, men den faktiske ventetiden står i limets datablad og varierer med limtype, sug, temperatur og luftfuktighet. Trådsveising smelter en spesialtråd ned i frest not, slik at kantene låses til én sammenhengende, vanntett flate. Skjær tråden av i to omganger (grovt mens den er varm, plant når den er kald) for å unngå å skjære i selve belegget.'
          },
          {
            tittel: 'Plassering av skjøter (NS 3420-T)',
            html: 'Ikke nærmere sluket enn 100 mm, ikke direkte på utvendige hjørner, og ikke innskjøtte stykker mindre enn 150×150 mm. Planlegg beleggretning og skjøteplassering <em>før</em> du kutter — dette er et planleggingskrav, ikke noe som lar seg rette opp etterpå.'
          }
        ]
      }
    ]
  },
  {
    id: 'sparkling',
    tittel: 'Sparkling',
    ikon: '🧱',
    undertittel: 'K2/K3-finish, sliping, sidelys',
    fakta: ['sparkling'],
    blokker: [
      {
        type: 'tekst',
        html: 'Veggsparkling før maling — fylling av skjøter, hull og ujevnheter slik at veggen blir jevn nok til å males uten at feil skinner gjennom.',
        intro: true
      },
      { type: 'fakta', gruppe: 'sparkling' },
      {
        type: 'steg',
        tittel: '',
        steg: [
          {
            tittel: 'Avklar klasse — K2 eller K3',
            html: 'NS 3420-T deler overflater inn i estetiske klasser. <strong>K2</strong> er vanlig standard: helsparklet i ett strøk, dekker normalt godt for matt/halvblank maling i vanlig rombelysning. <strong>K3</strong> legger på et ekstra finstrøk over hele flaten (ikke bare skjøtene) — velges ved sterkt sidelys (store vinduer, spotter i taket), blank/skinnende maling, eller når kunden vil ha et tilnærmet speilblankt resultat. Avklar klassen skriftlig før oppstart: den avgjør hvor mange strøk du legger inn, hva jobben koster, og om en synlig bulk er en reklamasjon eller innenfor avtalen.'
          },
          {
            tittel: 'Taping',
            html: 'Alle skjøter, inkludert hjørner, tapes før sparkling. Aldri færre enn tre strøk totalt, taping medregnet.'
          },
          {
            tittel: 'Fyllstrøk',
            html: 'Påfør sparkelmasse over tapede skjøter og hjørner, skrap av overflødig masse. Gjenta med et nytt strøk dagen etter — to fyllstrøk er normalen før fintstrøket.'
          },
          {
            tittel: 'Fintstrøk',
            html: 'Siste strøk tas med en bred sparkel for penest resultat. Fukt sparkelen lett med vann før du drar det siste strøket — det gir bedre flyt i massen og mindre sliping etterpå. På K3 tas dette strøket over hele flaten, ikke bare skjøtene.'
          },
          {
            tittel: 'Sliping',
            html: 'Når sparkelen er helt tørr, slipes skjøtene jevne med resten av veggen. Slipenett av typen <strong>Mirka Abranet</strong> gir langt mindre støv med avsug og går sjeldnere tett enn vanlig slipepapir — grovere korning (<code>P80–P120</code>) fjerner overflødig masse, finere (<code>P180–P240</code>) tar siste finslip. I innvendige hjørner: bruk en vinklet hjørnekloss, gjerne på skaft, i stedet for flatt slipepapir — den følger hjørnelinjen uten å runde den av eller slipe skjevt på den ene siden.'
          },
          {
            tittel: 'Sjekk med sidelys',
            html: 'Skru av taklyset og hold en lyskaster eller lommelykt lavt og parallelt med veggen (strøkende lys). Selv små overganger og ujevnheter kaster tydelig skygge på denne måten — de samme feilene er nesten usynlige under vanlig, jevnt lys ovenfra. Gjør dette før du kaller sparklingen ferdig, spesielt på K3, og gjerne fra samme retning som rommets faktiske lyskilde vil komme.'
          },
          {
            tittel: 'Grunning',
            html: 'Grunn de sparklede flatene før maling påføres. Sparkelmasse suger annerledes enn resten av veggen — uten jevn grunning gir det synlige skjolder i den ferdig malte flaten, spesielt merkbart under sidelys.'
          }
        ]
      },
      {
        type: 'callout',
        variant: 'advarsel',
        tittel: 'Ikke mal over fuktig sparkel',
        html: 'La sparkelmassen tørke fullt iht. produktets angitte tid før du sliper og maler. Maling for tidlig over fuktig sparkel gir sprekkdannelse og skjolder som først dukker opp i etterkant, ikke med det samme.'
      }
    ]
  },
  {
    id: 'maling',
    tittel: 'Maling',
    ikon: '🎨',
    undertittel: 'Tak, vegg og selve malejobben',
    fakta: ['maling'],
    blokker: [
      {
        type: 'tekst',
        html: 'Innendørs — tak og vegg. For fasade, se egen fane. Riktig malingtype handler om fuktbestandighet og slitasje, ikke bare farge og glans.',
        intro: true
      },
      { type: 'fakta', gruppe: 'maling' },
      { type: 'overskrift', tekst: 'Hva "diffusjonsåpen" betyr — og hvor det er relevant' },
      {
        type: 'tekst',
        html: 'Et diffusjonsåpent produkt lar vanndamp passere gjennom laget uten å slippe inn vann i flytende form. Fukt i underlaget kan dermed tørke ut gjennom malingen i stedet for å bli fanget bak et tett sjikt. Det er en <strong>egenskap for underlag som kan bli fuktig og må kunne tørke ut</strong> — først og fremst mur og puss utvendig.'
      },
      {
        type: 'tekst',
        html: 'Innendørs på bad er utfordringen en annen: der er det fuktbestandighet, soppmotstand og avvaskbarhet som avgjør om malingen holder over tid, og flere norske malingprodusenter og fagmedier framholder at diffusjonsåpenhet i seg selv ikke er noen relevant egenskap for vanlige innvendige flater. Det gjør likevel ikke fukttransport irrelevant innendørs — på fuktige eller kalde konstruksjoner (kjellervegg, yttervegg i mur) kan et tett malingssjikt fortsatt lage problemer. Ligger det spesielle forhold i veggen, er det underlaget som avgjør valget, ikke en generell regel om «inne» eller «ute».'
      },
      {
        type: 'callout',
        variant: 'krav',
        tittel: 'Maling er ikke tettesjikt',
        html: 'Ingen våtromsmaling erstatter tettesjiktet i våtsonen. I et bad med beleggløsning er det belegget med oppbrett og sveisede skjøter som utgjør tettesjiktet på gulv og i våtsonen — malingen gjelder flatene utenfor. Blir dette blandet sammen, er det en fuktskade som venter, ikke en smakssak.'
      },
      {
        type: 'kort',
        tittel: 'Tak',
        html: '<p>Taket får ikke direkte sprut, men samler kondens fra dusjdampen som stiger og legger seg der flaten er kaldest. Bruk våtromsmaling — typisk akrylbasert med sopphindrende tilsetning — fremfor vanlig takmaling, og hold deg til matt/halvblank: en blankere overflate framhever kondensdrypp, rulleoverganger og ujevnheter tydeligere, og tak er den flaten som ser mest sidelys fra vinduer.</p>',
        tag: 'Fuktbestandig, ikke blank'
      },
      {
        type: 'kort',
        tittel: 'Vegg',
        html: '<p>Veggene utenfor tettesjiktet tåler jevnlig kontakt med sprut og hender. Samme kategori, våtromsmaling, men her teller skrubbfasthet og avvaskbarhet mest — den skal tåle jevnlig rengjøring uten at glansen eller fargen svekkes. Litt høyere glans er normalt mer avvaskbart, men avslører samtidig mer av underlaget: derav sammenhengen med sparklingsklasse (se <strong>Sparkling</strong>).</p>',
        tag: 'Slitesterk og lett å vaske'
      },
      {
        type: 'steg',
        tittel: 'Gjennomføring — fra første til siste strøk',
        intro: 'Selve malejobben, uansett om det er tak, vegg eller fasade: kant og flate i samme runde, lett sliping mellom strøkene.',
        steg: [
          {
            tittel: 'Første strøk',
            html: 'Mal overflatene med et jevnt, dekkende strøk. Jobb med sterkt slepelys bak deg — en lyskaster eller et vindu i ryggen, slik at lyset stryker langs flaten du maler. Det avslører dryppdannelser, rusk i malingen og ujevnt påførte partier med en gang, mens de fortsatt er våte og lette å rette opp.'
          },
          {
            tittel: 'Sett av i rundt (kanting)',
            html: 'Gå langs kanter, innvendige hjørner og der veggen møter kontrastfarge eller tak med kost, deretter med en liten rull så tett inntil kanten som mulig. Rull helt inn i hjørnene der samme farge møtes fra to vegger, slik at det ikke står igjen en synlig strukturforskjell mellom kostet og rullet flate.'
          },
          {
            tittel: 'La strøket tørke, slip lett',
            html: 'Når første strøk er tørt, slip lett over flaten med slipebrett (fint korn) for å ta ned nupp, rusk og reist fiber før neste strøk. Tørk eller støvsug av støvet etterpå.'
          },
          {
            tittel: 'Sett av i rundt igjen',
            html: 'Gjenta kantingen — kost langs kanter og hjørner, liten rull tett inntil — før du ruller resten av flaten på nytt.'
          },
          {
            tittel: 'Siste strøk',
            html: 'Mal ferdig strøk med samme teknikk. Behold slepelyset bak deg gjennom hele strøket, ikke bare i starten — det er like lett å overse et dryppmerke midt i flaten som helt i kanten. Avslutt hver bane i samme retning for jevn struktur.'
          }
        ]
      },
      {
        type: 'callout',
        variant: 'tips',
        tittel: 'Mal alltid inn mot en våt kant',
        html: 'Ikke la en kantet flate tørke før du ruller opp mot den — det gir en synlig overlappingslinje i ferdig strøk. Kant én vegg av gangen og rull den ferdig med det samme, i stedet for å kante hele rommet og rulle etterpå.',
        praksis: true
      }
    ]
  },
  {
    id: 'fasade',
    tittel: 'Fasade',
    ikon: '🏠',
    undertittel: 'Utvendig maling',
    fakta: ['fasade'],
    blokker: [
      {
        type: 'tekst',
        html: 'Utvendig maling — her er fukttransport en reell problemstilling: underlaget blir vått og må kunne tørke ut igjen.',
        intro: true
      },
      { type: 'fakta', gruppe: 'fasade' },
      {
        type: 'kort',
        tittel: '',
        html: '<p>På mur, puss, betong og lignende mineralske fasader er diffusjonsåpen maling hovedregelen — <strong>silikatmaling</strong> og <strong>silikonharpiksmaling</strong> er typiske kategorier. Er malingen for tett, kan fukt bygge seg opp bak sjiktet og med tiden presse av både maling og puss.</p><p>Utvendig treverk (kledning, panel) følger en annen logikk: her er det treverkets eget fuktopptak, konstruksjonens lufting bak kledningen og korrekt forbehandling (grunning, eventuelt beis) som styrer valget, mer enn diffusjonsevnen alene.</p>'
      },
      {
        type: 'callout',
        variant: 'tips',
        tittel: 'Sjekk hva som allerede står på veggen',
        html: 'En diffusjonsåpen maling gjør lite nytte oppå et gammelt, tett plastmalingssjikt — fukten stoppes uansett av laget under. Ved omfattende ommaling av mur/puss er det underlaget og det eksisterende systemet som avgjør, ikke bare den nye malingens datablad. Er du i tvil om oppbygningen, er dette et tilfelle for en fuktvurdering før produktvalg.',
        praksis: true
      }
    ]
  }
];

/** Meta for «Vanlige feil» (egen meny-oppføring i fagstoffet). */
export const FEIL_INFO = {
  id: 'feil',
  tittel: 'Vanlige feil',
  ikon: '⚠️',
  undertittel: 'Kjente fallgruver på tvers av alt',
  intro: 'Kjente fallgruver — lett å unngå, dyrt å rette opp i etterkant.'
};

export const FEIL = [
  {
    feil: 'Behandle malingen som fuktsperre i våtrom',
    hvorfor: 'Ingen våtromsmaling er tettesjikt. Våtsonen skal ha dokumentert tettesjikt — malingen gjelder flatene utenfor. Se <strong>Maling</strong>.'
  },
  {
    feil: 'Mal direkte på fersk sparkel',
    hvorfor: 'Sprekker og skjolder som dukker opp i etterkant. La sparkelen tørke fullt iht. produktets angitte tid. Se <strong>Sparkling</strong>.'
  },
  {
    feil: 'Plasser skjøt nærmere enn 100 mm fra sluket',
    hvorfor: 'I strid med NS 3420-T, og det er nettopp der belastningen er størst. Planlegg beleggretning og skjøter før du kutter. Se <strong>Våtrom</strong>.'
  },
  {
    feil: 'Bruk vanlig takmaling eller innemaling på bad',
    hvorfor: 'Holder ikke mot kondens og avvasking over tid. Velg egnet våtromsmaling. Se <strong>Maling</strong>.'
  },
  {
    feil: 'Avrett med ren selvutjevnende masse og forvent at fallet blir med',
    hvorfor: 'Selvutjevnende masse søker vannrett. Fallforming krever egnet produkt eller stivere blanding, og utsatte høyder før du blander. Se <strong>Gulv &amp; fall</strong>.'
  },
  {
    feil: 'Sveis skjøtene før limet har satt seg',
    hvorfor: 'Normalt neste dag, men den faktiske ventetiden står i limets datablad og varierer med type og forhold.'
  },
  {
    feil: 'Legg belegg rett fra kald bil eller lager',
    hvorfor: 'Belegget jobber seg ut av form etterpå. Akklimatiser minst 24 timer i romtemperatur.'
  },
  {
    feil: 'Hopp over grunning på sparklede flater',
    hvorfor: 'Sparkel suger annerledes enn resten av veggen, og gir synlige skjolder i ferdig strøk — særlig under sidelys.'
  },
  {
    feil: 'Kant hele rommet og rull etterpå',
    hvorfor: 'Kanten rekker å tørke, og du får en synlig overlappingslinje. Kant én vegg og rull den ferdig med det samme.'
  },
  {
    feil: 'Godkjenn sparklingen under taklys',
    hvorfor: 'Jevnt lys ovenfra skjuler nettopp de overgangene sidelys avslører. Sjekk med strøkende lys før du kaller den ferdig.'
  },
  {
    feil: 'Sikt langt brattere enn minstekravet til fall',
    hvorfor: 'Dårligere gangkomfort og økt snublefare uten gevinst. Sikt nær minstekravet — og husk at kravet gjelder ferdig gulv med belegg.'
  },
  {
    feil: 'Avklar sparklingsklasse etter at jobben er gjort',
    hvorfor: 'K2 og K3 er ulik jobb og ulik pris. Klassen avgjør om en synlig bulk er reklamasjon eller innenfor avtalen — avklar den skriftlig før oppstart.'
  },
  {
    feil: 'Bestill masse etter areal × tykkelse ved sluket',
    hvorfor: 'Et gulv med fall er tykkere overalt ellers. Regn på snittykkelsen — se <strong>Kalkulator</strong>.'
  },
  {
    feil: 'Gå på med strøk to fordi flaten «kjennes tørr»',
    hvorfor: 'Klebefri er ikke overmalbar. Vannbasert maling er typisk støvtørr etter en time, men overmalbar først etter to — og de tidene forutsetter 23 °C og 50 % luftfuktighet. Går du på for tidlig, løses strøket under opp eller sperreeffekten uteblir.'
  },
  {
    feil: 'Regn med databladets tørketid i et kaldt eller fuktig rom',
    hvorfor: 'Lav temperatur og høy luftfuktighet forlenger tørketiden betydelig. Flere malinger krever 10–15 °C i både luft <em>og</em> underlag for å tørke i det hele tatt. Et nybygg i november er ikke 23 °C og 50 %.'
  },
  {
    feil: 'Mal rett på ny gips uten grunning',
    hvorfor: 'Ny gips og umalte flater suger ujevnt. Uten grunning får du dårligere feste og må ofte ta et strøk ekstra — du sparer ingen tid på å hoppe over det.'
  },
  {
    feil: 'Mål opp arealet i hodet mens du står med tommestokken',
    hvorfor: '<code>2 × (L + B) × H</code> minus dører og vinduer er lett å bomme på når det haster. Skriv inn målene i <strong>Romareal</strong> i stedet, og send arealet rett videre til malingkalkulatoren.'
  }
];

/** Innledningen over fagstoff-menyen. */
export const FAGSTOFF_INTRO = 'Fagoppslag steg for steg, samme rekkefølge som jobben faktisk gjøres i. Velg et tema.';

/** Foldbar merknad øverst (gamle #intro-note). */
export const INTRO_MERKNAD = {
  tittel: 'Tallene er i hovedsak veiledning og bransjenorm, ikke forskriftstekst',
  html: 'TEK17 stiller <strong>funksjonskrav</strong> — forskriftsteksten sier hva som skal oppnås, ikke nødvendigvis med hvilke tall. De konkrete tallene her (1:50, 1:100, 25 mm osv.) er i hovedsak <strong>preaksepterte ytelser</strong> fra veiledningen: følger du dem, regnes funksjonskravet som oppfylt uten videre dokumentasjon. Andre løsninger er lov, men må da verifiseres ved analyse (TEK17 §2-1) — et prosjekteringsansvar. Tall fra NS 3420 er kontraktsbestemte, ikke forskrift. Hvert kort viser egen hjemmel under «Kilde».'
};

export const KILDER_INTRO = 'Gruppert etter hva slags kilde det er. Regelverk og standard er det bindende; resten er fagveiledning og produktdata som utdyper hvordan det gjøres i praksis.';

export const KILDER = [
  {
    gruppe: 'Regelverk og standard',
    lenker: [
      {
        tekst: 'DiBK — TEK17 §13-15, Våtrom og rom med vanninstallasjoner',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/13/vi/13-15',
        merknad: 'forskrift med veiledning'
      },
      {
        tekst: 'DiBK — TEK17 §2-1, Verifikasjon av funksjonskrav',
        url: 'https://www.dibk.no/regelverk/tek/1/2/2-1',
        merknad: 'forskrift'
      },
      {
        tekst: 'DiBK — Slik leser du TEK17',
        url: 'https://www.dibk.no/regelverk/alt-om-tek/slik-leser-du-tek17',
        merknad: 'funksjonskrav vs. preakseptert ytelse'
      },
      {
        tekst: 'Standard Norge — NS 3420',
        url: 'https://standard.no/fagomrader/ns-3420-/',
        merknad: 'beskrivelsestekster, kontraktsstandard'
      }
    ]
  },
  {
    gruppe: 'Bransjenorm og fagveiledning',
    lenker: [
      {
        tekst: 'SINTEF — Fall mot sluk i våtrom',
        url: 'https://sintef.brage.unit.no/sintef-xmlui/bitstream/handle/11250/2593812/veiledningshefte_2_2018.pdf',
        merknad: 'veiledningshefte'
      },
      {
        tekst: 'SINTEF Byggforsk — BVN 43.105',
        url: 'https://www.byggforsk.no/dokument/3089/baderom_med_badekar_planlegging_og_utfoerelse',
        merknad: 'Byggebransjens våtromsnorm'
      },
      {
        tekst: 'Gulvfakta — Forskrifter og krav til våtrom',
        url: 'https://gulvfakta.no/guide-til-forskrifter-og-krav-til-vatrom',
        merknad: 'bransjeorgan for gulvbransjen'
      },
      {
        tekst: 'Gulvfakta — Montering av vinyl i våtrom',
        url: 'https://gulvfakta.no/montering-av-vinyl-i-vatrom',
        merknad: 'bransjeorgan for gulvbransjen'
      }
    ]
  },
  {
    gruppe: 'Produktdata og praktiske guider',
    lenker: [
      {
        tekst: 'Weber — weberfloor 120 Reno',
        url: 'https://www.weber-norge.no/produkter/weberfloor-120-reno',
        merknad: 'produsent, datablad'
      },
      {
        tekst: 'Mirka — Abranet slipenett',
        url: 'https://www.mirka.com/en-us/products/top-brands/abranet---the-dust-free-net-abrasive/',
        merknad: 'produsent'
      },
      {
        tekst: 'Flip — Sparkling av vegg og tak',
        url: 'https://flip.no/artikler/sparkling-av-vegg-og-tak',
        merknad: 'fagartikkel, K2/K3'
      },
      {
        tekst: 'IFI — Slik avretter du gulvet',
        url: 'https://www.ifi.no/slik-avretter-du-gulvet',
        merknad: 'praktisk guide'
      },
      {
        tekst: 'IFI — Slip hjørner i turbofart',
        url: 'https://www.ifi.no/slip-hjorner-i-turbofart',
        merknad: 'praktisk guide'
      },
      {
        tekst: 'Fixa — Hvordan sveise gulvbelegg',
        url: 'https://handverker.fixa.no/blogg/hvordan-sveise-gulvbelegg-trinn-for-trinn',
        merknad: 'praktisk guide'
      },
      {
        tekst: 'Byggmax — Sparkle gipsskjøter',
        url: 'https://www.byggmax.no/sparkle-gipsskjoter',
        merknad: 'forhandlerguide'
      },
      {
        tekst: 'Alt Fikset — Betonggulv, avretting og forberedelse',
        url: 'https://www.altfikset.no/aktuelt/betonggulv---avretting-og-forberedelse-for-perfekt-gulvlegging-alt-fikset-as',
        merknad: 'praktisk guide'
      },
      {
        tekst: 'Maxmaling — Hva betyr diffusjonsåpen?',
        url: 'https://www.maxmaling.no/hva-betyr-diffusjonsapen-og-hvorfor-er-det-viktig-i-maling-og-murprodukter/',
        merknad: 'forhandlerguide'
      },
      {
        tekst: 'Fargemagasinet — Diffusjonsåpen maling innendørs',
        url: 'https://fargemagasinet.no/ingen-hensikt-med-diffusjonsapen-maling-innendors',
        merknad: 'bransjemedium'
      },
      {
        tekst: 'IFI — Temperatur og ventetid ved maling',
        url: 'https://www.ifi.no/temperatur-og-ventetid-er-viktig-ved-maling',
        merknad: 'tørketid, minstetemperatur'
      },
      {
        tekst: 'Byggebolig — «Men malingen er jo tørr!»',
        url: 'https://inspirasjon.byggebolig.no/men-malingen-er-jo-toerr',
        merknad: 'støvtørr vs. overmalbar'
      },
      {
        tekst: 'Forbrukstall helsparkling — ca. 1,5 kg/m²',
        url: 'https://frieord.no/hvor-mye-koster-det-a-sparkle-en-vegg/',
        merknad: 'kostnadsblogg, ikke produsentdatablad. Grovt anslag som stemmer omtrent med andre uavhengige kilder (bl.a. gipsplateprodusenters fugemasseforbruk, som gjerne oppgis rundt 1,7 kg/m²), men varierer med produkt og påføringsteknikk — sjekk alltid egen sekk'
      }
    ]
  }
];

export const KILDER_MERKNAD = 'Sist researchet: august 2026. Praktisk fagreferanse, ikke juridisk rådgivning eller prosjektering. Der tallene er merket «preakseptert ytelse» stammer de fra veiledningen til TEK17, ikke forskriftsteksten — verifiser mot gjeldende tekst, NS-standard og produktdatablad før bruk som grunnlag for dokumentasjon eller utførelse. NS 3420-referanser i appen oppgir standardens postgruppe, ikke konkret postnummer — standarden er ikke fritt tilgjengelig og postnumrene er ikke slått opp mot en kjøpt utgave. Sjekk gjeldende utgave eller den faktiske beskrivelsesteksten i kontrakten før bruk som dokumentasjon.';
