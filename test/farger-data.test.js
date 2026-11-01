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
  const t = [{ merke: 'Jotun', kode: '1453', navn: 'Cotton Ball', hex: '#F0EBE1' }, { merke: 'NCS', kode: 'S 0502-Y', navn: null, hex: '#F4F1E8' }];
  FARGER.push(...t);
  try {
    assert.equal(finnFarge('1453 Cotton Ball').navn, 'Cotton Ball');
    assert.equal(finnFarge('ncs s0502-y').kode, 'S 0502-Y');
    assert.equal(finnFarge('Vegg: NCS S 0502 - Y').kode, 'S 0502-Y');
    assert.equal(finnFarge('ukjent'), null);
    assert.equal(sokFarger('cotton')[0].kode, '1453');
  } finally { FARGER.splice(FARGER.length - 2, 2); }
});
