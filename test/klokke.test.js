import test from 'node:test';
import assert from 'node:assert/strict';
import { klokkeTimer, klokkeTekst, timerTilForing } from '../src/klokke.js';

test('klokka: timer, tekst og kvarter', () => {
  const start = 1_000_000;
  assert.equal(klokkeTimer({ start }, start + 90 * 60000), 1.5);
  assert.equal(klokkeTimer(null), 0);
  assert.equal(klokkeTekst(1.5), '1:30');
  assert.equal(klokkeTekst(0.999), '0:59');
  assert.equal(klokkeTekst(2 + 5 / 60), '2:05');
  assert.equal(timerTilForing(1.12), 1);
  assert.equal(timerTilForing(1.13), 1.25);
  assert.equal(timerTilForing(0.05), 0.25);
});
