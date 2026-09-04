import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-mj-cli-resolution.mjs');

let tree;

/**
 * Build a throwaway repo: <tree>/package.json plus <tree>/packages/<name>/package.json each.
 * The guard also inspects the root manifest (join(packagesDir, '..')), so it must exist.
 */
function makeTree(packages, rootManifest = { name: 'root', scripts: {} }) {
    writeFileSync(join(tree, 'package.json'), JSON.stringify(rootManifest, null, 2));
    const packagesDir = join(tree, 'packages');
    mkdirSync(packagesDir, { recursive: true });
    for (const [name, manifest] of Object.entries(packages)) {
        const dir = join(packagesDir, name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }, null, 2));
    }
    return packagesDir;
}

const run = (packagesDir) => spawnSync(process.execPath, [SCRIPT, packagesDir], { encoding: 'utf8' });

beforeEach(() => {
    tree = mkdtempSync(join(tmpdir(), 'mj-cli-resolution-'));
});
afterEach(() => {
    rmSync(tree, { recursive: true, force: true });
});

describe('check-mj-cli-resolution', () => {
    it('fails a bare `mj` invocation in a package that does not declare the CLI', () => {
        const dir = makeTree({
            'server-bootstrap': {
                scripts: { prebuild: 'mj codegen manifest --output ./src/generated/m.ts' },
            },
        });
        const r = run(dir);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('server-bootstrap');
        expect(r.stderr).toContain('scripts.prebuild');
    });

    it('passes the explicit workspace entry point at any depth', () => {
        const dir = makeTree({
            shallow: { scripts: { prebuild: 'node ../../packages/MJCLI/bin/run.js codegen manifest' } },
            deep: { scripts: { prebuild: 'node ../../../../packages/MJCLI/bin/run.js codegen manifest' } },
        });
        const r = run(dir);
        expect(r.status).toBe(0);
    });

    it('allows bare `mj` when the package declares the CLI itself (its own .bin/mj exists)', () => {
        const withDev = makeTree({
            api: {
                scripts: { prestart: 'mj codegen manifest' },
                devDependencies: { '@memberjunction/cli': '6.1.0-edge.2' },
            },
        });
        expect(run(withDev).status).toBe(0);

        rmSync(tree, { recursive: true, force: true });
        tree = mkdtempSync(join(tmpdir(), 'mj-cli-resolution-'));
        const withDep = makeTree({
            api: {
                scripts: { prestart: 'mj codegen manifest' },
                dependencies: { '@memberjunction/cli': '6.1.0-edge.2' },
            },
        });
        expect(run(withDep).status).toBe(0);
    });

    it('does not flag the `mj codegen` text inside the || echo warning string', () => {
        // The real call sites pair the invocation with a message that quotes the command.
        // Flagging the prose would make the violation unfixable without reflowing text.
        const dir = makeTree({
            bootstrap: {
                scripts: {
                    prebuild:
                        "node ../../packages/MJCLI/bin/run.js codegen manifest || echo 'Warning: mj codegen manifest not available, using existing manifest'",
                },
            },
        });
        const r = run(dir);
        expect(r.status).toBe(0);
    });

    it('finds a bare `mj` hidden after a shell keyword, not just after a separator', () => {
        // ServerBootstrapLite's real shape: `if [ -d dist ]; then mj codegen ...; fi`.
        // A separator-anchored regex misses `then mj` — that false negative is why this
        // package went unnoticed through two review rounds.
        const dir = makeTree({
            'bootstrap-lite': {
                scripts: { prebuild: 'if [ -d dist ]; then mj codegen manifest --scan-dist; else touch .x; fi' },
            },
        });
        expect(run(dir).status).toBe(1);
    });

    it('flags a bare `mj` in a subshell inside postbuild', () => {
        const dir = makeTree({
            'bootstrap-lite': {
                scripts: { postbuild: 'if [ -f .x ]; then rm .x && (mj codegen manifest && tsc); fi' },
            },
        });
        expect(run(dir).status).toBe(1);
    });

    it('does not treat `mj:`-prefixed script names or npm-run references as invocations', () => {
        const dir = makeTree(
            { plain: { scripts: { build: 'tsc' } } },
            {
                name: 'root',
                scripts: {
                    mj: 'node packages/MJCLI/bin/run.js',
                    'mj:migrate': 'node packages/MJCLI/bin/run.js migrate',
                    'mj:manifest': 'pnpm run mj:manifest:api && pnpm run mj:manifest:explorer',
                },
            },
        );
        expect(run(dir).status).toBe(0);
    });

    it('inspects the ROOT manifest too — it is the one that lost the bin', () => {
        const dir = makeTree(
            { plain: { scripts: { build: 'tsc' } } },
            { name: 'root', scripts: { 'mj:manifest': 'mj codegen manifest' } },
        );
        const r = run(dir);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('scripts.mj:manifest');
    });

    it('exits 2 (misconfiguration, not a violation) on a bad or missing argument', () => {
        expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(2);

        const empty = join(tree, 'empty');
        mkdirSync(empty, { recursive: true });
        expect(run(empty).status).toBe(2);
    });

    it('exits 2 when the root manifest is absent rather than silently skipping it', () => {
        const packagesDir = join(tree, 'packages', 'p');
        mkdirSync(packagesDir, { recursive: true });
        writeFileSync(join(packagesDir, 'package.json'), JSON.stringify({ name: 'p', scripts: {} }));
        // No <tree>/package.json written.
        const r = run(join(tree, 'packages'));
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('root package.json');
    });
});
