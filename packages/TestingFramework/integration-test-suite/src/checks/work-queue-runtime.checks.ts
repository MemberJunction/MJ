/**
 * work-queue-runtime.checks.ts — the 'work-queue-runtime' bundle (WR1–WR19): the durable work queue's MJ runtime
 * against the live database — WorkQueueHost (long-running and one-shot), direct Database consumers, the operator
 * Remote Operations, the sweeper, the deduplication ledger, cancel, and the REST publish endpoint. Deterministic,
 * no model calls, server transport; runs on SQL Server and PostgreSQL.
 *
 * Every fixture is named 'mj-it-wq-…'. Setup removes leftovers from an interrupted run before creating fresh
 * fixtures; Teardown removes them again. Checks run in array order; each settles or discards what it creates.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseProviderBase, RunView, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueListPartitionsOperation,
    WorkQueueReplayDeadLetterOperation,
    type MJAPIKeyEntity, type MJAPIKeyScopeEntity, type MJAPIKeyUsageLogEntity, type MJWorkQueueDeliveryEntity,
    type MJWorkQueueSubscriptionEntity, type MJWorkQueueTopicEntity, type WorkQueueGetBacklogOutput,
} from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { MJGlobal, ShutdownRegistry, UUIDsEqual } from '@memberjunction/global';
import {
    Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    Outcome,
    type ITransportConsumer, type PublishRequest, type PublishResult, type ReceivedDelivery, type WorkContext,
    type WorkMessage, type WorkOutcome,
} from '@memberjunction/work-queue-core';
import {
    BaseWorkHandler, CreateDatabaseConformanceHarness, MJWorkLogger, SharedProviderSource, WorkQueueEngine,
    WorkQueueHost, WorkQueueSweeper, type DeadLetteredEvent,
} from '@memberjunction/work-queue-engine';
import { RunConformanceChecks } from '@memberjunction/work-queue-core/testing';
import {
    APIKeyScopeAuthorizer, CreateWorkQueuePublishRouter, HandleWorkQueuePublish,
    type WorkQueuePublishDependencies, type WorkQueueRequestPayload,
} from '@memberjunction/work-queue-server';

const PREFIX = 'mj-it-wq-';
const DATABASE_TRANSPORT_ID = 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5';
const HANDLER_KEY = 'mj-it-wq.scripted';
const WAIT_TIMEOUT_MS = 20000;
/** WR16's subscription: heartbeat interval = min(15 / 3, 30) = 5 s, so a cancel is noticed within ~5 s. */
const CANCEL_LEASE_SECONDS = 15;
/** WR16: the cancelled row must be Discarded well before its 15 s lease could have expired. */
const CANCEL_DISCARDED_WITHIN_MS = 12000;

const NAMES = {
    EventsTopic: `${PREFIX}events`,
    CompleteSub: `${PREFIX}complete`,
    RejectSub: `${PREFIX}reject`,
    UnregisteredSub: `${PREFIX}unregistered`,
    InternalTopic: `${PREFIX}internal`,
    InternalSub: `${PREFIX}internal-sub`,
    ExclusiveTopic: `${PREFIX}exclusive`,
    ExclusiveSub: `${PREFIX}exclusive-sub`,
    OrderedTopic: `${PREFIX}ordered`,
    OrderedSub: `${PREFIX}ordered-sub`,
    CancelTopic: `${PREFIX}cancel`,
    CancelSub: `${PREFIX}cancel-sub`,
    RunOnceTopic: `${PREFIX}runonce`,
    RunOnceSub: `${PREFIX}runonce-sub`,
} as const;

interface RuntimeFixture {
    Provider: DatabaseProviderBase;
    CompletedDeliveryID: string | null;
}

interface DeliveryRow {
    ID: string;
    MessageID: string;
    SubscriptionID: string;
    Status: string;
    AttemptCount: number;
    IsReplay: boolean;
    LastError: string | null;
    DeadLetterReason: string | null;
}

let fixture: RuntimeFixture | undefined;
let handlerRegistered = false;

function fx(): RuntimeFixture {
    if (!fixture) {
        throw new Error('work-queue-runtime fixture missing (bundle Setup did not run)');
    }
    return fixture;
}

/** What the scripted handler observed, for WR16. Reset by the check that reads it. */
const observed: { HeldStarted: boolean; AbortReason: string | null } = { HeldStarted: false, AbortReason: null };

/**
 * Completes every delivery, except: the reject subscription dead-letters, and a `{ hold: true }` payload on the
 * cancel subscription runs until its Signal aborts (then records the abort reason — its outcome is discarded).
 */
class ItScriptedWorkHandler extends BaseWorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        if (context.SubscriptionName === NAMES.RejectSub) {
            return Outcome.DeadLetter('it-reject');
        }
        if (context.SubscriptionName === NAMES.CancelSub && isHoldPayload(message.Payload)) {
            observed.HeldStarted = true;
            await new Promise<void>(resolve => {
                if (context.Signal.aborted) {
                    resolve();
                } else {
                    context.Signal.addEventListener('abort', () => resolve(), { once: true });
                }
            });
            observed.AbortReason = String(context.Signal.reason);
        }
        return Outcome.Complete();
    }
}

function isHoldPayload(payload: WorkMessage['Payload']): boolean {
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && payload.hold === true;
}

// ─── Engine, consumers, publishing ───────────────────────────────────────────────────────────────

function subscription(name: string): MJWorkQueueSubscriptionEntity {
    const found = WorkQueueEngine.Instance.GetSubscriptionByName(name);
    if (!found) {
        throw new Error(`fixture subscription ${name} is not visible to WorkQueueEngine`);
    }
    return found;
}

function topic(name: string): MJWorkQueueTopicEntity {
    const found = WorkQueueEngine.Instance.GetTopicByName(name);
    if (!found) {
        throw new Error(`fixture topic ${name} is not visible to WorkQueueEngine`);
    }
    return found;
}

/** Each consumer owns an independent executor (03 §11), so two of them really do claim concurrently. Always Close(). */
async function withConsumers<T>(names: string[], work: (consumers: ITransportConsumer[]) => Promise<T>): Promise<T> {
    const driver = await WorkQueueEngine.Instance.GetDriver(DATABASE_TRANSPORT_ID);
    const consumers = names.map(name => driver.OpenConsumer(WorkQueueEngine.Instance.BuildSubscriptionBinding(subscription(name))));
    try {
        return await work(consumers);
    } finally {
        for (const consumer of consumers) {
            await consumer.Close().catch(() => undefined);
        }
    }
}

function receive(consumer: ITransportConsumer, max = 10): Promise<ReceivedDelivery[]> {
    return consumer.Receive(max, 0, new AbortController().signal);
}

async function publishOne(user: UserInfo, topicName: string, request: PublishRequest = {}): Promise<string> {
    const [result] = await WorkQueueEngine.Instance.PublishAs(topicName, [{ Attributes: { source: 'it' }, Payload: { at: Date.now() }, ...request }], { ContextUser: user });
    AssertEqual(result.Status, 'Accepted', `publish to ${topicName}: ${result.Error?.Message ?? ''}`);
    return result.MessageID;
}

async function settleAll(consumer: ITransportConsumer, deliveries: ReceivedDelivery[]): Promise<void> {
    for (const delivery of deliveries) {
        const settled = await consumer.Complete(delivery);
        AssertEqual(settled.Kind, 'Settled', `completing ${delivery.DeliveryID}`);
    }
}

function onlyMessage(deliveries: ReceivedDelivery[], messageID: string, label: string): ReceivedDelivery {
    const matches = deliveries.filter(d => UUIDsEqual(d.Message.MessageID, messageID));
    AssertEqual(matches.length, 1, `${label}: deliveries for message ${messageID}`);
    return matches[0];
}

function operationOutput<T>(result: RemoteOpResult<T>, key: string): T {
    if (!result.Success || result.Output === undefined) {
        throw new Error(`${key} failed (${result.ResultCode}): ${result.ErrorMessage}`);
    }
    return result.Output;
}

// ─── Reads and fixture SQL ───────────────────────────────────────────────────────────────────────

async function deliveriesWhere(user: UserInfo, filter: string): Promise<DeliveryRow[]> {
    const result = await new RunView().RunView<DeliveryRow>({
        EntityName: 'MJ: Work Queue Deliveries',
        ExtraFilter: filter,
        Fields: ['ID', 'MessageID', 'SubscriptionID', 'Status', 'AttemptCount', 'IsReplay', 'LastError', 'DeadLetterReason'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(result.Success, `reading deliveries failed: ${result.ErrorMessage}`);
    return result.Results;
}

async function delivery(user: UserInfo, subscriptionName: string, messageID: string): Promise<DeliveryRow> {
    const rows = await deliveriesWhere(user, `SubscriptionID='${subscription(subscriptionName).ID}' AND MessageID='${messageID}'`);
    AssertEqual(rows.length, 1, `delivery rows for ${subscriptionName}/${messageID}`);
    return rows[0];
}

async function messageCount(user: UserInfo, topicName: string): Promise<number> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Work Queue Messages', ExtraFilter: `TopicID='${topic(topicName).ID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `reading messages failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = WAIT_TIMEOUT_MS): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await probe();
        if (value !== null) {
            return value;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
}

function table(provider: DatabaseProviderBase, name: string): string {
    return `${provider.QuoteIdentifier(provider.MJCoreSchemaName)}.${provider.QuoteIdentifier(name)}`;
}

function uuidParam(provider: DatabaseProviderBase, index: number): string {
    const placeholder = provider.BuildParameterPlaceholder(index);
    return provider.PlatformKey === 'postgresql' ? `${placeholder}::uuid` : placeholder;
}

function hoursAgo(provider: DatabaseProviderBase, hours: number): string {
    const h = Math.trunc(hours);
    return provider.PlatformKey === 'postgresql' ? `now() - interval '${h} hours'` : `DATEADD(HOUR, -${h}, SYSDATETIMEOFFSET())`;
}

async function setDeliveryTimestamp(provider: DatabaseProviderBase, user: UserInfo, deliveryID: string, column: 'LeaseExpiresAt' | 'CompletedAt', hours: number): Promise<void> {
    const sql = `UPDATE ${table(provider, 'WorkQueueDelivery')} SET ${provider.QuoteIdentifier(column)} = ${hoursAgo(provider, hours)} WHERE ${provider.QuoteIdentifier('ID')} = ${uuidParam(provider, 0)}`;
    await provider.ExecuteSQL(sql, [deliveryID], { isMutation: true }, user);
}

/** One sweeper pass that actually ran. Another instance may hold the sweep lock (the pass then returns {}); retry. */
async function sweepOnce(provider: DatabaseProviderBase, user: UserInfo): Promise<Record<string, number>> {
    const sweeper = new WorkQueueSweeper(provider, WorkQueueEngine.Instance, user, new MJWorkLogger('[WorkQueue:IT]'));
    return waitFor('a sweeper pass to get the sweep lock', async () => {
        const pass = await sweeper.RunOnce();
        return Object.keys(pass).length > 0 ? pass : null;
    });
}

function newHost(provider: DatabaseProviderBase, user: UserInfo, instance: string, subscriptions: string[], concurrency = 2): WorkQueueHost {
    return new WorkQueueHost(
        {
            InstanceID: `${PREFIX}${instance}-${process.pid}`,
            Subscriptions: subscriptions.map(Name => ({ Name, Concurrency: concurrency })),
            IdlePollMinMs: 50, IdlePollMaxMs: 250, ShutdownDrainMs: 2000, SweeperIntervalMs: 0, ReconcileIntervalMs: 0,
        },
        WorkQueueEngine.Instance, user, provider, new MJWorkLogger('[WorkQueue:IT]'),
        { ProviderSource: new SharedProviderSource(provider) },
    );
}

const HOSTED = [NAMES.CompleteSub, NAMES.RejectSub, NAMES.UnregisteredSub];

// ─── Fixtures ────────────────────────────────────────────────────────────────────────────────────

interface TopicSpec { Name: string; AllowExternalPublish: boolean }
interface SubscriptionSpec { Name: string; Topic: string; PartitionMode: 'None' | 'Exclusive' | 'Ordered'; HandlerKey: string; LeaseSeconds?: number }

const TOPICS: TopicSpec[] = [
    { Name: NAMES.EventsTopic, AllowExternalPublish: true },
    { Name: NAMES.InternalTopic, AllowExternalPublish: false },
    { Name: NAMES.ExclusiveTopic, AllowExternalPublish: false },
    { Name: NAMES.OrderedTopic, AllowExternalPublish: false },
    { Name: NAMES.CancelTopic, AllowExternalPublish: false },
    { Name: NAMES.RunOnceTopic, AllowExternalPublish: false },
];

const SUBSCRIPTIONS: SubscriptionSpec[] = [
    { Name: NAMES.CompleteSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.RejectSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.UnregisteredSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: 'mj-it-wq.not-registered' },
    { Name: NAMES.InternalSub, Topic: NAMES.InternalTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.ExclusiveSub, Topic: NAMES.ExclusiveTopic, PartitionMode: 'Exclusive', HandlerKey: HANDLER_KEY },
    { Name: NAMES.OrderedSub, Topic: NAMES.OrderedTopic, PartitionMode: 'Ordered', HandlerKey: HANDLER_KEY },
    { Name: NAMES.CancelSub, Topic: NAMES.CancelTopic, PartitionMode: 'Exclusive', HandlerKey: HANDLER_KEY, LeaseSeconds: CANCEL_LEASE_SECONDS },
    { Name: NAMES.RunOnceSub, Topic: NAMES.RunOnceTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
];

/**
 * Delivery-state rows are driver-owned — their entities refuse Delete() (03 §6.8) — so they go by SQL, children
 * first. Topology rows and API keys go through their entities.
 */
async function removeFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const id = (name: string): string => provider.QuoteIdentifier(name);
    const namePattern = provider.BuildParameterPlaceholder(0);
    const fixtureSubs = `SELECT s.${id('ID')} FROM ${table(provider, 'WorkQueueSubscription')} s WHERE s.${id('Name')} LIKE ${namePattern}`;
    const fixtureTopics = `SELECT t.${id('ID')} FROM ${table(provider, 'WorkQueueTopic')} t WHERE t.${id('Name')} LIKE ${namePattern}`;
    const statements = [
        `DELETE FROM ${table(provider, 'WorkQueueDelivery')} WHERE ${id('SubscriptionID')} IN (${fixtureSubs})`,
        `DELETE FROM ${table(provider, 'WorkQueueMessage')} WHERE ${id('TopicID')} IN (${fixtureTopics})`,
        `DELETE FROM ${table(provider, 'WorkQueueDeduplication')} WHERE ${id('TopicID')} IN (${fixtureTopics})`,
    ];
    for (const sql of statements) {
        await provider.ExecuteSQL(sql, [`${PREFIX}%`], { isMutation: true }, user);
    }
    const rv = new RunView();
    const byName = { ExtraFilter: `Name LIKE '${PREFIX}%'`, ResultType: 'entity_object' as const, BypassCache: true };
    const subs = await rv.RunView<MJWorkQueueSubscriptionEntity>({ EntityName: 'MJ: Work Queue Subscriptions', ...byName }, user);
    const topics = await rv.RunView<MJWorkQueueTopicEntity>({ EntityName: 'MJ: Work Queue Topics', ...byName }, user);
    Assert(subs.Success && topics.Success, `finding leftover fixtures failed: ${subs.ErrorMessage ?? topics.ErrorMessage}`);
    for (const record of [...subs.Results, ...topics.Results]) {
        Assert(await record.Delete(), `removing fixture ${record.Name} failed: ${record.LatestResult?.CompleteMessage}`);
    }
    const keys = await rv.RunView<MJAPIKeyEntity>({ EntityName: 'MJ: API Keys', ExtraFilter: `Label LIKE '${PREFIX}rest-%'`, ResultType: 'entity_object', BypassCache: true }, user);
    for (const key of keys.Results ?? []) {
        await deleteApiKey(provider, user, key.ID);
    }
}

async function createFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const topicIDs = new Map<string, string>();
    for (const spec of TOPICS) {
        const record = await provider.GetEntityObject<MJWorkQueueTopicEntity>('MJ: Work Queue Topics', user);
        record.NewRecord();
        record.Name = spec.Name;
        record.Description = 'Integration test fixture (safe to delete)';
        record.TransportID = DATABASE_TRANSPORT_ID;
        record.IsFifo = false;
        record.AllowExternalPublish = spec.AllowExternalPublish;
        record.MaxPayloadBytes = 262144;
        record.DefaultDeduplicationTTLSeconds = 3600;
        record.RetentionDays = 1;
        record.Status = 'Active';
        Assert(await record.Save(), `creating topic ${spec.Name} failed: ${record.LatestResult?.CompleteMessage}`);
        topicIDs.set(spec.Name, record.ID);
    }
    for (const spec of SUBSCRIPTIONS) {
        const sub = await provider.GetEntityObject<MJWorkQueueSubscriptionEntity>('MJ: Work Queue Subscriptions', user);
        sub.NewRecord();
        sub.Name = spec.Name;
        sub.Description = 'Integration test fixture (safe to delete)';
        sub.TopicID = topicIDs.get(spec.Topic) ?? '';
        sub.PartitionMode = spec.PartitionMode;
        sub.MaxAttempts = 3;
        sub.BackoffBaseSeconds = 0;
        sub.BackoffMaxSeconds = 0;
        sub.LeaseSeconds = spec.LeaseSeconds ?? 30;
        sub.HeartbeatMode = 'Auto';
        sub.HostType = 'MJWorker';
        sub.HandlerKey = spec.HandlerKey;
        sub.Status = 'Active';
        Assert(await sub.Save(), `creating subscription ${spec.Name} failed: ${sub.LatestResult?.CompleteMessage}`);
    }
}

// ─── API keys and REST (WR10, WR11) ──────────────────────────────────────────────────────────────

interface CreatedKey { ID: string; Hash: string }

async function createApiKey(provider: DatabaseProviderBase, user: UserInfo, grantPublish: boolean, cleanup: Array<() => Promise<void>>): Promise<CreatedKey> {
    const engine = GetAPIKeyEngine();
    const created = await engine.CreateAPIKey({ UserId: user.ID, Label: `${PREFIX}rest-${grantPublish ? 'scoped' : 'unscoped'}` }, user);
    if (!created.Success || !created.RawKey || !created.APIKeyId) {
        throw new Error(`CreateAPIKey failed: ${created.Error}`);
    }
    const keyID = created.APIKeyId;
    const rawKey = created.RawKey;
    cleanup.push(() => deleteApiKey(provider, user, keyID));
    if (grantPublish) {
        const scope = engine.Scopes.find(s => s.FullPath === 'workqueue:publish');
        if (!scope) {
            throw new Error('workqueue:publish scope not found (plan 05 metadata not pushed?)');
        }
        const rule = await provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', user);
        rule.NewRecord();
        rule.APIKeyID = keyID;
        rule.ScopeID = scope.ID;
        rule.ResourcePattern = '*';
        rule.PatternType = 'Include';
        rule.IsDeny = false;
        rule.Priority = 0;
        Assert(await rule.Save(), `saving the key scope failed: ${rule.LatestResult?.CompleteMessage}`);
    }
    return { ID: keyID, Hash: engine.HashAPIKey(rawKey) };
}

async function deleteApiKey(provider: DatabaseProviderBase, user: UserInfo, keyID: string): Promise<void> {
    const rv = new RunView();
    const filter = `APIKeyID='${keyID}'`;
    const logs = await rv.RunView<MJAPIKeyUsageLogEntity>({ EntityName: 'MJ: API Key Usage Logs', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true }, user);
    const rules = await rv.RunView<MJAPIKeyScopeEntity>({ EntityName: 'MJ: API Key Scopes', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true }, user);
    for (const record of [...(logs.Results ?? []), ...(rules.Results ?? [])]) {
        await record.Delete().catch(() => false);
    }
    const key = await provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', user);
    if (await key.Load(keyID)) {
        await key.Delete().catch(() => false);
    }
}

function restDependencies(): WorkQueuePublishDependencies {
    return {
        GetEngine: async () => WorkQueueEngine.Instance,
        Authorizer: new APIKeyScopeAuthorizer(),
        Settings: { MaxBatch: 100, BodyLimit: '1mb' },
        Log: new MJWorkLogger('[WorkQueue:IT-REST]'),
    };
}

function restPublish(user: UserInfo, topicName: string, apiKeyHash: string | undefined): ReturnType<typeof HandleWorkQueuePublish> {
    return HandleWorkQueuePublish({
        TopicName: topicName, User: user, ApiKeyHash: apiKeyHash, Path: `/work-queue/topics/${topicName}/messages`,
        ReadBody: async () => ({ messages: [{ attributes: { source: 'it-rest' }, payload: { n: 1 } }] }),
    }, restDependencies());
}

/** The real router behind a stand-in for MJServer's unified auth, which is what sets req.userPayload. */
async function withRestServer<T>(payload: WorkQueueRequestPayload, work: (baseUrl: string) => Promise<T>): Promise<T> {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload = payload;
        next();
    });
    app.use('/work-queue', CreateWorkQueuePublishRouter(restDependencies()));
    const server = await new Promise<Server>(resolve => {
        const listening = app.listen(0, () => resolve(listening));
    });
    try {
        return await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}/work-queue`);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const WorkQueueRuntimeChecks: NamedCheck[] = [
    {
        Id: 'work-queue-runtime.WR1',
        Name: 'WR1: a started host plans fixture subscriptions by handler registration',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr1', HOSTED);
            try {
                await host.Start();
                const states = Object.fromEntries(host.GetHealth().Subscriptions.map(s => [s.Name, s.State]));
                AssertEqual(states[NAMES.CompleteSub], 'Running', 'complete subscription state');
                AssertEqual(states[NAMES.RejectSub], 'Running', 'reject subscription state');
                AssertEqual(states[NAMES.UnregisteredSub], 'HandlerNotRegistered', 'unregistered subscription state');
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR2',
        Name: 'WR2: publish → host claims → handler completes the delivery',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr2', HOSTED);
            try {
                await host.Start();
                const messageID = await publishOne(ctx.User, NAMES.EventsTopic);
                const done = await waitFor('the complete-subscription delivery to complete', async () => {
                    const row = await delivery(ctx.User, NAMES.CompleteSub, messageID);
                    return row.Status === 'Completed' ? row : null;
                });
                AssertEqual(done.AttemptCount, 1, 'attempts for a first-time success');
                fx().CompletedDeliveryID = done.ID;
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR3',
        Name: 'WR3: one publish settles independently per subscription',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr3', HOSTED);
            try {
                await host.Start();
                const messageID = await publishOne(ctx.User, NAMES.EventsTopic);
                await waitFor('both hosted deliveries to settle', async () => {
                    const complete = await delivery(ctx.User, NAMES.CompleteSub, messageID);
                    const reject = await delivery(ctx.User, NAMES.RejectSub, messageID);
                    return complete.Status === 'Completed' && reject.Status === 'DeadLettered' ? true : null;
                });
                AssertEqual((await delivery(ctx.User, NAMES.RejectSub, messageID)).DeadLetterReason, 'it-reject', 'reject reason');
                AssertEqual((await delivery(ctx.User, NAMES.UnregisteredSub, messageID)).Status, 'Pending', 'unregistered subscription delivery is untouched');
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR4',
        Name: 'WR4: the sweeper expires a lease; the stale token is fenced out; the retry is attempt 2',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
            await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                const first = onlyMessage(await receive(consumer), messageID, 'first claim');
                await setDeliveryTimestamp(Provider, ctx.User, first.DeliveryID, 'LeaseExpiresAt', 1);
                // The pass's ExpireLeases key counts deliveries it DEAD-LETTERED (Task 4). This one has attempts left,
                // so it is retried, not dead-lettered — the row itself is the proof, not the count.
                await sweepOnce(Provider, ctx.User);
                const expired = await delivery(ctx.User, NAMES.InternalSub, messageID);
                AssertEqual(expired.Status, 'Pending', 'status after lease expiry with attempts left');
                AssertEqual(expired.LastError, 'LeaseExpired', 'last error after lease expiry');
                AssertEqual((await consumer.Complete(first)).Kind, 'LeaseLost', 'settle with the expired lease token');
                const retry = onlyMessage(await receive(consumer), messageID, 'retry claim');
                AssertEqual(retry.Attempt, 2, 'attempt number of the retry');
                await settleAll(consumer, [retry]);
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR5',
        Name: 'WR5: Exclusive — two consumers claiming concurrently never hold the same key',
        Fn: async (ctx: IntegrationCheckContext) => {
            const k1First = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k1' });
            const k1Second = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k1' });
            await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k2' });
            await withConsumers([NAMES.ExclusiveSub, NAMES.ExclusiveSub], async ([a, b]) => {
                // Both claims are issued together, on independent executors: the unique in-flight index is what
                // keeps them from both taking k1.
                const [heldByA, heldByB] = await Promise.all([receive(a), receive(b)]);
                const held = [...heldByA, ...heldByB];
                const keys = held.map(d => d.Message.PartitionKey);
                AssertEqual(new Set(keys).size, keys.length, `no key is held twice across concurrent consumers: ${JSON.stringify(keys)}`);
                AssertEqual(keys.slice().sort().join(','), 'k1,k2', 'exactly one delivery per key is in flight');
                const k1Holder = heldByA.some(d => d.Message.PartitionKey === 'k1') ? a : b;
                const other = k1Holder === a ? b : a;
                AssertEqual((await receive(other)).length, 0, 'nothing more is claimable while both keys are in flight');
                await settleAll(k1Holder, [onlyMessage(held, k1First, 'k1 head')]);
                const next = await receive(other);
                AssertEqual(onlyMessage(next, k1Second, 'k1 second').Message.PartitionKey, 'k1', 'the next k1 delivery is claimable once the first completed');
                await settleAll(other, next);
                for (const [consumer, deliveries] of [[a, heldByA], [b, heldByB]] as const) {
                    await settleAll(consumer, deliveries.filter(d => d.Message.PartitionKey === 'k2'));
                }
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR6',
        Name: 'WR6: Ordered — a dead-lettered head blocks its key until ReplayDeadLetter',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const head = await publishOne(ctx.User, NAMES.OrderedTopic, { PartitionKey: 'o1' });
            const next = await publishOne(ctx.User, NAMES.OrderedTopic, { PartitionKey: 'o1' });
            await withConsumers([NAMES.OrderedSub], async ([consumer]) => {
                const claimed = onlyMessage(await receive(consumer), head, 'head claim');
                AssertEqual((await consumer.DeadLetter(claimed, 'it-poison', 'bad record')).Kind, 'Settled', 'dead-letter the head');
                AssertEqual((await receive(consumer)).length, 0, 'nothing is claimable behind a dead-lettered head');

                const partitions = operationOutput(await new WorkQueueListPartitionsOperation().Execute({ subscriptionName: NAMES.OrderedSub, condition: 'Blocked' }, options), 'WorkQueue.ListPartitions');
                const blocked = partitions.items.find(item => item.PartitionKey === 'o1');
                Assert(!!blocked && UUIDsEqual(blocked.HeadDeliveryID ?? '', claimed.DeliveryID), `o1 should be Blocked by ${claimed.DeliveryID}: ${JSON.stringify(partitions.items)}`);

                const replay = operationOutput(await new WorkQueueReplayDeadLetterOperation().Execute({ subscriptionName: NAMES.OrderedSub, deliveryID: claimed.DeliveryID, note: 'it replay' }, options), 'WorkQueue.ReplayDeadLetter');
                Assert(replay.supported && replay.replayed, `replay result: ${JSON.stringify(replay)}`);
                const replayed = onlyMessage(await receive(consumer), head, 'replayed head');
                Assert(replayed.IsReplay, 'the replayed delivery is marked IsReplay');
                await settleAll(consumer, [replayed]);
                await settleAll(consumer, [onlyMessage(await receive(consumer), next, 'next after replay')]);
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR7',
        Name: 'WR7: a lease expiring on the final attempt is dead-lettered by the sweeper and raised through OnDeadLettered',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const events: DeadLetteredEvent[] = [];
            const unsubscribe = WorkQueueEngine.Instance.OnDeadLettered(event => events.push(event));
            try {
                const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
                await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                    // MaxAttempts is 3 and backoff is 0: two retries put the third claim on the final attempt.
                    for (const attempt of [1, 2]) {
                        const claimed = onlyMessage(await receive(consumer), messageID, `claim ${attempt}`);
                        AssertEqual((await consumer.Retry(claimed, 0, 'it: retry')).Kind, 'Settled', `retry ${attempt}`);
                    }
                    const last = onlyMessage(await receive(consumer), messageID, 'final claim');
                    AssertEqual(last.Attempt, 3, 'the final claim is attempt 3 of 3');
                    await setDeliveryTimestamp(Provider, ctx.User, last.DeliveryID, 'LeaseExpiresAt', 1);

                    const pass = await sweepOnce(Provider, ctx.User);
                    Assert((pass.ExpireLeases ?? 0) >= 1, `the pass should report the delivery it dead-lettered: ${JSON.stringify(pass)}`);
                    const row = await delivery(ctx.User, NAMES.InternalSub, messageID);
                    AssertEqual(row.Status, 'DeadLettered', 'an expired lease on the final attempt dead-letters');
                    AssertEqual(row.DeadLetterReason, 'LeaseExpired', 'dead-letter reason');
                    const event = events.find(e => UUIDsEqual(e.DeliveryID, last.DeliveryID));
                    Assert(!!event, `OnDeadLettered did not fire for ${last.DeliveryID}: ${JSON.stringify(events)}`);
                    AssertEqual(event?.SubscriptionName, NAMES.InternalSub, 'event subscription name');
                    AssertEqual(event?.Reason, 'LeaseExpired', 'event reason');
                });
            } finally {
                unsubscribe();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR8',
        Name: 'WR8: DiscardDelivery discards a pending delivery, which is never claimed',
        Fn: async (ctx: IntegrationCheckContext) => {
            const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
            const pending = await delivery(ctx.User, NAMES.InternalSub, messageID);
            const result = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                { subscriptionName: NAMES.InternalSub, deliveryID: pending.ID, reason: 'it: withdrawn' },
                { provider: fx().Provider, user: ctx.User },
            ), 'WorkQueue.DiscardDelivery');
            Assert(result.supported && result.discarded && !result.cancelRequested, `discard result: ${JSON.stringify(result)}`);
            AssertEqual((await delivery(ctx.User, NAMES.InternalSub, messageID)).Status, 'Discarded', 'status after discard');
            await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                const claimed = await receive(consumer);
                AssertEqual(claimed.filter(d => UUIDsEqual(d.Message.MessageID, messageID)).length, 0, 'a discarded delivery is never claimed');
                await settleAll(consumer, claimed);
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR9',
        Name: 'WR9: a repeated DeduplicationKey returns Duplicate and the topic gains exactly one message row',
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `${PREFIX}dedup-${Date.now()}`;
            const publish = (): Promise<PublishResult[]> => WorkQueueEngine.Instance.PublishAs(NAMES.InternalTopic, [{ DeduplicationKey: key, Payload: { n: 1 } }], { ContextUser: ctx.User });
            const before = await messageCount(ctx.User, NAMES.InternalTopic);
            const [first] = await publish();
            const [second] = await publish();
            AssertEqual(first.Status, 'Accepted', 'first publish');
            AssertEqual(second.Status, 'Duplicate', 'second publish');
            Assert(UUIDsEqual(second.MessageID, first.MessageID), `duplicate names the owning message: ${second.MessageID} vs ${first.MessageID}`);
            AssertEqual(await messageCount(ctx.User, NAMES.InternalTopic), before + 1, 'message rows written by two publishes with one DeduplicationKey');
            await withConsumers([NAMES.InternalSub], async ([consumer]) => settleAll(consumer, await receive(consumer)));
        },
    },
    {
        Id: 'work-queue-runtime.WR10',
        Name: 'WR10: REST publish requires an API key with workqueue:publish and honours AllowExternalPublish',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const cleanup: Array<() => Promise<void>> = [];
            try {
                const scoped = await createApiKey(Provider, ctx.User, true, cleanup);
                const unscoped = await createApiKey(Provider, ctx.User, false, cleanup);
                await GetAPIKeyEngine().Config(true, ctx.User);

                const accepted = await restPublish(ctx.User, NAMES.EventsTopic, scoped.Hash);
                AssertEqual(accepted.Status, 202, `scoped publish: ${JSON.stringify(accepted.Body)}`);
                Assert(JSON.stringify(accepted.Body).includes('"status":"Accepted"'), `scoped publish result: ${JSON.stringify(accepted.Body)}`);

                const internal = await restPublish(ctx.User, NAMES.InternalTopic, scoped.Hash);
                AssertEqual(internal.Status, 403, 'publish to a topic that disallows external publishing');
                Assert(JSON.stringify(internal.Body).includes('TopicNotExternallyPublishable'), `internal topic body: ${JSON.stringify(internal.Body)}`);

                AssertEqual((await restPublish(ctx.User, NAMES.EventsTopic, unscoped.Hash)).Status, 403, 'publish with a key lacking workqueue:publish');
                AssertEqual((await restPublish(ctx.User, NAMES.EventsTopic, undefined)).Status, 403, 'publish from a session that has no API key');
            } finally {
                for (const step of cleanup.reverse()) {
                    await step().catch(() => undefined);
                }
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR11',
        Name: 'WR11: the Express router reads req.userPayload and publishes over HTTP',
        Fn: async (ctx: IntegrationCheckContext) => {
            const cleanup: Array<() => Promise<void>> = [];
            try {
                const scoped = await createApiKey(fx().Provider, ctx.User, true, cleanup);
                await GetAPIKeyEngine().Config(true, ctx.User);
                const post = (baseUrl: string): Promise<globalThis.Response> => fetch(`${baseUrl}/topics/${NAMES.EventsTopic}/messages`, {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ messages: [{ attributes: { source: 'it-http' }, payload: { n: 2 } }] }),
                });
                const published = await withRestServer({ userRecord: ctx.User, apiKeyHash: scoped.Hash }, post);
                AssertEqual(published.status, 202, 'HTTP publish with a scoped API key');
                const body: { results?: Array<{ status?: string }> } = await published.json();
                AssertEqual(body.results?.[0]?.status, 'Accepted', `HTTP publish result: ${JSON.stringify(body)}`);
                AssertEqual((await withRestServer({ userRecord: ctx.User }, post)).status, 403, 'HTTP publish from a session without an API key');
            } finally {
                for (const step of cleanup.reverse()) {
                    await step().catch(() => undefined);
                }
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR12',
        Name: 'WR12: the sweeper purges a terminal delivery past topic retention',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider, CompletedDeliveryID } = fx();
            if (!CompletedDeliveryID) {
                throw new Error('WR12 purges the delivery WR2 completed, and WR2 did not record one — fix WR2 first');
            }
            await setDeliveryTimestamp(Provider, ctx.User, CompletedDeliveryID, 'CompletedAt', 48);
            const pass = await sweepOnce(Provider, ctx.User);
            Assert((pass.PurgeRetention ?? 0) >= 1, `retention purged nothing: ${JSON.stringify(pass)}`);
            AssertEqual((await deliveriesWhere(ctx.User, `ID='${CompletedDeliveryID}'`)).length, 0, 'the backdated delivery was purged');
        },
    },
    {
        Id: 'work-queue-runtime.WR13',
        Name: 'WR13: host shutdown is idempotent and unregisters',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr13', HOSTED);
            await host.Start();
            Assert(WorkQueueHost.Active === host, 'a started host is Active');
            Assert(ShutdownRegistry.Instance.List().includes(host), 'a started host is in ShutdownRegistry');
            await Promise.all([host.Shutdown(), host.Shutdown()]);
            await host.Shutdown();
            AssertEqual(host.IsStarted, false, 'IsStarted after shutdown');
            Assert(WorkQueueHost.Active === null, 'Active is cleared');
            Assert(!ShutdownRegistry.Instance.List().includes(host), 'the host left ShutdownRegistry');
        },
    },
    {
        Id: 'work-queue-runtime.WR14',
        Name: "WR14: plan 04's transport conformance checks pass on the Database transport",
        Fn: async (ctx: IntegrationCheckContext) => {
            const harness = await CreateDatabaseConformanceHarness(fx().Provider, ctx.User, DATABASE_TRANSPORT_ID);
            try {
                const results = await RunConformanceChecks(harness);
                Assert(results.length > 0, 'RunConformanceChecks returned no results');
                for (const skipped of results.filter(r => r.Status === 'Skipped')) {
                    console.log(`      ↷ skipped ${skipped.Id}: ${skipped.Detail ?? skipped.Title}`);
                }
                const failed = results.filter(r => r.Status === 'Failed');
                Assert(failed.length === 0, `conformance failures:\n${failed.map(r => `  ${r.Id} (${r.Title}): ${r.Detail ?? 'no detail'}`).join('\n')}`);
                const passed = results.filter(r => r.Status === 'Passed').length;
                // The Database transport supports every capability, so nearly every case should run. A harness that
                // gates everything off would otherwise "pass" having proven nothing.
                Assert(passed > 0, `every conformance case was skipped (${results.length}); the Database harness must run them`);
                Assert(passed >= results.length / 2, `only ${passed} of ${results.length} conformance cases ran on the Database transport`);
                console.log(`      → ${passed} conformance checks passed, ${results.length - passed} skipped`);
            } finally {
                await harness.Cleanup();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR15',
        Name: 'WR15: a work-queue delivery rejects BaseEntity.Save()',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
            const row = await delivery(ctx.User, NAMES.InternalSub, messageID);
            const entity = await fx().Provider.GetEntityObject<MJWorkQueueDeliveryEntity>('MJ: Work Queue Deliveries', ctx.User);
            Assert(await entity.Load(row.ID), 'loading the delivery entity');
            entity.Status = 'Completed';
            AssertEqual(await entity.Save(), false, 'Save() on a work-queue delivery must be rejected');
            const message = entity.LatestResult?.CompleteMessage ?? '';
            Assert(message.toLowerCase().includes('transport driver'), `guard message should name the driver: '${message}'`);
            AssertEqual(await entity.Delete(), false, 'Delete() on a work-queue delivery must be rejected');
            AssertEqual((await delivery(ctx.User, NAMES.InternalSub, messageID)).Status, 'Pending', 'the delivery row is unchanged');
            const cleanup = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                { subscriptionName: NAMES.InternalSub, deliveryID: row.ID, reason: 'it: WR15 cleanup' }, options,
            ), 'WorkQueue.DiscardDelivery');
            Assert(cleanup.discarded, `cleanup discard: ${JSON.stringify(cleanup)}`);
        },
    },
    {
        Id: 'work-queue-runtime.WR16',
        Name: "WR16: cancelling in-flight work aborts the handler with 'Cancelled', discards the row at once and frees the Exclusive key",
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            observed.HeldStarted = false;
            observed.AbortReason = null;
            const held = await publishOne(ctx.User, NAMES.CancelTopic, { PartitionKey: 'c1', Payload: { hold: true } });
            const queued = await publishOne(ctx.User, NAMES.CancelTopic, { PartitionKey: 'c1', Payload: { hold: false } });
            const host = newHost(fx().Provider, ctx.User, 'wr16', [NAMES.CancelSub], 2);
            try {
                await host.Start();
                await waitFor('the held handler to start', async () => (observed.HeldStarted ? true : null));
                AssertEqual((await delivery(ctx.User, NAMES.CancelSub, queued)).Status, 'Pending', 'the key is single-flight: the second delivery waits');

                const row = await delivery(ctx.User, NAMES.CancelSub, held);
                const cancelledAt = Date.now();
                const cancel = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                    { subscriptionName: NAMES.CancelSub, deliveryID: row.ID, reason: 'it: operator cancel' }, options,
                ), 'WorkQueue.DiscardDelivery');
                Assert(cancel.supported && cancel.discarded && cancel.cancelRequested, `cancel result: ${JSON.stringify(cancel)}`);

                await waitFor("the handler's Signal to abort", async () => (observed.AbortReason !== null ? true : null));
                AssertEqual(observed.AbortReason, 'Cancelled', 'the abort reason a cancelled handler sees');
                await waitFor('the cancelled delivery to become Discarded', async () =>
                    ((await delivery(ctx.User, NAMES.CancelSub, held)).Status === 'Discarded' ? true : null));
                const elapsed = Date.now() - cancelledAt;
                Assert(elapsed < CANCEL_DISCARDED_WITHIN_MS,
                    `Discarded after ${elapsed} ms — the runtime must acknowledge the cancel, not wait out the ${CANCEL_LEASE_SECONDS} s lease`);
                await waitFor('the next delivery of the key to run', async () =>
                    ((await delivery(ctx.User, NAMES.CancelSub, queued)).Status === 'Completed' ? true : null));
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR17',
        Name: 'WR17: a cancel whose holder is gone is settled by lease expiry, and the key is held until then',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const options = { provider: Provider, user: ctx.User };
            const held = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'cancel-1' });
            const queued = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'cancel-1' });
            await withConsumers([NAMES.ExclusiveSub], async ([consumer]) => {
                const batch = await receive(consumer);
                const claimed = onlyMessage(batch.filter(d => d.Message.PartitionKey === 'cancel-1'), held, 'the in-flight delivery');
                await settleAll(consumer, batch.filter(d => d.Message.PartitionKey !== 'cancel-1'));

                const row = await delivery(ctx.User, NAMES.ExclusiveSub, held);
                const cancel = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                    { subscriptionName: NAMES.ExclusiveSub, deliveryID: row.ID, reason: 'it: operator cancel' }, options,
                ), 'WorkQueue.DiscardDelivery');
                Assert(cancel.supported && cancel.discarded && cancel.cancelRequested, `cancel result: ${JSON.stringify(cancel)}`);

                AssertEqual((await delivery(ctx.User, NAMES.ExclusiveSub, held)).Status, 'InFlight', 'a cancelled delivery stays in flight until acknowledged or expired');
                AssertEqual(await consumer.ExtendLease(claimed, 60), 'Cancelled', "the holder's heartbeat reports the cancel");
                AssertEqual((await consumer.Complete(claimed)).Kind, 'LeaseLost', 'a cancelled holder cannot settle its outcome');
                const whileHeld = await receive(consumer);
                AssertEqual(whileHeld.filter(d => d.Message.PartitionKey === 'cancel-1').length, 0, 'the key is not handed on while the cancelled holder has not acknowledged');
                await settleAll(consumer, whileHeld);

                // The holder "dies" here: it never calls AcknowledgeCancel. Lease expiry settles the row instead.
                await setDeliveryTimestamp(Provider, ctx.User, row.ID, 'LeaseExpiresAt', 1);
                await sweepOnce(Provider, ctx.User);
                AssertEqual((await delivery(ctx.User, NAMES.ExclusiveSub, held)).Status, 'Discarded', 'an expired cancelled delivery is Discarded, never retried');
                const afterExpiry = await receive(consumer);
                await settleAll(consumer, [onlyMessage(afterExpiry.filter(d => d.Message.PartitionKey === 'cancel-1'), queued, 'the next delivery for the key')]);
                await settleAll(consumer, afterExpiry.filter(d => d.Message.PartitionKey !== 'cancel-1'));
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR18',
        Name: 'WR18: GetBacklog counts claimable pending plus in-flight deliveries',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const backlog = async (): Promise<WorkQueueGetBacklogOutput> => operationOutput(
                await new WorkQueueGetBacklogOperation().Execute({ subscriptionName: NAMES.InternalSub }, options), 'WorkQueue.GetBacklog',
            );
            const before = await backlog();
            Assert(before.supported && !before.capped, `GetBacklog must be supported and uncapped on a small fixture: ${JSON.stringify(before)}`);
            await publishOne(ctx.User, NAMES.InternalTopic);
            await publishOne(ctx.User, NAMES.InternalTopic);
            AssertEqual((await backlog()).claimable, before.claimable + 2, 'two published deliveries are claimable');

            await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                const claimed = await receive(consumer);
                Assert(claimed.length > 0, 'the consumer claimed nothing');
                const during = await backlog();
                AssertEqual(during.inFlight, before.inFlight + claimed.length, 'claimed deliveries count as in flight, not claimable');
                AssertEqual(during.total, during.claimable + during.inFlight, 'total is claimable + in flight');
                await settleAll(consumer, claimed);
                await settleAll(consumer, await receive(consumer));
            });
            AssertEqual((await backlog()).total, before.total, 'the backlog returns to its starting value once the work is settled');
        },
    },
    {
        Id: 'work-queue-runtime.WR19',
        Name: 'WR19: RunOnce({ MaxDeliveries: 1 }) processes exactly one delivery and leaves the next for another job',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const first = await publishOne(ctx.User, NAMES.RunOnceTopic);
            const second = await publishOne(ctx.User, NAMES.RunOnceTopic);
            // The default container job: --max 1 --concurrency 1. It must RUN its delivery, not hand it back.
            const host = newHost(fx().Provider, ctx.User, 'wr19', [NAMES.RunOnceSub], 1);
            const result = await host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 5000, MaxDurationMs: WAIT_TIMEOUT_MS });
            AssertEqual(JSON.stringify(result), JSON.stringify({ Processed: 1, Reason: 'MaxDeliveries' }), 'one-shot result');
            AssertEqual(host.IsStarted, false, 'RunOnce drains and shuts the host down before resolving');
            const rows = [await delivery(ctx.User, NAMES.RunOnceSub, first), await delivery(ctx.User, NAMES.RunOnceSub, second)];
            AssertEqual(rows.filter(r => r.Status === 'Completed').length, 1, `exactly one delivery completed: ${JSON.stringify(rows.map(r => r.Status))}`);
            AssertEqual(rows.filter(r => r.Status === 'Pending').length, 1, 'the other delivery is still Pending for the next job');
            const pending = rows.find(r => r.Status === 'Pending');
            if (pending) {
                const cleanup = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                    { subscriptionName: NAMES.RunOnceSub, deliveryID: pending.ID, reason: 'it: WR19 cleanup' }, options,
                ), 'WorkQueue.DiscardDelivery');
                Assert(cleanup.discarded, `cleanup discard: ${JSON.stringify(cleanup)}`);
            }
        },
    },
];

for (const check of WorkQueueRuntimeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('work-queue-runtime', {
    Setup: async (ctx: IntegrationCheckContext) => {
        if (!(ctx.Provider instanceof DatabaseProviderBase)) {
            throw new Error('work-queue-runtime needs a server DatabaseProviderBase');
        }
        const provider = ctx.Provider;
        // Assign the fixture handle FIRST: if anything below throws, Teardown still has a provider to clean with.
        fixture = { Provider: provider, CompletedDeliveryID: null };
        if (!handlerRegistered) {
            // ClassFactory has no unregister API. One registration per process, under a key only this bundle uses.
            MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, ItScriptedWorkHandler, HANDLER_KEY);
            handlerRegistered = true;
        }
        await removeFixtures(provider, ctx.User);      // leftovers of an interrupted run, including API keys
        await createFixtures(provider, ctx.User);
        await WorkQueueEngine.Instance.Config(true, ctx.User, provider);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        try {
            await WorkQueueHost.Active?.Shutdown();
            await removeFixtures(fixture.Provider, ctx.User);
            await WorkQueueEngine.Instance.Config(true, ctx.User, fixture.Provider);
        } catch (error) {
            console.warn(`      ⚠ work-queue-runtime teardown: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            fixture = undefined;
        }
    },
});
