// A's backward-compat question: does adding the TypeScript preset change how today's JSX components compile?
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const Babel = createRequire(import.meta.url)('babel7');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
const files = walk('shipped');
let same = 0, differ = [], failJsx = [], failTsx = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8'); let a, b;
  try { a = Babel.transform(src, { filename: 'c.jsx', presets: ['react'] }).code; } catch (e) { failJsx.push([f, e.message.split('\n')[0]]); continue; }
  try { b = Babel.transform(src, { filename: 'c.tsx', presets: [['typescript', { isTSX: true, allExtensions: true }], 'react'] }).code; } catch (e) { failTsx.push([f, e.message.split('\n')[0]]); continue; }
  a === b ? same++ : differ.push(f);
}
console.log(`files: ${files.length} | identical output with TS preset: ${same} | differ: ${differ.length} | fail today (jsx): ${failJsx.length} | fail only with TS preset: ${failTsx.length}`);
for (const [f, m] of [...failTsx, ...failJsx].slice(0, 6)) console.log('  ', f.replace('shipped/metadata/components/code/', ''), '→', m.slice(0, 140));
for (const f of differ.slice(0, 4)) console.log('   differs:', f.replace('shipped/metadata/components/code/', ''));
