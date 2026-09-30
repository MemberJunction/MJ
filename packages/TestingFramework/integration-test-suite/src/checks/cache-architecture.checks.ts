/**
 * cache-architecture.checks.ts — the 'cache-architecture' bundle (CA1…).
 *
 * DETERMINISTIC tier, server transport. Regression pins for the engine / cache / event-bus work
 * recorded in plans/engine-cache-architecture-plan.md. Each check names the plan item it pins.
 * The measurements behind these items came from a multi-process rig (rigs/cache-fleet-baseline.ts);
 * what can be asserted inside one process lives here, through `mj test`.
 *
 * Every check asserts on observable cache state (LocalCacheManager's fingerprint index, the storage
 * provider's keys) or on derived engine state, never on row counts alone.
 */
import { BaseEngine, BaseEngineRegistry, LocalCacheManager, RunInEntityTransaction, RunView } from '@memberjunction/core';
import type { DerivedStateIdempotencyResult, EngineStateCensus, IEntityDataProvider, RunViewParams } from '@memberjunction/core';
import { uuidv4 } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import type { MJAIAgentNoteEntity, MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { UserRoutineDispatcherDriver, ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';

/**
 * Entities read on a schedule with a filter that embeds the current time (plan N4). Each poll would
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

const NOTES_ENTITY = 'MJ: AI Agent Notes';

/** How many notes CA4 saves in one transaction. */
const BATCH_NOTES = 5;

/** Row IDs a slot holds, upper-cased, or null when the slot is not stored. */
async function storedSlotIds(ctx: IntegrationCheckContext, fingerprint: string): Promise<string[] | null> {
    const stored = await ctx.Storage.GetItem<{ results: Array<{ ID: string }> }>(fingerprint, 'RunViewCache');
    return stored ? stored.results.map(r => r.ID.toUpperCase()).sort() : null;
}

/**
 * An unfiltered notes slot of CA4's own (a distinct connection segment keeps it apart from any
 * engine's slot), stored empty so the check only ever sees the rows it writes.
 */
async function seedPrivateNotesSlot(ctx: IntegrationCheckContext): Promise<string> {
    const params: RunViewParams = { EntityName: NOTES_ENTITY, IgnoreMaxRows: true };
    // Connection-shaped, because any other trailing segment marks a slot as narrowed (not maintained).
    const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, `it-ca4://${uuidv4()}/`);
    await LocalCacheManager.Instance.SetRunViewResult(fingerprint, params, [], '', undefined, undefined, ctx.Provider);
    const seeded = await storedSlotIds(ctx, fingerprint);
    AssertEqual(JSON.stringify(seeded), '[]', 'precondition: the private notes slot is stored and empty');
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

async function deleteNotesInTransaction(ctx: IntegrationCheckContext, provider: IEntityDataProvider, ids: string[]): Promise<void> {
    await RunInEntityTransaction(provider, async () => {
        for (const id of ids) {
            const note = await ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, ctx.User);
            if (await note.Load(id)) {
                Assert(await note.Delete(), `note delete failed: ${note.LatestResult?.CompleteMessage}`);
            }
        }
    });
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
        Name: 'CA1: entities polled with a time-varying filter are opted out of caching (plan N4)',
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
        Name: 'CA2: repeated User Routine dispatcher sweeps write no RunView cache slot (plan F2 / 1.1)',
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
        Name: 'CA3: the engine state census reports derived state that row counts cannot show (plan N6 / 1.6)',
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
        Name: 'CA4: a transaction updates cached slots once, on commit, and never with rolled-back rows (plan N11)',
        Fn: async (ctx): Promise<void> => {
            const fingerprint = await seedPrivateNotesSlot(ctx);
            const provider = (await newNote(ctx, 'CA4 provider probe')).ProviderToUse;
            let ids: string[] = [];
            try {
                ids = await saveNotesInTransaction(ctx, provider, fingerprint);
                AssertEqual(JSON.stringify(await storedSlotIds(ctx, fingerprint)), JSON.stringify(ids),
                    'after commit the slot holds every note the transaction saved');

                await deleteNotesInTransaction(ctx, provider, ids);
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
                    await deleteNotesInTransaction(ctx, provider, ids);
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(fingerprint);
            }
        }
    },
    {
        Id: 'cache-architecture.CA5',
        RequiresMutation: true,
        Name: 'CA5: a failed statement does not strand its pooled connection for the next caller (plan §9, brief item 7)',
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
        Id: 'cache-architecture.CA6',
        Name: 'CA6: every loaded engine rebuilds its derived state idempotently (plan §10, Phase 5)',
        Fn: async (ctx): Promise<void> => {
            const engines = BaseEngineRegistry.Instance.GetAllEngines()
                .filter((engine): engine is BaseEngine<object> => engine instanceof BaseEngine && engine.Loaded);
            Assert(engines.some(e => e instanceof AIEngineBase), 'precondition: AIEngineBase is among the loaded engines');
            const results: DerivedStateIdempotencyResult[] = [];
            for (const engine of engines) {
                results.push(await engine.VerifyDerivedStateIdempotent(ctx.User));
            }
            // This check MUTATES every engine it inspects: VerifyDerivedStateIdempotent runs
            // AdditionalLoading twice on the live engine. It now puts a drifting engine back
            // (BaseEngine.restoreAfterVerification), which matters here more than anywhere — every
            // later check in the tier shares this process, so an engine left carrying two extra
            // rebuilds would turn one finding into a spray of unrelated failures. Report a restore
            // that did NOT happen, because from that point on the process is suspect.
            const unrestored = results.filter(r => !r.Restored)
                .map(r => `${r.EngineClass} (${r.RestoreError ?? 'no reason given'})`);
            AssertEqual(unrestored.length, 0,
                `every engine this check rebuilt must be left as a normal load would leave it; these were not, so later checks in this run are unreliable: ${unrestored.join('; ')}`);

            const drifting = results.filter(r => !r.Idempotent)
                .map(r => `${r.EngineClass} (${JSON.stringify(r.AfterFirst)} → ${JSON.stringify(r.AfterSecond)})`);
            AssertEqual(drifting.length, 0,
                `AdditionalLoading must converge when run again — a second run changed: ${drifting.join('; ')} (checked ${results.length} engines)`);
        }
    },
];

for (const check of CacheArchitectureChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
