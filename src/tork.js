/* Tørketid: når neste strøk tidligst kan tas, ut fra produktet, temperaturen og fuktigheten.

   Tidene er «overmalbar» fra Jotuns norske tekniske datablad (23 °C / 50 % RF), hentet
   2. november 2026. Sparkel følger Jotuns tørketabell for sparkel (Sparkelguide 2024), som
   har egne tider for temperatur og fuktighet. For maling ved andre temperaturer er tiden et
   overslag ut fra Jotuns egne tabeller for andre produkter (×1,5 ved 15 °C, ×2 ved 10 °C),
   ikke et tall fra databladet. Under +10 °C skal det ikke males. */

export const TORK_PRODUKTER = [
  // Maling, vegg
  { id: 'lady-pure-color', gruppe: 'Maling', navn: 'LADY Pure Color', timer: 2 },
  { id: 'lady-iconic', gruppe: 'Maling', navn: 'LADY Iconic', timer: 2 },
  { id: 'lady-balance', gruppe: 'Maling', navn: 'LADY Balance', timer: 2 },
  { id: 'lady-minerals', gruppe: 'Maling', navn: 'LADY Minerals', timer: 4 },
  { id: 'prima-wall', gruppe: 'Maling', navn: 'JOTAPROFF Prima Wall 05 / 07 / 25', timer: 2 },
  { id: 'prima-air', gruppe: 'Maling', navn: 'JOTAPROFF Prima Air 05', timer: 2 },
  { id: 'prima-clean', gruppe: 'Maling', navn: 'JOTAPROFF Prima Clean 05', timer: 2 },
  { id: 'dynamic', gruppe: 'Maling', navn: 'JOTAPROFF Dynamic 05 / 02', timer: 2 },
  { id: 'vegg-og-tak', gruppe: 'Maling', navn: 'JOTUN Vegg og tak', timer: 1 },
  // Tak
  { id: 'lady-perfection', gruppe: 'Tak', navn: 'LADY Perfection (tak)', timer: 3 },
  { id: 'primadekk', gruppe: 'Tak', navn: 'JOTAPROFF Primadekk 02', timer: 3 },
  // Grunning
  { id: 'primer', gruppe: 'Grunning', navn: 'JOTAPROFF Primer', timer: 2 },
  { id: 'covertech', gruppe: 'Grunning', navn: 'JOTAPROFF CoverTech 03 (sperrende)', timer: 4 },
  { id: 'kvist-sperre', gruppe: 'Grunning', navn: 'JOTUN Kvist- og sperregrunning', timer: 12, minC: 15 },
  { id: 'superheft', gruppe: 'Grunning', navn: 'JOTUN Superheft grunning', timer: 8 },
  // Våtrom
  { id: 'lady-aqua', gruppe: 'Våtrom', navn: 'LADY Aqua', timer: 4, merknad: 'Tåler vann først etter minst 10 døgn.' },
  { id: 'aquatech', gruppe: 'Våtrom', navn: 'JOTAPROFF AquaTech', timer: 4, merknad: 'Tåler vann først etter minst 10 døgn.' },
  { id: 'vatrom-grunning', gruppe: 'Våtrom', navn: 'JOTUN Grunning/lim for våtrom, som grunning', timer: 12 },
  { id: 'vatrom-forbehandling', gruppe: 'Våtrom', navn: 'JOTUN Grunning/lim for våtrom, som forbehandling', timer: 4 },
  { id: 'vatrom-sparkel', gruppe: 'Våtrom', navn: 'JOTUN Sparkel våtrom', timer: 24 },
  // Tre og panel
  { id: 'supreme-finish', gruppe: 'Tre og panel', navn: 'LADY Supreme Finish', timer: 6 },
  // Sparkel: tid fra Jotuns tabell (temperatur og fuktighet)
  { id: 'jotun-sparkel', gruppe: 'Sparkel', navn: 'JOTUN sparkel (vegg og tak, rullesparkel)', sparkel: true },
  { id: 'flugger-filler', gruppe: 'Sparkel', navn: 'Flügger Filler Perform M', timer: 16, ved: '20 °C / 60 % RF' },
];
export const TORK_BY_ID = Object.fromEntries(TORK_PRODUKTER.map((p) => [p.id, p]));

// Jotuns tørketabell for sparkel (timer), strimling og 2. gangs skjøtsparkling av gips.
const SPARKEL_RF = [10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95];
const SPARKEL_TABELL = {
  10: [21, 23, 26, 29, 36, 42, 54, 72, 96, 144, 288],
  15: [14, 16, 18, 20, 24, 29, 38, 54, 72, 108, 192],
  20: [10, 11, 12, 14, 17, 20, 26, 38, 48, 72, 144],
  25: [7, 8, 9, 10, 12, 14, 19, 27, 34, 39, 96],
};

/** Lineær innskyting i en tabell av [x, y]-par (x stigende). Utenfor endene: endeverdien. */
function skyt(par, x) {
  if (x <= par[0][0]) return par[0][1];
  for (let i = 1; i < par.length; i++) {
    if (x <= par[i][0]) {
      const [x0, y0] = par[i - 1], [x1, y1] = par[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return par[par.length - 1][1];
}

/** Sparkel: timer fra Jotuns tabell, innskutt i både temperatur og fuktighet. */
export function sparkelTimer(c, rf) {
  const iTemp = (t) => skyt(SPARKEL_RF.map((r, i) => [r, SPARKEL_TABELL[t][i]]), rf);
  return skyt([10, 15, 20, 25].map((t) => [t, iTemp(t)]), c);
}

/** Maling: faktor på tiden ved 23 °C / 50 % RF. Et overslag, se øverst i fila. */
export function malingFaktor(c, rf) {
  const temp = skyt([[10, 2], [15, 1.5], [20, 1.2], [23, 1], [25, 0.9]], c);
  // Fuktig luft: sparkeltabellen viser ca. ×1,5 fra 50 til 70 % og ×2–3 ved 80 %
  const fukt = rf <= 50 ? 1 : skyt([[50, 1], [70, 1.5], [80, 2.2], [90, 3]], rf);
  return temp * fukt;
}

/**
 * Når neste strøk tidligst kan tas.
 * Gir { timer, klar (ms), advarsel, estimat, merknad } eller null for ukjent produkt.
 */
export function torketid(produktId, { c = 20, rf = 50, start = Date.now() } = {}) {
  const p = TORK_BY_ID[produktId];
  if (!p) return null;
  const minC = p.minC || 10;
  let timer, estimat;
  if (p.sparkel) {
    timer = sparkelTimer(c, rf);
    estimat = c < 10 || c > 25;
  } else if (p.ved) {
    // Oppgitt ved andre forhold enn 23 °C: regn om fra de forholdene
    timer = p.timer * malingFaktor(c, rf) / malingFaktor(20, 60);
    estimat = Math.abs(c - 20) > 1 || Math.abs(rf - 60) > 5;
  } else {
    timer = p.timer * malingFaktor(c, rf);
    estimat = Math.abs(c - 23) > 1 || rf > 55;
  }
  timer = Math.round(timer * 4) / 4;
  const advarsel = c < minC
    ? 'Under +' + minC + ' °C: databladet sier at det ikke skal ' + (p.sparkel || p.gruppe === 'Sparkel' ? 'sparkles' : 'males') + '. Tiden blir mye lengre.'
    : rf > 80 ? 'Over 80 % luftfuktighet tørker det svært sakte. Luft ut eller varm opp.' : '';
  return { timer, klar: start + timer * 3600000, advarsel, estimat, merknad: p.merknad || '' };
}

/** Prøver å finne produktet ut fra et navn på jobben («Jotun Lady Pure Color»). */
export function gjettProdukt(navn) {
  const n = String(navn || '').toLowerCase();
  if (!n) return null;
  const treff = TORK_PRODUKTER.filter((p) => {
    const kjerne = p.navn.toLowerCase().replace(/^(jotun|jotaproff)\s+/, '').split(/[(/,]/)[0].replace(/\s+\d+\s*$/, '').trim();
    return kjerne && n.includes(kjerne);
  });
  return treff.sort((a, b) => b.navn.length - a.navn.length)[0]?.id || null;
}

/** «kl. 14:30», «i morgen kl. 09:00» eller «fre. kl. 09:00». */
export function klarTekst(ms, na = Date.now()) {
  const d = new Date(ms), i = new Date(na);
  const kl = 'kl. ' + d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  const dag = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dager = Math.round((dag(d) - dag(i)) / 86400000);
  if (dager === 0) return kl;
  if (dager === 1) return 'i morgen ' + kl;
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + kl;
}
