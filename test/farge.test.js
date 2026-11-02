import test from 'node:test';
import assert from 'node:assert/strict';
import { hexTilRgb, rgbTilHex, rgbTilLab, deltaE, rettMedHvitt, medianFarge, naermeste, tekstFarge } from '../src/farge.js';

test('hex fram og tilbake', () => {
  assert.deepEqual(hexTilRgb('#F0EBE1'), [240, 235, 225]);
  assert.equal(rgbTilHex([240, 235, 225]), '#F0EBE1');
  assert.equal(hexTilRgb('tull'), null);
});

test('Lab for hvitt og svart', () => {
  const [L, a, b] = rgbTilLab([255, 255, 255]);
  assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
  assert.ok(Math.abs(rgbTilLab([0, 0, 0])[0]) < 0.01);
});

test('CIEDE2000 stemmer med Sharma sine testpar', () => {
  // Fra Sharma, Wu og Dalal (2005), tabell 1
  const par = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ];
  for (const [a, b, fasit] of par) assert.ok(Math.abs(deltaE(a, b) - fasit) < 0.0005, deltaE(a, b) + ' ≠ ' + fasit);
});

test('hvitt ark retter gult lys', () => {
  // Veggen er egentlig nøytral grå. Lyset er varmt, så både arket og veggen blir gule i bildet.
  const ekteVegg = [180, 180, 180];
  const gul = (rgb) => [rgb[0] * 1.0, rgb[1] * 0.93, rgb[2] * 0.78];
  const rettet = rettMedHvitt(gul(ekteVegg), gul([242, 242, 242]));
  assert.ok(deltaE(rgbTilLab(rettet), rgbTilLab(ekteVegg)) < 2, String(rettet));
});

test('median tåler et glimt i bildet', () => {
  const b = 5, data = new Uint8ClampedArray(b * b * 4);
  for (let i = 0; i < b * b; i++) data.set([100, 110, 120, 255], i * 4);
  data.set([255, 255, 255, 255], (2 * b + 2) * 4); // ett hvitt glimt midt i
  assert.deepEqual(medianFarge(data, b, 2, 2, 2), [100, 110, 120]);
});

test('nærmeste farge', () => {
  const liste = [{ kode: 'A', hex: '#FFFFFF' }, { kode: 'B', hex: '#F0EBE1' }, { kode: 'C', hex: '#336699' }];
  const n = naermeste([238, 234, 224], liste, 2);
  assert.equal(n[0].kode, 'B');
  assert.equal(n.length, 2);
  assert.ok(n[0].avstand < n[1].avstand);
});

test('tekstfarge', () => {
  assert.equal(tekstFarge('#202020'), '#FFFFFF');
  assert.equal(tekstFarge('#F0EBE1'), '#1F1A17');
});

test('kjente farger får forrang når de er nær, men ikke når de er langt unna', async () => {
  const { rangerFarger } = await import('../src/farge.js');
  const liste = [{ kode: 'UKJENT', hex: '#F1EFE6' }, { kode: 'KJENT', hex: '#F0EFE2' }, { kode: 'MORK', hex: '#336699' }];
  const malt = [241, 239, 230];
  // Uten forrang vinner den som ligger nærmest
  assert.equal(rangerFarger(malt, liste, { n: 2 })[0].kode, 'UKJENT');
  // Med forrang vinner den kjente, som bare er litt lenger unna
  const med = rangerFarger(malt, liste, { n: 2, forrang: (f) => (f.kode === 'KJENT' || f.kode === 'MORK' ? 2.5 : 0) });
  assert.equal(med[0].kode, 'KJENT');
  assert.equal(med[0].forrang, 2.5);
  // En tydelig annen farge får ingen hjelp
  assert.ok(!med.some((f) => f.kode === 'MORK'));
  assert.equal(rangerFarger([51, 102, 153], liste, { n: 3, forrang: () => 0 })[0].kode, 'MORK');
});
