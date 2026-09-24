import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderBase, SaveSQLResult, DeleteSQLResult } from '../generic/databaseProviderBase';
import { CompositeKey, EntityInfo, RecordDependency, UserInfo, RunQueryResult, QueryExecutionSpec } from '../index';

/**
 * Covers the two polymorphic-link defects that live in the provider base rather than in a dialect:
 *
 *  - soft links were gated behind hard links: `GetRecordDependencies` returned as soon as
 *    `GetEntityDependencies` found no foreign-key dependents, so the soft-link query was never built
 *    for an entity whose only dependents are polymorphic - the exact case it exists to serve;
 *  - record merge wrote the bare primary key value into every link column it repointed, which is
 *    right for a foreign key and silently wrong for a `RecordID` column.
 */

const RECORD_GUID = '38CB433E-F36B-1410-8DA0-00021F8B792E';
const SURVIVOR_GUID = '99999999-AAAA-BBBB-CCCC-DDDDDDDDDDDD';

function mockEntity(name: string, ...pkNames: string[]): EntityInfo {
    const keys = pkNames.map((Name) => ({ Name }));
    return { Name: name, FirstPrimaryKey: keys[0], PrimaryKeys: keys, Fields: [] } as unknown as EntityInfo;
}

/** Minimal concrete provider: only what GetRecordDependencies touches is real. */
class TestProvider extends DatabaseProviderBase {
    public softSQLCalls: string[] = [];
    public hardSQLCalls = 0;
    public rowsToReturn: Record<string, unknown>[] = [];
    public entityDependencies: { EntityName: string; RelatedEntityName: string; FieldName: string }[] = [];
    private _entities: EntityInfo[] = [mockEntity('Persons', 'ID'), mockEntity('Task Links', 'ID')];

    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(s: string, o: string): string { return `[${s}].[${o}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported.');
    }

    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find((e) => e.Name === name);
    }
    public override async GetEntityDependencies(_entityName: string) {
        return this.entityDependencies as never;
    }

    protected BuildHardLinkDependencySQL(): string {
        this.hardSQLCalls++;
        return 'SELECT 1 AS hard';
    }
    protected BuildSoftLinkDependencySQL(entityName: string, _key: CompositeKey): string {
        this.softSQLCalls.push(entityName);
        return 'SELECT 1 AS soft';
    }
    async ExecuteSQL<T>(): Promise<Array<T>> {
        return this.rowsToReturn as unknown as T[];
    }

    /** Test passthrough - the merge encoding decision is protected. */
    public resolveMergeValue(dep: RecordDependency, key: CompositeKey): unknown {
        return this.ResolveMergeLinkValue(dep, key);
    }
}

function softLinkRow() {
    return {
        EntityName: 'Persons',
        RelatedEntityName: 'Task Links',
        PrimaryKeyValue: `ID|${RECORD_GUID}`,
        FieldName: 'RecordID',
        IsSoftLink: 1,
        EntityIDFieldName: 'EntityID',
    };
}

describe('GetRecordDependencies - soft links are not gated behind hard links', () => {
    it('still builds the soft-link query when there are no foreign-key dependents', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [];                 // nothing points here via an FK
        provider.rowsToReturn = [softLinkRow()];

        const deps = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        // The bug: this returned [] without ever calling BuildSoftLinkDependencySQL.
        expect(provider.softSQLCalls).toEqual(['Persons']);
        expect(deps).toHaveLength(1);
        expect(deps[0].RelatedEntityName).toBe('Task Links');
    });

    it('does not build the hard-link query when there are no foreign-key dependents', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [];
        provider.rowsToReturn = [softLinkRow()];

        await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(provider.hardSQLCalls).toBe(0);
    });

    it('builds both queries when hard dependents also exist', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [{ EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID' }];
        provider.rowsToReturn = [softLinkRow()];

        await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(provider.hardSQLCalls).toBe(1);
        expect(provider.softSQLCalls).toEqual(['Persons']);
    });

    it('marks parsed soft-link rows so the merge path can tell them apart', async () => {
        const provider = new TestProvider();
        provider.rowsToReturn = [softLinkRow()];

        const [dep] = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(dep.IsSoftLink).toBe(true);
        expect(dep.EntityIDFieldName).toBe('EntityID');
    });

    it('treats a foreign-key row as a hard link', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [{ EntityName: 'Persons', RelatedEntityName: 'Task Links', FieldName: 'PersonID' }];
        provider.rowsToReturn = [
            { EntityName: 'Persons', RelatedEntityName: 'Task Links', PrimaryKeyValue: `ID|${RECORD_GUID}`, FieldName: 'PersonID', IsSoftLink: 0, EntityIDFieldName: null },
        ];

        const [dep] = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(dep.IsSoftLink).toBe(false);
        expect(dep.EntityIDFieldName).toBeUndefined();
    });

    it('accepts a PostgreSQL boolean marker as well as a SQL Server bit', async () => {
        const provider = new TestProvider();
        provider.rowsToReturn = [{ ...softLinkRow(), IsSoftLink: true }];

        const [dep] = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(dep.IsSoftLink).toBe(true);
    });

    it('maps the dependent key onto the related entity, whose row it actually is', async () => {
        const provider = new TestProvider();
        provider.rowsToReturn = [softLinkRow()];

        const [dep] = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(dep.PrimaryKey.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: RECORD_GUID }]);
    });
});

describe('ResolveMergeLinkValue - merge writes the encoding the column holds', () => {
    const survivor = CompositeKey.FromID(SURVIVOR_GUID);

    it('writes the canonical RecordID encoding for a polymorphic link', () => {
        const provider = new TestProvider();
        const dep = { EntityName: 'Persons', RelatedEntityName: 'Task Links', FieldName: 'RecordID', PrimaryKey: CompositeKey.FromID(RECORD_GUID), IsSoftLink: true } as RecordDependency;

        // The bug wrote the bare GUID here, leaving a RecordID nothing can resolve.
        expect(provider.resolveMergeValue(dep, survivor)).toBe(`ID|${SURVIVOR_GUID}`);
    });

    it('writes the bare key value for a hard foreign key', () => {
        const provider = new TestProvider();
        const dep = { EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID', PrimaryKey: CompositeKey.FromID(RECORD_GUID), IsSoftLink: false } as RecordDependency;

        expect(provider.resolveMergeValue(dep, survivor)).toBe(SURVIVOR_GUID);
    });

    it('treats an absent flag as a hard foreign key, preserving pre-existing behavior', () => {
        const provider = new TestProvider();
        const dep = { EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID', PrimaryKey: CompositeKey.FromID(RECORD_GUID) } as RecordDependency;

        expect(provider.resolveMergeValue(dep, survivor)).toBe(SURVIVOR_GUID);
    });
});
