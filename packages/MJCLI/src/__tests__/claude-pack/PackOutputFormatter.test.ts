import { describe, it, expect } from 'vitest';
import {
    formatJson,
    formatPretty,
} from '../../lib/claude-pack/PackOutputFormatter.js';
import type { InstallResult } from '../../lib/claude-pack/PackTypes.js';

function makeResult(overrides: Partial<InstallResult> = {}): InstallResult {
    return {
        ok: true,
        packVersion: '5.1.0',
        installedMJVersion: '5.33.0',
        actions: { added: [], updated: [], skipped: [], errors: [] },
        warnings: [],
        notes: [],
        ...overrides,
    };
}

describe('formatJson', () => {
    it('emits the §7.5 schema verbatim', () => {
        const result = makeResult({
            actions: {
                added: ['CLAUDE.md'],
                updated: ['.claude/settings.json'],
                skipped: ['.claude/commands/commit.md (user-modified)'],
                errors: [],
            },
            warnings: ['.claude/commands/commit.md differs from pack'],
            notes: ['Pack is up to date (v5.1.0).'],
        });
        const json = JSON.parse(formatJson(result));
        expect(json.ok).toBe(true);
        expect(json.packVersion).toBe('5.1.0');
        expect(json.installedMJVersion).toBe('5.33.0');
        expect(json.actions.added).toEqual(['CLAUDE.md']);
        expect(json.actions.updated).toEqual(['.claude/settings.json']);
        expect(json.actions.skipped).toEqual(['.claude/commands/commit.md (user-modified)']);
        expect(json.actions.errors).toEqual([]);
        expect(json.warnings).toEqual(['.claude/commands/commit.md differs from pack']);
        expect(json.notes).toEqual(['Pack is up to date (v5.1.0).']);
    });

    it('always emits a `notes` array, even when empty (--json contract guarantee)', () => {
        // The §7.5 schema makes `notes` always-present, so downstream consumers
        // can do `result.notes.length` without optional-chaining or null checks.
        const json = JSON.parse(formatJson(makeResult()));
        expect(json).toHaveProperty('notes');
        expect(Array.isArray(json.notes)).toBe(true);
        expect(json.notes).toEqual([]);
    });

    it('pretty-prints with 2-space indent', () => {
        const json = formatJson(makeResult());
        expect(json).toContain('\n  ');
    });
});

describe('formatPretty', () => {
    it('shows a success banner with pack and MJ versions', () => {
        const text = stripAnsi(formatPretty(makeResult({ actions: { added: ['CLAUDE.md'], updated: [], skipped: [], errors: [] } })));
        expect(text).toContain('Claude Code pack v5.1.0');
        expect(text).toContain('MJ v5.33.0');
        expect(text).toContain('added (1)');
        expect(text).toContain('CLAUDE.md');
    });

    it('shows a failure banner when ok=false', () => {
        const text = stripAnsi(
            formatPretty(
                makeResult({
                    ok: false,
                    actions: { added: [], updated: [], skipped: [], errors: ['boom'] },
                })
            )
        );
        expect(text).toContain('failed');
        expect(text).toContain('boom');
    });

    it('truncates large skipped lists', () => {
        const result = makeResult({
            actions: {
                added: [],
                updated: [],
                skipped: Array.from({ length: 30 }, (_, i) => `file-${i}.md`),
                errors: [],
            },
        });
        const text = stripAnsi(formatPretty(result));
        expect(text).toContain('skipped (30)');
        expect(text).toContain('file-0.md');
        expect(text).toContain('25 more'); // 30 total - 5 shown = 25 elided
    });

    it('lists warnings at the end with a count', () => {
        const result = makeResult({
            warnings: ['warning A', 'warning B'],
        });
        const text = stripAnsi(formatPretty(result));
        expect(text).toContain('warnings (2)');
        expect(text).toContain('warning A');
        expect(text).toContain('warning B');
    });

    it('lists notes with a count, separate from warnings', () => {
        const result = makeResult({
            notes: ['Pack is up to date (v5.1.0).'],
        });
        const text = stripAnsi(formatPretty(result));
        expect(text).toContain('notes (1)');
        expect(text).toContain('Pack is up to date');
        // Should NOT show a warnings section when there are none
        expect(text).not.toContain('warnings');
    });

    it('renders notes and warnings in separate sections when both present', () => {
        const result = makeResult({
            notes: ['Update available: v5.1.0 → v5.2.0.'],
            warnings: ['Customized command would be overwritten'],
        });
        const text = stripAnsi(formatPretty(result));
        expect(text).toContain('notes (1)');
        expect(text).toContain('Update available');
        expect(text).toContain('warnings (1)');
        expect(text).toContain('Customized command');
    });

    it('renders NO notes/warnings sections when both are empty (clean success case)', () => {
        // After a clean install with nothing to flag, the pretty output should
        // not show empty "notes (0):" or "warnings (0):" sections — they'd be
        // visual noise. The success banner alone is sufficient.
        const result = makeResult({
            actions: { added: ['CLAUDE.md'], updated: [], skipped: [], errors: [] },
        });
        const text = stripAnsi(formatPretty(result));
        expect(text).toContain('Claude Code pack v5.1.0');
        expect(text).toContain('added (1)');
        expect(text).not.toContain('notes');
        expect(text).not.toContain('warnings');
    });

    it('includes the notes section on a failure result too (errorResult always carries notes:[])', () => {
        // errorResult() builds an InstallResult with notes: []. Make sure the
        // failure path doesn't blow up when destructuring/rendering notes.
        const text = stripAnsi(
            formatPretty(
                makeResult({
                    ok: false,
                    actions: { added: [], updated: [], skipped: [], errors: ['boom'] },
                    notes: [],
                })
            )
        );
        expect(text).toContain('failed');
        // No "notes" header when empty, just the failure summary.
        expect(text).not.toContain('notes (');
    });

    it('shows "(check only)" when packVersion is empty', () => {
        const text = stripAnsi(formatPretty(makeResult({ packVersion: '' })));
        expect(text).toContain('(check only)');
    });

    it('handles null installedMJVersion gracefully', () => {
        const text = stripAnsi(formatPretty(makeResult({ installedMJVersion: null })));
        expect(text).toContain('no local MJ detected');
    });
});

function stripAnsi(s: string): string {
    // Crude ANSI escape stripper sufficient for our tests
    // eslint-disable-next-line no-control-regex
    return s.replace(/\[[0-9;]*m/g, '');
}
