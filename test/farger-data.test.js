import test from 'node:test';
import assert from 'node:assert/strict';
import { FARGER, finnFarge, sokFarger } from '../src/data/farger.js';
import { hexTilRgb } from '../src/farge.js';

test('fargelista: gyldige koder og hex, ingen dubletter', () => {
  const sett = new Set();
  for (const f of FARGER) {
    assert.ok(['Jotun', 'NCS'].includes(f.merke), f.merke);
    assert.ok(hexTilRgb(f.hex), f.kode + ' ' + f.hex);
    const n = f.merke + ' ' + f.kode;
    assert.ok(!sett.has(n), 'dublett ' + n);
    sett.add(n);
  }
});

test('finner farge fra kode inni tekst', () => {
  assert.equal(finnFarge('1453 Bomull').navn, 'Bomull');
  assert.equal(finnFarge('ncs s0502-y').kode, 'S 0502-Y');
  assert.equal(finnFarge('Vegg: NCS S 0502 - Y').kode, 'S 0502-Y');
  assert.equal(finnFarge('ukjent'), null);
  assert.equal(sokFarger('bomull')[0].kode, '1453');
  assert.ok(FARGER.filter((f) => f.merke === 'Jotun').length > 200);
  assert.ok(FARGER.filter((f) => f.merke === 'NCS').length > 200);
});

test('de vanlige hvitfargene er merket som kjente', async () => {
  const { erKjent, finnFarge } = await import('../src/data/farger.js');
  for (const k of ['1453', '9918', '1001', 'S 0502-Y', 'S 0500-N']) assert.ok(erKjent(finnFarge(k)), k);
  assert.ok(!erKjent(finnFarge('0201')));
});
