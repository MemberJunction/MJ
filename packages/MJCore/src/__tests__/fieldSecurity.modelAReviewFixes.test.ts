/**
 * Field-Level Security — Model A on the paths the hydration points do not cover.
 *
 * "An object built for a restricted user never holds a denied value" depends on more than the
 * hydration points. These tests pin the remaining ways in:
 *
 *  - a NEW record: `NewRecord()` leaves the user's denied fields not loaded, so a graph create or
 *    a new related row does not serialize them at their defaults (which the server refuses);
 *  - the graph payloads themselves drop denied fields, as the transaction-group serializer does;
 *  - the remote graph RESULT is narrowed before it is applied;
 *  - the user assigned AFTER hydration: re-narrows the object, its IS-A parent and its embeddeds;
 *  - an entity object passed to `LoadFromData` as the row;
 *  - `CopyFrom` from a full-width source skips what this object's user may not read;
 *  - client input on embedded records and `MergeRecords`' field map: denied and unknown keys get
 *    the same refusal;
 *  - the `save` event carries the names of the fields the save changed;
 *  - `FieldLevelSecurityApplies` and the denied walk read the same, live, ancestor chain;
 *  - the RunView row projection memoizes per key shape without losing per-row correctness.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MJEvent, MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo, FieldPermissionAccess, FieldSecurityError, RecordDependency, RecordMergeRequest } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import { AssertClientInputWritableForUser } from '../generic/entityValueFieldSecurity';
import { SaveEntityGraphInput, SaveEntityGraphOperation, SaveEntityGraphOutput } from '../generic/saveEntityGraphOperation';
import type { RelatedRecordCollectionWire } from '../generic/relatedRecordCollection';
import type { EmbeddedRecordWire } from '../generic/embeddedRecord';
import { DatabaseProviderBase, DeleteSQLResult, SaveSQLResult } from '../generic/databaseProviderBase';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';

// ─── Fixture ──────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees-model-a-fixes';
const ALLOW = FieldPermissionAccess.Allow;

function openTo(fieldId: string, roles: string[] = [HR_ROLE_ID, INTERN_ROLE_ID]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW,
    }));
}

/** `Employees`: `Salary` is HR-only; `Name`, `Notes` and `ManagerID` are open to both roles. */
function employeeEntity(): EntityInfo {
    const field = (id: string, seq: number, name: string, type: string, perms?: Record<string, unknown>[]) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type,
        AllowUpdateAPI: true, AllowsNull: true, EntityFieldPermissions: perms,
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees',
        IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, AllowRecordMerge: true,
        EnableFieldLevelSecurity: true,
        Permissions: [HR_ROLE_ID, INTERN_ROLE_ID].map(roleId => (
            { EntityID: ENTITY_ID, RoleID: roleId, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }
        )),
        Fields: [
            { ...field('f-id', 1, 'ID', 'uniqueidentifier'), IsPrimaryKey: true, AllowsNull: false },
            field('f-name', 2, 'Name', 'nvarchar', openTo('f-name')),
            field('f-salary', 3, 'Salary', 'money', openTo('f-salary', [HR_ROLE_ID])),
            field('f-notes', 4, 'Notes', 'nvarchar', openTo('f-notes')),
            field('f-manager', 5, 'ManagerID', 'uniqueidentifier', openTo('f-manager')),
        ],
    });
}

function buildUser(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = `User ${id}`;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

const ROW_ID = '11111111-0000-0000-0000-000000000001';
const SECRET = 250000;
const fullRow = (): Record<string, unknown> => ({ ID: ROW_ID, Name: 'Ada', Salary: SECRET, Notes: 'n', ManagerID: null });

let entityInfo: EntityInfo;
let intern: UserInfo;
let hr: UserInfo;
/** Rows the mock database holds, full width, keyed by ID. A column a save omits keeps its stored value, or none. */
let dbRows: Map<string, Record<string, unknown>>;
/** What each mock Save saw: whether Salary was not loaded on the entity at write time. */
let saveSawSalaryNotLoaded: boolean[];

@RegisterClass(BaseEntity, 'Employees')
class EmployeeEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
    // Typed accessors, as generated entity classes have: what an entity object passed as a row exposes.
    public get Name(): string { return this.Get('Name'); }
    public get Salary(): number { return this.Get('Salary'); }
    public get Notes(): string { return this.Get('Notes'); }
}

/** An Employee with a related-records collection (its reports) and an embedded manager record. */
class EmployeeGraphEntity extends EmployeeEntity {
    public readonly Reports = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Reports',
        RelatedEntity: 'Employees',
        RelatedEntityJoinField: 'Notes',
        OnRemove: 'delete',
    });
    public readonly Manager = this.DeclareEmbeddedRecord<BaseEntity>({
        ForeignKeyField: 'ManagerID',
        RelatedEntity: 'Employees',
    });
}

type MockProvider = ReturnType<typeof makeProvider>;

/**
 * A provider that behaves like a database: Load serves the FULL stored row, and Save writes the
 * loaded fields over the stored row and returns the FULL row. `transactions: false` makes it a
 * client tier, whose graph saves route to `server` through `RouteOperation`.
 */
function makeProvider(opts: { transactions: boolean; server?: { provider: MockProvider; user: UserInfo } }) {
    let depth = 0;
    const routed: SaveEntityGraphInput[] = [];
    let cannedOutput: SaveEntityGraphOutput | null = null;
    const provider = {
        CurrentUser: null as UserInfo | null,
        Entities: [entityInfo],
        EntityByName: (n: string) => (n === 'Employees' ? entityInfo : undefined),
        routed,
        setCannedOutput(o: SaveEntityGraphOutput) { cannedOutput = o; },
        get SupportsEntityTransactions() { return opts.transactions; },
        get IsInTransaction() { return depth > 0; },
        async BeginEntityTransaction() {
            depth++;
            let settled = false;
            const settle = async () => { if (!settled) { settled = true; depth--; } };
            return { IsNested: depth > 1, Commit: settle, Rollback: settle };
        },
        async RouteOperation(_key: string, input: SaveEntityGraphInput): Promise<unknown> {
            routed.push(JSON.parse(JSON.stringify(input)) as SaveEntityGraphInput);
            if (cannedOutput) {
                return { Success: true, Output: cannedOutput };
            }
            const server = opts.server!;
            return new SaveEntityGraphOperation().ExecuteServer(input, {
                provider: server.provider as unknown as IMetadataProvider, user: server.user, emitProgress: () => undefined,
            });
        },
        async GetEntityObject<T extends BaseEntity>(_name: string, user?: UserInfo): Promise<T> {
            const e = new EmployeeGraphEntity(entityInfo, provider as unknown as IEntityDataProvider);
            await e.Config(user ?? null);
            await e.InitializeEmbeddedRecords();
            e.NewRecord();
            return e as unknown as T;
        },
        async Load(_entity: BaseEntity, key: CompositeKey): Promise<Record<string, unknown> | null> {
            const row = dbRows.get(String(key.KeyValuePairs?.[0]?.Value ?? ''));
            return row ? { ...row } : null;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            const salary = entity.Fields.find(f => f.Name === 'Salary')!;
            saveSawSalaryNotLoaded.push(salary.NotLoaded);
            const own = entity.GetAll() as Record<string, unknown>;
            const id = String(own.ID);
            const stored = { ...(dbRows.get(id) ?? { Salary: 'db-default' }), ...own, ID: id };
            dbRows.set(id, stored);
            return { ...stored };
        },
        async Delete(): Promise<boolean> { return true; },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

/** A browser-tier provider whose graph saves are executed by a server-tier provider as `serverUser`. */
function clientAndServer(serverUser: UserInfo): { client: MockProvider; server: MockProvider } {
    const server = makeProvider({ transactions: true });
    const client = makeProvider({ transactions: false, server: { provider: server, user: serverUser } });
    return { client, server };
}

async function newEntity(provider: MockProvider, user: UserInfo | null): Promise<EmployeeGraphEntity> {
    return provider.GetEntityObject<EmployeeGraphEntity>('Employees', user ?? undefined);
}

function keysOf(o: Record<string, unknown>): string[] {
    return Object.keys(o).map(k => k.toLowerCase());
}

beforeAll(() => {
    entityInfo = employeeEntity();
    intern = buildUser([INTERN_ROLE_ID], 'intern-1');
    hr = buildUser([HR_ROLE_ID], 'hr-1');
    Metadata.Provider = {
        Entities: [entityInfo],
        EntityByID: (id: string) => (id === ENTITY_ID ? entityInfo : undefined),
        EntityByName: (n: string) => (n === 'Employees' ? entityInfo : undefined),
        CurrentUser: null,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    dbRows = new Map();
    saveSawSalaryNotLoaded = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. New records
// ═══════════════════════════════════════════════════════════════════════════

describe('a new record holds nothing its user is denied', () => {
    it('REGRESSION: NewRecord leaves denied fields not loaded, so GetAll omits them and the client gate accepts it', async () => {
        const e = await newEntity(makeProvider({ transactions: true }), intern);
        e.Set('Name', 'New');

        const payload = e.GetAll() as Record<string, unknown>;
        expect(keysOf(payload)).not.toContain('salary');
        expect(e.Fields.find(f => f.Name === 'Salary')!.NotLoaded).toBe(true);
        expect(() => AssertClientInputWritableForUser(entityInfo, payload, intern)).not.toThrow();
    });

    it('an unrestricted user and no user keep every field on a new record', async () => {
        for (const user of [hr, null]) {
            const e = await newEntity(makeProvider({ transactions: true }), user);
            expect(keysOf(e.GetAll() as Record<string, unknown>)).toContain('salary');
            expect(e.Fields.find(f => f.Name === 'Salary')!.NotLoaded).toBe(false);
        }
    });

    it('a restricted singular create still saves, and the denied column takes the database default', async () => {
        const provider = makeProvider({ transactions: true });
        const e = await newEntity(provider, intern);
        e.Set('Name', 'Single');

        await expect(e.Save()).resolves.toBe(true);

        expect(saveSawSalaryNotLoaded).toEqual([true]);
        const id = String(e.Get('ID'));
        expect(dbRows.get(id)?.Name).toBe('Single');
        expect(dbRows.get(id)?.Salary).toBe('db-default');
        expect(keysOf(e.GetAll() as Record<string, unknown>)).not.toContain('salary');
    });

    it('REGRESSION: a restricted remote graph create sends no denied field and the server saves it', async () => {
        const { client } = clientAndServer(intern);
        const root = await newEntity(client, intern);
        root.Set('Name', 'Root');
        const child = await root.Reports.Create();
        child.Set('Name', 'Child');

        const ok = await root.Save();

        expect(root.LatestResult?.CompleteMessage ?? '').toBe('');
        expect(ok).toBe(true);
        const sent = client.routed[0];
        expect(keysOf(sent.Fields)).not.toContain('salary');
        const wire = sent.Companions.find(c => c.Name === 'Reports')!.Data as RelatedRecordCollectionWire;
        expect(keysOf(wire.Items[0].Fields)).not.toContain('salary');
        expect(dbRows.get(String(root.Get('ID')))?.Name).toBe('Root');
        expect(dbRows.get(String(child.Get('ID')))?.Salary).toBe('db-default');
    });

    it('REGRESSION: a new related row added to an existing record by a restricted user saves', async () => {
        dbRows.set(ROW_ID, fullRow());
        const { client } = clientAndServer(intern);
        const root = await newEntity(client, intern);
        await root.LoadFromData(fullRow());
        const child = await root.Reports.Create();
        child.Set('Name', 'New report');

        await expect(root.Save()).resolves.toBe(true);

        const wire = client.routed[0].Companions.find(c => c.Name === 'Reports')!.Data as RelatedRecordCollectionWire;
        expect(keysOf(wire.Items[0].Fields)).not.toContain('salary');
        expect(dbRows.get(String(child.Get('ID')))?.Name).toBe('New report');
        expect(dbRows.get(ROW_ID)?.Salary).toBe(SECRET);
    });

    it('REGRESSION: the graph payloads drop a denied field that was put back on the record', async () => {
        const { client } = clientAndServer(intern);
        const root = await newEntity(client, intern);
        root.Set('Name', 'Root');
        // SetMany skips the readability assertion, so server-shaped code can re-add the key.
        root.SetMany({ Salary: 5 }, true);
        const child = await root.Reports.Create();
        child.Set('Name', 'Child');
        child.SetMany({ Salary: 6 }, true);

        await expect(root.Save()).resolves.toBe(true);

        const sent = client.routed[0];
        expect(keysOf(sent.Fields)).not.toContain('salary');
        const wire = sent.Companions.find(c => c.Name === 'Reports')!.Data as RelatedRecordCollectionWire;
        expect(keysOf(wire.Items[0].Fields)).not.toContain('salary');
    });

    it('an unrestricted remote graph create is unchanged: every field is sent', async () => {
        const { client } = clientAndServer(hr);
        const root = await newEntity(client, hr);
        root.Set('Name', 'Root');
        root.Set('Salary', 7);
        const child = await root.Reports.Create();
        child.Set('Name', 'Child');

        await expect(root.Save()).resolves.toBe(true);

        expect(client.routed[0].Fields.Salary).toBe(7);
        expect(dbRows.get(String(root.Get('ID')))?.Salary).toBe(7);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The remote graph result
// ═══════════════════════════════════════════════════════════════════════════

describe('a remote graph result is narrowed before it is applied', () => {
    it('REGRESSION: a full-width result row leaves no denied value on a restricted object', async () => {
        const client = makeProvider({ transactions: false });
        const root = await newEntity(client, intern);
        root.Set('Name', 'Root');
        await root.Reports.Create();
        client.setCannedOutput({ Success: true, Fields: { ...fullRow(), Name: 'Root' }, Companions: [] });

        await expect(root.Save()).resolves.toBe(true);

        expect(keysOf(root.GetAll() as Record<string, unknown>)).not.toContain('salary');
        expect(await root.GetDataObjectJSON()).not.toContain(String(SECRET));
        expect(() => root.Get('Salary')).toThrow(FieldSecurityError);
        expect(root.Get('Name')).toBe('Root');
    });

    it('an unrestricted object adopts the full result', async () => {
        const client = makeProvider({ transactions: false });
        const root = await newEntity(client, hr);
        root.Set('Name', 'Root');
        await root.Reports.Create();
        client.setCannedOutput({ Success: true, Fields: fullRow(), Companions: [] });

        await expect(root.Save()).resolves.toBe(true);
        expect(root.Get('Salary')).toBe(SECRET);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Latent traps: late user, entity as row, CopyFrom
// ═══════════════════════════════════════════════════════════════════════════

describe('assigning the user after hydration re-narrows the object', () => {
    it('REGRESSION: raw fast path — the denied value is gone from every accessor', async () => {
        const e = await newEntity(makeProvider({ transactions: true }), null);
        await e.LoadFromData(fullRow());
        e.ContextCurrentUser = intern;

        expect(keysOf(e.GetAll() as Record<string, unknown>)).not.toContain('salary');
        expect(await e.GetDataObjectJSON()).not.toContain(String(SECRET));
        expect(() => e.Get('Salary')).toThrow(FieldSecurityError);
        expect(e.Get('Name')).toBe('Ada');
    });

    it('REGRESSION: built fields — the denied field becomes not loaded and empty', async () => {
        const e = await newEntity(makeProvider({ transactions: true }), null);
        await e.LoadFromData(fullRow());
        void e.Fields;
        e.ContextCurrentUser = intern;

        const salary = e.Fields.find(f => f.Name === 'Salary')!;
        expect(salary.NotLoaded).toBe(true);
        expect(salary.Value ?? null).toBeNull();
        expect(await e.GetDataObjectJSON()).not.toContain(String(SECRET));
        expect(e.Get('Name')).toBe('Ada');
    });

    it('REGRESSION: the user reaches an embedded record, which is narrowed too', async () => {
        const owner = await newEntity(makeProvider({ transactions: true }), null);
        const wire: EmbeddedRecordWire = { EntityName: 'Employees', Fields: fullRow(), IsNew: false, Cleared: false, Companions: null };
        await owner.Manager.Deserialize(wire, 'result');
        const manager = owner.Manager.Value!;
        expect(manager.Get('Salary')).toBe(SECRET);

        owner.ContextCurrentUser = intern;

        expect(manager.ContextCurrentUser).toBe(intern);
        expect(keysOf(manager.GetAll() as Record<string, unknown>)).not.toContain('salary');
    });

    it('switching to an unrestricted user changes nothing it holds', async () => {
        const e = await newEntity(makeProvider({ transactions: true }), null);
        await e.LoadFromData(fullRow());
        e.ContextCurrentUser = hr;
        expect(e.Get('Salary')).toBe(SECRET);
    });
});

describe('an entity object passed to LoadFromData as the row', () => {
    it('REGRESSION: a full-width source object yields no denied value', async () => {
        const provider = makeProvider({ transactions: true });
        const source = await newEntity(provider, hr);
        await source.LoadFromData(fullRow());

        const target = await newEntity(provider, intern);
        await target.LoadFromData(source);

        expect(keysOf(target.GetAll() as Record<string, unknown>)).not.toContain('salary');
        expect(await target.GetDataObjectJSON()).not.toContain(String(SECRET));
        expect(target.Get('Name')).toBe('Ada');
    });

    it('a restricted source does not hand its narrowing to an unrestricted target as a value', async () => {
        const provider = makeProvider({ transactions: true });
        const source = await newEntity(provider, intern);
        await source.LoadFromData(fullRow());
        const target = await newEntity(provider, hr);
        await target.LoadFromData(source);
        expect(target.Get('Name')).toBe('Ada');
        expect(target.Fields.find(f => f.Name === 'Salary')!.NotLoaded).toBe(true);
    });
});

describe('CopyFrom from a full-width source', () => {
    it('REGRESSION: skips the fields this object may not read and copies the rest', async () => {
        const provider = makeProvider({ transactions: true });
        const source = await newEntity(provider, hr);
        await source.LoadFromData(fullRow());
        const target = await newEntity(provider, intern);

        expect(target.CopyFrom(source)).toBe(true);

        expect(target.Get('Name')).toBe('Ada');
        expect(target.Get('Notes')).toBe('n');
        expect(await target.GetDataObjectJSON()).not.toContain(String(SECRET));
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Client input: embedded records and MergeRecords
// ═══════════════════════════════════════════════════════════════════════════

/** The refusal message for `fn`, or null when it did not throw. */
async function refusal(fn: () => Promise<unknown>): Promise<string | null> {
    try {
        await fn();
        return null;
    } catch (e) {
        return e instanceof Error ? e.message.replace(/'[^']*'/, "'<key>'") : String(e);
    }
}

describe('embedded record client input', () => {
    async function deserializeAs(user: UserInfo, fields: Record<string, unknown>, isNew: boolean): Promise<string | null> {
        dbRows.set(ROW_ID, fullRow());
        const owner = await newEntity(makeProvider({ transactions: true }), user);
        const wire: EmbeddedRecordWire = { EntityName: 'Employees', Fields: fields, IsNew: isNew, Cleared: false, Companions: null };
        return refusal(() => owner.Manager.Deserialize(wire, 'request'));
    }

    for (const isNew of [true, false]) {
        it(`REGRESSION: a denied key and an unknown key get the same refusal (${isNew ? 'new' : 'existing'})`, async () => {
            const denied = await deserializeAs(intern, { ID: ROW_ID, Name: 'x', Salary: 1 }, isNew);
            const unknown = await deserializeAs(intern, { ID: ROW_ID, Name: 'x', Salarx: 1 }, isNew);
            expect(denied).not.toBeNull();
            expect(unknown).toBe(denied);
        });
    }

    it('readable input, and an unrestricted user, are accepted', async () => {
        expect(await deserializeAs(intern, { ID: ROW_ID, Name: 'x' }, false)).toBeNull();
        expect(await deserializeAs(hr, { ID: ROW_ID, Name: 'x', Salary: 1 }, false)).toBeNull();
    });
});

/** A database provider whose entity objects come from the mock provider, recording every save. */
class MergeProvider extends DatabaseProviderBase {
    public Saves: Record<string, unknown>[] = [];
    private readonly inner = makeProvider({ transactions: true });

    public override EntityByName(entityName: string): EntityInfo {
        return entityName === 'Employees' ? entityInfo : (undefined as unknown as EntityInfo);
    }
    public override async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
        const e = await this.inner.GetEntityObject<T>(entityName, contextUser);
        const saves = this.Saves;
        e.Save = async () => { saves.push(e.GetAll() as Record<string, unknown>); return true; };
        e.Delete = async () => true;
        return e;
    }
    protected override async StartMergeLogging(): Promise<BaseEntity> { return null as unknown as BaseEntity; }
    protected override async CompleteMergeLogging(): Promise<void> { /* no log */ }
    public override async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }

    async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    protected get UUIDFunctionPattern(): RegExp { return /^newid\(\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^getdate\(\)$/i; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec): Promise<RunQueryResult> {
        throw new Error('Not supported.');
    }
}

describe('MergeRecords field map', () => {
    function request(fieldName: string): RecordMergeRequest {
        return {
            EntityName: 'Employees',
            SurvivingRecordCompositeKey: CompositeKey.FromID(ROW_ID),
            RecordsToMerge: [],
            FieldMap: [{ FieldName: fieldName, Value: 1 }],
        };
    }

    it('REGRESSION: a denied field and an unknown field get the same refusal, and nothing is saved', async () => {
        dbRows.set(ROW_ID, fullRow());
        const provider = new MergeProvider();
        const denied = await refusal(() => provider.MergeRecords(request('Salary'), intern));
        const unknown = await refusal(() => provider.MergeRecords(request('Salarx'), intern));

        expect(denied).not.toBeNull();
        expect(unknown).toBe(denied);
        expect(provider.Saves).toHaveLength(0);
    });

    it('a readable field merges', async () => {
        dbRows.set(ROW_ID, fullRow());
        const provider = new MergeProvider();
        const result = await provider.MergeRecords(request('Notes'), intern);
        expect(result.Success).toBe(true);
        expect(provider.Saves[0].Notes).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. The save event names the changed fields
// ═══════════════════════════════════════════════════════════════════════════

describe('the save event carries the changed field names', () => {
    function captureSaveEvents(): { events: BaseEntityEvent[]; stop: () => void } {
        const events: BaseEntityEvent[] = [];
        const sub = MJGlobal.Instance.GetEventListener(false).subscribe((e: MJEvent) => {
            if (e?.args instanceof BaseEntityEvent && e.args.type === 'save') {
                events.push(e.args);
            }
        });
        return { events, stop: () => sub.unsubscribe() };
    }

    it('REGRESSION: an update names exactly the fields it changed, though the object is clean afterwards', async () => {
        dbRows.set(ROW_ID, fullRow());
        const e = await newEntity(makeProvider({ transactions: true }), hr);
        await e.InnerLoad(CompositeKey.FromID(ROW_ID));
        e.Set('Notes', 'edited');
        e.Set('Salary', 1);
        const { events, stop } = captureSaveEvents();

        await expect(e.Save()).resolves.toBe(true);
        stop();

        expect(e.Dirty).toBe(false);
        expect(events).toHaveLength(1);
        expect([...(events[0].ChangedFieldNames ?? [])].sort()).toEqual(['Notes', 'Salary']);
    });

    it('the instance event handler sees the same names', async () => {
        dbRows.set(ROW_ID, fullRow());
        const e = await newEntity(makeProvider({ transactions: true }), hr);
        await e.InnerLoad(CompositeKey.FromID(ROW_ID));
        e.Set('Name', 'Renamed');
        const seen: (string[] | undefined)[] = [];
        const sub = e.RegisterEventHandler(ev => { if (ev.type === 'save') seen.push(ev.ChangedFieldNames); });

        await e.Save();
        sub.unsubscribe();

        expect(seen).toEqual([['Name']]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. IS-A: FieldLevelSecurityApplies reads the live ancestor chain
// ═══════════════════════════════════════════════════════════════════════════

describe('FieldLevelSecurityApplies and the denied walk agree on the ancestors', () => {
    const PARENT_ID = 'C0000000-0000-0000-0000-000000000001';
    const CHILD_ID = 'C0000000-0000-0000-0000-000000000002';

    function people(enableFLS: boolean): EntityInfo {
        return new EntityInfo({
            ID: PARENT_ID, Name: 'People', SchemaName: 'dbo', BaseTable: 'People', BaseView: 'vwPeople',
            IncludeInAPI: true, EnableFieldLevelSecurity: enableFLS,
            Permissions: [HR_ROLE_ID, INTERN_ROLE_ID].map(r => ({ EntityID: PARENT_ID, RoleID: r, CanRead: true })),
            Fields: [
                { ID: 'pp-id', EntityID: PARENT_ID, Sequence: 1, Name: 'ID', Entity: 'People', Type: 'uniqueidentifier', IsPrimaryKey: true },
                { ID: 'pp-phone', EntityID: PARENT_ID, Sequence: 2, Name: 'Phone', Entity: 'People', Type: 'nvarchar',
                  EntityFieldPermissions: openTo('pp-phone', [HR_ROLE_ID]) },
            ],
        });
    }
    function contacts(): EntityInfo {
        return new EntityInfo({
            ID: CHILD_ID, Name: 'Contacts', ParentID: PARENT_ID, SchemaName: 'dbo', BaseTable: 'Contacts', BaseView: 'vwContacts',
            IncludeInAPI: true, EnableFieldLevelSecurity: false,
            Fields: [
                { ID: 'cc-id', EntityID: CHILD_ID, Sequence: 1, Name: 'ID', Entity: 'Contacts', Type: 'uniqueidentifier', IsPrimaryKey: true },
                { ID: 'cc-phone', EntityID: CHILD_ID, Sequence: 2, Name: 'Phone', Entity: 'Contacts', Type: 'nvarchar' },
            ],
        });
    }

    let previous: IMetadataProvider;
    beforeEach(() => { previous = Metadata.Provider; });
    afterAll(() => { Metadata.Provider = previous as unknown as ProviderBase; });

    it('REGRESSION: an ancestor replaced by a metadata refresh is seen by both', () => {
        const child = contacts();
        let parent = people(false);
        Metadata.Provider = {
            get Entities() { return [parent, child]; },
            EntityByID: (id: string) => (id === PARENT_ID ? parent : id === CHILD_ID ? child : undefined),
            EntityByName: (n: string) => (n === 'People' ? parent : n === 'Contacts' ? child : undefined),
            CurrentUser: null,
        } as unknown as ProviderBase;

        expect(child.FieldLevelSecurityApplies).toBe(false);
        parent = people(true); // the refresh turned field security on for the ancestor

        expect(child.FieldLevelSecurityApplies).toBe(true);
        expect(child.GetDeniedReadFields(intern).has('phone')).toBe(true);
        expect(child.GetDeniedReadFields(hr).has('phone')).toBe(false);
        Metadata.Provider = previous as unknown as ProviderBase;
    });

    it('REGRESSION: a user assigned after hydration reaches the IS-A parent and narrows it', async () => {
        const parentInfo = people(true);
        const childInfo = contacts();
        const byName = (n: string) => (n === 'People' ? parentInfo : n === 'Contacts' ? childInfo : undefined);
        class Plain extends BaseEntity {
            public override CheckPermissions(): boolean { return true; }
        }
        const provider = {
            CurrentUser: null,
            async GetEntityObject<T extends BaseEntity>(name: string, user?: UserInfo): Promise<T> {
                const e = new Plain(byName(name)!, provider as unknown as IEntityDataProvider);
                await e.Config(user ?? null);
                await e.InitializeParentEntity();
                e.NewRecord();
                return e as unknown as T;
            },
            SetCachedRecordName(): void { /* no-op */ },
            GetCachedRecordName(): string | undefined { return undefined; },
        };
        Metadata.Provider = {
            Entities: [parentInfo, childInfo],
            EntityByID: (id: string) => (id === PARENT_ID ? parentInfo : id === CHILD_ID ? childInfo : undefined),
            EntityByName: byName,
            CurrentUser: null,
        } as unknown as ProviderBase;

        const child = await provider.GetEntityObject<BaseEntity>('Contacts');
        await child.LoadFromData({ ID: ROW_ID, Phone: '555-0100' });
        expect(child.Get('Phone')).toBe('555-0100');

        child.ContextCurrentUser = intern;

        expect(child.ISAParent!.ContextCurrentUser).toBe(intern);
        expect(() => child.Get('Phone')).toThrow(FieldSecurityError);
        expect(keysOf(child.ISAParent!.GetAll() as Record<string, unknown>)).not.toContain('phone');
        expect(JSON.stringify(child.GetAll())).not.toContain('555-0100');
        Metadata.Provider = previous as unknown as ProviderBase;
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. RunView row projection: memoized per key shape
// ═══════════════════════════════════════════════════════════════════════════

describe('RunView row projection', () => {
    type Rows = Record<string, unknown>[];
    const omit = (rows: Rows, denied: Set<string>): Rows => ProviderBase['omitFieldsFromRows'](rows, denied);

    it('narrows each row by its own keys when shapes are mixed', () => {
        const rows: Rows = [
            { ID: 1, Name: 'a', Salary: 1 },
            { ID: 2, Name: 'b' },
            { id: 3, SALARY: 3, Notes: 'x' },
            { ID: 4, Name: 'd', Salary: 4 },
            { ' Salary ': 5, ID: 5 },
        ];
        const out = omit(rows, new Set(['salary']));
        expect(out).toEqual([{ ID: 1, Name: 'a' }, { ID: 2, Name: 'b' }, { id: 3, Notes: 'x' }, { ID: 4, Name: 'd' }, { ID: 5 }]);
        expect(out[1]).toBe(rows[1]); // a row with no denied key is kept by reference
        expect(rows[0].Salary).toBe(1); // the input is never modified
    });

    it('two shapes whose joined key lists collide never share a plan', () => {
        const rows: Rows = [{ ID: 1, Name: 'a' }, { 'ID\u0000Name': 2 }, { ID: 3, Salary: 3 }, { 'ID\u0000Salary': 4 }];
        const out = omit(rows, new Set(['salary']));
        expect(out).toEqual([{ ID: 1, Name: 'a' }, { 'ID\u0000Name': 2 }, { ID: 3 }, { 'ID\u0000Salary': 4 }]);
    });

    it('returns the input array when no row carries a denied key', () => {
        const rows: Rows = [{ ID: 1, Name: 'a' }, { ID: 2, Name: 'b' }];
        expect(omit(rows, new Set(['salary']))).toBe(rows);
    });

    it('benchmark: 10k rows x 40 columns', () => {
        const columns = Array.from({ length: 40 }, (_, i) => `Column${i}`);
        const rows: Rows = Array.from({ length: 10_000 }, (_, r) => Object.fromEntries(columns.map(c => [c, r])));
        const denied = new Set(['column3', 'column17', 'column31']);
        omit(rows, denied); // warm up
        const passes = 5;
        const start = performance.now();
        for (let i = 0; i < passes; i++) {
            omit(rows, denied);
        }
        const perPass = (performance.now() - start) / passes;
        console.log(`[benchmark] omitFieldsFromRows 10k x 40, 3 denied: ${perPass.toFixed(2)} ms per pass`);
        expect(omit(rows, denied)[0]).not.toHaveProperty('Column3');
    });
});
