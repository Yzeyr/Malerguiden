// Setter VERSJON i sw.js til en hash av alle appfilene, og sjekker at
// FILER-lista i sw.js stemmer med filene på disken.
//   node tools/versjon.mjs          oppdaterer sw.js
//   node tools/versjon.mjs --sjekk  feiler hvis sw.js ikke er oppdatert (brukes i publiseringen)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rot = fileURLToPath(new URL('..', import.meta.url));
const swSti = join(rot, 'sw.js');
const sw = readFileSync(swSti, 'utf8');

function alle(mappe) {
  return readdirSync(join(rot, mappe)).flatMap((n) => {
    const sti = join(mappe, n);
    return statSync(join(rot, sti)).isDirectory() ? alle(sti) : [sti];
  });
}

const paaDisk = ['index.html', 'app.css', 'manifest.webmanifest', ...alle('icons'), ...alle('src')]
  .map((s) => s.split('\\').join('/'))
  .filter((s) => !s.endsWith('.md'))
  .sort();
const iSw = [...sw.matchAll(/^\s*'\.\/([^']*)',?$/gm)].map((m) => m[1]).filter(Boolean).sort();

const mangler = paaDisk.filter((f) => !iSw.includes(f));
const ekstra = iSw.filter((f) => !paaDisk.includes(f));
if (mangler.length || ekstra.length) {
  if (mangler.length) console.error('Mangler i FILER i sw.js:', mangler.join(', '));
  if (ekstra.length) console.error('Finnes ikke på disken:', ekstra.join(', '));
  process.exit(1);
}

const hash = createHash('sha256');
// Tekstfiler hashes med LF, så Windows (CRLF) og GitHub (LF) gir samme versjon.
for (const f of paaDisk) {
  const innhold = readFileSync(join(rot, f));
  hash.update(f).update(/\.(png|jpe?g|ico)$/.test(f) ? innhold : innhold.toString('utf8').replace(/\r\n/g, '\n'));
}
const versjon = 'malerguiden-' + hash.digest('hex').slice(0, 8);
const naa = sw.match(/const VERSJON = '([^']+)'/)?.[1];

if (process.argv.includes('--sjekk')) {
  if (naa !== versjon) { console.error(`sw.js har ${naa}, men filene gir ${versjon}. Kjør: node tools/versjon.mjs`); process.exit(1); }
  console.log('sw.js er oppdatert:', versjon);
} else if (naa === versjon) {
  console.log('Uendret:', versjon);
} else {
  writeFileSync(swSti, sw.replace(/const VERSJON = '[^']+'/, `const VERSJON = '${versjon}'`));
  console.log(`${naa} → ${versjon}`);
}
void relative;
