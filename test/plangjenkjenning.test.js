// Romgjenkjenning på syntetiske plantegninger: tykke vegger, døråpninger, tekst og målelinjer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finnRom, otsu, forenkle, rettOpp, arealPx, graatoner, finnMerker, viskUtMerker } from '../src/plangjenkjenning.js';

/** Lager en tegning: hvit bakgrunn, svarte fylte rektangler. */
function tegning(w, h, svarte) {
  const g = new Uint8Array(w * h).fill(250);
  for (const [x0, y0, x1, y1] of svarte) {
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) g[y * w + x] = 20;
  }
  return g;
}

// Leilighet 600 × 400 px: yttervegger 10 px, en skillevegg 8 px med døråpning, tynn tekst og målelinje.
function leilighet() {
  const v = 10, s = 8;
  const deler = [
    [50, 50, 550, 50 + v], [50, 340, 550, 340 + v], [50, 50, 50 + v, 350], [540, 50, 550, 350], // ytterkant
    [300, 50, 300 + s, 160], [300, 230, 300 + s, 350], // skillevegg med dør (160–230)
    [50, 200, 300, 200 + s], // vegg mellom to rom til venstre, uten dør (lukket)
  ];
  // Tynn tekst og tynn målelinje (1–2 px), som skal ignoreres
  const tynt = [[100, 120, 180, 121], [100, 125, 180, 126], [120, 110, 121, 130], [60, 370, 540, 371], [400, 270, 470, 272]];
  return tegning(600, 400, [...deler, ...tynt]);
}

test('otsu skiller svart fra hvitt', () => {
  const t = otsu(leilighet());
  assert.ok(t >= 20 && t < 250, String(t));
});

test('finner tre rom, og døråpningen slår ikke sammen rommene', () => {
  const { rom, veggtykkelse } = finnRom(leilighet(), 600, 400);
  assert.ok(veggtykkelse >= 6 && veggtykkelse <= 14, 'veggtykkelse ' + veggtykkelse);
  assert.equal(rom.length, 3, 'antall rom: ' + rom.map((r) => Math.round(r.areal)).join(', '));
  // Største rom er det til høyre: ca. 232 × 280 px innvendig
  const [stort] = rom;
  assert.ok(Math.abs(stort.areal - 232 * 280) / (232 * 280) < 0.12, 'areal ' + stort.areal);
  // Rommet er rektangulært: fire hjørner etter forenkling og oppretting (ev. ett lite hakk ved døra)
  assert.ok(stort.polygon.length >= 4 && stort.polygon.length <= 8, 'hjørner ' + stort.polygon.length);
});

test('finner døra i skilleveggen og et vindu i ytterveggen', () => {
  // Som leiligheten, men med et vindu (to tynne streker) i ytterveggen til høyre
  const v = 10, s = 8;
  const g = tegning(600, 400, [
    [50, 50, 550, 50 + v], [50, 340, 550, 340 + v], [50, 50, 50 + v, 350],
    [540, 50, 550, 120], [540, 220, 550, 350], [541, 120, 542, 220], [547, 120, 548, 220], // vindu 120–220
    [300, 50, 300 + s, 160], [300, 230, 300 + s, 350], [50, 200, 300, 200 + s],
  ]);
  const { rom } = finnRom(g, 600, 400);
  const hoyre = rom.find((r) => r.midt[0] > 300);
  assert.ok(hoyre, 'fant rommet til høyre');
  assert.equal(hoyre.vinduer.length, 1, 'vinduer: ' + JSON.stringify(hoyre.vinduer));
  assert.equal(hoyre.dorer.length, 1, 'dører: ' + JSON.stringify(hoyre.dorer));
  const vindu = hoyre.vinduer[0];
  assert.ok(Math.abs(Math.abs(vindu.b[1] - vindu.a[1]) - 100) < 25, 'vindusbredde');
  const venstreOppe = rom.find((r) => r.midt[0] < 300 && r.midt[1] < 200);
  assert.equal(venstreOppe.dorer.length, 1, 'døra sett fra rommet til venstre');
  assert.equal(venstreOppe.vinduer.length, 0);
});

test('rom som berører kanten av bildet regnes ikke som rom', () => {
  const g = tegning(300, 200, [[0, 0, 300, 10], [0, 190, 300, 200], [0, 0, 10, 200]]); // åpen mot høyre
  assert.equal(finnRom(g, 300, 200).rom.length, 0);
});

test('forenkling og oppretting gir et rent rektangel', () => {
  const kontur = [];
  for (let x = 0; x <= 100; x++) kontur.push([x, 0 + (x % 7 === 0 ? 1 : 0)]);
  for (let y = 0; y <= 60; y++) kontur.push([100, y]);
  for (let x = 100; x >= 0; x--) kontur.push([x, 60]);
  for (let y = 60; y > 0; y--) kontur.push([0, y]);
  const p = rettOpp(forenkle(kontur, 2));
  assert.equal(p.length, 4);
  assert.ok(Math.abs(arealPx(p) - 6000) < 200);
});

test('bred døråpning (ca. 8 veggtykkelser) skiller to rom', () => {
  // To rom ved siden av hverandre, skillevegg 6 px med en 50 px døråpning
  const g = tegning(500, 300, [
    [40, 40, 460, 46], [40, 254, 460, 260], [40, 40, 46, 260], [454, 40, 460, 260],
    [250, 40, 256, 130], [250, 180, 256, 260],
  ]);
  const { rom } = finnRom(g, 500, 300);
  assert.equal(rom.length, 2, 'antall rom: ' + rom.map((r) => Math.round(r.areal)).join(', '));
  for (const r of rom) assert.equal(r.polygon.length, 4, 'rektangel: ' + JSON.stringify(r.polygon));
});

test('grå strek i ytterveggen er et vindu', () => {
  const g = tegning(400, 300, [[40, 40, 360, 48], [40, 252, 360, 260], [40, 40, 48, 260], [352, 40, 360, 120], [352, 200, 360, 260]]);
  for (let y = 120; y < 200; y++) for (let x = 352; x < 360; x++) g[y * 400 + x] = 185; // grått vindu
  const { rom } = finnRom(g, 400, 300);
  assert.equal(rom.length, 1);
  assert.equal(rom[0].vinduer.length, 1, 'vinduer: ' + JSON.stringify(rom[0].vinduer) + ' dører: ' + JSON.stringify(rom[0].dorer));
  assert.equal(rom[0].dorer.length, 0);
});

test('foto av tegningen: skygge nederst og tusjstreker endrer ikke rommene', () => {
  const g0 = leilighet();
  const w = 600, h = 400;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    // Skygge: nederste del av arket blir gradvis mørkere, ned til 55 % lys
    const lys = y < h * 0.5 ? 1 : 1 - 0.45 * ((y - h * 0.5) / (h * 0.5));
    for (let x = 0; x < w; x++) {
      const i = y * w + x, v = g0[i] * lys;
      rgba.set([v, v, v, 255], i * 4);
    }
  }
  // Rosa og blå tusj tvers over rommene
  const tusj = (x0, y0, x1, y1, f) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set([...f, 255], (y * w + x) * 4); };
  tusj(320, 270, 520, 284, [250, 95, 175]);
  tusj(80, 110, 260, 122, [70, 160, 230]);
  const { rom } = finnRom(graatoner(rgba, w, h), w, h);
  assert.equal(rom.length, 3, 'antall rom: ' + rom.map((r) => Math.round(r.areal)).join(', '));
});

test('kryss med ring (⊗) i et rom blir funnet, og viskes ut uten å dele rommet', () => {
  const w = 600, h = 400;
  const g = leilighet();
  // Tegnet for hånd midt i det store rommet til høyre: ring med radius 16 og et kryss
  const cx = 420, cy = 190, R = 16;
  const prikk = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g[(Math.round(y) + dy) * w + Math.round(x) + dx] = 30; };
  for (let a = 0; a < Math.PI * 2; a += 0.02) prikk(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  for (let s = -R; s <= R; s += 0.5) { prikk(cx + s * 0.7, cy + s * 0.7); prikk(cx + s * 0.7, cy - s * 0.7); }
  // Grid-sirkel med et tall i: ikke et merke
  for (let a = 0; a < Math.PI * 2; a += 0.02) prikk(150 + Math.cos(a) * 14, 375 + Math.sin(a) * 14);
  const merker = finnMerker(g, w, h);
  assert.equal(merker.length, 1, JSON.stringify(merker.map((m) => m.midt)));
  assert.ok(Math.hypot(merker[0].midt[0] - cx, merker[0].midt[1] - cy) < 5);
  const { rom } = finnRom(viskUtMerker(g, w, h, merker), w, h);
  assert.equal(rom.length, 3);
});
