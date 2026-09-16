import { describe, it, expect } from 'vitest';
import {
    EmptyActionLog,
    RecordOutcome,
    type FileMergeResult,
} from '../../lib/claude-pack/PackTypes.js';

describe('PackTypes', () => {
    describe('emptyActionLog', () => {
        it('returns the four empty buckets', () => {
            const log = EmptyActionLog();
            expect(log).toEqual({ added: [], updated: [], skipped: [], errors: [] });
        });

        it('returns a fresh instance each call (no shared array refs)', () => {
            const a = EmptyActionLog();
            const b = EmptyActionLog();
            a.added.push('x');
            expect(b.added).toEqual([]);
        });
    });

    describe('recordOutcome', () => {
        it('appends added outcomes to the added bucket', () => {
            const log = EmptyActionLog();
            RecordOutcome(log, { Path: 'CLAUDE.md', Outcome: 'added' });
            expect(log.added).toEqual(['CLAUDE.md']);
            expect(log.updated).toEqual([]);
        });

        it('appends updated outcomes to the updated bucket', () => {
            const log = EmptyActionLog();
            RecordOutcome(log, { Path: '.claude/settings.json', Outcome: 'updated' });
            expect(log.updated).toEqual(['.claude/settings.json']);
        });

        it('appends skipped outcomes to the skipped bucket', () => {
            const log = EmptyActionLog();
            RecordOutcome(log, { Path: '.claude/commands/commit.md', Outcome: 'skipped' });
            expect(log.skipped).toEqual(['.claude/commands/commit.md']);
        });

        it('appends error outcomes to the errors bucket', () => {
            const log = EmptyActionLog();
            RecordOutcome(log, { Path: '.claude/mj/core.md', Outcome: 'error' });
            expect(log.errors).toEqual(['.claude/mj/core.md']);
        });

        it('formats reason as a parenthetical suffix', () => {
            const log = EmptyActionLog();
            const result: FileMergeResult = {
                Path: '.claude/commands/commit.md',
                Outcome: 'skipped',
                Reason: 'user-modified',
            };
            RecordOutcome(log, result);
            expect(log.skipped).toEqual(['.claude/commands/commit.md (user-modified)']);
        });

        it('omits the parenthetical when reason is absent', () => {
            const log = EmptyActionLog();
            RecordOutcome(log, { Path: 'CLAUDE.md', Outcome: 'added' });
            expect(log.added).toEqual(['CLAUDE.md']);
        });

        it('handles multiple entries across buckets in order', () => {
            const log = EmptyActionLog();
            RecordOutcome(log, { Path: 'a', Outcome: 'added' });
            RecordOutcome(log, { Path: 'b', Outcome: 'updated' });
            RecordOutcome(log, { Path: 'c', Outcome: 'added' });
            RecordOutcome(log, { Path: 'd', Outcome: 'skipped', Reason: 'identical' });
            expect(log).toEqual({
                added: ['a', 'c'],
                updated: ['b'],
                skipped: ['d (identical)'],
                errors: [],
            });
        });
    });
});
