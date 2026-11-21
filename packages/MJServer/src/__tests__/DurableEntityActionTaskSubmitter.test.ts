import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const { submitMock } = vi.hoisted(() => ({
    submitMock: vi.fn(),
}));

vi.mock('@memberjunction/task-graph', () => ({
    TaskGraphService: class {
        public Submit = submitMock;
    },
}));

import { DurableEntityActionTaskSubmitter } from '../services/DurableEntityActionTaskSubmitter.js';

describe('DurableEntityActionTaskSubmitter', () => {
    const contextUser = { ID: 'user-1', Email: 'test@example.com' } as UserInfo;

    beforeEach(() => {
        submitMock.mockReset();
        submitMock.mockResolvedValue({ Success: true, ParentTaskID: 'parent-task-1' });
    });

    it('enlists in request.Provider when supplied instead of minting an isolated provider connection', async () => {
        const savingProvider = { Name: 'saving-tx-provider', GetEntityObject: vi.fn() } as object as IMetadataProvider;
        const createProvider = vi.fn();
        const submitter = new DurableEntityActionTaskSubmitter({ CreateProvider: createProvider }, 'env-1');

        const result = await submitter.Submit({
            EntityActionID: 'ea-1',
            ActionID: 'act-1',
            ActionName: 'Send Order Webhook',
            EntityID: 'ent-1',
            EntityName: 'Orders',
            RecordID: 'ID|ord-1',
            InvocationType: 'AfterCreate',
            RedactedParams: { OrderID: 'ord-1' },
            ContextUser: contextUser,
            Provider: savingProvider,
        });

        expect(result).toEqual({ Success: true, ParentTaskID: 'parent-task-1' });
        expect(createProvider).not.toHaveBeenCalled();
        expect(submitMock).toHaveBeenCalledTimes(1);
        expect(submitMock.mock.calls[0][1]).toMatchObject({
            EnvironmentID: 'env-1',
            ContextUser: contextUser,
            Provider: savingProvider,
        });
    });

    it('falls back to providerFactory.CreateProvider() when request.Provider is omitted', async () => {
        const factoryProvider = { Name: 'factory-provider' } as IMetadataProvider;
        const createProvider = vi.fn().mockResolvedValue(factoryProvider);
        const submitter = new DurableEntityActionTaskSubmitter({ CreateProvider: createProvider }, 'env-1');

        const result = await submitter.Submit({
            EntityActionID: 'ea-1',
            ActionID: 'act-1',
            ActionName: 'Send Order Webhook',
            EntityID: 'ent-1',
            EntityName: 'Orders',
            RecordID: 'ID|ord-1',
            InvocationType: 'AfterCreate',
            RedactedParams: {},
            ContextUser: contextUser,
        });

        expect(result).toEqual({ Success: true, ParentTaskID: 'parent-task-1' });
        expect(createProvider).toHaveBeenCalledTimes(1);
        expect(submitMock.mock.calls[0][1]).toMatchObject({ Provider: factoryProvider });
    });
});
