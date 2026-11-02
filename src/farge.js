/* Farger: fra et bilde av veggen til nærmeste fargekode.

   Kameraet justerer hvitbalanse og lys selv, så en farge i et bilde er ikke
   fargen på veggen. Med et hvitt ark i samme lys kan vi rette det: arket skal
   være hvitt, så det arket «har fått» av farge og mørke, trekkes fra veggen.
   Regningen skjer i lineært lys (ikke i sRGB-tall), og avstanden mellom farger
   måles med CIEDE2000, som er laget for å følge hva øyet ser. */

export function hexTilRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbTilHex([r, g, b]) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + to(r) + to(g) + to(b)).toUpperCase();
}

const tilLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fraLin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbTilLab([r, g, b]) {
  const R = tilLin(r), G = tilLin(g), B = tilLin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000. Under 1: ser likt ut. 1–2: så vidt synlig. Over 5: tydelig forskjell. */
export function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cs = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cs ** 7 / (Cs ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (b === 0 && a === 0) return 0; const v = Math.atan2(b, a) / rad; return v >= 0 ? v : v + 360; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lsp = (L1 + L2) / 2, Csp = (C1p + C2p) / 2;
  let hsp = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hsp += h1p + h2p < 360 ? 360 : -360; hsp /= 2; }
  const T = 1 - 0.17 * Math.cos((hsp - 30) * rad) + 0.24 * Math.cos(2 * hsp * rad) + 0.32 * Math.cos((3 * hsp + 6) * rad) - 0.2 * Math.cos((4 * hsp - 63) * rad);
  const dTh = 30 * Math.exp(-(((hsp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Csp ** 7 / (Csp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lsp - 50) ** 2) / Math.sqrt(20 + (Lsp - 50) ** 2);
  const Sc = 1 + 0.045 * Csp, Sh = 1 + 0.015 * Csp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/* Et vanlig hvitt kopipapir ligger rundt L* 95. Det er dette arket «egentlig» er. */
const PAPIR_LIN = tilLin(242);

/**
 * Retter fargen på veggen ut fra et hvitt ark i samme lys.
 * vegg og hvitt: [r,g,b] fra bildet. Svar: [r,g,b] slik veggen ville sett ut i nøytralt lys.
 */
export function rettMedHvitt(vegg, hvitt) {
  return vegg.map((v, i) => {
    const w = Math.max(tilLin(hvitt[i]), 0.02);
    return fraLin(Math.min(1, tilLin(v) * (PAPIR_LIN / w)));
  });
}

/** Typisk farge i et område av et bilde: medianen per kanal (tåler glimt og støv). */
export function medianFarge(data, bredde, x, y, radius = 8) {
  const kan = [[], [], []];
  const hoyde = data.length / 4 / bredde;
  for (let yy = Math.max(0, y - radius); yy <= Math.min(hoyde - 1, y + radius); yy++) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(bredde - 1, x + radius); xx++) {
      const i = (yy * bredde + xx) * 4;
      kan[0].push(data[i]); kan[1].push(data[i + 1]); kan[2].push(data[i + 2]);
    }
  }
  return kan.map((k) => { k.sort((a, b) => a - b); return k.length ? k[k.length >> 1] : 0; });
}

/** De n fargene i lista som ligger nærmest. Hver får { ...farge, avstand }. */
export function naermeste(rgb, farger, n = 3) {
  const lab = rgbTilLab(rgb);
  return farger
    .map((f) => { const r = hexTilRgb(f.hex); return r ? { ...f, avstand: deltaE(lab, rgbTilLab(r)) } : null; })
    .filter(Boolean)
    .sort((a, b) => a.avstand - b.avstand)
    .slice(0, n);
}

/* Et mobilkamera bommer gjerne med ΔE 3–5 selv med hvitt ark. Da er en kjent farge
   litt lenger unna ofte et bedre svar enn en ukjent som tilfeldigvis ligger nærmest.
   Forrangen gjelder bare når fargen er rimelig nær, så en tydelig annen farge vinner aldri. */
const MAKS_FORRANG = 4;
const FORRANG_INNEN = 7;

/**
 * Som naermeste(), men farger som er mye brukt får forrang når de er nær nok.
 * forrang(farge) gir et tall i ΔE (0 = ingen). Hver får { ...farge, avstand, forrang }.
 */
export function rangerFarger(rgb, farger, { n = 4, forrang = () => 0 } = {}) {
  const lab = rgbTilLab(rgb);
  return farger
    .map((f) => {
      const r = hexTilRgb(f.hex);
      if (!r) return null;
      const avstand = deltaE(lab, rgbTilLab(r));
      const fr = avstand <= FORRANG_INNEN ? Math.min(MAKS_FORRANG, Math.max(0, forrang(f) || 0)) : 0;
      return { ...f, avstand, forrang: fr, poeng: avstand - fr };
    })
    .filter(Boolean)
    .sort((a, b) => a.poeng - b.poeng || a.avstand - b.avstand)
    .slice(0, n);
}

/** Hvor godt en farge passer, i ord. */
export function avstandTekst(d) {
  if (d < 1.5) return 'Treffer nesten helt';
  if (d < 3) return 'Svært nær';
  if (d < 5) return 'Nær';
  if (d < 10) return 'Ligner';
  return 'Langt unna';
}

/** Lys tekst på mørk farge og omvendt. */
export function tekstFarge(hex) {
  const r = hexTilRgb(hex);
  return r && rgbTilLab(r)[0] < 60 ? '#FFFFFF' : '#1F1A17';
}
