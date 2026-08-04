import { describe, it, expect } from 'vitest';
import {
    emptyActionLog,
    recordOutcome,
    type FileMergeResult,
} from '../../lib/claude-pack/PackTypes.js';

describe('PackTypes', () => {
    describe('emptyActionLog', () => {
        it('returns the four empty buckets', () => {
            const log = emptyActionLog();
            expect(log).toEqual({ added: [], updated: [], skipped: [], errors: [] });
        });

        it('returns a fresh instance each call (no shared array refs)', () => {
            const a = emptyActionLog();
            const b = emptyActionLog();
            a.added.push('x');
            expect(b.added).toEqual([]);
        });
    });

    describe('recordOutcome', () => {
        it('appends added outcomes to the added bucket', () => {
            const log = emptyActionLog();
            recordOutcome(log, { path: 'CLAUDE.md', outcome: 'added' });
            expect(log.added).toEqual(['CLAUDE.md']);
            expect(log.updated).toEqual([]);
        });

        it('appends updated outcomes to the updated bucket', () => {
            const log = emptyActionLog();
            recordOutcome(log, { path: '.claude/settings.json', outcome: 'updated' });
            expect(log.updated).toEqual(['.claude/settings.json']);
        });

        it('appends skipped outcomes to the skipped bucket', () => {
            const log = emptyActionLog();
            recordOutcome(log, { path: '.claude/commands/commit.md', outcome: 'skipped' });
            expect(log.skipped).toEqual(['.claude/commands/commit.md']);
        });

        it('appends error outcomes to the errors bucket', () => {
            const log = emptyActionLog();
            recordOutcome(log, { path: '.claude/mj/core.md', outcome: 'error' });
            expect(log.errors).toEqual(['.claude/mj/core.md']);
        });

        it('formats reason as a parenthetical suffix', () => {
            const log = emptyActionLog();
            const result: FileMergeResult = {
                path: '.claude/commands/commit.md',
                outcome: 'skipped',
                reason: 'user-modified',
            };
            recordOutcome(log, result);
            expect(log.skipped).toEqual(['.claude/commands/commit.md (user-modified)']);
        });

        it('omits the parenthetical when reason is absent', () => {
            const log = emptyActionLog();
            recordOutcome(log, { path: 'CLAUDE.md', outcome: 'added' });
            expect(log.added).toEqual(['CLAUDE.md']);
        });

        it('handles multiple entries across buckets in order', () => {
            const log = emptyActionLog();
            recordOutcome(log, { path: 'a', outcome: 'added' });
            recordOutcome(log, { path: 'b', outcome: 'updated' });
            recordOutcome(log, { path: 'c', outcome: 'added' });
            recordOutcome(log, { path: 'd', outcome: 'skipped', reason: 'identical' });
            expect(log).toEqual({
                added: ['a', 'c'],
                updated: ['b'],
                skipped: ['d (identical)'],
                errors: [],
            });
        });
    });
});
