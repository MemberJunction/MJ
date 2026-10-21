// loom.mjs — the one import of the Loom engine for every generator (pinned by fixtures/loom.json).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sha } = JSON.parse(readFileSync(path.join(root, 'fixtures', 'loom.json'), 'utf8'));
const loomDir = process.env.TRUTH_LOOM_DIR || path.join(root, '.loom', sha);
const entry = path.join(loomDir, 'packages', 'engine', 'dist', 'index.js');
if (!existsSync(entry)) {
  throw new Error(`Loom engine not built at ${entry}. Run: pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:loom`);
}
export const LOOM_SHA = sha;
// Dynamic import, allowed case 5 of .claude/rules/typescript-style.md ("runtime discovery from config"): the module's
// path is the pinned Loom checkout named in fixtures/loom.json, known only at run time. Loom is deliberately not a
// pnpm dependency of MJ (its workspace lockfile and `workspace:*` contracts cannot resolve in MJ's), so no
// static import or package.json entry can name it. One top-of-module load; every generator imports `engine` from here.
export const engine = await import(pathToFileURL(entry).href);
