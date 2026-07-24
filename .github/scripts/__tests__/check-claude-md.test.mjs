import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-claude-md.mjs');

let root;

/** Write a file inside the fixture root, creating parent directories. */
function put(relPath, contents) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, 'utf8');
}

function run(...extraArgs) {
    const r = spawnSync('node', [SCRIPT, '--root', root, ...extraArgs], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** A fixture that passes every check — each test perturbs exactly one thing. */
function writeHealthyFixture() {
    put('CLAUDE.md', [
        '# Guide',
        '',
        'Routing table:',
        '',
        '- packages/Thing/CLAUDE.md — the thing',
        '- [a guide](guides/README.md)',
        '',
    ].join('\n'));

    put('packages/Thing/CLAUDE.md', '# Thing\n\nRules for the thing.\n');
    put('packages/Thing/index.ts', 'export const x = 1;\n');

    put('guides/README.md', '# Guides\n\n- [Alpha](ALPHA_GUIDE.md)\n');
    put('guides/ALPHA_GUIDE.md', '# Alpha\n');

    put('.claude/rules/scoped.md', ['---', 'paths:', '  - "**/*.ts"', '---', '', '# Scoped rule', ''].join('\n'));

    put('.claude/claude-md-manifest.json', JSON.stringify({
        baseline: { file: 'CLAUDE.md', lines: 2000, bytes: 100000 },
        budget: { maxLines: 100, maxBytes: 10000 },
        sections: [
            { title: 'Kept', destinations: ['root'] },
            { title: 'Moved', destinations: ['nested:packages/Thing/CLAUDE.md'] },
            { title: 'Scoped', destinations: ['rule:.claude/rules/scoped.md'] },
            { title: 'Dropped', destinations: ['deleted'], reason: 'Stale tooling residue.' },
        ],
    }, null, 2));
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'claude-md-check-'));
    writeHealthyFixture();
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('check-claude-md', () => {
    describe('CLI contract', () => {
        it('exits 0 and reports success on a healthy repo', () => {
            const { code, out } = run();
            expect(code).toBe(0);
            expect(out).toContain('all checks passed');
        });

        it('suppresses per-check output with --quiet but still reports the verdict', () => {
            const { code, out } = run('--quiet');
            expect(code).toBe(0);
            expect(out).not.toContain('completeness:');
            expect(out).toContain('all checks passed');
        });

        it('honors --root rather than assuming the real repository', () => {
            // The fixture's budget (100 lines) is far below the real repo's file; if --root were
            // ignored, the real CLAUDE.md would be measured and the counts would not match.
            const { out } = run();
            expect(out).toContain('4 sections accounted for');
        });
    });

    describe('completeness — the "nothing was lost" guarantee', () => {
        it('fails when a section has no destination', () => {
            put('.claude/claude-md-manifest.json', JSON.stringify({
                budget: { maxLines: 100, maxBytes: 10000 },
                sections: [{ title: 'Orphan', destinations: [] }],
            }));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('completeness');
            expect(err).toContain('Orphan');
        });

        it('fails when a destination file does not exist', () => {
            put('.claude/claude-md-manifest.json', JSON.stringify({
                budget: { maxLines: 100, maxBytes: 10000 },
                sections: [{ title: 'Ghost', destinations: ['nested:packages/Nope/CLAUDE.md'] }],
            }));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('packages/Nope/CLAUDE.md');
        });

        it('fails when a section is deleted without a reason', () => {
            put('.claude/claude-md-manifest.json', JSON.stringify({
                budget: { maxLines: 100, maxBytes: 10000 },
                sections: [{ title: 'Vanished', destinations: ['deleted'] }],
            }));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('Vanished');
            expect(err).toMatch(/reason/i);
        });

        it('accepts a deletion that carries a reason', () => {
            expect(run().code).toBe(0); // healthy fixture already has one
        });

        it('fails when the manifest is missing entirely', () => {
            rmSync(join(root, '.claude/claude-md-manifest.json'));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('manifest');
        });

        it('fails on malformed manifest JSON rather than silently passing', () => {
            put('.claude/claude-md-manifest.json', '{ not json');
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toMatch(/JSON/i);
        });
    });

    describe('budget — prevents regrowth', () => {
        it('fails when root CLAUDE.md exceeds the line ceiling', () => {
            const bloat = ['# Guide', '', '- packages/Thing/CLAUDE.md', '- [g](guides/README.md)']
                .concat(Array.from({ length: 200 }, (_, i) => `line ${i}`))
                .join('\n');
            put('CLAUDE.md', bloat);
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('budget');
            expect(err).toMatch(/line ceiling/i);
        });

        it('fails when root CLAUDE.md exceeds the byte ceiling', () => {
            put('.claude/claude-md-manifest.json', JSON.stringify({
                budget: { maxLines: 10000, maxBytes: 50 },
                sections: [{ title: 'Kept', destinations: ['root'] }],
            }));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toMatch(/byte ceiling/i);
        });
    });

    describe('references', () => {
        it('fails on a broken markdown link', () => {
            put('CLAUDE.md', '# Guide\n\n- packages/Thing/CLAUDE.md\n- [gone](guides/MISSING.md)\n');
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('broken link');
            expect(err).toContain('guides/MISSING.md');
        });

        it('ignores links inside fenced code blocks', () => {
            put('CLAUDE.md', [
                '# Guide',
                '',
                '- packages/Thing/CLAUDE.md',
                '- [g](guides/README.md)',
                '',
                '```md',
                '[illustrative](does/not/exist.md)',
                '```',
                '',
            ].join('\n'));
            expect(run().code).toBe(0);
        });

        it('ignores external URLs', () => {
            put('CLAUDE.md', [
                '# Guide',
                '',
                '- packages/Thing/CLAUDE.md',
                '- [g](guides/README.md)',
                '- [docs](https://code.claude.com/docs/en/memory.md)',
                '',
            ].join('\n'));
            expect(run().code).toBe(0);
        });
    });

    describe('anchors — a link into a section that no longer exists', () => {
        it('fails when a #fragment is not a heading in the target file', () => {
            put('CLAUDE.md', [
                '# Guide',
                '',
                '- packages/Thing/CLAUDE.md',
                '- [gone](guides/README.md#no-such-heading)',
                '',
            ].join('\n'));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('not a heading');
        });

        it('passes when the #fragment matches a heading, slugified GitHub-style', () => {
            put('guides/README.md', '# Guides\n\n## Start Here!\n\n- [Alpha](ALPHA_GUIDE.md)\n');
            put('CLAUDE.md', [
                '# Guide',
                '',
                '- packages/Thing/CLAUDE.md',
                '- [there](guides/README.md#start-here)',
                '',
            ].join('\n'));
            expect(run().code).toBe(0);
        });

        it('ignores line-range anchors, which point into source not headings', () => {
            put('CLAUDE.md', [
                '# Guide',
                '',
                '- packages/Thing/CLAUDE.md',
                '- [g](guides/README.md)',
                '- [src](packages/Thing/index.ts#L1-L5)',
                '',
            ].join('\n'));
            expect(run().code).toBe(0);
        });
    });

    describe('grandfathering — a ratchet, not an amnesty', () => {
        const withEntries = (entries) => put('.claude/claude-md-manifest.json', JSON.stringify({
            budget: { maxLines: 100, maxBytes: 10000 },
            knownBrokenReferences: { entries },
            sections: [{ title: 'Kept', destinations: ['root'] }],
        }));

        it('downgrades a listed pre-existing broken reference', () => {
            put('CLAUDE.md', '# Guide\n\n- packages/Thing/CLAUDE.md\n- [old](guides/LEGACY.md)\n');
            withEntries(['CLAUDE.md -> guides/LEGACY.md']);
            const { code, out } = run();
            expect(code).toBe(0);
            expect(out).toContain('grandfathered');
        });

        it('still fails an UNLISTED broken reference in the same file', () => {
            put('CLAUDE.md', [
                '# Guide',
                '',
                '- packages/Thing/CLAUDE.md',
                '- [old](guides/LEGACY.md)',
                '- [new](guides/BRAND_NEW_BREAK.md)',
                '',
            ].join('\n'));
            withEntries(['CLAUDE.md -> guides/LEGACY.md']);
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('BRAND_NEW_BREAK.md');
            expect(err).not.toContain('LEGACY.md');
        });

        it('treats a stale entry (no longer broken) as harmless', () => {
            withEntries(['CLAUDE.md -> guides/SOMETHING_ALREADY_FIXED.md']);
            expect(run().code).toBe(0);
        });
    });

    describe('routing — nested files must be discoverable', () => {
        it('fails when a nested CLAUDE.md is absent from the routing table', () => {
            put('packages/Hidden/CLAUDE.md', '# Hidden\n');
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('routing');
            expect(err).toContain('packages/Hidden/CLAUDE.md');
        });
    });

    describe('rules — a typo\'d glob fails silently at runtime, so fail loudly here', () => {
        it('fails when a path-scoped glob matches nothing', () => {
            put('.claude/rules/scoped.md', ['---', 'paths:', '  - "**/*.nonexistent"', '---', '', '# Rule', ''].join('\n'));
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('matches no files');
        });

        it('fails when frontmatter is unterminated', () => {
            put('.claude/rules/scoped.md', '---\npaths:\n  - "**/*.ts"\n\n# Rule with no closing fence\n');
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toMatch(/not terminated/i);
        });

        it('notes but does not fail an unscoped rule (valid: loads at launch)', () => {
            put('.claude/rules/scoped.md', '# Unscoped rule\n\nNo frontmatter.\n');
            const { code, out } = run();
            expect(code).toBe(0);
            expect(out).toMatch(/unscoped/i);
        });
    });

    describe('guides — the index root points at must be complete', () => {
        it('fails when a guide on disk is missing from guides/README.md', () => {
            put('guides/BETA_GUIDE.md', '# Beta\n');
            const { code, err } = run();
            expect(code).toBe(1);
            expect(err).toContain('BETA_GUIDE.md');
            expect(err).toMatch(/not indexed/i);
        });
    });
});
