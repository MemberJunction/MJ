/**
 * query-engine-hydration.ts — QF17, a member of the 'runquery-features' bundle (server transport).
 *
 * `QueryEngine` holds `MJ: Queries` as `MJQueryEntityExtended` objects, and `RunQuery` calls their
 * methods (`UserCanRun`, `GetPlatformSQL`). Two paths hand the engine rows that arrived as JSON, with
 * every field and no methods, and both must turn them back into entity objects:
 *
 *   (a) a cache hit on the engine's own slot, as a node reads it from a shared cache that stores
 *       plain rows (the slot here is written with JSON-round-tripped rows, dates as strings);
 *   (b) another server's cache-change event, whose payload replaces the engine's array.
 *
 * Had either path kept plain objects, every `RunQuery` would fail with
 * `query.UserCanRun is not a function` until the next full reload.
 *
 * Anti-vacuity: each leg marks one row's Description (and, for the event, moves its
 * `__mj_UpdatedAt` so the engine does not skip the payload as already held) and asserts the
 * marker reached the rows read, so a read that never touched the injected rows cannot pass.
 * The engine and the slot are restored in a `finally` (slot invalidated, forced reload).
 */
import { CacheCategory, LocalCacheManager, ProviderBase, ProviderType, RunQuery, RunView } from '@memberjunction/core';
import type { BaseEnginePropertyConfig, CacheChangedEvent, RunViewParams } from '@memberjunction/core';
import { MJQueryEntityExtended, QueryEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

const QUERIES_PROPERTY = '_queries';
/** How long leg (b) waits for the asynchronous event handler to replace the engine's array. */
const EVENT_WAIT_MS = 10000;

/** One `MJ: Queries` row as JSON carries it. */
type PlainRow = Record<string, unknown>;

/** The engine's slot for `MJ: Queries`: its params and fingerprint, built as the engine builds them. */
interface QuerySlot {
    Provider: ProviderBase;
    Params: RunViewParams;
    Fingerprint: string;
}

function queriesConfig(): BaseEnginePropertyConfig {
    const config = QueryEngine.Instance.Configs.find((c) => c.PropertyName === QUERIES_PROPERTY);
    Assert(config != null, `QueryEngine has no '${QUERIES_PROPERTY}' config`);
    return config!;
}

/** The engine's RunView params for the config: the fingerprint-affecting shape `BaseEngine` builds. */
function slotFor(config: BaseEnginePropertyConfig): QuerySlot | null {
    const provider = QueryEngine.Instance.RunViewProviderToUse;
    if (!(provider instanceof ProviderBase)) {
        return null;
    }
    const includeBinary = config.IncludeBinaryFields === 'DatabaseProviderOnly'
        ? provider.ProviderType === ProviderType.Database
        : config.IncludeBinaryFields === true;
    const params: RunViewParams = {
        EntityName: config.EntityName,
        ResultType: config.ResultType || 'entity_object',
        ExtraFilter: config.Filter,
        OrderBy: config.OrderBy,
        IgnoreMaxRows: true,
        CacheLocal: config.CacheLocal,
        ...(includeBinary ? { IncludeBinaryFields: true } : {}),
    };
    return { Provider: provider, Params: params, Fingerprint: provider.ComputeRunViewCacheFingerprint(params, QueryEngine.Instance.ContextUser) };
}

/** The engine's queries as JSON delivers them, with `targetID`'s row marked. */
function plainRowsWithMarker(targetID: string, marker: string, moveUpdatedAt: boolean): PlainRow[] {
    const rows: PlainRow[] = JSON.parse(JSON.stringify(QueryEngine.Instance.Queries.map((q) => q.GetAll())));
    const target = rows.find((r) => UUIDsEqual(String(r.ID), targetID));
    Assert(target != null, 'QF17: the fixture query is not in QueryEngine.Queries');
    target!.Description = marker;
    if (moveUpdatedAt) {
        target!.__mj_UpdatedAt = new Date(new Date(String(target!.__mj_UpdatedAt)).getTime() + 1000).toISOString();
    }
    return rows;
}

function newestUpdatedAt(rows: PlainRow[]): string {
    return rows.map((r) => String(r.__mj_UpdatedAt)).sort().pop() ?? new Date().toISOString();
}

/** Every row is an `MJQueryEntityExtended` whose run check is callable. */
function assertEntityRows(rows: unknown[], label: string): void {
    Assert(rows.length > 0, `QF17 ${label}: no rows`);
    const plain = rows.filter((r) => !(r instanceof MJQueryEntityExtended));
    Assert(plain.length === 0, `QF17 ${label}: ${plain.length} of ${rows.length} rows are not MJQueryEntityExtended instances`);
    const first = rows[0];
    Assert(first instanceof MJQueryEntityExtended && typeof first.UserCanRun === 'function', `QF17 ${label}: UserCanRun is not callable`);
}

/** The Description of row `id`, whether the row is an entity object or a plain record. */
function descriptionOf(rows: unknown[], id: string): string | null {
    for (const row of rows) {
        if (row instanceof MJQueryEntityExtended) {
            if (UUIDsEqual(row.ID, id)) return row.Description;
        } else if (typeof row === 'object' && row !== null && 'ID' in row && UUIDsEqual(String(row.ID), id)) {
            return 'Description' in row ? String(row.Description) : null;
        }
    }
    return null;
}

/** Leg (a): a cache hit served from a slot holding JSON rows returns entity objects. */
async function assertCacheHitHydrates(slot: QuerySlot, targetID: string, tag: string): Promise<void> {
    const marker = `${tag}-cache-hit`;
    const rows = plainRowsWithMarker(targetID, marker, false);
    await LocalCacheManager.Instance.SetRunViewResult(slot.Fingerprint, slot.Params, rows, newestUpdatedAt(rows), undefined, rows.length, slot.Provider);
    const result = await new RunView(slot.Provider).RunView(slot.Params, QueryEngine.Instance.ContextUser);
    Assert(result.Success, `QF17 cache hit: RunView failed: ${result.ErrorMessage}`);
    Assert(descriptionOf(result.Results, targetID) === marker, 'QF17 cache hit: the read was not served from the slot holding the JSON rows');
    assertEntityRows(result.Results, 'cache hit');
}

/** Leg (b): another server's cache-change event leaves the engine holding entity objects. */
async function assertCacheEventHydrates(slot: QuerySlot, targetID: string, tag: string): Promise<void> {
    const marker = `${tag}-event`;
    const rows = plainRowsWithMarker(targetID, marker, true);
    const event: CacheChangedEvent = {
        CacheKey: slot.Fingerprint,
        Category: CacheCategory.RunViewCache,
        Action: 'set',
        Timestamp: Date.now(),
        SourceServerId: 'integration-test-other-server',
        Data: JSON.stringify({ results: rows, totalRowCount: rows.length }),
    };
    LocalCacheManager.Instance.DispatchCacheChange(event);
    const deadline = Date.now() + EVENT_WAIT_MS;
    while (descriptionOf(QueryEngine.Instance.Queries, targetID) !== marker && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    Assert(descriptionOf(QueryEngine.Instance.Queries, targetID) === marker,
        'QF17 cache event: the engine never applied the event payload (no callback registered on the engine slot fingerprint?)');
    assertEntityRows(QueryEngine.Instance.Queries, 'cache event');
}

/**
 * QF17 — `QueryEngine` rows are `MJQueryEntityExtended` instances after a JSON-round-tripped
 * cache hit and after a cross-server cache-change event, and `RunQuery` then succeeds.
 */
export async function CheckQueryEngineRowsStayEntities(ctx: IntegrationCheckContext, queryID: string): Promise<void> {
    await QueryEngine.Instance.Config(false, ctx.User);
    const slot = slotFor(queriesConfig());
    if (!slot || !LocalCacheManager.Instance.IsInitialized) {
        console.warn('  ⚠ runquery-features.QF17 SKIPPED — needs a ProviderBase provider and an initialized LocalCacheManager.');
        return;
    }
    const tag = `it-qf17-${Date.now()}`;
    try {
        await assertCacheHitHydrates(slot, queryID, tag);
        await assertCacheEventHydrates(slot, queryID, tag);
        const run = await new RunQuery().RunQuery({ QueryID: queryID, MaxRows: 1 }, ctx.User);
        Assert(run.Success, `QF17: RunQuery after the cache event failed: ${run.ErrorMessage}`);
    } finally {
        await LocalCacheManager.Instance.InvalidateRunViewResult(slot.Fingerprint);
        await QueryEngine.Instance.Config(true, ctx.User);
    }
}
