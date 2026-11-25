import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = resolve(here, '..');
const port = Number(process.env.PORT || 4310);

// The gate page plays the host, and a host loads its own fonts: the element bundle ships none.
// Montserrat (MJ's default UI font) is served from the installed package rather than Google Fonts,
// so the strict CSP needs no third-party origin and the screenshot baselines render the real font
// on every machine instead of whatever system font each one falls back to.
const require = createRequire(import.meta.url);
const montserratFilesDir = resolve(
  dirname(require.resolve('@fontsource-variable/montserrat/package.json')),
  'files'
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Maps a request path to a file on disk and the directory it must stay inside. */
function resolveTarget(urlPath) {
  if (urlPath.startsWith('/fonts/')) {
    return { target: resolve(montserratFilesDir, basename(urlPath)), root: montserratFilesDir };
  }
  const rel = urlPath === '/' ? 'sample/index.html' : urlPath.replace(/^\/+/, '');
  const target = resolve(
    packageRoot,
    rel.startsWith('dist/') || rel.startsWith('sample/') ? rel : join('sample', rel)
  );
  return { target, root: packageRoot };
}

const server = createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const { target, root } = resolveTarget(urlPath);

  if (!target.startsWith(root + sep)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let rawBuffer;
  try {
    rawBuffer = readFileSync(target);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(target);
  if (ext === '.html') {
    const nonce = randomBytes(16).toString('base64');
    const html = rawBuffer.toString('utf8').replaceAll('__CSP_NONCE__', () => nonce);
    res.writeHead(200, {
      'Content-Type': MIME['.html'],
      'Content-Security-Policy':
        `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}';`,
    });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(rawBuffer);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Prototype gate server listening at http://127.0.0.1:${port}`);
});
