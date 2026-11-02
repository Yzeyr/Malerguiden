import test from 'node:test';
import assert from 'node:assert/strict';
import { torketid, sparkelTimer, malingFaktor, gjettProdukt, klarTekst, TORK_PRODUKTER } from '../src/tork.js';

test('maling: databladets tid ved 23 °C / 50 %, lengre når det er kaldt', () => {
  assert.equal(torketid('lady-pure-color', { c: 23, rf: 50, start: 0 }).timer, 2);
  assert.equal(torketid('lady-pure-color', { c: 23, rf: 50, start: 0 }).estimat, false);
  assert.equal(torketid('lady-pure-color', { c: 15, rf: 50 }).timer, 3);
  assert.equal(torketid('lady-pure-color', { c: 10, rf: 50 }).timer, 4);
  assert.equal(torketid('lady-aqua', { c: 23, rf: 50 }).timer, 4);
  assert.match(torketid('lady-aqua', {}).merknad, /10 døgn/);
  assert.equal(torketid('ukjent'), null);
});

test('sparkel følger Jotuns tabell', () => {
  assert.equal(sparkelTimer(20, 50), 17);
  assert.equal(sparkelTimer(15, 70), 38);
  assert.equal(sparkelTimer(17.5, 50), 20.5);
  assert.equal(torketid('jotun-sparkel', { c: 20, rf: 50, start: 0 }).klar, 17 * 3600000);
});

test('advarsel under minstetemperatur og ved høy fuktighet', () => {
  assert.match(torketid('lady-pure-color', { c: 8 }).advarsel, /\+10 °C/);
  assert.match(torketid('kvist-sperre', { c: 12 }).advarsel, /\+15 °C/);
  assert.match(torketid('lady-pure-color', { c: 20, rf: 85 }).advarsel, /80 %/);
  assert.equal(torketid('lady-pure-color', { c: 20, rf: 50 }).advarsel, '');
  assert.ok(malingFaktor(20, 70) > malingFaktor(20, 50));
});

test('produktet gjettes fra navnet på jobben', () => {
  assert.equal(gjettProdukt('Jotun Lady Pure Color'), 'lady-pure-color');
  assert.equal(gjettProdukt('Jotaproff Prima Wall 07'), 'prima-wall');
  assert.equal(gjettProdukt('Lady Aqua matt'), 'lady-aqua');
  assert.equal(gjettProdukt('Ukjent maling'), null);
  assert.ok(TORK_PRODUKTER.every((p) => p.sparkel || p.timer > 0));
});

test('klarTekst', () => {
  const na = new Date(2026, 10, 2, 12, 0).getTime();
  assert.equal(klarTekst(new Date(2026, 10, 2, 14, 30).getTime(), na), 'kl. 14:30');
  assert.equal(klarTekst(new Date(2026, 10, 3, 9, 0).getTime(), na), 'i morgen kl. 09:00');
});
