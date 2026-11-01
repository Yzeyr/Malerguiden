/* Fargeprøve fra veggen, fargevelger og lesing av spannet.

   Fargeprøven virker også i Safari: ta et bilde med et hvitt ark mot veggen,
   trykk på arket og så på veggen. Lesing av spannet og prøvemaling i AR
   trenger iPhone-appen. */

import { h, tom, ikon, toast, ark } from '../dom.js';
import { fmt } from '../util.js';
import { rettMedHvitt, medianFarge, naermeste, avstandTekst, rgbTilHex, tekstFarge, hexTilRgb } from '../farge.js';
export { tekstFarge };
import { FARGER, finnFarge, sokFarger, fargeNavn } from '../data/farger.js';
import { iApp, kall, taBilde, lesTekstIBilde } from '../native.js';
import { tolkEtikett, etikettTekst } from '../etikett.js';

const prove = (hex, str = 44) => h('span', { style: { width: str + 'px', height: str + 'px', borderRadius: '10px', background: hex, flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' } });

/**
 * Fargeprøve: bilde med hvitt ark → nærmeste fargekode.
 * Løser med fargen som ble valgt ({ merke, kode, navn, hex, malt }), eller null.
 */
export async function fargeprove() {
  const fil = await taBilde();
  if (!fil) return null;
  const bmp = await createImageBitmap(fil);
  const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const lerret = h('canvas', { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s), style: { width: '100%', borderRadius: '12px', touchAction: 'manipulation', display: 'block' } });
  const cx = lerret.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, lerret.width, lerret.height);
  bmp.close?.();
  const bilde = cx.getImageData(0, 0, lerret.width, lerret.height);
  const radius = Math.max(4, Math.round(Math.min(lerret.width, lerret.height) * 0.012));

  return new Promise((resolve) => {
    let svar = null;
    ark((lukk) => {
      let hvitt = null, vegg = null, punkter = [];
      const steg = h('p', { style: { fontWeight: '600', margin: '4px 2px 10px' } });
      const resultat = h('div');
      const tegn = () => {
        cx.putImageData(bilde, 0, 0);
        for (const p of punkter) {
          cx.lineWidth = Math.max(3, radius / 2);
          cx.strokeStyle = '#fff'; cx.beginPath(); cx.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2); cx.stroke();
          cx.strokeStyle = p.farge; cx.lineWidth = Math.max(2, radius / 3); cx.beginPath(); cx.arc(p.x, p.y, radius * 2.2 + 3, 0, Math.PI * 2); cx.stroke();
        }
      };
      const oppdater = () => {
        steg.textContent = !hvitt ? '1. Trykk på det hvite arket.' : !vegg ? '2. Trykk på veggen ved siden av arket.' : 'Ferdig. Trykk et annet sted på veggen for å måle på nytt.';
        tom(resultat);
        if (!vegg) {
          if (!hvitt) resultat.append(h('button.lenkeknapp', { type: 'button', onclick: () => { hvitt = 'ingen'; oppdater(); } }, 'Har ikke hvitt ark'));
          return;
        }
        const rettet = hvitt === 'ingen' ? vegg : rettMedHvitt(vegg, hvitt);
        const hex = rgbTilHex(rettet);
        const treff = naermeste(rettet, FARGER, 4);
        resultat.append(
          h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', margin: '12px 2px' } },
            prove(hex, 54),
            h('span', h('b', { style: { display: 'block' } }, 'Målt farge ' + hex), h('small.dempet', hvitt === 'ingen' ? 'Uten hvitt ark: lyset i rommet farger målingen.' : 'Rettet med det hvite arket.'))),
          FARGER.length ? h('div.valgliste', treff.map((f) => h('button', {
            type: 'button', onclick: () => { svar = { merke: f.merke, kode: f.kode, navn: f.navn, hex: f.hex, malt: hex }; lukk(); },
          }, prove(f.hex, 34), h('span', fargeNavn(f), h('small', avstandTekst(f.avstand) + ' · ΔE ' + fmt(f.avstand, 1)))))) : h('p.dempet', 'Fargelista er tom.'),
          h('p.dempet.liten', { style: { margin: '10px 2px 0' } }, 'Kameraet er ikke et fargeinstrument. Bruk svaret til å finne riktig kort i fargevifta, og sjekk i dagslys.'));
      };
      lerret.addEventListener('click', (e) => {
        const r = lerret.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left) * lerret.width / r.width), y = Math.round((e.clientY - r.top) * lerret.height / r.height);
        const rgb = medianFarge(bilde.data, bilde.width, x, y, radius);
        if (!hvitt) { hvitt = rgb; punkter = [{ x, y, farge: '#2b7' }]; }
        else { vegg = rgb; punkter = [...punkter.filter((p) => p.farge !== '#d63'), { x, y, farge: '#d63' }]; }
        tegn(); oppdater();
      });
      tegn(); oppdater();
      return h('div', h('h2', 'Fargeprøve'),
        h('p.dempet', { style: { marginTop: '-6px' } }, 'Hold et hvitt A4-ark flatt mot veggen, i samme lys.'),
        steg, lerret, resultat);
    }, { vedLukk: () => resolve(svar) });
  });
}

/** Leser spannet med kameraet. Løser med det som ble funnet (se tolkEtikett), eller null. */
export async function lesSpannet() {
  if (!iApp) { toast('Lesing av spannet virker i Malerguiden-appen.'); return null; }
  const fil = await taBilde();
  if (!fil) return null;
  toast('Leser etiketten …', { ms: 1500 });
  let linjer;
  try { linjer = await lesTekstIBilde(fil); }
  catch (e) { toast(e.message || 'Klarte ikke lese bildet.'); return null; }
  const e = tolkEtikett(linjer, { kjentKode: (k) => !!finnFarge(k) });
  const tekst = etikettTekst(e);
  if (!tekst) { toast('Fant ikke noe på etiketten. Ta bildet nærmere og rett forfra.'); return null; }
  e.oppsummering = tekst;
  e.farge = e.kode ? finnFarge(e.kode) : null;
  return e;
}

/**
 * Velg farger å prøve på veggen. start: farger som er valgt fra før (f.eks. jobbens).
 * Løser med en liste { navn, hex }, eller null.
 */
export function velgFarger({ tittel = 'Prøv på veggen', start = [] } = {}) {
  return new Promise((resolve) => {
    let svar = null;
    ark((lukk) => {
      const valgt = new Map(start.filter((f) => f.hex).map((f) => [f.hex + f.navn, f]));
      const liste = h('div.valgliste');
      const valgtEl = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0 12px' } });
      const sok = h('input', { type: 'search', placeholder: 'Søk: kode eller navn, f.eks. 1453 eller grå', autocomplete: 'off', oninput: () => tegnListe() });
      const egen = h('input', { type: 'color', value: '#D9D2C5', style: { width: '52px', height: '44px', border: '0', background: 'none' } });
      const tegnValgt = () => {
        tom(valgtEl, [...valgt.values()].map((f) => h('button.merke', {
          type: 'button', style: { background: f.hex, color: tekstFarge(f.hex), display: 'inline-flex', gap: '6px', alignItems: 'center' },
          onclick: () => { valgt.delete(f.hex + f.navn); tegnValgt(); },
        }, f.navn, ikon('kryss'))));
        if (!valgt.size) valgtEl.append(h('span.dempet', 'Ingen farger valgt ennå.'));
      };
      const tegnListe = () => {
        tom(liste, sokFarger(sok.value).map((f) => h('button', {
          type: 'button', onclick: () => { if (valgt.size >= 6) { toast('Maks seks farger om gangen.'); return; } valgt.set(f.hex + fargeNavn(f), { navn: fargeNavn(f), hex: f.hex }); tegnValgt(); },
        }, prove(f.hex, 34), h('span', fargeNavn(f), h('small', f.hex)))));
        if (!FARGER.length) liste.append(h('p.dempet', 'Fargelista er tom. Velg en egen farge over.'));
      };
      tegnValgt(); tegnListe();
      return h('div', h('h2', tittel),
        h('p.dempet', { style: { marginTop: '-6px' } }, 'Velg opptil seks farger. I kameraet bytter du mellom dem og trykker på veggen som skal males.'),
        valgtEl,
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' } },
          egen, h('button.knapp.sekundar', { type: 'button', onclick: () => { valgt.set(egen.value + 'egen', { navn: 'Egen ' + egen.value.toUpperCase(), hex: egen.value.toUpperCase() }); tegnValgt(); } }, ikon('pluss'), 'Egen farge')),
        h('label.felt', h('span', 'Fargekart'), sok),
        liste,
        h('button.knapp.hel', { type: 'button', style: { position: 'sticky', bottom: '0', marginTop: '12px' }, onclick: () => { if (!valgt.size) { toast('Velg minst én farge.'); return; } svar = [...valgt.values()]; lukk(); } }, ikon('kamera'), 'Åpne kameraet'));
    }, { vedLukk: () => resolve(svar) });
  });
}

/** Åpner prøvemaling i kameraet (bare i appen). */
export async function proveMal(start = []) {
  if (!iApp) { toast('Prøvemaling i kameraet virker i Malerguiden-appen.'); return; }
  const farger = await velgFarger({ start });
  if (!farger) return;
  try { await kall('proveMal', { farger }); }
  catch (e) { toast(e.message || 'Kameraet kunne ikke startes.'); }
}

/** Jobbens farger som { navn, hex } der koden finnes i fargelista. */
export function jobbFarger(job) {
  return (job.farger || []).map((f) => {
    const kjent = finnFarge(f.kode);
    return kjent ? { navn: [f.rom, fargeNavn(kjent)].filter(Boolean).join(': '), hex: kjent.hex } : null;
  }).filter(Boolean);
}

export { finnFarge, fargeNavn, hexTilRgb };
