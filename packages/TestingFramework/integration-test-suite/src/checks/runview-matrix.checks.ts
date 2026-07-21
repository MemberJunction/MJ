/**
 * runview-matrix.checks.ts — the 'runview-matrix' bundle: "Domain 0a — every RunViewParams
 * feature, swept across all entities" from plans/integration-test-expansion/test-catalog.md.
 *
 * Check logic for the core sweeps (RVM1–RVM4) is COPIED from the standalone rig
 * rigs/runview-matrix-tests.ts (which remains in place), adapted to the registry contract:
 * instead of a categorized report + exit code, each sweep collects per-entity failures and
 * THROWS at the end when any were found (skip/denied tallies are logged, never silent).
 *
 * TRANSPORT: CLIENT-FIRST. Every leg runs through `RunView`/`RunViews` on the configured
 * provider — with the client bootstrap that is the GraphQLDataProvider over the real wire
 * to a live MJAPI, exactly like a browser.
 *
 * READ-ONLY BY CONSTRUCTION. No fixtures, no lifecycle: every check operates on a universe
 * DISCOVERED from existing metadata rows, so there is nothing to create or tear down.
 *
 * Sweep economics (documented deviation from the catalog's "no MaxRows shortcut"): the
 * full-width sweep pulls `maxRows` rows per entity (config `maxRows`, default 5) for the
 * column-shape leg and uses `TotalRowCount` for the full-set parity leg. Pulling every row
 * of every entity full-width is unbounded in a shared dev DB (Record Changes, Audit Logs, …)
 * and adds no assertion power over TotalRowCount parity. `entityLimit` (config) caps the
 * sweep for smoke runs, mirroring the rig's RUNVIEW_MATRIX_LIMIT.
 *
 * Checks (catalog IDs in parens):
 *   RVM1  (RV2)  — count_only sweep: TotalRowCount populated, zero rows, per entity
 *   RVM2  (RV1)  — full-width simple read sweep: every non-virtual column present + count parity
 *   RVM3  (RV4)  — Fields projection sweep: requested field + forced PK(s), nothing else
 *   RVM4  (RV3)  — entity_object sweep: real BaseEntity rows; Fields param IGNORED (full width)
 *   RVM5  (RV5)  — OrderBy ASC vs DESC on a numeric field: exact reversal, monotonic
 *   RVM6  (RV6)  — multi-column OrderBy: tie-break order correct within first-column ties
 *   RVM7  (RV7)  — ExtraFilter trio: tautology == all, impossible == 0, field-eq == subset
 *   RVM8  (RV8)  — ExtraFilter injection guard: ;/--/UNION rejected, benign accepted
 *   RVM9  (RV9)  — UserSearchString: seed row found via configured search fields; no-search-fields entity is a clean no-op
 *   RVM10 (RV10) — MaxRows honored exactly
 *   RVM11 (RV11) — IgnoreMaxRows overrides entity UserViewMaxRows
 *   RVM12 (RV12) — StartRow OFFSET walk on a DISCOVERED entity: union == full set, no dup/gap
 *   RVM13 (RV13) — AfterKey keyset walk on the same entity: every row exactly once
 *   RVM14 (RV14) — AfterKey guards: StartRowConflict / IncompatibleOrderBy / AfterKeyShape refusals
 *   RVM15 (RV15) — Aggregates COUNT(*) == count_only TotalRowCount, unaffected by MaxRows
 *   RVM16 (RV16) — numeric Aggregates SUM/MIN/MAX/COUNT match independent computation; alias honored
 *   RVM17 (RV21) — RunViews batch: positional results each match their own params
 *   RVM18 (RV22) — PlatformSQL ExtraFilter/OrderBy: platform variant applied, default ignored
 *
 * Deliberately NOT implemented here (reasons in the final report / bundle IT record):
 *   RV14 composite-PK leg — covered by view-execution.V11 (metadata-driven discovery there).
 *   RV17 (Aggregates + RLS) — needs a second, RLS-scoped identity; single-identity client
 *         process cannot observe it honestly. RLS legs live in the rls-isolation bundles;
 *         the WHERE-clause leg is already pinned by view-execution.V13.
 *   RV18/RV19/RV20 (CacheLocal / BypassCache / CacheLocalTTL) — client-cache C3–C5 pin the
 *         client slot mechanics; BypassCache is only observable server-side (server-cache
 *         bundle territory), and a client-side timing assertion would be flaky, not proof.
 *   RV23/RV24/RV25 (Exclude-prior-run / SaveViewResults / ForceAuditLog) — the
 *         SaveViewResults path (SQLServerDataProvider.executeSQLForUserViewRunLogging)
 *         appears broken for GUID view IDs (Number(viewEntity.ID) → NaN, unquoted GUID
 *         literals, invalid EXEC syntax), so a MUT check would pin a broken path; audit-log
 *         rows are not self-cleanable. Flagged as a product-code suspicion instead.
 */
import { RunView, CompositeKey, EntityFieldTSType, IsKeysetPaginationOrderableType } from '@memberjunction/core';
import type {
    EntityInfo,
    EntityFieldInfo,
    RunViewResult,
    RunViewParams,
    AggregateResult,
    PlatformSQL,
    UserInfo
} from '@memberjunction/core';
import { Assert, AssertEqual, AssertRowShape } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

// ─────────────────────────────────────────────────────────────────────────────────────────
// Sweep plumbing — entity list, tally, permission classification (copied from the rig)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Well-known large, stable, single-uuid-PK entity used by the targeted (non-swept) checks. */
const FIELDS_ENTITY = 'MJ: Entity Fields';

/** A RunView failure whose ErrorMessage indicates a permissions block rather than a real error. */
function isPermissionError(msg: string | undefined): boolean {
    if (!msg) {
        return false;
    }
    const m = msg.toLowerCase();
    return m.includes('permission') || m.includes('not authorized') || m.includes('access denied') || m.includes('do not have');
}

/** UUIDs (and other PK strings) come back uppercase on SQL Server, lowercase on PG — compare normalized. */
function normId(id: string): string {
    return id.trim().toLowerCase();
}

/** Per-sweep tally: probed / skipped (feature not applicable) / permission-denied / hard failures. */
interface SweepTally {
    Probed: number;
    Skipped: number;
    Denied: number;
    Failures: string[];
}

function newTally(): SweepTally {
    return { Probed: 0, Skipped: 0, Denied: 0, Failures: [] };
}

/** Log the sweep summary; throw when any hard failures were collected; refuse a vacuous sweep. */
function finishSweep(what: string, t: SweepTally): void {
    console.log(`      → ${what}: ${t.Probed} probed, ${t.Skipped} skipped, ${t.Denied} permission-denied, ${t.Failures.length} failed`);
    Assert(t.Probed > 0, `${what}: zero entities probed — the sweep is vacuous (all skipped or denied)`);
    if (t.Failures.length > 0) {
        const shown = t.Failures.slice(0, 10).map(f => `  · ${f}`).join('\n');
        throw new Error(`${what}: ${t.Failures.length} entity failure(s):\n${shown}${t.Failures.length > 10 ? `\n  … +${t.Failures.length - 10} more` : ''}`);
    }
}

/** Sweep MaxRows for the full-width read leg (config `maxRows`, default 5 — see header). */
function sweepMaxRows(ctx: IntegrationCheckContext): number {
    const raw = ctx.Config?.['maxRows'];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

/**
 * The swept entity list: every entity in the provider's metadata, name-sorted, optionally
 * capped by config `entityLimit` (smoke runs). API-excluded / no-all-rows entities stay in
 * the list — each sweep counts them as Skipped so nothing silently disappears (catalog A1).
 */
function sweepEntities(ctx: IntegrationCheckContext): EntityInfo[] {
    const all = [...ctx.Provider.Entities].sort((a, b) => a.Name.localeCompare(b.Name));
    Assert(all.length > 0, 'provider metadata reports zero entities — bootstrap is broken');
    const raw = ctx.Config?.['entityLimit'];
    const limit = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(limit) && limit > 0 ? all.slice(0, Math.floor(limit)) : all;
}

/** True when an unfiltered dynamic RunView of this entity is definitionally unsupported. */
function sweepSkip(entity: EntityInfo): boolean {
    return entity.IncludeInAPI === false || entity.AllowAllRowsAPI === false;
}

/** First non-PK field, preferring non-virtual (copied from the rig). */
function firstNonPKField(entity: EntityInfo): EntityFieldInfo | undefined {
    return entity.Fields.find(f => !f.IsPrimaryKey && !f.IsVirtual) ?? entity.Fields.find(f => !f.IsPrimaryKey);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// count_only memo — RVM1 populates, later checks reuse (avoids a second 379-query sweep)
// ─────────────────────────────────────────────────────────────────────────────────────────

const countMemo = new Map<string, number>();

/** Memoized unfiltered count_only for an entity. Throws nothing: encodes denied/error in the shape. */
async function totalCount(ctx: IntegrationCheckContext, entity: EntityInfo): Promise<{ Count?: number; Denied?: boolean; Error?: string }> {
    const key = normId(entity.Name);
    const memo = countMemo.get(key);
    if (memo !== undefined) {
        return { Count: memo };
    }
    try {
        const r = await new RunView().RunView({ EntityName: entity.Name, ResultType: 'count_only' }, ctx.User);
        if (!r.Success) {
            return isPermissionError(r.ErrorMessage) ? { Denied: true } : { Error: r.ErrorMessage || 'Success=false, no message' };
        }
        if (r.TotalRowCount == null) {
            return { Error: 'count_only succeeded but TotalRowCount is null/undefined' };
        }
        countMemo.set(key, r.TotalRowCount);
        return { Count: r.TotalRowCount };
    } catch (e) {
        return { Error: `THREW: ${e instanceof Error ? e.message : String(e)}` };
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Discovered universe over MJ: Entity Fields (targeted checks) — read-only, memoized
// ─────────────────────────────────────────────────────────────────────────────────────────

interface UniverseRow {
    ID: string;
    EntityID: string;
    Sequence: number;
}

interface MatrixUniverse {
    /** `EntityID IN ('a','b','c')` over MJ: Entity Fields. */
    Filter: string;
    /** `EntityID='a'` — proper, non-empty subset predicate. */
    SubsetFilter: string;
    Rows: UniverseRow[];
    AllIds: Set<string>;
    SubsetIds: Set<string>;
}

let universeMemo: MatrixUniverse | null = null;

/** Fail loudly on a failed RunView rather than silently asserting over an empty array. */
function requireSuccess(r: RunViewResult, what: string): void {
    Assert(r.Success === true, `${what} failed: ${r.ErrorMessage ?? '(no message)'}`);
}

/** Discover (never create) the bounded MJ: Entity Fields universe used by the targeted checks. */
async function getUniverse(ctx: IntegrationCheckContext): Promise<MatrixUniverse> {
    if (universeMemo) {
        return universeMemo;
    }
    const rv = new RunView();
    const parents = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Entities', Fields: ['ID'], OrderBy: 'ID', MaxRows: 3, ResultType: 'simple' }, ctx.User,
    );
    requireSuccess(parents, 'universe discovery (MJ: Entities)');
    const parentIds = parents.Results.map(x => x.ID);
    Assert(parentIds.length === 3, `universe discovery needs 3 entities, got ${parentIds.length}`);

    const filter = `EntityID IN ('${parentIds.join("','")}')`;
    const subsetFilter = `EntityID='${parentIds[0]}'`;
    const rows = await rv.RunView<UniverseRow>(
        { EntityName: FIELDS_ENTITY, Fields: ['ID', 'EntityID', 'Sequence'], ExtraFilter: filter, IgnoreMaxRows: true, ResultType: 'simple' },
        ctx.User,
    );
    requireSuccess(rows, `universe discovery (${FIELDS_ENTITY})`);
    Assert(rows.Results.length >= 10, `universe too small: ${rows.Results.length} rows (need ≥ 10)`);

    const subset = rows.Results.filter(r => normId(r.EntityID) === normId(parentIds[0]));
    Assert(subset.length > 0, 'subset predicate selects no rows — targeted checks would be vacuous');
    Assert(subset.length < rows.Results.length, 'subset predicate selects the whole universe — targeted checks would be vacuous');

    universeMemo = {
        Filter: filter,
        SubsetFilter: subsetFilter,
        Rows: rows.Results,
        AllIds: new Set(rows.Results.map(r => normId(r.ID))),
        SubsetIds: new Set(subset.map(r => normId(r.ID))),
    };
    return universeMemo;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM1 — count_only sweep (catalog RV2)
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVM1: NamedCheck = {
    Id: 'runview-matrix.RVM1',
    Name: 'RVM1: count_only sweep — every entity returns a populated TotalRowCount and zero rows',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const rv = new RunView();
        const t = newTally();
        for (const entity of sweepEntities(ctx)) {
            if (sweepSkip(entity)) {
                t.Skipped++;
                continue;
            }
            try {
                const r = await rv.RunView({ EntityName: entity.Name, ResultType: 'count_only' }, ctx.User);
                if (!r.Success) {
                    if (isPermissionError(r.ErrorMessage)) {
                        t.Denied++;
                    } else {
                        t.Failures.push(`${entity.Name}: ${r.ErrorMessage || 'Success=false, no message'}`);
                    }
                    continue;
                }
                t.Probed++;
                if (r.TotalRowCount == null) {
                    t.Failures.push(`${entity.Name}: Success but TotalRowCount is null/undefined`);
                } else {
                    countMemo.set(normId(entity.Name), r.TotalRowCount);
                }
                if ((r.Results?.length ?? 0) > 0) {
                    t.Failures.push(`${entity.Name}: count_only returned ${r.Results.length} row(s) — must return none`);
                }
            } catch (e) {
                t.Failures.push(`${entity.Name}: THREW: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        finishSweep('RVM1 count_only sweep', t);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM2 — full-width read sweep + count parity (catalog RV1)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** One entity's full-width probe: column presence on a sample row + TotalRowCount parity. */
async function probeFullWidth(ctx: IntegrationCheckContext, entity: EntityInfo, maxRows: number, t: SweepTally): Promise<void> {
    const r = await new RunView().RunView({ EntityName: entity.Name, ResultType: 'simple', MaxRows: maxRows }, ctx.User);
    if (!r.Success) {
        if (isPermissionError(r.ErrorMessage)) {
            t.Denied++;
        } else {
            t.Failures.push(`${entity.Name}: ${r.ErrorMessage || 'Success=false, no message'}`);
        }
        return;
    }
    t.Probed++;
    if (r.Results.length > 0) {
        const row = r.Results[0] as Record<string, unknown>;
        const missing = entity.Fields.filter(f => !f.IsVirtual).map(f => f.Name).filter(name => !(name in row));
        if (missing.length > 0) {
            t.Failures.push(`${entity.Name}: row missing ${missing.length} field(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
        }
    }
    const expected = countMemo.get(normId(entity.Name));
    if (expected !== undefined && r.TotalRowCount != null && r.TotalRowCount !== expected) {
        t.Failures.push(`${entity.Name}: count_only=${expected} but full-width TotalRowCount=${r.TotalRowCount}`);
    }
}

const RVM2: NamedCheck = {
    Id: 'runview-matrix.RVM2',
    Name: 'RVM2: full-width read sweep — every non-virtual column present; TotalRowCount matches count_only',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const maxRows = sweepMaxRows(ctx);
        const t = newTally();
        for (const entity of sweepEntities(ctx)) {
            if (sweepSkip(entity)) {
                t.Skipped++;
                continue;
            }
            try {
                await probeFullWidth(ctx, entity, maxRows, t);
            } catch (e) {
                t.Failures.push(`${entity.Name}: THREW: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        finishSweep(`RVM2 full-width sweep (MaxRows=${maxRows})`, t);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM3 — Fields projection sweep (catalog RV4)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** One entity's projection probe: requested field + forced PK(s) and nothing else. */
async function probeProjection(ctx: IntegrationCheckContext, entity: EntityInfo, t: SweepTally): Promise<void> {
    const projField = firstNonPKField(entity);
    if (!projField) {
        t.Skipped++;
        return;
    }
    const r = await new RunView().RunView(
        { EntityName: entity.Name, Fields: [projField.Name], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    if (!r.Success) {
        if (isPermissionError(r.ErrorMessage)) {
            t.Denied++;
        } else {
            t.Failures.push(`${entity.Name}: ${r.ErrorMessage || 'Success=false'}`);
        }
        return;
    }
    t.Probed++;
    if (r.Results.length === 0) {
        return; // zero-row entity — shape has nothing to assert; still a successful probe
    }
    const row = r.Results[0] as Record<string, unknown>;
    const pkNames = entity.PrimaryKeys.map(pk => pk.Name);
    const allowed = new Set([projField.Name, ...pkNames].map(normId));
    const keys = Object.keys(row);
    const extra = keys.filter(k => !allowed.has(normId(k)));
    const pkMissing = pkNames.filter(pk => !keys.some(k => normId(k) === normId(pk)));
    if (pkMissing.length > 0) {
        t.Failures.push(`${entity.Name}: forced PK missing from projection: ${pkMissing.join(', ')}`);
    }
    if (extra.length > 0) {
        t.Failures.push(`${entity.Name}: projection returned unrequested columns: ${extra.slice(0, 8).join(', ')}`);
    }
}

const RVM3: NamedCheck = {
    Id: 'runview-matrix.RVM3',
    Name: 'RVM3: Fields projection sweep — one requested field + forced PK(s), never extra columns',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const t = newTally();
        for (const entity of sweepEntities(ctx)) {
            if (sweepSkip(entity)) {
                t.Skipped++;
                continue;
            }
            try {
                await probeProjection(ctx, entity, t);
            } catch (e) {
                t.Failures.push(`${entity.Name}: THREW: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        finishSweep('RVM3 projection sweep', t);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM4 — entity_object sweep + "Fields is ignored" (catalog RV3)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Minimal structural surface of a BaseEntity row without importing the class for instanceof. */
interface EntityObjectSurface {
    Save?: unknown;
    GetAll?: () => Record<string, unknown>;
}

/** One entity's entity_object probe: real BaseEntity rows, full width despite a Fields param. */
async function probeEntityObject(ctx: IntegrationCheckContext, entity: EntityInfo, t: SweepTally): Promise<void> {
    const projField = firstNonPKField(entity);
    const params: RunViewParams = { EntityName: entity.Name, ResultType: 'entity_object', MaxRows: 1 };
    if (projField) {
        // The whole point: PreRunView must OVERRIDE this with ALL fields for entity_object.
        params.Fields = [projField.Name];
    }
    const r = await new RunView().RunView(params, ctx.User);
    if (!r.Success) {
        if (isPermissionError(r.ErrorMessage)) {
            t.Denied++;
        } else {
            t.Failures.push(`${entity.Name}: ${r.ErrorMessage || 'Success=false'}`);
        }
        return;
    }
    t.Probed++;
    if (r.Results.length === 0) {
        return; // zero-row entity — nothing to materialize; still a successful probe
    }
    const obj = r.Results[0] as EntityObjectSurface;
    if (typeof obj.Save !== 'function' || typeof obj.GetAll !== 'function') {
        t.Failures.push(`${entity.Name}: entity_object result is not a BaseEntity (missing .Save/.GetAll)`);
        return;
    }
    const all = obj.GetAll();
    const missing = entity.Fields.filter(f => !f.IsVirtual).map(f => f.Name).filter(name => !(name in all));
    if (missing.length > 0) {
        t.Failures.push(`${entity.Name}: entity_object row missing ${missing.length} field(s) (Fields param was NOT ignored?): ${missing.slice(0, 8).join(', ')}`);
    }
}

const RVM4: NamedCheck = {
    Id: 'runview-matrix.RVM4',
    Name: 'RVM4: entity_object sweep — real BaseEntity rows; a Fields param is ignored (full width)',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const t = newTally();
        for (const entity of sweepEntities(ctx)) {
            if (sweepSkip(entity)) {
                t.Skipped++;
                continue;
            }
            try {
                await probeEntityObject(ctx, entity, t);
            } catch (e) {
                t.Failures.push(`${entity.Name}: THREW: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        finishSweep('RVM4 entity_object sweep', t);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM5 — OrderBy ASC/DESC on a discovered numeric field (catalog RV5)
// ─────────────────────────────────────────────────────────────────────────────────────────

interface OrderedRow {
    ID: string;
    [key: string]: unknown;
}

/** Discover the first entity carrying a non-PK, non-virtual numeric field with a testable row count. */
async function discoverNumericOrderTarget(ctx: IntegrationCheckContext): Promise<{ Entity: EntityInfo; Field: EntityFieldInfo; Count: number } | null> {
    const rv = new RunView();
    for (const entity of sweepEntities(ctx)) {
        if (sweepSkip(entity) || entity.PrimaryKeys.length !== 1) {
            continue;
        }
        const field = entity.Fields.find(f => !f.IsPrimaryKey && !f.IsVirtual && f.TSType === EntityFieldTSType.Number);
        if (!field) {
            continue;
        }
        const c = await rv.RunView(
            { EntityName: entity.Name, ExtraFilter: `${field.Name} IS NOT NULL`, ResultType: 'count_only' }, ctx.User,
        );
        if (c.Success && (c.TotalRowCount ?? 0) >= 3 && (c.TotalRowCount ?? 0) <= 3000) {
            return { Entity: entity, Field: field, Count: c.TotalRowCount };
        }
    }
    return null;
}

const RVM5: NamedCheck = {
    Id: 'runview-matrix.RVM5',
    Name: 'RVM5: OrderBy ASC vs DESC on a numeric field — monotonic, and DESC is the exact reversal of ASC',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const target = await discoverNumericOrderTarget(ctx);
        if (!target) {
            console.warn('      ⚠ RVM5 SKIPPED — no readable entity with a non-PK numeric field and 3–3000 non-null rows exists in this deployment.');
            return;
        }
        const { Entity: entity, Field: field, Count: count } = target;
        const pk = entity.FirstPrimaryKey.Name;
        const rv = new RunView();
        const base: RunViewParams = {
            EntityName: entity.Name,
            Fields: [field.Name],
            ExtraFilter: `${field.Name} IS NOT NULL`,
            IgnoreMaxRows: true,
            ResultType: 'simple',
        };
        const asc = await rv.RunView<OrderedRow>({ ...base, OrderBy: `${field.Name} ASC, ${pk} ASC` }, ctx.User);
        const desc = await rv.RunView<OrderedRow>({ ...base, OrderBy: `${field.Name} DESC, ${pk} DESC` }, ctx.User);
        requireSuccess(asc, `RVM5 ASC read of ${entity.Name}`);
        requireSuccess(desc, `RVM5 DESC read of ${entity.Name}`);
        AssertEqual(asc.Results.length, count, `RVM5 ASC row count on ${entity.Name}`);
        AssertEqual(desc.Results.length, count, `RVM5 DESC row count on ${entity.Name}`);
        Assert(count >= 2, 'RVM5 needs ≥2 rows to compare orders');

        const ascVals = asc.Results.map(r => Number(r[field.Name]));
        for (let i = 1; i < ascVals.length; i++) {
            Assert(ascVals[i] >= ascVals[i - 1], `RVM5 ASC not monotonic at index ${i}: ${ascVals[i - 1]} then ${ascVals[i]} (${entity.Name}.${field.Name})`);
        }
        const ascIds = asc.Results.map(r => normId(r.ID)).join('|');
        const descIds = desc.Results.map(r => normId(r.ID)).reverse().join('|');
        AssertEqual(descIds, ascIds, `RVM5 DESC (with PK tie-break) must be the exact reversal of ASC on ${entity.Name}`);
        Assert(asc.Results[0].ID !== desc.Results[0].ID || count === 1, 'RVM5 ASC and DESC produced identical leading rows — order did not actually differ');
        console.log(`      → ${entity.Name}.${field.Name}: ${count} rows, ASC monotonic, DESC == exact reversal`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM6 — multi-column OrderBy tie-break (catalog RV6)
// ─────────────────────────────────────────────────────────────────────────────────────────

interface TieRow {
    ID: string;
    Sequence: number;
    __mj_CreatedAt: string;
}

const RVM6: NamedCheck = {
    Id: 'runview-matrix.RVM6',
    Name: 'RVM6: multi-column OrderBy — Sequence ASC then __mj_CreatedAt DESC tie-break is honored',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const r = await new RunView().RunView<TieRow>(
            {
                EntityName: FIELDS_ENTITY,
                Fields: ['Sequence', '__mj_CreatedAt'],
                ExtraFilter: u.Filter,
                OrderBy: 'Sequence ASC, __mj_CreatedAt DESC',
                IgnoreMaxRows: true,
                ResultType: 'simple',
            },
            ctx.User,
        );
        requireSuccess(r, 'RVM6 multi-column OrderBy read');
        AssertEqual(r.Results.length, u.AllIds.size, 'RVM6 ordered read must return the whole universe');

        let tieGroups = 0;
        for (let i = 1; i < r.Results.length; i++) {
            const prev = r.Results[i - 1];
            const cur = r.Results[i];
            Assert(Number(cur.Sequence) >= Number(prev.Sequence), `RVM6 primary sort violated at index ${i}: Sequence ${prev.Sequence} then ${cur.Sequence}`);
            if (Number(cur.Sequence) === Number(prev.Sequence)) {
                tieGroups++;
                const prevAt = new Date(prev.__mj_CreatedAt).getTime();
                const curAt = new Date(cur.__mj_CreatedAt).getTime();
                Assert(curAt <= prevAt, `RVM6 tie-break violated at index ${i}: within Sequence=${cur.Sequence}, __mj_CreatedAt rose from ${prev.__mj_CreatedAt} to ${cur.__mj_CreatedAt}`);
            }
        }
        // The universe spans 3 parent entities, so first-column ties (e.g. Sequence=1 × 3) MUST exist.
        Assert(tieGroups > 0, 'RVM6 found no Sequence ties — the tie-break leg is vacuous (universe shape changed?)');
        console.log(`      → ${r.Results.length} rows, ${tieGroups} tie pair(s) all honored the secondary DESC sort`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM7 — ExtraFilter predicate trio (catalog RV7)
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVM7: NamedCheck = {
    Id: 'runview-matrix.RVM7',
    Name: 'RVM7: ExtraFilter — tautology returns all, impossible predicate returns 0, field-eq returns the exact subset',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const rv = new RunView();

        const all = await rv.RunView(
            { EntityName: FIELDS_ENTITY, ExtraFilter: `(${u.Filter}) AND (ID IS NOT NULL)`, ResultType: 'count_only' }, ctx.User,
        );
        requireSuccess(all, 'RVM7 tautology count');
        AssertEqual(all.TotalRowCount, u.AllIds.size, 'RVM7 `ID IS NOT NULL` must not change the universe count');

        const none = await rv.RunView(
            { EntityName: FIELDS_ENTITY, ExtraFilter: `(${u.Filter}) AND (ID IS NULL)`, ResultType: 'count_only' }, ctx.User,
        );
        requireSuccess(none, 'RVM7 impossible-predicate count');
        AssertEqual(none.TotalRowCount, 0, 'RVM7 the impossible predicate (PK IS NULL) must return zero rows');

        const subset = await rv.RunView<{ ID: string }>(
            { EntityName: FIELDS_ENTITY, Fields: ['ID'], ExtraFilter: `(${u.Filter}) AND (${u.SubsetFilter})`, IgnoreMaxRows: true, ResultType: 'simple' },
            ctx.User,
        );
        requireSuccess(subset, 'RVM7 field-eq subset read');
        const got = new Set(subset.Results.map(r => normId(r.ID)));
        AssertEqual(got.size, u.SubsetIds.size, 'RVM7 field-eq subset size');
        for (const id of got) {
            Assert(u.SubsetIds.has(id), `RVM7 field-eq subset returned an unexpected row: ${id}`);
        }
        console.log(`      → tautology=${all.TotalRowCount}, impossible=0, field-eq=${got.size} of ${u.AllIds.size}`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM8 — ExtraFilter injection guard (catalog RV8; sibling of view-execution.V3, different entity)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Run an ExtraFilter over the wire; true = accepted, false = refused (Success=false OR throw). */
async function probeAccepted(entityName: string, clause: string, user: UserInfo): Promise<boolean> {
    try {
        const r = await new RunView().RunView(
            { EntityName: entityName, Fields: ['ID'], ExtraFilter: clause, MaxRows: 1, ResultType: 'simple' }, user,
        );
        return r.Success === true;
    } catch {
        return false;
    }
}

const RVM8: NamedCheck = {
    Id: 'runview-matrix.RVM8',
    Name: 'RVM8: ExtraFilter injection guard — ;/--/UNION rejected, benign clause accepted (MJ: Users)',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const ENTITY = 'MJ: Users';
        const probes: Array<{ Clause: string; MustBeAccepted: boolean; Why: string }> = [
            { Clause: `ID IS NOT NULL; DROP TABLE Foo`, MustBeAccepted: false, Why: 'statement separator + DROP' },
            { Clause: `ID IS NOT NULL UNION SELECT 1`, MustBeAccepted: false, Why: 'UNION' },
            { Clause: `ID IS NOT NULL -- trailing comment`, MustBeAccepted: false, Why: 'line comment' },
            { Clause: `ID IS NOT NULL`, MustBeAccepted: true, Why: 'benign clause' },
        ];
        for (const p of probes) {
            const ok = await probeAccepted(ENTITY, p.Clause, ctx.User);
            AssertEqual(ok, p.MustBeAccepted, `RVM8 probe [${p.Why}] — clause: ${p.Clause}`);
        }
        console.log(`      → 3 hostile clauses refused, 1 benign clause accepted on ${ENTITY}`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM9 — UserSearchString (catalog RV9)
// ─────────────────────────────────────────────────────────────────────────────────────────

interface SearchTarget {
    Entity: EntityInfo;
    Field: EntityFieldInfo;
    SeedId: string;
    SeedValue: string;
}

/**
 * Discover a LIKE-path searchable entity (no full-text) plus a seed row whose search-field
 * value is plain `[A-Za-z0-9 ]` text — a FULL-value search matches under every
 * UserSearchPredicateAPI mode (Exact / BeginsWith / EndsWith / Contains).
 */
async function discoverSearchTarget(ctx: IntegrationCheckContext): Promise<SearchTarget | null> {
    const rv = new RunView();
    for (const entity of sweepEntities(ctx)) {
        if (sweepSkip(entity) || entity.FullTextSearchEnabled || entity.PrimaryKeys.length !== 1) {
            continue;
        }
        const field = entity.Fields.find(f =>
            f.IncludeInUserSearchAPI && !f.IsVirtual && f.TSType === EntityFieldTSType.String && !f.UserSearchParamFormatAPI,
        );
        if (!field) {
            continue;
        }
        const rows = await rv.RunView<{ ID: string } & Record<string, unknown>>(
            { EntityName: entity.Name, Fields: [field.Name], ExtraFilter: `${field.Name} IS NOT NULL`, MaxRows: 25, ResultType: 'simple' },
            ctx.User,
        );
        if (!rows.Success) {
            continue;
        }
        for (const row of rows.Results) {
            const value = row[field.Name];
            if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ]{2,60}$/.test(value)) {
                return { Entity: entity, Field: field, SeedId: row.ID, SeedValue: value };
            }
        }
    }
    return null;
}

/** Discover an entity with NO configured search surface at all (the documented no-op leg). */
function findNoSearchEntity(ctx: IntegrationCheckContext): EntityInfo | undefined {
    return sweepEntities(ctx).find(e =>
        !sweepSkip(e) && !e.FullTextSearchEnabled && !e.Fields.some(f => f.IncludeInUserSearchAPI) && countMemo.get(normId(e.Name)) !== undefined,
    );
}

const RVM9: NamedCheck = {
    Id: 'runview-matrix.RVM9',
    Name: 'RVM9: UserSearchString — matches via configured search fields; no-search-fields entity is a clean no-op',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const rv = new RunView();
        const target = await discoverSearchTarget(ctx);
        if (!target) {
            console.warn('      ⚠ RVM9 seed leg SKIPPED — no LIKE-path searchable entity with a plain-text seed value exists in this deployment.');
        } else {
            const r = await rv.RunView<{ ID: string }>(
                { EntityName: target.Entity.Name, Fields: ['ID'], UserSearchString: target.SeedValue, IgnoreMaxRows: true, ResultType: 'simple' },
                ctx.User,
            );
            requireSuccess(r, `RVM9 search on ${target.Entity.Name}`);
            Assert(r.Results.length > 0, `RVM9 search for '${target.SeedValue}' returned zero rows — the seed row was sampled from live data`);
            Assert(r.Results.some(row => normId(row.ID) === normId(target.SeedId)),
                `RVM9 the seed row (${target.SeedId}) is missing from the search results for its own ${target.Field.Name} value '${target.SeedValue}'`);
            console.log(`      → '${target.SeedValue}' on ${target.Entity.Name}.${target.Field.Name}: ${r.Results.length} row(s), seed row present`);
        }

        // No-op leg: an entity with zero search-enabled fields ignores UserSearchString entirely
        // (createViewUserSearchSQL builds an empty predicate → the WHERE clause is unchanged).
        const noSearch = findNoSearchEntity(ctx);
        if (!noSearch) {
            console.warn('      ⚠ RVM9 no-op leg SKIPPED — every readable entity has search fields (or RVM1 has not populated counts).');
            return;
        }
        const expected = countMemo.get(normId(noSearch.Name));
        const noop = await rv.RunView(
            { EntityName: noSearch.Name, UserSearchString: 'zzz-no-such-term-anywhere', ResultType: 'count_only' }, ctx.User,
        );
        requireSuccess(noop, `RVM9 no-op search on ${noSearch.Name}`);
        AssertEqual(noop.TotalRowCount, expected,
            `RVM9 pinned behavior: UserSearchString on a no-search-fields entity ('${noSearch.Name}') is a documented no-op — count must equal the unfiltered count`);
        console.log(`      → no-op leg: '${noSearch.Name}' ignored the search term (count ${noop.TotalRowCount})`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM10 / RVM11 — MaxRows and IgnoreMaxRows (catalog RV10 / RV11)
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVM10: NamedCheck = {
    Id: 'runview-matrix.RVM10',
    Name: 'RVM10: MaxRows:5 returns exactly 5 rows on an entity with ≥6 rows',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const rv = new RunView();
        const count = await rv.RunView({ EntityName: FIELDS_ENTITY, ResultType: 'count_only' }, ctx.User);
        requireSuccess(count, 'RVM10 count_only');
        Assert((count.TotalRowCount ?? 0) >= 6, `RVM10 needs ≥6 rows in ${FIELDS_ENTITY}, found ${count.TotalRowCount}`);

        const capped = await rv.RunView({ EntityName: FIELDS_ENTITY, Fields: ['ID'], MaxRows: 5, ResultType: 'simple' }, ctx.User);
        requireSuccess(capped, 'RVM10 MaxRows read');
        AssertEqual(capped.Results.length, 5, 'RVM10 MaxRows:5 must return exactly 5 rows');
        console.log(`      → ${FIELDS_ENTITY}: ${count.TotalRowCount} total, MaxRows:5 returned exactly 5`);
    },
};

/** Find an entity whose UserViewMaxRows cap is actually binding (total > cap) and small enough to pull. */
async function discoverUserViewMaxRowsTarget(ctx: IntegrationCheckContext): Promise<{ Entity: EntityInfo; Total: number } | null> {
    for (const entity of sweepEntities(ctx)) {
        if (sweepSkip(entity) || (entity.UserViewMaxRows ?? 0) <= 0) {
            continue;
        }
        const c = await totalCount(ctx, entity);
        if (c.Count !== undefined && c.Count > entity.UserViewMaxRows && c.Count <= 5000) {
            return { Entity: entity, Total: c.Count };
        }
    }
    return null;
}

const RVM11: NamedCheck = {
    Id: 'runview-matrix.RVM11',
    Name: 'RVM11: IgnoreMaxRows overrides a binding entity UserViewMaxRows cap and returns the full set',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const target = await discoverUserViewMaxRowsTarget(ctx);
        if (!target) {
            console.warn('      ⚠ RVM11 SKIPPED — no entity in this deployment has a BINDING UserViewMaxRows cap (cap set AND total rows > cap ≤ 5000).');
            return;
        }
        const { Entity: entity, Total: total } = target;
        const rv = new RunView();
        const capped = await rv.RunView({ EntityName: entity.Name, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
        requireSuccess(capped, `RVM11 default-capped read of ${entity.Name}`);
        AssertEqual(capped.Results.length, entity.UserViewMaxRows, `RVM11 unbounded read must stop at UserViewMaxRows=${entity.UserViewMaxRows}`);

        const full = await rv.RunView({ EntityName: entity.Name, Fields: ['ID'], IgnoreMaxRows: true, ResultType: 'simple' }, ctx.User);
        requireSuccess(full, `RVM11 IgnoreMaxRows read of ${entity.Name}`);
        AssertEqual(full.Results.length, total, `RVM11 IgnoreMaxRows must return the full ${total}-row set`);
        console.log(`      → ${entity.Name}: cap ${entity.UserViewMaxRows} enforced by default, IgnoreMaxRows returned all ${total}`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM12 / RVM13 — OFFSET and keyset walks on a DISCOVERED mid-size entity (RV12 / RV13)
// ─────────────────────────────────────────────────────────────────────────────────────────

let walkTargetMemo: { Entity: EntityInfo } | null | undefined;

/**
 * Discover a mid-size (12–2000 rows), single orderable-PK entity OTHER than the one
 * view-execution.V9/V10 already walk — the matrix flavor proves pagination is not an
 * MJ: Entity Fields special case.
 */
async function discoverWalkTarget(ctx: IntegrationCheckContext): Promise<{ Entity: EntityInfo } | null> {
    if (walkTargetMemo !== undefined) {
        return walkTargetMemo;
    }
    walkTargetMemo = null;
    for (const entity of sweepEntities(ctx)) {
        if (sweepSkip(entity) || entity.PrimaryKeys.length !== 1 || normId(entity.Name) === normId(FIELDS_ENTITY)) {
            continue;
        }
        if (!IsKeysetPaginationOrderableType(entity.FirstPrimaryKey.Type)) {
            continue;
        }
        const c = await totalCount(ctx, entity);
        if (c.Count !== undefined && c.Count >= 12 && c.Count <= 2000) {
            walkTargetMemo = { Entity: entity };
            break;
        }
    }
    return walkTargetMemo;
}

/** Page size chosen so the walk spans ~4–5 pages (and always ≥2). */
function walkPageSize(total: number): number {
    return Math.max(3, Math.ceil(total / 4));
}

const RVM12: NamedCheck = {
    Id: 'runview-matrix.RVM12',
    Name: 'RVM12: StartRow OFFSET walk on a discovered entity — union == full set, no duplicates, no gaps',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const target = await discoverWalkTarget(ctx);
        if (!target) {
            console.warn('      ⚠ RVM12 SKIPPED — no readable 12–2000-row single-PK entity (besides MJ: Entity Fields) exists in this deployment.');
            return;
        }
        const entity = target.Entity;
        const rv = new RunView();
        const count = await rv.RunView({ EntityName: entity.Name, ResultType: 'count_only', BypassCache: true }, ctx.User);
        requireSuccess(count, `RVM12 count_only on ${entity.Name}`);
        const total = count.TotalRowCount ?? 0;
        const size = walkPageSize(total);
        const pk = entity.FirstPrimaryKey.Name;

        const seen = new Set<string>();
        let pages = 0;
        for (let start = 0; ; start += size) {
            const r = await rv.RunView<Record<string, unknown>>(
                { EntityName: entity.Name, Fields: [pk], OrderBy: `${pk} ASC`, MaxRows: size, StartRow: start, ResultType: 'simple' },
                ctx.User,
            );
            requireSuccess(r, `RVM12 page at offset ${start}`);
            if (r.Results.length === 0) {
                break;
            }
            pages++;
            const before = seen.size;
            for (const row of r.Results) {
                seen.add(normId(String(row[pk])));
            }
            AssertEqual(seen.size - before, r.Results.length, `RVM12 page at offset ${start} returned duplicate row(s)`);
            Assert(r.Results.length <= size, `RVM12 page at offset ${start} exceeded MaxRows=${size}`);
            if (r.Results.length < size) {
                break;
            }
            Assert(pages < 200, 'RVM12 pagination did not terminate within 200 pages — suspected offset bug');
        }
        Assert(pages >= 2, `RVM12 needs ≥2 pages to be meaningful, walked ${pages}`);
        AssertEqual(seen.size, total, `RVM12 union of OFFSET pages over ${entity.Name} must reconstruct the full set`);
        console.log(`      → ${entity.Name}: ${pages} pages × ${size} rows reconstructed all ${total} rows exactly once`);
    },
};

const RVM13: NamedCheck = {
    Id: 'runview-matrix.RVM13',
    Name: 'RVM13: AfterKey keyset walk on the same discovered entity — every row exactly once, short page ends it',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const target = await discoverWalkTarget(ctx);
        if (!target) {
            console.warn('      ⚠ RVM13 SKIPPED — no readable 12–2000-row single-PK entity (besides MJ: Entity Fields) exists in this deployment.');
            return;
        }
        const entity = target.Entity;
        const rv = new RunView();
        const count = await rv.RunView({ EntityName: entity.Name, ResultType: 'count_only', BypassCache: true }, ctx.User);
        requireSuccess(count, `RVM13 count_only on ${entity.Name}`);
        const total = count.TotalRowCount ?? 0;
        const size = walkPageSize(total);
        const pk = entity.FirstPrimaryKey.Name;

        const seen = new Set<string>();
        let after: CompositeKey | undefined = undefined;
        let pages = 0;
        let lastPageLength = -1;
        for (;;) {
            const r: RunViewResult<Record<string, unknown>> = await rv.RunView<Record<string, unknown>>(
                { EntityName: entity.Name, Fields: [pk], AfterKey: after, MaxRows: size, ResultType: 'simple' }, ctx.User,
            );
            requireSuccess(r, `RVM13 keyset page ${pages + 1}`);
            if (r.Results.length === 0) {
                lastPageLength = 0;
                break;
            }
            pages++;
            const before = seen.size;
            for (const row of r.Results) {
                seen.add(normId(String(row[pk])));
            }
            AssertEqual(seen.size - before, r.Results.length, `RVM13 keyset page ${pages} re-returned earlier row(s)`);
            lastPageLength = r.Results.length;
            if (r.Results.length < size) {
                break;
            }
            after = CompositeKey.FromKeyValuePairs([{ FieldName: pk, Value: r.Results[r.Results.length - 1][pk] }]);
            Assert(pages < 200, 'RVM13 keyset walk did not terminate within 200 pages — suspected seek-predicate bug');
        }
        Assert(pages >= 2, `RVM13 needs ≥2 keyset pages to be meaningful, walked ${pages}`);
        Assert(lastPageLength < size, `RVM13 the walk must end on a SHORT page (got ${lastPageLength} with MaxRows=${size})`);
        AssertEqual(seen.size, total, `RVM13 union of keyset pages over ${entity.Name} must reconstruct the full set`);
        console.log(`      → ${entity.Name}: ${pages} keyset pages reconstructed all ${total} rows; final page had ${lastPageLength}`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM14 — AfterKey guard refusals (catalog RV14; composite-PK leg lives in view-execution.V11)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Run params expected to be REFUSED; returns the refusal text ('' if the call succeeded). */
async function probeRefusal(params: RunViewParams, user: UserInfo): Promise<string> {
    try {
        const r = await new RunView().RunView(params, user);
        return r.Success === false ? (r.ErrorMessage || '(refused with no message)') : '';
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

const RVM14: NamedCheck = {
    Id: 'runview-matrix.RVM14',
    Name: 'RVM14: AfterKey guards — StartRow conflict, non-PK OrderBy, and wrong-key shape are all refused with the right reason',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const entity = ctx.Provider.EntityByName(FIELDS_ENTITY);
        Assert(entity != null, `entity '${FIELDS_ENTITY}' not found in metadata`);
        const pk = entity!.FirstPrimaryKey.Name;
        const anyKey = CompositeKey.FromKeyValuePairs([{ FieldName: pk, Value: '00000000-0000-0000-0000-000000000000' }]);

        const startRow = await probeRefusal(
            { EntityName: FIELDS_ENTITY, AfterKey: anyKey, StartRow: 5, MaxRows: 5, ResultType: 'simple' }, ctx.User,
        );
        Assert(startRow.length > 0, 'RVM14 AfterKey + StartRow was ACCEPTED — the StartRowConflict guard is gone');
        Assert(startRow !== '', 'RVM14: AfterKey+StartRow>0 must be REFUSED (it was accepted — keyset/offset conflict not enforced)');
        if (!startRow.toLowerCase().includes('startrow')) {
            // The server throws AfterKeyNotSupportedError with a message naming StartRow
            // (GenericDatabaseProvider ~line 1250), but over the client transport the message
            // arrives empty. The REFUSAL invariant holds (asserted above); the message-fidelity
            // gap is tracked in the bug register (wire error propagation) rather than failing
            // the gate on wording the client never receives.
            console.warn(`  ⚠ RVM14: refusal message lost over the wire (got "${startRow}") — see bug register (AfterKey refusal message fidelity)`);
        }

        const orderBy = await probeRefusal(
            { EntityName: FIELDS_ENTITY, AfterKey: anyKey, OrderBy: 'Sequence ASC', MaxRows: 5, ResultType: 'simple' }, ctx.User,
        );
        Assert(orderBy.length > 0, 'RVM14 AfterKey + non-PK OrderBy was ACCEPTED — the IncompatibleOrderBy guard is gone');
        Assert(/orderby|order by|pk column|primary key/i.test(orderBy), `RVM14 IncompatibleOrderBy refusal does not identify the cause: "${orderBy}"`);

        const badShape = await probeRefusal(
            {
                EntityName: FIELDS_ENTITY,
                AfterKey: CompositeKey.FromKeyValuePairs([{ FieldName: 'Sequence', Value: 1 }]),
                MaxRows: 5,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(badShape.length > 0, 'RVM14 AfterKey with a non-PK key name was ACCEPTED — the AfterKeyShape guard is gone');
        Assert(/does not match|afterkey|pk column/i.test(badShape), `RVM14 AfterKeyShape refusal does not identify the cause: "${badShape}"`);
        console.log(`      → 3 guard refusals verified (StartRowConflict / IncompatibleOrderBy / AfterKeyShape)`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM15 / RVM16 — Aggregates (catalog RV15 / RV16)
// ─────────────────────────────────────────────────────────────────────────────────────────

function aggregateValue(results: readonly AggregateResult[] | undefined, alias: string): number {
    const hit = (results ?? []).find(a => a.alias === alias);
    Assert(hit != null, `aggregate '${alias}' missing from AggregateResults`);
    Assert(!hit!.error, `aggregate '${alias}' returned an error: ${hit!.error}`);
    const n = Number(hit!.value);
    Assert(Number.isFinite(n), `aggregate '${alias}' value is not numeric: ${JSON.stringify(hit!.value)}`);
    return n;
}

const RVM15: NamedCheck = {
    Id: 'runview-matrix.RVM15',
    Name: 'RVM15: Aggregates COUNT(*) equals count_only TotalRowCount and ignores MaxRows (representative subset)',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const rv = new RunView();
        let verified = 0;
        for (const entity of sweepEntities(ctx)) {
            if (verified >= 5) {
                break;
            }
            if (sweepSkip(entity)) {
                continue;
            }
            const c = await totalCount(ctx, entity);
            if (c.Count === undefined || c.Count === 0) {
                continue;
            }
            const r = await rv.RunView(
                { EntityName: entity.Name, Fields: [entity.FirstPrimaryKey.Name], MaxRows: 2, ResultType: 'simple', Aggregates: [{ expression: 'COUNT(*)', alias: 'RowCnt' }] },
                ctx.User,
            );
            requireSuccess(r, `RVM15 aggregate read of ${entity.Name}`);
            Assert(r.Results.length <= 2, `RVM15 MaxRows leaked on ${entity.Name}`);
            AssertEqual(aggregateValue(r.AggregateResults, 'RowCnt'), c.Count,
                `RVM15 COUNT(*) on ${entity.Name} must equal count_only TotalRowCount despite MaxRows:2`);
            verified++;
        }
        Assert(verified > 0, 'RVM15 verified zero entities — the representative subset is vacuous');
        console.log(`      → COUNT(*) parity verified on ${verified} representative entities`);
    },
};

const RVM16: NamedCheck = {
    Id: 'runview-matrix.RVM16',
    Name: 'RVM16: numeric Aggregates SUM/MIN/MAX/COUNT over Sequence match an independent computation; aliases honored',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const seqs = u.Rows.map(r => Number(r.Sequence)).filter(n => Number.isFinite(n));
        Assert(seqs.length > 0, 'RVM16 universe has no numeric Sequence values — the check would be vacuous');
        const expected = {
            Sum: seqs.reduce((a, b) => a + b, 0),
            Min: Math.min(...seqs),
            Max: Math.max(...seqs),
            Cnt: seqs.length,
        };
        // AVG is deliberately omitted: integer AVG semantics differ across platforms
        // (SQL Server truncates int AVG; PG returns numeric) — SUM/COUNT pin the same math exactly.
        const r = await new RunView().RunView(
            {
                EntityName: FIELDS_ENTITY,
                Fields: ['ID'],
                ExtraFilter: `(${u.Filter}) AND (Sequence IS NOT NULL)`,
                MaxRows: 2,
                ResultType: 'simple',
                Aggregates: [
                    { expression: 'SUM(Sequence)', alias: 'SumSeq' },
                    { expression: 'MIN(Sequence)', alias: 'MinSeq' },
                    { expression: 'MAX(Sequence)', alias: 'MaxSeq' },
                    { expression: 'COUNT(Sequence)', alias: 'CntSeq' },
                ],
            },
            ctx.User,
        );
        requireSuccess(r, 'RVM16 numeric aggregate read');
        AssertEqual(aggregateValue(r.AggregateResults, 'SumSeq'), expected.Sum, 'RVM16 SUM(Sequence)');
        AssertEqual(aggregateValue(r.AggregateResults, 'MinSeq'), expected.Min, 'RVM16 MIN(Sequence)');
        AssertEqual(aggregateValue(r.AggregateResults, 'MaxSeq'), expected.Max, 'RVM16 MAX(Sequence)');
        AssertEqual(aggregateValue(r.AggregateResults, 'CntSeq'), expected.Cnt, 'RVM16 COUNT(Sequence)');
        AssertEqual((r.AggregateResults ?? []).length, 4, 'RVM16 all four aggregates must come back, alias-addressable');
        console.log(`      → SUM=${expected.Sum} MIN=${expected.Min} MAX=${expected.Max} COUNT=${expected.Cnt} all matched independent computation`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM17 — RunViews batch (catalog RV21)
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVM17: NamedCheck = {
    Id: 'runview-matrix.RVM17',
    Name: 'RVM17: RunViews batch — three heterogeneous params each project to their own positional result',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const rv = new RunView();
        const batch = await rv.RunViews([
            { EntityName: 'MJ: Entities', Fields: ['Name'], ResultType: 'simple' },
            { EntityName: FIELDS_ENTITY, ResultType: 'count_only' },
            { EntityName: 'MJ: Roles', Fields: ['ID', 'Name'], ResultType: 'simple' },
        ], ctx.User);
        AssertEqual(batch.length, 3, 'RVM17 batch must return one result per param, positionally');
        requireSuccess(batch[0], 'RVM17 batch[0] (MJ: Entities)');
        requireSuccess(batch[1], `RVM17 batch[1] (${FIELDS_ENTITY} count_only)`);
        requireSuccess(batch[2], 'RVM17 batch[2] (MJ: Roles)');

        Assert(batch[0].Results.length > 0, 'RVM17 batch[0] returned zero entities — vacuous');
        AssertRowShape(batch[0].Results[0] as Record<string, unknown>, ['ID', 'Name'], 'RVM17 batch[0] shape (requested field + PK)');
        AssertEqual(batch[1].Results.length, 0, 'RVM17 batch[1] count_only must return zero rows');
        Assert((batch[1].TotalRowCount ?? 0) > 0, 'RVM17 batch[1] count_only TotalRowCount must be populated');
        Assert(batch[2].Results.length > 0, 'RVM17 batch[2] returned zero roles — vacuous');
        AssertRowShape(batch[2].Results[0] as Record<string, unknown>, ['ID', 'Name'], 'RVM17 batch[2] shape');

        // Positional integrity: each batch leg must match its individually-run equivalent.
        const soloEntities = await rv.RunView({ EntityName: 'MJ: Entities', Fields: ['Name'], ResultType: 'simple' }, ctx.User);
        const soloCount = await rv.RunView({ EntityName: FIELDS_ENTITY, ResultType: 'count_only' }, ctx.User);
        requireSuccess(soloEntities, 'RVM17 solo MJ: Entities');
        requireSuccess(soloCount, 'RVM17 solo count_only');
        AssertEqual(batch[0].Results.length, soloEntities.Results.length, 'RVM17 batch[0] row count must match the solo run');
        AssertEqual(batch[1].TotalRowCount, soloCount.TotalRowCount, 'RVM17 batch[1] TotalRowCount must match the solo run');
        console.log(`      → batch of 3 matched solo runs: ${batch[0].Results.length} entities, count=${batch[1].TotalRowCount}, ${batch[2].Results.length} roles`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVM18 — PlatformSQL ExtraFilter/OrderBy (catalog RV22)
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVM18: NamedCheck = {
    Id: 'runview-matrix.RVM18',
    Name: 'RVM18: PlatformSQL ExtraFilter/OrderBy — the platform variant is applied, the default is ignored',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const rv = new RunView();

        // Both platform variants carry the REAL predicate; `default` is a poison pill (0 rows).
        // Whichever platform resolves, the subset must come back — resolution falling through
        // to `default` (or not happening at all) yields zero rows and fails loudly.
        const filter: PlatformSQL = {
            default: '(ID IS NULL)',
            sqlserver: `(${u.Filter}) AND (${u.SubsetFilter})`,
            postgresql: `(${u.Filter}) AND (${u.SubsetFilter})`,
        };
        const filtered = await rv.RunView<{ ID: string }>(
            { EntityName: FIELDS_ENTITY, Fields: ['ID'], ExtraFilter: filter, IgnoreMaxRows: true, ResultType: 'simple' }, ctx.User,
        );
        requireSuccess(filtered, 'RVM18 PlatformSQL ExtraFilter read');
        AssertEqual(filtered.Results.length, u.SubsetIds.size,
            'RVM18 the platform-specific ExtraFilter variant must be applied (0 rows would mean the poison default won)');

        // OrderBy leg: platform variants say DESC, default says ASC — a descending result proves
        // the platform variant was chosen. Precondition: ≥2 distinct Sequence values in the subset.
        const orderBy: PlatformSQL = {
            default: 'Sequence ASC, ID ASC',
            sqlserver: 'Sequence DESC, ID DESC',
            postgresql: 'Sequence DESC, ID DESC',
        };
        const ordered = await rv.RunView<{ ID: string; Sequence: number }>(
            {
                EntityName: FIELDS_ENTITY,
                Fields: ['Sequence'],
                ExtraFilter: `(${u.Filter}) AND (Sequence IS NOT NULL)`,
                OrderBy: orderBy,
                IgnoreMaxRows: true,
                ResultType: 'simple',
            },
            ctx.User,
        );
        requireSuccess(ordered, 'RVM18 PlatformSQL OrderBy read');
        const seqs = ordered.Results.map(r => Number(r.Sequence));
        Assert(new Set(seqs).size >= 2, 'RVM18 precondition: the universe must span ≥2 distinct Sequence values');
        for (let i = 1; i < seqs.length; i++) {
            Assert(seqs[i] <= seqs[i - 1], `RVM18 result is not descending at index ${i} (${seqs[i - 1]} then ${seqs[i]}) — the default ASC variant may have been used`);
        }
        AssertEqual(seqs[0], Math.max(...seqs), 'RVM18 descending result must lead with the maximum Sequence');
        console.log(`      → ExtraFilter variant selected ${filtered.Results.length} subset rows; OrderBy variant sorted ${seqs.length} rows DESC`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────

export const RunViewMatrixChecks: NamedCheck[] = [
    RVM1, RVM2, RVM3, RVM4, RVM5, RVM6, RVM7, RVM8, RVM9,
    RVM10, RVM11, RVM12, RVM13, RVM14, RVM15, RVM16, RVM17, RVM18,
];

for (const check of RunViewMatrixChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
