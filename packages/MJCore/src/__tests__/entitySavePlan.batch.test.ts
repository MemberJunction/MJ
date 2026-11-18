/**
 * Unit tests for contiguous leaf-node `TransactionGroup` batching inside `ExecuteEntitySavePlan`.
 *
 * Verifies:
 *   1. Root `SelfOnly` runs sequentially, then 2+ contiguous leaf nodes sharing a provider enqueue
 *      onto a single `TransactionGroup` with `BatchedSubmit = true` and submit together.
 *   2. `Prepare()` callbacks still run per node immediately before enqueuing (e.g. FK stamping).
 *   3. A validation/logical failure while enqueuing aborts BEFORE `Submit()` and restores
 *      `TransactionGroup = null` on all attached entities.
 *   4. A `Submit()` failure surfaces node error details and restores `TransactionGroup` cleanly.
 *   5. Nodes failing `CanBatchLeaf`, IS-A types, or external `TransactionGroup` barriers flush individually.
 */
import { describe, expect, it } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntitySavePlan, ExecuteEntitySavePlan } from '../generic/entitySavePlan';
import { TransactionGroupBase, TransactionItem, TransactionResult } from '../generic/transactionGroup';

class MockBatchTransactionGroup extends TransactionGroupBase {
    public SubmitCalls = 0;
    public ShouldSucceed = true;
    public EnqueuedLabels: string[] = [];

    protected override async HandleSubmit(): Promise<TransactionResult[]> {
        this.SubmitCalls++;
        const results = this.PendingTransactions.map(item => new TransactionResult(item, {}, this.ShouldSucceed));
        return results;
    }

    public override AddTransaction(transaction: TransactionItem): void {
        super.AddTransaction(transaction);
        this.EnqueuedLabels.push(transaction.ExtraData?.label ?? 'unknown');
    }
}

interface LeafProvider {
    GroupsCreated: MockBatchTransactionGroup[];
    CreateTransactionGroup: () => Promise<TransactionGroupBase>;
    NextSubmitSucceeds: boolean;
}

function makeBatchProvider(nextSubmitSucceeds = true): LeafProvider {
    const provider: LeafProvider = {
        GroupsCreated: [],
        NextSubmitSucceeds: nextSubmitSucceeds,
        CreateTransactionGroup: async () => {
            const tg = new MockBatchTransactionGroup();
            tg.ShouldSucceed = provider.NextSubmitSucceeds;
            provider.GroupsCreated.push(tg);
            return tg;
        },
    };
    return provider;
}

function makeLeafEntity(
    name: string,
    provider: LeafProvider | undefined,
    events: string[],
    opts: {
        id?: string;
        failSave?: boolean;
        hasCompanions?: boolean;
        isChildType?: boolean;
    } = {},
): BaseEntity {
    const history: Array<{ Success: boolean; CompleteMessage: string }> = [];
    const entity = {
        EntityInfo: {
            Name: name,
            IsParentType: false,
            IsChildType: Boolean(opts.isChildType),
        },
        HasCompanions: Boolean(opts.hasCompanions),
        ProviderToUse: provider,
        TransactionGroup: null as TransactionGroupBase | null,
        IsSaved: Boolean(opts.id),
        PrimaryKey: {
            HasValue: Boolean(opts.id),
            ToString: () => (opts.id ? `ID=${opts.id}` : ''),
        },
        get ResultHistory() {
            return history;
        },
        get LatestResult() {
            return history.length > 0 ? history[history.length - 1] : undefined;
        },
        async Save(): Promise<boolean> {
            events.push(`save:${name}:${entity.TransactionGroup ? 'batched' : 'direct'}`);
            if (opts.failSave) {
                history.push({ Success: false, CompleteMessage: `${name} invalid` });
                return false;
            }
            if (entity.TransactionGroup) {
                const tg = entity.TransactionGroup;
                const item = new TransactionItem(
                    entity as unknown as BaseEntity,
                    'Create',
                    `SAVE ${name}`,
                    null,
                    { label: name },
                    (_res, ok) => {
                        history.push({
                            Success: ok,
                            CompleteMessage: ok ? 'ok' : `${name} sql failed`,
                        });
                    },
                );
                tg.AddTransaction(item);
                return true;
            }
            history.push({ Success: true, CompleteMessage: 'ok' });
            return true;
        },
        async Delete(): Promise<boolean> {
            events.push(`delete:${name}:${entity.TransactionGroup ? 'batched' : 'direct'}`);
            if (entity.TransactionGroup) {
                const item = new TransactionItem(
                    entity as unknown as BaseEntity,
                    'Delete',
                    `DELETE ${name}`,
                    null,
                    { label: name },
                    (_res, ok) => {
                        history.push({
                            Success: ok,
                            CompleteMessage: ok ? 'ok' : `${name} delete failed`,
                        });
                    },
                );
                entity.TransactionGroup.AddTransaction(item);
                return true;
            }
            history.push({ Success: true, CompleteMessage: 'ok' });
            return true;
        },
    };
    return entity as unknown as BaseEntity;
}

describe('ExecuteEntitySavePlan contiguous leaf batching', () => {
    it('batches contiguous leaf child saves and deletes into one TransactionGroup while keeping Root SelfOnly separate', async () => {
        const provider = makeBatchProvider();
        const events: string[] = [];
        const root = makeLeafEntity('Order', provider, events, { id: 'o-1' });
        const del1 = makeLeafEntity('LineDel1', provider, events, { id: 'ld-1' });
        const del2 = makeLeafEntity('LineDel2', provider, events, { id: 'ld-2' });
        const add1 = makeLeafEntity('LineAdd1', provider, events);
        const add2 = makeLeafEntity('LineAdd2', provider, events);

        const plan = new EntitySavePlan(root);
        plan.AddDelete(del1, 'Removed[0]')
            .AddDelete(del2, 'Removed[1]')
            .AddSave(root, 'Order', undefined, true)
            .AddSave(add1, 'Lines[0]', () => events.push('prepare:LineAdd1'))
            .AddSave(add2, 'Lines[1]', () => events.push('prepare:LineAdd2'));

        const result = await ExecuteEntitySavePlan(plan, {
            SaveSelfOnly: async (e) => {
                events.push(`self:${e.EntityInfo.Name}`);
                return true;
            },
        });

        expect(result.Success).toBe(true);
        expect(provider.GroupsCreated).toHaveLength(2);
        expect(provider.GroupsCreated[0].BatchedSubmit).toBe(true);
        expect(provider.GroupsCreated[0].SubmitCalls).toBe(1);
        expect(provider.GroupsCreated[0].EnqueuedLabels).toEqual(['LineDel1', 'LineDel2']);

        expect(provider.GroupsCreated[1].BatchedSubmit).toBe(true);
        expect(provider.GroupsCreated[1].SubmitCalls).toBe(1);
        expect(provider.GroupsCreated[1].EnqueuedLabels).toEqual(['LineAdd1', 'LineAdd2']);

        expect(events).toEqual([
            'delete:LineDel1:batched',
            'delete:LineDel2:batched',
            'self:Order',
            'prepare:LineAdd1',
            'save:LineAdd1:batched',
            'prepare:LineAdd2',
            'save:LineAdd2:batched',
        ]);
        expect(add1.TransactionGroup).toBeNull();
        expect(add2.TransactionGroup).toBeNull();
    });

    it('aborts before Submit() if any leaf node fails enqueueing/validation and restores TransactionGroup', async () => {
        const provider = makeBatchProvider();
        const events: string[] = [];
        const root = makeLeafEntity('Order', provider, events, { id: 'o-1' });
        const add1 = makeLeafEntity('Line1', provider, events);
        const add2 = makeLeafEntity('Line2', provider, events, { failSave: true });
        const add3 = makeLeafEntity('Line3', provider, events);

        const plan = new EntitySavePlan(root);
        plan.AddSave(add1, 'Lines[0]')
            .AddSave(add2, 'Lines[1]')
            .AddSave(add3, 'Lines[2]');

        const result = await ExecuteEntitySavePlan(plan);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Line2 invalid');
        expect(provider.GroupsCreated).toHaveLength(1);
        expect(provider.GroupsCreated[0].SubmitCalls).toBe(0);
        expect(events).toEqual(['save:Line1:batched', 'save:Line2:batched']);
        expect(add1.TransactionGroup).toBeNull();
        expect(add2.TransactionGroup).toBeNull();
    });

    it('returns detailed failure when TransactionGroup.Submit() fails and detaches TransactionGroup', async () => {
        const provider = makeBatchProvider(false);
        const events: string[] = [];
        const root = makeLeafEntity('Order', provider, events, { id: 'o-1' });
        const add1 = makeLeafEntity('Line1', provider, events);
        const add2 = makeLeafEntity('Line2', provider, events);

        const plan = new EntitySavePlan(root);
        plan.AddSave(add1, 'Lines[0]').AddSave(add2, 'Lines[1]');

        const result = await ExecuteEntitySavePlan(plan);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Line1 sql failed');
        expect(provider.GroupsCreated).toHaveLength(1);
        expect(provider.GroupsCreated[0].SubmitCalls).toBe(1);
        expect(add1.TransactionGroup).toBeNull();
        expect(add2.TransactionGroup).toBeNull();
    });

    it('breaks batch runs around nodes disallowed by CanBatchLeaf or IS-A types without dropping work', async () => {
        const provider = makeBatchProvider();
        const events: string[] = [];
        const root = makeLeafEntity('Order', provider, events, { id: 'o-1' });
        const customChild = makeLeafEntity('CustomChild', provider, events);
        const isaChild = makeLeafEntity('ISAChild', provider, events, { isChildType: true });
        const normalA = makeLeafEntity('NormalA', provider, events);
        const normalB = makeLeafEntity('NormalB', provider, events);

        const plan = new EntitySavePlan(root);
        plan.AddSave(customChild, 'Custom[0]')
            .AddSave(isaChild, 'ISA[0]')
            .AddSave(normalA, 'Normal[0]')
            .AddSave(normalB, 'Normal[1]');

        const result = await ExecuteEntitySavePlan(plan, {
            CanBatchLeaf: (e) => e.EntityInfo.Name !== 'CustomChild',
        });

        expect(result.Success).toBe(true);
        expect(provider.GroupsCreated).toHaveLength(1);
        expect(provider.GroupsCreated[0].EnqueuedLabels).toEqual(['NormalA', 'NormalB']);
        expect(events).toEqual([
            'save:CustomChild:direct',
            'save:ISAChild:direct',
            'save:NormalA:batched',
            'save:NormalB:batched',
        ]);
    });
});
