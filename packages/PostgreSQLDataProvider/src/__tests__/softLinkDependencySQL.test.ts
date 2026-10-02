import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, EntityInfo } from '@memberjunction/core';
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
    pk?: { Name: string; NeedsQuotes: boolean }[];
    Fields?: { Name: string; EntityIDFieldName: string | null }[];
}): EntityInfo {
    const pk = opts.pk ?? [{ Name: 'ID', NeedsQuotes: true }];
    return {
        Name: opts.Name,
        ID: opts.ID,
        SchemaName: '__mj',
        BaseView: opts.BaseView,
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
    public buildSoftLinkSQL(entityName: string, key: CompositeKey): string {
        return this.BuildSoftLinkDependencySQL(entityName, key);
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

    it('compares the payload column against the canonical ID|<guid> encoding', () => {
        const sql = fixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

        expect(sql).toContain(`"RecordID" = 'ID|${RECORD_GUID}'`);
        expect(sql).not.toContain(`"RecordID" = '${RECORD_GUID}'`);
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
        expect(sql).toContain(`"RecordID" = 'ID|${RECORD_GUID}'`);
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

        expect(sql).toContain("\"RecordID\" = 'Code|O''Brien'");
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
});
