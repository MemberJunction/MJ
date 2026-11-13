#!/usr/bin/env node
// fetch-loom.mjs — check out the pinned Loom commit into .loom/<sha> and build its engine (idempotent).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { repo, sha } = JSON.parse(readFileSync(path.join(root, 'fixtures', 'loom.json'), 'utf8'));
const dir = process.env.TRUTH_LOOM_DIR || path.join(root, '.loom', sha);
const stripSources = () => {
  const pkgsDir = path.join(dir, 'packages');
  if (!existsSync(pkgsDir)) return;
  for (const pkg of readdirSync(pkgsDir)) {
    rmSync(path.join(pkgsDir, pkg, 'src'), { recursive: true, force: true });
  }
};
const sh = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`failed: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1); }
};
if (existsSync(path.join(dir, '.built'))) {
  stripSources();
  console.log(`Loom ${sha.slice(0, 10)} already built at ${dir}`);
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
if (!existsSync(path.join(dir, '.git'))) {
  sh('git', ['init', '-q'], dir);
  sh('git', ['remote', 'add', 'origin', repo], dir);
}
sh('git', ['fetch', '-q', '--depth', '1', 'origin', sha], dir);
sh('git', ['checkout', '-q', '--detach', sha], dir);
sh('pnpm', ['install', '--frozen-lockfile'], dir);
sh('pnpm', ['--filter', '@memberjunction/loom-contracts', '--filter', '@memberjunction/loom-engine', 'run', 'build'], dir);
stripSources();
writeFileSync(path.join(dir, '.built'), `${sha}\n`);
console.log(`Loom ${sha.slice(0, 10)} built at ${dir}`);
