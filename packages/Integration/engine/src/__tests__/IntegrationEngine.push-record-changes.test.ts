/**
 * Incremental push must query the REGISTERED Record Changes entity.
 *
 * `loadChangedMJRecords` is the only source of work for an incremental Push/Bidirectional sync.
 * The entity is registered as 'MJ: Record Changes'; the provider fails a RunView against any
 * other name. The loader treats a failed RunView as "no changes", so querying the unprefixed
 * 'Record Changes' made every incremental push silently push nothing, for every connector.
 *
 * The RunView mock below behaves like the provider: it answers ONE entity name and returns
 * { Success: false } for anything else. The pair of tests proves which name the engine asks for.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompositeKey, UserInfo } from '@memberjunction/core';

interface RunViewParams { EntityName?: string; ExtraFilter?: string }
interface ChangeRow { RecordID: string; Type: string; ChangedAt: string }

// The entity name the mocked provider recognises for this test, plus its seeded rows.
const providerState = vi.hoisted(() => ({
    registeredName: 'MJ: Record Changes',
    rows: [] as Array<ChangeRow & { DbChangedAt7?: string }>,
    calls: [] as RunViewParams[],
    recordMaps: [] as Array<{ ID?: string; EntityRecordID?: string; ExternalSystemRecordID: string }>,
    fieldMaps: [] as Array<{ SourceFieldName: string; DestinationFieldName: string; Direction: string }>,
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            async RunView(params: RunViewParams) {
                providerState.calls.push(params);
                if (params.EntityName === 'MJ: Company Integration Field Maps') {
                    return { Success: true, Results: providerState.fieldMaps };
                }
                if (params.EntityName === 'MJ: Company Integration Record Maps') {
                    const m = params.ExtraFilter?.match(/EntityRecordID='([^']+)'/);
                    if (m && providerState.recordMaps.some(rm => rm.EntityRecordID !== undefined)) {
                        return {
                            Success: true,
                            Results: providerState.recordMaps.filter(rm => rm.EntityRecordID === m[1]),
                        };
                    }
                    return { Success: true, Results: providerState.recordMaps };
                }
                if (params.EntityName !== providerState.registeredName) {
                    return { Success: false, Results: [], ErrorMessage: `Entity ${params.EntityName} not found` };
                }
                const wmMatch = params.ExtraFilter?.match(/ChangedAt > '([^']+)'/);
                if (wmMatch) {
                    const wm = wmMatch[1];
                    const filtered = providerState.rows.filter(r => {
                        const dbTs = r.DbChangedAt7 ?? (r.ChangedAt instanceof Date ? r.ChangedAt.toISOString() : String(r.ChangedAt));
                        return dbTs > wm;
                    });
                    return { Success: true, Results: filtered };
                }
                return { Success: true, Results: providerState.rows };
            }
        },
    };
});

const { IntegrationEngine } = await import('../IntegrationEngine.js');

type LoadedChange = { RecordID: string; Type: string; ChangedAt: string; Fields: Record<string, unknown> };
type LoaderHost = {
    loadChangedMJRecords: (entityMap: unknown, lastPushAt: string | null, contextUser: UserInfo) => Promise<LoadedChange[]>;
};

const contextUser = { ID: 'user-1' } as UserInfo;
const entityMap = { ID: 'em-1', Entity: 'Contacts', EntityID: 'ent-contacts' };
const RECORD_ID = '7f1c2a90-0000-4000-8000-000000000001';
const RECORD_FIELDS = { ID: RECORD_ID, Email: 'subscriber@example.test', FirstName: 'Ada' };

/** Prototype-backed host: the REAL private loader runs; only the provider is stubbed. */
function makeHost(): LoaderHost & { loadedKeys: CompositeKey[] } {
    const host = Object.create(IntegrationEngine.prototype) as unknown as LoaderHost & { loadedKeys: CompositeKey[] };
    host.loadedKeys = [];
    Object.defineProperty(host, 'ProviderToUse', {
        value: {
            EntityByName: () => ({ PrimaryKeys: [{ Name: 'ID' }] }),
            GetEntityObject: async () => ({
                InnerLoad: async (key: CompositeKey) => { host.loadedKeys.push(key); return true; },
                GetAll: () => ({ ...RECORD_FIELDS }),
            }),
        },
        configurable: true,
    });
    return host;
}

describe('IntegrationEngine.loadChangedMJRecords — queries the registered Record Changes entity', () => {
    beforeEach(() => {
        providerState.calls = [];
        providerState.rows = [{ RecordID: `ID|${RECORD_ID}`, Type: 'Create', ChangedAt: '2026-11-16T10:00:00.000Z' }];
    });

    it("returns the seeded Create change with its fields loaded when the provider answers only 'MJ: Record Changes'", async () => {
        providerState.registeredName = 'MJ: Record Changes';
        const host = makeHost();

        const changes = await host.loadChangedMJRecords(entityMap, null, contextUser);

        expect(providerState.calls).toHaveLength(1);
        expect(providerState.calls[0].EntityName).toBe('MJ: Record Changes');
        expect(changes).toHaveLength(1);
        expect(changes[0].RecordID).toBe(RECORD_ID);
        expect(changes[0].Type).toBe('Create');
        expect(changes[0].Fields).toEqual(RECORD_FIELDS);
        expect(host.loadedKeys).toHaveLength(1);
        expect(host.loadedKeys[0].KeyValuePairs).toEqual([{ FieldName: 'ID', Value: RECORD_ID }]);
    });

    it("returns [] when the provider answers only the old unprefixed 'Record Changes' name", async () => {
        providerState.registeredName = 'Record Changes';
        const host = makeHost();

        const changes = await host.loadChangedMJRecords(entityMap, null, contextUser);

        expect(providerState.calls).toHaveLength(1);
        expect(providerState.calls[0].EntityName).not.toBe('Record Changes');
        expect(changes).toEqual([]);
        expect(host.loadedKeys).toHaveLength(0);
    });
});

describe('IntegrationEngine.loadChangedMJRecords — ChangedAt is normalised to ISO text', () => {
    beforeEach(() => { providerState.registeredName = 'MJ: Record Changes'; providerState.calls = []; });
    it('returns an ISO string when the provider hands back a Date (the push watermark is stored as text and must stay filterable)', async () => {
        providerState.calls = [];
        const at = new Date('2026-11-17T06:25:06.893Z');
        providerState.rows = [{ RecordID: `ID|${RECORD_ID}`, Type: 'Create', ChangedAt: at as unknown as string }];
        const changes = await makeHost().loadChangedMJRecords(entityMap, null, contextUser);
        expect(changes).toHaveLength(1);
        expect(typeof changes[0].ChangedAt).toBe('string');
        expect(changes[0].ChangedAt).toBe('2026-11-17T06:25:06.893Z');
        // A JSON-serialised Date ("\"2026-…Z\"") is exactly the shape that broke the `ChangedAt > '…'` filter.
        expect(changes[0].ChangedAt.startsWith('"')).toBe(false);
    });

    it('passes a string ChangedAt through unchanged', async () => {
        providerState.rows = [{ RecordID: `ID|${RECORD_ID}`, Type: 'Update', ChangedAt: '2026-11-17T06:25:06.893Z' }];
        const changes = await makeHost().loadChangedMJRecords(entityMap, null, contextUser);
        expect(changes[0].ChangedAt).toBe('2026-11-17T06:25:06.893Z');
    });
});

describe('IntegrationEngine.pushSingleRecord — a Delete that cannot be performed is a SKIP, never a connector call', () => {
    type PushHost = {
        pushSingleRecord: (change: LoadedChange, config: unknown, entityMap: unknown, pushFieldMaps: unknown[], result: Record<string, number | unknown[]>, contextUser: UserInfo) => Promise<void>;
    };
    const makePushHost = () => {
        const host = Object.create(IntegrationEngine.prototype) as unknown as PushHost & { rateLimit: () => Promise<void>; warnPushSkip: () => void };
        host.rateLimit = async () => {};
        host.warnPushSkip = () => {};
        return host;
    };
    const emptyResult = () => ({ Success: true, RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0, RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [] });
    const fieldMaps = [{ SourceFieldName: 'email', DestinationFieldName: 'Email', Direction: 'Both' }];
    const change: LoadedChange = { RecordID: `ID|${RECORD_ID}`, Type: 'Delete', ChangedAt: '2026-11-17T06:25:06.893Z', Fields: {} };
    const connectorThatMustNotBeCalled = (supportsDelete: boolean) => ({
        SupportsDelete: supportsDelete, SupportsCreate: true, SupportsUpdate: true, SupportsGet: false,
        CreateRecord: async () => { throw new Error('CreateRecord must not be called for a Delete'); },
        UpdateRecord: async () => { throw new Error('UpdateRecord must not be called for a Delete'); },
        DeleteRecord: async () => { throw new Error('DeleteRecord must not be called without delete support'); },
    });

    it('skips a Delete for a record that was never pushed (no record map)', async () => {
        providerState.recordMaps = [];
        const result = emptyResult();
        await makePushHost().pushSingleRecord(change, { connector: connectorThatMustNotBeCalled(true), companyIntegration: { ID: 'ci-1' } }, entityMap, fieldMaps, result, contextUser);
        expect(result.RecordsSkipped).toBe(1);
        expect(result.RecordsErrored).toBe(0);
    });

    it('skips a Delete when the connector does not support delete, even with a record map', async () => {
        providerState.recordMaps = [{ ExternalSystemRecordID: '910002' }];
        const result = emptyResult();
        await makePushHost().pushSingleRecord(change, { connector: connectorThatMustNotBeCalled(false), companyIntegration: { ID: 'ci-1' } }, entityMap, fieldMaps, result, contextUser);
        expect(result.RecordsSkipped).toBe(1);
        expect(result.RecordsDeleted).toBe(0);
    });
});

describe('IntegrationEngine push watermark — rounds up to the next millisecond', () => {
    it('stores a watermark strictly above a sub-millisecond ChangedAt (regression: .2666667 re-selected by a .266 watermark)', async () => {
        providerState.registeredName = 'MJ: Record Changes'; providerState.calls = [];
        const updates: Array<{ value: string; direction: string }> = [];
        const host = Object.create(IntegrationEngine.prototype) as Record<string, unknown>;
        // exercise only the watermark derivation + update used by the push path
        host['watermarkService'] = { Update: async (_id: string, value: string, _u: unknown, direction: string) => { updates.push({ value, direction }); } };
        const latest = '2026-11-17T07:10:52.266Z';
        const parsed = new Date(latest);
        const watermark = new Date(parsed.getTime() + 1).toISOString();
        await (host['watermarkService'] as { Update: (a: string, b: string, c: unknown, d: string) => Promise<void> }).Update('em-1', watermark, contextUser, 'Push');
        expect(updates[0].value).toBe('2026-11-17T07:10:52.267Z');
        expect(updates[0].value > '2026-11-17T07:10:52.2666667Z').toBe(true);
    });
});

describe('IntegrationEngine.processPushSync — multi-pass end-to-end incremental loop across connector profiles', () => {
    type SyncOutcome = {
        Success: boolean;
        RecordsProcessed: number;
        RecordsCreated: number;
        RecordsUpdated: number;
        RecordsDeleted: number;
        RecordsErrored: number;
        RecordsSkipped: number;
        Errors: Array<{ ExternalID: string; ErrorMessage: string }>;
    };
    type ProcessPushHost = {
        processPushSync: (
            config: unknown,
            entityMap: unknown,
            run: { ID: string },
            contextUser: UserInfo,
            entityMapIndex: number,
            totalEntityMaps: number
        ) => Promise<SyncOutcome>;
    };

    const REC_A = '7f1c2a90-0000-4000-8000-000000000010';
    const REC_B = '7f1c2a90-0000-4000-8000-000000000020';
    const REC_UNMAPPED = '7f1c2a90-0000-4000-8000-000000000099';

    function makeStatefulPushHarness(opts: { supportsDelete: boolean }) {
        let watermark: string | null = null;
        const mjRows = new Map<string, Record<string, unknown>>();
        const vendorOps: Array<{ op: 'create' | 'update' | 'delete'; externalID?: string; attrs?: Record<string, unknown> }> = [];
        let nextVendorId = 5001;
        let failRecordID: string | null = null;

        providerState.registeredName = 'MJ: Record Changes';
        providerState.calls = [];
        providerState.rows = [];
        providerState.recordMaps = [];
        providerState.fieldMaps = [
            { SourceFieldName: 'email', DestinationFieldName: 'Email', Direction: 'Both' },
            { SourceFieldName: 'firstname', DestinationFieldName: 'FirstName', Direction: 'DestToSource' },
        ];

        const host = Object.create(IntegrationEngine.prototype) as unknown as ProcessPushHost & Record<string, unknown>;
        host['MaxBatchSize'] = 100;
        host['assertOwnershipAtBoundary'] = async () => {};
        host['rateLimit'] = async () => {};
        host['reportRateForCrud'] = () => {};
        host['warnPushSkip'] = () => {};
        host['createRunDetail'] = async () => {};
        host['saveRecordMap'] = async (_ciId: string, extId: string, _entId: string, mjId: string) => {
            providerState.recordMaps.push({ EntityRecordID: mjId, ExternalSystemRecordID: extId });
        };
        host['watermarkService'] = {
            Load: async () => (watermark ? { WatermarkValue: watermark } : null),
            Update: async (_id: string, val: string) => { watermark = val; },
        };
        Object.defineProperty(host, 'ProviderToUse', {
            value: {
                EntityByName: () => ({
                    PrimaryKeys: [{ Name: 'ID' }],
                    Fields: [{ Name: 'ID' }, { Name: 'Email' }, { Name: 'FirstName' }],
                }),
                GetEntityObject: async () => {
                    let loadedRow: Record<string, unknown> | undefined;
                    return {
                        InnerLoad: async (key: CompositeKey) => {
                            const id = String(key.KeyValuePairs[0]?.Value ?? '');
                            loadedRow = mjRows.get(id);
                            return Boolean(loadedRow);
                        },
                        GetAll: () => ({ ...(loadedRow ?? {}) }),
                    };
                },
            },
            configurable: true,
        });

        const connector = {
            SupportsCreate: true,
            SupportsUpdate: true,
            SupportsDelete: opts.supportsDelete,
            SupportsGet: false,
            CreateRecord: async (ctx: { Attributes: Record<string, unknown> }) => {
                if (failRecordID && ctx.Attributes['email'] === 'fail@example.test') {
                    return { Success: false, StatusCode: 500, ErrorMessage: 'Simulated vendor 500' };
                }
                const extId = String(nextVendorId++);
                vendorOps.push({ op: 'create', externalID: extId, attrs: { ...ctx.Attributes } });
                return { Success: true, ExternalID: extId, StatusCode: 201 };
            },
            UpdateRecord: async (ctx: { ExternalID: string; Attributes: Record<string, unknown> }) => {
                vendorOps.push({ op: 'update', externalID: ctx.ExternalID, attrs: { ...ctx.Attributes } });
                return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
            },
            DeleteRecord: async (ctx: { ExternalID: string }) => {
                if (!opts.supportsDelete) throw new Error('DeleteRecord called when SupportsDelete=false');
                vendorOps.push({ op: 'delete', externalID: ctx.ExternalID });
                return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 204 };
            },
        };

        const map = { ID: 'em-contacts', Entity: 'Contacts', EntityID: 'ent-contacts', ExternalObjectName: 'contacts' };
        const runSync = () => host.processPushSync({ connector, companyIntegration: { ID: 'ci-1' }, fullSync: false }, map, { ID: 'run-1' }, contextUser, 0, 1);

        return {
            mjRows,
            vendorOps,
            runSync,
            getWatermark: () => watermark,
            setFailOnEmail: (flag: boolean) => { failRecordID = flag ? REC_B : null; },
        };
    }

    it('REST full-CRUD connector (HubSpot/Salesforce shape): create -> idempotent no-op -> update -> mapped delete + unmapped delete skip -> error clamp', async () => {
        const h = makeStatefulPushHarness({ supportsDelete: true });

        // Pass 1: Create with a Date instance carrying .266ms against a 7-digit SQL timestamp (.2666667Z)
        h.mjRows.set(REC_A, { ID: REC_A, Email: 'ada@example.test', FirstName: 'Ada' });
        providerState.rows.push({
            RecordID: `ID|${REC_A}`,
            Type: 'Create',
            ChangedAt: new Date('2026-11-17T07:10:52.266Z') as unknown as string,
            DbChangedAt7: '2026-11-17T07:10:52.2666667Z',
        });

        const pass1 = await h.runSync();
        expect(pass1.RecordsCreated).toBe(1);
        expect(pass1.RecordsErrored).toBe(0);
        expect(h.getWatermark()).toBe('2026-11-17T07:10:52.267Z');
        expect(h.vendorOps).toEqual([{ op: 'create', externalID: '5001', attrs: { email: 'ada@example.test', firstname: 'Ada' } }]);

        // Pass 2: Immediate re-sync — .267Z watermark strictly exceeds .2666667Z, so 0 changes selected and 0 vendor calls
        const pass2 = await h.runSync();
        expect(pass2.RecordsProcessed).toBe(0);
        expect(h.vendorOps).toHaveLength(1);

        // Pass 3: Update mapped record -> routes to UpdateRecord with ExternalID 5001
        h.mjRows.set(REC_A, { ID: REC_A, Email: 'ada@example.test', FirstName: 'Augusta' });
        providerState.rows.push({
            RecordID: `ID|${REC_A}`,
            Type: 'Update',
            ChangedAt: new Date('2026-11-17T07:12:00.100Z') as unknown as string,
            DbChangedAt7: '2026-11-17T07:12:00.1004000Z',
        });

        const pass3 = await h.runSync();
        expect(pass3.RecordsUpdated).toBe(1);
        expect(pass3.RecordsCreated).toBe(0);
        expect(h.getWatermark()).toBe('2026-11-17T07:12:00.101Z');
        expect(h.vendorOps[1]).toEqual({ op: 'update', externalID: '5001', attrs: { email: 'ada@example.test', firstname: 'Augusta' } });

        // Pass 4: Delete mapped record + Delete never-pushed record -> 1 deleted, 1 skipped, 0 errors, watermark advances
        h.mjRows.delete(REC_A);
        providerState.rows.push(
            {
                RecordID: `ID|${REC_UNMAPPED}`,
                Type: 'Delete',
                ChangedAt: new Date('2026-11-17T07:13:00.000Z') as unknown as string,
                DbChangedAt7: '2026-11-17T07:13:00.0001000Z',
            },
            {
                RecordID: `ID|${REC_A}`,
                Type: 'Delete',
                ChangedAt: new Date('2026-11-17T07:13:05.500Z') as unknown as string,
                DbChangedAt7: '2026-11-17T07:13:05.5009000Z',
            }
        );

        const pass4 = await h.runSync();
        expect(pass4.RecordsDeleted).toBe(1);
        expect(pass4.RecordsSkipped).toBe(1);
        expect(pass4.RecordsErrored).toBe(0);
        expect(h.getWatermark()).toBe('2026-11-17T07:13:05.501Z');
        expect(h.vendorOps[2]).toEqual({ op: 'delete', externalID: '5001' });

        // Pass 5: Earlier record succeeds, later record fails -> watermark clamps below failure so retry re-selects ONLY the failed record
        const REC_OK = '7f1c2a90-0000-4000-8000-000000000030';
        h.mjRows.set(REC_OK, { ID: REC_OK, Email: 'grace@example.test', FirstName: 'Grace' });
        h.mjRows.set(REC_B, { ID: REC_B, Email: 'fail@example.test', FirstName: 'Fail' });
        h.setFailOnEmail(true);
        providerState.rows.push(
            {
                RecordID: `ID|${REC_OK}`,
                Type: 'Create',
                ChangedAt: new Date('2026-11-17T07:14:00.200Z') as unknown as string,
                DbChangedAt7: '2026-11-17T07:14:00.2003000Z',
            },
            {
                RecordID: `ID|${REC_B}`,
                Type: 'Create',
                ChangedAt: new Date('2026-11-17T07:14:10.800Z') as unknown as string,
                DbChangedAt7: '2026-11-17T07:14:10.8005000Z',
            }
        );

        const pass5 = await h.runSync();
        expect(pass5.RecordsCreated).toBe(1);
        expect(pass5.RecordsErrored).toBe(1);
        expect(h.getWatermark()).toBe('2026-11-17T07:14:00.201Z');

        // Vendor recovers -> Pass 6 retries ONLY REC_B and advances watermark past it
        h.setFailOnEmail(false);
        const pass6 = await h.runSync();
        expect(pass6.RecordsProcessed).toBe(1);
        expect(pass6.RecordsCreated).toBe(1);
        expect(pass6.RecordsErrored).toBe(0);
        expect(h.getWatermark()).toBe('2026-11-17T07:14:10.801Z');
    });

    it('Create/update-only connector without delete support (Informz shape): mapped Delete skips cleanly and advances watermark without stalling', async () => {
        const h = makeStatefulPushHarness({ supportsDelete: false });

        h.mjRows.set(REC_A, { ID: REC_A, Email: 'member@example.test', FirstName: 'Linus' });
        providerState.rows.push({
            RecordID: `ID|${REC_A}`,
            Type: 'Create',
            ChangedAt: new Date('2026-11-17T08:00:00.400Z') as unknown as string,
            DbChangedAt7: '2026-11-17T08:00:00.4008000Z',
        });

        const pass1 = await h.runSync();
        expect(pass1.RecordsCreated).toBe(1);
        expect(h.getWatermark()).toBe('2026-11-17T08:00:00.401Z');

        // Delete arrives for the mapped subscriber -> skipped cleanly, watermark advances, next pass selects 0 rows
        h.mjRows.delete(REC_A);
        providerState.rows.push({
            RecordID: `ID|${REC_A}`,
            Type: 'Delete',
            ChangedAt: new Date('2026-11-17T08:05:00.900Z') as unknown as string,
            DbChangedAt7: '2026-11-17T08:05:00.9002000Z',
        });

        const pass2 = await h.runSync();
        expect(pass2.RecordsSkipped).toBe(1);
        expect(pass2.RecordsErrored).toBe(0);
        expect(h.getWatermark()).toBe('2026-11-17T08:05:00.901Z');

        const pass3 = await h.runSync();
        expect(pass3.RecordsProcessed).toBe(0);
    });
});
