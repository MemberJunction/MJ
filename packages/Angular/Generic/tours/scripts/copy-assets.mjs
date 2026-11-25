#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(HERE, '..');
const srcManifest = join(pkgRoot, 'src', 'core-anchor-manifest.json');
const distManifest = join(pkgRoot, 'dist', 'core-anchor-manifest.json');

mkdirSync(dirname(distManifest), { recursive: true });
copyFileSync(srcManifest, distManifest);
console.log(`[copy-assets] Copied core-anchor-manifest.json -> ${distManifest}`);
