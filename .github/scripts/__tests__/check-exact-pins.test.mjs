import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'check-exact-pins.mjs');
const REPO_ROOT = resolve(HERE, '..', '..', '..');

describe('check-exact-pins against this repo', () => {
    it('every @foblex/* dependency is an exact version that matches pnpm-lock.yaml', () => {
        const run = spawnSync(process.execPath, [SCRIPT, '--root', REPO_ROOT], { encoding: 'utf8' });
        expect(run.stdout + run.stderr).not.toMatch(/\^|~/);
        expect(run.status).toBe(0);
    });
});
