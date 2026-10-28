import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KALKULATORER, regn, tall, fmt, fmtLiter, standardverdier, spannForslag, tolkSok, romTilAreal,
} from '../src/calc.js';

// nb-NO bruker NBSP / smalt NBSP som tusenskille og U+2212 som minus.
const n = (s) => String(s).replace(/[   ]/g, ' ').replace(/−/g, '-');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const detalj = (r, label) => {
  const d = r.detaljer.find((x) => x.label === label);
  assert.ok(d, 'mangler detalj ' + label);
  return n(d.tekst);
};

describe('tall og fmt', () => {
  test('tall godtar komma, punktum og mellomrom', () => {
    assert.equal(tall('1,75'), 1.75);
    assert.equal(tall('1.75'), 1.75);
    assert.equal(tall(' 1 234,5 '), 1234.5);
    assert.equal(tall('2,4 m'), 2.4); // parseFloat stopper ved bokstav
    assert.ok(Number.isNaN(tall('')));
    assert.ok(Number.isNaN(tall('abc')));
    assert.ok(Number.isNaN(tall(undefined)));
    assert.ok(Number.isNaN(tall(true)));
  });
  test('fmt formaterer nb-NO og gir — for ugyldig', () => {
    assert.equal(fmt(23.33, 1), '23,3');
    assert.equal(fmt(14, 2), '14,00');
    assert.equal(n(fmt(12345.6, 0)), '12 346');
    assert.equal(fmt(NaN, 1), '—');
    assert.equal(fmt(Infinity, 0), '—');
  });
  test('fmtLiter trimmer nuller', () => {
    assert.equal(fmtLiter(9), '9 L');
    assert.equal(fmtLiter(11.7), '11,7 L');
    assert.equal(fmtLiter(9.68), '9,68 L');
    assert.equal(fmtLiter(13.200000000000001), '13,2 L');
  });
});

describe('definisjoner', () => {
  test('rekkefølge og felt-id-er', () => {
    assert.deepEqual(KALKULATORER.map((k) => k.id),
      ['calc-maling', 'calc-sparkel', 'calc-bad', 'calc-forbruk', 'calc-rom']);
    const ids = KALKULATORER.flatMap((k) => k.felt.map((f) => f.id));
    assert.equal(new Set(ids).size, ids.length, 'felt-id-er må være unike');
    for (const id of ['mal-areal', 'mal-strok', 'mal-forbruk', 'mal-svinn', 'sp-areal', 'sp-forbruk', 'sp-svinn', 'sp-sekk',
      'bad-areal', 'bad-areal-dusj', 'bad-sluk', 'bad-avstand-dusj', 'bad-avstand-hoyeste', 'bad-form', 'bad-varmekabel',
      'bad-forbruk', 'bad-svinn', 'bad-sekk', 'fb-areal', 'fb-tykk', 'fb-forbruk', 'fb-svinn', 'fb-sekk', 'fb-varmekabel',
      'rom-lengde', 'rom-bredde', 'rom-hoyde', 'rom-dorer', 'rom-vinduer']) {
      assert.ok(ids.includes(id), 'mangler ' + id);
    }
    for (const k of KALKULATORER) {
      for (const f of k.felt) {
        assert.ok(['tall', 'heltall', 'valg', 'avkrysning'].includes(f.type), f.id);
        if (f.type === 'tall' || f.type === 'heltall') assert.ok(f.steg > 0, f.id + ' mangler steg');
        if (f.type === 'valg') assert.ok(f.valg.some((x) => x.verdi === f.standard), f.id);
      }
    }
  });
  test('standardverdier som i originalen', () => {
    assert.deepEqual(standardverdier('calc-forbruk'),
      { 'fb-areal': '20', 'fb-tykk': '5', 'fb-varmekabel': false, 'fb-forbruk': '1,75', 'fb-svinn': '10', 'fb-sekk': '20' });
    assert.equal(standardverdier('calc-bad')['bad-form'], '0.6667');
    assert.equal(standardverdier('calc-rom')['rom-hoyde'], '2,4');
    assert.throws(() => standardverdier('calc-finnes-ikke'));
  });
  test('sparkelforbruk sier at kg/m² er totalt for alle strøk', () => {
    const f = KALKULATORER.find((k) => k.id === 'calc-sparkel').felt.find((x) => x.id === 'sp-forbruk');
    assert.match(f.hint, /totalt for alle strøk/i);
  });
});

describe('standard-eksempler', () => {
  test('avretting: 193 kg, 10 sekker, 36,0 liter', () => {
    const r = regn('calc-forbruk', standardverdier('calc-forbruk'));
    assert.equal(r.ok, true);
    assert.equal(r.hoved.tekst, '10 sekker');
    assert.equal(r.hoved.tall, 10);
    assert.equal(detalj(r, 'Masse inkl. svinn'), '193 kg');
    assert.equal(detalj(r, 'Vann til blanding'), '36,0 liter');
    assert.equal(r.mengde, 193);
    assert.equal(r.sammendrag, 'Avrettingsmasse: 10 sekker (193 kg)');
    assert.deepEqual(r.advarsler, []);
  });
  test('bad: 424 kg, 22 sekker, snitt 23,3 / 40,0 mm, 10 → 30 → 45 mm', () => {
    const r = regn('calc-bad', standardverdier('calc-bad'));
    assert.equal(r.ok, true);
    assert.equal(r.hoved.tekst, '22 sekker');
    assert.equal(detalj(r, 'Masse inkl. svinn'), '424 kg');
    assert.equal(detalj(r, 'Snitt lagtykkelse, dusjsone'), '23,3 mm');
    assert.equal(detalj(r, 'Snitt lagtykkelse, resten'), '40,0 mm');
    assert.equal(detalj(r, 'Sluk → dusjsonekant → høyeste punkt'), '10 → 30 → 45 mm');
    assert.equal(r.mengde, 424);
    assert.equal(r.sammendrag, 'Masse til bad: 22 sekker (424 kg)');
    assert.deepEqual(r.advarsler, []);
  });
  test('rom: vegg 30,5, tak 12,0, total 42,5, omkrets 14,00', () => {
    const r = regn('calc-rom', standardverdier('calc-rom'));
    assert.equal(r.ok, true);
    assert.equal(r.hoved.tekst, '30,5 m²');
    assert.equal(detalj(r, 'Takareal'), '12,0 m²');
    assert.equal(detalj(r, 'Vegg + tak'), '42,5 m²');
    assert.equal(detalj(r, 'Omkrets (til lister)'), '14,00 m');
    assert.equal(r.mengde, null);
    assert.equal(r.sammendrag, 'Romareal: 42,5 m²');
  });
  test('sparkel: 99 kg, 4 sekker/spann', () => {
    const r = regn('calc-sparkel', standardverdier('calc-sparkel'));
    assert.equal(r.ok, true);
    assert.equal(r.hoved.tekst, '4 sekker/spann');
    assert.equal(detalj(r, 'Masse inkl. svinn'), '99 kg');
    assert.equal(detalj(r, 'Fordelt'), '4 × 25 kg');
    assert.equal(r.mengde, 99);
    assert.equal(r.sammendrag, 'Sparkelmasse: 4 sekker/spann (99 kg)');
  });
  test('maling: 13,2 L → 1 × 9 L + 2 × 2,7 L', () => {
    const r = regn('calc-maling', standardverdier('calc-maling'));
    assert.equal(r.ok, true);
    assert.equal(r.hoved.tekst, '13,2 L');
    assert.equal(r.hoved.enhet, 'liter');
    near(r.hoved.tall, 13.2);
    assert.equal(r.mengde, 13.2);
    assert.equal(detalj(r, 'Anbefalt innkjøp'), '1 × 9 L + 2 × 2,7 L');
    assert.equal(detalj(r, 'Det gir'), '14,4 L');
    assert.equal(r.sammendrag, 'Maling: 1 × 9 L + 2 × 2,7 L (13,2 L)');
    assert.equal(r.spann.tekst, '1 × 9 L + 2 × 2,7 L');
    assert.deepEqual(r.advarsler, []);
  });
  test('manglende felt får standardverdi', () => {
    assert.equal(regn('calc-sparkel', {}).hoved.tekst, '4 sekker/spann');
    assert.equal(regn('calc-maling', { 'mal-areal': '40' }).sammendrag, 'Maling: 1 × 9 L (8,8 L)');
  });
});

describe('spannForslag', () => {
  const tilfeller = [
    [0.5, '1 × 0,68 L', 0.68],
    [2.0, '1 × 2,7 L', 2.7],
    [2.2, '1 × 2,7 L', 2.7],
    [7, '1 × 9 L', 9],
    [8.8, '1 × 9 L', 9],
    [13.2, '1 × 9 L + 2 × 2,7 L', 14.4],
    [20, '2 × 9 L + 1 × 2,7 L', 20.7],
  ];
  for (const [liter, tekst, dekker] of tilfeller) {
    test(`${liter} L → ${tekst}`, () => {
      const s = spannForslag(liter);
      assert.equal(s.tekst, tekst);
      near(s.dekker, dekker);
      near(s.tilOvers, dekker - liter, 0.006);
      assert.ok(s.dekker >= liter);
    });
  }
  test('kombinasjon har l, antall og label', () => {
    assert.deepEqual(spannForslag(13.2).kombinasjon, [
      { l: 9, antall: 1, label: '9 L' },
      { l: 2.7, antall: 2, label: '2,7 L' },
    ]);
  });
  test('dekker alltid behovet, også for store mengder', () => {
    for (let l = 0.1; l < 60; l += 0.37) {
      const s = spannForslag(l);
      assert.ok(s.dekker + 1e-9 >= l, `${l}: ${s.tekst}`);
      assert.ok(s.kombinasjon.reduce((a, k) => a + k.antall, 0) <= 10, `${l}: ${s.tekst}`);
    }
    assert.ok(spannForslag(500).dekker >= 500);
  });
  test('0, negativt og NaN gir «0 L»', () => {
    for (const l of [0, -2, NaN]) {
      const s = spannForslag(l);
      assert.equal(s.tekst, '0 L');
      assert.equal(s.dekker, 0);
      assert.deepEqual(s.kombinasjon, []);
    }
  });
  test('egne størrelser', () => {
    assert.equal(spannForslag(4, [3, 1]).tekst, '1 × 3 L + 1 × 1 L');
  });
});

describe('advarsler', () => {
  test('feil 13: maling advarer utenfor 6–14 m²/L, og teksten sier det', () => {
    for (const f of ['5', '15']) {
      const r = regn('calc-maling', { 'mal-forbruk': f });
      assert.equal(r.advarsler.length, 1, f);
      assert.match(r.advarsler[0], /6–14 m²\/L/);
    }
    for (const f of ['6', '8', '12', '14']) assert.deepEqual(regn('calc-maling', { 'mal-forbruk': f }).advarsler, [], f);
  });
  test('maling: strøk må være helt tall', () => {
    assert.match(regn('calc-maling', { 'mal-strok': '1,5' }).advarsler.join(' '), /helt tall/);
  });
  test('feil 16: bad-sluk = 0 gir advarsel om minst 4 mm', () => {
    const r = regn('calc-bad', { 'bad-sluk': '0' });
    assert.equal(r.ok, true);
    assert.ok(r.advarsler.some((a) => /under minste lagtykkelse på 4 mm/.test(a) && a.includes('(0 mm)')));
    assert.ok(regn('calc-bad', { 'bad-sluk': '3' }).advarsler.some((a) => a.includes('(3 mm)')));
    assert.ok(!regn('calc-bad', { 'bad-sluk': '4' }).advarsler.some((a) => /4 mm for weberfloor/.test(a)));
  });
  test('bad: øvrige advarsler', () => {
    const r = regn('calc-bad', { 'bad-areal-dusj': '7', 'bad-avstand-hoyeste': '0,5', 'bad-varmekabel': true });
    const alle = r.advarsler.join(' ');
    assert.match(alle, /Dusjsonen kan ikke være større/);
    assert.match(alle, /kortere enn avstanden til dusjsonekanten/);
    assert.match(alle, /særlig nær sluket der laget er tynnest/);
    assert.match(regn('calc-bad', { 'bad-avstand-dusj': '0', 'bad-avstand-hoyeste': '0' }).advarsler.join(' '), /plant, uten fall/);
    assert.match(regn('calc-bad', { 'bad-avstand-hoyeste': '4' }).advarsler.join(' '), /60 mm — over maks 50 mm/);
  });
  test('avretting: tykkelse og varmekabel', () => {
    assert.match(regn('calc-forbruk', { 'fb-tykk': '3' }).advarsler.join(' '), /under minste lagtykkelse/);
    assert.match(regn('calc-forbruk', { 'fb-tykk': '60' }).advarsler.join(' '), /over maks 50 mm/);
    assert.match(regn('calc-forbruk', { 'fb-varmekabel': true }).advarsler.join(' '), /kabeldatabladet\.$/);
  });
  test('sparkel: tykt sjikt over 4 kg/m², og 1 sekk/spann i entall', () => {
    assert.match(regn('calc-sparkel', { 'sp-forbruk': '5' }).advarsler.join(' '), /tykt sjikt/);
    assert.equal(regn('calc-sparkel', { 'sp-areal': '5' }).hoved.tekst, '1 sekk/spann');
  });
  test('rom: takhøyde og for stort fratrekk', () => {
    assert.match(regn('calc-rom', { 'rom-hoyde': '240' }).advarsler.join(' '), /er den i meter/);
    const r = regn('calc-rom', { 'rom-lengde': '1', 'rom-bredde': '1', 'rom-hoyde': '2', 'rom-dorer': '5' });
    assert.equal(r.hoved.tall, 0);
    assert.match(r.advarsler.join(' '), /Fratrekket for dører og vinduer er større/);
  });
  test('tomt svinn regnes som 0 %', () => {
    assert.equal(n(detalj(regn('calc-sparkel', { 'sp-svinn': '' }), 'Masse inkl. svinn')), '90 kg');
  });
});

describe('ugyldig input', () => {
  const tilfeller = [
    ['calc-maling', { 'mal-areal': '' }, 'Fyll inn areal, antall strøk og forbruk.'],
    ['calc-maling', { 'mal-strok': '0' }, 'Fyll inn areal, antall strøk og forbruk.'],
    ['calc-sparkel', { 'sp-sekk': 'abc' }, 'Fyll inn areal, forbruk og sekkestørrelse.'],
    ['calc-bad', { 'bad-sluk': '-1' }, 'Fyll inn areal, avstander, forbruk og sekkestørrelse.'],
    ['calc-bad', { 'bad-areal': '0' }, 'Fyll inn areal, avstander, forbruk og sekkestørrelse.'],
    ['calc-forbruk', { 'fb-tykk': '' }, 'Fyll inn areal, lagtykkelse, forbruk og sekkestørrelse.'],
    ['calc-rom', { 'rom-hoyde': '' }, 'Fyll inn lengde, bredde og takhøyde.'],
  ];
  for (const [id, v, melding] of tilfeller) {
    test(`${id} ${JSON.stringify(v)}`, () => {
      const r = regn(id, v);
      assert.equal(r.ok, false);
      assert.deepEqual(r.advarsler, [melding]);
      assert.equal(r.hoved.tekst, '—');
      assert.equal(r.mengde, null);
      assert.ok(r.detaljer.length > 0 && r.detaljer.every((d) => d.tekst === '—'));
    });
  }
  test('ukjent kalkulator kaster', () => {
    assert.throws(() => regn('calc-x', {}));
  });
});

describe('romTilAreal', () => {
  test('standardrom', () => {
    const a = romTilAreal(standardverdier('calc-rom'));
    near(a.vegg, 30.5); near(a.tak, 12); near(a.total, 42.5);
  });
  test('uten dører/vinduer og med komma', () => {
    const a = romTilAreal({ 'rom-lengde': '5,5', 'rom-bredde': '4', 'rom-hoyde': '2,5', 'rom-dorer': '0', 'rom-vinduer': '' });
    near(a.vegg, 47.5); near(a.tak, 22); near(a.total, 69.5);
  });
  test('ugyldig gir null', () => {
    assert.equal(romTilAreal({ 'rom-lengde': '' }), null);
  });
});

describe('tolkSok', () => {
  const s = (q) => tolkSok(q);
  test('romareal fra «4x3» og «4 x 3 x 2,4»', () => {
    assert.deepEqual(s('4x3'), { calcId: 'calc-rom', verdier: { 'rom-lengde': '4', 'rom-bredde': '3' }, tekst: 'Romareal for 4 × 3 m' });
    assert.deepEqual(s('stue 4 x 3 x 2,4'),
      { calcId: 'calc-rom', verdier: { 'rom-lengde': '4', 'rom-bredde': '3', 'rom-hoyde': '2,4' }, tekst: 'Romareal for 4 × 3 × 2,4 m' });
    assert.equal(s('3.5×2.8').verdier['rom-lengde'], '3,5');
  });
  test('feil 25: «150x150» og andre mm-mål gir ikke romareal', () => {
    assert.equal(s('150x150'), null);
    assert.equal(s('flis 300x600'), null);
    assert.equal(s('15x15 cm'), null);
    assert.equal(s('4x3x240'), null);
    assert.equal(s('40x31'), null);
  });
  test('areal + nøkkelord', () => {
    assert.deepEqual(s('maling 20 m2'), { calcId: 'calc-maling', verdier: { 'mal-areal': '20' }, tekst: 'Maling for 20 m²' });
    assert.equal(s('male stue 35,5 kvm').verdier['mal-areal'], '35,5');
    assert.equal(s('sparkel 40 m²').calcId, 'calc-sparkel');
    assert.equal(s('sparkle vegger 40 m2').calcId, 'calc-sparkel');
    assert.equal(s('bad 6 m2').calcId, 'calc-bad');
    assert.equal(s('våtrom 6 m2').calcId, 'calc-bad');
    assert.equal(s('dusjsone 2 m2').calcId, 'calc-bad');
    assert.equal(s('gulv 20 m2').calcId, 'calc-forbruk');
  });
  test('feil 24: mest spesifikke ord vinner', () => {
    assert.equal(s('flytsparkel 20 m2').calcId, 'calc-forbruk');
    assert.equal(s('sparkelmasse 20 m2').calcId, 'calc-forbruk');
    assert.equal(s('avretting bad 10 m2').calcId, 'calc-forbruk');
    assert.equal(s('avrette gulv 15 m2').calcId, 'calc-forbruk');
    assert.equal(s('fall til sluk 6 m2').calcId, 'calc-bad');
    assert.equal(s('avretting med fall 6 m2').calcId, 'calc-bad');
    assert.deepEqual(s('avretting 20 m2').verdier, { 'fb-areal': '20' });
  });
  test('feil 24: hele ord — «mal» treffer ikke inne i «normal»', () => {
    assert.equal(s('normal 20 m2'), null);
    assert.equal(s('formalia 20 m2'), null);
    assert.equal(s('badminton 20 m2'), null);
    assert.equal(s('maling normal 20 m2').calcId, 'calc-maling');
  });
  test('ingen forslag uten areal eller nøkkelord', () => {
    assert.equal(s('20 m2'), null);
    assert.equal(s('maling'), null);
    assert.equal(s(''), null);
    assert.equal(s('maling 0 m2'), null);
  });
});
