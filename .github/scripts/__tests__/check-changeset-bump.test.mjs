/**
 * Behaviour matrix for the changeset bump-level gate.
 *
 * Each case builds a throwaway git repo with a real `next` branch and a real feature branch, so
 * the merge-base and `--diff-filter=A` logic is exercised rather than mocked — that logic is the
 * whole reason the gate can be turned on without failing the pending changesets other branches
 * have already contributed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-changeset-bump.mjs');
let repo;

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

function write(relPath, contents) {
    const full = join(repo, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
}

function changeset(pkgLevels) {
    const body = Object.entries(pkgLevels)
        .map(([pkg, level]) => `"${pkg}": ${level}`)
        .join('\n');
    return `---\n${body}\n---\n\nSummary.\n`;
}

/** Runs the gate on a fresh branch built by `build`, returning its exit code and output. */
function runOnBranch(name, build) {
    git('checkout', '-q', 'next');
    git('checkout', '-q', '-b', name);
    build();
    git('add', '-A');
    git('commit', '-q', '-m', name);
    try {
        const stdout = execFileSync('node', [SCRIPT, '--base', 'next'], { cwd: repo, encoding: 'utf8' });
        return { code: 0, output: stdout };
    } catch (error) {
        return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'changeset-gate-'));
    git('init', '-q', '-b', 'next');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    write('.changeset/config.json', '{}');
    write('packages/Foo/keep.ts', 'export const keep = 1;\n');
    write('metadata/keep.json', '{}');
    write('migrations/v6/keep.sql', 'GO\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
});

afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('check-changeset-bump', () => {
    it('rejects minor when the branch changes neither migration nor metadata', () => {
        const { code, output } = runOnBranch('ts-minor', () => {
            write('packages/Foo/a.ts', 'export const a = 1;\n');
            write('.changeset/a.md', changeset({ '@memberjunction/foo': 'minor' }));
        });
        expect(code).toBe(1);
        expect(output).toContain('no migration and no metadata');
    });

    it('allows minor when the branch changes metadata (it becomes a migration at release)', () => {
        const { code } = runOnBranch('metadata-minor', () => {
            write('metadata/thing.json', '{"a":1}');
            write('.changeset/b.md', changeset({ '@memberjunction/foo': 'minor' }));
        });
        expect(code).toBe(0);
    });

    it('allows minor when the branch adds a migration', () => {
        const { code } = runOnBranch('migration-minor', () => {
            write('migrations/v6/V202601011200__v6.1.x__Thing.sql', 'GO\n');
            write('.changeset/c.md', changeset({ '@memberjunction/core': 'minor' }));
        });
        expect(code).toBe(0);
    });

    /**
     * Repeatable migrations live directly under `migrations/`, not in a version folder, and Flyway
     * re-runs them on EVERY deploy — so a branch editing one is changing the database by any
     * reading of the rule. Missing them is worse than a gap: with the mirror check below, an author
     * who correctly reaches for `minor` on such a branch gets rejected.
     */
    it('allows minor when the branch edits a REPEATABLE migration', () => {
        const { code } = runOnBranch('repeatable-minor', () => {
            write('migrations/R__RefreshMetadata.sql', '-- refreshed\n');
            write('.changeset/l.md', changeset({ '@memberjunction/core': 'minor' }));
        });
        expect(code).toBe(0);
    });

    it('requires minor when the branch edits a REPEATABLE migration', () => {
        const { code, output } = runOnBranch('repeatable-patch', () => {
            write('migrations/R__RefreshMetadata.sql', '-- refreshed again\n');
            write('.changeset/m.md', changeset({ '@memberjunction/core': 'patch' }));
        });
        expect(code).toBe(1);
        expect(output).toContain('repeatable migration');
    });

    it('allows patch on a code-only branch', () => {
        const { code } = runOnBranch('ts-patch', () => {
            write('packages/Foo/d.ts', 'export const d = 1;\n');
            write('.changeset/d.md', changeset({ '@memberjunction/foo': 'patch' }));
        });
        expect(code).toBe(0);
    });

    it('rejects major even when the branch changes metadata', () => {
        const { code, output } = runOnBranch('major', () => {
            write('metadata/thing.json', '{"b":2}');
            write('.changeset/e.md', changeset({ '@memberjunction/foo': 'major' }));
        });
        expect(code).toBe(1);
        expect(output).toContain('never use without explicit approval');
    });

    it('rejects a mixed changeset where only one entry is wrong', () => {
        const { code, output } = runOnBranch('mixed', () => {
            write('packages/Foo/f.ts', 'export const f = 1;\n');
            write('.changeset/f.md', changeset({ '@memberjunction/foo': 'patch', '@memberjunction/bar': 'minor' }));
        });
        expect(code).toBe(1);
        expect(output).toContain('@memberjunction/bar');
    });

    /**
     * The mirror of the first case, and the more damaging direction. Over-bumping costs a version
     * number; UNDER-bumping ships a real database change below the level the release train expects,
     * and it only bites when no other changeset in the release happens to be `minor` — so it fails
     * rarely and unpredictably.
     */
    it('rejects an all-patch changeset on a branch that adds a migration', () => {
        const { code, output } = runOnBranch('migration-patch', () => {
            write('migrations/v6/V202601011300__v6.1.x__Other.sql', 'GO\n');
            write('.changeset/i.md', changeset({ '@memberjunction/foo': 'patch' }));
        });
        expect(code).toBe(1);
        expect(output).toContain('migration');
    });

    it('rejects an all-patch changeset on a branch that changes metadata', () => {
        const { code } = runOnBranch('metadata-patch', () => {
            write('metadata/other.json', '{"c":3}');
            write('.changeset/j.md', changeset({ '@memberjunction/foo': 'patch' }));
        });
        expect(code).toBe(1);
    });

    it('accepts a mixed changeset on a DB branch as long as SOMETHING carries the minor', () => {
        // The release train only needs the highest bump to be right; every package in a `fixed`
        // group moves together anyway, so demanding minor on every entry would be noise.
        const { code } = runOnBranch('metadata-mixed', () => {
            write('metadata/other.json', '{"d":4}');
            write('.changeset/k.md', changeset({ '@memberjunction/foo': 'minor', '@memberjunction/bar': 'patch' }));
        });
        expect(code).toBe(0);
    });

    it('passes when the branch adds no changeset at all', () => {
        const { code } = runOnBranch('no-changeset', () => {
            write('packages/Foo/g.ts', 'export const g = 1;\n');
        });
        expect(code).toBe(0);
    });

    /**
     * DELIBERATE GAP, pinned so it is a decision rather than an oversight. A branch that changes the
     * database and adds NO changeset passes: this guard judges the LEVEL of the changesets a branch
     * declares, and has nothing to judge when there are none.
     *
     * "Should a DB branch be required to declare a changeset at all?" is a real question and
     * arguably the more severe case — no bump is worse than an under-bump. It is a different rule
     * though ("changesets are mandatory for X"), enforced at a different point, and folding it in
     * here would make a bump-LEVEL guard quietly also a changeset-PRESENCE guard.
     */
    it('does NOT require a DB branch to add a changeset (out of scope for a bump-LEVEL guard)', () => {
        const { code, output } = runOnBranch('db-no-changeset', () => {
            write('migrations/v6/V202601011400__v6.1.x__Unaccompanied.sql', 'GO\n');
        });
        expect(code).toBe(0);
        expect(output).toContain('nothing to check');
    });

    it('ignores pending changesets contributed by OTHER branches', () => {
        // The guarantee that lets this gate be switched on without a repo-wide cleanup: a file
        // already on `next` carries no evidence of what its own branch touched, so judging it here
        // would fail a PR for a decision made somewhere else.
        git('checkout', '-q', 'next');
        write('.changeset/someone-else.md', changeset({ '@memberjunction/other': 'minor' }));
        git('add', '-A');
        git('commit', '-q', '-m', 'other branch changeset');

        const { code } = runOnBranch('after-other', () => {
            write('packages/Foo/h.ts', 'export const h = 1;\n');
            write('.changeset/h.md', changeset({ '@memberjunction/foo': 'patch' }));
        });
        expect(code).toBe(0);
    });

    it('fails loudly on an unresolvable base ref', () => {
        let code = 0;
        try {
            execFileSync('node', [SCRIPT, '--base', 'origin/does-not-exist'], { cwd: repo, encoding: 'utf8' });
        } catch (error) {
            code = error.status;
        }
        expect(code).toBe(2);
    });
});
