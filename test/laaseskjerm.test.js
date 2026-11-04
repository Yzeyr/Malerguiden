// Hvilke jobber som vises på låseskjermen, og hva som står om dem.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { normaliserJobb } = await import('../src/jobs.js');
const { aktiveJobber, tavleData } = await import('../src/laaseskjerm.js');

const jobb = (id, x = {}) => normaliserJobb({ id, kunde: { navn: 'Kunde ' + id, adresse: 'Gata ' + id }, ...x });

test('pågår, planlagt i dag og jobber med klokka som går vises; ferdige og andre dager ikke', () => {
  const idag = '2026-11-03';
  const liste = [
    jobb('a', { status: 'pagar', updated: 1 }),
    jobb('b', { status: 'planlagt', dato: idag }),
    jobb('c', { status: 'planlagt', dato: '2026-11-04' }),
    jobb('d', { status: 'ferdig' }),
    jobb('e', { status: 'pauset', klokke: { start: 1000 } }),
  ];
  assert.deepEqual(aktiveJobber(liste, idag).map((j) => j.id), ['e', 'a', 'b']);
});

test('husk er det som ikke er huket av i «Ta med neste gang», i rekkefølgen det ble lagt inn', () => {
  const j = jobb('a', { status: 'pagar', utstyr: [
    { id: '1', tekst: 'Sparkel', checked: false, created: 2 },
    { id: '2', tekst: 'Tape', checked: true, created: 1 },
    { id: '3', tekst: 'Stige', checked: false, created: 1 },
  ] });
  const [t] = tavleData([j], '2026-11-03');
  assert.deepEqual(t.husk, ['Stige', 'Sparkel']);
  assert.equal(t.navn, 'Kunde a');
  assert.equal(t.adresse, 'Gata a');
  assert.equal(t.klokke, null);
});

test('Dynamic Island: klokka som går først, så tørketid som ikke er ferdig; høyst to', async () => {
  const { liveData } = await import('../src/laaseskjerm.js');
  const naa = 1_000_000;
  const liste = [
    jobb('a', { tork: { klar: naa + 5000, tekst: 'Sparkel', start: naa } }),
    jobb('b', { klokke: { start: naa - 60000 } }),
    jobb('c', { tork: { klar: naa - 1, tekst: 'Ferdig', start: 1 } }),
    jobb('d', { tork: { klar: naa + 9000, tekst: 'Maling', start: naa } }),
  ];
  const d = liveData(liste, naa);
  assert.deepEqual(d.map((x) => x.jobb), ['b', 'a']);
  assert.equal(d[0].tork, null);
  assert.equal(d[1].torkTekst, 'Sparkel');
});

test('kortet med dagens jobber sendes bare i arbeidstiden, og morgenvarselet gjelder neste morgen', async () => {
  const { liveMelding } = await import('../src/laaseskjerm.js');
  const liste = [
    jobb('a', { status: 'pagar', klokke: { start: 5 }, utstyr: [{ id: '1', tekst: 'Tape', checked: false, created: 1 }] }),
    jobb('b', { status: 'planlagt', dato: '2026-11-04' }),
  ];
  const dag = liveMelding(liste, new Date(2026, 10, 3, 9, 0));
  assert.deepEqual(dag.dagens.map((j) => j.id), ['a']);
  assert.deepEqual(dag.liste, []);
  assert.equal(new Date(dag.slutt).getHours(), 15);
  // Morgenvarselet kl. 06:45 i morgen: a pågår fortsatt, b er planlagt da
  assert.equal(dag.morgen, 'Kunde a, Kunde b. Husk: Tape');
  const kveld = liveMelding(liste, new Date(2026, 10, 3, 21, 0));
  assert.deepEqual(kveld.dagens, []);
  assert.deepEqual(kveld.liste.map((x) => x.jobb), ['a']);
  // Tidlig om morgenen: varselet gjelder i dag
  const tidlig = liveMelding(liste, new Date(2026, 10, 4, 5, 0));
  assert.equal(tidlig.morgen, 'Kunde a, Kunde b. Husk: Tape');
  assert.equal(liveMelding(liste, new Date(2026, 10, 3, 5, 0)).morgen, 'Kunde a. Husk: Tape');
});

test('det som skal kjøpes fra Handle-fanen er med på låseskjermen og i morgenvarselet', async () => {
  const { liveMelding } = await import('../src/laaseskjerm.js');
  const j = jobb('a', { status: 'pagar', handel: [
    { id: '1', tekst: 'Maling 10 L', antall: 2, farge: 'Lady 1453', kjopt: false, created: 2 },
    { id: '2', tekst: 'Pensel', antall: 1, kjopt: true, created: 1 },
    { id: '3', tekst: 'Malertape', antall: 1, kjopt: false, created: 1 },
  ] });
  const [t] = tavleData([j], '2026-11-03');
  assert.deepEqual(t.handle, ['Malertape', 'Maling 10 L × 2']);
  assert.deepEqual(tavleData([jobb('b', { status: 'pagar' })], '2026-11-03')[0].handle, []);
  assert.equal(liveMelding([j], new Date(2026, 10, 3, 5, 0)).morgen, 'Kunde a. Kjøp: Malertape, Maling 10 L × 2');
});
