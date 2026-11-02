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
