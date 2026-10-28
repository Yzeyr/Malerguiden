/* Jobblista — startsiden. Øverst det som skal med i bilen, så jobbene
   gruppert etter når og hvor langt de er kommet. */

import { h, ikon, toast, fyll } from '../dom.js';
import { langDato, dagerTil, flertall } from '../util.js';
import { alleJobber, endreJobb, taMedOversikt, vedEndring, jobbNavn } from '../jobs.js';
import { alleNotater } from '../egne.js';
import { dagerSidenKopi } from '../backup.js';
import { gaTil } from '../nav.js';
import { uiLes, uiSkriv } from '../store.js';
import { topp, palett, jobbkort, nyJobbArk } from './felles.js';

export function visJobber(rot) {
  const side = h('div.visning');
  const fab = h('button.fab', { type: 'button', onclick: () => nyJobbArk() }, ikon('pluss'), 'Ny jobb');
  rot.append(side, fab);

  const tegn = () => {
    side.textContent = '';
    side.append(
      topp(langDato(), 'Jobber', h('a.rund', { href: '#oppslag/sok', 'aria-label': 'Søk' }, ikon('sok'))),
      palett(),
    );
    const jobber = alleJobber();

    // Påminnelse om sikkerhetskopi: på startsiden, der den faktisk blir sett.
    const dager = dagerSidenKopi();
    if ((jobber.length || alleNotater().length) && (dager == null || dager >= 7)) {
      side.append(h('button.kopistripe', { type: 'button', onclick: () => gaTil('mitt/kopi') },
        ikon('skjold'),
        h('span', dager == null ? 'Ingen sikkerhetskopi ennå' : 'Kopien er ' + dager + ' dager gammel'),
        h('b', 'Ta kopi'), ikon('pil')));
    }

    if (!jobber.length) {
      side.append(h('div.tom', h('b', 'Ingen jobber ennå'), 'Trykk «Ny jobb» nede til høyre for å lage den første.'));
      return;
    }

    fyll(side, taMedBoks());

    const aktive = jobber.filter((j) => j.status !== 'ferdig').sort((a, b) => b.updated - a.updated);
    const iDag = aktive.filter((j) => j.dato && dagerTil(j.dato) <= 0).sort((a, b) => a.dato.localeCompare(b.dato));
    const resten = aktive.filter((j) => !iDag.includes(j));
    const grupper = [
      ['I dag', iDag],
      ['Pågår', resten.filter((j) => j.status === 'pagar')],
      ['Planlagt', resten.filter((j) => j.status === 'planlagt').sort((a, b) => (a.dato || '9').localeCompare(b.dato || '9') || b.updated - a.updated)],
      ['Pauset', resten.filter((j) => j.status === 'pauset')],
    ];
    for (const [tittel, liste] of grupper) {
      if (!liste.length) continue;
      side.append(h('div.seksjon', tittel, h('span.tall', String(liste.length))), ...liste.map(jobbkort));
    }
    if (!aktive.length) side.append(h('div.tom', h('b', 'Alt er ferdig'), 'Ingen aktive jobber akkurat nå.'));

    const ferdige = jobber.filter((j) => j.status === 'ferdig').sort((a, b) => b.updated - a.updated);
    if (ferdige.length) {
      const apen = uiLes('ferdige') === '1';
      side.append(h('button.knapp.sekundar.vis-flere', {
        type: 'button', style: { marginTop: '14px' },
        onclick: () => { uiSkriv('ferdige', apen ? '0' : '1'); tegn(); },
      }, apen ? 'Skjul ferdige jobber' : 'Vis ' + flertall(ferdige.length, 'ferdig jobb', 'ferdige jobber')));
      if (apen) side.append(h('div.seksjon', 'Ferdige'), ...ferdige.map(jobbkort));
    }
  };

  tegn();
  return vedEndring(tegn);
}

/** «Ta med i bilen»: det som ikke er huket av på aktive jobber. Bare når det finnes noe. */
function taMedBoks(tegn) {
  const liste = taMedOversikt();
  if (!liste.length) return null;
  const antall = liste.reduce((s, x) => s + x.ting.length, 0);
  const flere = liste.length > 1;
  return h('section.idag', { 'aria-label': 'Ta med' },
    h('div.overtittel', flertall(antall, 'ting', 'ting') + (flere ? ' fra ' + liste.length + ' jobber' : '')),
    h('h2', ikon('bil'), ' Ta med i bilen'),
    h('ul', liste.flatMap(({ job, ting }) => ting.map((u) => h('li',
      h('button.boks', {
        type: 'button', 'aria-label': 'Huk av ' + u.tekst,
        onclick: () => {
          endreJobb(job.id, (j) => { const x = j.utstyr.find((y) => y.id === u.id); if (x) x.checked = true; });
          toast('«' + u.tekst + '» er huket av', { angre: () => endreJobb(job.id, (j) => { const x = j.utstyr.find((y) => y.id === u.id); if (x) x.checked = false; }) });
        },
      }, ikon('hake')),
      h('span', u.tekst),
      flere && h('small', jobbNavn(job)),
    )))));
}
