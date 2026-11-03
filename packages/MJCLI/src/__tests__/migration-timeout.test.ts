import { describe, it, expect } from 'vitest';
import { DEFAULT_MIGRATION_REQUEST_TIMEOUT_MS, MigrationTimeoutHint } from '../lib/migration-timeout';

describe('MigrationTimeoutHint (#3168)', () => {
    it('defaults the request timeout to 30 minutes', () => {
        expect(DEFAULT_MIGRATION_REQUEST_TIMEOUT_MS).toBe(1_800_000);
    });

    it('names MJ_MIGRATION_REQUEST_TIMEOUT for a request timeout', () => {
        const hint = MigrationTimeoutHint(['Timeout: Request failed to complete in 300000ms'], 300_000);
        expect(hint).toContain('MJ_MIGRATION_REQUEST_TIMEOUT');
        expect(hint).toContain('300000ms');
    });

    it('recognizes the failed-cancel cascade', () => {
        expect(MigrationTimeoutHint([undefined, 'Failed at batch 12: Failed to cancel request in 5000ms'], 1_800_000)).toBeDefined();
    });

    it('recognizes the driver ETIMEOUT code', () => {
        expect(MigrationTimeoutHint(['RequestError: ETIMEOUT'], 1_800_000)).toBeDefined();
    });

    it('returns undefined for other failures', () => {
        expect(MigrationTimeoutHint(["Invalid object name '__mj.Foo'", undefined], 1_800_000)).toBeUndefined();
    });
});
