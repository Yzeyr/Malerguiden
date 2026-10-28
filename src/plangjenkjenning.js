/* Finner rom på en plantegning, uten KI.

   Plantegninger har tykke, mørke vegger og lyse rom. Fremgangsmåte:
   1. Gjør bildet svart-hvitt (Otsu-terskel).
   2. Behold bare tykke streker: tekst, møbler og målelinjer er tynnere enn vegger.
   3. Tett døråpningene ved å gjøre veggene tykkere (omtrent en halv dørbredde).
   4. Hvert lyst område som ikke når kanten av bildet, er et rom.
   5. Vokse rommet tilbake ut til veggen, finne omrisset, forenkle det til hjørner
      og rette kantene opp til vannrett/loddrett når de nesten er det.

   Ren funksjon av gråtonebildet, så den kan testes i Node. */

/** Gråtoner (0–255) fra RGBA-piksler. */
export function graatoner(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    // Gjennomsiktig regnes som hvitt (PNG-er med gjennomsiktig bakgrunn)
    const a = rgba[j + 3] / 255;
    g[i] = Math.round((0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * a + 255 * (1 - a));
  }
  return g;
}

/** Otsu-terskel: skiller mørkt fra lyst. */
export function otsu(g) {
  const hist = new Array(256).fill(0);
  for (const v of g) hist[v]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, terskel = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = g.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const mellom = wB * wF * (mB - mF) ** 2;
    if (mellom > best) { best = mellom; terskel = t; }
  }
  return terskel;
}

/**
 * Avstand (i piksler, chamfer 3-4) fra hver piksel til nærmeste piksel der maske er 0.
 * Inne i en strek: hvor langt det er til kanten av streken.
 */
export function avstand(maske, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = maske[i] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Utvider maska med radius r (piksler). */
function utvid(maske, w, h, r) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = maske[i] ? 0 : 1;
  const d = avstand(inv, w, h);
  const ut = new Uint8Array(w * h);
  for (let i = 0; i < ut.length; i++) ut[i] = d[i] <= r ? 1 : 0;
  return ut;
}

/** Krymper maska med radius r. */
function krymp(maske, w, h, r) {
  const d = avstand(maske, w, h);
  const ut = new Uint8Array(w * h);
  for (let i = 0; i < ut.length; i++) ut[i] = d[i] > r ? 1 : 0;
  return ut;
}

/** Sammenhengende områder (4-naboskap) der maske = 1. Returnerer etiketter og områdene. */
function omrader(maske, w, h) {
  const etikett = new Int32Array(w * h).fill(-1);
  const liste = [];
  const ko = new Int32Array(w * h);
  for (let start = 0; start < maske.length; start++) {
    if (!maske[start] || etikett[start] !== -1) continue;
    const id = liste.length;
    let les = 0, skriv = 0, antall = 0, kant = false, sx = 0, sy = 0;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    ko[skriv++] = start; etikett[start] = id;
    while (les < skriv) {
      const i = ko[les++];
      const x = i % w, y = (i - x) / w;
      antall++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) kant = true;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (n >= 0 && maske[n] && etikett[n] === -1) { etikett[n] = id; ko[skriv++] = n; }
      }
    }
    liste.push({ id, antall, kant, midt: [sx / antall, sy / antall], boks: [minX, minY, maxX, maxY] });
  }
  return { etikett, liste };
}

/** Typisk veggtykkelse: median av den største avstanden inne i de mørke strekene. */
function veggtykkelse(mork, w, h) {
  const d = avstand(mork, w, h);
  // Lokale maksima ~ halve strektykkelsen. Ta de 30 % tykkeste strekpunktene.
  const verdier = [];
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x, v = d[i];
      if (v < 1) continue;
      if (v >= d[i - 1] && v >= d[i + 1] && v >= d[i - w] && v >= d[i + w]) verdier.push(v);
    }
  }
  if (!verdier.length) return 2;
  verdier.sort((a, b) => a - b);
  return verdier[Math.floor(verdier.length * 0.85)] * 2;
}

/** Omrisset av et område som en lukket liste av piksler (Moore-nabosporing). */
function omriss(etikett, w, h, id, boks) {
  const er = (x, y) => x >= 0 && y >= 0 && x < w && y < h && etikett[y * w + x] === id;
  // Startpunkt: øverste, så venstre piksel
  let sx = -1, sy = -1;
  for (let y = boks[1]; y <= boks[3] && sx < 0; y++) for (let x = boks[0]; x <= boks[2]; x++) if (er(x, y)) { sx = x; sy = y; break; }
  if (sx < 0) return [];
  const dx = [1, 1, 0, -1, -1, -1, 0, 1], dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const ut = [[sx, sy]];
  let x = sx, y = sy, retning = 7, vakt = 0;
  do {
    let funnet = false;
    for (let k = 0; k < 8; k++) {
      const r = (retning + 6 + k) % 8; // start til venstre for forrige retning
      const nx = x + dx[r], ny = y + dy[r];
      if (er(nx, ny)) { x = nx; y = ny; retning = r; funnet = true; break; }
    }
    if (!funnet) break;
    ut.push([x, y]);
  } while ((x !== sx || y !== sy) && ++vakt < 200000);
  return ut;
}

/** Douglas–Peucker-forenkling av en lukket kurve. */
export function forenkle(p, toleranse) {
  if (p.length < 4) return p.slice();
  const dp = (a, b) => {
    let maks = 0, idx = -1;
    const [x1, y1] = p[a], [x2, y2] = p[b];
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * p[i][0] - dx * p[i][1] + x2 * y1 - y2 * x1) / l;
      if (d > maks) { maks = d; idx = i; }
    }
    if (maks <= toleranse) return [p[a]];
    return [...dp(a, idx), ...dp(idx, b)];
  };
  // Del kurven i to ved punktet lengst fra start, så den lukkede kurven forenkles riktig
  let lengst = 0, fjern = 0;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > lengst) { lengst = d; fjern = i; } }
  return [...dp(0, fjern), ...dp(fjern, p.length - 1)];
}

/** Retter kanter som nesten er vannrette eller loddrette, og fjerner hjørner som ikke trengs. */
export function rettOpp(poly, grader = 12) {
  let p = poly.map((q) => q.slice());
  const n = p.length;
  if (n < 3) return p;
  const grense = Math.tan((grader * Math.PI) / 180);
  for (let runde = 0; runde < 4; runde++) {
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dy) <= Math.abs(dx) * grense) { const y = (a[1] + b[1]) / 2; a[1] = y; b[1] = y; }
      else if (Math.abs(dx) <= Math.abs(dy) * grense) { const x = (a[0] + b[0]) / 2; a[0] = x; b[0] = x; }
    }
  }
  // Fjern hjørner som ligger på en rett linje, og doble punkter
  const ut = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const kryss = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue;
    if (Math.abs(kryss) < 0.5) continue;
    // Tre punkter på samme vannrette eller loddrette linje: midtpunktet trengs ikke
    if (Math.abs(a[0] - b[0]) < 1 && Math.abs(b[0] - c[0]) < 1) continue;
    if (Math.abs(a[1] - b[1]) < 1 && Math.abs(b[1] - c[1]) < 1) continue;
    ut.push(b);
  }
  return ut.length >= 3 ? ut : p;
}

/**
 * Gjør en nesten rettvinklet mangekant helt rettvinklet: hver kant blir vannrett eller
 * loddrett (innen 25°), kanter i samme retning etter hverandre slås sammen, og hjørnene
 * settes der kantene møtes. Har rommet en skrå vegg, beholdes mangekanten som den er.
 */
export function ortogonaliser(poly, { grader = 25, kortest = 0 } = {}) {
  const n = poly.length;
  if (n < 4) return poly;
  const grense = Math.tan((grader * Math.PI) / 180);
  let kanter = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l < 0.5) continue;
    let type = null;
    if (Math.abs(dy) <= Math.abs(dx) * grense) type = 'h';
    else if (Math.abs(dx) <= Math.abs(dy) * grense) type = 'v';
    // Korte skrå biter (der vegger møtes ved en døråpning) får retningen de mest går i.
    else if (kortest > 0 && l < kortest * 3) type = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    if (!type) return poly; // lang skrå vegg: la rommet være som det er
    kanter.push({ type, verdi: type === 'h' ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2, l });
  }
  // Slå sammen naboer i samme retning (vektet etter lengde), også rundt slutten av lista
  let endret = true;
  while (endret && kanter.length > 4) {
    endret = false;
    for (let i = 0; i < kanter.length; i++) {
      const a = kanter[i], b = kanter[(i + 1) % kanter.length];
      if (a.type !== b.type) continue;
      const l = a.l + b.l;
      kanter[i] = { type: a.type, verdi: (a.verdi * a.l + b.verdi * b.l) / l, l };
      kanter.splice((i + 1) % kanter.length, 1);
      endret = true;
      break;
    }
  }
  if (kanter.length < 4 || kanter.length % 2) return poly;
  for (let i = 0; i < kanter.length; i++) if (kanter[i].type === kanter[(i + 1) % kanter.length].type) return poly;

  // Små hakk (rester av døråpninger og vindushull): korteste kant fjernes, og de to
  // naboene, som da ligger i samme retning, slås sammen vektet etter lengde.
  const lengde = (k, i) => Math.abs(k[(i + 1) % k.length].verdi - k[(i + k.length - 1) % k.length].verdi);
  while (kortest > 0 && kanter.length > 4) {
    let min = Infinity, idx = -1;
    for (let i = 0; i < kanter.length; i++) { const l = lengde(kanter, i); if (l < min) { min = l; idx = i; } }
    if (min >= kortest) break;
    const n = kanter.length, fi = (idx + n - 1) % n, ni = (idx + 1) % n;
    const lf = lengde(kanter, fi), ln = lengde(kanter, ni);
    const verdi = (kanter[fi].verdi * lf + kanter[ni].verdi * ln) / Math.max(1e-9, lf + ln);
    kanter[fi] = { type: kanter[fi].type, verdi, l: lf + ln };
    // Fjern den korte kanten og naboen etter den (høyeste indeks først)
    for (const j of [idx, ni].sort((a, b) => b - a)) kanter.splice(j, 1);
  }
  const ut = [];
  for (let i = 0; i < kanter.length; i++) {
    const a = kanter[i], b = kanter[(i + 1) % kanter.length];
    if (a.type === b.type) return poly;
    ut.push(a.type === 'h' ? [b.verdi, a.verdi] : [a.verdi, b.verdi]);
  }
  return ut;
}

/**
 * Korte skråkanter mellom en vannrett og en loddrett kant (avrundede hjørner)
 * erstattes av ett skarpt hjørne der de to kantene møtes.
 */
export function skarpeHjorner(poly, maksLengde) {
  let p = poly.map((q) => q.slice());
  const rett = (a, b) => Math.abs(a[0] - b[0]) < 0.5 ? 'v' : Math.abs(a[1] - b[1]) < 0.5 ? 'h' : null;
  for (let vakt = 0; vakt < p.length + 2; vakt++) {
    const n = p.length;
    if (n < 4) break;
    let endret = false;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      if (rett(a, b) || Math.hypot(b[0] - a[0], b[1] - a[1]) > maksLengde) continue;
      const for_ = p[(i + n - 1) % n], etter = p[(i + 2) % n];
      const r1 = rett(for_, a), r2 = rett(b, etter);
      if (!r1 || !r2 || r1 === r2) continue;
      // Møtepunktet: x fra den loddrette kanten, y fra den vannrette
      const hjorne = r1 === 'h' ? [b[0], a[1]] : [a[0], b[1]];
      p.splice(i, 2, hjorne);
      if (i === n - 1) p.shift(); // kanten gikk rundt slutten av lista
      endret = true;
      break;
    }
    if (!endret) break;
  }
  return p;
}

/**
 * Dører og vinduer langs kantene av et rom. Fra hver kant ses det rett ut i veggen:
 * - tykk vegg funnet: vegg
 * - bare tynne streker i veggen: vindu (tegnes som to–tre tynne linjer)
 * - ingenting: døråpning
 * Sammenhengende biter lengre enn ca. 2,5 veggtykkelser regnes med.
 * Returnerer { dorer: [{a,b}], vinduer: [{a,b}] } i bildets piksler.
 */
export function apninger(poly, vegger, mork, w, h, tykk, gra = null) {
  const dorer = [], vinduer = [];
  const sign = signertAreal(poly) > 0 ? 1 : -1;
  const minst = Math.max(4, tykk * 2.5);
  const dybde = Math.max(3, tykk * 2.2);
  const hent = (m, x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < w && yi < h && m[yi * w + xi] === 1; };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const lengde = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (lengde < minst * 1.2) continue;
    const ux = (b[0] - a[0]) / lengde, uy = (b[1] - a[1]) / lengde;
    // Utover fra rommet: for et rom med positivt areal (med klokka i bildekoordinater) er det venstre normal
    const nx = uy * sign, ny = -ux * sign;
    const klasse = [];
    for (let t = 0; t <= lengde; t += 1) {
      const px = a[0] + ux * t, py = a[1] + uy * t;
      let vegg = false, tynn = false;
      for (let d = 0; d <= dybde; d += 1) {
        const x = px + nx * d, y = py + ny * d;
        if (hent(vegger, x, y)) { vegg = true; break; }
        if (hent(mork, x, y) || (gra && hent(gra, x, y))) tynn = true; // vinduer: tynne eller grå streker
      }
      klasse.push(vegg ? 'v' : tynn ? 't' : 'o');
    }
    // Hjørnene er usikre: hopp over den første og siste biten av kanten
    const kutt = Math.round(tykk * 1.5);
    let start = kutt;
    while (start < klasse.length - kutt) {
      const k = klasse[start];
      let slutt = start;
      while (slutt + 1 < klasse.length - kutt && (klasse[slutt + 1] === k || (k !== 'v' && klasse[slutt + 1] !== 'v'))) slutt++;
      const len = slutt - start + 1;
      if (k !== 'v' && len >= minst) {
        const bit = klasse.slice(start, slutt + 1);
        const andelTynn = bit.filter((x) => x === 't').length / bit.length;
        const linje = { a: [a[0] + ux * start, a[1] + uy * start], b: [a[0] + ux * slutt, a[1] + uy * slutt] };
        (andelTynn > 0.5 ? vinduer : dorer).push(linje);
      }
      start = slutt + 1;
    }
  }
  return { dorer, vinduer };
}

function signertAreal(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

export function arealPx(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

/**
 * Finner rom på en tegning.
 * @param g gråtoner, w × h
 * @returns { rom: [{ polygon: [[x,y],…], areal, midt }], veggtykkelse }
 */
export function finnRom(g, w, h, { minsteAndel = 0.004, dorFaktor = 4 } = {}) {
  const t = otsu(g);
  const mork = new Uint8Array(w * h);
  for (let i = 0; i < mork.length; i++) mork[i] = g[i] <= t ? 1 : 0;

  // 2. Bare tykke streker: krymp så tynne streker forsvinner, utvid tilbake.
  const tykk = veggtykkelse(mork, w, h);
  // Tekst og møbler er 1–3 px tykke. Innervegger kan være mye tynnere enn ytterveggene,
  // så grensen holdes lav.
  const tynnGrense = Math.max(1, Math.min(tykk * 0.3, 4));
  const vegger = utvid(krymp(mork, w, h, tynnGrense), w, h, tynnGrense + 0.5);

  // 3. Tett døråpninger: veggene gjøres tykkere med ca. 2,5 veggtykkelser.
  const lukk = Math.max(3, tykk * 2.5);
  const tette = utvid(vegger, w, h, lukk);

  // Vinduer er bredere enn dører og tegnes med tynne streker, som ikke regnes som vegg.
  // Området utenfor bygget finnes derfor med en mye bredere tetting (ca. 10 veggtykkelser),
  // så vindushullene ikke slipper utsiden inn i rommene. (Dørslag og møbler, som også er
  // tynne streker inne i rommene, påvirker da ingenting.)
  const bred = Math.max(lukk * 2, tykk * 10);
  const utenfor = (() => {
    // En hvit ramme rundt bildet, så det finnes «utenfor» selv om tegningen går nesten helt ut til kanten
    const P = Math.ceil(bred) + 2, W2 = w + 2 * P, H2 = h + 2 * P;
    const v2 = new Uint8Array(W2 * H2);
    for (let y = 0; y < h; y++) v2.set(vegger.subarray(y * w, (y + 1) * w), (y + P) * W2 + P);
    const tett = utvid(v2, W2, H2, bred);
    const fritt = new Uint8Array(W2 * H2);
    for (let i = 0; i < fritt.length; i++) fritt[i] = tett[i] ? 0 : 1;
    const { etikett: e, liste: l } = omrader(fritt, W2, H2);
    const kjerne = new Uint8Array(W2 * H2);
    const kant = new Set(l.filter((o) => o.kant).map((o) => o.id));
    for (let i = 0; i < e.length; i++) if (e[i] >= 0 && kant.has(e[i])) kjerne[i] = 1;
    const ute2 = utvid(kjerne, W2, H2, bred); // tilbake ut til veggene, og ikke lenger
    const ut = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) ut.set(ute2.subarray((y + P) * W2 + P, (y + P) * W2 + P + w), y * w);
    return ut;
  })();

  // 4. Lyse områder som ikke når kanten
  const fri = new Uint8Array(w * h);
  for (let i = 0; i < fri.length; i++) fri[i] = tette[i] || utenfor[i] ? 0 : 1;
  const { etikett, liste } = omrader(fri, w, h);
  const minst = w * h * minsteAndel;

  // 4b. En dør (0,8–1 m) er ofte bredere enn tettingen over, så rom som henger sammen gjennom
  //     en dør blir ett. Med en bredere tetting skilles de. Hvert område fra den smale tettingen
  //     får da én kjerne per rom fra den brede; små rom som forsvinner med den brede, beholdes hele.
  const lukkDor = Math.max(lukk, tykk * dorFaktor);
  const friDor = new Uint8Array(w * h);
  if (lukkDor > lukk) {
    const tetteDor = utvid(vegger, w, h, lukkDor);
    for (let i = 0; i < friDor.length; i++) friDor[i] = tetteDor[i] || utenfor[i] ? 0 : 1;
  }
  const { etikett: eDor, liste: lDor } = omrader(friDor, w, h);
  const storKjerne = new Set(lDor.filter((o) => !o.kant && o.antall >= minst * 0.2).map((o) => o.id));
  const harKjerne = new Set();
  for (let i = 0; i < etikett.length; i++) if (etikett[i] >= 0 && storKjerne.has(eDor[i])) harKjerne.add(etikett[i]);

  // 5. Alle rommene (og området utenfor) vokser samtidig tilbake ut til veggene.
  //    En døråpning deles da omtrent midt mellom de to rommene på hver side.
  const DOR_ID = 1 << 20; // kjerner fra den brede tettingen får egne id-er
  const info = new Map(liste.map((o) => [o.id, o]));
  const kilder = [];
  for (const o of liste) {
    if (o.kant) kilder.push(o);
    else if (o.antall >= minst && !harKjerne.has(o.id)) kilder.push(o);
  }
  const UTE = -2; // utsiden av bygget, vokser ikke, men sperrer
  const eier = new Int32Array(w * h).fill(-1);
  const steg = new Float32Array(w * h);
  const ko = new Int32Array(w * h);
  let les = 0, skriv = 0;
  const erKilde = new Set(kilder.map((o) => o.id));
  const dorSum = new Map(); // midtpunkt for kjernene fra den brede tettingen
  for (let i = 0; i < etikett.length; i++) {
    const e = etikett[i];
    if (e >= 0 && erKilde.has(e)) { eier[i] = e; ko[skriv++] = i; }
    else if (e >= 0 && harKjerne.has(e) && info.get(e).antall >= minst * 0.2 && storKjerne.has(eDor[i])) {
      const id = DOR_ID + eDor[i];
      eier[i] = id; ko[skriv++] = i;
      const s = dorSum.get(id) || [0, 0, 0]; s[0] += i % w; s[1] += (i - (i % w)) / w; s[2]++; dorSum.set(id, s);
    } else if (utenfor[i] && !vegger[i]) eier[i] = UTE;
  }
  for (const [id, [sx, sy, n]] of dorSum) kilder.push({ id, kant: false, antall: n, midt: [sx / n, sy / n] });
  // Vannskille: rommene fylles ut fra kjernene, de åpneste stedene (lengst fra vegg) først.
  // Der to rom møtes i en døråpning, går grensen da i det trangeste punktet: i selve døra.
  const fraVegg = avstand(Uint8Array.from(vegger, (v) => (v ? 0 : 1)), w, h);
  let L = 1;
  for (let i = 0; i < fraVegg.length; i++) if (!vegger[i]) L = Math.max(L, Math.round(fraVegg[i] * 2) + 1);
  // Hver bøtte er en kø (først inn, først ut), så rommene vokser like fort langs et nivå.
  const botter = Array.from({ length: L }, () => []);
  const lest = new Int32Array(L);
  let topp = L - 1;
  const naboer = (i) => { const x = i % w, y = (i - x) / w; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]; };
  const skyv = (i, niva) => {
    for (const n of naboer(i)) {
      if (n < 0 || vegger[n] || eier[n] !== -1) continue;
      botter[Math.min(niva, Math.round(fraVegg[n] * 2))].push(n, i);
    }
  };
  for (let k = 0; k < skriv; k++) skyv(ko[k], L - 1);
  while (topp >= 0) {
    const b = botter[topp];
    if (lest[topp] >= b.length) { botter[topp] = []; lest[topp] = 0; topp--; continue; }
    const n = b[lest[topp]++], fra = b[lest[topp]++];
    if (eier[n] !== -1) continue;
    eier[n] = eier[fra];
    skyv(n, topp);
  }

  // Mange tegninger viser vinduer som grå streker i veggen. Grått er alt som er tydelig mørkere
  // enn papiret (90-persentilen av lysheten), men lysere enn strekene.
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let papir = 255;
  for (let v = 0, sum = 0; v < 256; v++) { sum += hist[v]; if (sum >= g.length * 0.9) { papir = v; break; } }
  const gra = new Uint8Array(w * h);
  for (let i = 0; i < gra.length; i++) gra[i] = !mork[i] && g[i] < papir - 25 ? 1 : 0;

  const rom = [];
  for (const o of kilder) {
    if (o.kant) continue;
    const egen = new Uint8Array(w * h);
    for (let i = 0; i < egen.length; i++) if (eier[i] === o.id) egen[i] = 1;
    const { etikett: e2, liste: l2 } = omrader(egen, w, h);
    const storst = l2.reduce((a, b) => (b.antall > a.antall ? b : a), l2[0]);
    if (!storst) continue;
    const kontur = omriss(e2, w, h, storst.id, storst.boks);
    if (kontur.length < 8) continue;
    // Hakk mindre enn ca. 2,5 veggtykkelser (typisk restene av en døråpning) forenkles bort.
    const poly = ortogonaliser(rettOpp(skarpeHjorner(rettOpp(forenkle(kontur, Math.max(2, tykk * 0.4))), tykk * 3)), { kortest: tykk * 1.4 });
    if (poly.length < 3) continue;
    rom.push({ polygon: poly, areal: arealPx(poly), midt: o.midt, ...apninger(poly, vegger, mork, w, h, tykk, gra) });
  }
  rom.sort((a, b) => b.areal - a.areal);
  return { rom, veggtykkelse: tykk };
}
