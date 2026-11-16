import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationEngine, RunFailed } from '../IntegrationEngine.js';
import { CONTENT_HASH_COLUMN, ComputeContentHash } from '../ContentHash.js';
import type { MappedRecord, SyncResult } from '../types.js';

/**
 * #5202 / #3528 through the real apply path: `applySingleRecord` with in-memory stand-ins for the
 * destination table and the record-map table. The earlier tests called `setStandardIntegrationFields`
 * and `isSourceFlaggedDeleted` directly, so they could not see the skip paths that return before the
 * flag is ever applied (the content-hash precheck, the create-path hash check, the dirty check), nor
 * what a flagged row does to the next run.
 */

type Row = Record<string, unknown>;
type MapRow = { ID: string; CompanyIntegrationID: string; EntityID: string; ExternalSystemRecordID: string; EntityRecordID: string; Origin: string };

let mapRows: Map<string, MapRow>;
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                if (params.EntityName !== 'MJ: Company Integration Record Maps') return { Success: true, Results: [] };
                const ext = /ExternalSystemRecordID='([^']*)'/.exec(params.ExtraFilter ?? '')?.[1];
                return { Success: true, Results: [...mapRows.values()].filter(r => r.ExternalSystemRecordID === ext).map(r => ({ ...r })) };
            }
        },
    };
});

const TOMBSTONE = ['__mj_integration_SyncStatus', '__mj_integration_IsTombstoned', '__mj_integration_DeletedDetectedAt', '__mj_integration_LastSyncedAt'];
const WITH_TOMBSTONE = ['ID', 'Name', ...TOMBSTONE, CONTENT_HASH_COLUMN];
const WITHOUT_TOMBSTONE = ['ID', 'Name', CONTENT_HASH_COLUMN];

const FLAG = JSON.stringify({ sourceDeleteField: 'member_delete_flag', sourceDeleteValue: '1' });
const MAPPED = { ID: 'mj-1', Name: 'Ann' };

function harness(fieldNames: string[]) {
    const db = new Map<string, Row>();
    const writes: string[] = [];
    let seq = 0;

    const targetEntity = () => {
        let data: Row = {};
        let original: Row = {};
        return {
            Fields: fieldNames.map(Name => ({ Name })),
            LatestResult: undefined,
            get Dirty() { return Object.keys(data).some(k => data[k] !== original[k]); },
            get PrimaryKey() { return { KeyValuePairs: [{ FieldName: 'ID', Value: data.ID }] }; },
            InnerLoad: async (key: { KeyValuePairs: Array<{ Value: unknown }> }) => {
                const row = db.get(String(key.KeyValuePairs[0].Value));
                if (!row) return false;
                data = { ...row }; original = { ...row };
                return true;
            },
            NewRecord: () => { data = {}; original = {}; },
            Get: (k: string) => data[k],
            Set: (k: string, v: unknown) => { data[k] = v; },
            Save: async () => { db.set(String(data.ID), { ...data }); original = { ...data }; writes.push(`save:${data.ID}`); return true; },
            Delete: async () => { db.delete(String(data.ID)); writes.push(`delete:${data.ID}`); return true; },
        };
    };

    class FakeRecordMap {
        ID = ''; CompanyIntegrationID = ''; EntityID = ''; ExternalSystemRecordID = ''; EntityRecordID = '';
        // The column's database default; a write that forgets Origin lands here.
        Origin = 'Created';
        LatestResult = undefined;
        async Load(id: string) { const r = mapRows.get(id); if (!r) return false; Object.assign(this, r); return true; }
        async InnerLoad(key: { KeyValuePairs: Array<{ Value: unknown }> }) { return this.Load(String(key.KeyValuePairs[0].Value)); }
        NewRecord() { this.ID = `map-${++seq}`; this.Origin = 'Created'; }
        async Save() {
            mapRows.set(this.ID, {
                ID: this.ID, CompanyIntegrationID: this.CompanyIntegrationID, EntityID: this.EntityID,
                ExternalSystemRecordID: this.ExternalSystemRecordID, EntityRecordID: this.EntityRecordID, Origin: this.Origin,
            });
            return true;
        }
        async Delete() { mapRows.delete(this.ID); return true; }
    }

    const md = {
        EntityByName: () => ({ Fields: fieldNames.map(Name => ({ Name })), PrimaryKeys: [{ Name: 'ID' }] }),
        GetEntityObject: async (name: string) => name === 'MJ: Company Integration Record Maps' ? new FakeRecordMap() : targetEntity(),
    };
    const engine = Object.create(IntegrationEngine.prototype) as unknown as {
        applySingleRecord(
            record: MappedRecord, ci: unknown, entityMap: unknown, result: SyncResult, user: unknown,
            logger?: unknown, precheck?: unknown, reconciledSkipIds?: string[],
        ): Promise<void>;
    };
    Object.defineProperty(engine, 'ProviderToUse', { get: () => md });

    const warnings: string[] = [];
    const logger = { emit: vi.fn(), warning: (_o: string, code: string) => warnings.push(code) };

    /** Matching as the real MatchEngine does through the record map: a mapped external ID resolves to its row. */
    const match = (ext: string) => [...mapRows.values()].find(r => r.ExternalSystemRecordID === ext)?.EntityRecordID;

    const apply = async (opts: {
        behavior: 'SoftDelete' | 'HardDelete';
        flagged: boolean;
        changeType?: MappedRecord['ChangeType'];
        precheck?: boolean;
        matchedID?: string | null;
        mapped?: Row;
    }) => {
        const mapped = opts.mapped ?? MAPPED;
        const matched = opts.matchedID === undefined ? match('ext-1') : opts.matchedID ?? undefined;
        const record: MappedRecord = {
            ExternalRecord: { ExternalID: 'ext-1', ObjectType: 'member', Fields: { member_delete_flag: opts.flagged ? '1' : '0' } },
            MJEntityName: 'Members',
            MappedFields: { ...mapped },
            ChangeType: opts.changeType ?? (matched ? 'Update' : 'Create'),
            MatchedMJRecordID: matched,
        };
        const stored = matched ? db.get(matched)?.[CONTENT_HASH_COLUMN] : undefined;
        const precheck = opts.precheck
            ? { Hashes: new Map(matched && typeof stored === 'string' ? [[matched, stored]] : []), Present: new Set(matched ? [matched] : []), CoversWholeBatch: true }
            : undefined;
        const result: SyncResult = {
            Success: true, RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0, RecordsDeleted: 0,
            RecordsErrored: 0, RecordsSkipped: 0, Errors: [],
        } as unknown as SyncResult;
        await engine.applySingleRecord(
            record, { ID: 'ci-1' },
            { ID: 'em-1', Entity: 'Members', EntityID: 'ent-1', ExternalObjectName: 'member', DeleteBehavior: opts.behavior, Configuration: FLAG },
            result, { ID: 'u-1' }, logger, precheck, [],
        );
        return result;
    };

    /** A destination row written by an earlier sync of {@link MAPPED}, plus its record map. */
    const seed = (row: Row = {}, origin: 'Created' | 'Adopted' | null = 'Created') => {
        db.set('mj-1', {
            ...MAPPED,
            __mj_integration_SyncStatus: 'Active', __mj_integration_IsTombstoned: false,
            [CONTENT_HASH_COLUMN]: ComputeContentHash(MAPPED),
            ...row,
        });
        if (origin) {
            mapRows.set('map-0', { ID: 'map-0', CompanyIntegrationID: 'ci-1', EntityID: 'ent-1', ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-1', Origin: origin });
        }
    };

    return { db, writes, warnings, apply, seed };
}

beforeEach(() => { mapRows = new Map(); });

describe('source delete flag under SoftDelete, through applySingleRecord (#5202)', () => {
    it.each([true, false])('archives a live row when only the flag changed (hash precheck %s)', async (precheck) => {
        const h = harness(WITH_TOMBSTONE);
        h.seed();
        await h.apply({ behavior: 'SoftDelete', flagged: true, precheck });
        expect(h.db.get('mj-1')?.__mj_integration_IsTombstoned).toBe(true);
        expect(h.db.get('mj-1')?.__mj_integration_SyncStatus).toBe('Archived');
    });

    it('archives on the create path too, where the stored hash matches the incoming fields', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, null); // the row exists, but no record map points at it
        await h.apply({ behavior: 'SoftDelete', flagged: true, matchedID: null });
        expect(h.db.get('mj-1')?.__mj_integration_IsTombstoned).toBe(true);
    });

    it.each([true, false])('brings a tombstoned row back when the flag clears (hash precheck %s)', async (precheck) => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({ __mj_integration_IsTombstoned: true, __mj_integration_SyncStatus: 'Archived', __mj_integration_DeletedDetectedAt: '2026-01-01T00:00:00.000Z' });
        await h.apply({ behavior: 'SoftDelete', flagged: false, precheck });
        expect(h.db.get('mj-1')?.__mj_integration_IsTombstoned).toBe(false);
        expect(h.db.get('mj-1')?.__mj_integration_SyncStatus).toBe('Active');
        expect(h.db.get('mj-1')?.__mj_integration_DeletedDetectedAt).toBeNull();
    });

    it.each([true, false])('does not rewrite a row that is already tombstoned and still flagged (hash precheck %s)', async (precheck) => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({ __mj_integration_IsTombstoned: true, __mj_integration_SyncStatus: 'Archived' });
        const result = await h.apply({ behavior: 'SoftDelete', flagged: true, precheck });
        expect(h.writes).toEqual([]);
        expect(result.RecordsSkipped).toBe(1);
    });

    it('warns SOFT_DELETE_UNSUPPORTED when the entity has no tombstone columns, as the sweep does', async () => {
        const h = harness(WITHOUT_TOMBSTONE);
        h.seed();
        const result = await h.apply({ behavior: 'SoftDelete', flagged: true, mapped: { ...MAPPED, Name: 'Ann B' } });
        expect(h.warnings).toEqual(['SOFT_DELETE_UNSUPPORTED']);
        expect(result.RecordsUpdated).toBe(1);
    });
});

describe('source delete flag under HardDelete, through applySingleRecord (#5202, #3528)', () => {
    it('deletes a row the sync created, prunes its map, and later runs skip the still-flagged record', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, 'Created');
        const runs = [];
        for (let i = 0; i < 3; i++) runs.push(await h.apply({ behavior: 'HardDelete', flagged: true }));

        expect(runs.map(r => [r.RecordsDeleted, r.RecordsErrored, RunFailed(r)])).toEqual([
            [1, 0, false],
            [0, 0, false],
            [0, 0, false],
        ]);
        expect(h.db.has('mj-1')).toBe(false);
        expect(mapRows.size).toBe(0);
    });

    it('a matched row that is already gone is skipped, not an error, and its map is pruned', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, 'Created');
        h.db.delete('mj-1');
        const result = await h.apply({ behavior: 'HardDelete', flagged: true });
        expect(result.RecordsErrored).toBe(0);
        expect(result.RecordsSkipped).toBe(1);
        expect(mapRows.size).toBe(0);
    });

    it('archives an adopted row instead of deleting it, keeps its map, and does not rewrite it next run', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, 'Adopted');
        const first = await h.apply({ behavior: 'HardDelete', flagged: true });
        expect(first.RecordsDeleted).toBe(1);
        expect(h.db.get('mj-1')?.__mj_integration_IsTombstoned).toBe(true);
        expect(h.writes).toEqual(['save:mj-1']);
        expect(mapRows.get('map-0')?.Origin).toBe('Adopted');

        const second = await h.apply({ behavior: 'HardDelete', flagged: true });
        expect(second.RecordsSkipped).toBe(1);
        expect(h.writes).toEqual(['save:mj-1']);
    });

    it('treats a row matched with no record map (found by key fields) as adopted', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, null);
        await h.apply({ behavior: 'HardDelete', flagged: true, matchedID: 'mj-1' });
        expect(h.db.has('mj-1')).toBe(true);
        expect(h.db.get('mj-1')?.__mj_integration_IsTombstoned).toBe(true);
    });

    it('keeps an adopted row with ADOPTED_ROW_KEPT when the entity cannot be archived', async () => {
        const h = harness(WITHOUT_TOMBSTONE);
        h.seed({}, 'Adopted');
        const result = await h.apply({ behavior: 'HardDelete', flagged: true });
        expect(h.db.has('mj-1')).toBe(true);
        expect(result.RecordsSkipped).toBe(1);
        expect(result.RecordsErrored).toBe(0);
        expect(h.warnings).toContain('ADOPTED_ROW_KEPT');
    });

    it('an explicit Delete event for a row already gone counts as skipped', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, 'Created');
        h.db.delete('mj-1');
        const result = await h.apply({ behavior: 'HardDelete', flagged: false, changeType: 'Delete' });
        expect(result.RecordsErrored).toBe(0);
        expect(result.RecordsSkipped).toBe(1);
    });
});

describe('record map Origin, through applySingleRecord (#3528)', () => {
    it('a row the sync inserts is mapped Created', async () => {
        const h = harness(WITH_TOMBSTONE);
        await h.apply({ behavior: 'HardDelete', flagged: false, matchedID: null });
        expect(h.db.has('mj-1')).toBe(true);
        expect([...mapRows.values()].map(r => r.Origin)).toEqual(['Created']);
    });

    it('a row that already existed is mapped Adopted (create path upsert)', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, null);
        await h.apply({ behavior: 'HardDelete', flagged: false, matchedID: null, mapped: { ...MAPPED, Name: 'Ann B' } });
        expect([...mapRows.values()].map(r => r.Origin)).toEqual(['Adopted']);
    });

    it('a matched update maps an unmapped row Adopted', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, null);
        await h.apply({ behavior: 'HardDelete', flagged: false, matchedID: 'mj-1', mapped: { ...MAPPED, Name: 'Ann B' } });
        expect([...mapRows.values()].map(r => r.Origin)).toEqual(['Adopted']);
    });

    it('an existing map keeps its origin when the sync repoints it', async () => {
        const h = harness(WITH_TOMBSTONE);
        h.seed({}, null);
        mapRows.set('map-0', { ID: 'map-0', CompanyIntegrationID: 'ci-1', EntityID: 'ent-1', ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-old', Origin: 'Created' });
        await h.apply({ behavior: 'HardDelete', flagged: false, matchedID: null, mapped: { ...MAPPED, Name: 'Ann B' } });
        expect(mapRows.get('map-0')).toMatchObject({ EntityRecordID: 'mj-1', Origin: 'Created' });
    });
});
