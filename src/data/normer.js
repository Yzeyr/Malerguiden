/* Normtall for prisberegningen: timer og pris per enhet, og materialforbruk.
   Alle tall kan overstyres under Mitt → Priser og normtall.
   MIDLERTIDIG: tallene byttes ut med tall fra research (akkordtariff og markedspriser). */

export const STANDARD_PRISER = {
  timepris: 750,     // kr per time eks. mva
  mva: 25,           // %
  paslag: 15,        // % påslag på materialer
  trappFaktor: 1.5,  // timene ganges med dette for vegg og tak i trappehull
};

// gruppe styrer visningen under Mitt. enhet: 'm²' | 'lm' | 'stk'.
// forbruk: materialmengde per enhet (L, kg eller stk), materialpris: kr per materialenhet.
export const NORMER = [
  { id: 'rigging-rom', gruppe: 'Rigging', navn: 'Rigging og tildekking', enhet: 'stk', timer: 1.5, pris: 1100, forbruk: 1, materialpris: 120, materialenhet: 'stk' },
  { id: 'rigging-trapp', gruppe: 'Rigging', navn: 'Stige og stillas i trappehull', enhet: 'stk', timer: 2, pris: 1500, forbruk: 0, materialpris: 0 },

  { id: 'vegg-sparkling-skjot', gruppe: 'Vegg', navn: 'Skjøtsparkling vegg', enhet: 'm²', timer: 0.12, pris: 90, forbruk: 0.3, materialpris: 30, materialenhet: 'kg' },
  { id: 'vegg-sparkling-k2', gruppe: 'Vegg', navn: 'Helsparkling vegg K2', enhet: 'm²', timer: 0.25, pris: 190, forbruk: 1.0, materialpris: 30, materialenhet: 'kg' },
  { id: 'vegg-sparkling-k3', gruppe: 'Vegg', navn: 'Helsparkling vegg K3', enhet: 'm²', timer: 0.35, pris: 260, forbruk: 1.5, materialpris: 30, materialenhet: 'kg' },
  { id: 'vegg-sliping', gruppe: 'Vegg', navn: 'Sliping vegg', enhet: 'm²', timer: 0.05, pris: 40, forbruk: 0, materialpris: 0 },
  { id: 'vegg-grunning', gruppe: 'Vegg', navn: 'Grunning vegg', enhet: 'm²', timer: 0.05, pris: 40, forbruk: 0.1, materialpris: 120, materialenhet: 'L' },
  { id: 'vegg-maling-strok', gruppe: 'Vegg', navn: 'Maling vegg, per strøk', enhet: 'm²', timer: 0.07, pris: 55, forbruk: 0.1, materialpris: 180, materialenhet: 'L' },

  { id: 'tak-sparkling-skjot', gruppe: 'Tak', navn: 'Skjøtsparkling tak', enhet: 'm²', timer: 0.15, pris: 110, forbruk: 0.3, materialpris: 30, materialenhet: 'kg' },
  { id: 'tak-sparkling-k2', gruppe: 'Tak', navn: 'Helsparkling tak K2', enhet: 'm²', timer: 0.3, pris: 230, forbruk: 1.0, materialpris: 30, materialenhet: 'kg' },
  { id: 'tak-sparkling-k3', gruppe: 'Tak', navn: 'Helsparkling tak K3', enhet: 'm²', timer: 0.42, pris: 310, forbruk: 1.5, materialpris: 30, materialenhet: 'kg' },
  { id: 'tak-sliping', gruppe: 'Tak', navn: 'Sliping tak', enhet: 'm²', timer: 0.06, pris: 50, forbruk: 0, materialpris: 0 },
  { id: 'tak-grunning', gruppe: 'Tak', navn: 'Grunning tak', enhet: 'm²', timer: 0.06, pris: 50, forbruk: 0.1, materialpris: 120, materialenhet: 'L' },
  { id: 'tak-maling-strok', gruppe: 'Tak', navn: 'Maling tak, per strøk', enhet: 'm²', timer: 0.09, pris: 65, forbruk: 0.1, materialpris: 160, materialenhet: 'L' },

  { id: 'lister-strok', gruppe: 'Lister, vinduer og dører', navn: 'Lister, per strøk', enhet: 'lm', timer: 0.06, pris: 45, forbruk: 0.01, materialpris: 300, materialenhet: 'L' },
  { id: 'vindu-strok', gruppe: 'Lister, vinduer og dører', navn: 'Vindu med karm, per strøk', enhet: 'stk', timer: 0.75, pris: 550, forbruk: 0.15, materialpris: 300, materialenhet: 'L' },
  { id: 'dor-strok', gruppe: 'Lister, vinduer og dører', navn: 'Dør med karm, per strøk', enhet: 'stk', timer: 0.75, pris: 550, forbruk: 0.2, materialpris: 300, materialenhet: 'L' },
];

export const NORM_BY_ID = Object.fromEntries(NORMER.map((n) => [n.id, n]));
