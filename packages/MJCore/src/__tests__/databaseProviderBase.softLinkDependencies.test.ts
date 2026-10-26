import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderBase, SaveSQLResult, DeleteSQLResult, GetRecordDependenciesOptions } from '../generic/databaseProviderBase';
import { CompositeKey, EntityInfo, RecordDependency, UserInfo, RunQueryResult, QueryExecutionSpec, Metadata } from '../index';

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

function mockEntity(
    name: string,
    pkNames: string[] = ['ID'],
    fields: { Name: string; DisplayName?: string; DisplayNameOrName?: string }[] = [],
    canRead?: boolean
): EntityInfo {
    const keys = pkNames.map((Name) => ({ Name }));
    return {
        Name: name,
        FirstPrimaryKey: keys[0],
        PrimaryKeys: keys,
        Fields: fields,
        ...(canRead !== undefined ? { CheckPermissions: () => canRead } : {}),
    } as unknown as EntityInfo;
}

/** Minimal concrete provider: only what GetRecordDependencies touches is real. */
class TestProvider extends DatabaseProviderBase {
    public softSQLCalls: string[] = [];
    public lastSoftOptions?: GetRecordDependenciesOptions;
    public hardSQLCalls = 0;
    public lastHardOptions?: GetRecordDependenciesOptions;
    public rowsToReturn: Record<string, unknown>[] = [];
    public entityDependencies: { EntityName: string; RelatedEntityName: string; FieldName: string }[] = [];
    public entities: EntityInfo[] = [
        mockEntity('Persons', ['ID']),
        mockEntity('Task Links', ['ID'], [
            { Name: 'RecordID', DisplayName: 'Linked Record', DisplayNameOrName: 'Linked Record' },
            { Name: 'PersonID', DisplayName: 'Assigned Person', DisplayNameOrName: 'Assigned Person' },
        ]),
        mockEntity('Tasks', ['ID'], [{ Name: 'PersonID', DisplayName: 'Owner', DisplayNameOrName: 'Owner' }]),
        mockEntity('MJ: Record Changes', ['ID'], [{ Name: 'RecordID', DisplayName: 'Record ID', DisplayNameOrName: 'Record ID' }]),
        mockEntity('MJ: Audit Logs', ['ID'], [{ Name: 'RecordID', DisplayName: 'Record ID', DisplayNameOrName: 'Record ID' }]),
    ];

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

    public override get Entities(): EntityInfo[] { return this.entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this.entities.find((e) => e.Name.toLowerCase() === name.toLowerCase());
    }
    public override async GetEntityDependencies(_entityName: string) {
        return this.entityDependencies as never;
    }

    protected BuildHardLinkDependencySQL(
        _deps: unknown,
        _key: CompositeKey,
        options?: GetRecordDependenciesOptions
    ): string {
        this.hardSQLCalls++;
        this.lastHardOptions = options;
        return 'SELECT 1 AS hard';
    }
    protected BuildSoftLinkDependencySQL(
        entityName: string,
        _key: CompositeKey,
        options?: GetRecordDependenciesOptions
    ): string {
        this.softSQLCalls.push(entityName);
        this.lastSoftOptions = options;
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

describe('GetRecordDependencies - GetRecordDependenciesOptions & FieldDisplayName', () => {
    it('routes LinkType: "hard" to only BuildHardLinkDependencySQL', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [{ EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID' }];
        provider.rowsToReturn = [
            { EntityName: 'Persons', RelatedEntityName: 'Tasks', PrimaryKeyValue: `ID|${RECORD_GUID}`, FieldName: 'PersonID', IsSoftLink: 0, EntityIDFieldName: null },
        ];

        const deps = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID), { LinkType: 'hard' });

        expect(provider.hardSQLCalls).toBe(1);
        expect(provider.softSQLCalls).toEqual([]);
        expect(deps).toHaveLength(1);
        expect(deps[0].RelatedEntityName).toBe('Tasks');
        expect(deps[0].FieldDisplayName).toBe('Owner');
    });

    it('routes LinkType: "soft" to only BuildSoftLinkDependencySQL', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [{ EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID' }];
        provider.rowsToReturn = [softLinkRow()];

        const deps = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID), { LinkType: 'soft' });

        expect(provider.hardSQLCalls).toBe(0);
        expect(provider.softSQLCalls).toEqual(['Persons']);
        expect(deps).toHaveLength(1);
        expect(deps[0].RelatedEntityName).toBe('Task Links');
        expect(deps[0].FieldDisplayName).toBe('Linked Record');
    });

    it('excludes system audit/telemetry entities when IncludeSystemEntities is false', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [
            { EntityName: 'Persons', RelatedEntityName: 'MJ: Record Changes', FieldName: 'RecordID' },
            { EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID' },
        ];
        provider.rowsToReturn = [
            softLinkRow(),
            { EntityName: 'Persons', RelatedEntityName: 'MJ: Record Changes', PrimaryKeyValue: `ID|${RECORD_GUID}`, FieldName: 'RecordID', IsSoftLink: 1, EntityIDFieldName: 'EntityID' },
            { EntityName: 'Persons', RelatedEntityName: 'MJ: Audit Logs', PrimaryKeyValue: `ID|${RECORD_GUID}`, FieldName: 'RecordID', IsSoftLink: 1, EntityIDFieldName: 'EntityID' },
        ];

        const deps = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID), { IncludeSystemEntities: false });

        expect(deps.map(d => d.RelatedEntityName)).toEqual(['Task Links']);
    });

    it('restricts dependencies to EntityNames allow-list (case-insensitive)', async () => {
        const provider = new TestProvider();
        provider.entityDependencies = [
            { EntityName: 'Persons', RelatedEntityName: 'Tasks', FieldName: 'PersonID' },
        ];
        provider.rowsToReturn = [
            softLinkRow(),
            { EntityName: 'Persons', RelatedEntityName: 'Tasks', PrimaryKeyValue: `ID|${RECORD_GUID}`, FieldName: 'PersonID', IsSoftLink: 0, EntityIDFieldName: null },
        ];

        const deps = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID), { EntityNames: ['tasks'] });

        expect(deps.map(d => d.RelatedEntityName)).toEqual(['Tasks']);
    });

    it('filters out entities the contextUser does not have Read permission on', async () => {
        const provider = new TestProvider();
        provider.entities.push(
            mockEntity('Secret Notes', ['ID'], [{ Name: 'PersonID', DisplayName: 'Person' }], false)
        );
        provider.rowsToReturn = [
            softLinkRow(),
            { EntityName: 'Persons', RelatedEntityName: 'Secret Notes', PrimaryKeyValue: `ID|${RECORD_GUID}`, FieldName: 'PersonID', IsSoftLink: 0, EntityIDFieldName: null },
        ];
        const user = new UserInfo();
        user.ID = 'u-1';

        const deps = await provider.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID), user, { LinkType: 'both' });

        expect(deps.map(d => d.RelatedEntityName)).toEqual(['Task Links']);
    });

    it('forwards options through Metadata.GetRecordDependencies', async () => {
        const provider = new TestProvider();
        provider.rowsToReturn = [softLinkRow()];
        const prevProvider = Metadata.Provider;
        try {
            Metadata.Provider = provider;
            const md = new Metadata();
            const deps = await md.GetRecordDependencies('Persons', CompositeKey.FromID(RECORD_GUID), {
                LinkType: 'soft',
                IncludeSystemEntities: false,
            });
            expect(provider.lastSoftOptions).toEqual({ LinkType: 'soft', IncludeSystemEntities: false });
            expect(deps).toHaveLength(1);
        } finally {
            Metadata.Provider = prevProvider;
        }
    });
});
