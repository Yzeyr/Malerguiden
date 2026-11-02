/* Arket der rapporten til kunden settes sammen og blir PDF (i appen) eller skrives ut (i Safari). */

import { h, toast, ark } from '../dom.js';
import { hentJobb } from '../jobs.js';
import { hentBilde } from '../photos.js';
import { rapportHtml } from '../rapport.js';
import { romMengder } from '../kalkyle.js';
import { planSvg } from './pris.js';
import { delTittel } from '../data/checklists.js';
import { KLASSER } from '../data/misc.js';
import { finnFarge } from '../data/farger.js';
import { iApp, kall } from '../native.js';
import { uiLes, uiSkriv } from '../store.js';
import { visDato, flertall } from '../util.js';

const MAKS_BILDER = 8;
const STANDARD_HILSEN = 'Takk for oppdraget! Her er en oversikt over arbeidet som er gjort.';

/** Et bilde fra telefonen, gjort mindre (lengste kant 1000 px), som data-URL. */
async function tilDataUrl(blob, maks = 1000) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maks / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL('image/jpeg', 0.72);
}

/** Utskrift i nettleseren: rapporten i en usynlig ramme, så utskriftsvinduet åpnes (lagre som PDF). */
function skrivUt(html) {
  const f = h('iframe', { title: 'Rapport', style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
  document.body.append(f);
  const d = f.contentDocument;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 500);
}

export function rapportArk(jobId) {
  const j = hentJobb(jobId);
  if (!j) return;
  const antall = (k) => j.bilder.filter((b) => b.kategori === k).length;
  const romMedPlan = (j.kalkyle?.rom || []).filter((r) => r.skannplan?.vegger?.length);
  const valg = {
    arbeid: true,
    farger: j.farger.length > 0,
    plan: romMedPlan.length > 0,
    for: antall('for') > 0,
    underveis: false,
    ferdig: antall('ferdig') > 0,
  };
  const valgRader = [
    ['arbeid', 'Arbeid og rom', 'Hva som er gjort, og veggene og taket i hvert rom'],
    ['farger', 'Farger', j.farger.length ? flertall(j.farger.length, 'farge', 'farger') + ' med kode og glans' : 'Ingen farger på jobben'],
    ['plan', 'Plantegning', romMedPlan.length ? flertall(romMedPlan.length, 'skannet rom', 'skannede rom') : 'Ingen skannede rom'],
    ['for', 'Bilder før', flertall(antall('for'), 'bilde', 'bilder')],
    ['underveis', 'Bilder underveis', flertall(antall('underveis'), 'bilde', 'bilder')],
    ['ferdig', 'Bilder ferdig', flertall(antall('ferdig'), 'bilde', 'bilder')],
  ];

  ark((lukk) => {
    const firma = h('input', { type: 'text', maxlength: 80, value: uiLes('rapport-firma', ''), placeholder: 'F.eks. Maler Hansen AS', autocomplete: 'organization' });
    const hilsen = h('textarea', { rows: 3, maxlength: 400 }, STANDARD_HILSEN);
    const knapp = h('button.knapp', { type: 'button' }, 'Lag PDF');
    knapp.onclick = async () => {
      knapp.disabled = true;
      knapp.textContent = 'Lager …';
      try {
        uiSkriv('rapport-firma', firma.value.trim());
        const html = await bygg(hentJobb(jobId), valg, { firma: firma.value.trim(), hilsen: hilsen.value.trim() });
        const navn = 'Rapport ' + (j.kunde.navn || 'jobb').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
        if (iApp) await kall('pdf', { html, navn });
        else skrivUt(html);
        lukk();
      } catch (e) {
        toast('Klarte ikke lage rapporten' + (e?.message ? ': ' + e.message : '.'));
        knapp.disabled = false;
        knapp.textContent = 'Lag PDF';
      }
    };
    return h('div',
      h('h2', 'Rapport til kunden'),
      h('p.dempet', { style: { marginTop: '-6px' } }, 'En PDF med det som er gjort, uten priser. Send den når jobben er ferdig.'),
      h('label.felt', h('span', 'Firma / utført av', h('small', 'valgfritt')), firma),
      h('label.felt', h('span', 'Hilsen'), hilsen),
      h('div.kort', { style: { padding: '2px 14px', marginBottom: '8px' } },
        valgRader.map(([id, navn, under]) => h('label.tallfelt',
          h('span', navn, h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, under)),
          h('input.bryter', { type: 'checkbox', checked: valg[id], onchange: (e) => { valg[id] = e.target.checked; } })))),
      h('div.knapprad',
        h('button.knapp.sekundar', { type: 'button', onclick: () => lukk() }, 'Avbryt'),
        knapp));
  });
}

async function bygg(j, valg, { firma, hilsen }) {
  const rom = (j.kalkyle?.rom || []).map((r) => {
    const m = romMengder(r);
    const med = r.med || {};
    return m.ok ? { navn: r.navn, vegg: med.vegg === false ? null : m.vegg, tak: med.tak === false ? null : m.tak } : { navn: r.navn };
  });
  const klasse = KLASSER.find((k) => k.id && k.id === j.klasse)?.label || '';
  const bilder = [];
  for (const [kat, tittel] of [['for', 'Før'], ['underveis', 'Underveis'], ['ferdig', 'Ferdig']]) {
    if (!valg[kat]) continue;
    const liste = [];
    for (const b of j.bilder.filter((x) => x.kategori === kat).sort((a, c) => a.tatt - c.tatt).slice(0, MAKS_BILDER)) {
      const blob = await hentBilde(b.id);
      if (blob) { try { liste.push(await tilDataUrl(blob)); } catch { /* hopp over bildet */ } }
    }
    bilder.push({ tittel: 'Bilder ' + tittel.toLowerCase(), liste });
  }
  const planer = valg.plan
    ? (j.kalkyle?.rom || []).filter((r) => r.skannplan?.vegger?.length).map((r) => {
      try { return { navn: r.navn, svg: planSvg(r.skannplan, { bredde: 520, hoyde: 320, mal: true }).outerHTML }; } catch { return null; }
    }).filter(Boolean)
    : [];
  return rapportHtml({
    tittel: 'Rapport',
    kunde: { navn: j.kunde.navn, adresse: j.kunde.adresse },
    dato: visDato(j.dato || new Date().toISOString().slice(0, 10)),
    firma, hilsen,
    arbeid: valg.arbeid ? j.deler.map((d) => delTittel(d).replace(/^[^\p{L}]+/u, '')) : [],
    klasse: valg.arbeid ? klasse : '',
    rom: valg.arbeid ? rom : [],
    farger: valg.farger ? j.farger.map((f) => ({ ...f, hex: finnFarge(f.kode)?.hex || '' })) : [],
    planer,
    bilder,
  });
}
