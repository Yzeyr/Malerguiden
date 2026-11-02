/* Tørketid på jobben: start den når et strøk er ferdig, så viser jobben når neste kan tas,
   og iPhone-appen varsler når tiden er ute. */

import { h, toast, ark, ikon } from '../dom.js';
import { hentJobb, endreJobb } from '../jobs.js';
import { iApp, kall } from '../native.js';
import { uiLes, uiSkriv } from '../store.js';
import { TORK_PRODUKTER, TORK_BY_ID, torketid, gjettProdukt, klarTekst } from '../tork.js';
import { blokk, prisRad } from './blokk.js';

const varselId = (jobId) => 'tork-' + jobId;

/** «1 t 20 min» til tidspunktet. */
function igjenTekst(ms, na = Date.now()) {
  const min = Math.max(0, Math.round((ms - na) / 60000));
  if (min < 60) return min + ' min';
  const t = Math.floor(min / 60), m = min % 60;
  return t + ' t' + (m ? ' ' + m + ' min' : '');
}

/** Blokken på Arbeid-fanen. */
export function torkBlokk(j) {
  const t = j.tork;
  if (!t) {
    return blokk('Tørketid', '', prisRad({ tittel: 'Start tørketid', under: 'Når kan neste strøk tas?' + (iApp ? ' Telefonen sier fra.' : ''), klikk: () => torkArk(j.id) }));
  }
  const klar = t.klar <= Date.now();
  const fjern = h('button.ikonknapp', { type: 'button', 'aria-label': 'Fjern tørketiden', onclick: (e) => { e.stopPropagation(); stoppTork(j.id); } }, ikon('kryss'));
  return blokk('Tørketid', klar ? 'Klar' : 'Tørker',
    prisRad({
      tittel: klar ? 'Klar for neste strøk' : 'Neste strøk ' + klarTekst(t.klar),
      under: [t.tekst, klar ? 'Tørr siden ' + klarTekst(t.klar) : 'Om ' + igjenTekst(t.klar)],
      ekstra: fjern,
      klikk: () => torkArk(j.id),
    }));
}

function stoppTork(jobId) {
  endreJobb(jobId, (x) => { x.tork = null; });
  if (iApp) kall('avlysVarsel', { id: varselId(jobId) }).catch(() => {});
}

export function torkArk(jobId) {
  const j = hentJobb(jobId);
  if (!j) return;
  const fraJobben = j.farger.map((f) => gjettProdukt(f.produkt)).find(Boolean);
  const startId = fraJobben || uiLes('tork-produkt', 'lady-pure-color');
  const grupper = [...new Set(TORK_PRODUKTER.map((p) => p.gruppe))];
  const produkt = h('select', { 'aria-label': 'Produkt' },
    grupper.map((g) => h('optgroup', { label: g },
      TORK_PRODUKTER.filter((p) => p.gruppe === g).map((p) => h('option', { value: p.id, selected: p.id === startId }, p.navn)))));
  const c = h('input', { type: 'text', inputmode: 'decimal', value: uiLes('tork-c', '20'), autocomplete: 'off' });
  const rf = h('input', { type: 'text', inputmode: 'numeric', value: uiLes('tork-rf', '50'), autocomplete: 'off' });
  const svar = h('div.kort', { style: { padding: '12px 14px', margin: '4px 0 8px' } });
  const tall = (el, std) => { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : std; };
  const regn = () => torketid(produkt.value, { c: tall(c, 20), rf: Math.min(100, Math.max(0, tall(rf, 50))) });
  const vis = () => {
    const r = regn();
    if (!r) return;
    svar.replaceChildren(
      h('div.overtittel', 'Neste strøk tidligst'),
      h('b', { style: { display: 'block', fontFamily: 'var(--serif)', fontSize: '24px', margin: '2px 0' } }, klarTekst(r.klar)),
      h('div.dempet', 'Om ' + String(r.timer).replace('.', ',') + ' t' + (r.estimat ? ' · overslag for denne temperaturen' : ' · fra databladet')),
      r.advarsel && h('p', { style: { color: 'var(--rod)', margin: '8px 0 0', fontWeight: '650' } }, r.advarsel),
      r.merknad && h('p.dempet', { style: { margin: '8px 0 0' } }, r.merknad));
  };
  for (const el of [produkt, c, rf]) el.addEventListener('input', vis);
  vis();

  ark((lukk) => h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const r = regn();
      const p = TORK_BY_ID[produkt.value];
      if (!r || !p) return;
      uiSkriv('tork-produkt', p.id);
      uiSkriv('tork-c', c.value);
      uiSkriv('tork-rf', rf.value);
      endreJobb(jobId, (x) => { x.tork = { klar: r.klar, tekst: p.navn, start: Date.now() }; });
      lukk();
      let melding = 'Neste strøk ' + klarTekst(r.klar) + '.';
      if (iApp) {
        try {
          const s = await kall('varsle', { id: varselId(jobId), tid: r.klar, tittel: 'Klar for neste strøk', tekst: (j.kunde.navn ? j.kunde.navn + ': ' : '') + p.navn + ' er tørr nok til neste strøk.' });
          melding += s?.lov === false ? ' Slå på varsler for Malerguiden i Innstillinger for å få beskjed.' : ' Telefonen sier fra.';
        } catch { /* varselet er en bonus */ }
      }
      toast(melding, { ms: 4500 });
    },
  },
    h('h2', 'Tørketid'),
    h('p.dempet', { style: { marginTop: '-6px' } }, 'Start når strøket er ferdig. Tidene er fra Jotuns datablader ved 23 °C og 50 % luftfuktighet.'),
    h('label.felt', h('span', 'Produkt'), produkt),
    h('div', { style: { display: 'flex', gap: '10px' } },
      h('label.felt', { style: { flex: '1' } }, h('span', 'Temperatur (°C)'), c),
      h('label.felt', { style: { flex: '1' } }, h('span', 'Luftfuktighet (%)'), rf)),
    svar,
    h('div.knapprad',
      h('button.knapp.sekundar', { type: 'button', onclick: () => lukk() }, 'Avbryt'),
      h('button.knapp', { type: 'submit' }, 'Start'))));
}
