import { describe, it, expect, afterEach } from 'vitest';
import { BaseRemotableOperation } from '@memberjunction/core';
import type { IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { SetOperatorPermissionLookupForTests } from '../operations/operatorAuthorization';
import {
    WorkQueueDiscardDeliveryServerOperation, WorkQueueGetBacklogServerOperation, WorkQueueGetSubscriptionStatsServerOperation,
    WorkQueueListDeadLettersServerOperation, WorkQueueListPartitionsServerOperation, WorkQueueReplayDeadLetterServerOperation,
    WorkQueueValidateBindingsServerOperation,
} from '../operations/WorkQueueOperations';
import { TEST_PROVIDER, TEST_USER } from './runtimeFakes';

interface DeclaredOperation {
    OperationKey: string;
    RequiredScope?: string;
    ExecutionMode: string;
    ExecuteServer(input: never, context: RemoteOpServerContext): Promise<{ Success: boolean; ResultCode: string }>;
}

const OPERATIONS: Array<[string, new () => DeclaredOperation, string]> = [
    ['WorkQueue.GetSubscriptionStats', WorkQueueGetSubscriptionStatsServerOperation, 'workqueue:read'],
    ['WorkQueue.ListDeadLetters', WorkQueueListDeadLettersServerOperation, 'workqueue:read'],
    ['WorkQueue.ListPartitions', WorkQueueListPartitionsServerOperation, 'workqueue:read'],
    ['WorkQueue.ReplayDeadLetter', WorkQueueReplayDeadLetterServerOperation, 'workqueue:operate'],
    ['WorkQueue.DiscardDelivery', WorkQueueDiscardDeliveryServerOperation, 'workqueue:operate'],
    ['WorkQueue.GetBacklog', WorkQueueGetBacklogServerOperation, 'workqueue:read'],
    ['WorkQueue.ValidateBindings', WorkQueueValidateBindingsServerOperation, 'workqueue:read'],
];

function context(user: UserInfo, provider: IMetadataProvider): RemoteOpServerContext {
    return { provider, user, emitProgress: () => undefined };
}

afterEach(() => {
    SetOperatorPermissionLookupForTests(null);
});

describe('work queue remote operations', () => {
    it('register each of the seven server implementations under its operation key', () => {
        expect(OPERATIONS).toHaveLength(7);
        for (const [key, serverClass] of OPERATIONS) {
            expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, key)?.SubClass, key).toBe(serverClass);
        }
    });

    it('declare the scope from metadata as synchronous operations', () => {
        for (const [key, serverClass, scope] of OPERATIONS) {
            const operation = new serverClass();
            expect([operation.OperationKey, operation.RequiredScope, operation.ExecutionMode]).toEqual([key, scope, 'Sync']);
        }
    });

    it('refuse a user without the entity permission before touching the engine (FORBIDDEN)', async () => {
        SetOperatorPermissionLookupForTests(() => ({ CanRead: false, CanUpdate: false }));
        for (const [key, serverClass] of OPERATIONS) {
            const result = await new serverClass().ExecuteServer({} as never, context(TEST_USER, TEST_PROVIDER));
            expect([key, result.Success, result.ResultCode]).toEqual([key, false, 'FORBIDDEN']);
        }
    });

    it('lets a read-only user read but not operate', async () => {
        SetOperatorPermissionLookupForTests(() => ({ CanRead: true, CanUpdate: false }));
        const discard = await new WorkQueueDiscardDeliveryServerOperation().ExecuteServer({} as never, context(TEST_USER, TEST_PROVIDER));
        expect(discard.ResultCode).toBe('FORBIDDEN');
        // A read operation passes Authorize; it then fails later (the engine is not configured in this unit test),
        // which proves the refusal above came from Authorize and not from execution.
        const stats = await new WorkQueueGetBacklogServerOperation().ExecuteServer({} as never, context(TEST_USER, TEST_PROVIDER));
        expect(stats.ResultCode).toBe('EXECUTION_ERROR');
    });
});
