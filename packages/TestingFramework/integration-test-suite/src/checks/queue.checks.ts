/**
 * queue.checks.ts — the 'queue' bundle (QU1–QU10): the MJQueue subsystem's deterministic
 * lifecycle, exercised against the REAL engine (QueueBase's timer loop + StartTask) and the
 * REAL DB substrate (`MJ: Queue Types` / `MJ: Queues` / `MJ: Queue Tasks`) — a subsystem that
 * previously had only mocked unit coverage (packages/MJQueue).
 *
 * SERVER TRANSPORT, no LLM: the shipped AIActionQueue driver is resolved but never executed
 * (executing it calls AIEngine). The processing checks run a local, deterministic QueueBase
 * subclass through the engine's own AddTask → ProcessTasks(250ms loop) → StartTask path, so
 * the concurrency-slot bookkeeping, terminal-status persistence, and slot-release-on-throw
 * behavior under test are the REAL engine code, not a reimplementation.
 *
 *   - QU1  QueueManager.Config loads the queue-type catalog from the live DB: the two seeded
 *          types ('AI Action' → DriverClass 'AIActionQueue', 'Entity AI Action') plus this
 *          bundle's own fixture type (proof it read the DB, not a hardcoded list).
 *   - QU2  ClassFactory driver dispatch: 'AI Action' resolves to AIActionQueue and
 *          'Entity AI Action' to its priority-1 subclass EntityAIActionQueue (which is-a
 *          AIActionQueue) — the exact CreateInstance call QueueManager.CreateQueue makes.
 *   - QU3  Success lifecycle end-to-end: a task fed through the real AddTask/loop reaches the
 *          DB as Status='Completed' with its Output persisted; the in-memory task is Complete
 *          and the terminal task is removed from the queue (QueueSize back to 0).
 *   - QU4  Failure lifecycle: a ProcessTask that reports failure persists Status='Failed' +
 *          the JSON-serialized exception in ErrorMessage; the slot is freed.
 *   - QU5  A THROWING ProcessTask cannot wedge the queue (the pinned slot-leak fix in
 *          StartTask's catch): the task goes Failed in-memory, the slot is freed, and a
 *          subsequent task on the SAME queue still processes to 'Completed' (positive control
 *          proving the loop survived).
 *   - QU6  Stop/shutdown contract: Stop() is idempotent, flips IsStopped, and AddTask on a
 *          stopped queue is refused (returns false, nothing is processed).
 *   - QU7  QueueManager negative paths: static AddTask with an unknown type NAME throws the
 *          documented 'Queue Type ... not found.' error BEFORE any DB write; instance AddTask
 *          against the fixture INACTIVE type honors the tolerant-catch contract (undefined,
 *          no task row created).
 *
 *   - QU8  The legacy path persists again: static AddTask for an active fixture type saves its MJ: Queues row
 *          (process fields fitted to their columns — a Linux os.release() is longer than ProcessOSVersion) and a
 *          'Pending' MJ: Queue Tasks row (rejected by CK_QueueTask_Status before the Fix_QueueTask_Status
 *          migration), and the real loop completes it.
 *   - QU9  Opt-in routing: with @memberjunction/work-queue-legacy-bridge imported, an Active mjqueue.<type>
 *          work-queue topic with an Active MJQueue.LegacyQueueDriver subscription takes the task — AddTask returns
 *          undefined, no MJ: Queue Tasks row is written, and a WorkQueueHost runs the delivery through the
 *          registered QueueBase driver, as the enqueuing user, to Completed.
 *   - QU10 A routed task whose queue type has no registered QueueBase driver is dead-lettered on its first
 *          attempt with a reason naming the missing driver.
 *
 * Schema history: CK_QueueTask_Status used to reject 'Pending' and Status was nchar(10). Both were fixed by
 * the Fix_QueueTask_Status migration; QU3–QU6 still create rows with explicit terminal statuses so they test
 * the engine transition, and QU8 asserts the repaired insert.
 *
 * Self-cleaning: Teardown stops every stub queue, then deletes task rows → queue row →
 * fixture queue type (FK-safe order). The seeded queue types are reference-only.
 *
 * NOTE on fixtures: module state, not a typed IntegrationCheckContext slot — this bundle does
 * not modify the shared contract in @memberjunction/testing-integration (see the
 * scheduling-concurrency header for the precedent).
 *
 * // CI-FIRST-RUN: designed from the real engine + schema (CHECK constraints read from the
 * // v5.38 baseline). Not executed against a live DB in the authoring session — watch QU3's
 * // first poll (timer-loop scheduling under CI load) and QU1 (QueueManager.QueueTypes is a
 * // first-Config-wins cache; this bundle must own the process's first Config call).
 */
import { BaseEntity, DatabaseProviderBase, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    MJQueueEntity, MJQueueTaskEntity, MJQueueTypeEntity, MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity,
} from '@memberjunction/core-entities';
import {
    QueueBase, TaskBase, TaskResult, TaskStatus, QueueManager, AIActionQueue, EntityAIActionQueue,
} from '@memberjunction/queue';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import { SharedProviderSource, WorkQueueEngine, WorkQueueHost, type WorkQueueExecutorSource } from '@memberjunction/work-queue-engine';
// Importing the bridge registers the router with @memberjunction/queue's seam and the MJQueue.LegacyQueueDriver handler.
import { LegacyQueueTopicName, LEGACY_QUEUE_HANDLER_KEY } from '@memberjunction/work-queue-legacy-bridge';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
/** ≤50 chars — MJ: Queues.Name / MJ: Queue Types.Name are nvarchar(50). */
const QUEUE_NAME = 'mj-it-queue-fixture (mj-it)';
const INACTIVE_TYPE_NAME = 'mj-it-inactive-type (mj-it)';
/** Active fixture type for the repaired in-process path (QU8). ≤50 chars. */
const LEGACY_TYPE_NAME = 'mj-it-legacy-type (mj-it)';
/** Routed fixture type (QU9) — deliberately has NO MJ: Queue Types row. */
const ROUTED_TYPE_NAME = 'mj-it-routed-type (mj-it)';
/** Routed fixture type with no registered QueueBase driver (QU10). */
const UNREGISTERED_TYPE_NAME = 'mj-it-unregistered-type (mj-it)';
/** Every work-queue fixture topic / subscription name starts with one of these (SQL LIKE patterns). */
const FIXTURE_TOPIC_PATTERN = 'mjqueue.mj-it-%';
const FIXTURE_SUBSCRIPTION_PATTERN = 'mj-it-qu%';

const HOST_LOG: WorkLogger = {
    Info: () => undefined,
    Warn: (message: string) => console.log(`      ⚠ ${message}`),
    Error: (message: string, error?: Error) => console.log(`      ✖ ${message}${error ? `: ${error.message}` : ''}`),
};

/** In-process driver for LEGACY_TYPE_NAME: completes every task. */
@RegisterClass(QueueBase, LEGACY_TYPE_NAME)
class MjItLegacyQueue extends QueueBase {
    protected async ProcessTask(): Promise<TaskResult> {
        return { success: true, output: JSON.stringify({ legacy: true }), userMessage: 'ok', exception: null };
    }
}

/** Driver for ROUTED_TYPE_NAME: records what the work-queue handler handed it, and as whom. */
@RegisterClass(QueueBase, ROUTED_TYPE_NAME)
class MjItRoutedQueue extends QueueBase {
    public static Received: { data: unknown; options: unknown; userID: string }[] = [];
    protected async ProcessTask(task: TaskBase, contextUser: UserInfo): Promise<TaskResult> {
        MjItRoutedQueue.Received.push({ data: task.Data, options: task.Options, userID: contextUser.ID });
        return { success: true, output: null, userMessage: 'ok', exception: null };
    }
}
/** Statuses the QueueTask CHECK constraint accepts AND nchar(10) can hold (see header ⚠️). */
type PersistableTaskStatus = 'Completed' | 'Failed';

interface QueueFixture {
    /** The seeded 'AI Action' queue type ID (reference-only, never mutated). */
    AiActionTypeID: string;
    /** This bundle's own INACTIVE fixture queue type (created in Setup, deleted in Teardown). */
    InactiveTypeID: string;
    /** The fixture MJ: Queues row all stub queues + task rows hang off. */
    QueueID: string;
    /** Every stub queue constructed by the checks — Stop()ed in Teardown. */
    Stubs: MjItStubQueue[];
    /** Every MJ: Queue Tasks row created — deleted in Teardown (before the queue row). */
    TaskIds: string[];
    /** Active fixture queue type for QU8. */
    LegacyTypeID: string;
    RoutedSubscriptionID: string;
    UnregisteredSubscriptionID: string;
}
let fixture: QueueFixture | undefined;

function fx(): QueueFixture {
    Assert(fixture != null, 'queue fixture missing (bundle Setup did not run)');
    return fixture!;
}

/**
 * A deterministic QueueBase subclass: delegates ProcessTask to a per-instance handler so each
 * check scripts exactly the outcome it needs while the AddTask/ProcessTasks/StartTask engine
 * code stays 100% real. Instantiated directly (never via ClassFactory) so it can never leak
 * into another bundle's resolution space.
 */
class MjItStubQueue extends QueueBase {
    private readonly handler: (task: TaskBase) => Promise<TaskResult>;

    constructor(queueRecord: MJQueueEntity, queueTypeId: string, contextUser: UserInfo,
        handler: (task: TaskBase) => Promise<TaskResult>) {
        super(queueRecord, queueTypeId, contextUser);
        this.handler = handler;
    }

    protected override async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.handler(task);
    }
}

/** Loads the fixture MJ: Queues entity (fresh copy) for stub construction. */
async function loadQueueRecord(ctx: IntegrationCheckContext): Promise<MJQueueEntity> {
    const queue = await ctx.Provider.GetEntityObject<MJQueueEntity>('MJ: Queues', ctx.User);
    Assert(await queue.Load(fx().QueueID), `could not load fixture queue ${fx().QueueID}`);
    return queue;
}

/**
 * Creates a persisted MJ: Queue Tasks row with an EXPLICIT persistable initial status (see
 * header ⚠️ for why 'Pending' is impossible), registered for teardown before the assert so a
 * failed save can never orphan a row.
 */
async function createTaskRow(ctx: IntegrationCheckContext, initialStatus: PersistableTaskStatus,
    data: Record<string, unknown>): Promise<MJQueueTaskEntity> {
    const task = await ctx.Provider.GetEntityObject<MJQueueTaskEntity>('MJ: Queue Tasks', ctx.User);
    task.NewRecord();
    task.QueueID = fx().QueueID;
    task.Status = initialStatus;
    task.Data = JSON.stringify(data);
    task.Comments = FIXTURE_TAG;
    const saved = await task.Save();
    if (task.ID) {
        fx().TaskIds.push(task.ID);
    }
    Assert(saved, `creating the fixture queue task failed: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return task;
}

/** Builds a stub queue around the fixture queue row and registers it for Teardown Stop(). */
async function createStub(ctx: IntegrationCheckContext,
    handler: (task: TaskBase) => Promise<TaskResult>): Promise<MjItStubQueue> {
    const stub = new MjItStubQueue(await loadQueueRecord(ctx), fx().AiActionTypeID, ctx.User, handler);
    fx().Stubs.push(stub);
    return stub;
}

/** Polls the DB (BypassCache) until the task row reaches `expected` or the deadline passes. */
async function waitForPersistedStatus(ctx: IntegrationCheckContext, taskId: string,
    expected: PersistableTaskStatus, timeoutMs: number): Promise<MJQueueTaskEntity> {
    const deadline = Date.now() + timeoutMs;
    let last = '';
    for (;;) {
        const result = await new RunView().RunView<MJQueueTaskEntity>({
            EntityName: 'MJ: Queue Tasks',
            ExtraFilter: `ID='${taskId}'`,
            ResultType: 'entity_object',
            BypassCache: true
        }, ctx.User);
        Assert(result.Success, `polling MJ: Queue Tasks failed: ${result.ErrorMessage}`);
        const row = (result.Results ?? [])[0];
        Assert(row != null, `fixture task ${taskId} vanished while polling`);
        last = (row.Status ?? '').trim(); // nchar(10) pads with trailing spaces
        if (last === expected) {
            return row;
        }
        Assert(Date.now() < deadline,
            `task ${taskId} did not reach '${expected}' within ${timeoutMs}ms (last persisted status: '${last}')`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

/**
 * Waits for the in-memory task status to reach `expected`.
 *
 * StartTask persists the terminal status and only THEN assigns `task.Status`, so a check that
 * observed the transition through the database — which `waitForPersistedStatus` does — can read the
 * in-memory value one step before it is written. Asserting it directly is a race the check itself
 * creates by watching the faster of the two signals; waiting for the slower one removes it without
 * weakening the claim (the status must still arrive, and quickly).
 */
async function waitForInMemoryStatus(task: TaskBase, expected: TaskStatus, timeoutMs: number, label: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (task.Status !== expected) {
        Assert(Date.now() < deadline, `${label}: in-memory task status never reached '${expected}' (last: '${task.Status}')`);
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

/** Waits until the in-memory queue drains (QueueSize 0) or the deadline passes. */
async function waitForDrain(stub: MjItStubQueue, timeoutMs: number, label: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (stub.QueueSize > 0) {
        Assert(Date.now() < deadline, `${label}: queue did not drain within ${timeoutMs}ms (QueueSize=${stub.QueueSize})`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

function serverProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    if (!(ctx.Provider instanceof DatabaseProviderBase)) {
        throw new Error('the queue bundle work-queue checks need a server DatabaseProviderBase provider');
    }
    return ctx.Provider;
}

function sqlExecutor(ctx: IntegrationCheckContext): WorkQueueExecutorSource {
    return serverProvider(ctx);
}

function workQueueTable(provider: DatabaseProviderBase, name: string): string {
    return `${provider.QuoteIdentifier(provider.MJCoreSchemaName)}.${provider.QuoteIdentifier(name)}`;
}

/**
 * Removes every work-queue fixture this bundle creates, by name pattern. Messages, Deliveries and Deduplications
 * are driver-owned (BaseEntity.Delete() refuses them), so they are deleted with SQL; subscriptions and topics are
 * ordinary entities. Called first in Setup (a run that died before Teardown must not break the next one) and in
 * Teardown.
 */
async function removeWorkQueueFixtures(ctx: IntegrationCheckContext): Promise<void> {
    const provider = serverProvider(ctx);
    const id = (name: string): string => provider.QuoteIdentifier(name);
    const topicPattern = provider.BuildParameterPlaceholder(0);
    const fixtureTopics = `SELECT t.${id('ID')} FROM ${workQueueTable(provider, 'WorkQueueTopic')} t WHERE t.${id('Name')} LIKE ${topicPattern}`;
    const fixtureSubs = `SELECT s.${id('ID')} FROM ${workQueueTable(provider, 'WorkQueueSubscription')} s WHERE s.${id('TopicID')} IN (${fixtureTopics})`;
    const statements = [
        `DELETE FROM ${workQueueTable(provider, 'WorkQueueDelivery')} WHERE ${id('SubscriptionID')} IN (${fixtureSubs})`,
        `DELETE FROM ${workQueueTable(provider, 'WorkQueueMessage')} WHERE ${id('TopicID')} IN (${fixtureTopics})`,
        `DELETE FROM ${workQueueTable(provider, 'WorkQueueDeduplication')} WHERE ${id('TopicID')} IN (${fixtureTopics})`,
    ];
    for (const sql of statements) {
        await provider.ExecuteSQL(sql, [FIXTURE_TOPIC_PATTERN], { isMutation: true }, ctx.User);
    }
    await deleteRows(ctx, 'MJ: Work Queue Subscriptions', `Name LIKE '${FIXTURE_SUBSCRIPTION_PATTERN}'`);
    await deleteRows(ctx, 'MJ: Work Queue Topics', `Name LIKE '${FIXTURE_TOPIC_PATTERN}'`);
}

/** Creates an Active Database-transport topic + Active legacy-driver subscription for a queue type name. */
async function createRoutedTopic(ctx: IntegrationCheckContext, queueTypeName: string, subscriptionName: string): Promise<string> {
    await WorkQueueEngine.Instance.Config(true, ctx.User);
    const transport = WorkQueueEngine.Instance.Transports.find((t) => t.Name === 'Database');
    Assert(transport != null, "the seeded 'Database' work-queue transport is missing");

    const topic = await ctx.Provider.GetEntityObject<MJWorkQueueTopicEntity>('MJ: Work Queue Topics', ctx.User);
    topic.NewRecord();
    topic.Name = LegacyQueueTopicName(queueTypeName);
    topic.Description = `Legacy routing fixture ${FIXTURE_TAG}`;
    topic.TransportID = transport!.ID;
    topic.Status = 'Active';
    Assert(await topic.Save(), `creating fixture topic failed: ${topic.LatestResult?.CompleteMessage ?? 'unknown error'}`);

    const subscription = await ctx.Provider.GetEntityObject<MJWorkQueueSubscriptionEntity>('MJ: Work Queue Subscriptions', ctx.User);
    subscription.NewRecord();
    subscription.TopicID = topic.ID;
    subscription.Name = subscriptionName;
    subscription.Description = `Legacy routing fixture ${FIXTURE_TAG}`;
    subscription.PartitionMode = 'None';
    subscription.MaxAttempts = 1;
    subscription.LeaseSeconds = 30;
    subscription.HostType = 'MJWorker';
    subscription.HandlerKey = LEGACY_QUEUE_HANDLER_KEY;
    subscription.Status = 'Active';
    Assert(await subscription.Save(), `creating fixture subscription failed: ${subscription.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    await WorkQueueEngine.Instance.Config(true, ctx.User);
    return subscription.ID;
}

interface DeliveryRow { ID: string; MessageID: string; Status: string; DeadLetterReason: string | null; LastError: string | null }

async function deliveriesFor(ctx: IntegrationCheckContext, subscriptionID: string): Promise<DeliveryRow[]> {
    const result = await new RunView().RunView<DeliveryRow>({
        EntityName: 'MJ: Work Queue Deliveries',
        ExtraFilter: `SubscriptionID='${subscriptionID}'`,
        Fields: ['ID', 'MessageID', 'Status', 'DeadLetterReason', 'LastError'],
        ResultType: 'simple',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `reading work-queue deliveries failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

/** Runs a WorkQueueHost for one subscription until its single delivery reaches `expected`. */
async function runHostUntil(ctx: IntegrationCheckContext, subscriptionName: string, subscriptionID: string,
    expected: 'Completed' | 'DeadLettered', timeoutMs: number): Promise<DeliveryRow> {
    const host = new WorkQueueHost({
        InstanceID: `mj-it-queue-${process.pid}`,
        Subscriptions: [{ Name: subscriptionName, Concurrency: 1 }],
        IdlePollMinMs: 100,
        IdlePollMaxMs: 500,
        ShutdownDrainMs: 5000,
        SweeperIntervalMs: 0,
        ReconcileIntervalMs: 0,
    }, WorkQueueEngine.Instance, ctx.User, sqlExecutor(ctx), HOST_LOG,
    { ProviderSource: new SharedProviderSource(ctx.Provider) });
    await host.Start();
    try {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const rows = await deliveriesFor(ctx, subscriptionID);
            const row = rows[0];
            if (row && row.Status === expected) {
                return row;
            }
            Assert(Date.now() < deadline,
                `delivery for ${subscriptionName} did not reach '${expected}' within ${timeoutMs}ms (last: '${row?.Status ?? 'none'}', host: ${JSON.stringify(host.GetHealth())})`);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } finally {
        await host.Shutdown();
    }
}

/** BaseEntity delete for ordinary (not driver-owned) entities: loads the matching rows as entities and deletes each. */
async function deleteRows(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<void> {
    const rows = await new RunView().RunView<BaseEntity>({
        EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true
    }, ctx.User).catch(() => undefined);
    for (const record of rows?.Results ?? []) {
        const deleted = await record.Delete().catch(() => false);
        if (!deleted) {
            console.log(`      ⚠ could not delete ${entityName} ${record.PrimaryKey.ToConcatenatedString()}: ${record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
}

/** Removes the QU8 legacy fixture (tasks → queues → type), including leftovers from a run that never tore down. */
async function removeLegacyTypeFixtures(ctx: IntegrationCheckContext): Promise<void> {
    const types = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Queue Types', ExtraFilter: `Name='${LEGACY_TYPE_NAME}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    for (const type of types.Results ?? []) {
        QueueManager.Instance.RemoveQueue(type.ID); // never leave a stopped queue cached for the next run
        const schema = serverProvider(ctx).MJCoreSchemaName;
        await deleteRows(ctx, 'MJ: Queue Tasks', `QueueID IN (SELECT ID FROM ${schema}.vwQueues WHERE QueueTypeID='${type.ID}')`);
        await deleteRows(ctx, 'MJ: Queues', `QueueTypeID='${type.ID}'`);
        await deleteRows(ctx, 'MJ: Queue Types', `ID='${type.ID}'`);
    }
}

export const QueueChecks: NamedCheck[] = [
    {
        Id: 'queue.QU1',
        Name: 'QU1: QueueManager.Config loads the seeded queue-type catalog (plus the fixture type) from the live DB',
        Fn: async (ctx: IntegrationCheckContext) => {
            await QueueManager.Config(ctx.User);
            const types = QueueManager.QueueTypes;
            Assert(types.length >= 3, `expected ≥3 queue types (2 seeded + 1 fixture), got ${types.length}`);

            const aiAction = types.find(t => t.Name === 'AI Action');
            Assert(aiAction != null, `seeded 'AI Action' queue type missing from the loaded catalog`);
            AssertEqual(aiAction!.DriverClass, 'AIActionQueue', `'AI Action' DriverClass`);
            Assert(aiAction!.IsActive === true, `'AI Action' must be active`);
            Assert(UUIDsEqual(aiAction!.ID, fx().AiActionTypeID), 'cached AI Action ID disagrees with the Setup-resolved ID');

            Assert(types.some(t => t.Name === 'Entity AI Action'), `seeded 'Entity AI Action' queue type missing`);
            // The fixture type proves Config read THIS database (QueueTypes is a
            // first-Config-wins cache — if this fails, another consumer Config'd the manager
            // before this bundle's Setup created the fixture row; see CI-FIRST-RUN note).
            const inactive = types.find(t => UUIDsEqual(t.ID, fx().InactiveTypeID));
            Assert(inactive != null, 'fixture queue type missing from the catalog — QueueManager was Config-ed before Setup ran (stale first-load cache)');
            Assert(inactive!.IsActive === false, 'fixture queue type must be inactive (QU7 depends on it)');

            console.log(`      → catalog loaded: ${types.length} types incl. 'AI Action'/'Entity AI Action' + the inactive fixture`);
        }
    },
    {
        Id: 'queue.QU2',
        Name: 'QU2: the ClassFactory resolves queue-type names to the shipped drivers (incl. the priority-1 subclass chain)',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Exactly the call QueueManager.CreateQueue makes — an UNSAVED queue record is
            // sufficient (the constructor only stores references; the loop starts on AddTask).
            const record = await ctx.Provider.GetEntityObject<MJQueueEntity>('MJ: Queues', ctx.User);
            record.NewRecord();
            const factory = MJGlobal.Instance.ClassFactory;

            const aiQueue = factory.CreateInstance<QueueBase>(QueueBase, 'AI Action', record, fx().AiActionTypeID, ctx.User);
            Assert(aiQueue != null, `'AI Action' produced no instance`);
            Assert(aiQueue instanceof AIActionQueue, `'AI Action' resolved to ${aiQueue!.constructor.name}, not AIActionQueue`);

            const entityQueue = factory.CreateInstance<QueueBase>(QueueBase, 'Entity AI Action', record, fx().AiActionTypeID, ctx.User);
            Assert(entityQueue != null, `'Entity AI Action' produced no instance`);
            Assert(entityQueue instanceof EntityAIActionQueue,
                `'Entity AI Action' resolved to ${entityQueue!.constructor.name}, not EntityAIActionQueue`);
            // The registration chain: EntityAIActionQueue is a priority-1 registration that
            // SUBCLASSES AIActionQueue — both drivers share the generic processing core.
            Assert(entityQueue instanceof AIActionQueue, 'EntityAIActionQueue must remain an AIActionQueue subclass');

            console.log(`      → 'AI Action'→${aiQueue!.constructor.name}, 'Entity AI Action'→${entityQueue!.constructor.name}`);
        }
    },
    {
        Id: 'queue.QU3',
        Name: 'QU3: success lifecycle — AddTask through the real loop persists Status=Completed with Output, and frees the slot',
        Fn: async (ctx: IntegrationCheckContext) => {
            const payload = { probe: 'qu3', at: Date.now() };
            const output = JSON.stringify({ echoed: payload.at });
            const stub = await createStub(ctx, async () => ({
                success: true, output, userMessage: 'ok', exception: null
            }));

            // Initial status 'Failed' (a persistable value — see header ⚠️) so the SUCCESS
            // transition performed by StartTask is an observable Failed→Completed flip.
            const row = await createTaskRow(ctx, 'Failed', payload);
            const task = new TaskBase(row, payload, {});
            AssertEqual(task.Status, TaskStatus.Pending, 'a fresh TaskBase starts Pending in-memory');
            Assert(stub.AddTask(task), 'AddTask on a live queue must accept the task');

            const persisted = await waitForPersistedStatus(ctx, row.ID, 'Completed', 10000);
            AssertEqual(persisted.Output ?? '', output, 'persisted Output round-trip');
            await waitForInMemoryStatus(task, TaskStatus.Complete, 5000, 'QU3');
            await waitForDrain(stub, 5000, 'QU3');
            AssertEqual(stub.QueueSize, 0, 'terminal task must be removed from the in-memory queue');

            console.log(`      → task ran through the real loop: DB Failed→Completed, Output persisted, slot freed`);
        }
    },
    {
        Id: 'queue.QU4',
        Name: 'QU4: failure lifecycle — a failing ProcessTask persists Status=Failed with the serialized exception',
        Fn: async (ctx: IntegrationCheckContext) => {
            const exception = { code: 'MJ_IT_QU4', detail: 'deterministic failure' };
            const stub = await createStub(ctx, async () => ({
                success: false, output: null, userMessage: 'deterministic failure', exception
            }));

            const row = await createTaskRow(ctx, 'Completed', { probe: 'qu4' });
            const task = new TaskBase(row, { probe: 'qu4' }, {});
            Assert(stub.AddTask(task), 'AddTask on a live queue must accept the task');

            const persisted = await waitForPersistedStatus(ctx, row.ID, 'Failed', 10000);
            Assert(!!persisted.ErrorMessage, 'a failed task must persist ErrorMessage');
            const parsed = JSON.parse(persisted.ErrorMessage!) as { code?: string };
            AssertEqual(parsed.code, 'MJ_IT_QU4', 'ErrorMessage carries the JSON-serialized exception');
            await waitForInMemoryStatus(task, TaskStatus.Failed, 5000, 'QU4');
            await waitForDrain(stub, 5000, 'QU4');
            AssertEqual(stub.QueueSize, 0, 'terminal failed task must be removed from the in-memory queue');

            console.log(`      → failure persisted: DB Completed→Failed with the serialized exception`);
        }
    },
    {
        Id: 'queue.QU5',
        Name: 'QU5: a THROWING ProcessTask cannot wedge the queue — slot freed, next task still completes (slot-leak fix pin)',
        Fn: async (ctx: IntegrationCheckContext) => {
            // One stub, two behaviors keyed off the task payload: the first task throws
            // (rejected promise), the second succeeds — same queue, same loop, same slots.
            const stub = await createStub(ctx, async (task) => {
                const data = task.Data as { mode?: string };
                if (data.mode === 'throw') {
                    throw new Error('mj-it deliberate ProcessTask throw');
                }
                return { success: true, output: JSON.stringify({ survived: true }), userMessage: 'ok', exception: null };
            });

            const throwing = new TaskBase(await createTaskRow(ctx, 'Failed', { mode: 'throw' }), { mode: 'throw' }, {});
            Assert(stub.AddTask(throwing), 'AddTask must accept the throwing task');
            // StartTask's catch marks the task Failed and its finally releases the slot —
            // WITHOUT this (the pinned fix) the task would sit InProgress forever, leaking
            // one of the queue's _maxTasks slots per throw. DB state of a THROWN task is
            // deliberately not asserted (the engine does not persist it today — see header).
            const deadline = Date.now() + 5000;
            while (throwing.Status !== TaskStatus.Failed) {
                Assert(Date.now() < deadline, `throwing task never reached Failed in-memory (status: ${throwing.Status})`);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            await waitForDrain(stub, 5000, 'QU5 (post-throw)');

            // Positive control: the SAME queue still processes a subsequent task to terminal.
            const followUpRow = await createTaskRow(ctx, 'Failed', { mode: 'ok' });
            const followUp = new TaskBase(followUpRow, { mode: 'ok' }, {});
            Assert(stub.AddTask(followUp), 'AddTask after a throw must still accept tasks');
            await waitForPersistedStatus(ctx, followUpRow.ID, 'Completed', 10000);
            await waitForInMemoryStatus(followUp, TaskStatus.Complete, 5000, 'QU5 follow-up (the queue provably survived the throw)');

            console.log(`      → throw contained: task Failed in-memory, slot freed, next task on the same queue Completed`);
        }
    },
    {
        Id: 'queue.QU6',
        Name: 'QU6: Stop() is idempotent, flips IsStopped, and refuses further AddTask',
        Fn: async (ctx: IntegrationCheckContext) => {
            let processed = 0;
            const stub = await createStub(ctx, async () => {
                processed++;
                return { success: true, output: null, userMessage: 'ok', exception: null };
            });
            AssertEqual(stub.IsStopped, false, 'a fresh queue must not be stopped');

            stub.Stop();
            AssertEqual(stub.IsStopped, true, 'IsStopped after Stop()');
            stub.Stop(); // idempotent — double-Stop must not throw or change semantics
            AssertEqual(stub.IsStopped, true, 'IsStopped after a second Stop()');

            const row = await createTaskRow(ctx, 'Failed', { probe: 'qu6' });
            const task = new TaskBase(row, { probe: 'qu6' }, {});
            AssertEqual(stub.AddTask(task), false, 'AddTask on a stopped queue must be refused');
            AssertEqual(stub.QueueSize, 0, 'a refused task must not enter the queue');
            // Give a would-be rogue timer a beat to prove nothing processes after Stop.
            await new Promise(resolve => setTimeout(resolve, 400));
            AssertEqual(processed, 0, 'a stopped queue must process nothing');
            AssertEqual(task.Status, TaskStatus.Pending, 'the refused task must stay Pending in-memory');

            console.log(`      → Stop() idempotent; stopped queue refused AddTask and processed nothing`);
        }
    },
    {
        Id: 'queue.QU7',
        Name: 'QU7: QueueManager negatives — unknown type NAME throws before any DB write; inactive type returns undefined (tolerant catch)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const bogusName = `mj-it-no-such-type-${Date.now()}`;
            let threw = false;
            let message = '';
            try {
                await QueueManager.AddTask(bogusName, { probe: 'qu7' }, {}, ctx.User);
            } catch (error) {
                threw = true;
                message = error instanceof Error ? error.message : String(error);
            }
            Assert(threw, 'static AddTask with an unknown queue-type NAME must throw');
            Assert(message.includes(`Queue Type ${bogusName} not found`),
                `the refusal must carry the documented message; got: ${message.slice(0, 300)}`);

            // Instance AddTask wraps everything in a tolerant catch: an INACTIVE type is an
            // error internally but surfaces as undefined (logged), with no task row written.
            const before = await countFixtureTasks(ctx);
            const result = await QueueManager.Instance.AddTask(fx().InactiveTypeID, { probe: 'qu7' }, {}, ctx.User);
            AssertEqual(result, undefined, 'instance AddTask against an inactive type must return undefined');
            AssertEqual(await countFixtureTasks(ctx), before, 'the inactive-type attempt must not create any task row');

            console.log(`      → unknown name threw the documented error; inactive type → undefined with zero DB writes`);
        }
    },
    {
        Id: 'queue.QU8',
        Name: 'QU8: the repaired legacy path — static AddTask persists a Pending task row and the real loop completes it',
        Fn: async (ctx: IntegrationCheckContext) => {
            const payload = { probe: 'qu8', at: Date.now() };
            const task = await QueueManager.AddTask(LEGACY_TYPE_NAME, payload, { priority: 1 }, ctx.User);
            // Before Task 1 this was undefined on every platform (CK_QueueTask_Status), and on Linux it stayed
            // undefined until CreateQueue fitted ProcessOSVersion to its column.
            Assert(task != null, 'AddTask for an active, unrouted queue type must return the in-process task');
            // Not added to TaskIds: this row hangs off the legacy type's own MJ: Queues row, which
            // removeLegacyTypeFixtures sweeps (tasks → queue → type) in Teardown.

            const persisted = await waitForPersistedStatus(ctx, task!.ID, 'Completed', 10000);
            AssertEqual(persisted.Output ?? '', JSON.stringify({ legacy: true }), 'persisted Output');
            await waitForInMemoryStatus(task!, TaskStatus.Complete, 5000, 'QU8');

            console.log(`      → 'Pending' row persisted by AddTask and completed by the in-process loop`);
        }
    },
    {
        Id: 'queue.QU9',
        Name: 'QU9: opt-in routing — an Active mjqueue topic takes the task and a WorkQueueHost runs it through the registered driver',
        Fn: async (ctx: IntegrationCheckContext) => {
            MjItRoutedQueue.Received = [];
            const data = { probe: 'qu9', at: Date.now() };

            const result = await QueueManager.AddTask(ROUTED_TYPE_NAME, data, { priority: 2 }, ctx.User);
            AssertEqual(result, undefined, 'a routed AddTask returns no in-process task');

            const deliveries = await deliveriesFor(ctx, fx().RoutedSubscriptionID);
            AssertEqual(deliveries.length, 1, 'routing must create exactly one delivery for the legacy-driver subscription');
            AssertEqual(deliveries[0].Status, 'Pending', 'the routed delivery starts Pending');

            const done = await runHostUntil(ctx, `mj-it-qu9-routed (mj-it)`, fx().RoutedSubscriptionID, 'Completed', 20000);
            AssertEqual(done.ID, deliveries[0].ID, 'the host completed the routed delivery');
            AssertEqual(MjItRoutedQueue.Received.length, 1, 'the registered driver ran exactly once');
            const received = MjItRoutedQueue.Received[0];
            AssertEqual(JSON.stringify({ data: received.data, options: received.options }), JSON.stringify({ data, options: { priority: 2 } }),
                'the driver received the original data and options');
            Assert(UUIDsEqual(received.userID, ctx.User.ID), `the driver must run as the enqueuing user; ran as ${received.userID}`);

            console.log(`      → AddTask routed to ${LegacyQueueTopicName(ROUTED_TYPE_NAME)}; host ran it through MjItRoutedQueue as the enqueuing user`);
        }
    },
    {
        Id: 'queue.QU10',
        Name: 'QU10: a routed task whose queue type has no registered driver is dead-lettered with a reason naming it',
        Fn: async (ctx: IntegrationCheckContext) => {
            const result = await QueueManager.AddTask(UNREGISTERED_TYPE_NAME, { probe: 'qu10' }, null, ctx.User);
            AssertEqual(result, undefined, 'the unregistered type is still routed (its topic is Active)');

            const dead = await runHostUntil(ctx, `mj-it-qu10-unregistered (mj-it)`, fx().UnregisteredSubscriptionID, 'DeadLettered', 20000);
            // 03 §3.2: DeadLetterReason holds the FatalWorkError message truncated to 100 chars; LastError holds all of it.
            Assert((dead.LastError ?? '').includes(`No QueueBase driver is registered for queue type '${UNREGISTERED_TYPE_NAME}'`),
                `LastError must name the missing driver; got: ${(dead.LastError ?? '').slice(0, 300)}`);
            Assert((dead.DeadLetterReason ?? '').startsWith('No QueueBase driver is registered'),
                `DeadLetterReason must carry the fatal message; got: ${dead.DeadLetterReason ?? ''}`);

            console.log(`      → dead-lettered on attempt 1: ${(dead.DeadLetterReason ?? '').slice(0, 100)}`);
        }
    }
];

/** Counts persisted MJ: Queue Tasks rows attached to the fixture queue (BypassCache). */
async function countFixtureTasks(ctx: IntegrationCheckContext): Promise<number> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Queue Tasks',
        ExtraFilter: `QueueID='${fx().QueueID}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `counting fixture queue tasks failed: ${result.ErrorMessage}`);
    return (result.Results ?? []).length;
}

for (const check of QueueChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('queue', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Pre-clean: a run that died before Teardown leaves UNIQUE-named topics, subscriptions and the legacy type behind.
        await removeWorkQueueFixtures(ctx);
        await removeLegacyTypeFixtures(ctx);

        // 1. The fixture INACTIVE queue type MUST exist before the process's first
        //    QueueManager.Config (first-load-wins cache) — created before anything else.
        const inactiveType = await ctx.Provider.GetEntityObject<MJQueueTypeEntity>('MJ: Queue Types', ctx.User);
        inactiveType.NewRecord();
        inactiveType.Name = INACTIVE_TYPE_NAME;
        inactiveType.Description = `Inactive queue type fixture ${FIXTURE_TAG}`;
        inactiveType.DriverClass = 'MjItStubQueue';
        inactiveType.IsActive = false;
        Assert(await inactiveType.Save(), `creating the fixture queue type failed: ${inactiveType.LatestResult?.CompleteMessage ?? 'unknown error'}`);

        const legacyType = await ctx.Provider.GetEntityObject<MJQueueTypeEntity>('MJ: Queue Types', ctx.User);
        legacyType.NewRecord();
        legacyType.Name = LEGACY_TYPE_NAME;
        legacyType.Description = `Active queue type fixture ${FIXTURE_TAG}`;
        legacyType.DriverClass = 'MjItLegacyQueue';
        legacyType.IsActive = true;
        Assert(await legacyType.Save(), `creating the legacy fixture queue type failed: ${legacyType.LatestResult?.CompleteMessage ?? 'unknown error'}`);

        // 2. Resolve the seeded 'AI Action' type (reference-only) straight from the DB.
        const typeRows = await new RunView().RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Queue Types',
            ExtraFilter: `Name='AI Action'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            BypassCache: true
        }, ctx.User);
        Assert(typeRows.Success && (typeRows.Results ?? []).length === 1,
            `seeded 'AI Action' queue type not found (${typeRows.ErrorMessage ?? `${typeRows.Results?.length ?? 0} rows`})`);
        const aiActionTypeId = typeRows.Results![0].ID;

        // 3. One fixture MJ: Queues row all stub queues + task rows hang off.
        const queue = await ctx.Provider.GetEntityObject<MJQueueEntity>('MJ: Queues', ctx.User);
        queue.NewRecord();
        queue.Name = QUEUE_NAME;
        queue.Description = `Queue engine fixture ${FIXTURE_TAG}`;
        queue.QueueTypeID = aiActionTypeId;
        queue.IsActive = true;
        queue.ProcessPID = process.pid;
        queue.ProcessPlatform = process.platform.slice(0, 30);
        queue.ProcessVersion = process.version.slice(0, 15);
        queue.LastHeartbeat = new Date(); // NOT NULL — set explicitly rather than trusting the sproc default path
        // Publish the fixture handle IMMEDIATELY after each save so a later Setup crash can
        // never orphan already-created rows (Teardown always sweeps whatever exists).
        fixture = {
            AiActionTypeID: aiActionTypeId,
            InactiveTypeID: inactiveType.ID,
            QueueID: '',
            Stubs: [],
            TaskIds: [],
            LegacyTypeID: legacyType.ID,
            RoutedSubscriptionID: '',
            UnregisteredSubscriptionID: '',
        };
        Assert(await queue.Save(), `creating the fixture queue failed: ${queue.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        fixture.QueueID = queue.ID;

        fixture.RoutedSubscriptionID = await createRoutedTopic(ctx, ROUTED_TYPE_NAME, 'mj-it-qu9-routed (mj-it)');
        fixture.UnregisteredSubscriptionID = await createRoutedTopic(ctx, UNREGISTERED_TYPE_NAME, 'mj-it-qu10-unregistered (mj-it)');
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        // Stop every stub loop FIRST so no timer fires mid-delete (and the process can exit).
        for (const stub of fixture?.Stubs ?? []) {
            try { stub.Stop(); } catch { /* best effort */ }
        }
        await removeWorkQueueFixtures(ctx);
        await removeLegacyTypeFixtures(ctx); // also calls QueueManager.RemoveQueue, so QU8's stopped queue is not reused
        if (!fixture) {
            return;
        }
        const f = fixture;
        // Task rows (children) → queue row → fixture type, all best-effort.
        for (const id of f.TaskIds) {
            const task = await ctx.Provider.GetEntityObject<MJQueueTaskEntity>('MJ: Queue Tasks', ctx.User).catch(() => undefined);
            if (task && (await task.Load(id).catch(() => false))) {
                await task.Delete().catch(() => undefined);
            }
        }
        if (f.QueueID) {
            const queue = await ctx.Provider.GetEntityObject<MJQueueEntity>('MJ: Queues', ctx.User).catch(() => undefined);
            if (queue && (await queue.Load(f.QueueID).catch(() => false))) {
                await queue.Delete().catch(() => undefined);
            }
        }
        const inactiveType = await ctx.Provider.GetEntityObject<MJQueueTypeEntity>('MJ: Queue Types', ctx.User).catch(() => undefined);
        if (inactiveType && (await inactiveType.Load(f.InactiveTypeID).catch(() => false))) {
            await inactiveType.Delete().catch(() => undefined);
        }
        fixture = undefined;
    }
});
