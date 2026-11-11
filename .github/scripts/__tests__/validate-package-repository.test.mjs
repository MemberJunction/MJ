import { describe, it, expect, afterAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'validate-package-repository.sh');
const EXPECTED_URL = 'https://github.com/MemberJunction/MJ';

const tempRoots = [];
afterAll(() => {
    for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

/**
 * Build a throwaway monorepo root containing a packages/ tree, since the script
 * hardcodes `find packages ...` relative to its cwd. Each entry becomes
 * <root>/packages/<dir>/package.json with the given manifest.
 */
function makeTree(entries) {
    const root = mkdtempSync(join(tmpdir(), 'validate-repo-gate-'));
    tempRoots.push(root);
    for (const [dir, manifest] of Object.entries(entries)) {
        const pkgDir = join(root, 'packages', dir);
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(manifest, null, 4));
    }
    return root;
}

/** Run the real gate script with cwd=root. Never throws; returns {code, stdout}. */
async function runGate(root) {
    try {
        const { stdout } = await execFileAsync('bash', [SCRIPT], { cwd: root });
        return { code: 0, stdout };
    } catch (err) {
        return { code: err.code ?? 1, stdout: err.stdout ?? '' };
    }
}

const publicOk = { name: '@memberjunction/public-ok', version: '1.0.0', repository: { type: 'git', url: EXPECTED_URL } };

describe('validate-package-repository.sh', () => {
    it('passes when every publishable package has the expected repository.url', async () => {
        const { code, stdout } = await runGate(makeTree({ a: publicOk }));
        expect(code).toBe(0);
        expect(stdout).toContain('All publishable @memberjunction packages have valid repository.url');
    });

    it('fails a public package with a missing repository.url', async () => {
        // The error line cites the file PATH (for the ::error file= annotation), not the
        // package name — so the fixture dir is named after the package to assert on it.
        const { code, stdout } = await runGate(makeTree({
            'public-ok': publicOk,
            'public-missing': { name: '@memberjunction/public-missing', version: '1.0.0' },
        }));
        expect(code).toBe(1);
        expect(stdout).toContain('Missing repository.url');
        expect(stdout).toContain('packages/public-missing/package.json');
    });

    it('fails a public package with a wrong repository.url', async () => {
        const { code, stdout } = await runGate(makeTree({
            a: { name: '@memberjunction/public-wrong', version: '1.0.0', repository: { type: 'git', url: 'https://github.com/Wrong/Repo' } },
        }));
        expect(code).toBe(1);
        expect(stdout).toContain('Invalid repository.url');
    });

    it('skips a private package with no repository.url (the fix)', async () => {
        const { code, stdout } = await runGate(makeTree({
            a: publicOk,
            b: { name: '@memberjunction/private-no-repo', version: '1.0.0', private: true },
        }));
        expect(code).toBe(0);
        expect(stdout).toContain('@memberjunction/private-no-repo - private, never published');
        expect(stdout).toContain('(1 private package(s) skipped - never published)');
    });

    it('skips a private package even with a wrong repository.url (provenance is inert for it)', async () => {
        const { code } = await runGate(makeTree({
            a: { name: '@memberjunction/private-wrong-repo', version: '1.0.0', private: true, repository: { type: 'git', url: 'https://github.com/Wrong/Repo' } },
        }));
        expect(code).toBe(0);
    });

    it('still checks a package with private: false', async () => {
        const { code, stdout } = await runGate(makeTree({
            a: { name: '@memberjunction/explicitly-public', version: '1.0.0', private: false },
        }));
        expect(code).toBe(1);
        expect(stdout).toContain('Missing repository.url');
    });

    it('treats string "true" as private, matching changesets JS truthiness of pkg.private', async () => {
        const { code, stdout } = await runGate(makeTree({
            a: { name: '@memberjunction/private-string', version: '1.0.0', private: 'true' },
        }));
        expect(code).toBe(0);
        expect(stdout).toContain('private, never published');
    });

    it('is not blunted: private skip and public failure coexist in one run', async () => {
        const { code, stdout } = await runGate(makeTree({
            'private-no-repo': { name: '@memberjunction/private-no-repo', version: '1.0.0', private: true },
            'public-missing': { name: '@memberjunction/public-missing', version: '1.0.0' },
        }));
        expect(code).toBe(1);
        expect(stdout).toContain('@memberjunction/private-no-repo - private, never published');
        expect(stdout).toContain('Missing repository.url');
        expect(stdout).toContain('packages/public-missing/package.json');
    });

    it('ignores non-@memberjunction packages entirely (pre-existing scope filter)', async () => {
        const { code } = await runGate(makeTree({
            a: { name: 'mj_something', version: '1.0.0' },
        }));
        expect(code).toBe(0);
    });
});
