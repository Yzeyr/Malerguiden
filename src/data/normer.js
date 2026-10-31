/* Normtall for prisberegningen: timer og pris per enhet, og materialforbruk.
   Alle tall kan overstyres under Mitt → Priser og normtall.

   Kilde: «Akkordtariff for malerfaget» (2019-utgaven med påslag for 2026),
   regnet om til timer med antatt 330 kr/t akkordfortjeneste og ×1,35 for
   bebodd bolig (tariffens eget tillegg). Markedspriser fra Flip, Mittanbud,
   Oppussingsguiden m.fl. Tall merket «skjønn» har ingen publisert norm.
   `pris` er fastpris per enhet eks. mva og eks. materialer (enhetspris-modus).
   `materialpris` er innkjøpspris eks. mva; påslaget legges på i appen. */

export const STANDARD_PRISER = {
  timepris: 650,     // kr per time eks. mva (vanlig 500–850, Oslo opptil 950)
  mva: 25,           // %
  paslag: 15,        // % påslag på materialer (kildene sier 10–25)
  trappFaktor: 1.35, // tariffens tillegg for trappegang: +35 % på vegg og tak
};

// gruppe styrer visningen under Mitt. enhet: 'm²' | 'lm' | 'stk'.
// forbruk: materialmengde per enhet, materialpris: kr per materialenhet.
export const NORMER = [
  { id: 'jobb-oppstart', gruppe: 'Rigging', navn: 'Oppstart, kjøring og sluttrydding', enhet: 'stk', timer: 1.0, pris: 450, forbruk: 0, materialpris: 0 },
  // Tariffen gir 1,0 t (skjønn); en kontroll mot markedet viser at 1,5 t passer bedre for bebodde rom.
  { id: 'rigging-rom', gruppe: 'Rigging', navn: 'Rigging og maskering', enhet: 'stk', timer: 1.0, pris: 600, forbruk: 1, materialpris: 60, materialenhet: 'rom' },
  { id: 'mobler-rom', gruppe: 'Rigging', navn: 'Flytte og dekke til møbler', enhet: 'stk', timer: 1.0, pris: 650, forbruk: 1, materialpris: 40, materialenhet: 'rom' }, // skjønn, huk av per rom
  { id: 'dekking-gulv', gruppe: 'Rigging', navn: 'Tildekking av gulv med papp', enhet: 'm²', timer: 0.02, pris: 13, forbruk: 1.1, materialpris: 12, materialenhet: 'm²' },
  { id: 'rigging-trapp', gruppe: 'Rigging', navn: 'Stige og stillas i trappehull', enhet: 'stk', timer: 2, pris: 1300, forbruk: 0, materialpris: 0 }, // skjønn

  // Sparkling i runder. K1: strimling og 2. strøk. K2: strimling, 2. og 3. strøk og sliping (skjøter,
  // hjørner, skruehull, rundt vinduer og dører). K3: K2 pluss helsparkling av hele flaten til slutt.
  // 2. og 3. strøk er målt på jobb 29.10.2026 (Namsos, ca. 111 m² vegg og tak, med boks):
  // 2. strøk ca. 6 t, 3. strøk ca. 8 t. Strimling og sliping er fortsatt skjønn.
  // Skader og tverrskjøter fylles med hurtigherdende gipssparkel (Ardex A 828) før strimlingen.
  // Herder på noen timer, så det er ingen egen tørkerunde. Tid og forbruk er skjønn; ca. 30 kr/kg.
  { id: 'vegg-sparkling-fylling', gruppe: 'Vegg', navn: 'Skader og tverrskjøter med Ardex A 828, vegg', enhet: 'm²', timer: 0.02, pris: 16, forbruk: 0.1, materialpris: 30, materialenhet: 'kg' },
  { id: 'vegg-sparkling-strimling', gruppe: 'Vegg', navn: 'Strimling vegg (skjøter, hjørner og skruehull)', enhet: 'm²', timer: 0.045, pris: 36, forbruk: 0.12, materialpris: 50, materialenhet: 'L' },
  { id: 'vegg-sparkling-strok2', gruppe: 'Vegg', navn: 'Sparkling vegg, 2. strøk', enhet: 'm²', timer: 0.05, pris: 40, forbruk: 0.1, materialpris: 50, materialenhet: 'L' },
  { id: 'vegg-sparkling-strok3', gruppe: 'Vegg', navn: 'Sparkling vegg, 3. strøk (finstrøk)', enhet: 'm²', timer: 0.065, pris: 52, forbruk: 0.08, materialpris: 50, materialenhet: 'L' },
  { id: 'vegg-sparkling-sliping', gruppe: 'Vegg', navn: 'Sliping av sparkel, vegg', enhet: 'm²', timer: 0.02, pris: 16, forbruk: 0, materialpris: 0 },
  { id: 'vegg-sparkling-hel', gruppe: 'Vegg', navn: 'Helsparkling vegg, hele flaten, med sliping (K3)', enhet: 'm²', timer: 0.15, pris: 145, forbruk: 0.8, materialpris: 50, materialenhet: 'L' },
  // Ytterhjørner (hjørner som stikker ut i rommet): hjørnelist og 3 strøk sparkel med sliping. Skjønn.
  { id: 'ytterhjorne', gruppe: 'Vegg', navn: 'Ytterhjørner: hjørnelist og 3 strøk sparkel med sliping', enhet: 'lm', timer: 0.2, pris: 150, forbruk: 1.05, materialpris: 25, materialenhet: 'lm' },
  { id: 'vegg-grunning', gruppe: 'Vegg', navn: 'Grunning vegg', enhet: 'm²', timer: 0.015, pris: 30, forbruk: 0.14, materialpris: 95, materialenhet: 'L' },
  { id: 'vegg-maling-strok1', gruppe: 'Vegg', navn: 'Maling vegg, 1. strøk', enhet: 'm²', timer: 0.027, pris: 60, forbruk: 0.12, materialpris: 130, materialenhet: 'L' },
  { id: 'vegg-maling-strok', gruppe: 'Vegg', navn: 'Maling vegg, neste strøk', enhet: 'm²', timer: 0.022, pris: 50, forbruk: 0.10, materialpris: 130, materialenhet: 'L' },

  // Tak: ca. +20 % på tiden (skjønn).
  { id: 'tak-sparkling-fylling', gruppe: 'Tak', navn: 'Skader og tverrskjøter med Ardex A 828, tak', enhet: 'm²', timer: 0.024, pris: 20, forbruk: 0.1, materialpris: 30, materialenhet: 'kg' },
  { id: 'tak-sparkling-strimling', gruppe: 'Tak', navn: 'Strimling tak (skjøter, hjørner og skruehull)', enhet: 'm²', timer: 0.054, pris: 43, forbruk: 0.12, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-sparkling-strok2', gruppe: 'Tak', navn: 'Sparkling tak, 2. strøk', enhet: 'm²', timer: 0.06, pris: 48, forbruk: 0.1, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-sparkling-strok3', gruppe: 'Tak', navn: 'Sparkling tak, 3. strøk (finstrøk)', enhet: 'm²', timer: 0.08, pris: 64, forbruk: 0.08, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-sparkling-sliping', gruppe: 'Tak', navn: 'Sliping av sparkel, tak', enhet: 'm²', timer: 0.025, pris: 20, forbruk: 0, materialpris: 0 },
  { id: 'tak-sparkling-hel', gruppe: 'Tak', navn: 'Helsparkling tak, hele flaten, med sliping (K3)', enhet: 'm²', timer: 0.18, pris: 175, forbruk: 0.8, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-grunning', gruppe: 'Tak', navn: 'Grunning tak', enhet: 'm²', timer: 0.018, pris: 36, forbruk: 0.14, materialpris: 95, materialenhet: 'L' },
  { id: 'tak-maling-strok1', gruppe: 'Tak', navn: 'Maling tak, 1. strøk', enhet: 'm²', timer: 0.032, pris: 75, forbruk: 0.12, materialpris: 120, materialenhet: 'L' },
  { id: 'tak-maling-strok', gruppe: 'Tak', navn: 'Maling tak, neste strøk', enhet: 'm²', timer: 0.027, pris: 65, forbruk: 0.10, materialpris: 120, materialenhet: 'L' },

  // Listefritt: overganger som sparkles i stedet for å dekkes med list.
  // Tak/vegg er tariffens «strimling + sparkling overgang tak/vegg». Hjørner, vinduer og dører er skjønn.
  // Sliping lagt til (+0,03 t/lm, skjønn).
  { id: 'listefritt-tak', gruppe: 'Listefritt', navn: 'Listefritt mot tak (strimling, sparkling og sliping)', enhet: 'lm', timer: 0.18, pris: 120, forbruk: 0.1, materialpris: 50, materialenhet: 'L' },
  { id: 'listefritt-hjorne', gruppe: 'Listefritt', navn: 'Listefrie hjørner (strimling, sparkling og sliping)', enhet: 'lm', timer: 0.18, pris: 120, forbruk: 0.1, materialpris: 50, materialenhet: 'L' },
  { id: 'listefritt-vindu', gruppe: 'Listefritt', navn: 'Listefritt vindu (PVC-hjørnelist i smyg, 3 strøk sparkel, slip)', enhet: 'stk', timer: 1.2, pris: 850, forbruk: 0.5, materialpris: 50, materialenhet: 'L' },
  // Listefri dør gjøres som vindu: PVC-hjørnelist i smygen, 3 strøk sparkel og sliping.
  { id: 'listefritt-dor', gruppe: 'Listefritt', navn: 'Listefri dør (PVC-hjørnelist i smyg, 3 strøk sparkel, slip)', enhet: 'stk', timer: 1.2, pris: 850, forbruk: 0.5, materialpris: 50, materialenhet: 'L' },
  // Skjønn. Smygen ved listefrie vinduer og dører: tape rundt karmen, fuge mot karmen og male smygen
  // 2 strøk (ca. 0,15 + 0,2 + 0,35 t). Malingen er regnet med; fugemassen er liten og ikke med.
  { id: 'listefritt-smyg', gruppe: 'Listefritt', navn: 'Smyg ved listefritt vindu/dør (tape, fuge, male 2 strøk)', enhet: 'stk', timer: 0.7, pris: 500, forbruk: 0.15, materialpris: 130, materialenhet: 'L' },
  // Skjønn. Skarp linje mellom vegg- og takfarge uten taklist: 2 strøk veggfarge opp mot taket dagen før,
  // tape, så 2 strøk takfarge. Dette er tiden for frem og tilbake; selve malingen ligger i vegg og tak.
  { id: 'listefritt-taklinje', gruppe: 'Listefritt', navn: 'Skarp linje tak/vegg (veggfarge, tape, takfarge)', enhet: 'lm', timer: 0.08, pris: 55, forbruk: 0, materialpris: 0 },

  // Gulvbelegg (vinyl, linoleum) lagt på ferdig undergulv. Skjønn: ingen norsk norm funnet.
  // Forbruket har 10 % til kapp. Våtrom med sveis og oppbrett tar lengre tid.
  { id: 'gulvbelegg', gruppe: 'Gulv', navn: 'Gulvbelegg (vinyl/linoleum), legging på ferdig undergulv', enhet: 'm²', timer: 0.25, pris: 250, forbruk: 1.1, materialpris: 350, materialenhet: 'm²' },

  { id: 'lister-strok', gruppe: 'Lister, vinduer og dører', navn: 'Gulv- og taklister, per strøk', enhet: 'lm', timer: 0.031, pris: 35, forbruk: 0.01, materialpris: 180, materialenhet: 'L' },
  { id: 'vindu-strok', gruppe: 'Lister, vinduer og dører', navn: 'Vindu med karm og foring, per strøk', enhet: 'stk', timer: 0.50, pris: 400, forbruk: 0.08, materialpris: 180, materialenhet: 'L' },
  // Én side av døra (dørblad + karm og gerikt). En dør mellom to rom telles i begge rommene, én side hver.
  { id: 'dor-strok', gruppe: 'Lister, vinduer og dører', navn: 'Dør, én side med karm, per strøk', enhet: 'stk', timer: 0.44, pris: 325, forbruk: 0.24, materialpris: 180, materialenhet: 'L' },
];

/* Hva hver linje i prisen inneholder, kort. Vises under linjen i Utregning og i prisen per rom. */
export const MED = {
  'jobb-oppstart': 'Oppstart, kjøring og sluttrydding. Én gang per jobb.',
  'rigging-rom': 'Tape, plast og maskering i rommet, og rydding etterpå.',
  'mobler-rom': 'Flytte møblene og dekke dem til.',
  'dekking-gulv': 'Papp på hele gulvet, med 10 % omlegg.',
  'rigging-trapp': 'Sette opp og flytte stige eller stillas i trappehullet.',
  'vegg-sparkling-fylling': 'Gå over skader og tverrskjøter med Ardex A 828 (hurtigherdende) før strimlingen.',
  'tak-sparkling-fylling': 'Gå over skader og tverrskjøter med Ardex A 828 (hurtigherdende) før strimlingen.',
  'vegg-sparkling-strimling': 'Første runde: papirstrimmel og sparkel i skjøter og innerhjørner, sparkel i skruehull.',
  'tak-sparkling-strimling': 'Første runde: papirstrimmel og sparkel i skjøter og innerhjørner, sparkel i skruehull.',
  'vegg-sparkling-strok2': 'Andre runde sparkel over skjøter, hjørner og skruehull.',
  'tak-sparkling-strok2': 'Andre runde sparkel over skjøter, hjørner og skruehull.',
  'vegg-sparkling-strok3': 'Tredje runde (finstrøk) over skjøter, hjørner og skruehull.',
  'tak-sparkling-strok3': 'Tredje runde (finstrøk) over skjøter, hjørner og skruehull.',
  'vegg-sparkling-sliping': 'Sliping av sparkelen før grunning eller maling.',
  'tak-sparkling-sliping': 'Sliping av sparkelen før grunning eller maling.',
  'vegg-sparkling-hel': 'Hele flaten sparkles og slipes til slutt (K3). Kommer i tillegg til skjøtene.',
  'tak-sparkling-hel': 'Hele flaten sparkles og slipes til slutt (K3). Kommer i tillegg til skjøtene.',
  'ytterhjorne': 'Hjørnelist monteres, 3 strøk sparkel og sliping. Malingen ligger i Maling vegg.',
  'vegg-grunning': 'Ett strøk grunning på hele veggflaten.',
  'tak-grunning': 'Ett strøk grunning på hele takflaten.',
  'vegg-maling-strok1': 'Første strøk maling på hele veggflaten.',
  'vegg-maling-strok': 'Ett strøk til på hele veggflaten.',
  'tak-maling-strok1': 'Første strøk maling på hele takflaten.',
  'tak-maling-strok': 'Ett strøk til på hele takflaten.',
  'listefritt-tak': 'Strimling, sparkling og sliping av overgangen tak/vegg i stedet for taklist. Fargeskillet står i egen linje.',
  'listefritt-hjorne': 'Strimling, sparkling og sliping av innerhjørnene i stedet for hjørnelist. Malingen ligger i Maling vegg.',
  'listefritt-vindu': 'PVC-hjørnelist i smygen, 3 strøk sparkel og sliping, i stedet for gerikt. Tape, fuge og maling står i Smyg-linjen.',
  'listefritt-dor': 'PVC-hjørnelist i smygen, 3 strøk sparkel og sliping, i stedet for gerikt. Tape, fuge og maling står i Smyg-linjen.',
  'listefritt-smyg': 'Tape rundt karmen, fuge mot karmen og male smygen 2 strøk. Fugemassen er ikke regnet med.',
  'listefritt-taklinje': '2 strøk veggfarge opp mot taket dagen før, tape, så 2 strøk takfarge. Tiden for frem og tilbake; malingen ligger i vegg og tak.',
  'gulvbelegg': 'Legging av vinyl eller linoleum på ferdig undergulv. Materialet har 10 % til kapp.',
  'lister-strok': 'Ett strøk på gulv- og taklister.',
  'vindu-strok': 'Ett strøk på vindu med karm og foring.',
  'dor-strok': 'Ett strøk på én side av døra: dørblad, karm og gerikt.',
};

export const NORM_BY_ID = Object.fromEntries(NORMER.map((n) => [n.id, n]));
