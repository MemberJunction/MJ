import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJQueueEntity } from '@memberjunction/core-entities';
import type { WorkContext, WorkMessage } from '@memberjunction/work-queue-core';

const cache = vi.hoisted(() => ({ Users: [] as { ID: string; Name: string }[], Throw: false }));
const registered = vi.hoisted(() => ({ QueueTypes: [{ ID: 'type-9', Name: 'MJ Test Recording' }] }));

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn() }));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        get Instance() {
            if (cache.Throw) {
                throw new Error('user cache not initialised');
            }
            return { Users: cache.Users };
        },
    },
}));
vi.mock('@memberjunction/work-queue-engine', () => ({
    BaseWorkHandler: class {
        protected ContextUser!: UserInfo;
        protected Provider!: IMetadataProvider;
        public BindExecutionContext(ctx: { ContextUser: UserInfo; Provider: IMetadataProvider }): void {
            this.ContextUser = ctx.ContextUser;
            this.Provider = ctx.Provider;
        }
    },
}));
vi.mock('@memberjunction/queue', () => {
    class TaskBase {
        constructor(public Record: unknown, public Data: unknown, public Options: unknown) {}
    }
    abstract class QueueBase {
        constructor(public QueueRecord: MJQueueEntity, public QueueTypeID: string, protected _contextUser: UserInfo) {}
        protected Provider: IMetadataProvider | null = null;
        protected abstract ProcessTask(task: TaskBase, contextUser: UserInfo): Promise<unknown>;
        public async ExecuteTask(task: TaskBase, contextUser: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
            this.Provider = provider ?? null;
            return this.ProcessTask(task, contextUser);
        }
    }
    return {
        TaskBase,
        QueueBase,
        QueueManager: { Config: vi.fn(async () => undefined), get QueueTypes() { return registered.QueueTypes; } },
    };
});

import { MJGlobal } from '@memberjunction/global';
import { QueueBase, TaskBase, type TaskResult } from '@memberjunction/queue';
import { FatalWorkError, TransientWorkError } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
import { LegacyQueueDriverHandler } from '../LegacyQueueDriverHandler';
import type { LegacyQueueTaskPayload } from '../LegacyQueueTaskPayload';

const HOST_USER = { ID: 'host-user', Name: 'System' } as unknown as UserInfo;
const ENQUEUER = { ID: '6F1B5C52-0D1A-4C39-9D8E-2B1C6F0B0A11', Name: 'Pat' };

class RecordingQueue extends QueueBase {
    public static Runs: { data: unknown; options: unknown; typeID: string; provider: IMetadataProvider | null; userID: string; constructedAs: string }[] = [];
    public static Result: TaskResult = { success: true, userMessage: 'ok', output: null, exception: null };
    protected async ProcessTask(task: TaskBase, contextUser: UserInfo): Promise<TaskResult> {
        RecordingQueue.Runs.push({
            data: task.Data, options: task.Options, typeID: this.QueueTypeID, provider: this.Provider,
            userID: contextUser.ID, constructedAs: this._contextUser.ID,
        });
        return RecordingQueue.Result;
    }
}
MJGlobal.Instance.ClassFactory.Register(QueueBase, RecordingQueue, 'MJ Test Recording');

function provider(): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => ({ NewRecord: vi.fn(), ID: '', Name: '', Data: null, Options: null })),
    } as unknown as IMetadataProvider;
}

function message(payload: LegacyQueueTaskPayload | { wrong: true }): WorkMessage<LegacyQueueTaskPayload> {
    return {
        MessageID: 'm-1', Topic: 'mjqueue.mj-test-recording', Attributes: {}, PublishedAt: new Date().toISOString(),
        Payload: payload as LegacyQueueTaskPayload,
    };
}

function context(attempt: number, maxAttempts: number): WorkContext & { Warned: string[] } {
    const warned: string[] = [];
    return {
        SubscriptionName: 'mjqueue.mj-test-recording.legacy-driver', DeliveryID: 'd-1', Attempt: attempt, MaxAttempts: maxAttempts,
        IsReplay: false, Signal: new AbortController().signal, Heartbeat: async () => true,
        Log: { Info: () => undefined, Warn: (m: string) => { warned.push(m); }, Error: () => undefined },
        Warned: warned,
    };
}

function task(overrides: Partial<LegacyQueueTaskPayload> = {}): LegacyQueueTaskPayload {
    return { queueTypeName: 'MJ Test Recording', data: {}, options: null, userID: null, ...overrides };
}

function boundHandler(p: IMetadataProvider): LegacyQueueDriverHandler {
    const handler = new LegacyQueueDriverHandler();
    handler.BindExecutionContext({ ContextUser: HOST_USER, Provider: p });
    return handler;
}

beforeEach(() => {
    RecordingQueue.Runs = [];
    RecordingQueue.Result = { success: true, userMessage: 'ok', output: null, exception: null };
    cache.Users = [ENQUEUER];
    cache.Throw = false;
});

describe('LegacyQueueDriverHandler', () => {
    it('is registered under MJQueue.LegacyQueueDriver', () => {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseWorkHandler, 'MJQueue.LegacyQueueDriver');
        expect(registration?.SubClass).toBe(LegacyQueueDriverHandler);
    });

    it('runs the registered driver with the task data and completes', async () => {
        const p = provider();
        const outcome = await boundHandler(p).Handle(message(task({ data: { probe: 1 }, options: { priority: 4 } })), context(1, 3));

        expect(outcome).toEqual({ Kind: 'Complete' });
        expect(RecordingQueue.Runs).toEqual([{
            data: { probe: 1 }, options: { priority: 4 }, typeID: 'type-9', provider: p, userID: 'host-user', constructedAs: 'host-user',
        }]);
        expect(p.GetEntityObject).toHaveBeenCalledWith('MJ: Queues', HOST_USER);
        expect(p.GetEntityObject).toHaveBeenCalledWith('MJ: Queue Tasks', HOST_USER);
    });

    it('runs the driver as the enqueuing user when the payload names one', async () => {
        await boundHandler(provider()).Handle(message(task({ userID: ENQUEUER.ID.toLowerCase() })), context(1, 3));
        expect(RecordingQueue.Runs[0].userID).toBe(ENQUEUER.ID);
        expect(RecordingQueue.Runs[0].constructedAs).toBe(ENQUEUER.ID);
    });

    it('falls back to the host user when the enqueuing user is unknown or the cache is unavailable', async () => {
        await boundHandler(provider()).Handle(message(task({ userID: 'not-a-known-user' })), context(1, 3));
        cache.Throw = true;
        await boundHandler(provider()).Handle(message(task({ userID: ENQUEUER.ID })), context(1, 3));
        expect(RecordingQueue.Runs.map((r) => r.userID)).toEqual(['host-user', 'host-user']);
    });

    it('turns a failed task result into a transient error', async () => {
        RecordingQueue.Result = { success: false, userMessage: 'model timed out', output: null, exception: null };
        await expect(boundHandler(provider()).Handle(message(task()), context(1, 3))).rejects.toBeInstanceOf(TransientWorkError);
    });

    it('dead-letters a task the driver marks fatal', async () => {
        RecordingQueue.Result = { success: false, userMessage: 'Execution Error: Unrecognised Entity AI Action task data', output: null, exception: null, failureKind: 'Fatal' };
        const handling = boundHandler(provider()).Handle(message(task()), context(1, 3));
        await expect(handling).rejects.toBeInstanceOf(FatalWorkError);
        await expect(boundHandler(provider()).Handle(message(task()), context(1, 3))).rejects.toThrow('Unrecognised Entity AI Action task data');
    });

    it('retries a record that does not load while attempts remain', async () => {
        RecordingQueue.Result = { success: false, userMessage: 'record could not be loaded', output: null, exception: null, failureKind: 'RecordNotFound' };
        await expect(boundHandler(provider()).Handle(message(task()), context(2, 3))).rejects.toBeInstanceOf(TransientWorkError);
    });

    it('completes with a warning when the record still does not load on the last attempt', async () => {
        RecordingQueue.Result = { success: false, userMessage: 'record could not be loaded', output: null, exception: null, failureKind: 'RecordNotFound' };
        const ctx = context(3, 3);
        expect(await boundHandler(provider()).Handle(message(task()), ctx)).toEqual({ Kind: 'Complete' });
        expect(ctx.Warned).toHaveLength(1);
        expect(ctx.Warned[0]).toContain('MJ Test Recording');
    });

    it('dead-letters a queue type with no registered driver', async () => {
        const handling = boundHandler(provider()).Handle(message(task({ queueTypeName: 'No Such Queue Type' })), context(1, 3));
        await expect(handling).rejects.toBeInstanceOf(FatalWorkError);
        await expect(boundHandler(provider()).Handle(message(task({ queueTypeName: 'No Such Queue Type' })), context(1, 3)))
            .rejects.toThrow("No QueueBase driver is registered for queue type 'No Such Queue Type'");
    });

    it('dead-letters a payload that is not a legacy queue task', async () => {
        await expect(boundHandler(provider()).Handle(message({ wrong: true }), context(1, 3))).rejects.toBeInstanceOf(FatalWorkError);
    });
});
