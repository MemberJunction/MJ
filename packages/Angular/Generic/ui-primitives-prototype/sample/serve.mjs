import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = resolve(here, '..');
const port = Number(process.env.PORT || 4310);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const rel = urlPath === '/' ? 'sample/index.html' : urlPath.replace(/^\/+/, '');
  const target = resolve(
    packageRoot,
    rel.startsWith('dist/') || rel.startsWith('sample/') ? rel : join('sample', rel)
  );

  if (!target.startsWith(packageRoot + sep)) {
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
        `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}' 'unsafe-hashes'; style-src-attr 'unsafe-inline';`,
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
