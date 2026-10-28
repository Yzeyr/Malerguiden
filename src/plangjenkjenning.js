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
export function apninger(poly, vegger, mork, w, h, tykk, gra = null, eier = null, egenId = null) {
  const dorer = [], vinduer = [];
  const sign = signertAreal(poly) > 0 ? 1 : -1;
  const minst = Math.max(4, tykk * 2); // minste vindu (0,5 m) er omtrent to veggtykkelser
  const dybde = Math.max(3, tykk * 2.2);
  const naer = Math.max(3, tykk * 0.5); // kanten av rommet ligger litt innenfor veggen
  const hent = (m, x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < w && yi < h && m[yi * w + xi] === 1; };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const lengde = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (lengde < minst * 1.2) continue;
    const ux = (b[0] - a[0]) / lengde, uy = (b[1] - a[1]) / lengde;
    // Utover fra rommet: for et rom med positivt areal (med klokka i bildekoordinater) er det venstre normal
    const nx = uy * sign, ny = -ux * sign;
    // Hvor mye vegg det er gjennom tykkelsen, punkt for punkt langs kanten. Der veggen er
    // mye tynnere enn ellers langs samme kant, er det en åpning: en dør (tomt) eller et vindu
    // (tynne eller grå streker, eller bare en smal rest av veggen, slik arkitekttegninger viser vinduer).
    const tell = [], tynne = [];
    for (let t = 0; t <= lengde; t += 1) {
      const px = a[0] + ux * t, py = a[1] + uy * t;
      // Bare veggen som starter rett ved rommets kant teller: en vegg som stikker fram på
      // andre siden av en døråpning, er ikke denne veggen.
      let n = 0, tynn = false, iVegg = false, ferdig = false;
      for (let d = 0; d <= dybde; d += 1) {
        const x = px + nx * d, y = py + ny * d;
        if (hent(vegger, x, y)) {
          if (!ferdig && (iVegg || d <= naer)) { n++; iVegg = true; }
        } else {
          if (iVegg) ferdig = true;
          if (hent(mork, x, y) || (gra && hent(gra, x, y))) tynn = true;
        }
      }
      tell.push(n); tynne.push(tynn);
    }
    const sortert = [...tell].sort((p, q) => p - q);
    const vanlig = sortert[Math.floor(sortert.length * 0.75)] || 0; // veggtykkelsen der det er vegg
    const grense = Math.max(1, vanlig * 0.6);
    const klasse = tell.map((n, t) => (n >= grense ? 'v' : n > 0 || tynne[t] ? 't' : 'o'));
    // En dør har et dørslag: dørbladet og buen går ut fra åpningen, inn i rommet eller ut, og
    // henger fast i veggen. Følger tynne streker som starter ved veggen foran åpningen; når de
    // langt nok ut (dobbeltdører har to halve dørblad), er det en dør. Tekst som «12x6 L» ved et
    // vindu svever fritt og henger ikke fast i veggen. En benk langs veggen går ikke utover.
    const harSlag = (s0, s1) => {
      const L = s1 - s0 + 1;
      const tynnPx = (i) => (mork[i] === 1 || (gra && gra[i] === 1)) && vegger[i] !== 1;
      const sjekk = (retning, fra) => {
        // Rektangelet foran åpningen, i kantens egne koordinater (t langs, d utover)
        const tMin = s0 - L * 0.15, tMax = s1 + L * 0.15, dMin = fra - 2, dMax = fra + L * 1.6;
        const inni = (x, y) => {
          const t = (x - a[0]) * ux + (y - a[1]) * uy, d = ((x - a[0]) * nx + (y - a[1]) * ny) * retning;
          return t >= tMin && t <= tMax && d >= dMin && d <= dMax ? d : null;
        };
        const sett = new Set(), ko = [];
        for (let t = tMin; t <= tMax; t += 1) for (let d = dMin; d <= fra + 2; d += 1) {
          const x = Math.round(a[0] + ux * t + nx * d * retning), y = Math.round(a[1] + uy * t + ny * d * retning);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = y * w + x;
          if (tynnPx(i) && !sett.has(i)) { sett.add(i); ko.push(i); }
        }
        let lengst = 0;
        while (ko.length && sett.size < 20000) {
          const i = ko.pop(), x = i % w, y = (i - x) / w;
          const d = inni(x, y);
          if (d == null) continue;
          lengst = Math.max(lengst, d - fra);
          for (const n of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
            if (n < 0 || n >= w * h || sett.has(n) || !tynnPx(n)) continue;
            sett.add(n); ko.push(n);
          }
        }
        return lengst;
      };
      // Dørbladet er omtrent like langt som døra er bred. Rekkverk og mållinjer går mye lenger.
      const erSlag = (ut) => ut >= L * 0.35 && ut <= L * 1.25;
      return erSlag(sjekk(1, vanlig)) || erSlag(sjekk(-1, 0));
    };
    // Hjørnene er usikre: hopp over den første og siste biten av kanten
    const kutt = Math.round(tykk * 0.6); // vinduer og dører sitter ofte tett inntil et hjørne
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
        const slag = harSlag(start, slutt);
        // En åpning uten dørslag som dekker nesten hele kanten, rett inn i et annet rom, er en åpen
        // overgang (f.eks. fra gang til trappehull), verken dør eller vindu
        const midt = (start + slutt) / 2;
        const helKant = len >= (lengde - 2 * kutt) * 0.7;
        const ox = Math.round(a[0] + ux * midt + nx * (dybde + 2)), oy = Math.round(a[1] + uy * midt + ny * (dybde + 2));
        const annetRom = eier && ox >= 0 && oy >= 0 && ox < w && oy < h && eier[oy * w + ox] >= 0 && eier[oy * w + ox] !== egenId;
        if (!slag && annetRom && helKant) { start = slutt + 1; continue; }
        (!slag && andelTynn > 0.5 ? vinduer : dorer).push(linje);
      }
      start = slutt + 1;
    }
  }
  return { dorer, vinduer };
}

/**
 * Trapp i rommet: mange parallelle trinnstreker med jevn avstand, vannrett eller loddrett.
 * Rommet regnes da som trappehull (høye flater, stige eller stillas).
 */
export function erTrapp(egen, boks, mork, vegger, w, tykk) {
  const [x0, y0, x1, y1] = boks;
  const minLengde = Math.max(8, tykk * 2.5);
  const tynn = (x, y) => { const i = y * w + x; return egen[i] === 1 && mork[i] === 1 && vegger[i] !== 1; };
  // Lengste strek (tillater hull på én piksel) på hver rad eller kolonne
  const lengst = (vannrett) => {
    const ut = [];
    const [a0, a1, b0, b1] = vannrett ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
    for (let a = a0; a <= a1; a++) {
      let best = 0, lop = 0, hull = 0;
      for (let b = b0; b <= b1; b++) {
        if (vannrett ? tynn(b, a) : tynn(a, b)) { lop += 1 + hull; hull = 0; best = Math.max(best, lop); }
        else if (lop && hull < 1) hull++;
        else { lop = 0; hull = 0; }
      }
      ut.push(best);
    }
    return ut;
  };
  const trinn = (rader, bredde) => {
    const pos = [];
    for (let i = 0; i < rader.length; i++) {
      if (rader[i] < minLengde) continue;
      let j = i;
      while (j + 1 < rader.length && rader[j + 1] >= minLengde) j++;
      if (j - i <= 3) { // tynn strek, ikke en flate
        let l = 0;
        for (let k = i; k <= j; k++) l = Math.max(l, rader[k]);
        pos.push([(i + j) / 2, l]);
      }
      i = j;
    }
    // Lengste rekke av like lange streker med jevn avstand
    let best = 1;
    for (let a = 0; a < pos.length; a++) {
      let n = 1, gap = null;
      for (let b = a + 1; b < pos.length; b++) {
        const d = pos[b][0] - pos[b - 1][0];
        const likLengde = Math.abs(pos[b][1] - pos[b - 1][1]) <= Math.max(pos[b][1], pos[b - 1][1]) * 0.3;
        // Trinn er kortere enn rommet er bredt. Flis- og parkettstreker går tvers over.
        if (d < 3 || !likLengde || pos[b][1] > bredde * 0.75) break;
        if (gap == null) { gap = d; n++; continue; }
        if (Math.abs(d - gap) <= Math.max(2, gap * 0.3)) n++; else break;
      }
      best = Math.max(best, n);
    }
    return best;
  };
  // Streker begge veier er et rutenett (fliser, parkett), ikke en trapp
  const vannrett = trinn(lengst(true), x1 - x0 + 1), loddrett = trinn(lengst(false), y1 - y0 + 1);
  if (vannrett >= 4 && loddrett >= 4) return false;
  return Math.max(vannrett, loddrett) >= 4;
}

/** Hvor stor del av omkretsen som har en vegg rett utenfor. */
function veggAndel(poly, vegger, w, h, tykk) {
  const sign = signertAreal(poly) > 0 ? 1 : -1;
  const dybde = Math.max(3, tykk * 2.2);
  let med = 0, alle = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const lengde = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!lengde) continue;
    const ux = (b[0] - a[0]) / lengde, uy = (b[1] - a[1]) / lengde, nx = uy * sign, ny = -ux * sign;
    for (let t = 0; t <= lengde; t += 2) {
      alle++;
      for (let d = 0; d <= dybde; d += 1) {
        const x = Math.round(a[0] + ux * t + nx * d), y = Math.round(a[1] + uy * t + ny * d);
        if (x >= 0 && y >= 0 && x < w && y < h && vegger[y * w + x]) { med++; break; }
      }
    }
  }
  return alle ? med / alle : 0;
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
export function finnRom(g, w, h, { minsteAndel = 0.004, sammen = 0.95, feilsok = false } = {}) {
  const t = otsu(g);
  const mork = new Uint8Array(w * h);
  for (let i = 0; i < mork.length; i++) mork[i] = g[i] <= t ? 1 : 0;

  // 2. Bare tykke streker: krymp så tynne streker forsvinner, utvid tilbake.
  let tykk = veggtykkelse(mork, w, h);
  // Hule vegger: noen tegninger viser veggene som to tynne parallelle streker. Da er ingen streker
  // tykke, og mellomrommet mellom de doble strekene fylles først, så veggene blir hele.
  let veggKilde = mork;
  if (tykk <= 3) {
    const lukket = krymp(utvid(mork, w, h, 3), w, h, 3);
    const ny = veggtykkelse(lukket, w, h);
    if (ny > tykk + 1) { veggKilde = lukket; tykk = ny; }
  }
  // Tekst og møbler er 1–3 px tykke. Innervegger kan være mye tynnere enn ytterveggene,
  // så grensen holdes lav.
  const tynnGrense = Math.max(1, Math.min(tykk * 0.3, 4));
  const vegger = utvid(krymp(veggKilde, w, h, tynnGrense), w, h, tynnGrense + 0.5);

  const lukk = Math.max(3, tykk * 2.5);

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

  // 4. Rommene finnes som et vannskille på avstanden til nærmeste vegg. Hvert rom har et åpent
  //    midtparti. Der to slike møtes, er det en åpning, og høyden der er halve åpningsbredden.
  //    Er åpningen smal i forhold til det minste av de to rommene (en dør), er det to rom. Er den
  //    nesten like bred som rommet selv (en åpen overgang, en ujevn vegg), er det ett rom.
  //    Slik deles ikke en smal gang opp, mens en dør skiller rommene uansett hvor tykke veggene er.
  const minst = w * h * minsteAndel;
  const N = w * h;
  const fraVegg = avstand(Uint8Array.from(vegger, (v) => (v ? 0 : 1)), w, h);
  const niva = new Int32Array(N);
  let L = 1;
  for (let i = 0; i < N; i++) {
    if (vegger[i] || utenfor[i]) { niva[i] = -1; continue; }
    niva[i] = Math.round(fraVegg[i] * 2);
    if (niva[i] + 1 > L) L = niva[i] + 1;
  }
  // Telle-sortering: pikslene fra høyeste til laveste nivå
  const iNiva = new Int32Array(L);
  for (let i = 0; i < N; i++) if (niva[i] >= 0) iNiva[niva[i]]++;
  const forst = new Int32Array(L);
  let antallFri = 0;
  for (let v = L - 1; v >= 0; v--) { forst[v] = antallFri; antallFri += iNiva[v]; }
  const rekke = new Int32Array(antallFri);
  for (let i = 0; i < N; i++) if (niva[i] >= 0) rekke[forst[niva[i]]++] = i;

  const eier = new Int32Array(N).fill(-1);
  const foreldre = [], topp = [], vedKant = [];
  const finn = (x) => { while (foreldre[x] !== x) { foreldre[x] = foreldre[foreldre[x]]; x = foreldre[x]; } return x; };
  for (let k = 0; k < rekke.length; k++) {
    const i = rekke[k], v = niva[i], x = i % w, y = (i - x) / w;
    let min = -1;
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (n < 0 || eier[n] < 0) continue;
      const r = finn(eier[n]);
      if (min < 0 || r === min) { min = r; continue; }
      if (v >= sammen * Math.min(topp[min], topp[r])) {
        const stor = topp[min] >= topp[r] ? min : r, liten = stor === min ? r : min;
        foreldre[liten] = stor; vedKant[stor] = vedKant[stor] || vedKant[liten]; min = stor;
      }
    }
    if (min < 0) { min = foreldre.length; foreldre.push(min); topp.push(v); vedKant.push(false); }
    eier[i] = min;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) vedKant[finn(min)] = true;
  }
  // Hvert rom: alle pikslene som hører til samme rot. Rom som når kanten av bildet, er utenfor.
  const sum = new Map();
  for (let i = 0; i < N; i++) {
    if (eier[i] < 0) continue;
    const r = finn(eier[i]);
    eier[i] = r;
    const s = sum.get(r) || [0, 0, 0]; s[0] += i % w; s[1] += (i - (i % w)) / w; s[2]++; sum.set(r, s);
  }
  // Mange tegninger viser vinduer som grå streker i veggen. Grått er alt som er tydelig mørkere
  // enn papiret (90-persentilen av lysheten), men lysere enn strekene.
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let papir = 255;
  for (let v = 0, sum = 0; v < 256; v++) { sum += hist[v]; if (sum >= g.length * 0.9) { papir = v; break; } }
  const gra = new Uint8Array(w * h);
  for (let i = 0; i < gra.length; i++) gra[i] = !mork[i] && g[i] < papir - 25 ? 1 : 0;
  // Bare tynne grå streker teller. Fargede gulv og grå fyll er flater, ikke streker.
  {
    // Grå vinduer er omtrent like tykke som veggen; et gulv er mye bredere.
    const r = Math.max(3, tykk * 1.5);
    const flate = utvid(krymp(gra, w, h, r), w, h, r + 1);
    for (let i = 0; i < gra.length; i++) if (flate[i]) gra[i] = 0;
  }

  const uteAndel = {};
  // Deler som for en stor del grenser rett mot utsiden (ikke mot en vegg) er utenfor bygget:
  // terrasser, trapper og trinn med rekkverk av tynne streker. De slås aldri sammen med et rom.
  {
    const motUte = new Map(), grense = new Map();
    for (let i = 0; i < N; i++) {
      const a = eier[i];
      if (a < 0) continue;
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n < 0 || n >= N || eier[n] === a) continue;
        grense.set(a, (grense.get(a) || 0) + 1);
        if (utenfor[n] && !vegger[n]) motUte.set(a, (motUte.get(a) || 0) + 1);
      }
    }
    for (const [a, n] of grense) {
      uteAndel[a] = (motUte.get(a) || 0) / n;
      if (uteAndel[a] > 0.45) vedKant[a] = true; // rom med store vinduer ligger godt under
    }
  }

  const grenseInfo = [];
  // 4b. Åpninger mellom rommene. Svært bred: samme rom. Middels: samme rom, med mindre det er
  //     tegnet et dørslag (en kvart sirkel fra hengslet). Smal: to rom. Dører i små rom (WC, bod)
  //     er nesten like brede som rommet, så bredden alene skiller ikke dør fra en åpen overgang.
  {
    const grenser = new Map();
    for (let i = 0; i < N; i++) {
      const a = eier[i];
      if (a < 0) continue;
      const x = i % w;
      for (const n of [x < w - 1 ? i + 1 : -1, i + w < N ? i + w : -1]) {
        if (n < 0) continue;
        const b = eier[n];
        if (b < 0 || b === a) continue;
        const nokkel = a < b ? a + ',' + b : b + ',' + a;
        let l = grenser.get(nokkel);
        if (!l) grenser.set(nokkel, (l = []));
        l.push(i);
      }
    }
    const tynn = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      const i = y * w + x;
      return x >= 0 && y >= 0 && x < w && y < h && (mork[i] === 1 || gra[i] === 1) && vegger[i] !== 1;
    };
    // Dørslag: tynne streker (dørblad og bue) som går ut fra åpningen og et godt stykke inn i et
    // av rommene. Tekst og møbler langs grensen når ikke så langt ut.
    const r0 = Math.max(3, Math.round(tykk * 0.7));
    const dorslag = (px, langsX, L) => {
      const sett = new Set(), ko = [];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const i of px) {
        const x = i % w, y = (i - x) / w;
        const pa = langsX ? x : y, pb = langsX ? y : x;
        a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb);
        // Dørbladet møter veggen rett ved enden av åpningen, så det letes litt rundt grensen
        for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) {
          const n = i + dy * w + dx;
          if (n >= 0 && n < N && tynn(n % w, (n - (n % w)) / w) && !sett.has(n)) { sett.add(n); ko.push(n); }
        }
      }
      let ut = 0;
      while (ko.length && sett.size < 30000) {
        const i = ko.pop(), x = i % w, y = (i - x) / w;
        const pa = langsX ? x : y, pb = langsX ? y : x;
        if (pa < a0 - L * 0.3 || pa > a1 + L * 0.3 || pb < b0 - L * 1.6 || pb > b1 + L * 1.6) continue;
        ut = Math.max(ut, b0 - pb, pb - b1);
        for (const n of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
          if (n < 0 || n >= N || sett.has(n) || !tynn(n % w, (n - (n % w)) / w)) continue;
          sett.add(n); ko.push(n);
        }
      }
      return ut >= L * 0.35 && ut <= L * 1.25; // dørbladet er omtrent like langt som døra er bred
    };
    const slatt = new Map();
    grenseInfo.length = 0;
    const rot = (x) => { while (slatt.has(x)) x = slatt.get(x); return x; };
    // Grensene behandles fra den bredeste åpningen til den smaleste, slik at små biter av samme
    // rom slås sammen først, og et rom er helt før det sammenlignes med naboen gjennom en dør.
    const liste = [];
    for (const [nokkel, px] of grenser) {
      const [a, b] = nokkel.split(',').map(Number);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, sadel = 0;
      for (const i of px) {
        const x = i % w, y = (i - x) / w;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        sadel = Math.max(sadel, fraVegg[i] * 2);
      }
      liste.push({ a, b, px, sadel, x0, x1, y0, y1 });
    }
    liste.sort((p, q) => q.sadel - p.sadel);
    // Endene av grensen er der hengslene sitter, hvis det er en dør
    const dorInfo = (px, x0, x1, y0, y1) => {
      const langsX = x1 - x0 >= y1 - y0;
      let e1 = null, e2 = null;
      for (const i of px) {
        const p = [i % w, (i - (i % w)) / w], k = langsX ? p[0] : p[1];
        if (!e1 || k < (langsX ? e1[0] : e1[1])) e1 = p;
        if (!e2 || k > (langsX ? e2[0] : e2[1])) e2 = p;
      }
      const L = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]) + 1;
      return { e1, e2, L, dor: dorslag(px, langsX, L) };
    };
    // Tegninger uten dørslag (dørene vises bare som åpninger): da sier et manglende dørslag ingenting
    for (const p of liste) p.info = dorInfo(p.px, p.x0, p.x1, p.y0, p.y1);
    const harDorslag = liste.some((p) => p.info.dor);
    for (const { a, b, sadel, info } of liste) {
      const ra = rot(a), rb = rot(b);
      if (ra === rb || vedKant[ra] || vedKant[rb]) continue;
      const forhold = sadel / Math.max(1, Math.min(topp[ra], topp[rb]));
      if (forhold < 0.5) continue; // smal som en dør: under halvparten av bredden på det minste rommet
      let samme = forhold >= 0.9;
      if (!samme && harDorslag) {
        const { e1, e2, L, dor } = info;
        if (feilsok) grenseInfo.push({ a, b, e1, e2, L: Math.round(L), forhold: +forhold.toFixed(2), dor });
        samme = L >= tykk * 2 && !dor;
      }
      if (!samme) continue;
      slatt.set(rb, ra); topp[ra] = Math.max(topp[ra], topp[rb]);
    }
    if (slatt.size) {
      for (let i = 0; i < N; i++) if (eier[i] >= 0 && slatt.has(eier[i])) eier[i] = rot(eier[i]);
      for (const [id, s] of [...sum]) {
        const r = rot(id);
        if (r === id) continue;
        const t = sum.get(r); t[0] += s[0]; t[1] += s[1]; t[2] += s[2]; sum.delete(id);
      }
    }
  }
  const kilder = [];
  for (const [id, [sx, sy, n]] of sum) if (!vedKant[id] && n >= minst) kilder.push({ id, kant: false, antall: n, midt: [sx / n, sy / n] });


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
    // Et rom er omgitt av vegger. Trapper, terrasser og trinn utenfor bygget er bare tynne streker.
    if (veggAndel(poly, vegger, w, h, tykk) < 0.5) continue;
    // Et rom er minst noen veggtykkelser bredt (et WC er ca. 1 m). En smal stripe mellom en vegg
    // og en mållinje er ikke et rom. Areal delt på halve omkretsen er omtrent bredden.
    const omkrets = poly.reduce((s2, p, i) => s2 + Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]), 0);
    if (arealPx(poly) / (omkrets / 2) < tykk * 2.2) continue;
    rom.push({ polygon: poly, areal: arealPx(poly), midt: o.midt, trapp: erTrapp(egen, storst.boks, mork, vegger, w, tykk), ...apninger(poly, vegger, mork, w, h, tykk, gra, eier, o.id) });
  }
  rom.sort((a, b) => b.areal - a.areal);
  return feilsok ? { rom, veggtykkelse: tykk, vegger, mork, gra, utenfor, eier, vedKant, topp, uteAndel, sum: Object.fromEntries(sum), grenseInfo } : { rom, veggtykkelse: tykk };
}
