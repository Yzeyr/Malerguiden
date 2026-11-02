/* Rapport til kunden når jobben er ferdig: hva som er gjort, rommene, fargene, plantegningen
   og bilder før og etter. Ren HTML med egne stiler, så den blir lik som PDF i appen,
   ved utskrift fra Safari og på papir. Ingen priser. */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tall = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');

// Fargene i appen er CSS-variabler. I rapporten står de som vanlige farger.
export const RAPPORT_FARGER = {
  '--blekk': '#2B231E', '--blekk2': '#5B5048', '--blekk3': '#8A7D72', '--kort': '#FFFFFF',
  '--terrakotta': '#B9482A', '--linje': '#E3D7C8', '--sans': '-apple-system, Helvetica, Arial, sans-serif',
};
/** Bytter var(--x) med fargen, så en SVG fra appen tegnes likt utenfor appen. */
export function utenVariabler(tekst) {
  return String(tekst).replace(/var\((--[a-z0-9-]+)\)/g, (hele, navn) => RAPPORT_FARGER[navn] || '#2B231E');
}

/**
 * data = {
 *   tittel, kunde: { navn, adresse }, dato: 'tekst', firma, hilsen,
 *   arbeid: ['Maling', …], klasse: 'K2 — …' | '',
 *   rom: [{ navn, vegg, tak }],            // m², tall eller null
 *   farger: [{ rom, produkt, kode, glans, strok, hex }],
 *   planer: [{ navn, svg }],               // svg som tekst
 *   bilder: [{ tittel: 'Før', liste: [dataUrl, …] }],
 * }
 */
export function rapportHtml(data) {
  const d = data || {};
  const del = [];
  const seksjon = (tittel, innhold) => innhold && del.push('<section><h2>' + esc(tittel) + '</h2>' + innhold + '</section>');

  const arbeid = (d.arbeid || []).filter(Boolean);
  seksjon('Utført arbeid', arbeid.length || d.klasse
    ? '<ul>' + arbeid.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>' + (d.klasse ? '<p class="dempet">Sparkling: ' + esc(d.klasse) + '</p>' : '')
    : '');

  const rom = (d.rom || []).filter((r) => r && r.navn);
  seksjon('Rom', rom.length
    ? '<table><thead><tr><th>Rom</th><th class="tall">Vegger</th><th class="tall">Tak</th></tr></thead><tbody>'
      + rom.map((r) => '<tr><td>' + esc(r.navn) + '</td><td class="tall">' + (r.vegg > 0 ? tall(r.vegg) + ' m²' : '–') + '</td><td class="tall">' + (r.tak > 0 ? tall(r.tak) + ' m²' : '–') + '</td></tr>').join('')
      + '</tbody></table>'
    : '');

  const farger = (d.farger || []).filter((f) => f && (f.produkt || f.kode));
  seksjon('Farger brukt', farger.length
    ? '<table><thead><tr><th></th><th>Rom</th><th>Produkt</th><th>Farge</th><th>Glans</th><th class="tall">Strøk</th></tr></thead><tbody>'
      + farger.map((f) => '<tr><td>' + (f.hex ? '<span class="prove" style="background:' + esc(f.hex) + '"></span>' : '') + '</td><td>' + esc(f.rom) + '</td><td>' + esc(f.produkt) + '</td><td>' + esc(f.kode) + '</td><td>' + esc(f.glans) + '</td><td class="tall">' + esc(f.strok) + '</td></tr>').join('')
      + '</tbody></table><p class="dempet">Ta vare på fargekodene. Da er det lett å kjøpe riktig farge til flikking senere.</p>'
    : '');

  const planer = (d.planer || []).filter((p) => p && p.svg);
  seksjon('Plantegning', planer.length
    ? planer.map((p) => '<figure class="plan">' + utenVariabler(p.svg) + (p.navn ? '<figcaption>' + esc(p.navn) + '</figcaption>' : '') + '</figure>').join('')
    : '');

  for (const g of d.bilder || []) {
    if (!g || !g.liste || !g.liste.length) continue;
    seksjon(g.tittel, '<div class="bilder">' + g.liste.map((src) => '<img src="' + esc(src) + '" alt="">').join('') + '</div>');
  }

  return '<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(d.tittel || 'Rapport') + '</title><style>' + STIL + '</style></head><body>'
    + '<header><div class="over">' + esc(d.tittel || 'Rapport') + '</div>'
    + '<h1>' + esc(d.kunde?.navn || 'Jobben') + '</h1>'
    + '<p>' + [d.kunde?.adresse, d.dato].filter(Boolean).map(esc).join(' · ') + '</p></header>'
    + (d.hilsen ? '<p class="hilsen">' + esc(d.hilsen).replace(/\n/g, '<br>') + '</p>' : '')
    + del.join('')
    + '<footer>' + (d.firma ? esc(d.firma) + ' · ' : '') + 'Laget med Malerguiden</footer>'
    + '</body></html>';
}

const STIL = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font: 14px/1.45 -apple-system, Helvetica, Arial, sans-serif; color: #2B231E; background: #fff; }
header { border-bottom: 3px solid #B9482A; padding-bottom: 12px; margin-bottom: 18px; }
.over { text-transform: uppercase; letter-spacing: .08em; font-size: 11px; font-weight: 700; color: #B9482A; }
h1 { font: 600 28px/1.15 Georgia, "Times New Roman", serif; margin: 4px 0 4px; }
header p { margin: 0; color: #5B5048; }
h2 { font: 600 18px/1.2 Georgia, "Times New Roman", serif; margin: 0 0 8px; }
section { margin: 0 0 20px; break-inside: avoid; page-break-inside: avoid; }
ul { margin: 0; padding-left: 20px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8A7D72; border-bottom: 1px solid #E3D7C8; padding: 4px 6px; }
td { border-bottom: 1px solid #F0E7DB; padding: 6px; vertical-align: middle; }
.tall { text-align: right; white-space: nowrap; }
.prove { display: inline-block; width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(0,0,0,.15); vertical-align: middle; }
.dempet { color: #8A7D72; font-size: 12px; margin: 6px 0 0; }
.hilsen { margin: 0 0 18px; }
.plan { margin: 0 0 10px; text-align: center; }
.plan svg { max-width: 100%; height: auto; }
figcaption { font-size: 12px; color: #5B5048; }
.bilder { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bilder img { width: 100%; height: 190px; object-fit: cover; border-radius: 6px; break-inside: avoid; }
footer { margin-top: 26px; border-top: 1px solid #E3D7C8; padding-top: 8px; font-size: 11px; color: #8A7D72; }
`;
