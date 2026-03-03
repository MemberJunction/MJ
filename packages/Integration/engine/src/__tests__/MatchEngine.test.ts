import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationEntityMapEntity,
} from '@memberjunction/core-entities';
import { MatchEngine } from '../MatchEngine.js';
import type { MappedRecord, ExternalRecord } from '../types.js';

// Track what RunView.RunView returns per test
let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
    };
});

function createMappedRecord(
    overrides: Partial<MappedRecord> = {},
    externalOverrides: Partial<ExternalRecord> = {}
): MappedRecord {
    return {
        ExternalRecord: {
            ExternalID: 'ext-1',
            ObjectType: 'Contact',
            Fields: {},
            IsDeleted: false,
            ...externalOverrides,
        },
        MJEntityName: 'Contacts',
        MappedFields: { Email: 'test@example.com' },
        ChangeType: 'Create',
        ...overrides,
    };
}

function createEntityMap(overrides: Partial<Record<string, unknown>> = {}): MJCompanyIntegrationEntityMapEntity {
    return {
        CompanyIntegrationID: 'ci-1',
        EntityID: 'entity-1',
        ConflictResolution: 'SourceWins',
        DeleteBehavior: 'SoftDelete',
        Entity: 'Contacts',
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'em-1';
            return (overrides as Record<string, unknown>)[field] ?? null;
        }),
        ...overrides,
    } as unknown as MJCompanyIntegrationEntityMapEntity;
}

function createKeyFieldMap(sourceField: string, destField: string): MJCompanyIntegrationFieldMapEntity {
    return {
        SourceFieldName: sourceField,
        DestinationFieldName: destField,
        IsKeyField: true,
        Status: 'Active' as const,
    } as unknown as MJCompanyIntegrationFieldMapEntity;
}

const mockContextUser = { ID: 'user-1' } as UserInfo;

describe('MatchEngine', () => {
    const engine = new MatchEngine();

    beforeEach(() => {
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
    });

    it('should classify new records as Create when no match found', async () => {
        const records = [createMappedRecord()];
        const entityMap = createEntityMap();
        const fieldMaps = [createKeyFieldMap('Email', 'Email')];

        const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

        expect(results[0].ChangeType).toBe('Create');
        expect(results[0].MatchedMJRecordID).toBeUndefined();
    });

    it('should classify matched records as Update', async () => {
        // First call: key field match returns existing record
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'mj-record-1' }],
        });

        const records = [createMappedRecord({ MappedFields: { Email: 'test@example.com' } })];
        const entityMap = createEntityMap();
        const fieldMaps = [createKeyFieldMap('Email', 'Email')];

        const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

        expect(results[0].ChangeType).toBe('Update');
        expect(results[0].MatchedMJRecordID).toBe('mj-record-1');
    });

    it('should classify deleted records as Delete when record map entry exists', async () => {
        // Record map lookup returns a match
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: [{ EntityRecordID: 'mj-record-2' }],
        });

        const records = [createMappedRecord(
            { ChangeType: 'Delete' },
            { IsDeleted: true }
        )];
        const entityMap = createEntityMap();

        const results = await engine.Resolve(records, entityMap, [], mockContextUser);

        expect(results[0].ChangeType).toBe('Delete');
        expect(results[0].MatchedMJRecordID).toBe('mj-record-2');
    });

    it('should classify deleted records as Skip when no record map entry exists', async () => {
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

        const records = [createMappedRecord(
            { ChangeType: 'Delete' },
            { IsDeleted: true }
        )];
        const entityMap = createEntityMap();

        const results = await engine.Resolve(records, entityMap, [], mockContextUser);

        expect(results[0].ChangeType).toBe('Skip');
    });

    it('should classify as Skip when conflict resolution is Manual and record exists', async () => {
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'mj-record-3' }],
        });

        const records = [createMappedRecord()];
        const entityMap = createEntityMap({ ConflictResolution: 'Manual' });
        const fieldMaps = [createKeyFieldMap('Email', 'Email')];

        const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

        expect(results[0].ChangeType).toBe('Skip');
        expect(results[0].MatchedMJRecordID).toBe('mj-record-3');
    });
});
