/**
 * cache-fleet-replica.ts — ONE replica process for the fleet baseline rig
 * (`rigs/cache-fleet-baseline.ts`). SCRATCH MEASUREMENT TOOL — not part of any suite.
 *
 * Boots exactly the way MJAPI / Skip boot:
 *   1. in-process SQL Server provider + StartupManager (engines load on the in-memory provider)
 *   2. RedisLocalStorageProvider installed on the data provider, pub/sub wired to DispatchCacheChange
 *   3. LocalCacheManager.SetStorageProvider(redis) — the migration that publishes every entry
 *
 * Instruments, on the objects it owns (never node_modules): pub/sub events received (by
 * category/action/bytes), Redis writes issued, AIEngineBase materializations and derived-state
 * rebuilds (count + ms), DB round trips (ExecuteSQL / ExecuteSQLBatch), and a per-property
 * identity census (count, max __mj_UpdatedAt, hash of (PK, UpdatedAt)) plus a DERIVED-state
 * census (models with vendors attached, etc.) — the thing row counts cannot see.
 *
 * Driven over IPC by the parent: { id, cmd, args } → { id, ok, result | error }.
 * Modes: --mode=replica (default) · --mode=cli (in-memory provider only; saves through BaseEntity
 * and exits — the `mj sync push` shape).
 */
import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import {
    BaseEngine, BaseEngineSweeper, BaseEntity, LocalCacheManager, Metadata, ProviderBase, RunInEntityTransaction, RunView, SetProductionStatus,
} from '@memberjunction/core';
import type {
    BaseEnginePropertyConfig, CacheChangedEvent, IMetadataProvider, LocalStorageWriteOptions, UserInfo,
} from '@memberjunction/core';
import type { MJAIAgentNoteEntity, MJAIModelEntity, MJUserEntity, MJUserRoleEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import type {
    MJAIAgentEntityExtended, MJAIModelEntityExtended, MJAIPromptCategoryEntityExtended,
} from '@memberjunction/ai-core-plus';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { PostgreSQLDataProvider } from '@memberjunction/postgresql-dataprovider';
import { ClearSharedCacheCategories, RedisLocalStorageProvider, SHARED_CACHE_WRITE_CATEGORIES } from '@memberjunction/redis-provider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { bootstrapIntegrationServer } from '@memberjunction/testing-integration';
import type { IntegrationBootstrapContext } from '@memberjunction/testing-integration';

// Keep the wrapper package's server-side class registrations in the graph (same as the wire rig).
void AIEngine;

const NOTES_ENTITY = 'MJ: AI Agent Notes';
const MODELS_ENTITY = 'MJ: AI Models';

// ────────────────────────────────────────────────────────────────────────────────────────────
// Counters
// ────────────────────────────────────────────────────────────────────────────────────────────

interface EventTally { count: number; bytes: number }

interface Counters {
    /** pub/sub events received from peers, keyed `${Category}/${Action}` */
    eventsReceived: Record<string, EventTally>;
    /** registry broadcasts received (Metadata/__MJ_CACHE_REGISTRY__) */
    registryEvents: EventTally;
    /** Redis writes this process issued, keyed `${Category}/set|remove` */
    redisWrites: Record<string, EventTally>;
    /** AIEngineBase.OnExternalCacheChange invocations (payload apply incl. materialization) */
    externalCacheChanges: { count: number; totalMs: number; maxMs: number };
    /** AIEngineBase.AdditionalLoading invocations (derived-state rebuilds) */
    rebuilds: { count: number; totalMs: number; maxMs: number; samplesMs: number[] };
    /** SQLServerDataProvider.ExecuteSQL / ExecuteSQLBatch round trips; readerCalls are the cli-ops reader loop's, kept out of the others */
    dbCalls: { executeSQL: number; executeSQLBatch: number; batchStatements: number; readerCalls: number };
    /** BaseEngine.SweepAgainstDatabase runs on AIEngineBase (plan 3.1) and the properties they reloaded */
    sweeps: { count: number; reloads: number };
    /** metadata staleness checks (CheckToSeeIfRefreshNeeded) and full metadata reloads (Refresh) */
    metadata: { checks: number; refreshes: number };
    /** in-flight OnExternalCacheChange handlers (for quiesce) */
    pending: number;
    /** last time any counter moved (Date.now()) — for quiesce */
    lastActivityAt: number;
}

const counters: Counters = {
    eventsReceived: {},
    registryEvents: { count: 0, bytes: 0 },
    redisWrites: {},
    externalCacheChanges: { count: 0, totalMs: 0, maxMs: 0 },
    rebuilds: { count: 0, totalMs: 0, maxMs: 0, samplesMs: [] },
    dbCalls: { executeSQL: 0, executeSQLBatch: 0, batchStatements: 0, readerCalls: 0 },
    sweeps: { count: 0, reloads: 0 },
    metadata: { checks: 0, refreshes: 0 },
    pending: 0,
    lastActivityAt: Date.now(),
};

/** Set while the reader loop runs, so its own work does not keep quiesce from seeing idle. */
const readerContext = new AsyncLocalStorage<true>();

function touch(): void {
    if (readerContext.getStore()) return;
    counters.lastActivityAt = Date.now();
}

function tally(map: Record<string, EventTally>, key: string, bytes: number): void {
    const t = map[key] ?? (map[key] = { count: 0, bytes: 0 });
    t.count++;
    t.bytes += bytes;
    touch();
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Instrumentation (own objects only)
// ────────────────────────────────────────────────────────────────────────────────────────────

/** The two protected seams on BaseEngine this rig times, exposed the way IT84 exposes them. */
interface EngineInternals {
    AdditionalLoading(contextUser?: UserInfo): Promise<void>;
    OnExternalCacheChange(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void>;
}

/** Counts metadata staleness checks and full reloads on this process's provider. */
function instrumentMetadata(provider: IMetadataProvider): void {
    if (!(provider instanceof ProviderBase)) return;
    const check = provider.CheckToSeeIfRefreshNeeded.bind(provider);
    provider.CheckToSeeIfRefreshNeeded = async (...args: Parameters<ProviderBase['CheckToSeeIfRefreshNeeded']>) => {
        counters.metadata.checks++;
        touch();
        return check(...args);
    };
    const refresh = provider.Refresh.bind(provider);
    provider.Refresh = async (...args: Parameters<ProviderBase['Refresh']>) => {
        counters.metadata.refreshes++;
        touch();
        const ok = await refresh(...args);
        touch();
        return ok;
    };
}

function instrumentDbCalls(): void {
    // Both platforms define their own ExecuteSQL; ExecuteSQLBatch is shared or overridden.
    for (const proto of [SQLServerDataProvider.prototype, PostgreSQLDataProvider.prototype]) {
        wrapDbCalls(proto);
    }
}

function wrapDbCalls(proto: GenericDatabaseProvider): void {
    const origExec = proto.ExecuteSQL;
    proto.ExecuteSQL = async function <T>(this: GenericDatabaseProvider, ...args: Parameters<GenericDatabaseProvider['ExecuteSQL']>): Promise<T[]> {
        if (readerContext.getStore()) counters.dbCalls.readerCalls++;
        else counters.dbCalls.executeSQL++;
        touch();
        const exec: GenericDatabaseProvider['ExecuteSQL'] = origExec.bind(this);
        return exec<T>(...args);
    };
    if (!Object.prototype.hasOwnProperty.call(proto, 'ExecuteSQLBatch')) {
        return; // inherited: counted once, through the class that defines it
    }
    const origBatch = proto.ExecuteSQLBatch;
    proto.ExecuteSQLBatch = async function (this: GenericDatabaseProvider, ...args: Parameters<typeof origBatch>) {
        if (readerContext.getStore()) {
            counters.dbCalls.readerCalls++;
            return origBatch.apply(this, args);
        }
        counters.dbCalls.executeSQLBatch++;
        counters.dbCalls.batchStatements += Array.isArray(args[0]) ? args[0].length : 0;
        touch();
        return origBatch.apply(this, args);
    };
}

function instrumentEngine(engine: AIEngineBase): void {
    const internals = engine as unknown as EngineInternals;
    const origAdditional = internals.AdditionalLoading;
    internals.AdditionalLoading = async function (this: AIEngineBase, contextUser?: UserInfo): Promise<void> {
        const t0 = performance.now();
        try {
            await origAdditional.call(this, contextUser);
        } finally {
            const ms = performance.now() - t0;
            counters.rebuilds.count++;
            counters.rebuilds.totalMs += ms;
            counters.rebuilds.maxMs = Math.max(counters.rebuilds.maxMs, ms);
            if (counters.rebuilds.samplesMs.length < 500) counters.rebuilds.samplesMs.push(Math.round(ms * 100) / 100);
            touch();
        }
    };
    const origExternal = internals.OnExternalCacheChange;
    internals.OnExternalCacheChange = async function (this: AIEngineBase, config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        const t0 = performance.now();
        counters.pending++;
        touch();
        try {
            await origExternal.call(this, config, event);
        } finally {
            const ms = performance.now() - t0;
            counters.pending--;
            counters.externalCacheChanges.count++;
            counters.externalCacheChanges.totalMs += ms;
            counters.externalCacheChanges.maxMs = Math.max(counters.externalCacheChanges.maxMs, ms);
            touch();
        }
    };
}

function instrumentRedisWrites(redis: RedisLocalStorageProvider): void {
    const origSet = redis.SetItem.bind(redis);
    redis.SetItem = async <T>(key: string, value: T, category?: string, options?: number | LocalStorageWriteOptions): Promise<void> => {
        let bytes = 0;
        try { bytes = JSON.stringify(value).length; } catch { /* unmeasurable */ }
        tally(counters.redisWrites, `${category ?? 'default'}/set`, bytes);
        if (process.env.FLEET_TRACE_NOTES && key.startsWith('MJ: AI Agent Notes|_|')) {
            const rows = (value as { results?: unknown[] })?.results?.length;
            const stack = (new Error().stack ?? '').split('\n').slice(2, 9).map(l => l.trim().replace(/^at /, '')).join(' < ');
            console.error(`[trace] ${Date.now()} set notes-slot rows=${rows} ${stack}`);
        }
        return origSet(key, value, category, options);
    };
    const origRemove = redis.Remove.bind(redis);
    redis.Remove = async (key: string, category?: string): Promise<void> => {
        tally(counters.redisWrites, `${category ?? 'default'}/remove`, 0);
        return origRemove(key, category);
    };
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Census
// ────────────────────────────────────────────────────────────────────────────────────────────

interface Stamped { ID: string; __mj_UpdatedAt: Date }

interface PropertyIdentity { count: number; maxUpdatedAt: string | null; hash: string }

function identityOf(rows: ReadonlyArray<Stamped>): PropertyIdentity {
    let max = 0;
    const keys: string[] = [];
    for (const r of rows) {
        const ms = r.__mj_UpdatedAt instanceof Date ? r.__mj_UpdatedAt.getTime() : new Date(String(r.__mj_UpdatedAt)).getTime();
        if (ms > max) max = ms;
        keys.push(`${r.ID}|${ms}`);
    }
    keys.sort();
    const hash = createHash('sha1').update(keys.join('\n')).digest('hex').slice(0, 12);
    return { count: rows.length, maxUpdatedAt: max ? new Date(max).toISOString() : null, hash };
}

interface Census {
    properties: Record<string, PropertyIdentity>;
    derived: {
        modelsWithVendors: number; vendorsAttached: number;
        categoriesWithPrompts: number; promptsAttached: number;
        agentsWithNotes: number; notesAttached: number;
    };
    /** one hash over every property hash + the derived census — equal ⇔ identical state */
    fleetHash: string;
}

function census(engine: AIEngineBase): Census {
    const properties: Record<string, PropertyIdentity> = {
        _models: identityOf(engine.Models),
        _modelVendors: identityOf(engine.ModelVendors),
        _vendors: identityOf(engine.Vendors),
        _prompts: identityOf(engine.Prompts),
        _promptModels: identityOf(engine.PromptModels),
        _promptCategories: identityOf(engine.PromptCategories),
        _configurations: identityOf(engine.Configurations),
        _agents: identityOf(engine.Agents),
        _agentNotes: identityOf(engine.AgentNotes),
    };
    const models: MJAIModelEntityExtended[] = engine.Models;
    const cats: MJAIPromptCategoryEntityExtended[] = engine.PromptCategories;
    const agents: MJAIAgentEntityExtended[] = engine.Agents;
    const derived = {
        modelsWithVendors: models.filter(m => (m.ModelVendors?.length ?? 0) > 0).length,
        vendorsAttached: models.reduce((s, m) => s + (m.ModelVendors?.length ?? 0), 0),
        categoriesWithPrompts: cats.filter(c => (c.Prompts?.length ?? 0) > 0).length,
        promptsAttached: cats.reduce((s, c) => s + (c.Prompts?.length ?? 0), 0),
        agentsWithNotes: agents.filter(a => (a.Notes?.length ?? 0) > 0).length,
        notesAttached: agents.reduce((s, a) => s + (a.Notes?.length ?? 0), 0),
    };
    const fleetHash = createHash('sha1')
        .update(Object.entries(properties).map(([k, v]) => `${k}=${v.hash}`).join(';'))
        .update(JSON.stringify(derived))
        .digest('hex').slice(0, 12);
    return { properties, derived, fleetHash };
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// A lazily-loaded engine over the SAME slot AIEngineBase uses for `MJ: AI Models`
// (no Filter/OrderBy ⇒ identical fingerprint). Loaded AFTER Redis is installed, so it is the
// "stale reader" shape — an engine whose first read comes from Redis.
// ────────────────────────────────────────────────────────────────────────────────────────────

class FleetLazyModelsEngine extends BaseEngine<FleetLazyModelsEngine> {
    private _lazyModels: MJAIModelEntity[] = [];
    public get LazyModels(): MJAIModelEntity[] { return this._lazyModels; }
    public static get Instance(): FleetLazyModelsEngine { return super.getInstance<FleetLazyModelsEngine>(); }
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { PropertyName: '_lazyModels', EntityName: MODELS_ENTITY, CacheLocal: true },
        ];
        return this.Load(configs, provider ?? Metadata.Provider, forceRefresh, contextUser); // global-provider-ok: rig owns the process
    }
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Replica state + commands
// ────────────────────────────────────────────────────────────────────────────────────────────

interface ReplicaState {
    ctx?: IntegrationBootstrapContext;
    user?: UserInfo;
    redis?: RedisLocalStorageProvider;
    watch?: { known: Set<string>; seen: Map<string, number>; timer: ReturnType<typeof setInterval> };
    readers?: { stop: boolean; done: Promise<void>; stats: ReaderStats };
    sweepInstrumented?: boolean;
}
const state: ReplicaState = {};

type Args = Record<string, string | number | undefined>;

function num(args: Args, key: string, dflt: number): number {
    const v = args[key];
    return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : dflt;
}
function str(args: Args, key: string): string {
    const v = args[key];
    if (typeof v !== 'string') throw new Error(`arg '${key}' must be a string`);
    return v;
}

function snapshot(): Counters {
    return JSON.parse(JSON.stringify(counters)) as Counters;
}

/** MJAPI's publish modes (MJServer/src/sharedCache.ts), mirrored so replicas publish what MJAPI does. */
const MJAPI_PUBLISH_MODES = { RunViewCache: 'full', default: 'notice' } as const;

function createSharedCache(args: Args): RedisLocalStorageProvider {
    const ttlArg = args['ttl'];
    const defaultTTLSeconds = ttlArg === undefined || ttlArg === '' ? undefined : Number(ttlArg);
    const redis = new RedisLocalStorageProvider({
        url: str(args, 'redisUrl'), keyPrefix: str(args, 'prefix'), defaultTTLSeconds,
        enablePubSub: true, enableLogging: false,
        publishModes: MJAPI_PUBLISH_MODES, defaultPublishMode: 'none',
    });
    instrumentRedisWrites(redis);
    return redis;
}

async function listen(redis: RedisLocalStorageProvider): Promise<void> {
    await redis.StartListening();
    redis.OnCacheChanged((event) => {
        const key = `${event.Category}/${event.Action}`;
        const bytes = event.Data ? event.Data.length : 0;
        tally(counters.eventsReceived, key, bytes);
        if (event.CacheKey === '__MJ_CACHE_REGISTRY__') {
            counters.registryEvents.count++;
            counters.registryEvents.bytes += bytes;
        }
        // As MJAPI routes them: a metadata notice goes to the provider and stops there.
        const provider = state.ctx?.Provider;
        const notice = provider instanceof ProviderBase && provider.HandlePeerMetadataNotice(event);
        if (event.Category === 'default') {
            console.log(`[${new Date().toISOString()}] default/${event.Action} "${event.CacheKey}" → ${notice ? 'metadata check scheduled' : provider ? 'not a notice' : 'no provider yet'}`);
        }
        if (notice) {
            return;
        }
        LocalCacheManager.Instance.DispatchCacheChange(event);
    });
}

/**
 * Boots like MJAPI. `boot=redis-first` (the default, MJAPI since): the shared store is
 * installed and subscribed before the provider loads metadata and startup engines.
 * `boot=legacy`: engines load on an in-memory store, then the store is swapped to Redis (the
 * the older order, kept for comparison).
 */
async function cmdBoot(args: Args): Promise<Record<string, unknown>> {
    const mode = args['boot'] === 'legacy' ? 'legacy' : 'redis-first';
    instrumentDbCalls();
    instrumentEngine(AIEngineBase.Instance);
    const dbBefore = { ...counters.dbCalls };
    const redis = createSharedCache(args);
    state.redis = redis;

    const t0 = performance.now();
    if (mode === 'redis-first') {
        await listen(redis);
    }
    const ctx = await bootstrapIntegrationServer(mode === 'redis-first' ? { SharedStorage: redis } : {});
    const bootMs = performance.now() - t0;
    state.ctx = ctx;
    instrumentMetadata(ctx.Provider);
    state.user = ctx.User;
    const dbDuringBoot = counters.dbCalls.executeSQL - dbBefore.executeSQL;
    const batchDuringBoot = counters.dbCalls.executeSQLBatch - dbBefore.executeSQLBatch;
    const cacheWritesDuringBoot = ctx.Storage.SetCount('RunViewCache');

    let swapMs = 0;
    if (mode === 'legacy') {
        (ctx.Provider as GenericDatabaseProvider).SetLocalStorageProvider(redis);
        await listen(redis);
        const t1 = performance.now();
        await LocalCacheManager.Instance.SetStorageProvider(redis);
        swapMs = performance.now() - t1;
    }

    return {
        pid: process.pid,
        mode,
        db: ctx.Db.Database,
        user: ctx.User.Email,
        bootMs: Math.round(bootMs),
        swapMs: Math.round(swapMs),
        dbCallsDuringBoot: dbDuringBoot,
        dbBatchesDuringBoot: batchDuringBoot,
        cacheWritesDuringBoot,
        runViewReadsDuringBoot: ctx.Storage.GetCount('RunViewCache'),
        registryEntries: LocalCacheManager.Instance.GetAllEntries().length,
        aiEngineLoaded: AIEngineBase.Instance.Loaded,
        initialRebuilds: counters.rebuilds.count,
    };
}

async function cmdQuiesce(args: Args): Promise<Counters> {
    const idleMs = num(args, 'idleMs', 1500);
    const maxMs = num(args, 'maxMs', 60000);
    const start = Date.now();
    for (;;) {
        const idle = Date.now() - counters.lastActivityAt;
        if (counters.pending === 0 && idle >= idleMs) break;
        if (Date.now() - start > maxMs) break;
        await sleep(50);
    }
    return snapshot();
}

function cmdCensus(): Census {
    return census(AIEngineBase.Instance);
}

function cmdArmWatch(): { known: number } {
    if (state.watch) clearInterval(state.watch.timer);
    const known = new Set(AIEngineBase.Instance.AgentNotes.map(n => n.ID));
    const seen = new Map<string, number>();
    const timer = setInterval(() => {
        for (const n of AIEngineBase.Instance.AgentNotes) {
            if (!known.has(n.ID) && !seen.has(n.ID)) seen.set(n.ID, Date.now());
        }
    }, 2);
    state.watch = { known, seen, timer };
    return { known: known.size };
}

async function cmdReadWatch(args: Args): Promise<{ seenAt: number | null }> {
    const id = str(args, 'id');
    const deadline = Date.now() + num(args, 'timeoutMs', 5000);
    for (;;) {
        const at = state.watch?.seen.get(id);
        if (at !== undefined) return { seenAt: at };
        if (Date.now() > deadline) return { seenAt: null };
        await sleep(5);
    }
}

async function cmdSaveNote(args: Args): Promise<{ id: string; startedAt: number; savedAt: number }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const note = await md.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, state.user);
    note.NewRecord();
    note.Type = 'Preference';
    note.Status = 'Active';
    note.Comments = str(args, 'marker'); // Note text stays empty: a non-empty Note triggers embedding generation
    const startedAt = Date.now();
    const saved = await note.Save();
    const savedAt = Date.now();
    if (!saved) throw new Error(`note save failed: ${note.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return { id: note.ID, startedAt, savedAt };
}

async function cmdDeleteNote(args: Args): Promise<{ deleted: boolean }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const note = await md.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, state.user);
    if (!(await note.Load(str(args, 'id')))) return { deleted: false };
    return { deleted: await note.Delete() };
}

function cmdReadModel(args: Args): { description: string | null; found: boolean } {
    const id = str(args, 'id').toUpperCase();
    const m = AIEngineBase.Instance.Models.find(x => x.ID.toUpperCase() === id);
    return { found: !!m, description: m?.Description ?? null };
}

/** The `MJ: AI Models` entity's metadata row, as this process's metadata holds it. */
function cmdEntityDescription(): { id: string; name: string; description: string | null } {
    const e = new Metadata().EntityByName(MODELS_ENTITY); // global-provider-ok: rig owns the process
    if (!e) throw new Error(`${MODELS_ENTITY} missing from metadata`);
    return { id: e.ID, name: e.Name, description: e.Description ?? null };
}

function cmdPickModel(): { id: string; description: string | null; name: string } {
    const m = AIEngineBase.Instance.Models[0];
    if (!m) throw new Error('no models loaded');
    return { id: m.ID, description: m.Description, name: m.Name };
}

/**
 * Direct SQL, bypassing BaseEntity — no events, no __mj_UpdatedAt bump. The "raw writer".
 * Quoting goes through the provider's dialect so the rig runs on SQL Server and PostgreSQL.
 */
async function cmdRawUpdateModel(args: Args): Promise<{ ok: true }> {
    const provider = state.ctx?.Provider as GenericDatabaseProvider;
    const dialect = provider.Dialect;
    const id = str(args, 'id').replace(/[^0-9A-Fa-f-]/g, '');
    const raw = args['description'];
    const value = raw === undefined || raw === null || raw === 'null' ? 'NULL' : dialect.QuoteStringLiteral(String(raw));
    const table = dialect.QuoteSchema(provider.MJCoreSchemaName, 'AIModel');
    await provider.ExecuteSQL(
        `UPDATE ${table} SET ${dialect.QuoteIdentifier('Description')} = ${value} WHERE ${dialect.QuoteIdentifier('ID')} = ${dialect.QuoteStringLiteral(id)}`,
        [], { isMutation: true, description: 'cache-fleet rig: raw writer' }, state.user,
    );
    return { ok: true };
}

/** Save through BaseEntity from THIS process — publishes on Redis if Redis is installed. */
async function cmdEntitySaveModel(args: Args): Promise<{ ok: boolean }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const m = await md.GetEntityObject<MJAIModelEntity>(MODELS_ENTITY, state.user);
    if (!(await m.Load(str(args, 'id')))) throw new Error('model not found');
    const raw = args['description'];
    m.Description = raw === undefined || raw === null || raw === 'null' ? null : String(raw);
    const ok = await m.Save();
    if (!ok) throw new Error(`model save failed: ${m.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return { ok };
}

async function cmdLoadLazy(args: Args): Promise<{ description: string | null; count: number; dbCallsDelta: number; redisSetsDelta: number }> {
    const id = str(args, 'id').toUpperCase();
    const dbBefore = counters.dbCalls.executeSQL + counters.dbCalls.executeSQLBatch;
    const setsBefore = counters.redisWrites['RunViewCache/set']?.count ?? 0;
    await FleetLazyModelsEngine.Instance.Config(false, state.user);
    const m = FleetLazyModelsEngine.Instance.LazyModels.find(x => x.ID.toUpperCase() === id);
    return {
        description: m?.Description ?? null,
        count: FleetLazyModelsEngine.Instance.LazyModels.length,
        dbCallsDelta: counters.dbCalls.executeSQL + counters.dbCalls.executeSQLBatch - dbBefore,
        redisSetsDelta: (counters.redisWrites['RunViewCache/set']?.count ?? 0) - setsBefore,
    };
}

async function cmdRunViewModel(args: Args): Promise<{ description: string | null; executionTime: number }> {
    const id = str(args, 'id');
    const rv = new RunView(); // global-provider-ok: rig owns the process
    // IgnoreMaxRows so this read shares the ENGINE's slot (BuildRunViewParamsForConfig sets it);
    // without it the read lands in a second, independently maintained slot for the same entity.
    const r = await rv.RunView<MJAIModelEntity>({ EntityName: MODELS_ENTITY, ResultType: 'entity_object', IgnoreMaxRows: true }, state.user);
    if (!r.Success) throw new Error(r.ErrorMessage);
    const m = r.Results.find(x => x.ID.toUpperCase() === id.toUpperCase());
    return { description: m?.Description ?? null, executionTime: r.ExecutionTime };
}

/**
 * Plain RunViews of the notes entity, each with a textually unique always-true filter — the
 * write-only-key shape a time-filtered poller produces. Returns how many cache slots it wrote.
 */
async function cmdUniqueNoteReads(args: Args): Promise<{ reads: number; redisSets: number }> {
    const count = num(args, 'count', 10);
    const marker = str(args, 'marker').replace(/'/g, "''");
    const setsBefore = counters.redisWrites['RunViewCache/set']?.count ?? 0;
    const rv = new RunView(); // global-provider-ok: rig owns the process
    for (let i = 0; i < count; i++) {
        const r = await rv.RunView({ EntityName: NOTES_ENTITY, ExtraFilter: `Type <> '${marker}-${i}'`, ResultType: 'simple' }, state.user);
        if (!r.Success) throw new Error(r.ErrorMessage);
    }
    return { reads: count, redisSets: (counters.redisWrites['RunViewCache/set']?.count ?? 0) - setsBefore };
}

async function cmdCliBoot(): Promise<{ db: string; cacheWrites: number; dbCalls: number }> {
    instrumentDbCalls();
    const ctx = await bootstrapIntegrationServer();
    state.ctx = ctx;
    state.user = ctx.User;
    return { db: ctx.Db.Database, cacheWrites: ctx.Storage.SetItemCount, dbCalls: counters.dbCalls.executeSQL };
}

/** What `mj sync push` / `mj codegen` / `mj migrate` do after writing when REDIS_URL is set (plan 2.1). */
async function cmdClearSharedCache(args: Args): Promise<{ keys: number }> {
    const results = await ClearSharedCacheCategories({
        Connection: { url: str(args, 'redisUrl'), keyPrefix: str(args, 'prefix') },
        Categories: SHARED_CACHE_WRITE_CATEGORIES,
        // What the CLI ships does remove the metadata snapshot; without this the rig measured a
        // weaker clear than production performs.
        IncludeMetadataSnapshot: true,
    });
    return { keys: results.reduce((n, r) => n + r.KeyCount, 0) };
}

/**
 * What a server does after its periodic metadata refresh finds a change: write the metadata snapshot
 * through the provider's storage — which, after the Redis swap, is the shared keyspace.
 */
async function cmdSaveMetadataSnapshot(): Promise<{ ok: true }> {
    await (state.ctx?.Provider as GenericDatabaseProvider).SaveLocalMetadataToStorage();
    return { ok: true };
}

/** IDs of the notes whose Comments start with `marker`: in this engine, and in the database. */
async function cmdNoteIds(args: Args): Promise<{ engine: string[]; db: string[] }> {
    const marker = str(args, 'marker');
    const engine = AIEngineBase.Instance.AgentNotes.filter(n => (n.Comments ?? '').startsWith(marker)).map(n => n.ID.toUpperCase()).sort();
    const rv = new RunView(); // global-provider-ok: rig owns the process
    const res = await rv.RunView<{ ID: string }>({
        EntityName: NOTES_ENTITY, ExtraFilter: `Comments LIKE '${marker.replace(/'/g, "''")}%'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, state.user);
    if (!res.Success) throw new Error(res.ErrorMessage);
    return { engine, db: res.Results.map(r => r.ID.toUpperCase()).sort() };
}

/** Saves `count` notes one after another; returns their IDs and the elapsed time. */
async function cmdSaveNotes(args: Args): Promise<{ ids: string[]; ms: number }> {
    const count = num(args, 'count', 10);
    const marker = str(args, 'marker');
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const ids: string[] = [];
    const t0 = Date.now();
    await inUnitOfWork(args, async () => {
        for (let i = 0; i < count; i++) {
            const note = await md.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, state.user);
            note.NewRecord();
            note.Type = 'Preference';
            note.Status = 'Active';
            note.Comments = `${marker}-${i}`;
            if (!(await note.Save())) throw new Error(`note save failed: ${note.LatestResult?.CompleteMessage ?? 'unknown'}`);
            ids.push(note.ID);
        }
    });
    return { ids, ms: Date.now() - t0 };
}

/** Deletes the given notes one after another. */
async function cmdDeleteNotes(args: Args): Promise<{ ms: number }> {
    const ids = str(args, 'ids').split(',').filter(Boolean);
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const t0 = Date.now();
    await inUnitOfWork(args, async () => {
        for (const id of ids) {
            const note = await md.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, state.user);
            if (await note.Load(id)) await note.Delete();
        }
    });
    return { ms: Date.now() - t0 };
}

/** `mode=transaction` runs the work as one transaction (one cache batch); otherwise record by record. */
async function inUnitOfWork(args: Args, work: () => Promise<void>): Promise<void> {
    if (args.mode === 'transaction') {
        await RunInEntityTransaction(state.ctx?.Provider as GenericDatabaseProvider, work);
    } else {
        await work();
    }
}

/**
 * Starts the engine/database sweep (plan 3.1) at `intervalMs`, counting AIEngineBase's sweeps and
 * reloads. Every replica starts one; the shared lease decides which replica sweeps each interval.
 */
async function cmdStartSweeper(args: Args): Promise<{ intervalMs: number }> {
    const engine = AIEngineBase.Instance;
    if (!state.sweepInstrumented) {
        const original = engine.SweepAgainstDatabase.bind(engine);
        engine.SweepAgainstDatabase = async () => {
            const result = await original();
            counters.sweeps.count++;
            counters.sweeps.reloads += result.Reloaded.length;
            touch();
            return result;
        };
        state.sweepInstrumented = true;
    }
    const intervalMs = num(args, 'intervalMs', 5000);
    BaseEngineSweeper.Instance.Start(intervalMs);
    return { intervalMs };
}

async function cmdStopSweeper(): Promise<{ ok: true }> {
    BaseEngineSweeper.Instance.Stop();
    return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Readers: what a server does while a CLI command runs
// ────────────────────────────────────────────────────────────────────────────────────────────

interface ReaderKindStats { ok: number; failed: number; empty: number; maxMs: number; errors: string[]; firstFailureAt: number | null; lastFailureAt: number | null }
interface ReaderStats { startedAt: number; stoppedAt: number | null; rounds: number; kinds: Record<string, ReaderKindStats> }

async function readOnce(stats: ReaderStats, kind: string, read: () => Promise<number>): Promise<void> {
    const k = stats.kinds[kind] ?? (stats.kinds[kind] = { ok: 0, failed: 0, empty: 0, maxMs: 0, errors: [], firstFailureAt: null, lastFailureAt: null });
    const t0 = performance.now();
    try {
        const rows = await read();
        k.ok++;
        if (rows === 0) k.empty++;
    } catch (e) {
        k.failed++;
        const at = Date.now() - stats.startedAt;
        k.firstFailureAt ??= at;
        k.lastFailureAt = at;
        const message = (e instanceof Error ? e.message : String(e)).split('\n')[0].substring(0, 200);
        if (k.errors.length < 5 && !k.errors.includes(message)) k.errors.push(message);
    }
    k.maxMs = Math.max(k.maxMs, performance.now() - t0);
}

/** One round: the engine's rows, a cached RunView, a database read that skips the cache, and metadata. */
async function readerRound(stats: ReaderStats): Promise<void> {
    const rv = new RunView(); // global-provider-ok: rig owns the process
    await readOnce(stats, 'engine', async () => AIEngineBase.Instance.Models.length);
    await readOnce(stats, 'cachedRunView', async () => {
        const r = await rv.RunView({ EntityName: MODELS_ENTITY, IgnoreMaxRows: true, ResultType: 'simple' }, state.user);
        if (!r.Success) throw new Error(r.ErrorMessage);
        return r.Results.length;
    });
    await readOnce(stats, 'databaseRunView', async () => {
        // One model's vendors, without MaxRows (which adds a count query): one round trip per read.
        const modelId = AIEngineBase.Instance.Models[0]?.ID ?? '';
        const r = await rv.RunView({ EntityName: 'MJ: AI Model Vendors', ExtraFilter: `ModelID = '${modelId}'`, BypassCache: true, ResultType: 'simple' }, state.user);
        if (!r.Success) throw new Error(r.ErrorMessage);
        return r.Results.length;
    });
    await readOnce(stats, 'metadata', async () => {
        const md = new Metadata(); // global-provider-ok: rig owns the process
        if (!md.EntityByName(MODELS_ENTITY)) throw new Error(`${MODELS_ENTITY} missing from metadata`);
        return md.Entities.length;
    });
    stats.rounds++;
}

function cmdStartReaders(args: Args): { ok: true } {
    const intervalMs = num(args, 'intervalMs', 25);
    const stats: ReaderStats = { startedAt: Date.now(), stoppedAt: null, rounds: 0, kinds: {} };
    const readers = { stop: false, done: Promise.resolve(), stats };
    readers.done = (async () => {
        while (!readers.stop) {
            await readerContext.run(true, () => readerRound(stats));
            await sleep(intervalMs);
        }
    })();
    state.readers = readers;
    return { ok: true };
}

async function cmdStopReaders(): Promise<ReaderStats | null> {
    const readers = state.readers;
    if (!readers) return null;
    readers.stop = true;
    await readers.done;
    readers.stats.stoppedAt = Date.now();
    state.readers = undefined;
    return readers.stats;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Users: does a user created on another process reach this one?
// ────────────────────────────────────────────────────────────────────────────────────────────

const USERS_ENTITY = 'MJ: Users';
const USER_ROLES_ENTITY = 'MJ: User Roles';

/** Creates a user through BaseEntity, the way an admin portal or a provisioning API does. */
async function cmdCreateUser(args: Args): Promise<{ id: string; email: string }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const user = await md.GetEntityObject<MJUserEntity>(USERS_ENTITY, state.user);
    user.NewRecord();
    user.Name = str(args, 'email');
    user.Email = str(args, 'email');
    user.FirstName = 'Fleet';
    user.LastName = 'Probe';
    user.Type = 'User';
    user.IsActive = true;
    if (!(await user.Save())) {
        throw new Error(`user save failed: ${user.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    return { id: user.ID, email: user.Email };
}

async function cmdSetUserActive(args: Args): Promise<{ ok: true }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const user = await md.GetEntityObject<MJUserEntity>(USERS_ENTITY, state.user);
    if (!(await user.Load(str(args, 'id')))) throw new Error('user not found');
    user.IsActive = num(args, 'active', 1) === 1;
    if (!(await user.Save())) {
        throw new Error(`user save failed: ${user.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    return { ok: true };
}

/** Grants the first available role to a user, so peers can be checked for role propagation. */
async function cmdAddUserRole(args: Args): Promise<{ roleId: string }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const role = md.Roles[0];
    if (!role) throw new Error('no roles in metadata');
    const userRole = await md.GetEntityObject<MJUserRoleEntity>(USER_ROLES_ENTITY, state.user);
    userRole.NewRecord();
    userRole.UserID = str(args, 'id');
    userRole.RoleID = role.ID;
    if (!(await userRole.Save())) {
        throw new Error(`user role save failed: ${userRole.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    return { roleId: role.ID };
}

async function cmdDeleteUser(args: Args): Promise<{ deleted: boolean }> {
    const md = new Metadata(); // global-provider-ok: rig owns the process
    const rv = new RunView(); // global-provider-ok: rig owns the process
    const roles = await rv.RunView<MJUserRoleEntity>(
        { EntityName: USER_ROLES_ENTITY, ExtraFilter: `UserID = '${str(args, 'id')}'`, ResultType: 'entity_object' }, state.user);
    for (const r of roles.Results ?? []) {
        await r.Delete();
    }
    const user = await md.GetEntityObject<MJUserEntity>(USERS_ENTITY, state.user);
    if (!(await user.Load(str(args, 'id')))) return { deleted: false };
    return { deleted: await user.Delete() };
}

/**
 * What THIS process's user cache holds for an email — read the way a validator reads it
 * (`Users.find`), with no database fallback, so the test measures propagation and not the fallback.
 */
function cmdUserInCache(args: Args): { found: boolean; isActive: boolean | null; roleCount: number | null } {
    const email = str(args, 'email').trim().toLowerCase();
    const user = UserCache.Instance.Users.find(u => u.Email?.trim().toLowerCase() === email);
    return { found: !!user, isActive: user ? user.IsActive : null, roleCount: user ? (user.UserRoles ?? []).length : null };
}

/** The authoritative lookup a validator should use instead: a miss asks the database. */
async function cmdFindUser(args: Args): Promise<{ found: boolean; isActive: boolean | null }> {
    const user = await UserCache.Instance.FindUser({ Email: str(args, 'email') });
    return { found: !!user, isActive: user ? user.IsActive : null };
}

async function cmdExit(): Promise<{ ok: true }> {
    if (state.watch) clearInterval(state.watch.timer);
    setTimeout(() => process.exit(0), 50);
    return { ok: true };
}

const handlers: Record<string, (args: Args) => Promise<unknown> | unknown> = {
    'boot': cmdBoot,
    'cli-boot': cmdCliBoot,
    'quiesce': cmdQuiesce,
    'counters': () => snapshot(),
    'census': cmdCensus,
    'arm-watch': cmdArmWatch,
    'read-watch': cmdReadWatch,
    'save-note': cmdSaveNote,
    'delete-note': cmdDeleteNote,
    'pick-model': cmdPickModel,
    'read-model': cmdReadModel,
    'entity-description': cmdEntityDescription,
    'raw-update-model': cmdRawUpdateModel,
    'entity-save-model': cmdEntitySaveModel,
    'load-lazy': cmdLoadLazy,
    'runview-model': cmdRunViewModel,
    'unique-note-reads': cmdUniqueNoteReads,
    'clear-shared-cache': cmdClearSharedCache,
    'save-metadata-snapshot': cmdSaveMetadataSnapshot,
    'note-ids': cmdNoteIds,
    'save-notes': cmdSaveNotes,
    'start-sweeper': cmdStartSweeper,
    'stop-sweeper': cmdStopSweeper,
    'delete-notes': cmdDeleteNotes,
    'create-user': cmdCreateUser,
    'set-user-active': cmdSetUserActive,
    'add-user-role': cmdAddUserRole,
    'delete-user': cmdDeleteUser,
    'user-in-cache': cmdUserInCache,
    'find-user': cmdFindUser,
    'start-readers': cmdStartReaders,
    'stop-readers': cmdStopReaders,
    'exit': cmdExit,
};

interface Request { id: number; cmd: string; args?: Args }

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function main(): void {
    if (!process.send) {
        console.error('cache-fleet-replica must be forked with an IPC channel');
        process.exit(2);
    }
    SetProductionStatus(true); // quiet the framework's status chatter; errors still print
    process.on('message', async (msg: Request) => {
        const handler = handlers[msg.cmd];
        try {
            if (!handler) throw new Error(`unknown cmd ${msg.cmd}`);
            const result = await handler(msg.args ?? {});
            process.send!({ id: msg.id, ok: true, result });
        } catch (e) {
            process.send!({ id: msg.id, ok: false, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
        }
    });
    process.send({ id: 0, ok: true, result: 'ready' });
}

main();
