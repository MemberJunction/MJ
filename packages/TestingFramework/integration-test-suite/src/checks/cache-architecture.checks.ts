/**
 * cache-architecture.checks.ts — the 'cache-architecture' bundle (CA1…).
 *
 * DETERMINISTIC tier, server transport. Regression pins for the engine / cache / event-bus work
 * Each check names the plan item it pins.
 * The measurements behind these items came from a multi-process rig (rigs/cache-fleet-baseline.ts);
 * what can be asserted inside one process lives here, through `mj test`.
 *
 * Every check asserts on observable cache state (LocalCacheManager's fingerprint index, the storage
 * provider's keys) or on derived engine state, never on row counts alone.
 */
import { BaseEngine, BaseEngineRegistry, CompositeKey, LocalCacheManager, RunInEntityTransaction, RunView, TransactionVariable } from '@memberjunction/core';
import type { BaseEntity, BaseEnginePropertyConfig, EngineStateCensus, IEntityDataProvider, IRunViewProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { uuidv4 } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import type { MJActionCategoryEntity, MJAIAgentNoteEntity, MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { UserRoutineDispatcherDriver, ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { Assert, AssertEqual, SEEDED_SCOPED_A_EMAIL } from '@memberjunction/testing-integration';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';

/**
 * Entities read on a schedule with a filter that embeds the current time. Each poll would
 * otherwise mint a new, never-read cache key and publish it to every peer. They are opted out of
 * caching in metadata/entities/.caching-scheduled-poll-entities.json.
 */
const POLLED_ENTITIES = ['MJ: User Routines', 'MJ: AI Agent Session Bridges', 'MJ: Action Execution Logs'];

/** How many dispatcher sweeps CA2 runs. Each would mint a distinct key without the fix. */
const DISPATCH_SWEEPS = 3;

/** Unsaved schedule + run records shaped the way ScheduledJobEngine hands them to a driver. */
async function makeDispatcherContext(ctx: IntegrationCheckContext): Promise<ScheduledJobExecutionContext> {
    const schedule = await ctx.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', ctx.User);
    schedule.NewRecord();
    schedule.Name = `User Routine Dispatcher (cache-architecture) ${TAG}`;
    const run = await ctx.Provider.GetEntityObject<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', ctx.User);
    run.NewRecord();
    return { Schedule: schedule, Run: run, ContextUser: ctx.User };
}

/** Cache keys the storage provider holds for one entity (RunView fingerprints start `<Entity>|`). */
async function storedKeysForEntity(ctx: IntegrationCheckContext, entityName: string): Promise<string[]> {
    const keys = await ctx.Storage.GetCategoryKeys('RunViewCache');
    return keys.filter(k => k.startsWith(`${entityName}|`));
}

/** The members of a loaded engine CA6 reads; the key and params builders are protected. */
interface EngineCacheKeyAccess {
    Configs: BaseEnginePropertyConfig[];
    ContextUser: UserInfo;
    RunViewProviderToUse: IRunViewProvider;
    configFingerprint(config: BaseEnginePropertyConfig): string;
    BuildRunViewParamsForConfig(config: BaseEnginePropertyConfig): RunViewParams;
}

/** The members of a provider CA6 reads to rebuild the key it stores a RunView under. */
interface ProviderCacheKeyAccess {
    InstanceConnectionString: string;
    ComputeRunViewRLSWhereClause(params: RunViewParams, contextUser?: UserInfo): string;
    ComputeRunViewFLSFingerprintKey(params: RunViewParams): string | undefined;
}

/**
 * The key a server provider stores a RunView's rows under for a user: the formula PreRunView and
 * every RunViews path share (row-filter clause for that user, then the field-security key).
 */
function providerSlotKey(provider: ProviderCacheKeyAccess, params: RunViewParams, user: UserInfo): string {
    return LocalCacheManager.Instance.GenerateRunViewFingerprint(
        params, provider.InstanceConnectionString, provider.ComputeRunViewRLSWhereClause(params, user), undefined,
        provider.ComputeRunViewFLSFingerprintKey(params));
}

/** Every engine in this process that has finished loading. */
function loadedEngines(): Array<{ Name: string; Engine: EngineCacheKeyAccess }> {
    return BaseEngineRegistry.Instance.GetAllEngines()
        .filter((e): e is BaseEngine<unknown> => e instanceof BaseEngine && e.Loaded)
        .map(e => ({ Name: e.constructor.name, Engine: e as unknown as EngineCacheKeyAccess }));
}

const NOTES_ENTITY = 'MJ: AI Agent Notes';

/** The second entity CA8 writes in the same group as notes, and the entity CA9–CA11 write. */
const CATEGORY_ENTITY = 'MJ: Action Categories';

/**
 * How long CA9–CA11 wait after their own slot has settled before counting writes, so an engine
 * syncing its slot a moment later is counted too.
 */
const ENGINE_SYNC_SETTLE_MS = 1000;

/** How many notes CA4 saves in one transaction. */
const BATCH_NOTES = 5;

/** How many notes CA7 saves in one transaction group. */
const GROUP_NOTES = 5;

/** How many rows of each entity CA8 saves in one transaction group. */
const GROUP_ROWS_PER_ENTITY = 3;

/** How long CA7 and CA8 wait for per-row cache maintenance to land before counting writes. */
const SLOT_SETTLE_MS = 5000;

/** Row IDs a slot holds, upper-cased, or null when the slot is not stored. */
async function storedSlotIds(ctx: IntegrationCheckContext, fingerprint: string): Promise<string[] | null> {
    const stored = await ctx.Storage.GetItem<{ results: Array<{ ID: string }> }>(fingerprint, 'RunViewCache');
    return stored ? stored.results.map(r => r.ID.toUpperCase()).sort() : null;
}

/**
 * An unfiltered slot of `entityName` private to one check (a distinct connection segment keeps it
 * apart from any engine's slot), stored empty so the check only ever sees the rows it writes.
 */
async function seedPrivateSlot(ctx: IntegrationCheckContext, entityName: string, checkLabel: string): Promise<string> {
    const params: RunViewParams = { EntityName: entityName, IgnoreMaxRows: true };
    // Connection-shaped, because any other trailing segment marks a slot as narrowed (not maintained).
    const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, `it-${checkLabel}://${uuidv4()}/`);
    await LocalCacheManager.Instance.SetRunViewResult(fingerprint, params, [], '', undefined, undefined, ctx.Provider);
    const seeded = await storedSlotIds(ctx, fingerprint);
    AssertEqual(JSON.stringify(seeded), '[]', `precondition: the private ${entityName} slot is stored and empty`);
    return fingerprint;
}

async function newNote(ctx: IntegrationCheckContext, label: string): Promise<MJAIAgentNoteEntity> {
    const note = await ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, ctx.User);
    note.NewRecord();
    note.Type = 'Preference';
    note.Status = 'Active';
    note.Comments = `${label} ${TAG}`; // Note text stays empty: a non-empty Note triggers embedding generation
    return note;
}

async function saveNotesInTransaction(ctx: IntegrationCheckContext, provider: IEntityDataProvider, fingerprint: string): Promise<string[]> {
    const ids: string[] = [];
    await RunInEntityTransaction(provider, async () => {
        for (let i = 0; i < BATCH_NOTES; i++) {
            const note = await newNote(ctx, `CA4 batch ${i}`);
            Assert(await note.Save(), `note save failed: ${note.LatestResult?.CompleteMessage}`);
            ids.push(note.ID.toUpperCase());
        }
        AssertEqual(JSON.stringify(await storedSlotIds(ctx, fingerprint)), '[]',
            'inside the transaction the stored slot is untouched — no per-save rewrite, no uncommitted rows');
        AssertEqual(await LocalCacheManager.Instance.GetRunViewResult(fingerprint), null,
            'inside the transaction a cached read misses, so the database answers (read-your-writes)');
    });
    return ids.sort();
}

/** Deletes the `entityName` rows with these IDs in one transaction, skipping any already gone. */
async function deleteInTransaction(ctx: IntegrationCheckContext, provider: IEntityDataProvider, entityName: string, ids: string[]): Promise<void> {
    await RunInEntityTransaction(provider, async () => {
        for (const id of ids) {
            const record = await ctx.Provider.GetEntityObject<BaseEntity>(entityName, ctx.User);
            if (await record.InnerLoad(CompositeKey.FromURLSegment(record.EntityInfo, id))) {
                Assert(await record.Delete(), `${entityName} delete failed: ${record.LatestResult?.CompleteMessage}`);
            }
        }
    });
}

/** Queues every record in one transaction group and submits it. */
async function submitInTransactionGroup(ctx: IntegrationCheckContext, records: BaseEntity[]): Promise<void> {
    const group = await ctx.Provider.CreateTransactionGroup();
    for (const [i, record] of records.entries()) {
        record.TransactionGroup = group;
        Assert(await record.Save(), `queueing record ${i} (${record.EntityInfo.Name}) in the group failed: ${record.LatestResult?.CompleteMessage}`);
    }
    Assert(await group.Submit(), 'the transaction group failed to submit');
}

/** Queues GROUP_NOTES new notes in one transaction group and submits it. Returns their IDs. */
async function saveNotesInTransactionGroup(ctx: IntegrationCheckContext): Promise<string[]> {
    const notes: MJAIAgentNoteEntity[] = [];
    for (let i = 0; i < GROUP_NOTES; i++) {
        notes.push(await newNote(ctx, `CA7 group ${i}`));
    }
    await submitInTransactionGroup(ctx, notes);
    return notes.map(n => n.ID.toUpperCase()).sort();
}

async function newCategory(ctx: IntegrationCheckContext, label: string): Promise<MJActionCategoryEntity> {
    const category = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    category.NewRecord();
    category.Name = `${label} ${uuidv4()} ${TAG}`;
    category.Status = 'Active';
    return category;
}

/**
 * Stores a loaded engine's slot for `entityName`, filled from the database, under the key the engine
 * syncs. An earlier rollback of a write to the entity invalidates every slot it has, and an engine
 * writes its slot again only on a reload or a change.
 */
async function seedEngineSlot(ctx: IntegrationCheckContext, entityName: string): Promise<string> {
    const match = loadedEngines()
        .map(({ Engine }) => ({ Engine, Config: Engine.Configs.find(c => c.EntityName === entityName) }))
        .find(m => m.Config !== undefined);
    if (!match?.Config) {
        throw new Error(`precondition: a loaded engine caches ${entityName}`);
    }
    const params = match.Engine.BuildRunViewParamsForConfig(match.Config);
    const current = await new RunView().RunView({ ...params, ResultType: 'simple', BypassCache: true }, ctx.User);
    Assert(current.Success, `precondition: ${entityName} rows load: ${current.ErrorMessage}`);
    const fingerprint = match.Engine.configFingerprint(match.Config);
    await LocalCacheManager.Instance.SetRunViewResult(fingerprint, params, current.Results, '', undefined, undefined, ctx.Provider);
    Assert(await ctx.Storage.GetItem(fingerprint, 'RunViewCache') !== null, `precondition: the engine's ${entityName} slot is stored`);
    return fingerprint;
}

/** How many times each stored slot of an entity has been written, by key. */
async function slotWriteCounts(ctx: IntegrationCheckContext, entityName: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const key of await storedKeysForEntity(ctx, entityName)) {
        counts.set(key, ctx.Storage.SetCountForKey(key));
    }
    return counts;
}

/** Waits for engines to finish syncing their own slots after a unit of work has settled. */
async function settleEngineSyncs(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ENGINE_SYNC_SETTLE_MS));
}

/** Slots of an entity written more than once since `writesBefore` was taken, as readable lines. */
function slotsRewritten(ctx: IntegrationCheckContext, writesBefore: Map<string, number>): string {
    return [...writesBefore]
        .map(([key, before]) => ({ key, writes: ctx.Storage.SetCountForKey(key) - before }))
        .filter(({ writes }) => writes > 1)
        .map(({ key, writes }) => `${writes}× ${key}`)
        .join('; ');
}

/** Action Category rows whose Name starts with `prefix`, read from the database. */
async function categoryIdsNamed(ctx: IntegrationCheckContext, prefix: string): Promise<string[]> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: CATEGORY_ENTITY,
        ExtraFilter: `Name LIKE '${prefix}%'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `reading ${CATEGORY_ENTITY} failed: ${result.ErrorMessage}`);
    return result.Results.map(r => r.ID.toUpperCase()).sort();
}

/** Waits until a slot holds exactly `ids`, so cache maintenance still in flight is counted too. */
async function waitForSlotIds(ctx: IntegrationCheckContext, fingerprint: string, ids: string[]): Promise<string[] | null> {
    const deadline = Date.now() + SLOT_SETTLE_MS;
    let stored = await storedSlotIds(ctx, fingerprint);
    while (JSON.stringify(stored) !== JSON.stringify(ids) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
        stored = await storedSlotIds(ctx, fingerprint);
    }
    return stored;
}

/** A statement that fails on SQL Server and PostgreSQL alike (the fixture from the CI incident). */
const FAILING_SQL = 'SELECT FROM nowhere_at_all';
const PROBE_SQL = 'SELECT 1 AS ok';
/** How many failing statements CA5 interleaves with good ones. */
const FAILING_ROUNDS = 20;

function databaseProviderOf(ctx: IntegrationCheckContext): GenericDatabaseProvider {
    return ctx.Provider as unknown as GenericDatabaseProvider;
}

/** Runs `sql` and reports whether it failed, whichever way the provider signals failure. */
async function statementFails(provider: GenericDatabaseProvider, sql: string): Promise<boolean> {
    try {
        await provider.ExecuteSQL(sql);
        return false;
    } catch {
        return true;
    }
}

async function assertProbeSucceeds(provider: GenericDatabaseProvider, label: string): Promise<void> {
    const rows = await provider.ExecuteSQL(PROBE_SQL) as Array<Record<string, unknown>>;
    AssertEqual(Number(rows?.[0]?.ok), 1, `${label}: a plain query after failed statements must succeed`);
}

/** Property name → identity hash, for comparing two censuses of the same engine. */
function hashesOf(census: EngineStateCensus): Record<string, string | null> {
    return Object.fromEntries(census.Properties.map(p => [p.PropertyName, p.IdentityHash]));
}

export const CacheArchitectureChecks: NamedCheck[] = [
    {
        Id: 'cache-architecture.CA1',
        Name: 'CA1: entities polled with a time-varying filter are opted out of caching',
        Fn: async (ctx): Promise<void> => {
            for (const name of POLLED_ENTITIES) {
                const entity = ctx.Provider.EntityByName(name);
                if (!entity) {
                    throw new Error(`entity "${name}" not found in metadata`);
                }
                AssertEqual(entity.AllowCaching, false,
                    `"${name}" must have AllowCaching=false — it is polled with a per-run timestamp filter, so every poll ` +
                    `would mint a permanent write-only cache key (metadata not pushed? run mj sync push --dir=metadata)`);
            }
        }
    },
    {
        Id: 'cache-architecture.CA2',
        RequiresMutation: true,
        Name: 'CA2: repeated User Routine dispatcher sweeps write no RunView cache slot',
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: User Routines';
            const indexBefore = LocalCacheManager.Instance.GetFingerprintsForEntity(entityName).size;
            const storedBefore = (await storedKeysForEntity(ctx, entityName)).length;

            const driver = new UserRoutineDispatcherDriver();
            for (let i = 0; i < DISPATCH_SWEEPS; i++) {
                const result = await driver.Execute(await makeDispatcherContext(ctx));
                Assert(result.Success, `dispatcher sweep ${i + 1} failed: ${result.ErrorMessage}`);
                // The filter embeds now() to the millisecond; keep consecutive sweeps distinct.
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            AssertEqual(LocalCacheManager.Instance.GetFingerprintsForEntity(entityName).size, indexBefore,
                `${DISPATCH_SWEEPS} dispatcher sweeps must not add "${entityName}" fingerprints to the cache index`);
            AssertEqual((await storedKeysForEntity(ctx, entityName)).length, storedBefore,
                `${DISPATCH_SWEEPS} dispatcher sweeps must not add "${entityName}" keys to the storage provider`);
        }
    },
    {
        Id: 'cache-architecture.CA3',
        Name: 'CA3: the engine state census reports derived state that row counts cannot show',
        Fn: async (ctx): Promise<void> => {
            const engine = AIEngineBase.Instance;
            await engine.Config(false, ctx.User);
            try {
                const census = engine.GetStateCensus();
                const modelIds = new Set(engine.Models.map(m => m.ID.toUpperCase()));
                const expectedAttached = engine.ModelVendors.filter(mv => mv.ModelID && modelIds.has(mv.ModelID.toUpperCase())).length;
                Assert(expectedAttached > 0, 'precondition: the database has model-vendor rows for loaded models');
                AssertEqual(census.Derived.VendorsAttached, expectedAttached,
                    'VendorsAttached must equal the model-vendor rows whose model is loaded');
                Assert(census.Properties.some(p => p.PropertyName === '_models' && p.IdentityHash),
                    'the _models property carries an identity hash');

                // The incident's shape: every array intact, one derived collection emptied.
                const victim = engine.Models.find(m => (m.ModelVendors?.length ?? 0) > 0);
                if (!victim) {
                    throw new Error('precondition: a model with vendors attached');
                }
                const lost = victim.ModelVendors.length;
                victim.ModelVendors.splice(0, lost);
                const damaged = engine.GetStateCensus();
                AssertEqual(damaged.Derived.VendorsAttached, expectedAttached - lost, 'the census sees the lost derived state');
                AssertEqual(JSON.stringify(hashesOf(damaged)), JSON.stringify(hashesOf(census)),
                    'no row array changed, so every identity hash is unchanged — only the derived count shows the damage');

                // A reload from the database rebuilds the derived state and yields the same row versions.
                await engine.Config(true, ctx.User);
                const reloaded = engine.GetStateCensus();
                AssertEqual(reloaded.Derived.VendorsAttached, expectedAttached, 'a reload restores the derived state');
                AssertEqual(JSON.stringify(hashesOf(reloaded)), JSON.stringify(hashesOf(census)),
                    'a reload of unchanged data reproduces every identity hash');
            } finally {
                await engine.Config(true, ctx.User);
            }
        }
    },
    {
        Id: 'cache-architecture.CA4',
        RequiresMutation: true,
        Name: 'CA4: a transaction updates cached slots once, on commit, and never with rolled-back rows',
        Fn: async (ctx): Promise<void> => {
            const fingerprint = await seedPrivateSlot(ctx, NOTES_ENTITY, 'ca4');
            const provider = (await newNote(ctx, 'CA4 provider probe')).ProviderToUse;
            let ids: string[] = [];
            try {
                ids = await saveNotesInTransaction(ctx, provider, fingerprint);
                AssertEqual(JSON.stringify(await storedSlotIds(ctx, fingerprint)), JSON.stringify(ids),
                    'after commit the slot holds every note the transaction saved');

                await deleteInTransaction(ctx, provider, NOTES_ENTITY, ids);
                AssertEqual(JSON.stringify(await storedSlotIds(ctx, fingerprint)), '[]',
                    'after the delete transaction commits the slot holds none of them');
                ids = [];

                let rolledBackId = '';
                const failure = 'CA4 deliberate rollback';
                try {
                    await RunInEntityTransaction(provider, async () => {
                        const note = await newNote(ctx, 'CA4 rolled back');
                        Assert(await note.Save(), `note save failed: ${note.LatestResult?.CompleteMessage}`);
                        rolledBackId = note.ID;
                        throw new Error(failure);
                    });
                } catch (e) {
                    if (!(e instanceof Error) || e.message !== failure) throw e;
                }
                Assert(rolledBackId !== '', 'precondition: the rolled-back note was saved inside the transaction');
                AssertEqual(await storedSlotIds(ctx, fingerprint), null,
                    'a rolled-back transaction invalidates the slot instead of writing its uncommitted row');
                const probe = await ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, ctx.User);
                AssertEqual(await probe.Load(rolledBackId), false, 'precondition: the rollback removed the note from the database');
            } finally {
                if (ids.length > 0) {
                    await deleteInTransaction(ctx, provider, NOTES_ENTITY, ids);
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(fingerprint);
            }
        }
    },
    {
        Id: 'cache-architecture.CA6',
        Name: 'CA6: every loaded engine computes the cache key its provider stores the rows under',
        Fn: async (ctx): Promise<void> => {
            const mismatches: string[] = [];
            let compared = 0;
            let storedUnderEngineKey = 0;
            for (const { Name, Engine } of loadedEngines()) {
                const provider = Engine.RunViewProviderToUse as unknown as ProviderCacheKeyAccess;
                for (const config of Engine.Configs.filter(c => c.Type === 'entity')) {
                    const engineKey = Engine.configFingerprint(config);
                    const slotKey = providerSlotKey(provider, Engine.BuildRunViewParamsForConfig(config), Engine.ContextUser);
                    compared++;
                    if (engineKey !== slotKey) {
                        mismatches.push(`${Name}.${config.PropertyName} (${config.EntityName}): engine ${engineKey} vs provider ${slotKey}`);
                    }
                    if (await ctx.Storage.GetItem(engineKey, 'RunViewCache')) {
                        storedUnderEngineKey++;
                    }
                }
            }
            Assert(compared > 0, 'precondition: at least one engine is loaded with an entity config');
            AssertEqual(mismatches.join('; '), '', `engine keys that differ from the provider's (${compared} configs compared)`);
            Assert(storedUnderEngineKey > 0, `engine keys must reach stored slots: ${storedUnderEngineKey} of ${compared} configs found rows under their engine key`);

            // Control: the comparison is sensitive to a row filter. A user whose only role reads
            // MJ: AI Agent Runs through a row filter must get a different key than the system user.
            const scoped = UserCache.Instance.Users.find(u => u.Email?.toLowerCase() === SEEDED_SCOPED_A_EMAIL);
            Assert(!!scoped, `control: seeded row-filtered user ${SEEDED_SCOPED_A_EMAIL} is in the user cache`);
            const controlParams: RunViewParams = { EntityName: 'MJ: AI Agent Runs', IgnoreMaxRows: true };
            const provider = ctx.Provider as unknown as ProviderCacheKeyAccess;
            Assert(providerSlotKey(provider, controlParams, scoped!) !== providerSlotKey(provider, controlParams, ctx.User),
                'control: a row-filtered user must get a different key than the system user');
        }
    },
    {
        Id: 'cache-architecture.CA5',
        RequiresMutation: true,
        Name: 'CA5: a failed statement does not strand its pooled connection for the next caller',
        Fn: async (ctx): Promise<void> => {
            const provider = databaseProviderOf(ctx);
            AssertEqual(provider.TransactionDepth, 0, 'precondition: no ambient transaction');

            // Outside a transaction: failures interleaved with good statements, concurrently, so
            // the failed requests' connections are handed straight to the good ones.
            const outcomes = await Promise.all(Array.from({ length: FAILING_ROUNDS }, (_, i) =>
                i % 2 === 0 ? statementFails(provider, FAILING_SQL) : statementFails(provider, PROBE_SQL)));
            AssertEqual(outcomes.filter((failed, i) => failed !== (i % 2 === 0)).length, 0,
                'every bad statement fails and every good statement succeeds');
            await assertProbeSucceeds(provider, 'outside a transaction');

            // The request that failed in CI was the metadata dataset batch; read through the same
            // RunView path, bypassing the cache so the database is actually asked.
            const entities = await new RunView().RunView({ EntityName: 'MJ: Entities', MaxRows: 1, BypassCache: true }, ctx.User);
            Assert(entities.Success && entities.Results.length === 1, `a RunView after failed statements must succeed: ${entities.ErrorMessage}`);

            // Inside a transaction: the failure is caught, the transaction is rolled back, and the
            // provider is usable afterwards.
            await provider.BeginTransaction();
            try {
                Assert(await statementFails(provider, FAILING_SQL), 'the bad statement fails inside the transaction');
            } finally {
                try {
                    await provider.RollbackTransaction();
                } catch {
                    await provider.ResetTransactionState();
                }
            }
            AssertEqual(provider.TransactionDepth, 0, 'the rollback leaves no ambient transaction');
            await assertProbeSucceeds(provider, 'after a rolled-back transaction');
        }
    },
    {
        Id: 'cache-architecture.CA7',
        RequiresMutation: true,
        Name: 'CA7: a transaction group updates each cached slot once, not once per row',
        Fn: async (ctx): Promise<void> => {
            // The engine keeps its own slot for the entity and syncs it on every change, so it is
            // checked alongside the check's private slot.
            await AIEngineBase.Instance.Config(false, ctx.User);
            const engineFingerprint = await seedEngineSlot(ctx, NOTES_ENTITY);
            const fingerprint = await seedPrivateSlot(ctx, NOTES_ENTITY, 'ca7');
            const writesBefore = await slotWriteCounts(ctx, NOTES_ENTITY);
            const writesSince = (key: string): number => ctx.Storage.SetCountForKey(key) - (writesBefore.get(key) ?? 0);
            const provider = (await newNote(ctx, 'CA7 provider probe')).ProviderToUse;
            let ids: string[] = [];
            try {
                ids = await saveNotesInTransactionGroup(ctx);
                AssertEqual(JSON.stringify(await waitForSlotIds(ctx, fingerprint, ids)), JSON.stringify(ids),
                    'after the group commits the slot holds every note it saved');
                AssertEqual(writesSince(fingerprint), 1, `the slot is written once for the whole group of ${GROUP_NOTES} rows`);
                AssertEqual(writesSince(engineFingerprint), 1, `the engine's slot is written once for the whole group of ${GROUP_NOTES} rows`);
                const rewritten = [...writesBefore.keys()].filter(key => writesSince(key) > 1).map(key => `${writesSince(key)}× ${key}`);
                AssertEqual(rewritten.join('; '), '', 'no slot of the entity is written more than once for the group');
            } finally {
                if (ids.length > 0) {
                    await deleteInTransaction(ctx, provider, NOTES_ENTITY, ids);
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(fingerprint);
                await LocalCacheManager.Instance.InvalidateRunViewResult(engineFingerprint);
            }
        }
    },
    {
        Id: 'cache-architecture.CA8',
        RequiresMutation: true,
        Name: 'CA8: a transaction group spanning two entities writes each entity\'s cached slots once',
        Fn: async (ctx): Promise<void> => {
            const notesSlot = await seedPrivateSlot(ctx, NOTES_ENTITY, 'ca8');
            const categoriesSlot = await seedPrivateSlot(ctx, CATEGORY_ENTITY, 'ca8');
            const writesBefore = new Map([...await slotWriteCounts(ctx, NOTES_ENTITY), ...await slotWriteCounts(ctx, CATEGORY_ENTITY)]);
            const writesSince = (key: string): number => ctx.Storage.SetCountForKey(key) - (writesBefore.get(key) ?? 0);
            const notes: MJAIAgentNoteEntity[] = [];
            const categories: MJActionCategoryEntity[] = [];
            for (let i = 0; i < GROUP_ROWS_PER_ENTITY; i++) {
                notes.push(await newNote(ctx, `CA8 group ${i}`));
                categories.push(await newCategory(ctx, `CA8 group ${i}`));
            }
            const provider = notes[0].ProviderToUse;
            let submitted = false;
            try {
                // Interleaved, so each entity's rows are spread across the group.
                await submitInTransactionGroup(ctx, notes.flatMap((note, i) => [note, categories[i]]));
                submitted = true;
                const noteIds = notes.map(n => n.ID.toUpperCase()).sort();
                const categoryIds = categories.map(c => c.ID.toUpperCase()).sort();
                AssertEqual(JSON.stringify(await waitForSlotIds(ctx, notesSlot, noteIds)), JSON.stringify(noteIds),
                    'the notes slot holds exactly the notes the group saved');
                AssertEqual(JSON.stringify(await waitForSlotIds(ctx, categoriesSlot, categoryIds)), JSON.stringify(categoryIds),
                    'the categories slot holds exactly the categories the group saved');
                AssertEqual(writesSince(notesSlot), 1, 'the notes slot is written once for the group');
                AssertEqual(writesSince(categoriesSlot), 1, 'the categories slot is written once for the group');
                const rewritten = [...writesBefore.keys()].filter(key => writesSince(key) > 1).map(key => `${writesSince(key)}× ${key}`);
                AssertEqual(rewritten.join('; '), '', 'no slot of either entity is written more than once for the group');
            } finally {
                if (submitted) {
                    await deleteInTransaction(ctx, provider, NOTES_ENTITY, notes.map(n => n.ID));
                    await deleteInTransaction(ctx, provider, CATEGORY_ENTITY, categories.map(c => c.ID));
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(notesSlot);
                await LocalCacheManager.Instance.InvalidateRunViewResult(categoriesSlot);
            }
        }
    },
    {
        Id: 'cache-architecture.CA9',
        RequiresMutation: true,
        Name: 'CA9: a provider transaction writes an engine\'s cached slot once, not once per row',
        Fn: async (ctx): Promise<void> => {
            const engineSlot = await seedEngineSlot(ctx, CATEGORY_ENTITY);
            const privateSlot = await seedPrivateSlot(ctx, CATEGORY_ENTITY, 'ca9');
            const writesBefore = await slotWriteCounts(ctx, CATEGORY_ENTITY);
            const writesSince = (key: string): number => ctx.Storage.SetCountForKey(key) - (writesBefore.get(key) ?? 0);
            const categories: MJActionCategoryEntity[] = [];
            for (let i = 0; i < GROUP_ROWS_PER_ENTITY; i++) {
                categories.push(await newCategory(ctx, `CA9 transaction ${i}`));
            }
            const provider = categories[0].ProviderToUse;
            let committed = false;
            try {
                await RunInEntityTransaction(provider, async () => {
                    for (const category of categories) {
                        Assert(await category.Save(), `category save failed: ${category.LatestResult?.CompleteMessage}`);
                    }
                });
                committed = true;
                const ids = categories.map(c => c.ID.toUpperCase()).sort();
                AssertEqual(JSON.stringify(await waitForSlotIds(ctx, privateSlot, ids)), JSON.stringify(ids),
                    'after commit the private slot holds every category the transaction saved');
                await settleEngineSyncs();
                AssertEqual(writesSince(privateSlot), 1, 'the private slot is written once for the transaction');
                AssertEqual(writesSince(engineSlot), 1, 'the engine\'s slot is written once for the transaction');
                AssertEqual(slotsRewritten(ctx, writesBefore), '', 'no slot of the entity is written more than once for the transaction');
            } finally {
                if (committed) {
                    await deleteInTransaction(ctx, provider, CATEGORY_ENTITY, categories.map(c => c.ID));
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(privateSlot);
            }
        }
    },
    {
        Id: 'cache-architecture.CA10',
        RequiresMutation: true,
        Name: 'CA10: a transaction group that rolls back writes no cached slot and leaves no rows (end-to-end guard)',
        Fn: async (ctx): Promise<void> => {
            // An end-to-end guard, not a pin for the batch's failure path. On SQL Server a group
            // that fails on a foreign key throws inside HandleSubmit, before any callback runs, so
            // TransactionGroupBase.completeSubmittedResults is never reached and this check passes
            // with or without batching. The failed-batch path is pinned by the unit tests in
            // transactionGroup.entityEventBatch.test.ts.
            const engineSlot = await seedEngineSlot(ctx, CATEGORY_ENTITY);
            const privateSlot = await seedPrivateSlot(ctx, CATEGORY_ENTITY, 'ca10');
            const writesBefore = await slotWriteCounts(ctx, CATEGORY_ENTITY);
            const writesSince = (key: string): number => ctx.Storage.SetCountForKey(key) - (writesBefore.get(key) ?? 0);
            const prefix = `CA10 ${uuidv4()}`;
            const valid = await newCategory(ctx, `${prefix} valid`);
            const orphan = await newCategory(ctx, `${prefix} orphan`);
            orphan.ParentID = uuidv4(); // no such parent: the foreign key fails and the whole group rolls back
            const group = await ctx.Provider.CreateTransactionGroup();
            try {
                for (const category of [valid, orphan]) {
                    category.TransactionGroup = group;
                    Assert(await category.Save(), `queueing a category failed: ${category.LatestResult?.CompleteMessage}`);
                }
                AssertEqual(await group.Submit(), false, 'precondition: the group fails on the foreign key');
                AssertEqual(JSON.stringify(await categoryIdsNamed(ctx, prefix)), '[]', 'precondition: the rollback left no rows');
                await settleEngineSyncs();
                AssertEqual(JSON.stringify(await storedSlotIds(ctx, privateSlot)), '[]', 'the private slot still holds no rows');
                AssertEqual(writesSince(privateSlot), 0, 'the private slot is not written for a group that rolled back');
                AssertEqual(writesSince(engineSlot), 0, 'the engine\'s slot is not written for a group that rolled back');
            } finally {
                const leftovers = await categoryIdsNamed(ctx, prefix);
                if (leftovers.length > 0) {
                    await deleteInTransaction(ctx, valid.ProviderToUse, CATEGORY_ENTITY, leftovers);
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(privateSlot);
            }
        }
    },
    {
        Id: 'cache-architecture.CA11',
        RequiresMutation: true,
        Name: 'CA11: transaction groups using a variable, and groups of deletes, write each cached slot once',
        Fn: async (ctx): Promise<void> => {
            const engineSlot = await seedEngineSlot(ctx, CATEGORY_ENTITY);
            const privateSlot = await seedPrivateSlot(ctx, CATEGORY_ENTITY, 'ca11');
            const prefix = `CA11 ${uuidv4()}`;
            const parent = await newCategory(ctx, `${prefix} parent`);
            const child = await newCategory(ctx, `${prefix} child`);
            const provider = parent.ProviderToUse;
            try {
                // A variable makes the server run the statements one at a time.
                let writesBefore = await slotWriteCounts(ctx, CATEGORY_ENTITY);
                const creates = await ctx.Provider.CreateTransactionGroup();
                for (const category of [parent, child]) {
                    category.TransactionGroup = creates;
                    Assert(await category.Save(), `queueing a create failed: ${category.LatestResult?.CompleteMessage}`);
                }
                creates.AddVariable(new TransactionVariable('CA11ParentID', parent, 'ID', 'Define'));
                creates.AddVariable(new TransactionVariable('CA11ParentID', child, 'ParentID', 'Use'));
                Assert(await creates.Submit(), 'the group of creates failed to submit');
                const ids = [parent.ID.toUpperCase(), child.ID.toUpperCase()].sort();
                AssertEqual(JSON.stringify(await waitForSlotIds(ctx, privateSlot, ids)), JSON.stringify(ids),
                    'after the creates the private slot holds the parent and the child');
                await settleEngineSyncs();
                AssertEqual(ctx.Storage.SetCountForKey(privateSlot) - (writesBefore.get(privateSlot) ?? 0), 1, 'the creates write the private slot once');
                AssertEqual(ctx.Storage.SetCountForKey(engineSlot) - (writesBefore.get(engineSlot) ?? 0), 1, 'the creates write the engine\'s slot once');
                AssertEqual(slotsRewritten(ctx, writesBefore), '', 'no slot is written more than once for the creates');

                writesBefore = await slotWriteCounts(ctx, CATEGORY_ENTITY);
                const deletes = await ctx.Provider.CreateTransactionGroup();
                for (const category of [child, parent]) { // the child first, for its foreign key
                    category.TransactionGroup = deletes;
                    Assert(await category.Delete(), `queueing a delete failed: ${category.LatestResult?.CompleteMessage}`);
                }
                Assert(await deletes.Submit(), 'the group of deletes failed to submit');
                AssertEqual(JSON.stringify(await waitForSlotIds(ctx, privateSlot, [])), '[]', 'after the deletes the private slot holds neither row');
                await settleEngineSyncs();
                AssertEqual(ctx.Storage.SetCountForKey(privateSlot) - (writesBefore.get(privateSlot) ?? 0), 1, 'the deletes write the private slot once');
                AssertEqual(ctx.Storage.SetCountForKey(engineSlot) - (writesBefore.get(engineSlot) ?? 0), 1, 'the deletes write the engine\'s slot once');
                AssertEqual(slotsRewritten(ctx, writesBefore), '', 'no slot is written more than once for the deletes');
            } finally {
                const leftovers = await categoryIdsNamed(ctx, prefix);
                const children = await categoryIdsNamed(ctx, `${prefix} child`);
                await deleteInTransaction(ctx, provider, CATEGORY_ENTITY, [...children, ...leftovers.filter(id => !children.includes(id))]);
                await LocalCacheManager.Instance.InvalidateRunViewResult(privateSlot);
            }
        }
    },
];

for (const check of CacheArchitectureChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
