// Handle-fanen: varer på jobben, forslag til utstyr, og fremgang fra rommene.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { utstyrForslag, leggTilVarer, handelLinjer, rensHandel, fargeTekst, varerFraUtregning, UTSTYR } = await import('../src/handel.js');
const { normaliserJobb, romStatus } = await import('../src/jobs.js');
const { tomKalkyle } = await import('../src/kalkyle.js');

let n = 0;
const lagId = () => 'h-' + ++n;

test('samme vare og farge to ganger gir høyere antall, ikke to rader', () => {
  const liste = [];
  leggTilVarer(liste, [{ tekst: 'Maling 10 L', antall: 2, hva: 'maling', farge: 'Lady 1453' }], { lagId, naa: 1 });
  leggTilVarer(liste, [{ tekst: 'maling 10 l', hva: 'maling', farge: 'Lady 1453' }, { tekst: 'Maling 10 L', farge: 'Lady 7236' }], { lagId, naa: 2 });
  assert.equal(liste.length, 2);
  assert.equal(liste[0].antall, 3);
  assert.equal(liste[1].farge, 'Lady 7236');
  // Er den kjøpt, blir det en ny rad
  liste[0].kjopt = true;
  leggTilVarer(liste, [{ tekst: 'Maling 10 L', farge: 'Lady 1453' }], { lagId, naa: 3 });
  assert.equal(liste.length, 3);
});

test('utstyr som står på lista eller er kjøpt til jobben, foreslås ikke', () => {
  const liste = [{ tekst: 'Malerrull', kjopt: true }, { tekst: 'malertape', kjopt: false }];
  const f = utstyrForslag('maling', liste);
  assert.ok(!f.includes('Malerrull'));
  assert.ok(!f.includes('Malertape'));
  assert.ok(f.includes('Pensel'));
  assert.deepEqual(utstyrForslag('grunning', []), UTSTYR.maling);
  assert.ok(utstyrForslag('sparkel', []).includes('Bredsparkel'));
  assert.deepEqual(utstyrForslag('annet', []), []);
});

test('linjene til Handleliste har ikke komma eller parentes, og kjøpte varer er med ikke', () => {
  const liste = [
    { tekst: 'Maling 2,7 L', antall: 2, farge: 'Lady (1453), glans 5', kjopt: false, created: 2 },
    { tekst: 'Pensel', antall: 1, farge: '', kjopt: true, created: 1 },
    { tekst: 'Malertape', antall: 3, farge: '', kjopt: false, created: 1 },
  ];
  assert.deepEqual(handelLinjer(liste), ['Malertape × 3', 'Maling 2 7 L × 2 – Lady 1453 glans 5']);
});

test('fargen skrives som produkt, kode og glans', () => {
  assert.equal(fargeTekst({ produkt: 'Lady Pure Color', kode: '1453 Egghvit', glans: '5' }), 'Lady Pure Color 1453 Egghvit glans 5');
  assert.equal(fargeTekst(null), '');
});

test('lagrede varer renses, og jobber uten lista får en tom liste', () => {
  const rent = rensHandel([{ id: 'a', tekst: '  Rull ', antall: 500, hva: 'tull' }, { id: 'b', tekst: '' }, null]);
  assert.deepEqual(rent, [{ id: 'a', tekst: 'Rull', antall: 99, hva: 'annet', farge: '', rom: '', kjopt: false, created: 0 }]);
  assert.deepEqual(normaliserJobb({ id: 'j' }).handel, []);
  assert.equal(normaliserJobb({ id: 'j', handel: [{ id: 'x', tekst: 'Tape', kjopt: true }] }).handel[0].kjopt, true);
});

test('spannene fra rommene blir varer', () => {
  const v = varerFraUtregning([
    { navn: 'Veggmaling', enhet: 'L', trenger: 20, forslag: { kombinasjon: [{ antall: 2, storrelse: 9 }, { antall: 1, storrelse: 2.7 }] } },
    { navn: 'Ardex A 828 (hurtigsparkel)', enhet: 'kg', trenger: 10, forslag: { kombinasjon: [{ antall: 1, storrelse: 12.5 }] } },
    { navn: 'Tape', enhet: 'rull', trenger: 2, forslag: null },
  ]);
  assert.deepEqual(v, [
    { tekst: 'Veggmaling 9 L', antall: 2, hva: 'maling' },
    { tekst: 'Veggmaling 2,7 L', antall: 1, hva: 'maling' },
    { tekst: 'Ardex A 828 12,5 kg', antall: 1, hva: 'sparkel' },
  ]);
});

test('neste steg og fremgang kommer fra rommene, ikke sjekklista', () => {
  assert.equal(romStatus(normaliserJobb({ id: 'j' })), null);
  const k = { ...tomKalkyle('K2'), rom: [{ id: 'a', navn: 'Stue', lengde: '4', bredde: '3', hoyde: '2,4', vinduer: '1', dorer: '1', med: {} }] };
  const j = normaliserJobb({ id: 'j', kalkyle: k });
  const s = romStatus(j);
  assert.equal(s.andel, 0);
  assert.equal(s.neste.rom, 'Stue');
  assert.ok(s.tekst.startsWith('Stue: '));
  // Alt gjort: ferdig, uten neste steg
  const alt = Object.fromEntries(['rigging', 'fylling', 'strimling', 'strok2', 'strok3', 'hel', 'sliping', 'ytterhjorner', 'listefritt', 'grunning-tak', 'grunning-vegg', 'maling-tak', 'maling-vegg', 'snekker', 'gulvbelegg'].map((x) => [x, true]));
  const ferdig = romStatus(normaliserJobb({ id: 'j', kalkyle: { ...k, rom: [{ ...k.rom[0], gjort: alt }] } }));
  assert.equal(ferdig.neste, null);
  assert.equal(ferdig.ferdig, true);
  assert.equal(ferdig.andel, 1);
});
