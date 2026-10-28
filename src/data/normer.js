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

  { id: 'vegg-sparkling-skjot', gruppe: 'Vegg', navn: 'Skjøtsparkling vegg (strimmel, flekk, skjøt, slip)', enhet: 'm²', timer: 0.10, pris: 80, forbruk: 0.3, materialpris: 50, materialenhet: 'L' },
  { id: 'vegg-sparkling-k2', gruppe: 'Vegg', navn: 'Helsparkling vegg K2, med sliping', enhet: 'm²', timer: 0.17, pris: 160, forbruk: 0.6, materialpris: 50, materialenhet: 'L' },
  { id: 'vegg-sparkling-k3', gruppe: 'Vegg', navn: 'Helsparkling vegg K3, med sliping', enhet: 'm²', timer: 0.25, pris: 225, forbruk: 1.1, materialpris: 50, materialenhet: 'L' },
  { id: 'vegg-grunning', gruppe: 'Vegg', navn: 'Grunning vegg', enhet: 'm²', timer: 0.015, pris: 30, forbruk: 0.14, materialpris: 95, materialenhet: 'L' },
  { id: 'vegg-maling-strok1', gruppe: 'Vegg', navn: 'Maling vegg, 1. strøk', enhet: 'm²', timer: 0.027, pris: 60, forbruk: 0.12, materialpris: 130, materialenhet: 'L' },
  { id: 'vegg-maling-strok', gruppe: 'Vegg', navn: 'Maling vegg, neste strøk', enhet: 'm²', timer: 0.022, pris: 50, forbruk: 0.10, materialpris: 130, materialenhet: 'L' },

  // Tak: ca. +20 % på tiden (skjønn).
  { id: 'tak-sparkling-skjot', gruppe: 'Tak', navn: 'Skjøtsparkling tak (strimmel, flekk, skjøt, slip)', enhet: 'm²', timer: 0.12, pris: 95, forbruk: 0.3, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-sparkling-k2', gruppe: 'Tak', navn: 'Helsparkling tak K2, med sliping', enhet: 'm²', timer: 0.20, pris: 190, forbruk: 0.6, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-sparkling-k3', gruppe: 'Tak', navn: 'Helsparkling tak K3, med sliping', enhet: 'm²', timer: 0.30, pris: 270, forbruk: 1.1, materialpris: 50, materialenhet: 'L' },
  { id: 'tak-grunning', gruppe: 'Tak', navn: 'Grunning tak', enhet: 'm²', timer: 0.018, pris: 36, forbruk: 0.14, materialpris: 95, materialenhet: 'L' },
  { id: 'tak-maling-strok1', gruppe: 'Tak', navn: 'Maling tak, 1. strøk', enhet: 'm²', timer: 0.032, pris: 75, forbruk: 0.12, materialpris: 120, materialenhet: 'L' },
  { id: 'tak-maling-strok', gruppe: 'Tak', navn: 'Maling tak, neste strøk', enhet: 'm²', timer: 0.027, pris: 65, forbruk: 0.10, materialpris: 120, materialenhet: 'L' },

  // Listefritt: overganger som sparkles i stedet for å dekkes med list.
  // Tak/vegg er tariffens «strimling + sparkling overgang tak/vegg». Hjørner, vinduer og dører er skjønn.
  { id: 'listefritt-tak', gruppe: 'Listefritt', navn: 'Listefritt mot tak (strimling og sparkling)', enhet: 'lm', timer: 0.15, pris: 100, forbruk: 0.1, materialpris: 50, materialenhet: 'L' },
  { id: 'listefritt-hjorne', gruppe: 'Listefritt', navn: 'Listefrie hjørner (strimling og sparkling)', enhet: 'lm', timer: 0.15, pris: 100, forbruk: 0.1, materialpris: 50, materialenhet: 'L' },
  { id: 'listefritt-vindu', gruppe: 'Listefritt', navn: 'Listefritt vindu (PVC-hjørnelist i smyg, 3 strøk sparkel, slip)', enhet: 'stk', timer: 1.2, pris: 850, forbruk: 0.5, materialpris: 50, materialenhet: 'L' },
  { id: 'listefritt-dor', gruppe: 'Listefritt', navn: 'Listefri dør, én side (overgang karm og vegg)', enhet: 'stk', timer: 0.6, pris: 420, forbruk: 0.2, materialpris: 50, materialenhet: 'L' },

  { id: 'lister-strok', gruppe: 'Lister, vinduer og dører', navn: 'Gulv- og taklister, per strøk', enhet: 'lm', timer: 0.031, pris: 35, forbruk: 0.01, materialpris: 180, materialenhet: 'L' },
  { id: 'vindu-strok', gruppe: 'Lister, vinduer og dører', navn: 'Vindu med karm og foring, per strøk', enhet: 'stk', timer: 0.50, pris: 400, forbruk: 0.08, materialpris: 180, materialenhet: 'L' },
  // Én side av døra (dørblad + karm og gerikt). En dør mellom to rom telles i begge rommene, én side hver.
  { id: 'dor-strok', gruppe: 'Lister, vinduer og dører', navn: 'Dør, én side med karm, per strøk', enhet: 'stk', timer: 0.44, pris: 325, forbruk: 0.24, materialpris: 180, materialenhet: 'L' },
];

export const NORM_BY_ID = Object.fromEntries(NORMER.map((n) => [n.id, n]));
