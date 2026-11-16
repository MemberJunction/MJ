import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
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
  const target = resolve(packageRoot, rel.startsWith('dist/') || rel.startsWith('sample/') ? rel : join('sample', rel));

  if (!target.startsWith(packageRoot) || !existsSync(target)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(target);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(target));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Prototype gate server listening at http://127.0.0.1:${port}`);
});
