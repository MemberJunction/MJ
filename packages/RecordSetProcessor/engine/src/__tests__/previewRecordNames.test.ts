import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, EntityFieldRules, EntityInfo, FieldPermissionAccess, UserInfo, UserRoleInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { FieldRulesResultPayload, IRecordProcessor, RecordProcessorContext, RecordRef, RecordResult, WriteBackRunPayload } from '@memberjunction/record-set-processor-base';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import type { OutputMappingConfig } from '../writeBack';
import { FieldRulesProcessor } from '../processors/FieldRulesProcessor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import { PreviewRecordNames } from '../previewRecordNames';

/**
 * F14: a dry run's preview names what it shows. The processed records carry their display names (from the rows the
 * source loaded when those hold the name fields), and every foreign-key value of a field or child change carries the
 * related record's name. A whole batch is named at once: one `RunViews` call, one view per related entity, so N
 * records × K foreign keys cost at most one read per related entity (ruling QF-B1: the dialog reads nothing itself).
 */

const USER = new UserInfo();
const PEOPLE = ['5A5A0001-0000-4000-8000-000000000001', '5A5A0001-0000-4000-8000-000000000002', '5A5A0001-0000-4000-8000-000000000003'];
const SENIOR = '11111111-1111-4111-8111-111111111111';
const DIRECTOR = '22222222-2222-4222-8222-222222222222';
const ENGINEERING = '7E010001-A101-4B01-8C01-000000000001';
const SALES = '7E010001-A101-4B01-8C01-000000000002';

/** The role of {@link INTERN_USER}: field security lets it read People.FirstName but not People.LastName. */
const INTERN_ROLE = 'B0000000-0000-0000-0000-0000000000A1';
const INTERN_USER = new UserInfo(null, { ID: 'intern', IsActive: true, UserRoles: [new UserRoleInfo({ UserID: 'intern', RoleID: INTERN_ROLE, Role: 'Intern' })] });

/** One field's read access for the intern role. */
function internRead(fieldId: string, access: FieldPermissionAccess): Record<string, unknown>[] {
    return [{ ID: `${fieldId}-perm`, EntityFieldID: fieldId, RoleID: INTERN_ROLE, ReadAccess: access,
        UpdateAccess: FieldPermissionAccess.NoAccess, CreateAccess: FieldPermissionAccess.NoAccess }];
}

/**
 * People (named by FirstName + LastName), Person Job Functions and the two lookup entities; ID is each one's key. With
 * `peopleFieldSecurity`, People has field-level security on and the intern may read FirstName but not LastName.
 */
function entities(peopleFieldSecurity = false): EntityInfo[] {
    const key = { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true };
    return [
        new EntityInfo({ ID: 'ENT-PEOPLE', Name: 'People', EnableFieldLevelSecurity: peopleFieldSecurity,
            Permissions: [{ EntityID: 'ENT-PEOPLE', RoleID: INTERN_ROLE, CanRead: true }], Fields: [
            { ID: 'f-id', ...key, EntityFieldPermissions: internRead('f-id', FieldPermissionAccess.Allow) },
            { ID: 'f-first', Name: 'FirstName', Type: 'nvarchar', IsNameField: true, Sequence: 2, EntityFieldPermissions: internRead('f-first', FieldPermissionAccess.Allow) },
            { ID: 'f-last', Name: 'LastName', Type: 'nvarchar', IsNameField: true, Sequence: 3, EntityFieldPermissions: internRead('f-last', FieldPermissionAccess.Deny) },
            { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', RelatedEntity: 'Seniority Levels', Sequence: 4 }, { Name: 'Nickname', Type: 'nvarchar', Sequence: 5 }] }),
        new EntityInfo({ ID: 'ENT-PJF', Name: 'Person Job Functions', Fields: [key, { Name: 'PersonID', Type: 'uniqueidentifier', RelatedEntity: 'People' },
            { Name: 'JobFunctionID', Type: 'uniqueidentifier', RelatedEntity: 'Job Functions' }, { Name: 'Sequence', Type: 'int' }] }),
        new EntityInfo({ ID: 'ENT-SL', Name: 'Seniority Levels', Fields: [key, { Name: 'Name', Type: 'nvarchar', IsNameField: true }] }),
        new EntityInfo({ ID: 'ENT-JF', Name: 'Job Functions', Fields: [key, { Name: 'Name', Type: 'nvarchar', IsNameField: true }] }),
        new EntityInfo({ ID: 'ENT-RL', Name: 'Region Links', Fields: [{ Name: 'RegionID', Type: 'int', IsPrimaryKey: true }, { Name: 'Code', Type: 'nvarchar', IsPrimaryKey: true },
            { Name: 'Label', Type: 'nvarchar', IsNameField: true }] }),
    ];
}

/** A loaded row: its field values live in a map, as write-back reads them by config-named field. */
class Row extends BaseEntity {
    constructor(entity: EntityInfo, private readonly values: Record<string, unknown>) {
        super(entity);
    }
    public override Get(f: string): unknown { return this.values[f]; }
    public override async InnerLoad(): Promise<boolean> { return true; }
}

/** Every record a test's views can return, by entity: SQL Server returns keys upper-case, so these are upper-case. */
const STORE: Record<string, Array<Record<string, unknown>>> = {
    'People': PEOPLE.map((ID, i) => ({ ID, FirstName: ['Alex', 'Bea', 'Cy'][i], LastName: 'Kim' })),
    'Seniority Levels': [{ ID: SENIOR, Name: 'Senior' }, { ID: DIRECTOR, Name: 'Director' }],
    'Job Functions': [{ ID: ENGINEERING, Name: 'Engineering' }, { ID: SALES, Name: 'Sales' }],
};

/**
 * A provider double that knows the entities and serves each processed People row from `Stored`. Its `RunView` (the
 * write-back's reads of existing child rows) answers no rows; its `RunViews` answers each view from {@link STORE} by
 * the keys in the view's filter and the fields it asks for, recording every view in `Views` (the reads to count).
 */
class NamingProvider extends EntitiesOnlyProvider {
    public readonly Views: RunViewParams[] = [];
    public FailViews = false;
    /** An entity whose view answers as failed (e.g. the user may not read it). */
    public FailEntity = '';
    constructor(private readonly stored: Record<string, Record<string, unknown>> = {}, private readonly hidden: string[] = [], peopleFieldSecurity = false) {
        super(entities(peopleFieldSecurity));
    }
    /** `as T`: the generic return every provider implementation makes. */
    public override async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
        const row: BaseEntity = new Row(this.EntityByName(entityName)!, this.currentPerson);
        return row as T;
    }
    public currentPerson: Record<string, unknown> = {};
    public override async RunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }
    /** `as T`: the rows are the store's plain rows, the caller's row type. */
    public override async RunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        this.Views.push(...params);
        if (this.FailViews) {
            throw new Error('views unavailable');
        }
        return params.map((p) => {
            if (p.EntityName === this.FailEntity) {
                return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'permission denied' };
            }
            const filter = typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '';
            const keys = new Set([...filter.matchAll(/'([^']+)'/g)].map((m) => m[1].toUpperCase()));
            const rows = (STORE[p.EntityName || ''] || []).filter((r) => keys.has(String(r.ID).toUpperCase()))
                // a field the user may not read comes back empty (field-level security)
                .map((r) => Object.fromEntries((p.Fields || []).map((f) => [f, this.hidden.includes(`${p.EntityName}.${f}`) ? null : r[f]])));
            return { Success: true, Results: rows as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
        });
    }
    /** Serves the processed record `id`, as the write-back loads it. */
    public Load(id: string): void {
        this.currentPerson = this.stored[id] || { ID: id };
    }
}

/** An inner processor that answers each person with a seniority, a nickname, and two job functions. */
function innerFor(provider: NamingProvider): IRecordProcessor {
    return {
        ProcessRecord: async (r: RecordRef): Promise<RecordResult> => {
            provider.Load(r.RecordID);
            return { Status: 'Succeeded', ResultPayload: { SeniorityLevelID: DIRECTOR, Nickname: 'AK', Functions: [{ JobFunctionID: ENGINEERING.toLowerCase(), Sequence: 1 }, { JobFunctionID: SALES, Sequence: 2 }] } };
        },
    };
}

const mapping: OutputMappingConfig = {
    fields: { SeniorityLevelID: '$.SeniorityLevelID', Nickname: '$.Nickname' },
    childRecords: [{ entity: 'Person Job Functions', parentField: 'PersonID', fanOutRef: '$.Functions', map: { JobFunctionID: '$.JobFunctionID', Sequence: '$.Sequence' } }],
};

/** The write-back of a result. */
function writeBackOf(result: RecordResult | undefined) {
    return (result?.ResultPayload as WriteBackRunPayload | undefined)?.writeBack;
}

/** Finishes a dry-run batch the way the record loop does: one `CompleteDryRunBatch` call with every record's result. */
async function complete(processor: IRecordProcessor, records: RecordRef[], results: Map<string, RecordResult>, context: RecordProcessorContext): Promise<void> {
    await processor.CompleteDryRunBatch?.(records.map((r) => ({ Record: r, Result: results.get(r.RecordID)! })), context);
}

/** A dry-run batch over the people, each carrying the row the source loaded (`loaded`), the people stored at their old seniority. */
async function dryRunBatch(loaded: (id: string) => Record<string, unknown>, provider = new NamingProvider(
    Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }]))), contextUser: UserInfo = USER) {
    const records: RecordRef[] = PEOPLE.map((id) => ({ EntityID: 'ENT-PEOPLE', RecordID: id, Record: loaded(id) }));
    const processor = new WriteBackProcessor(innerFor(provider), mapping, true);
    const context: RecordProcessorContext = { contextUser, provider, DryRun: true };
    const results = await processor.ProcessBatch(records, context);
    await complete(processor, records, results, context);
    return { provider, results };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('dry-run preview record names, batched (F14)', () => {
    it('names a batch of 3 records × 3 foreign keys with one read per related entity, and no read for records loaded with their names', async () => {
        const logged = vi.spyOn(console, 'error');
        const { provider, results } = await dryRunBatch((id) => STORE['People'].find((p) => p.ID === id)!);

        expect(logged.mock.calls.filter((c) => String(c[0]).includes('reading record names failed'))).toHaveLength(0);

        // Seniority Levels and Job Functions: two related entities, two views, in one RunViews call; People named from their rows
        expect(provider.Views.map((v) => v.EntityName).sort()).toEqual(['Job Functions', 'Seniority Levels']);
        const first = writeBackOf(results.get(PEOPLE[0]));
        expect(first?.RecordName).toBe('Alex Kim');
        expect(writeBackOf(results.get(PEOPLE[2]))?.RecordName).toBe('Cy Kim');
        expect(first?.previewFieldChanges).toEqual([
            { Field: 'SeniorityLevelID', OldValue: SENIOR, NewValue: DIRECTOR, OldValueName: 'Senior', NewValueName: 'Director' },
            { Field: 'Nickname', OldValue: null, NewValue: 'AK' },
        ]);
        expect(first?.previewChildChanges?.map((c) => c.ValueNames)).toEqual([
            { PersonID: 'Alex Kim', JobFunctionID: 'Engineering' },
            { PersonID: 'Alex Kim', JobFunctionID: 'Sales' },
        ]);
        // each key is read once for the whole batch
        const jobFunctions = provider.Views.find((v) => v.EntityName === 'Job Functions');
        expect(jobFunctions?.ExtraFilter).toBe(`[ID] IN ('${ENGINEERING.toLowerCase()}', '${SALES}')`);
        expect(jobFunctions?.Fields).toEqual(['ID', 'Name']);
    });

    it('reads the processed records in the same call when the source did not load their names', async () => {
        const { provider, results } = await dryRunBatch(() => ({}));

        expect(provider.Views.map((v) => v.EntityName).sort()).toEqual(['Job Functions', 'People', 'Seniority Levels']);
        expect(writeBackOf(results.get(PEOPLE[1]))?.RecordName).toBe('Bea Kim');
    });

    it('leaves a value as its ID when the user may not read its name (field-level security empties it)', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])), ['Seniority Levels.Name']);
        const { results } = await dryRunBatch(() => ({}), provider);

        expect(writeBackOf(results.get(PEOPLE[0]))?.previewFieldChanges?.[0]).toEqual({ Field: 'SeniorityLevelID', OldValue: SENIOR, NewValue: DIRECTOR });
        expect(writeBackOf(results.get(PEOPLE[0]))?.previewChildChanges?.[0].ValueNames).toEqual({ PersonID: 'Alex Kim', JobFunctionID: 'Engineering' });
    });

    it('keeps the previews, logging once for the batch, when the names cannot be read', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])));
        provider.FailViews = true;
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const { results } = await dryRunBatch(() => ({}), provider);

        expect(writeBackOf(results.get(PEOPLE[0]))?.RecordName).toBeUndefined();
        expect(writeBackOf(results.get(PEOPLE[0]))?.previewFieldChanges?.map((c) => c.Field)).toEqual(['SeniorityLevelID', 'Nickname']);
        expect(logged.mock.calls.filter((c) => String(c[0]).includes('reading record names failed'))).toHaveLength(1);
    });

    it('logs once for the batch when a view fails, and keeps the names the other views read', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])));
        provider.FailEntity = 'Seniority Levels';
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const { results } = await dryRunBatch(() => ({}), provider);

        expect(writeBackOf(results.get(PEOPLE[0]))?.previewFieldChanges?.[0].NewValueName).toBeUndefined();
        expect(writeBackOf(results.get(PEOPLE[0]))?.previewChildChanges?.[0].ValueNames?.JobFunctionID).toBe('Engineering');
        const lines = logged.mock.calls.filter((c) => String(c[0]).includes('reading record names failed'));
        expect(lines).toHaveLength(1);
        expect(String(lines[0][0])).toContain('Seniority Levels: permission denied');
    });

    it('names a batch the inner processor ran as a batch the same way, with one read per related entity', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])));
        const single = innerFor(provider);
        const batching: IRecordProcessor = {
            ProcessRecord: single.ProcessRecord,
            ProcessBatch: async (recs: RecordRef[]) => new Map(await Promise.all(recs.map(async (r) => [r.RecordID, await single.ProcessRecord(r, { contextUser: USER, provider })] as const))),
        };
        // the inner batch answers all records first; each record's write-back then loads its own row
        vi.spyOn(provider, 'GetEntityObject').mockImplementation(async <T extends BaseEntity>(): Promise<T> => { const row: BaseEntity = new Row(provider.EntityByName('People')!, { SeniorityLevelID: SENIOR, Nickname: null }); return row as T; });
        const records: RecordRef[] = PEOPLE.map((id) => ({ EntityID: 'ENT-PEOPLE', RecordID: id, Record: STORE['People'].find((p) => p.ID === id) }));

        const processor = new WriteBackProcessor(batching, mapping, true);
        const results = await processor.ProcessBatch(records, { contextUser: USER, provider, DryRun: true });
        await complete(processor, records, results, { contextUser: USER, provider, DryRun: true });

        expect(provider.Views.map((v) => v.EntityName).sort()).toEqual(['Job Functions', 'Seniority Levels']);
        expect(writeBackOf(results.get(PEOPLE[1]))?.RecordName).toBe('Bea Kim');
        expect(writeBackOf(results.get(PEOPLE[1]))?.previewFieldChanges?.[0].NewValueName).toBe('Director');
    });

    it('names a field matched by Name through fieldLookups on the lookup\'s related entity', async () => {
        const provider = new NamingProvider({ [PEOPLE[0]]: { ID: PEOPLE[0], Nickname: null } });
        const lookupMapping: OutputMappingConfig = { fields: { Nickname: '$.Level' }, fieldLookups: { Nickname: { relatedEntity: 'Seniority Levels' } } };
        // the lookup resolves 'Director' to the level's key (the write-back's own lookup read answers it)
        vi.spyOn(provider, 'RunView').mockImplementation(async <T,>(): Promise<RunViewResult<T>> =>
            ({ Success: true, Results: [{ ID: DIRECTOR }] as T[], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '' }));
        const inner: IRecordProcessor = { ProcessRecord: async () => { provider.Load(PEOPLE[0]); return { Status: 'Succeeded', ResultPayload: { Level: 'Director' } }; } };

        const processor = new WriteBackProcessor(inner, lookupMapping, true);
        const records: RecordRef[] = [{ EntityID: 'ENT-PEOPLE', RecordID: PEOPLE[0], Record: {} }];
        const results = await processor.ProcessBatch(records, { contextUser: USER, provider, DryRun: true });
        await complete(processor, records, results, { contextUser: USER, provider, DryRun: true });

        expect(writeBackOf(results.get(PEOPLE[0]))?.previewFieldChanges).toEqual([{ Field: 'Nickname', OldValue: null, NewValue: DIRECTOR, NewValueName: 'Director' }]);
    });

    it('names only the processed record when the real write would fail (the dialog shows its errors, no changes)', async () => {
        const provider = new NamingProvider({ [PEOPLE[0]]: { ID: PEOPLE[0] } });
        const twice: OutputMappingConfig = { childRecords: [{ entity: 'Person Job Functions', parentField: 'PersonID', fanOutRef: '$.Functions',
            map: { JobFunctionID: '$.JobFunctionID' }, reconcile: { keyFields: ['JobFunctionID'], deleteStale: false } }] };
        const inner: IRecordProcessor = { ProcessRecord: async () => ({ Status: 'Succeeded', ResultPayload: { Functions: [{ JobFunctionID: ENGINEERING }, { JobFunctionID: ENGINEERING }] } }) };

        const processor = new WriteBackProcessor(inner, twice, true);
        const records: RecordRef[] = [{ EntityID: 'ENT-PEOPLE', RecordID: PEOPLE[0], Record: {} }];
        const results = await processor.ProcessBatch(records, { contextUser: USER, provider, DryRun: true });
        await complete(processor, records, results, { contextUser: USER, provider, DryRun: true });

        expect(writeBackOf(results.get(PEOPLE[0]))?.PreviewErrors?.length).toBeGreaterThan(0);
        expect(writeBackOf(results.get(PEOPLE[0]))?.RecordName).toBe('Alex Kim');
        expect(provider.Views.map((v) => v.EntityName)).toEqual(['People']);
    });

    it('reads no names on a real write', async () => {
        const provider = new NamingProvider({ [PEOPLE[0]]: { ID: PEOPLE[0], Nickname: 'AK' } });
        const inner: IRecordProcessor = { ProcessRecord: async () => { provider.Load(PEOPLE[0]); return { Status: 'Succeeded', ResultPayload: { Nickname: 'AK' } }; } };

        const result = await new WriteBackProcessor(inner, { fields: { Nickname: '$.Nickname' } }).ProcessRecord({ EntityID: 'ENT-PEOPLE', RecordID: PEOPLE[0], Record: {} }, { contextUser: USER, provider });

        expect(writeBackOf(result)?.RecordName).toBeUndefined();
        expect(provider.Views).toHaveLength(0);
    });

    it('leaves a record whose inner work failed (no write-back) as it is, and names the rest', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])));
        const answering = innerFor(provider);
        const inner: IRecordProcessor = {
            ProcessRecord: async (r: RecordRef, c: RecordProcessorContext) => (r.RecordID === PEOPLE[1] ? { Status: 'Failed', ErrorMessage: 'model timeout', ResultPayload: { raw: 'x' } } : answering.ProcessRecord(r, c)),
        };
        const records: RecordRef[] = PEOPLE.map((id) => ({ EntityID: 'ENT-PEOPLE', RecordID: id, Record: {} }));
        const context: RecordProcessorContext = { contextUser: USER, provider, DryRun: true };
        const processor = new WriteBackProcessor(inner, mapping, true);
        const results = await processor.ProcessBatch(records, context);

        await complete(processor, records, results, context);

        expect(results.get(PEOPLE[1])?.ResultPayload).toEqual({ raw: 'x' });
        expect(writeBackOf(results.get(PEOPLE[2]))?.RecordName).toBe('Cy Kim');
    });

    it('leaves naming to the batch: processing alone names nothing (the loop finishes the batch)', async () => {
        const provider = new NamingProvider({ [PEOPLE[0]]: { ID: PEOPLE[0], SeniorityLevelID: SENIOR, Nickname: null } });

        const result = await new WriteBackProcessor(innerFor(provider), mapping, true).ProcessRecord({ EntityID: 'ENT-PEOPLE', RecordID: PEOPLE[0], Record: {} }, { contextUser: USER, provider, DryRun: true });

        expect(writeBackOf(result)?.RecordName).toBeUndefined();
        expect(provider.Views).toHaveLength(0);
    });

    it('shows no part of a name the user may not read whole: a read record keeps its ID (field-level security)', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])), [], true);
        const { results } = await dryRunBatch(() => ({}), provider, INTERN_USER);

        // FirstName is readable, LastName is not: no "Alex", no read of People at all; the other names still show
        expect(provider.Views.map((v) => v.EntityName).sort()).toEqual(['Job Functions', 'Seniority Levels']);
        expect(writeBackOf(results.get(PEOPLE[0]))?.RecordName).toBeUndefined();
        expect(writeBackOf(results.get(PEOPLE[0]))?.previewChildChanges?.[0].ValueNames).toEqual({ JobFunctionID: 'Engineering' });
        expect(writeBackOf(results.get(PEOPLE[0]))?.previewFieldChanges?.[0].NewValueName).toBe('Director');
    });

    it('shows no part of a name the user may not read whole: a loaded row is not used either', async () => {
        const provider = new NamingProvider(Object.fromEntries(PEOPLE.map((id) => [id, { ID: id, SeniorityLevelID: SENIOR, Nickname: null }])), [], true);
        const { results } = await dryRunBatch((id) => STORE['People'].find((p) => p.ID === id)!, provider, INTERN_USER);

        expect(writeBackOf(results.get(PEOPLE[0]))?.RecordName).toBeUndefined();
        expect(writeBackOf(results.get(PEOPLE[0]))?.previewChildChanges?.[0].ValueNames).not.toHaveProperty('PersonID');
    });

    it('reads a record whose loaded row lacks one of its name fields, never naming it from part of them', async () => {
        const { provider, results } = await dryRunBatch((id) => ({ ID: id, LastName: 'Kim' }));

        expect(provider.Views.map((v) => v.EntityName)).toContain('People');
        expect(writeBackOf(results.get(PEOPLE[0]))?.RecordName).toBe('Alex Kim');
    });
});

describe('PreviewRecordNames keys', () => {
    it('names a composite-key record from its loaded row', () => {
        const names = new PreviewRecordNames(new NamingProvider(), USER);
        const regionLinks = entities()[4];
        names.AddLoadedRecord(regionLinks, 'RegionID|7||Code|EU', { RegionID: 7, Code: 'EU', Label: 'Europe West' });

        expect(names.RecordName(regionLinks, 'RegionID|7||Code|EU')).toBe('Europe West');
        expect(names.RecordName(regionLinks, 'RegionID|7||Code|US')).toBeUndefined();
    });

    it('reads composite-key records it could not name from a loaded row, matching each key\'s fields', async () => {
        const provider = new NamingProvider();
        vi.spyOn(provider, 'RunViews').mockImplementation(async <T,>(params: RunViewParams[]): Promise<RunViewResult<T>[]> => {
            provider.Views.push(...params);
            const rows = [{ RegionID: 7, Code: 'EU', Label: 'Europe West' }, { RegionID: 8, Code: 'US', Label: 'US East' }];
            return [{ Success: true, Results: rows as T[], RowCount: 2, TotalRowCount: 2, ExecutionTime: 0, ErrorMessage: '' }];
        });
        const names = new PreviewRecordNames(provider, USER);
        const regionLinks = entities()[4];
        names.AddLoadedRecord(regionLinks, 'RegionID|7||Code|EU', {});
        names.AddLoadedRecord(regionLinks, 'RegionID|8||Code|US', undefined);

        await names.Resolve();

        expect(provider.Views.map((v) => v.ExtraFilter)).toEqual(["([RegionID] = '7' AND [Code] = 'EU') OR ([RegionID] = '8' AND [Code] = 'US')"]);
        expect(names.RecordName(regionLinks, 'RegionID|7||Code|EU')).toBe('Europe West');
        expect(names.RecordName(regionLinks, 'RegionID|8||Code|US')).toBe('US East');
    });

    it('takes a UUID, a number or an integer as text as a key, and nothing else', () => {
        expect([ENGINEERING, 42, '42', ' 7 ', 'preview-new-Job Functions-Chef', 'Director', 4.5, null].map((v) => PreviewRecordNames.IsKeyValue(v)))
            .toEqual([true, true, true, true, false, false, true, false]);
    });
});

describe('FieldRules dry-run diff names, batched (F14 sweep)', () => {
    /** The rules' diff for a person: a seniority change (a foreign key), a nickname change, and a rule that did not apply. */
    function rulesResult(dryRun: boolean) {
        return {
            DryRun: dryRun, Saved: !dryRun, Errors: [], AppliedFields: ['SeniorityLevelID', 'Nickname'],
            Changes: [
                { Field: 'SeniorityLevelID', OldValue: SENIOR, NewValue: DIRECTOR, Changed: true, Applied: true },
                { Field: 'Nickname', OldValue: null, NewValue: 'AK', Changed: true, Applied: true },
                { Field: 'Nickname', OldValue: null, NewValue: null, Changed: false, Applied: false, SkipReason: 'condition false' },
            ],
        };
    }
    const stored = Object.fromEntries(STORE['People'].map((p) => [String(p.ID), p]));
    const people: RecordRef[] = PEOPLE.map((id) => ({ EntityID: 'ENT-PEOPLE', RecordID: id }));

    /** A provider whose loaded People rows are the stored people (so their names come from the loaded entity). */
    function fieldRulesProvider(): NamingProvider {
        const provider = new NamingProvider(stored);
        vi.spyOn(provider, 'GetEntityObject').mockImplementation(async <T extends BaseEntity>(): Promise<T> => { const row: BaseEntity = new Row(provider.EntityByName('People')!, {}); return row as T; });
        return provider;
    }

    /** Processes each person, then finishes the batch as the loop does on a dry run. */
    async function runFieldRules(processor: FieldRulesProcessor, context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        const results = new Map<string, RecordResult>();
        for (const record of people) {
            results.set(record.RecordID, await processor.ProcessRecord(record, context));
        }
        if (context.DryRun) {
            await complete(processor, people, results, context);
        }
        return results;
    }

    it('names each processed record from the loaded entity and the batch\'s foreign keys in one read per related entity', async () => {
        const provider = new NamingProvider(stored);
        let loaded = 0;
        vi.spyOn(provider, 'GetEntityObject').mockImplementation(async <T extends BaseEntity>(): Promise<T> => { const row: BaseEntity = new Row(provider.EntityByName('People')!, stored[PEOPLE[loaded++]]); return row as T; });
        vi.spyOn(EntityFieldRules.prototype, 'ApplyToEntity').mockImplementation(async () => rulesResult(true));

        const results = await runFieldRules(new FieldRulesProcessor({ RuleSet: { Rules: [] }, DryRun: true }), { contextUser: USER, provider, DryRun: true });
        const payload = results.get(PEOPLE[1])?.ResultPayload as FieldRulesResultPayload;

        expect(results.get(PEOPLE[1])?.Status).toBe('Succeeded');
        expect(payload.RecordName).toBe('Bea Kim');
        expect(payload.Changes[0]).toEqual({ Field: 'SeniorityLevelID', OldValue: SENIOR, NewValue: DIRECTOR, Changed: true, Applied: true, OldValueName: 'Senior', NewValueName: 'Director' });
        expect(payload.Changes[1]).toEqual({ Field: 'Nickname', OldValue: null, NewValue: 'AK', Changed: true, Applied: true });
        expect(provider.Views.map((v) => v.EntityName)).toEqual(['Seniority Levels']);
    });

    it('reads no names on a real run, and keeps no loaded record for naming', async () => {
        const provider = fieldRulesProvider();
        vi.spyOn(EntityFieldRules.prototype, 'ApplyToEntity').mockImplementation(async () => rulesResult(false));
        const processor = new FieldRulesProcessor({ RuleSet: { Rules: [] } });

        const results = await runFieldRules(processor, { contextUser: USER, provider });
        // even if a real run's results reached the batch hook, they carry no dry-run diff to name
        await complete(processor, people, results, { contextUser: USER, provider });
        const payload = results.get(PEOPLE[0])?.ResultPayload as FieldRulesResultPayload;

        expect(payload.RecordName).toBeUndefined();
        expect(payload.Changes[0]).not.toHaveProperty('NewValueName');
        expect(provider.Views).toHaveLength(0);
    });

    it('keeps no loaded record when a processor built with DryRun runs inside a real loop (the batch hook never drains it)', async () => {
        const provider = new NamingProvider(stored);
        let loaded = 0;
        vi.spyOn(provider, 'GetEntityObject').mockImplementation(async <T extends BaseEntity>(): Promise<T> => { const row: BaseEntity = new Row(provider.EntityByName('People')!, stored[PEOPLE[loaded++]]); return row as T; });
        vi.spyOn(EntityFieldRules.prototype, 'ApplyToEntity').mockImplementation(async () => rulesResult(true));
        const processor = new FieldRulesProcessor({ RuleSet: { Rules: [] }, DryRun: true });

        const results = await runFieldRules(processor, { contextUser: USER, provider });
        // a later dry-run batch completion finds no held entity, so it names no processed record from a loaded row
        await complete(processor, people, results, { contextUser: USER, provider, DryRun: true });
        const payload = results.get(PEOPLE[1])?.ResultPayload as FieldRulesResultPayload;

        expect(payload.RecordName).toBeUndefined();
    });
});

describe('the write-back wrapper forwards a dry run\'s refusal (F16)', () => {
    it('reports the wrapped processor\'s refusal, and none when the wrapped processor has no check', () => {
        const refusing = { ProcessRecord: vi.fn(), CurrentRunRefusal: () => 'v6 is not activated' };
        expect(new WriteBackProcessor(refusing, { fields: {} }, true).CurrentRunRefusal()).toBe('v6 is not activated');
        expect(new WriteBackProcessor({ ProcessRecord: vi.fn() }, { fields: {} }, true).CurrentRunRefusal()).toBeNull();
    });
});
