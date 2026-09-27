import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJQueueEntity, MJQueueTaskEntity } from '@memberjunction/core-entities';

const GLOBAL_PROVIDER = vi.hoisted(() => ({ Name: 'global-provider' }));
const ai = vi.hoisted(() => ({
    Config: vi.fn(async () => undefined),
    ExecuteEntityAIAction: vi.fn(),
    ExecuteAIAction: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    Metadata: class { static get Provider() { return GLOBAL_PROVIDER; } },
    BaseEntity: class {},
    UserInfo: class {},
    CompositeKey: class {},
}));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: ai } }));
// Partial mock: EntityAIActionReferenceError and the type guards stay real; only resolution is scripted.
vi.mock('../references/EntityAIActionTaskReference', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../references/EntityAIActionTaskReference')>();
    return { ...actual, ResolveEntityAIActionTaskReference: vi.fn() };
});

import { QueueBase, TaskBase, type TaskResult } from '../generic/QueueBase';
import { AIActionQueue, EntityAIActionQueue } from '../drivers/AIActionQueue';
import {
    ENTITY_AI_ACTION_REFERENCE_KIND,
    EntityAIActionReferenceError,
    ResolveEntityAIActionTaskReference,
    type EntityAIActionTaskReference,
} from '../references/EntityAIActionTaskReference';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const QUEUE_RECORD = { ID: 'queue-1' } as unknown as MJQueueEntity;
const PROVIDER = { Name: 'delivery-provider' } as unknown as IMetadataProvider;
const REFERENCE: EntityAIActionTaskReference = {
    kind: ENTITY_AI_ACTION_REFERENCE_KIND, entityAIActionId: 'eaa-1', actionId: 'act-1', modelId: 'model-1',
    entityName: 'Contacts', recordID: 'ID|0A1B',
};

function taskWith(data: unknown): TaskBase {
    return new TaskBase({ ID: 'task-1' } as unknown as MJQueueTaskEntity, data, {});
}

class ProbeQueue extends QueueBase {
    public Seen: { provider: IMetadataProvider; user: UserInfo }[] = [];
    protected async ProcessTask(_task: TaskBase, contextUser: UserInfo): Promise<TaskResult> {
        this.Seen.push({ provider: this.Provider, user: contextUser });
        return { success: true, userMessage: 'ok', output: 'done', exception: null };
    }
}

beforeEach(() => {
    vi.mocked(ResolveEntityAIActionTaskReference).mockReset();
    ai.ExecuteEntityAIAction.mockReset();
    ai.ExecuteAIAction.mockReset();
});

describe('QueueBase.ExecuteTask', () => {
    it('runs ProcessTask once without using the in-memory queue', async () => {
        const queue = new ProbeQueue(QUEUE_RECORD, 'type-1', USER);
        const result = await queue.ExecuteTask(taskWith({}), USER, PROVIDER);
        expect(result).toEqual({ success: true, userMessage: 'ok', output: 'done', exception: null });
        expect(queue.QueueSize).toBe(0);
        expect(queue.Seen).toHaveLength(1);
    });

    it('exposes the supplied provider to the driver', async () => {
        const queue = new ProbeQueue(QUEUE_RECORD, 'type-1', USER);
        await queue.ExecuteTask(taskWith({}), USER, PROVIDER);
        expect(queue.Seen[0]).toEqual({ provider: PROVIDER, user: USER });
    });

    it('falls back to Metadata.Provider when no provider is supplied', async () => {
        const queue = new ProbeQueue(QUEUE_RECORD, 'type-1', USER);
        await queue.ExecuteTask(taskWith({}), USER);
        expect(queue.Seen[0].provider).toBe(GLOBAL_PROVIDER);
    });
});

describe('EntityAIActionQueue', () => {
    it('resolves a reference through the task provider and runs the action', async () => {
        const resolved = { entityAIActionId: 'eaa-1', actionId: 'act-1', modelId: 'model-1', entityRecord: { ID: 'r' } };
        vi.mocked(ResolveEntityAIActionTaskReference).mockResolvedValue(resolved as never);
        ai.ExecuteEntityAIAction.mockResolvedValue({ success: true, errorMessage: null });

        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(taskWith(REFERENCE), USER, PROVIDER);

        expect(ResolveEntityAIActionTaskReference).toHaveBeenCalledWith(REFERENCE, PROVIDER, USER);
        expect(ai.ExecuteEntityAIAction).toHaveBeenCalledWith(resolved);
        expect(result.success).toBe(true);
    });

    it('reports RecordNotFound without running the action when the record does not load', async () => {
        vi.mocked(ResolveEntityAIActionTaskReference).mockResolvedValue(null);

        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(taskWith(REFERENCE), USER, PROVIDER);

        expect(ai.ExecuteEntityAIAction).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false, output: null, exception: null, failureKind: 'RecordNotFound',
            userMessage: 'The record for this Entity AI Action could not be loaded (deleted, or not yet committed).',
        });
    });

    it('marks a reference that can never resolve as Fatal', async () => {
        vi.mocked(ResolveEntityAIActionTaskReference).mockRejectedValue(new EntityAIActionReferenceError("Entity 'Contacts' … was not found in metadata"));

        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(taskWith(REFERENCE), USER, PROVIDER);

        expect(result.success).toBe(false);
        expect(result.failureKind).toBe('Fatal');
        expect(result.userMessage).toMatch(/^Execution Error: Entity 'Contacts'/);
    });

    it('passes live params through unchanged', async () => {
        const live = { entityAIActionId: 'eaa-1', actionId: 'act-1', modelId: 'model-1', entityRecord: { ID: 'r' } };
        ai.ExecuteEntityAIAction.mockResolvedValue({ success: false, errorMessage: 'model refused' });

        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(taskWith(live), USER, PROVIDER);

        expect(ResolveEntityAIActionTaskReference).not.toHaveBeenCalled();
        expect(ai.ExecuteEntityAIAction).toHaveBeenCalledWith(live);
        expect(result).toEqual({ success: false, output: 'model refused', userMessage: 'model refused', exception: null });
        expect(result.failureKind).toBeUndefined();
    });

    it('fails unrecognised task data as Fatal', async () => {
        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(taskWith({ foo: 1 }), USER, PROVIDER);
        expect(result.success).toBe(false);
        expect(result.failureKind).toBe('Fatal');
        expect(result.userMessage).toMatch(/^Execution Error: Unrecognised Entity AI Action task data/);
        expect(ai.ExecuteEntityAIAction).not.toHaveBeenCalled();
    });
});

describe('AIActionQueue', () => {
    it('still runs plain AI actions', async () => {
        ai.ExecuteAIAction.mockResolvedValue({ success: true, errorMessage: null });
        const params = { actionId: 'act-1', modelId: 'model-1' };

        const result = await new AIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(taskWith(params), USER, PROVIDER);

        expect(ai.ExecuteAIAction).toHaveBeenCalledWith(params);
        expect(result).toEqual({ success: true, output: null, userMessage: null, exception: null });
    });
});
