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

import { makeDir, makeDirs, logIf, sortBySequenceAndCreatedAt } from '../Misc/util';

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

    it('should use __mj_CreatedAt as secondary sort', () => {
        const items = [
            { Sequence: 1, Name: 'B', __mj_CreatedAt: new Date('2025-02-01') },
            { Sequence: 1, Name: 'A', __mj_CreatedAt: new Date('2025-01-01') }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('A');
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

    it('should prioritize items with dates over items without when sequences match', () => {
        const items = [
            { Sequence: 1, Name: 'NoDate' },
            { Sequence: 1, Name: 'HasDate', __mj_CreatedAt: new Date('2025-01-01') }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('HasDate');
        expect(result[1].Name).toBe('NoDate');
    });

    it('should maintain order for items with same sequence and no dates', () => {
        const items = [
            { Sequence: 1, Name: 'First' },
            { Sequence: 1, Name: 'Second' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result).toHaveLength(2);
    });

    it('should sort correctly with mixed sequences', () => {
        const items = [
            { Sequence: 5, Name: 'E' },
            { Sequence: 1, Name: 'A', __mj_CreatedAt: new Date('2025-06-01') },
            { Sequence: 3, Name: 'C' },
            { Sequence: 1, Name: 'B', __mj_CreatedAt: new Date('2025-01-01') },
            { Sequence: 2, Name: 'D' }
        ];
        const result = sortBySequenceAndCreatedAt(items);
        expect(result[0].Name).toBe('B'); // Seq 1, earlier date
        expect(result[1].Name).toBe('A'); // Seq 1, later date
        expect(result[2].Name).toBe('D'); // Seq 2
        expect(result[3].Name).toBe('C'); // Seq 3
        expect(result[4].Name).toBe('E'); // Seq 5
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
