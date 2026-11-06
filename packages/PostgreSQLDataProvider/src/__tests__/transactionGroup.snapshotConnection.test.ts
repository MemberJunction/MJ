/**
 * A transaction group with variables regenerates an item's save SQL while its own transaction is
 * open. The regenerated save is handed the group's client, so a read its Record Change snapshot
 * needs runs inside that transaction and sees the group's earlier writes.
 */
import { describe, it, expect, vi } from 'vitest';
import { PostgreSQLTransactionGroup } from '../PostgreSQLTransactionGroup.js';
import type { TransactionItem } from '@memberjunction/core';

type VariablesRunner = {
    executeWithVariables: (items: TransactionItem[], client: unknown, provider: unknown, results: unknown[]) => Promise<void>;
    SetEntityValuesFromVariables: (entity: unknown) => number;
    SetVariableValuesFromEntity: (entity: unknown, row: unknown) => number;
    executeItem: (client: unknown, item: TransactionItem, provider: unknown) => Promise<Record<string, unknown>[]>;
};

describe('PostgreSQLTransactionGroup — variables path', () => {
    it("regenerates an item's save SQL on the group's own client", async () => {
        const group = new PostgreSQLTransactionGroup() as unknown as VariablesRunner;
        group.SetEntityValuesFromVariables = () => 1;
        group.SetVariableValuesFromEntity = () => 0;
        group.executeItem = async () => [{ ID: 'w-1' }];
        const client = { query: vi.fn(), release: vi.fn() };
        const provider = { GetSaveSQL: vi.fn(async () => ({ fullSQL: '-- regenerated' })) };
        const entity = { EntityInfo: { Name: 'Widgets' }, ContextCurrentUser: { ID: 'u-1' } };
        const item = { BaseEntity: entity, Instruction: '-- original', OperationType: 'Update', ExtraData: {} } as unknown as TransactionItem;

        await group.executeWithVariables([item], client, provider, []);

        expect(provider.GetSaveSQL).toHaveBeenCalledWith(entity, false, entity.ContextCurrentUser, client);
    });
});
