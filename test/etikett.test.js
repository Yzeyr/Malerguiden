import test from 'node:test';
import assert from 'node:assert/strict';
import { tolkEtikett, etikettTekst } from '../src/etikett.js';

test('Jotun-spann: produkt, forbruk, størrelse og glans', () => {
  const e = tolkEtikett(['JOTUN', 'LADY', 'Pure Color', 'Helmatt', 'Lady Pure Color', 'Rekkeevne: 8-10 m²/l', '2,7 L', 'Glans 2']);
  assert.equal(e.produkt, 'Lady Pure Color');
  assert.deepEqual([e.forbruk.min, e.forbruk.max, e.forbruk.snitt], [8, 10, 9]);
  assert.equal(e.liter, 2.7);
  assert.equal(e.glans, '2');
});

test('OCR-feil i enheten: m2/1, m?/I og pr. liter', () => {
  assert.equal(tolkEtikett('Forbruk ca. 10 m2/1').forbruk.snitt, 10);
  assert.equal(tolkEtikett('6 – 8 m?/I per strøk').forbruk.snitt, 7);
  assert.equal(tolkEtikett('Rekkeevne 7 til 9 m² pr. liter').forbruk.snitt, 8);
  assert.equal(tolkEtikett('8-10 m² / ltr').forbruk.max, 10);
});

test('liter per m² blir regnet om til m² per liter', () => {
  const e = tolkEtikett('Forbruk: 0,10–0,125 l/m²');
  assert.equal(e.forbruk.min, 8);
  assert.equal(e.forbruk.max, 10);
});

test('spannstørrelsen forveksles ikke med forbruket', () => {
  const e = tolkEtikett(['10 m²/l', 'Fås i 0,68 L, 2,7 L og 9 L']);
  assert.equal(e.forbruk.snitt, 10);
  assert.equal(e.liter, 9);
});

test('pris fra prislapp, og pris per liter', () => {
  assert.equal(tolkEtikett(['Lady Balance 9 L', '1 899,-']).pris, 1899);
  assert.equal(tolkEtikett('kr 1 299,00').pris, 1299);
  const e = tolkEtikett(['Flutex Pro 5', '9 L', 'Kr 1 350']);
  assert.equal(e.prisPerLiter, 150);
  assert.equal(e.produkt, 'Flutex Pro');
});

test('NCS-kode, også med O for 0', () => {
  assert.equal(tolkEtikett('Farge: NCS S 0502-Y').kode, 'S 0502-Y');
  assert.equal(tolkEtikett('S 1OO2-Y50R').kode, 'S 1002-Y50R');
});

test('Jotun-kode bare når den finnes i fargelista', () => {
  const kjent = (k) => k === '1453';
  assert.equal(tolkEtikett(['1453 BOMULL', 'EAN 70221234567'], { kjentKode: kjent }).kode, '1453');
  assert.equal(tolkEtikett(['Batch 20251', '2,7 L'], { kjentKode: kjent }).kode, null);
});

test('sparkel: kg per m² og sekkestørrelse', () => {
  const e = tolkEtikett(['Gyproc ProMix', 'Forbruk ca. 1 kg/m²/mm', '20 kg']);
  assert.equal(e.forbruk, null);
  assert.equal(e.kgForbruk.enhet, 'kg/m²/mm');
  assert.equal(e.kg, 20);
});

test('tom eller ukjent tekst gir null overalt', () => {
  const e = tolkEtikett(['hei', 'ingenting her']);
  assert.equal(e.forbruk, null);
  assert.equal(e.liter, null);
  assert.equal(e.pris, null);
  assert.equal(etikettTekst(e), '');
});

test('oppsummering', () => {
  assert.equal(etikettTekst(tolkEtikett(['Lady Pure Color', '8-10 m²/l', '2,7 L'])), 'Lady Pure Color · 8–10 m²/L · 2,7 L');
});
