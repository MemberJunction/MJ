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

    /**
     * On a CERTIFIED LINE the rule inverts. `plans/lts-process.md` §12: on a line everything is a
     * patch — metadata migrations, CodeGen repairs, and even schema migrations under a security
     * exception. The migration-⇒-minor rule is Edge-tuple grammar (§3.1) and does not reach here.
     *
     * Before this, the Edge rule was applied universally, so a canon-correct cert-fix backport
     * carrying a migration and a `patch` was REJECTED — the gate demanding a level the release
     * process forbids, on the highest-stakes branch in the repo.
     */
    describe('on a certified LTS line', () => {
        /** Builds a line branch off `next` and a topic branch on top of it. */
        function runOnLine(name, build, { base = 'lts/6.1', explicitBase = true } = {}) {
            git('checkout', '-q', 'next');
            try {
                git('checkout', '-q', 'lts/6.1');
            } catch {
                git('checkout', '-q', '-b', 'lts/6.1');
                git('commit', '-q', '--allow-empty', '-m', 'line 6.1 certified');
                // A remote-tracking ref as well: a real clone discovers lines as origin/lts/*, and
                // detection reads both.
                git('update-ref', 'refs/remotes/origin/lts/6.1', 'HEAD');
            }
            git('checkout', '-q', '-b', name);
            build();
            git('add', '-A');
            git('commit', '-q', '-m', name);
            const args = explicitBase ? [SCRIPT, '--base', base] : [SCRIPT];
            try {
                return { code: 0, output: execFileSync('node', args, { cwd: repo, encoding: 'utf8' }) };
            } catch (error) {
                return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
            }
        }

        it('ACCEPTS a migration backport declared patch (the case that used to be rejected)', () => {
            const { code, output } = runOnLine('certfix-patch', () => {
                write('migrations/v6/V202601011500__v6.1.x__SecurityFix.sql', 'GO\n');
                write('.changeset/certfix.md', changeset({ '@memberjunction/core': 'patch' }));
            });
            expect(code).toBe(0);
            expect(output).toContain('certified line');
        });

        it('REJECTS a minor on a line, even with a migration', () => {
            const { code, output } = runOnLine('certfix-minor', () => {
                write('migrations/v6/V202601011600__v6.1.x__Other.sql', 'GO\n');
                write('.changeset/certfix2.md', changeset({ '@memberjunction/core': 'minor' }));
            });
            expect(code).toBe(1);
            expect(output).toContain('patch-only');
        });

        it('rejects a minor on a line even with NO database change', () => {
            const { code, output } = runOnLine('line-code-minor', () => {
                write('packages/Foo/line.ts', 'export const l = 1;\n');
                write('.changeset/certfix3.md', changeset({ '@memberjunction/core': 'minor' }));
            });
            expect(code).toBe(1);
            // Asserting the LINE-specific reason, not just the exit code: the pre-line-awareness
            // rule also rejected a minor on a no-DB branch, so a bare `code === 1` here passed
            // against the unfixed implementation and tested nothing.
            expect(output).toContain('patch-only');
            expect(output).toContain('certified line');
        });

        /**
         * The case that matters, and the one a name-based check cannot see: real backport branches
         * are NOT named `lts/*`. The repo's only line backport to date is
         * `fix/codegen-isa-postgres-lts5` → base `lts/5`, and korthout/backport-action emits
         * `backport-<n>-to-<target>`. Detection has to come from ancestry, not the branch's name.
         */
        it('detects the line from ANCESTRY on a realistically-named backport branch', () => {
            const { code, output } = runOnLine(
                'fix/cve-2026-1234',
                () => {
                    write('migrations/v6/V202601011800__v6.1.x__SecFix.sql', 'GO\n');
                    write('.changeset/sec.md', changeset({ '@memberjunction/core': 'patch' }));
                },
                { explicitBase: false }
            );
            expect(code).toBe(0);
            expect(output).toContain('certified line');
        });

        it('detects the line from a DETACHED HEAD (CI checkouts usually are)', () => {
            git('checkout', '-q', 'lts/6.1');
            git('checkout', '-q', '-b', 'detach-src');
            write('migrations/v6/V202601011900__v6.1.x__Det.sql', 'GO\n');
            write('.changeset/det.md', changeset({ '@memberjunction/core': 'patch' }));
            git('add', '-A');
            git('commit', '-q', '-m', 'detached work');
            const sha = git('rev-parse', 'HEAD').trim();
            git('checkout', '-q', sha); // detached
            try {
                const output = execFileSync('node', [SCRIPT], { cwd: repo, encoding: 'utf8' });
                expect(output).toContain('certified line');
            } finally {
                git('checkout', '-q', 'next');
            }
        });

        it('does not attribute the LINE\'s own pre-existing migration to a code-only backport', () => {
            // Diffing a line branch against origin/next spans the fork point, so migrations already
            // certified on the line look like this branch's work.
            const { code } = runOnLine(
                'fix/typo-backport',
                () => {
                    write('packages/Foo/typo.ts', 'export const t = 1;\n');
                    write('.changeset/typo.md', changeset({ '@memberjunction/core': 'patch' }));
                },
                { explicitBase: false }
            );
            expect(code).toBe(0);
        });

        /**
         * A real clone has NO local `lts/*` branches — only remote-tracking `origin/lts/*`. The
         * fixtures elsewhere create both, so a lookup that finds only the local one still passes
         * them while being dead in production. This case deletes the local branch first.
         */
        it('detects the line from a REMOTE-TRACKING ref alone (as a real clone has)', () => {
            git('checkout', '-q', 'next');
            git('checkout', '-q', '-b', 'remote-only-src', 'lts/6.1');
            write('migrations/v6/V202601012000__v6.1.x__RemoteOnly.sql', 'GO\n');
            write('.changeset/remote.md', changeset({ '@memberjunction/core': 'patch' }));
            git('add', '-A');
            git('commit', '-q', '-m', 'remote-only backport');
            git('update-ref', 'refs/remotes/origin/lts/6.1', 'lts/6.1');
            git('branch', '-q', '-D', 'lts/6.1'); // only origin/lts/6.1 remains
            try {
                const output = execFileSync('node', [SCRIPT], { cwd: repo, encoding: 'utf8' });
                expect(output).toContain('certified line');
            } finally {
                git('checkout', '-q', 'next');
                git('branch', '-q', 'lts/6.1', 'refs/remotes/origin/lts/6.1');
            }
        });

        it('detects the line when the topic branch IS named lts/… too', () => {
            // The name is not what makes this work — ancestry is — but a conventionally-named
            // branch must not be a regression just because detection stopped reading names.
            const { code, output } = runOnLine(
                'lts/6.1-local',
                () => {
                    write('migrations/v6/V202601011700__v6.1.x__Local.sql', 'GO\n');
                    write('.changeset/certfix4.md', changeset({ '@memberjunction/core': 'patch' }));
                },
                { explicitBase: false }
            );
            expect(code).toBe(0);
            expect(output).toContain('certified line');
        });
    });

    describe('--base argument handling', () => {
        function run(...args) {
            try {
                return { code: 0, output: execFileSync('node', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' }) };
            } catch (error) {
                return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
            }
        }

        it('fails loudly when --base is passed with no value', () => {
            // Regression guard: `explicitBase ?? DEFAULT_BASE` swallowed the undefined and silently
            // applied the Edge rule against origin/next — turning a loud failure into a wrong answer.
            const { code, output } = run('--base');
            expect(code).toBe(2);
            expect(output).toContain('--base requires a value');
        });

        it('accepts the --base=REF equals form', () => {
            const { code, output } = run('--base=lts/6.1');
            expect(code).toBe(0);
            expect(output).toContain('certified line');
        });

        it.each([
            ['refs/heads/lts/6.1'],
            ['origin/lts/6.1'],
        ])('recognises %s as a line base', (ref) => {
            const { output } = run('--base', ref);
            expect(output).toContain('certified line');
        });
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
