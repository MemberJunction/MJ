import { AsyncLocalStorage } from 'node:async_hooks';
import { BaseEntity, Metadata, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import {
    CATALOG_EDGE_COLUMNS,
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    CatalogDependencyEdge,
    CatalogScopeData,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    IntegrationEngineBase,
    projectCatalogObjects,
} from '@memberjunction/integration-engine-base';
import { CompanyIntegrationCatalogReadFailed } from './CatalogWriter.js';

/**
 * Which connection's catalog the code currently running belongs to.
 *
 * The problem this solves: every read of the integration catalog is keyed by INTEGRATION id, which
 * is shared by every connection of a connector. Threading a connection id down to each of them is
 * not viable — there are twenty-two call sites inside the REST connector base alone, and the
 * connectors that call them live in a separate repository and must keep compiling unchanged.
 *
 * So the connection id travels out of band. An operation that belongs to one connection runs inside
 * `RunInCatalogScope`, and the reads underneath it resolve per-connection without being told.
 *
 * This is the same mechanism the sync loop already uses for its own run context, in this very
 * package — `IntegrationEngine` imports `AsyncLocalStorage` for `runContext` and enters it around
 * each run and each write batch. Async context propagates across `await`, `Promise.all` and timer
 * callbacks, so a scope entered at the top of a run covers everything the run does.
 *
 * WHAT IT DOES NOT COVER, and why that is safe: a callback scheduled OUTSIDE the scope and invoked
 * inside it sees no scope, and so does a task handed to a worker thread or another process. Both
 * fall back to the shared catalog, which is the pre-existing behaviour — over-broad, never wrong
 * about what exists. The failure mode of a missed scope is therefore the old behaviour, not a
 * corrupt one. The failure mode that WOULD be dangerous — a per-connection write landing on the
 * shared rows — cannot happen here, because the write path takes an explicit connection id and
 * never consults this scope.
 */
export interface CatalogScopeState {
    companyIntegrationID: string;
    /**
     * Set by an owner that warms every object before reading its fields — the sync loop. Inside
     * such a scope a read of a cold object is a missed warm site and throws; everywhere else it
     * answers empty. See {@link RunInWarmedCatalogScope}.
     */
    requireWarmFields?: boolean;
}

const storage = new AsyncLocalStorage<CatalogScopeState>();

// ── The per-connection catalog is supplied per scope (MJ-RUN-43) ────────────────────────────────
//
// It used to be two boot-time CacheLocal datasets in integration-engine-base, which loaded EVERY
// connection's objects AND fields as BaseEntity rows and held them for the process lifetime. On a
// NetForum catalog that is 97,414 field entities and a ~3.8 GB FLOOR on a 4748 MB ceiling, measured
// on an idle process with nothing running (2026-09-19).
//
// Three access patterns were being served by one resident copy, which is why it had to be whole:
//   objects — every consumer walks them; 888 rows, one row each. Cheap. Load them all.
//   edges   — ONLY the dependency sort needs every field, and only 3 columns of each. Load them as
//             plain rows, never entities.
//   fields  — everything else wants ONE object's fields. A row-bounded cache, warmed per object.
//
// Measured shape that sets the bound: 888 objects, avg 117 fields, MAX 2,539. A cache counted in
// OBJECTS worst-cases at ~81k rows when wide objects meet, so the bound is on ROWS. An object being
// read is pinned so it cannot be evicted by its neighbours mid-flight.
//
// Every read below BYPASSES the query cache. These entities' cached answers are not invalidated by
// the writes a discovery makes, so a cached answer taken before a write keeps being served after it
// — on tenants whose cache is shared and external to the process, across restarts as well. That is
// how a first discovery came to see every object as keyless (see CatalogWriter.viewRows), and a
// scope loaded from the cache would freeze a connection's catalog at whatever was read first.

/** Ceiling on the full field rows held for all connections together. Pinned rows may exceed it. */
export const FIELD_ROW_BUDGET = 10_000;
/** Owner ids per edge-set statement. A large catalog is a handful of statements, not one huge one. */
const EDGE_READ_CHUNK = 200;

interface CatalogEntry {
    Objects: BaseEntity[];
    Edges: CatalogDependencyEdge[];
}

interface WarmEntry {
    rows: BaseEntity[];
    /** Normalised id of the connection whose scope warmed it ('' outside a scope). */
    owner: string;
}

const catalogCache = new Map<string, CatalogEntry>();
const catalogLoads = new Map<string, Promise<CatalogEntry>>();
/** Warm field rows by normalised object id. Map order is recency: the first entry is the oldest. */
const fieldCache = new Map<string, WarmEntry>();
/** The same rows as `fieldCache`, in the shape the engine base reads. Kept in step with it. */
const warmRows = new Map<string, BaseEntity[]>();
const fieldLoads = new Map<string, Promise<void>>();
/** Pin COUNTS, not a set: two maps reading one parent each pin it, and one finishing must not unpin the other. */
const pins = new Map<string, number>();
let fieldRowCount = 0;

const TELEMETRY: RunViewParams['Telemetry'] = {
    Exempt: true,
    Reason: 'Per-connection catalog read for the catalog scope; a cached answer predates the writes it must observe',
};

function lit(value: string): string {
    return value.replace(/'/g, "''");
}

function engineUser(): UserInfo {
    // BaseEngine keeps the user it was configured with. Scope entry has no user of its own unless
    // the caller passes one, and must not invent one: a catalog read before Config is a bug, not a
    // condition to paper over.
    const user = IntegrationEngineBase.Instance.ContextUser;
    if (!user) {
        throw new Error('PER_CONNECTION_CATALOG_NO_USER: catalog scope entered before IntegrationEngineBase.Config() and without a context user.');
    }
    return user;
}

/** A workspace with this code but not the migration has nothing to load — and must not try. */
function catalogEntitiesRegistered(): boolean {
    try {
        const md = Metadata.Provider;
        return !!md?.EntityByName(ENTITY_COMPANY_INTEGRATION_OBJECTS) && !!md?.EntityByName(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS);
    } catch {
        return false;
    }
}

async function readRows<T>(params: RunViewParams, user: UserInfo): Promise<T[]> {
    const res = await new RunView().RunView<T>({ ...params, BypassCache: true, Telemetry: TELEMETRY }, user);
    // A failed read is an ERROR, never an empty catalog: [] here reads downstream as "this
    // connection has no objects" or "this object has no columns", on a run that reports success.
    if (!res?.Success) {
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        throw new CompanyIntegrationCatalogReadFailed(params.EntityName ?? '', filter, res?.ErrorMessage ?? 'RunView returned no result');
    }
    return res.Results ?? [];
}

async function readEdges(objectIDs: readonly string[], user: UserInfo): Promise<CatalogDependencyEdge[]> {
    const edges: CatalogDependencyEdge[] = [];
    for (let i = 0; i < objectIDs.length; i += EDGE_READ_CHUNK) {
        const list = objectIDs.slice(i, i + EDGE_READ_CHUNK).map(id => `'${lit(id)}'`).join(',');
        const rows = await readRows<CatalogDependencyEdge>({
            EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
            ExtraFilter: `CompanyIntegrationObjectID IN (${list})`,
            Fields: [...CATALOG_EDGE_COLUMNS],
            ResultType: 'simple',
        }, user);
        for (const r of rows) {
            edges.push({
                ID: String(r.ID),
                CompanyIntegrationObjectID: String(r.CompanyIntegrationObjectID),
                RelatedCompanyIntegrationObjectID: r.RelatedCompanyIntegrationObjectID == null ? null : String(r.RelatedCompanyIntegrationObjectID),
            });
        }
    }
    return edges;
}

async function readCatalog(companyIntegrationID: string, contextUser: UserInfo | undefined): Promise<CatalogEntry> {
    if (!catalogEntitiesRegistered()) return { Objects: [], Edges: [] };
    const user = contextUser ?? engineUser();
    const Objects = await readRows<BaseEntity>({
        EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS,
        ExtraFilter: `CompanyIntegrationID = '${lit(companyIntegrationID)}'`,
        Fields: [...CATALOG_OBJECT_COLUMNS],
        ResultType: 'entity_object',
    }, user);
    // Ids come from the PROJECTION, which reads values through Get(). These entities have no
    // generated subclass, so a loaded row has no `ID` property: `row.ID` is undefined, and an edge
    // filter built from it matches nothing — every dependency edge silently lost. Projecting here
    // also checks the column contract before anything reads the rows.
    const Edges = await readEdges(projectCatalogObjects(Objects).map(o => o.ID), user);
    return { Objects, Edges };
}

async function loadCatalogFor(companyIntegrationID: string, contextUser?: UserInfo): Promise<CatalogEntry> {
    const key = NormalizeUUID(companyIntegrationID);
    const cached = catalogCache.get(key);
    if (cached) return cached;
    const inFlight = catalogLoads.get(key);
    if (inFlight) return inFlight;
    const load: Promise<CatalogEntry> = readCatalog(companyIntegrationID, contextUser)
        .then(entry => {
            // Only the load still registered may fill the cache: an eviction while it was reading
            // means what it read is already stale.
            if (catalogLoads.get(key) === load) catalogCache.set(key, entry);
            return entry;
        })
        .finally(() => {
            if (catalogLoads.get(key) === load) catalogLoads.delete(key);
        });
    catalogLoads.set(key, load);
    return load;
}

/**
 * Load a connection's objects and dependency edges into the scope cache, if they are not already.
 *
 * Every async entry to a catalog scope does this — `WithCatalogScope` at entry, the sync loop at
 * the head of each run — because the getters underneath are synchronous and cannot query.
 */
export async function LoadCatalogScope(companyIntegrationID: string, contextUser?: UserInfo): Promise<void> {
    if (!companyIntegrationID) return;
    await loadCatalogFor(companyIntegrationID, contextUser);
}

function dropFields(key: string): void {
    const entry = fieldCache.get(key);
    if (!entry) return;
    fieldCache.delete(key);
    warmRows.delete(key);
    fieldRowCount -= entry.rows.length;
}

function storeFields(key: string, rows: BaseEntity[], owner: string): void {
    dropFields(key);
    fieldCache.set(key, { rows, owner });
    warmRows.set(key, rows);
    fieldRowCount += rows.length;
}

function evictFieldsToBudget(): void {
    if (fieldRowCount <= FIELD_ROW_BUDGET) return;
    for (const key of [...fieldCache.keys()]) {
        if (fieldRowCount <= FIELD_ROW_BUDGET) break;
        if ((pins.get(key) ?? 0) > 0) continue;
        dropFields(key);
    }
}

function unpinOne(key: string): void {
    const n = pins.get(key) ?? 0;
    if (n <= 1) pins.delete(key);
    else pins.set(key, n - 1);
}

async function readFields(objectID: string, key: string, owner: string, contextUser: UserInfo | undefined): Promise<void> {
    const rows = await readRows<BaseEntity>({
        EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
        ExtraFilter: `CompanyIntegrationObjectID = '${lit(objectID)}'`,
        Fields: [...CATALOG_FIELD_COLUMNS],
        ResultType: 'entity_object',
    }, contextUser ?? engineUser());
    storeFields(key, rows, owner);
    evictFieldsToBudget();
}

/**
 * Warm one object's full field rows before anything reads them synchronously, and PIN them until
 * {@link UnpinCatalogObjects} releases the pin.
 *
 * Called from the async orchestration points that own a scope — the sync loop, per entity map —
 * because the readers (`GetCachedFields`, in connectors this repository does not own) are
 * synchronous and cannot query. Concurrent warms of one object share one read.
 */
export async function WarmCatalogObject(objectID: string, contextUser?: UserInfo): Promise<void> {
    const key = NormalizeUUID(objectID);
    if (!key) return;
    // Pin FIRST, so an eviction triggered by a concurrent warm cannot take the rows between this
    // read finishing and its caller using them.
    pins.set(key, (pins.get(key) ?? 0) + 1);
    try {
        const warm = fieldCache.get(key);
        if (warm) {
            // Refresh recency: the oldest entry is the first evicted.
            fieldCache.delete(key);
            fieldCache.set(key, warm);
            return;
        }
        let load = fieldLoads.get(key);
        if (!load) {
            load = readFields(objectID, key, NormalizeUUID(CurrentCatalogCI()), contextUser)
                .finally(() => fieldLoads.delete(key));
            fieldLoads.set(key, load);
        }
        await load;
    } catch (err) {
        unpinOne(key);
        throw err;
    }
}

/** Release pins taken by {@link WarmCatalogObject}; the rows stay until the budget needs the room. */
export function UnpinCatalogObjects(objectIDs: readonly string[]): void {
    for (const id of objectIDs) unpinOne(NormalizeUUID(id));
    evictFieldsToBudget();
}

/**
 * Drop one connection's objects, edges and warm field rows — or everything, with no argument.
 *
 * Inside an OPEN scope this is not a refresh: the getters are synchronous and cannot reload, so a
 * dropped connection reads as having no catalog of its own and falls back to the shared one until
 * something async loads it again.
 */
export function EvictCatalogScope(companyIntegrationID?: string): void {
    if (!companyIntegrationID) {
        catalogCache.clear();
        catalogLoads.clear();
        fieldCache.clear();
        warmRows.clear();
        fieldLoads.clear();
        pins.clear();
        fieldRowCount = 0;
        return;
    }
    const owner = NormalizeUUID(companyIntegrationID);
    catalogCache.delete(owner);
    catalogLoads.delete(owner);
    for (const [key, entry] of [...fieldCache]) {
        if (entry.owner !== owner) continue;
        dropFields(key);
        pins.delete(key);
    }
}

/** What the field cache holds right now — for diagnostics and run events. */
export function CatalogFieldCacheStats(): { Objects: number; Rows: number; Pinned: number } {
    return { Objects: fieldCache.size, Rows: fieldRowCount, Pinned: pins.size };
}

/** Everything the engine-base getters need for the scope in force, or undefined when it is not loaded. */
function currentCatalogData(): CatalogScopeData | undefined {
    const state = storage.getStore();
    if (!state) return undefined;
    const entry = catalogCache.get(NormalizeUUID(state.companyIntegrationID));
    if (!entry) return undefined;
    return {
        Objects: entry.Objects,
        FieldsByObjectID: warmRows,
        Edges: entry.Edges,
        RequireWarmFields: state.requireWarmFields === true,
    };
}

/** The connection currently in scope, or undefined when there is none. */
export function CurrentCatalogCI(): string | undefined {
    return storage.getStore()?.companyIntegrationID;
}

/**
 * Run `fn` with `companyIntegrationID` in scope.
 *
 * Nesting is allowed and the innermost wins, which is what a batch operation over several
 * connections needs: it enters one scope per connection and each iteration's reads resolve to that
 * connection alone.
 *
 * A synchronous entry cannot load anything: the body reads the connection's catalog only if an
 * async entry has already loaded it, and the shared catalog otherwise. Use {@link WithCatalogScope}
 * when the body reads the catalog.
 */
export function RunInCatalogScope<T>(companyIntegrationID: string, fn: () => T): T {
    if (!companyIntegrationID) return fn();
    return storage.run({ companyIntegrationID }, fn);
}

/**
 * `RunInCatalogScope` for an owner that WARMS every object before reading its fields — the sync
 * loop, which warms each entity map's object (and its parents) before running the map.
 *
 * Inside it, reading an object of this connection whose fields were never warmed throws
 * PER_CONNECTION_CATALOG_OBJECT_COLD instead of answering `[]`, because there a quiet empty answer
 * would show a connector a table with no columns and a sync would write nothing on a run that
 * reports success. Other owners — discovery, the server's own scopes — have no warm sites yet, so
 * their cold reads stay as quiet as they were before the catalog stopped being resident.
 *
 * Like `RunInCatalogScope` it does not load: the owner loads at a point inside its own error
 * handling (the sync loop does it at the head of the run).
 */
export function RunInWarmedCatalogScope<T>(companyIntegrationID: string, fn: () => T): T {
    if (!companyIntegrationID) return fn();
    return storage.run({ companyIntegrationID, requireWarmFields: true }, fn);
}

/**
 * `RunInCatalogScope` for an async body — the ordinary case. Separate so the return type is a
 * promise rather than a promise-shaped generic, which makes a forgotten `await` a type error, and
 * because this is the async boundary: the connection's objects and edges are loaded here, before
 * the body starts, since the synchronous getters underneath cannot query.
 *
 * @param contextUser The user to load as. Defaults to the one the engine was configured with.
 */
export async function WithCatalogScope<T>(companyIntegrationID: string, fn: () => Promise<T>, contextUser?: UserInfo): Promise<T> {
    if (!companyIntegrationID) return fn();
    await loadCatalogFor(companyIntegrationID, contextUser);
    return storage.run({ companyIntegrationID }, fn);
}

/**
 * Run `fn` with NO connection in scope, so its reads see the shared catalog.
 *
 * One deliberate caller: action generation. An Action describes the vendor's API, not one tenant's
 * projection of it, so generating actions from whichever connection happened to be in scope would
 * make the generated surface depend on who ran it. Stated here rather than left implicit, because
 * from inside the generator the shared read looks like an oversight.
 */
export function RunOutsideCatalogScope<T>(fn: () => T): T {
    return storage.exit(fn);
}

/**
 * Install the scope resolvers on the client-safe engine base.
 *
 * Dependency inversion: `integration-engine-base` is bundled into the Angular client and cannot
 * import a Node built-in, so it declares hooks and this package fills them in — which connection
 * is in scope, and that connection's rows. Called at module load, so importing this package is
 * enough — no ordering requirement on callers, and the client never sets them, leaving every read
 * on the shared catalog exactly as before.
 */
export function InstallCatalogScopeResolver(): void {
    IntegrationEngineBase.CatalogScopeResolver = CurrentCatalogCI;
    IntegrationEngineBase.CatalogDataResolver = currentCatalogData;
}

InstallCatalogScopeResolver();
