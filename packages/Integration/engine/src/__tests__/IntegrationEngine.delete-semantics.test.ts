import { describe, it, expect, vi } from 'vitest';
import { IntegrationEngine, CanArchive } from '../IntegrationEngine.js';
import type { MappedRecord } from '../types.js';

/**
 * #3528 / #5202 — SoftDelete that really archives, and sources that flag deletions on a live row.
 * Driven through the engine's own seams (private methods named below), with in-memory entities.
 */

type Row = Record<string, unknown>;

function fakeEntity(fields: string[], initial: Row = {}) {
    const data: Row = { ...initial };
    return {
        Fields: fields.map(Name => ({ Name })),
        Set: vi.fn((k: string, v: unknown) => { data[k] = v; }),
        Get: vi.fn((k: string) => data[k]),
        Save: vi.fn().mockResolvedValue(true),
        data,
    };
}

const TOMBSTONE_FIELDS = ['__mj_integration_SyncStatus', '__mj_integration_IsTombstoned', '__mj_integration_DeletedDetectedAt', '__mj_integration_LastSyncedAt'];

type Internals = {
    archiveRecord(entity: unknown, entityMap: unknown, logger?: unknown): Promise<'archived' | 'refused' | 'failed'>;
    setStandardIntegrationFields(entity: unknown, record: MappedRecord): void;
    isSourceFlaggedDeleted(record: MappedRecord, entityMap: unknown): boolean;
};

const engine = () => Object.create(IntegrationEngine.prototype) as unknown as Internals;
const map = (overrides: Row = {}) => ({ ID: 'em-1', Entity: 'Members', ExternalObjectName: 'member', DeleteBehavior: 'SoftDelete', Configuration: null, ...overrides });
const record = (fields: Row, extra: Partial<MappedRecord> = {}): MappedRecord => ({
    ExternalRecord: { ExternalID: 'x-1', ObjectType: 'member', Fields: fields },
    MJEntityName: 'Members',
    MappedFields: {},
    ChangeType: 'Update',
    ...extra,
});

describe('archiveRecord (#3528)', () => {
    it('refuses an entity with no tombstone columns: no save, one warning per map', async () => {
        const e = engine();
        const warnings: string[] = [];
        const logger = { warning: (_o: string, code: string) => warnings.push(code) };
        const entity = fakeEntity(['Name']);
        expect(await e.archiveRecord(entity, map(), logger)).toBe('refused');
        expect(await e.archiveRecord(entity, map(), logger)).toBe('refused');
        expect(entity.Save).not.toHaveBeenCalled();
        expect(warnings).toEqual(['SOFT_DELETE_UNSUPPORTED']);
    });

    it('archives and stamps DeletedDetectedAt once', async () => {
        const entity = fakeEntity(TOMBSTONE_FIELDS, { __mj_integration_DeletedDetectedAt: '2026-01-01T00:00:00.000Z' });
        expect(await engine().archiveRecord(entity, map())).toBe('archived');
        expect(entity.data.__mj_integration_IsTombstoned).toBe(true);
        expect(entity.data.__mj_integration_SyncStatus).toBe('Archived');
        expect(entity.data.__mj_integration_DeletedDetectedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('CanArchive needs at least one tombstone column', () => {
        expect(CanArchive([{ Name: 'Name' }])).toBe(false);
        expect(CanArchive([{ Name: '__mj_integration_SyncStatus' }])).toBe(true);
    });
});

describe('source delete flag (#5202)', () => {
    const cfg = JSON.stringify({ sourceDeleteField: 'member_delete_flag', sourceDeleteValue: '1' });

    it('matches the configured field and value as trimmed strings', () => {
        const e = engine();
        expect(e.isSourceFlaggedDeleted(record({ member_delete_flag: ' 1 ' }), map({ Configuration: cfg }))).toBe(true);
        expect(e.isSourceFlaggedDeleted(record({ member_delete_flag: 1 }), map({ Configuration: cfg }))).toBe(true);
        expect(e.isSourceFlaggedDeleted(record({ member_delete_flag: '0' }), map({ Configuration: cfg }))).toBe(false);
        expect(e.isSourceFlaggedDeleted(record({}), map({ Configuration: cfg }))).toBe(false);
        expect(e.isSourceFlaggedDeleted(record({ member_delete_flag: '1' }), map())).toBe(false);
    });

    it('a flagged row is written tombstoned, keeping the first DeletedDetectedAt', () => {
        const e = engine();
        const first = fakeEntity(TOMBSTONE_FIELDS);
        e.setStandardIntegrationFields(first, record({}, { SourceDeleted: true }));
        expect(first.data.__mj_integration_IsTombstoned).toBe(true);
        const stamped = first.data.__mj_integration_DeletedDetectedAt;
        expect(stamped).toBeTruthy();

        const again = fakeEntity(TOMBSTONE_FIELDS, { __mj_integration_DeletedDetectedAt: '2026-01-01T00:00:00.000Z', __mj_integration_IsTombstoned: true });
        e.setStandardIntegrationFields(again, record({}, { SourceDeleted: true }));
        expect(again.data.__mj_integration_DeletedDetectedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('when the flag clears, the row comes back: IsTombstoned false and DeletedDetectedAt cleared', () => {
        const e = engine();
        const entity = fakeEntity(TOMBSTONE_FIELDS, { __mj_integration_DeletedDetectedAt: '2026-01-01T00:00:00.000Z', __mj_integration_IsTombstoned: true });
        e.setStandardIntegrationFields(entity, record({}));
        expect(entity.data.__mj_integration_IsTombstoned).toBe(false);
        expect(entity.data.__mj_integration_DeletedDetectedAt).toBeNull();
        expect(entity.data.__mj_integration_SyncStatus).toBe('Active');
    });
});
