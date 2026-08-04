/**
 * Tests for cache staleness detection fixes in ProviderBase and GenericDatabaseProvider.
 *
 * Covers:
 *   - extractMaxUpdatedAt returns empty string for empty results (Fix 2)
 *   - extractMaxUpdatedAt correctly handles normal cases
 */

import { describe, it, expect } from 'vitest';
import { ProviderBase } from '../generic/providerBase';

// Access the protected method via a test subclass
class TestableProvider extends ProviderBase {
    public testExtractMaxUpdatedAt(results: unknown[]): string {
        return this.extractMaxUpdatedAt(results);
    }

    // Required abstract implementations (unused in these tests)
    get ProviderType() { return 0 as never; }
    get StartedAt() { return new Date(); }
    async GetEntityRecordName() { return null as never; }
    async GetEntityRecordNames() { return [] as never; }
    async GetRecordFavoriteStatus() { return false; }
    async SetRecordFavoriteStatus() {}
    async GetRecordDuplicates() { return null as never; }
    async MergeRecords() { return null as never; }
    async GetRecordDependencies() { return [] as never; }
    async GetDatasetByName() { return null as never; }
    async GetDatasetStatusByName() { return null as never; }
    async CreateTransactionGroup() { return null as never; }
    async Refresh() { return true; }
    get AllEntities() { return []; }
    get AllApplications() { return []; }
    get CurrentUser() { return null as never; }
    get Entities() { return []; }
    get Applications() { return []; }
    get LatestLocalMetadataTimestamps() { return []; }
    get LatestRemoteMetadataTimestamps() { return []; }
    get LocalStorageProvider() { return null as never; }
}

describe('extractMaxUpdatedAt Fixes', () => {
    let provider: TestableProvider;

    beforeEach(() => {
        provider = new TestableProvider();
    });

    it('should return empty string for empty results array', () => {
        const result = provider.testExtractMaxUpdatedAt([]);
        expect(result).toBe('');
    });

    it('should return empty string for results without __mj_UpdatedAt', () => {
        const result = provider.testExtractMaxUpdatedAt([
            { ID: '1', Name: 'Alice' },
            { ID: '2', Name: 'Bob' },
        ]);
        expect(result).toBe('');
    });

    it('should return the max __mj_UpdatedAt from results', () => {
        const result = provider.testExtractMaxUpdatedAt([
            { ID: '1', __mj_UpdatedAt: '2024-01-01T00:00:00Z' },
            { ID: '2', __mj_UpdatedAt: '2024-06-15T12:30:00Z' },
            { ID: '3', __mj_UpdatedAt: '2024-03-10T08:00:00Z' },
        ]);
        expect(result).toBe('2024-06-15T12:30:00.000Z');
    });

    it('should handle Date objects in __mj_UpdatedAt', () => {
        const date = new Date('2024-06-15T12:30:00Z');
        const result = provider.testExtractMaxUpdatedAt([
            { ID: '1', __mj_UpdatedAt: date },
        ]);
        expect(result).toBe(date.toISOString());
    });

    it('should skip invalid dates gracefully', () => {
        const result = provider.testExtractMaxUpdatedAt([
            { ID: '1', __mj_UpdatedAt: 'not-a-date' },
            { ID: '2', __mj_UpdatedAt: '2024-06-15T12:30:00Z' },
        ]);
        expect(result).toBe('2024-06-15T12:30:00.000Z');
    });

    it('should fall back to UpdatedAt field', () => {
        const result = provider.testExtractMaxUpdatedAt([
            { ID: '1', UpdatedAt: '2024-06-15T12:30:00Z' },
        ]);
        expect(result).toBe('2024-06-15T12:30:00.000Z');
    });
});
