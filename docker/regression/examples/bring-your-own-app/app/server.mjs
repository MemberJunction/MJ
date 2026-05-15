import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Angular 17 application builder emits to dist/<project>/browser
const candidates = [
  join(__dirname, 'dist', 'byo-app', 'browser'),
  join(__dirname, 'dist', 'byo-app'),
];
const distDir = candidates.find(p => existsSync(p));

if (!distDir) {
  console.error('[byo-app] FATAL: no Angular build output found. Run "npm run build" first.');
  process.exit(1);
}

const app = express();

app.get('/api/healthcheck', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use(express.static(distDir));

// SPA fallback — any GET that wasn't a static file goes to index.html
app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[byo-app] listening on http://0.0.0.0:${PORT} (serving ${distDir})`);
});
