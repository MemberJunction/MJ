import { describe, it, expect } from 'vitest';

// Pagination strategies
import { CursorPagination } from '../strategies/builtin/pagination/CursorPagination.js';
import { OffsetPagination } from '../strategies/builtin/pagination/OffsetPagination.js';
import { PageNumberPagination } from '../strategies/builtin/pagination/PageNumberPagination.js';
import { NoPagination } from '../strategies/builtin/pagination/NoPagination.js';

// Batching strategies
import { SimpleBatching } from '../strategies/builtin/batching/SimpleBatching.js';
import { NoBatching } from '../strategies/builtin/batching/NoBatching.js';

// Rate limit strategies
import { ExponentialBackoff } from '../strategies/builtin/ratelimit/ExponentialBackoff.js';
import { FixedInterval } from '../strategies/builtin/ratelimit/FixedInterval.js';
import { NoRateLimit } from '../strategies/builtin/ratelimit/NoRateLimit.js';

// Writeback strategies
import { ReadOnlyWriteback } from '../strategies/builtin/writeback/ReadOnlyWriteback.js';

// Incremental sync strategies
import { TimestampWatermark } from '../strategies/builtin/incremental/TimestampWatermark.js';
import { NoIncrementalSync } from '../strategies/builtin/incremental/NoIncrementalSync.js';

// Types
import type { PaginationState } from '../strategies/PaginationStrategy.js';
import type { ExternalRecord, CreateRecordContext, UpdateRecordContext, DeleteRecordContext } from '../types.js';

// ─── Helper Factories ──────────────────────────────────────────────────────────

function makeExternalRecord(externalID: string, fields: Record<string, unknown>): ExternalRecord {
    return { ExternalID: externalID, ObjectType: 'TestObject', Fields: fields };
}

function makeInitialState(overrides: Partial<PaginationState> = {}): PaginationState {
    return { HasMore: true, ...overrides };
}

// ─── Pagination ────────────────────────────────────────────────────────────────

describe('CursorPagination', () => {
    it('should have Type "Cursor"', () => {
        const strategy = new CursorPagination();
        expect(strategy.Type).toBe('Cursor');
    });

    it('BuildPaginationParams with no cursor returns empty object', () => {
        const strategy = new CursorPagination();
        const state = makeInitialState({ NextCursor: undefined });
        const params = strategy.BuildPaginationParams(state, 50);
        expect(params).toEqual({});
    });

    it('BuildPaginationParams with NextCursor includes cursor param', () => {
        const strategy = new CursorPagination();
        const state = makeInitialState({ NextCursor: 'abc123' });
        const params = strategy.BuildPaginationParams(state, 50);
        expect(params).toEqual({ after: 'abc123' });
    });

    it('ExtractNextState finds cursor at nested path (paging.next.after)', () => {
        const strategy = new CursorPagination();
        const responseBody = { paging: { next: { after: 'cursor-xyz' } } };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextCursor).toBe('cursor-xyz');
    });

    it('ExtractNextState returns HasMore: false when path not found', () => {
        const strategy = new CursorPagination();
        const responseBody = { data: [{ id: 1 }] };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
        expect(nextState.NextCursor).toBeUndefined();
    });

    it('ExtractNextState returns HasMore: false when cursor value is empty string', () => {
        const strategy = new CursorPagination();
        const responseBody = { paging: { next: { after: '' } } };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });

    it('ExtractNextState returns HasMore: false when cursor is null', () => {
        const strategy = new CursorPagination();
        const responseBody = { paging: { next: { after: null } } };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });

    it('custom param names work for BuildPaginationParams', () => {
        const strategy = new CursorPagination('cursor', 'meta.next_cursor');
        const state = makeInitialState({ NextCursor: 'page2token' });
        const params = strategy.BuildPaginationParams(state, 25);
        expect(params).toEqual({ cursor: 'page2token' });
    });

    it('custom response path works for ExtractNextState', () => {
        const strategy = new CursorPagination('cursor', 'meta.next_cursor');
        const responseBody = { meta: { next_cursor: 'next-page-token' } };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextCursor).toBe('next-page-token');
    });

    it('handles deeply nested cursor paths', () => {
        const strategy = new CursorPagination('after', 'response.pagination.cursors.next');
        const responseBody = { response: { pagination: { cursors: { next: 'deep-cursor' } } } };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextCursor).toBe('deep-cursor');
    });

    it('returns HasMore: false when a segment in the path is not an object', () => {
        const strategy = new CursorPagination('after', 'paging.next.after');
        const responseBody = { paging: 'not-an-object' };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });
});

describe('OffsetPagination', () => {
    it('should have Type "Offset"', () => {
        const strategy = new OffsetPagination();
        expect(strategy.Type).toBe('Offset');
    });

    it('BuildPaginationParams returns offset and limit', () => {
        const strategy = new OffsetPagination();
        const state = makeInitialState({ NextOffset: 0 });
        const params = strategy.BuildPaginationParams(state, 100);
        expect(params).toEqual({ offset: '0', limit: '100' });
    });

    it('BuildPaginationParams uses NextOffset from state', () => {
        const strategy = new OffsetPagination();
        const state = makeInitialState({ NextOffset: 200 });
        const params = strategy.BuildPaginationParams(state, 50);
        expect(params).toEqual({ offset: '200', limit: '50' });
    });

    it('BuildPaginationParams defaults to offset 0 when NextOffset is undefined', () => {
        const strategy = new OffsetPagination();
        const state = makeInitialState();
        const params = strategy.BuildPaginationParams(state, 25);
        expect(params).toEqual({ offset: '0', limit: '25' });
    });

    it('ExtractNextState with array response calculates next offset', () => {
        const strategy = new OffsetPagination();
        // Must call BuildPaginationParams first to set internal state
        strategy.BuildPaginationParams(makeInitialState({ NextOffset: 0 }), 3);
        const responseBody = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextOffset).toBe(3);
    });

    it('HasMore false when fewer records than page size (array response)', () => {
        const strategy = new OffsetPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextOffset: 0 }), 10);
        const responseBody = [{ id: 1 }, { id: 2 }];
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });

    it('handles response with results key', () => {
        const strategy = new OffsetPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextOffset: 50 }), 25);
        const responseBody = { results: new Array(25).fill({ id: 'x' }) };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextOffset).toBe(75);
    });

    it('handles response with data key', () => {
        const strategy = new OffsetPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextOffset: 0 }), 5);
        const responseBody = { data: [1, 2, 3, 4, 5] };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextOffset).toBe(5);
    });

    it('returns HasMore false for non-array response with no recognized key', () => {
        const strategy = new OffsetPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextOffset: 0 }), 10);
        const responseBody = { something: 'else' };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });

    it('custom param names work', () => {
        const strategy = new OffsetPagination('skip', 'top');
        const state = makeInitialState({ NextOffset: 10 });
        const params = strategy.BuildPaginationParams(state, 5);
        expect(params).toEqual({ skip: '10', top: '5' });
    });
});

describe('PageNumberPagination', () => {
    it('should have Type "PageNumber"', () => {
        const strategy = new PageNumberPagination();
        expect(strategy.Type).toBe('PageNumber');
    });

    it('BuildPaginationParams returns page and pageSize', () => {
        const strategy = new PageNumberPagination();
        const state = makeInitialState({ NextPage: 1 });
        const params = strategy.BuildPaginationParams(state, 20);
        expect(params).toEqual({ page: '1', pageSize: '20' });
    });

    it('BuildPaginationParams defaults to page 1 when NextPage is undefined', () => {
        const strategy = new PageNumberPagination();
        const state = makeInitialState();
        const params = strategy.BuildPaginationParams(state, 10);
        expect(params).toEqual({ page: '1', pageSize: '10' });
    });

    it('ExtractNextState increments page when results equal pageSize', () => {
        const strategy = new PageNumberPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextPage: 3 }), 5);
        const responseBody = [1, 2, 3, 4, 5]; // exactly pageSize
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextPage).toBe(4);
    });

    it('HasMore false when fewer records than page size', () => {
        const strategy = new PageNumberPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextPage: 2 }), 10);
        const responseBody = [1, 2, 3]; // less than pageSize
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });

    it('HasMore false when empty response', () => {
        const strategy = new PageNumberPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextPage: 1 }), 10);
        const responseBody: unknown[] = [];
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(false);
    });

    it('handles object response with results array', () => {
        const strategy = new PageNumberPagination();
        strategy.BuildPaginationParams(makeInitialState({ NextPage: 1 }), 3);
        const responseBody = { results: ['a', 'b', 'c'] };
        const nextState = strategy.ExtractNextState(responseBody, {});
        expect(nextState.HasMore).toBe(true);
        expect(nextState.NextPage).toBe(2);
    });

    it('custom param names work', () => {
        const strategy = new PageNumberPagination('p', 'count');
        const state = makeInitialState({ NextPage: 5 });
        const params = strategy.BuildPaginationParams(state, 15);
        expect(params).toEqual({ p: '5', count: '15' });
    });
});

describe('NoPagination', () => {
    it('should have Type "None"', () => {
        const strategy = new NoPagination();
        expect(strategy.Type).toBe('None');
    });

    it('BuildPaginationParams returns empty object', () => {
        const strategy = new NoPagination();
        const params = strategy.BuildPaginationParams(makeInitialState(), 100);
        expect(params).toEqual({});
    });

    it('ExtractNextState always returns HasMore: false', () => {
        const strategy = new NoPagination();
        const nextState = strategy.ExtractNextState([1, 2, 3], {});
        expect(nextState.HasMore).toBe(false);
    });

    it('ExtractNextState returns HasMore: false even with large response', () => {
        const strategy = new NoPagination();
        const nextState = strategy.ExtractNextState(new Array(1000).fill({ id: 1 }), {});
        expect(nextState.HasMore).toBe(false);
    });
});

// ─── Batching ──────────────────────────────────────────────────────────────────

describe('SimpleBatching', () => {
    it('should have SupportsBulkOperations = false', () => {
        const strategy = new SimpleBatching(10);
        expect(strategy.SupportsBulkOperations).toBe(false);
    });

    it('uses default MaxBatchSize of 100', () => {
        const strategy = new SimpleBatching();
        expect(strategy.MaxBatchSize).toBe(100);
    });

    it('chunks records into groups of maxBatchSize', () => {
        const strategy = new SimpleBatching(2);
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { name: 'A' }),
            makeExternalRecord('2', { name: 'B' }),
            makeExternalRecord('3', { name: 'C' }),
            makeExternalRecord('4', { name: 'D' }),
            makeExternalRecord('5', { name: 'E' }),
        ];
        const batches = strategy.BatchRecords(records, 'create');
        expect(batches).toHaveLength(3);
        expect(batches[0]).toHaveLength(2);
        expect(batches[1]).toHaveLength(2);
        expect(batches[2]).toHaveLength(1);
    });

    it('handles records count less than batch size (single batch)', () => {
        const strategy = new SimpleBatching(10);
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { name: 'A' }),
            makeExternalRecord('2', { name: 'B' }),
        ];
        const batches = strategy.BatchRecords(records, 'update');
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(2);
        expect(batches[0][0].ExternalID).toBe('1');
        expect(batches[0][1].ExternalID).toBe('2');
    });

    it('handles exact multiple of batch size', () => {
        const strategy = new SimpleBatching(3);
        const records: ExternalRecord[] = [
            makeExternalRecord('1', {}),
            makeExternalRecord('2', {}),
            makeExternalRecord('3', {}),
            makeExternalRecord('4', {}),
            makeExternalRecord('5', {}),
            makeExternalRecord('6', {}),
        ];
        const batches = strategy.BatchRecords(records, 'delete');
        expect(batches).toHaveLength(2);
        expect(batches[0]).toHaveLength(3);
        expect(batches[1]).toHaveLength(3);
    });

    it('handles empty array', () => {
        const strategy = new SimpleBatching(5);
        const batches = strategy.BatchRecords([], 'create');
        expect(batches).toHaveLength(0);
    });

    it('preserves record data in batches', () => {
        const strategy = new SimpleBatching(2);
        const records: ExternalRecord[] = [
            makeExternalRecord('r1', { email: 'a@test.com' }),
            makeExternalRecord('r2', { email: 'b@test.com' }),
            makeExternalRecord('r3', { email: 'c@test.com' }),
        ];
        const batches = strategy.BatchRecords(records, 'create');
        expect(batches[0][0].Fields['email']).toBe('a@test.com');
        expect(batches[0][1].Fields['email']).toBe('b@test.com');
        expect(batches[1][0].Fields['email']).toBe('c@test.com');
    });

    it('ExecuteBatch throws (must be overridden by connector)', async () => {
        const strategy = new SimpleBatching(10);
        const mockContext = { CompanyIntegration: {}, ObjectName: 'test', ContextUser: {} } as unknown as Parameters<typeof strategy.ExecuteBatch>[2];
        await expect(strategy.ExecuteBatch([], 'create', mockContext)).rejects.toThrow(
            'ExecuteBatch must be implemented by the connector'
        );
    });
});

describe('NoBatching', () => {
    it('should have MaxBatchSize of 1', () => {
        const strategy = new NoBatching();
        expect(strategy.MaxBatchSize).toBe(1);
    });

    it('should have SupportsBulkOperations = false', () => {
        const strategy = new NoBatching();
        expect(strategy.SupportsBulkOperations).toBe(false);
    });

    it('each record becomes its own single-element batch', () => {
        const strategy = new NoBatching();
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { name: 'A' }),
            makeExternalRecord('2', { name: 'B' }),
            makeExternalRecord('3', { name: 'C' }),
        ];
        const batches = strategy.BatchRecords(records, 'update');
        expect(batches).toHaveLength(3);
        expect(batches[0]).toHaveLength(1);
        expect(batches[0][0].ExternalID).toBe('1');
        expect(batches[1]).toHaveLength(1);
        expect(batches[1][0].ExternalID).toBe('2');
        expect(batches[2]).toHaveLength(1);
        expect(batches[2][0].ExternalID).toBe('3');
    });

    it('empty array returns empty', () => {
        const strategy = new NoBatching();
        const batches = strategy.BatchRecords([], 'delete');
        expect(batches).toHaveLength(0);
    });

    it('ExecuteBatch throws (must be overridden by connector)', async () => {
        const strategy = new NoBatching();
        const mockContext = { CompanyIntegration: {}, ObjectName: 'test', ContextUser: {} } as unknown as Parameters<typeof strategy.ExecuteBatch>[2];
        await expect(strategy.ExecuteBatch([], 'create', mockContext)).rejects.toThrow(
            'ExecuteBatch must be implemented by the connector'
        );
    });
});

// ─── Rate Limit ────────────────────────────────────────────────────────────────

describe('ExponentialBackoff', () => {
    it('uses sensible defaults', () => {
        const strategy = new ExponentialBackoff();
        expect(strategy.MinRequestIntervalMs).toBe(100);
        expect(strategy.MaxRetries).toBe(5);
    });

    it('ShouldRetry returns true for 429', () => {
        const strategy = new ExponentialBackoff(100, 5);
        expect(strategy.ShouldRetry(429, 0)).toBe(true);
        expect(strategy.ShouldRetry(429, 4)).toBe(true);
    });

    it('ShouldRetry returns true for 500+ when under max retries', () => {
        const strategy = new ExponentialBackoff(100, 5);
        expect(strategy.ShouldRetry(500, 0)).toBe(true);
        expect(strategy.ShouldRetry(502, 2)).toBe(true);
        expect(strategy.ShouldRetry(503, 4)).toBe(true);
    });

    it('ShouldRetry returns false when retryCount >= maxRetries', () => {
        const strategy = new ExponentialBackoff(100, 3);
        expect(strategy.ShouldRetry(429, 3)).toBe(false);
        expect(strategy.ShouldRetry(500, 3)).toBe(false);
        expect(strategy.ShouldRetry(429, 5)).toBe(false);
    });

    it('ShouldRetry returns false for 400 (client error)', () => {
        const strategy = new ExponentialBackoff(100, 5);
        expect(strategy.ShouldRetry(400, 0)).toBe(false);
    });

    it('ShouldRetry returns false for 401', () => {
        const strategy = new ExponentialBackoff(100, 5);
        expect(strategy.ShouldRetry(401, 0)).toBe(false);
    });

    it('ShouldRetry returns false for 403', () => {
        const strategy = new ExponentialBackoff(100, 5);
        expect(strategy.ShouldRetry(403, 0)).toBe(false);
    });

    it('ShouldRetry returns false for 404', () => {
        const strategy = new ExponentialBackoff(100, 5);
        expect(strategy.ShouldRetry(404, 0)).toBe(false);
    });

    it('GetBackoffMs doubles with each retry', () => {
        const strategy = new ExponentialBackoff(100, 5, 1000);
        expect(strategy.GetBackoffMs(0)).toBe(1000);  // 1000 * 2^0 = 1000
        expect(strategy.GetBackoffMs(1)).toBe(2000);  // 1000 * 2^1 = 2000
        expect(strategy.GetBackoffMs(2)).toBe(4000);  // 1000 * 2^2 = 4000
        expect(strategy.GetBackoffMs(3)).toBe(8000);  // 1000 * 2^3 = 8000
    });

    it('GetBackoffMs respects Retry-After header (seconds)', () => {
        const strategy = new ExponentialBackoff(100, 5, 1000);
        // Retry-After is in seconds, should be converted to ms
        expect(strategy.GetBackoffMs(0, '5')).toBe(5000);
        expect(strategy.GetBackoffMs(0, '10')).toBe(10000);
    });

    it('GetBackoffMs falls back to exponential when Retry-After is invalid', () => {
        const strategy = new ExponentialBackoff(100, 5, 1000);
        expect(strategy.GetBackoffMs(0, 'invalid')).toBe(1000);
        expect(strategy.GetBackoffMs(0, '')).toBe(1000);
    });

    it('GetBackoffMs falls back to exponential when Retry-After is zero or negative', () => {
        const strategy = new ExponentialBackoff(100, 5, 1000);
        expect(strategy.GetBackoffMs(0, '0')).toBe(1000);
        expect(strategy.GetBackoffMs(0, '-5')).toBe(1000);
    });

    it('GetBackoffMs caps at 30000ms', () => {
        const strategy = new ExponentialBackoff(100, 10, 1000);
        // 1000 * 2^5 = 32000 -> capped at 30000
        expect(strategy.GetBackoffMs(5)).toBe(30000);
        // 1000 * 2^10 = 1024000 -> capped at 30000
        expect(strategy.GetBackoffMs(10)).toBe(30000);
    });

    it('custom constructor parameters work', () => {
        const strategy = new ExponentialBackoff(200, 10, 500);
        expect(strategy.MinRequestIntervalMs).toBe(200);
        expect(strategy.MaxRetries).toBe(10);
        // 500 * 2^0 = 500
        expect(strategy.GetBackoffMs(0)).toBe(500);
        // 500 * 2^1 = 1000
        expect(strategy.GetBackoffMs(1)).toBe(1000);
    });
});

describe('FixedInterval', () => {
    it('uses sensible defaults', () => {
        const strategy = new FixedInterval();
        expect(strategy.MinRequestIntervalMs).toBe(100);
        expect(strategy.MaxRetries).toBe(3);
    });

    it('ShouldRetry returns true for 429 under max retries', () => {
        const strategy = new FixedInterval(100, 3);
        expect(strategy.ShouldRetry(429, 0)).toBe(true);
        expect(strategy.ShouldRetry(429, 2)).toBe(true);
    });

    it('ShouldRetry returns true for 500+ under max retries', () => {
        const strategy = new FixedInterval(100, 3);
        expect(strategy.ShouldRetry(500, 0)).toBe(true);
        expect(strategy.ShouldRetry(502, 1)).toBe(true);
    });

    it('ShouldRetry returns false when retryCount >= maxRetries', () => {
        const strategy = new FixedInterval(100, 3);
        expect(strategy.ShouldRetry(429, 3)).toBe(false);
        expect(strategy.ShouldRetry(500, 5)).toBe(false);
    });

    it('ShouldRetry returns false for 400-series client errors', () => {
        const strategy = new FixedInterval(100, 3);
        expect(strategy.ShouldRetry(400, 0)).toBe(false);
        expect(strategy.ShouldRetry(401, 0)).toBe(false);
        expect(strategy.ShouldRetry(404, 0)).toBe(false);
    });

    it('GetBackoffMs returns constant interval regardless of retry count', () => {
        const strategy = new FixedInterval(250, 5);
        expect(strategy.GetBackoffMs(0)).toBe(250);
        expect(strategy.GetBackoffMs(1)).toBe(250);
        expect(strategy.GetBackoffMs(2)).toBe(250);
        expect(strategy.GetBackoffMs(5)).toBe(250);
    });

    it('GetBackoffMs ignores Retry-After header', () => {
        const strategy = new FixedInterval(100, 3);
        expect(strategy.GetBackoffMs(0, '60')).toBe(100);
    });
});

describe('NoRateLimit', () => {
    it('has MinRequestIntervalMs = 0 and MaxRetries = 0', () => {
        const strategy = new NoRateLimit();
        expect(strategy.MinRequestIntervalMs).toBe(0);
        expect(strategy.MaxRetries).toBe(0);
    });

    it('ShouldRetry always returns false', () => {
        const strategy = new NoRateLimit();
        expect(strategy.ShouldRetry(429, 0)).toBe(false);
        expect(strategy.ShouldRetry(500, 0)).toBe(false);
        expect(strategy.ShouldRetry(200, 0)).toBe(false);
    });

    it('GetBackoffMs returns 0', () => {
        const strategy = new NoRateLimit();
        expect(strategy.GetBackoffMs(0)).toBe(0);
        expect(strategy.GetBackoffMs(5)).toBe(0);
        expect(strategy.GetBackoffMs(0, '60')).toBe(0);
    });
});

// ─── Writeback ─────────────────────────────────────────────────────────────────

describe('ReadOnlyWriteback', () => {
    it('all Supports* flags are false', () => {
        const strategy = new ReadOnlyWriteback();
        expect(strategy.SupportsCreate).toBe(false);
        expect(strategy.SupportsUpdate).toBe(false);
        expect(strategy.SupportsDelete).toBe(false);
        expect(strategy.SupportsUpsert).toBe(false);
    });

    it('Create throws', async () => {
        const strategy = new ReadOnlyWriteback();
        const mockContext = { CompanyIntegration: {}, ObjectName: 'test', ContextUser: {}, Attributes: {} } as unknown as CreateRecordContext;
        await expect(strategy.Create(mockContext)).rejects.toThrow('Write operations not supported by this connector');
    });

    it('Update throws', async () => {
        const strategy = new ReadOnlyWriteback();
        const mockContext = { CompanyIntegration: {}, ObjectName: 'test', ContextUser: {}, ExternalID: '1', Attributes: {} } as unknown as UpdateRecordContext;
        await expect(strategy.Update(mockContext)).rejects.toThrow('Write operations not supported by this connector');
    });

    it('Delete throws', async () => {
        const strategy = new ReadOnlyWriteback();
        const mockContext = { CompanyIntegration: {}, ObjectName: 'test', ContextUser: {}, ExternalID: '1' } as unknown as DeleteRecordContext;
        await expect(strategy.Delete(mockContext)).rejects.toThrow('Write operations not supported by this connector');
    });

    it('Upsert throws', async () => {
        const strategy = new ReadOnlyWriteback();
        const mockContext = { CompanyIntegration: {}, ObjectName: 'test', ContextUser: {}, ExternalID: '1', Attributes: {} } as unknown as UpdateRecordContext;
        await expect(strategy.Upsert(mockContext)).rejects.toThrow('Write operations not supported by this connector');
    });
});

// ─── Incremental Sync ──────────────────────────────────────────────────────────

describe('TimestampWatermark', () => {
    it('should have Type "Timestamp"', () => {
        const strategy = new TimestampWatermark('hs_lastmodifieddate');
        expect(strategy.Type).toBe('Timestamp');
    });

    it('stores the WatermarkFieldName', () => {
        const strategy = new TimestampWatermark('SystemModStamp');
        expect(strategy.WatermarkFieldName).toBe('SystemModStamp');
    });

    it('SupportsDeleteDetection is false', () => {
        const strategy = new TimestampWatermark('hs_lastmodifieddate');
        expect(strategy.SupportsDeleteDetection).toBe(false);
    });

    it('BuildIncrementalFilter with null watermark returns empty', () => {
        const strategy = new TimestampWatermark('hs_lastmodifieddate');
        const filter = strategy.BuildIncrementalFilter(null);
        expect(filter).toEqual({});
    });

    it('BuildIncrementalFilter with watermark returns filter param', () => {
        const strategy = new TimestampWatermark('hs_lastmodifieddate');
        const filter = strategy.BuildIncrementalFilter('2024-01-15T10:30:00.000Z');
        expect(filter).toEqual({ hs_lastmodifieddate: '2024-01-15T10:30:00.000Z' });
    });

    it('BuildIncrementalFilter uses custom filterParamName when provided', () => {
        const strategy = new TimestampWatermark('hs_lastmodifieddate', 'filterSince');
        const filter = strategy.BuildIncrementalFilter('2024-06-01T00:00:00.000Z');
        expect(filter).toEqual({ filterSince: '2024-06-01T00:00:00.000Z' });
    });

    it('ExtractWatermark finds max timestamp from records (ISO strings)', () => {
        const strategy = new TimestampWatermark('updatedAt');
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { updatedAt: '2024-01-10T00:00:00.000Z' }),
            makeExternalRecord('2', { updatedAt: '2024-03-15T12:00:00.000Z' }),
            makeExternalRecord('3', { updatedAt: '2024-02-20T06:00:00.000Z' }),
        ];
        const watermark = strategy.ExtractWatermark(records);
        expect(watermark).toBe('2024-03-15T12:00:00.000Z');
    });

    it('ExtractWatermark handles Date objects', () => {
        const strategy = new TimestampWatermark('modifiedDate');
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { modifiedDate: new Date('2024-06-01T00:00:00.000Z') }),
            makeExternalRecord('2', { modifiedDate: new Date('2024-07-01T00:00:00.000Z') }),
        ];
        const watermark = strategy.ExtractWatermark(records);
        expect(watermark).toBe('2024-07-01T00:00:00.000Z');
    });

    it('ExtractWatermark handles numeric timestamps (epoch millis)', () => {
        const strategy = new TimestampWatermark('lastModified');
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { lastModified: 1700000000000 }), // 2023-11-14T22:13:20Z
            makeExternalRecord('2', { lastModified: 1710000000000 }), // 2024-03-09T16:00:00Z
        ];
        const watermark = strategy.ExtractWatermark(records);
        // Should be the later timestamp as ISO string
        expect(watermark).toBe(new Date(1710000000000).toISOString());
    });

    it('ExtractWatermark returns null for empty records', () => {
        const strategy = new TimestampWatermark('updatedAt');
        const watermark = strategy.ExtractWatermark([]);
        expect(watermark).toBeNull();
    });

    it('ExtractWatermark returns null when no records have the watermark field', () => {
        const strategy = new TimestampWatermark('updatedAt');
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { name: 'Test' }),
            makeExternalRecord('2', { email: 'test@example.com' }),
        ];
        const watermark = strategy.ExtractWatermark(records);
        expect(watermark).toBeNull();
    });

    it('ExtractWatermark skips records with null watermark field values', () => {
        const strategy = new TimestampWatermark('updatedAt');
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { updatedAt: null }),
            makeExternalRecord('2', { updatedAt: '2024-05-01T00:00:00.000Z' }),
            makeExternalRecord('3', { updatedAt: undefined }),
        ];
        const watermark = strategy.ExtractWatermark(records);
        expect(watermark).toBe('2024-05-01T00:00:00.000Z');
    });

    it('ExtractWatermark skips records with invalid date strings', () => {
        const strategy = new TimestampWatermark('updatedAt');
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { updatedAt: 'not-a-date' }),
            makeExternalRecord('2', { updatedAt: '2024-08-20T15:00:00.000Z' }),
        ];
        const watermark = strategy.ExtractWatermark(records);
        expect(watermark).toBe('2024-08-20T15:00:00.000Z');
    });
});

describe('NoIncrementalSync', () => {
    it('should have Type "None"', () => {
        const strategy = new NoIncrementalSync();
        expect(strategy.Type).toBe('None');
    });

    it('WatermarkFieldName is empty string', () => {
        const strategy = new NoIncrementalSync();
        expect(strategy.WatermarkFieldName).toBe('');
    });

    it('SupportsDeleteDetection is false', () => {
        const strategy = new NoIncrementalSync();
        expect(strategy.SupportsDeleteDetection).toBe(false);
    });

    it('BuildIncrementalFilter always returns empty', () => {
        const strategy = new NoIncrementalSync();
        expect(strategy.BuildIncrementalFilter(null)).toEqual({});
        expect(strategy.BuildIncrementalFilter('2024-01-01T00:00:00.000Z')).toEqual({});
    });

    it('ExtractWatermark always returns null', () => {
        const strategy = new NoIncrementalSync();
        expect(strategy.ExtractWatermark([])).toBeNull();
        const records: ExternalRecord[] = [
            makeExternalRecord('1', { updatedAt: '2024-01-01T00:00:00.000Z' }),
        ];
        expect(strategy.ExtractWatermark(records)).toBeNull();
    });
});
