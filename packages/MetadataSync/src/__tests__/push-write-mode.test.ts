import { describe, it, expect } from 'vitest';
import {
    resolveDirectoryMode,
    graphBatchSizeFor,
    isolatedModeWarning,
    unusedBatchSizeWarning,
    DEFAULT_PARALLEL_BATCH_SIZE,
} from '../lib/push-write-mode';

describe('resolveDirectoryMode', () => {
    it('is shared when nothing asks otherwise', () => {
        expect(resolveDirectoryMode({})).toEqual({ mode: 'shared', source: 'default' });
    });

    it('takes the entity directory\'s own setting over the root', () => {
        expect(resolveDirectoryMode({ entityIsolated: true, rootIsolated: false })).toEqual({ mode: 'isolated', source: 'entity' });
        expect(resolveDirectoryMode({ entityIsolated: false, rootIsolated: true })).toEqual({ mode: 'shared', source: 'entity' });
    });

    it('falls back to the root setting when the directory says nothing', () => {
        expect(resolveDirectoryMode({ rootIsolated: true })).toEqual({ mode: 'isolated', source: 'root' });
    });

    it('lets the CLI flag override every file, in both directions', () => {
        // The point of the flag: change one run without editing metadata.
        expect(resolveDirectoryMode({ isolatedFlag: false, entityIsolated: true, rootIsolated: true }))
            .toEqual({ mode: 'shared', source: 'flag' });
        expect(resolveDirectoryMode({ isolatedFlag: true, entityIsolated: false, rootIsolated: false }))
            .toEqual({ mode: 'isolated', source: 'flag' });
    });
});

describe('graphBatchSizeFor', () => {
    it('runs one graph at a time in a shared directory, whatever the flag says', () => {
        expect(graphBatchSizeFor('shared', 20)).toBe(1);
        expect(graphBatchSizeFor('shared')).toBe(1);
    });

    it('honours the flag in an isolated directory, and defaults without one', () => {
        expect(graphBatchSizeFor('isolated', 4)).toBe(4);
        expect(graphBatchSizeFor('isolated')).toBe(DEFAULT_PARALLEL_BATCH_SIZE);
    });
});

describe('warnings', () => {
    it('names the isolated directories and says their records are not rolled back', () => {
        const text = isolatedModeWarning(['orders', 'payments'], 10);
        expect(text).toMatch(/orders, payments/);
        expect(text).toMatch(/stay in the database/);
    });

    it('explains how to make --parallel-batch-size mean something', () => {
        const text = unusedBatchSizeWarning(20);
        expect(text).toMatch(/--parallel-batch-size=20 is ignored/);
        expect(text).toMatch(/push.isolatedTransactions/);
    });
});
