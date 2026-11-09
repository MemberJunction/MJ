/**
 * Transaction-group contract guards:
 *  - #4701: a settled group refuses new items, and Submit() detaches every participant, so a
 *    record's next Save()/Delete() is not queued into a group that will never be sent again.
 *  - #5622: a `Use` variable writes its field after the item's checks have passed, so it may set
 *    only a foreign key to its `Define` item's entity, never a primary key.
 */
import { describe, it, expect } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { IEntityDataProvider } from '../generic/interfaces';
import { TransactionGroupBase, TransactionItem, TransactionResult, TransactionVariable } from '../generic/transactionGroup';

const PARENT_ENTITY_ID = 'a1000000-0000-0000-0000-000000000001';
const CHILD_ENTITY_ID = 'a1000000-0000-0000-0000-000000000002';
const OTHER_ENTITY_ID = 'a1000000-0000-0000-0000-000000000003';

function field(entityID: string, entity: string, name: string, sequence: number, extra: Record<string, unknown> = {}) {
    return {
        ID: `${entityID}-${name}`,
        EntityID: entityID,
        Entity: entity,
        Name: name,
        Type: name.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar',
        IsPrimaryKey: false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: true,
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: false,
        AllowUpdateAPI: true,
        ValueListType: 'None',
        Sequence: sequence,
        Status: 'Active',
        EntityFieldValues: [],
        ...extra,
    };
}

function entityData(id: string, name: string, fields: ReturnType<typeof field>[]) {
    return {
        ID: id,
        Name: name,
        BaseTable: name,
        BaseView: `vw${name}`,
        SchemaName: 'dbo',
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        ParentID: null,
        Status: 'Active',
        EntityFields: fields,
        EntityPermissions: [],
        EntityRelationships: [],
        EntitySettings: [],
    };
}

const parentInfo = new EntityInfo(entityData(PARENT_ENTITY_ID, 'Parents', [
    field(PARENT_ENTITY_ID, 'Parents', 'ID', 1, { IsPrimaryKey: true, AllowsNull: false }),
    field(PARENT_ENTITY_ID, 'Parents', 'Name', 2),
]));
const childInfo = new EntityInfo(entityData(CHILD_ENTITY_ID, 'Children', [
    field(CHILD_ENTITY_ID, 'Children', 'ID', 1, { IsPrimaryKey: true, AllowsNull: false }),
    field(CHILD_ENTITY_ID, 'Children', 'ParentID', 2, { RelatedEntityID: PARENT_ENTITY_ID, RelatedEntityFieldName: 'ID' }),
    field(CHILD_ENTITY_ID, 'Children', 'OtherID', 3, { RelatedEntityID: OTHER_ENTITY_ID, RelatedEntityFieldName: 'ID' }),
    field(CHILD_ENTITY_ID, 'Children', 'Name', 4),
]));

const provider = { CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@example.test', UserRoles: [] } } as unknown as IEntityDataProvider;

/** Reports each pending item with the given outcome, applying variables the way real providers do. */
class TestTransactionGroup extends TransactionGroupBase {
    public Outcome = true;
    public SubmittedCount = 0;
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        this.SubmittedCount = this.PendingTransactions.length;
        const results: TransactionResult[] = [];
        for (const item of this.PendingTransactions) {
            this.SetEntityValuesFromVariables(item.BaseEntity);
            const row = { ID: 'b2000000-0000-0000-0000-000000000001' };
            this.SetVariableValuesFromEntity(item.BaseEntity, row);
            results.push(new TransactionResult(item, row, this.Outcome));
        }
        return results;
    }
}

function parent(): BaseEntity { return new BaseEntity(parentInfo, provider); }
function child(): BaseEntity { return new BaseEntity(childInfo, provider); }
function item(entity: BaseEntity, op: 'Create' | 'Update' | 'Delete' = 'Create'): TransactionItem {
    return new TransactionItem(entity, op, '', {}, {}, () => { /* no-op */ });
}
function enrol(tg: TransactionGroupBase, entity: BaseEntity): void {
    entity.TransactionGroup = tg;
    tg.AddTransaction(item(entity));
}

describe('TransactionGroupBase — settled groups (#4701)', () => {
    it('refuses an item added to a Complete group, naming the entity and the status', async () => {
        const tg = new TestTransactionGroup();
        enrol(tg, parent());
        expect(await tg.Submit()).toBe(true);
        expect(tg.Status).toBe('Complete');

        expect(() => tg.AddTransaction(item(parent(), 'Update'))).toThrow(/Update of 'Parents'.*'Complete'/);
    });

    it('refuses an item added to a Failed group', async () => {
        const tg = new TestTransactionGroup();
        tg.Outcome = false;
        enrol(tg, parent());
        expect(await tg.Submit()).toBe(false);

        expect(() => tg.AddTransaction(item(parent()))).toThrow(/'Failed'/);
    });

    it('detaches every participant once the group completes', async () => {
        const tg = new TestTransactionGroup();
        const a = parent();
        const b = child();
        enrol(tg, a);
        enrol(tg, b);

        await tg.Submit();

        expect(a.TransactionGroup).toBeNull();
        expect(b.TransactionGroup).toBeNull();
    });

    it('detaches every participant when the group fails, and when HandleSubmit throws', async () => {
        const failed = new TestTransactionGroup();
        failed.Outcome = false;
        const a = parent();
        enrol(failed, a);
        await failed.Submit();
        expect(a.TransactionGroup).toBeNull();

        class ThrowingGroup extends TransactionGroupBase {
            protected async HandleSubmit(): Promise<TransactionResult[]> { throw new Error('transport down'); }
        }
        const thrown = new ThrowingGroup();
        const b = parent();
        enrol(thrown, b);
        expect(await thrown.Submit()).toBe(false);
        expect(b.TransactionGroup).toBeNull();
    });

    it('leaves an entity alone that has since moved to another group', async () => {
        const tg = new TestTransactionGroup();
        const other = new TestTransactionGroup();
        const a = parent();
        enrol(tg, a);
        a.TransactionGroup = other;

        await tg.Submit();

        expect(a.TransactionGroup).toBe(other);
    });

    it('still accepts, while submitting, an entity the group is waiting on, and refuses any other', async () => {
        const tg = new TestTransactionGroup();
        const waited = parent();
        waited.TransactionGroup = tg;
        tg.RegisterPreprocessing(waited);

        const submitting = tg.Submit();
        expect(tg.Status).toBe('In Progress');
        expect(() => tg.AddTransaction(item(parent()))).toThrow(/'In Progress'/);

        // What a provider does when its async work finishes: raise ready, then enrol, in one tick.
        waited.RaiseReadyForTransaction();
        tg.AddTransaction(item(waited));

        expect(await submitting).toBe(true);
        expect(tg.SubmittedCount).toBe(1);
    });
});

describe('TransactionGroupBase — Use variables (#5622)', () => {
    it('refuses a Use variable on a primary key', () => {
        const tg = new TestTransactionGroup();
        tg.AddVariable(new TransactionVariable('P', parent(), 'ID', 'Define'));
        expect(() => tg.AddVariable(new TransactionVariable('P', child(), 'ID', 'Use'))).toThrow(/primary key/);
    });

    it('refuses a Use variable on a field that is not a foreign key', () => {
        const tg = new TestTransactionGroup();
        tg.AddVariable(new TransactionVariable('P', parent(), 'ID', 'Define'));
        expect(() => tg.AddVariable(new TransactionVariable('P', child(), 'Name', 'Use'))).toThrow(/only a foreign key/);
    });

    it('refuses a Use variable on a field the entity does not have', () => {
        const tg = new TestTransactionGroup();
        expect(() => tg.AddVariable(new TransactionVariable('P', child(), 'Nope', 'Use'))).toThrow(/does not have/);
    });

    it("refuses a foreign key to another entity than the Define item's", () => {
        const tg = new TestTransactionGroup();
        tg.AddVariable(new TransactionVariable('P', parent(), 'ID', 'Define'));
        expect(() => tg.AddVariable(new TransactionVariable('P', child(), 'OtherID', 'Use'))).toThrow(/not a foreign key to 'Parents'/);
    });

    it('refuses the mismatch when the Define is added after the Use', () => {
        const tg = new TestTransactionGroup();
        tg.AddVariable(new TransactionVariable('P', child(), 'OtherID', 'Use'));
        expect(() => tg.AddVariable(new TransactionVariable(' p ', parent(), 'ID', 'Define'))).toThrow(/not a foreign key to 'Parents'/);
        expect(tg.Variables).toHaveLength(1);
    });

    it("sets a foreign key to the Define item's entity at submit", async () => {
        const tg = new TestTransactionGroup();
        const p = parent();
        const c = child();
        enrol(tg, p);
        enrol(tg, c);
        tg.AddVariable(new TransactionVariable('P', p, 'ID', 'Define'));
        tg.AddVariable(new TransactionVariable('P', c, 'ParentID', 'Use'));

        expect(await tg.Submit()).toBe(true);
        expect(c.GetFieldByName('ParentID')?.Value).toBe('b2000000-0000-0000-0000-000000000001');
    });

    it('refuses at submit a Use variable pushed onto Variables without AddVariable', async () => {
        const tg = new TestTransactionGroup();
        const p = parent();
        const c = child();
        enrol(tg, p);
        enrol(tg, c);
        tg.AddVariable(new TransactionVariable('P', p, 'ID', 'Define'));
        tg.Variables.push(new TransactionVariable('P', c, 'ID', 'Use'));

        expect(await tg.Submit()).toBe(false);
        expect(c.GetFieldByName('ID')?.Value).not.toBe('b2000000-0000-0000-0000-000000000001');
    });
});
