import { describe, it, expect } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import {
    TransactionGroupBase,
    TransactionGroupRolledBackError,
    TransactionItem,
    TransactionItemFailedError,
    TransactionResult,
} from '../generic/transactionGroup';

/**
 * ONE JUDGEMENT OF "DID THIS DELETE / SAVE DO ITS WORK", SHARED BY EVERY PROVIDER.
 *
 * `BaseEntity.DeleteResultMatchesEntity` decides whether a delete's returned row reports the record
 * as deleted — the database providers' direct and transaction-group paths and the GraphQL provider's
 * group callback all call it. `TransactionGroupBase.ItemSucceeded` / `ThrowIfItemFailsGroup` decide
 * whether one item of a group did its work, for the SQL Server and PostgreSQL groups alike.
 */

class TestEntity extends BaseEntity {}

const RECORD_ID = 'A1B2C3D4-0000-4000-8000-00000000ABCD';

function entityInfo(keys: Array<{ Name: string; Type: string }>): EntityInfo {
    const field = { EntityID: 'E0000000-0000-4000-8000-000000000001', AllowsNull: false, IsVirtual: false, AllowUpdateAPI: true, Status: 'Active', Precision: 0, Scale: 0, Length: 16 };
    return new EntityInfo({
        ID: 'E0000000-0000-4000-8000-000000000001',
        Name: 'Widgets',
        Status: 'Active',
        SchemaName: 'dbo',
        BaseTable: 'Widget',
        BaseView: 'vwWidgets',
        EntityFields: [
            ...keys.map((k, i) => ({ ...field, ID: `F0000000-0000-4000-8000-00000000000${i}`, Sequence: i + 1, Name: k.Name, Type: k.Type, IsPrimaryKey: true, IsUnique: keys.length === 1 })),
            { ...field, ID: 'F0000000-0000-4000-8000-0000000000FF', Sequence: 99, Name: 'Name', Type: 'nvarchar', Length: 200 },
        ],
        EntityPermissions: [],
    });
}

function savedEntity(info: EntityInfo, values: Record<string, unknown>): TestEntity {
    const entity = new TestEntity(info);
    entity.SetMany({ Name: 'Widget', ...values }, false, true, true);
    return entity;
}

describe('BaseEntity.DeleteResultMatchesEntity', () => {
    const uuidInfo = entityInfo([{ Name: 'ID', Type: 'uniqueidentifier' }]);

    it('matches the record\'s UUID key in any letter case', () => {
        const entity = savedEntity(uuidInfo, { ID: RECORD_ID });
        expect(entity.DeleteResultMatches({ ID: RECORD_ID.toLowerCase() })).toBe(true);
        expect(BaseEntity.DeleteResultMatchesEntity(entity, { ID: RECORD_ID })).toBe(true);
    });

    it('a NULL key (the generated delete\'s "nothing deleted"), a missing column or no row never matches', () => {
        const entity = savedEntity(uuidInfo, { ID: RECORD_ID });
        expect(entity.DeleteResultMatches({ ID: null })).toBe(false);
        expect(entity.DeleteResultMatches({ Other: RECORD_ID })).toBe(false);
        expect(entity.DeleteResultMatches(null)).toBe(false);
        expect(entity.DeleteResultMatches(undefined)).toBe(false);
    });

    it('another record\'s key does not match', () => {
        const entity = savedEntity(uuidInfo, { ID: RECORD_ID });
        expect(entity.DeleteResultMatches({ ID: 'A1B2C3D4-0000-4000-8000-00000000FFFF' })).toBe(false);
    });

    it('an entity with no key value never matches — not even a row that says "null" or "undefined" (no String() coercion of an absent value)', () => {
        const entity = savedEntity(uuidInfo, { ID: null });
        expect(entity.DeleteResultMatches({ ID: 'null' })).toBe(false);
        expect(entity.DeleteResultMatches({ ID: 'undefined' })).toBe(false);
    });

    it('a NULL returned key never matches, even when the entity\'s own key is NULL too', () => {
        const info = entityInfo([{ Name: 'TenantCode', Type: 'nvarchar' }]);
        const entity = savedEntity(info, { TenantCode: null });
        expect(entity.DeleteResultMatches({ TenantCode: null })).toBe(false);
    });

    it('a non-UUID key compares strictly (a number matches its own text), and every column of a composite key must match', () => {
        const info = entityInfo([{ Name: 'TenantCode', Type: 'nvarchar' }, { Name: 'Seq', Type: 'int' }]);
        const entity = savedEntity(info, { TenantCode: 'acme', Seq: 7 });
        expect(entity.DeleteResultMatches({ TenantCode: 'acme', Seq: 7 })).toBe(true);
        expect(entity.DeleteResultMatches({ TenantCode: 'acme', Seq: '7' })).toBe(true); // e.g. mssql BIGINT, GraphQL
        expect(entity.DeleteResultMatches({ TenantCode: 'ACME', Seq: 7 })).toBe(false);
        expect(entity.DeleteResultMatches({ TenantCode: 'acme', Seq: '8' })).toBe(false);
        expect(entity.DeleteResultMatches({ TenantCode: 'acme', Seq: null })).toBe(false);
        expect(entity.DeleteResultMatches({ TenantCode: 'acme', Seq: true })).toBe(false);
    });
});

/** Exposes the protected statics a provider's group uses to judge its items. */
class JudgingGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        return [];
    }
    public static Judge(item: TransactionItem, row: Record<string, unknown> | null | undefined): boolean {
        return JudgingGroup.ItemSucceeded(item, row);
    }
    public static Enforce(item: TransactionItem, succeeded: boolean): void {
        JudgingGroup.ThrowIfItemFailsGroup(item, succeeded);
    }
}

describe('TransactionGroupBase item judgement', () => {
    const info = entityInfo([{ Name: 'ID', Type: 'uniqueidentifier' }]);
    const item = (operation: 'Create' | 'Update' | 'Delete'): TransactionItem =>
        new TransactionItem(savedEntity(info, { ID: RECORD_ID }), operation, 'EXEC sp', null, {}, () => undefined);

    it('a save succeeds when it returned its row, and fails when it returned none', () => {
        expect(JudgingGroup.Judge(item('Update'), { ID: RECORD_ID })).toBe(true);
        expect(JudgingGroup.Judge(item('Create'), null)).toBe(false);
        expect(JudgingGroup.Judge(item('Create'), undefined)).toBe(false);
    });

    it('a delete succeeds only when its row reports the record\'s keys', () => {
        expect(JudgingGroup.Judge(item('Delete'), { ID: RECORD_ID.toLowerCase() })).toBe(true);
        expect(JudgingGroup.Judge(item('Delete'), { ID: null })).toBe(false);
        expect(JudgingGroup.Judge(item('Delete'), null)).toBe(false);
    });

    it('a failed item throws a typed TransactionItemFailedError naming the item; a successful one does not throw', () => {
        const failed = item('Delete');
        let thrown: unknown;
        try {
            JudgingGroup.Enforce(failed, false);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(TransactionItemFailedError);
        expect((thrown as TransactionItemFailedError).Item).toBe(failed);
        expect((thrown as TransactionItemFailedError).message).toBe('Delete of Widgets did not delete the record (the delete returned no matching primary key)');
        expect(() => JudgingGroup.Enforce(item('Create'), true)).not.toThrow();
    });

    it('TransactionGroupRolledBackError keeps the item error, and wraps a non-Error thrown value', () => {
        const cause = new Error('PK violation');
        const wrapped = new TransactionGroupRolledBackError(cause);
        expect(wrapped.ItemError).toBe(cause);
        expect(wrapped.message).toBe('Transaction rolled back due to operation failure: PK violation');
        expect(new TransactionGroupRolledBackError('driver said no').ItemError.message).toBe('driver said no');
    });
});
