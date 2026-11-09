import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, EntityDependency, EntityInfo, GetRecordDependenciesOptions, KeyValuePair } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

// Mock pg so the provider can be constructed without a real database.
vi.mock('pg', () => {
    const mockPool = {
        connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

/**
 * PostgreSQL twin of the SQL Server soft-link dependency tests. The PG provider carried the same
 * three defects in the same shape (wrong entity in the discriminator filter, bare-value comparison
 * against a canonical `RecordID` column, and quoting derived from the holder's primary key type),
 * so the fixes and their coverage are mirrored here rather than assumed.
 */

const TARGET_ENTITY_ID = 'AAAAAAAA-1111-1111-1111-AAAAAAAAAAAA';
const HOLDER_ENTITY_ID = 'BBBBBBBB-2222-2222-2222-BBBBBBBBBBBB';
const RECORD_GUID = '38CB433E-F36B-1410-8DA0-00021F8B792E';

function mockEntity(opts: {
    Name: string;
    ID: string;
    BaseView: string;
    BaseTable?: string;
    pk?: { Name: string; NeedsQuotes: boolean; IsVirtual?: boolean }[];
    Fields?: {
        Name: string;
        EntityIDFieldName: string | null;
        RelatedEntity?: string | null;
        RelatedEntityFieldName?: string | null;
        IsVirtual?: boolean;
    }[];
}): EntityInfo {
    const pk = opts.pk ?? [{ Name: 'ID', NeedsQuotes: true }];
    return {
        Name: opts.Name,
        ID: opts.ID,
        SchemaName: '__mj',
        BaseView: opts.BaseView,
        BaseTable: opts.BaseTable,
        PrimaryKeys: pk,
        FirstPrimaryKey: pk[0],
        Fields: opts.Fields ?? [],
    } as unknown as EntityInfo;
}

class TestProvider extends PostgreSQLDataProvider {
    constructor(private readonly _entities: EntityInfo[]) {
        super();
    }
    public override get Entities(): EntityInfo[] {
        return this._entities;
    }
    public override EntityByName(entityName: string): EntityInfo | undefined {
        return this._entities.find((e) => e.Name === entityName);
    }
    public buildSoftLinkSQL(entityName: string, key: CompositeKey, options?: GetRecordDependenciesOptions): string {
        return this.BuildSoftLinkDependencySQL(entityName, key, options);
    }
    public buildHardLinkSQL(
        depsOrName: EntityDependency[] | string,
        key: CompositeKey,
        options?: GetRecordDependenciesOptions,
    ): string {
        return this.BuildHardLinkDependencySQL(depsOrName, key, options);
    }
}

function fixture() {
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
    const holder = mockEntity({
        Name: 'Task Links',
        ID: HOLDER_ENTITY_ID,
        BaseView: 'vwTaskLinks',
        Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
    });
    return new TestProvider([target, holder]);
}

describe('PostgreSQLDataProvider.BuildSoftLinkDependencySQL', () => {
    it('filters the discriminator on the TARGET entity, not the holder of the link', () => {
        const sql = fixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(sql).toContain(`"EntityID" = '${TARGET_ENTITY_ID}'`);
        expect(sql).not.toContain(HOLDER_ENTITY_ID);
    });

    it('matches both the canonical ID|<guid> encoding and bare <guid> for single-column keys', () => {
        const sql = fixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(sql).toContain(`"RecordID" IN ('ID|${RECORD_GUID}', '${RECORD_GUID}')`);
    });

    it('uses equality against canonical RecordID when the key is composite', () => {
        const target = mockEntity({
            Name: 'OrderLines',
            ID: TARGET_ENTITY_ID,
            BaseView: 'vwOrderLines',
            pk: [
                { Name: 'OrderID', NeedsQuotes: true },
                { Name: 'LineNo', NeedsQuotes: false },
            ],
        });
        const holder = mockEntity({
            Name: 'Task Links',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTaskLinks',
            Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
        });
        const ck = new CompositeKey([new KeyValuePair('OrderID', RECORD_GUID), new KeyValuePair('LineNo', 1)]);
        const sql = new TestProvider([target, holder]).buildSoftLinkSQL('OrderLines', ck);

        expect(sql).toContain(`"RecordID" = 'OrderID|${RECORD_GUID}||LineNo|1'`);
    });

    it('marks every row as a soft link and names the discriminator column', () => {
        const sql = fixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(sql).toContain('true AS "IsSoftLink"');
        expect(sql).toContain('\'EntityID\' AS "EntityIDFieldName"');
    });

    it('quotes both literals even when the holder has an integer primary key', () => {
        const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
        const intHolder = mockEntity({
            Name: 'Legacy Links',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwLegacyLinks',
            pk: [{ Name: 'LinkNo', NeedsQuotes: false }],
            Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
        });
        const sql = new TestProvider([target, intHolder]).buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(sql).toContain(`"EntityID" = '${TARGET_ENTITY_ID}'`);
        expect(sql).toContain(`"RecordID" IN ('ID|${RECORD_GUID}', '${RECORD_GUID}')`);
        expect(sql).not.toContain(`= ${TARGET_ENTITY_ID}`);
    });

    it('throws when the target entity is not in metadata', () => {
        expect(() => fixture().buildSoftLinkSQL('No Such Entity', CompositeKey.FromID(RECORD_GUID))).toThrow(
            /not found in metadata/i,
        );
    });

    it('escapes an apostrophe in the record key instead of terminating the literal', () => {
        const target = mockEntity({
            Name: 'Widgets',
            ID: TARGET_ENTITY_ID,
            BaseView: 'vwWidgets',
            pk: [{ Name: 'Code', NeedsQuotes: true }],
        });
        const holder = mockEntity({
            Name: 'Task Links',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTaskLinks',
            Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
        });
        const sql = new TestProvider([target, holder]).buildSoftLinkSQL('Widgets', CompositeKey.FromKeyValuePair('Code', "O'Brien"));

        expect(sql).toContain("\"RecordID\" IN ('Code|O''Brien', 'O''Brien')");
    });

    it('returns empty SQL when nothing declares a polymorphic pair', () => {
        const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
        const plain = mockEntity({
            Name: 'Tasks',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTasks',
            Fields: [{ Name: 'PersonID', EntityIDFieldName: null }],
        });
        expect(new TestProvider([target, plain]).buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID))).toBe('');
    });

    it('selects from BaseTable when all referenced columns are physical, and falls back to BaseView when virtual', () => {
        const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons', BaseTable: 'Person' });
        const physicalHolder = mockEntity({
            Name: 'Task Links',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTaskLinks',
            BaseTable: 'TaskLink',
            Fields: [
                { Name: 'ID', EntityIDFieldName: null, IsVirtual: false },
                { Name: 'EntityID', EntityIDFieldName: null, IsVirtual: false },
                { Name: 'RecordID', EntityIDFieldName: 'EntityID', IsVirtual: false },
            ],
        });
        const virtualHolder = mockEntity({
            Name: 'Virtual Links',
            ID: 'CCCCCCCC-3333-3333-3333-CCCCCCCCCCCC',
            BaseView: 'vwVirtualLinks',
            BaseTable: 'VirtualLink',
            Fields: [
                { Name: 'ID', EntityIDFieldName: null, IsVirtual: false },
                { Name: 'EntityID', EntityIDFieldName: null, IsVirtual: true },
                { Name: 'RecordID', EntityIDFieldName: 'EntityID', IsVirtual: false },
            ],
        });

        const sql = new TestProvider([target, physicalHolder, virtualHolder]).buildSoftLinkSQL(
            'Persons',
            CompositeKey.FromID(RECORD_GUID),
        );

        expect(sql).toContain('"__mj"."TaskLink"');
        expect(sql).not.toContain('"__mj"."vwTaskLinks"');
        expect(sql).toContain('"__mj"."vwVirtualLinks"');
        expect(sql).not.toContain('"__mj"."VirtualLink"');
    });

    it('excludes system audit/telemetry entities when IncludeSystemEntities is false', () => {
        const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
        const holder = mockEntity({
            Name: 'Task Links',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTaskLinks',
            BaseTable: 'TaskLink',
            Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
        });
        const recordChanges = mockEntity({
            Name: 'MJ: Record Changes',
            ID: 'DDDDDDDD-4444-4444-4444-DDDDDDDDDDDD',
            BaseView: 'vwRecordChanges',
            BaseTable: 'RecordChange',
            Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
        });

        const provider = new TestProvider([target, holder, recordChanges]);
        const filteredSQL = provider.buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID), {
            IncludeSystemEntities: false,
        });

        expect(filteredSQL).toContain('\'Task Links\' AS "RelatedEntityName"');
        expect(filteredSQL).not.toContain('MJ: Record Changes');
    });
});

describe('PostgreSQLDataProvider.BuildHardLinkDependencySQL', () => {
    it('queries BaseTable when FK column and PK are physical, and BaseView when FK column is virtual', () => {
        const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons', BaseTable: 'Person' });
        const physicalDep = mockEntity({
            Name: 'Tasks',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTasks',
            BaseTable: 'Task',
            Fields: [{ Name: 'PersonID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID', IsVirtual: false }],
        });
        const virtualDep = mockEntity({
            Name: 'TaskSummaries',
            ID: 'EEEEEEEE-5555-5555-5555-EEEEEEEEEEEE',
            BaseView: 'vwTaskSummaries',
            BaseTable: 'TaskSummary',
            Fields: [{ Name: 'PersonID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID', IsVirtual: true }],
        });

        const provider = new TestProvider([target, physicalDep, virtualDep]);
        const sql = provider.buildHardLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(sql).toContain('"__mj"."Task"');
        expect(sql).not.toContain('"__mj"."vwTasks"');
        expect(sql).toContain('"__mj"."vwTaskSummaries"');
        expect(sql).not.toContain('"__mj"."TaskSummary"');
        expect(sql).toContain('false AS "IsSoftLink"');
    });

    it('respects IncludeSystemEntities: false in BuildHardLinkDependencySQL', () => {
        const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons', BaseTable: 'Person' });
        const tasks = mockEntity({
            Name: 'Tasks',
            ID: HOLDER_ENTITY_ID,
            BaseView: 'vwTasks',
            BaseTable: 'Task',
            Fields: [{ Name: 'PersonID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID' }],
        });
        const auditLogs = mockEntity({
            Name: 'MJ: Audit Logs',
            ID: 'FFFFFFFF-6666-6666-6666-FFFFFFFFFFFF',
            BaseView: 'vwAuditLogs',
            BaseTable: 'AuditLog',
            Fields: [{ Name: 'UserID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID' }],
        });

        const provider = new TestProvider([target, tasks, auditLogs]);
        const sql = provider.buildHardLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID), {
            IncludeSystemEntities: false,
        });

        expect(sql).toContain('\'Tasks\' AS "RelatedEntityName"');
        expect(sql).not.toContain('MJ: Audit Logs');
    });
});
