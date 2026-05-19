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
