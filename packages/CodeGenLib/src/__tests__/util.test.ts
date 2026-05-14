import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsExtra from 'fs-extra';

// Mock external dependencies
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn(),
            mkdirSync: vi.fn(),
            readFileSync: vi.fn(),
            writeFileSync: vi.fn(),
            unlinkSync: vi.fn()
        },
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn()
    };
});

vi.mock('fs-extra', () => ({
    default: {
        copySync: vi.fn()
    },
    copySync: vi.fn()
}));

vi.mock('glob', () => ({
    globSync: vi.fn().mockReturnValue([])
}));

vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(),
    logStatus: vi.fn()
}));

import { makeDir, makeDirs, logIf, sortBySequenceAndCreatedAt, sortRelatedEntities } from '../Misc/util';

describe('makeDir', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create directory if it does not exist', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        makeDir('/tmp/test-dir');
        expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/test-dir', { recursive: true });
    });

    it('should not create directory if it already exists', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        makeDir('/tmp/existing-dir');
        expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should use recursive option', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        makeDir('/tmp/deep/nested/dir');
        expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/deep/nested/dir', { recursive: true });
    });
});

describe('makeDirs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create all specified directories', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        makeDirs(['/tmp/dir1', '/tmp/dir2', '/tmp/dir3']);
        expect(fs.mkdirSync).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array', () => {
        makeDirs([]);
        expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should skip existing directories', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);
        makeDirs(['/tmp/exists', '/tmp/new']);
        expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    });
});

describe('logIf', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should log when shouldLog is true', () => {
        logIf(true, 'test message');
        expect(consoleSpy).toHaveBeenCalledWith('test message');
    });

    it('should not log when shouldLog is false', () => {
        logIf(false, 'hidden message');
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should pass multiple arguments to console.log', () => {
        logIf(true, 'msg', 123, { key: 'value' });
        expect(consoleSpy).toHaveBeenCalledWith('msg', 123, { key: 'value' });
    });

    it('should handle empty call with true', () => {
        logIf(true);
        expect(consoleSpy).toHaveBeenCalled();
    });
});

describe('sortBySequenceAndCreatedAt', () => {
    it('should sort by Sequence ascending', () => {
        const items = [
            { Sequence: 3, Name: 'C' },
            { Sequence: 1, Name: 'A' },
            { Sequence: 2, Name: 'B' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('A');
        expect(result[1].Name).toBe('B');
        expect(result[2].Name).toBe('C');
    });

    it('should ignore __mj_CreatedAt and sort alphabetically by Name when Sequence matches', () => {
        // Regression: __mj_CreatedAt was previously a secondary sort key, which made codegen
        // output a function of DB-resident insertion timestamps and produced different output
        // across environments. The function now ignores __mj_CreatedAt entirely.
        const items = [
            { Sequence: 1, Name: 'B', __mj_CreatedAt: new Date('2025-01-01') }, // earlier date but later name
            { Sequence: 1, Name: 'A', __mj_CreatedAt: new Date('2025-02-01') }  // later date but earlier name
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('A'); // alphabetical wins; date is irrelevant
        expect(result[1].Name).toBe('B');
    });

    it('should not mutate the original array', () => {
        const items = [
            { Sequence: 2, Name: 'B' },
            { Sequence: 1, Name: 'A' }
        ];
        const original = [...items];
        sortBySequenceAndCreatedAt(items);
        expect(items[0]).toEqual(original[0]);
    });

    it('should handle empty array', () => {
        const result = sortBySequenceAndCreatedAt([]);
        expect(result).toEqual([]);
    });

    it('should handle single element', () => {
        const items = [{ Sequence: 1, Name: 'A' }];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result).toHaveLength(1);
        expect(result[0].Name).toBe('A');
    });

    it('should not prioritize items with dates — date presence is irrelevant to ordering', () => {
        // Regression: previously items with a date were prioritized over items without one.
        // That behavior leaked DB insertion history into codegen output. Date presence is now
        // ignored entirely; ordering falls through to alphabetical.
        const items = [
            { Sequence: 1, Name: 'NoDate' },
            { Sequence: 1, Name: 'HasDate', __mj_CreatedAt: new Date('2025-01-01') }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('HasDate'); // alphabetical: HasDate < NoDate
        expect(result[1].Name).toBe('NoDate');
    });

    it('should sort alphabetically by Name when sequence and dates match', () => {
        const items = [
            { Sequence: 1, Name: 'Zebra' },
            { Sequence: 1, Name: 'Alpha' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('Alpha');
        expect(result[1].Name).toBe('Zebra');
    });

    it('should sort correctly with mixed sequences, alphabetically within a Sequence', () => {
        const items = [
            { Sequence: 5, Name: 'E' },
            { Sequence: 1, Name: 'A', __mj_CreatedAt: new Date('2025-06-01') }, // later date
            { Sequence: 3, Name: 'C' },
            { Sequence: 1, Name: 'B', __mj_CreatedAt: new Date('2025-01-01') }, // earlier date
            { Sequence: 2, Name: 'D' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        // Within Seq 1, alphabetical (date ignored): A before B
        expect(result[0].Name).toBe('A');
        expect(result[1].Name).toBe('B');
        expect(result[2].Name).toBe('D'); // Seq 2
        expect(result[3].Name).toBe('C'); // Seq 3
        expect(result[4].Name).toBe('E'); // Seq 5
    });

    it('should sort by RelatedEntityJoinField for EntityRelationshipInfo-like items', () => {
        const items = [
            { Sequence: 0, RelatedEntityJoinField: 'LastRunID', __mj_CreatedAt: new Date('2025-01-01') },
            { Sequence: 0, RelatedEntityJoinField: 'ParentRunID', __mj_CreatedAt: new Date('2025-01-01') }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].RelatedEntityJoinField).toBe('LastRunID');
        expect(result[1].RelatedEntityJoinField).toBe('ParentRunID');
    });

    it('should use ID as last-resort tiebreaker', () => {
        const items = [
            { Sequence: 0, ID: 'BBB-222' },
            { Sequence: 0, ID: 'AAA-111' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].ID).toBe('AAA-111');
        expect(result[1].ID).toBe('BBB-222');
    });

    it('should handle negative sequence numbers', () => {
        const items = [
            { Sequence: 0, Name: 'Zero' },
            { Sequence: -1, Name: 'Negative' },
            { Sequence: 1, Name: 'Positive' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('Negative');
        expect(result[1].Name).toBe('Zero');
        expect(result[2].Name).toBe('Positive');
    });
});

describe('sortRelatedEntities', () => {
    it('should sort by Sequence ascending', () => {
        const items = [
            { Sequence: 2, RelatedEntity: 'B', RelatedEntityJoinField: 'BID' },
            { Sequence: 1, RelatedEntity: 'A', RelatedEntityJoinField: 'AID' }
        ];
        const result = sortRelatedEntities(items);
        expect(result[0].RelatedEntity).toBe('A');
        expect(result[1].RelatedEntity).toBe('B');
    });

    it('should ignore __mj_CreatedAt and tiebreak alphabetically by RelatedEntity name', () => {
        // Regression: __mj_CreatedAt was previously a secondary sort key. That made generated.ts
        // depend on DB-resident insertion timestamps, which differ between environments
        // (e.g. dev iterating over days vs. a Flyway batch install that lands all rows in the
        // same SQL Server tick). The function now ignores __mj_CreatedAt entirely.
        const items = [
            { Sequence: 1, RelatedEntity: 'B', RelatedEntityJoinField: 'BID', __mj_CreatedAt: new Date('2026-03-23') }, // earlier date
            { Sequence: 1, RelatedEntity: 'A', RelatedEntityJoinField: 'AID', __mj_CreatedAt: new Date('2026-03-24') }  // later date
        ];
        const result = sortRelatedEntities(items);
        expect(result[0].RelatedEntity).toBe('A'); // alphabetical wins
        expect(result[1].RelatedEntity).toBe('B');
    });

    it('should produce identical output for the same metadata regardless of timestamps', () => {
        // Cross-environment determinism regression: simulate the same logical relationships
        // existing in two databases — one where rows were created over time (well-spaced
        // timestamps in arbitrary order) and one where rows landed in a single Flyway batch
        // (timestamps tied or near-tied). Both must produce identical output.
        const devEnvironment = [
            { Sequence: 1, RelatedEntity: 'External Indexes', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-ext', __mj_CreatedAt: new Date('2026-05-10T09:00:00Z') },
            { Sequence: 1, RelatedEntity: 'Entities', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-ent', __mj_CreatedAt: new Date('2026-05-10T09:00:01Z') },
            { Sequence: 1, RelatedEntity: 'Permissions', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-prm', __mj_CreatedAt: new Date('2026-05-10T09:00:02Z') },
            { Sequence: 1, RelatedEntity: 'Test Queries', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-tst', __mj_CreatedAt: new Date('2026-05-10T09:00:03Z') }
        ];
        const sameMillisecond = new Date('2026-05-14T16:10:49.123Z');
        const cleanInstallEnvironment = [
            { Sequence: 1, RelatedEntity: 'Test Queries', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-tst', __mj_CreatedAt: sameMillisecond },
            { Sequence: 1, RelatedEntity: 'Entities', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-ent', __mj_CreatedAt: sameMillisecond },
            { Sequence: 1, RelatedEntity: 'External Indexes', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-ext', __mj_CreatedAt: sameMillisecond },
            { Sequence: 1, RelatedEntity: 'Permissions', RelatedEntityJoinField: 'SearchScopeID', ID: 'id-prm', __mj_CreatedAt: sameMillisecond }
        ];
        const devSorted = sortRelatedEntities(devEnvironment).map(r => r.ID);
        const cleanSorted = sortRelatedEntities(cleanInstallEnvironment).map(r => r.ID);
        expect(cleanSorted).toEqual(devSorted);
        // And the result is alphabetical by RelatedEntity name
        expect(devSorted).toEqual(['id-ent', 'id-ext', 'id-prm', 'id-tst']);
    });

    it('should use RelatedEntity name as tiebreaker when Sequence and CreatedAt match', () => {
        const sameDate = new Date('2026-03-23T16:36:28.223Z');
        const items = [
            { Sequence: 1, RelatedEntity: 'Entity Organic Key Related Entities', RelatedEntityJoinField: 'RelatedEntityID', __mj_CreatedAt: sameDate },
            { Sequence: 1, RelatedEntity: 'Entity Organic Keys', RelatedEntityJoinField: 'EntityID', __mj_CreatedAt: sameDate }
        ];
        const result = sortRelatedEntities(items);
        expect(result[0].RelatedEntity).toBe('Entity Organic Key Related Entities');
        expect(result[1].RelatedEntity).toBe('Entity Organic Keys');
    });

    it('should use RelatedEntityJoinField after RelatedEntity when entity names also match', () => {
        const sameDate = new Date('2026-03-23');
        const items = [
            { Sequence: 1, RelatedEntity: 'Same Entity', RelatedEntityJoinField: 'ParentRunID', __mj_CreatedAt: sameDate },
            { Sequence: 1, RelatedEntity: 'Same Entity', RelatedEntityJoinField: 'LastRunID', __mj_CreatedAt: sameDate }
        ];
        const result = sortRelatedEntities(items);
        expect(result[0].RelatedEntityJoinField).toBe('LastRunID');
        expect(result[1].RelatedEntityJoinField).toBe('ParentRunID');
    });

    it('should use ID as last resort', () => {
        const sameDate = new Date('2026-03-23');
        const items = [
            { Sequence: 1, RelatedEntity: 'Same', RelatedEntityJoinField: 'SameField', ID: 'ZZZ', __mj_CreatedAt: sameDate },
            { Sequence: 1, RelatedEntity: 'Same', RelatedEntityJoinField: 'SameField', ID: 'AAA', __mj_CreatedAt: sameDate }
        ];
        const result = sortRelatedEntities(items);
        expect(result[0].ID).toBe('AAA');
        expect(result[1].ID).toBe('ZZZ');
    });

    it('should not mutate the original array', () => {
        const items = [
            { Sequence: 2, RelatedEntity: 'B', RelatedEntityJoinField: 'BID' },
            { Sequence: 1, RelatedEntity: 'A', RelatedEntityJoinField: 'AID' }
        ];
        const original = [...items];
        sortRelatedEntities(items);
        expect(items[0]).toEqual(original[0]);
    });

    it('should handle empty array', () => {
        const result = sortRelatedEntities([]);
        expect(result).toEqual([]);
    });
});
