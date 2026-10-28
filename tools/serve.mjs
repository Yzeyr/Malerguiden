// Lokal server som etterligner GitHub Pages: appen ligger under /Malerguiden/.
//   node tools/serve.mjs   →   http://localhost:5175/Malerguiden/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rot = fileURLToPath(new URL('..', import.meta.url));
const typer = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT ?? 5175);
const PREFIKS = '/Malerguiden/';

createServer(async (req, res) => {
  const sti = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (sti === '/Forbrukskalkulator') { res.writeHead(302, { location: '/Forbrukskalkulator/' }).end(); return; }
  if (sti === '/' || sti === '/Malerguiden') { res.writeHead(302, { location: PREFIKS }).end(); return; }
  // Søsterappen Forbrukskalkulator ligger på samme nettsted på GitHub Pages (samme lagring),
  // og serveres her fra mappa ved siden av, hvis den finnes.
  const sos = '/Forbrukskalkulator/';
  const [prefiks, base] = sti.startsWith(sos) ? [sos, normalize(join(rot, '..', 'Forbrukskalkulator')) + sep] : [PREFIKS, rot];
  if (!sti.startsWith(prefiks)) { res.writeHead(404).end('Fant ikke fila'); return; }
  const rel = sti.slice(prefiks.length) || 'index.html';
  const fil = normalize(join(base, rel));
  if (!fil.startsWith(base)) { res.writeHead(403).end(); return; }
  try {
    const innhold = await readFile(fil);
    res.writeHead(200, { 'content-type': typer[extname(fil)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(innhold);
  } catch {
    res.writeHead(404).end('Fant ikke fila');
  }
}).listen(port, () => console.log(`Malerguiden på http://localhost:${port}${PREFIKS}`));
