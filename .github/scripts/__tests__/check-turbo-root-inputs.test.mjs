import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepo, findRootReads, readPackageTurbo, tokenize } from '../check-turbo-root-inputs.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-turbo-root-inputs.mjs');
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROOT_DIRS = new Set(['metadata', 'metadata-optional', 'migrations', 'scripts']);

/** A test file four levels below the root (packages/Pkg/src/__tests__) in a package two levels down. */
const reads = (source, { fileDepth = 4, packageDepth = 2 } = {}) =>
    [...findRootReads(source, { fileDepth, packageDepth, rootDirs: ROOT_DIRS })].sort();

describe('findRootReads', () => {
    it('reads a single climbing literal', () => {
        expect(reads(`const p = join(__dirname, '../../../../migrations/v5');`)).toEqual(['migrations']);
    });

    it('reads a new URL relative to import.meta.url', () => {
        expect(reads(`readFileSync(new URL('../../../../scripts/x.sql', import.meta.url))`)).toEqual(['scripts']);
    });

    it("reads a run of '..' arguments followed by a directory", () => {
        expect(reads(`join(__dirname, '..', '..', '..', '..', 'metadata-optional', 'cases')`)).toEqual(['metadata-optional']);
    });

    it('reads a root-bound variable joined with a literal, by argument or template', () => {
        const src = [
            `const REPO_ROOT = path.resolve(__dirname, '../../../../');`,
            `const a = path.join(REPO_ROOT, 'metadata/agents/.x.json');`,
            'const b = `${REPO_ROOT}/migrations/v6`;',
        ].join('\n');
        expect(reads(src)).toEqual(['metadata', 'migrations']);
    });

    it('measures a process.cwd() climb from the package directory', () => {
        const src = `const REPO = join(process.cwd(), '..', '..');\nconst f = join(REPO, 'migrations');`;
        expect(reads(src)).toEqual(['migrations']);
    });

    it('ignores climbs that stop inside the package tree or overshoot the repo root', () => {
        expect(reads(`join(__dirname, '../../../MJCore/src/x.ts')`)).toEqual([]);
        expect(reads(`join(__dirname, '../../../../../migrations/v5/x.sql')`)).toEqual([]);
    });

    it('ignores root directories it does not treat as data, and paths in comments', () => {
        expect(reads(`join(__dirname, '../../../../packages/MJCore')`)).toEqual([]);
        expect(reads(`// join(__dirname, '../../../../migrations')\n/* '../../../../metadata' */`)).toEqual([]);
    });

    it('does not treat a variable bound below the root as the root', () => {
        const src = `const PKG = resolve(__dirname, '../..');\nconst f = join(PKG, 'migrations');`;
        expect(reads(src)).toEqual([]);
    });
});

describe('tokenize', () => {
    it('keeps escaped quotes inside a string and drops comments', () => {
        expect(tokenize(`a('it\\'s') // 'gone'`)).toEqual([
            { type: 'code', value: 'a(' },
            { type: 'str', value: "it's" },
            { type: 'code', value: ') ' },
        ]);
    });
});

describe('checkRepo (fixture repository)', () => {
    let dir;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    /** A repo with one package whose test reads migrations/, and an optional turbo.json for it. */
    function fixture(turbo) {
        dir = mkdtempSync(join(tmpdir(), 'turbo-root-inputs-'));
        mkdirSync(join(dir, 'migrations'));
        const pkg = join(dir, 'packages', 'Pkg');
        mkdirSync(join(pkg, 'src', '__tests__'), { recursive: true });
        writeFileSync(join(pkg, 'package.json'), '{"name":"pkg"}');
        writeFileSync(
            join(pkg, 'src', '__tests__', 'guard.test.ts'),
            `const dir = join(__dirname, '..', '..', '..', '..', 'migrations');\n`,
        );
        if (turbo !== undefined) writeFileSync(join(pkg, 'turbo.json'), JSON.stringify(turbo));
        return dir;
    }
    const turbo = (inputs, ext = ['//']) => ({ extends: ext, tasks: { test: { inputs } } });

    it('flags a package with no turbo.json', () => {
        expect(checkRepo(fixture())).toEqual([
            { packageDir: join('packages', 'Pkg'), missing: [{ dir: 'migrations', files: [join('packages', 'Pkg', 'src', '__tests__', 'guard.test.ts')] }], dropsRootInputs: false },
        ]);
    });

    it('passes when the package declares the directory and keeps the root inputs', () => {
        expect(checkRepo(fixture(turbo(['$TURBO_EXTENDS$', '$TURBO_ROOT$/migrations/**'])))).toEqual([]);
    });

    it('accepts a narrower glob under the same directory', () => {
        expect(checkRepo(fixture(turbo(['$TURBO_EXTENDS$', '$TURBO_ROOT$/migrations/v5/*.sql'])))).toEqual([]);
    });

    it('flags inputs that drop the root task inputs', () => {
        const [problem] = checkRepo(fixture(turbo(['$TURBO_ROOT$/migrations/**'])));
        expect(problem.dropsRootInputs).toBe(true);
        expect(problem.missing).toEqual([]);
    });

    it('does not count a declaration in a turbo.json that does not extend the root', () => {
        const [problem] = checkRepo(fixture(turbo(['$TURBO_EXTENDS$', '$TURBO_ROOT$/migrations/**'], [])));
        expect(problem.missing.map((m) => m.dir)).toEqual(['migrations']);
    });

    it('exits 1 with the remediation, and 0 once declared', () => {
        const failing = spawnSync(process.execPath, [SCRIPT, fixture()], { encoding: 'utf8' });
        expect(failing.status).toBe(1);
        expect(failing.stdout).toContain('reads migrations/');
        rmSync(dir, { recursive: true, force: true });
        const passing = spawnSync(process.execPath, [SCRIPT, fixture(turbo(['$TURBO_EXTENDS$', '$TURBO_ROOT$/migrations/**']))], { encoding: 'utf8' });
        expect(passing.status).toBe(0);
    });
});

describe('readPackageTurbo', () => {
    it('returns null for a package without turbo.json', () => {
        expect(readPackageTurbo(tmpdir() + '/does-not-exist')).toBeNull();
    });
});

describe('this repository', () => {
    it('declares every repo-root read its tests make', () => {
        expect(checkRepo(REPO_ROOT)).toEqual([]);
    });
});
