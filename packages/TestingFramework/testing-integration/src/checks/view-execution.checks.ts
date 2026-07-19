/**
 * view-execution.checks.ts — the 'view-execution' bundle: the DETERMINISTIC tier of
 * "Domain 11 — Viewing System" from plans/integration-test-expansion/test-catalog.md.
 *
 * TRANSPORT: CLIENT-FIRST. Every data leg runs through `RunView` on the configured
 * GraphQLDataProvider — i.e. over the real GraphQL wire to a live MJAPI — because that is
 * where filter marshalling, projection, pagination framing and the server-side injection
 * guard actually live. The one exception is V2, which asserts a PURE CLIENT-SIDE compile
 * (`MJUserViewEntityExtended` FilterState → WhereClause); it never touches the wire because
 * there is nothing on the wire to touch — the compile is client code by construction.
 *
 * READ-ONLY BY CONSTRUCTION. This bundle creates, updates and deletes NOTHING. Its "fixture"
 * is a universe DISCOVERED from existing metadata rows (the `MJ: Entity Fields` belonging to
 * the first three `MJ: Entities` by ID), so there is no setup, no teardown, and nothing to
 * orphan on a crash.
 *
 * Checks implemented (DET tier):
 *   V1  — dynamic {EntityName, ExtraFilter} returns EXACTLY the matching rows (set equality)
 *   V2  — Filter-JSON compiles to the expected WHERE (nested groups parenthesized, quoting)
 *   V3  — ExtraFilter injection guard: ;/--/DROP/UNION rejected, forbidden words INSIDE a
 *         string literal accepted (the literal-stripping half of the validator)
 *   V4  — Fields projection returns the requested subset PLUS the PK and nothing else
 *   V9  — OFFSET pagination: union of pages == full set, no duplicates, no gaps
 *   V10 — Keyset (AfterKey) walk: every row exactly once; short final page signals end
 *   V11 — Keyset on a composite-PK entity is REFUSED (never silently degrades to OFFSET)
 *   V12 — MaxRows honored; IgnoreMaxRows returns the full set; entity UserViewMaxRows fallback
 *   V13 — Aggregates are unaffected by pagination but DO honor the WHERE clause
 *
 * Deliberately NOT implemented here (see the report in the bundle's IT record):
 *   V5–V8, V16, V17 — MUT tier (need saved-view mutation); a later wave.
 *   V18            — LIVE tier (smart-filter regeneration needs a model).
 *   V14, V15       — SECURITY invariants that require TWO authenticated identities. A client
 *                    GraphQLDataProvider is bound to exactly ONE identity (here, the system
 *                    API key), so there is no honest way to observe "user B is denied user A's
 *                    private view" or "RLS AND-combines for a scoped user" from this process
 *                    without provisioning a second authenticated session. Writing a
 *                    single-identity version would be a check that cannot fail. The multi-user
 *                    legs are covered by the server-side `rls-isolation` bundle (RLS8/RLS9/RLS10,
 *                    which DISCOVER two genuinely-scoped users) and its `rls-isolation-client`
 *                    companion; per-user view isolation belongs there when a second client
 *                    session becomes available.
 */
import { RunView, CompositeKey } from '@memberjunction/core';
import type { UserInfo, EntityInfo, RunViewResult, AggregateResult } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

/** The entity every data leg reads: stable, read-only, single-column uniqueidentifier PK, many rows. */
const ENTITY = 'MJ: Entity Fields';
/** How many parent entities' fields make up the discovered universe (≥2 so a proper subset exists). */
const UNIVERSE_ENTITY_COUNT = 3;
/** Minimum universe size for the pagination legs to be meaningful. */
const MIN_UNIVERSE_ROWS = 10;

/** A minimal row shape for the universe read — narrow Fields + ResultType 'simple'. */
interface UniverseRow {
    ID: string;
    EntityID: string;
}

/**
 * The DISCOVERED, read-only universe every data leg operates on: all `MJ: Entity Fields`
 * rows belonging to the first `UNIVERSE_ENTITY_COUNT` entities (by ID), plus the proper
 * non-empty subset belonging to the first of those entities.
 */
interface ViewUniverse {
    /** `EntityID IN ('a','b','c')` — the universe predicate. */
    Filter: string;
    /** `EntityID='a'` — a predicate selecting a proper, non-empty subset of the universe. */
    SubsetFilter: string;
    /** Every PK in the universe, normalized. */
    AllIds: Set<string>;
    /** The PKs expected to match SubsetFilter, normalized. */
    SubsetIds: Set<string>;
}

/** UUIDs come back uppercase on SQL Server and lowercase on PostgreSQL — compare normalized. */
function normId(id: string): string {
    return id.trim().toLowerCase();
}

function idSet(rows: readonly UniverseRow[]): Set<string> {
    return new Set(rows.map(r => normId(r.ID)));
}

/** Fail loudly on a failed RunView rather than silently asserting over an empty array. */
function requireSuccess(r: RunViewResult, what: string): void {
    Assert(r.Success === true, `${what} failed: ${r.ErrorMessage ?? '(no message)'}`);
}

/** Process-scoped memo — the universe is immutable for the life of the run, so discover it once. */
let universeMemo: ViewUniverse | null = null;

async function firstEntityIDs(user: UserInfo, count: number): Promise<string[]> {
    const r = await new RunView().RunView(
        { EntityName: 'MJ: Entities', Fields: ['ID'], OrderBy: 'ID', MaxRows: count, ResultType: 'simple' }, user,
    );
    requireSuccess(r, 'universe discovery (MJ: Entities)');
    const ids = ((r.Results ?? []) as Array<{ ID: string }>).map(x => x.ID);
    Assert(ids.length === count, `universe discovery needs ${count} entities, got ${ids.length}`);
    return ids;
}

/** Discover (never create) the read-only universe, over the wire. */
async function getUniverse(user: UserInfo): Promise<ViewUniverse> {
    if (universeMemo) {
        return universeMemo;
    }
    const entityIds = await firstEntityIDs(user, UNIVERSE_ENTITY_COUNT);
    const filter = `EntityID IN ('${entityIds.join("','")}')`;
    const subsetFilter = `EntityID='${entityIds[0]}'`;

    const r = await new RunView().RunView(
        { EntityName: ENTITY, Fields: ['ID', 'EntityID'], ExtraFilter: filter, IgnoreMaxRows: true, ResultType: 'simple' }, user,
    );
    requireSuccess(r, 'universe discovery (MJ: Entity Fields)');
    const rows = (r.Results ?? []) as UniverseRow[];

    Assert(rows.length >= MIN_UNIVERSE_ROWS, `universe too small to test pagination: ${rows.length} rows (need ≥ ${MIN_UNIVERSE_ROWS})`);
    const distinctParents = new Set(rows.map(x => normId(x.EntityID)));
    AssertEqual(distinctParents.size, UNIVERSE_ENTITY_COUNT, 'universe spans the expected number of parent entities');

    const subset = rows.filter(x => normId(x.EntityID) === normId(entityIds[0]));
    Assert(subset.length > 0, 'subset predicate selects no rows — it would make V1/V13 vacuous');
    Assert(subset.length < rows.length, 'subset predicate selects the whole universe — it would make V1/V13 vacuous');

    universeMemo = { Filter: filter, SubsetFilter: subsetFilter, AllIds: idSet(rows), SubsetIds: idSet(subset) };
    return universeMemo;
}

/** Symmetric-difference report for two PK sets — the union/dup/gap proof used by V1/V9/V10. */
function diffSets(actual: Set<string>, expected: Set<string>): { Missing: string[]; Extra: string[] } {
    return {
        Missing: [...expected].filter(k => !actual.has(k)),
        Extra: [...actual].filter(k => !expected.has(k)),
    };
}

function assertSameIdSet(actual: Set<string>, expected: Set<string>, what: string): void {
    const { Missing, Extra } = diffSets(actual, expected);
    Assert(Missing.length === 0, `${what}: ${Missing.length} expected row(s) missing (e.g. ${Missing.slice(0, 3).join(', ')})`);
    Assert(Extra.length === 0, `${what}: ${Extra.length} unexpected row(s) returned (e.g. ${Extra.slice(0, 3).join(', ')})`);
    AssertEqual(actual.size, expected.size, `${what}: set size`);
}

/** Page size chosen so the universe spans ~4–5 pages (and always ≥2). */
function pageSize(universe: ViewUniverse): number {
    return Math.max(3, Math.ceil(universe.AllIds.size / 4));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// V2 helper — compile a FilterState through the real client-side view subclass.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build a NEW (never saved) `MJ: User Views` object bound to `entity`, push `filterState`
 * through the production `UpdateWhereClause()` path, and hand back the compiled clause.
 */
async function compileFilterState(ctx: IntegrationCheckContext, entity: EntityInfo, filterState: object): Promise<string> {
    const view = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', ctx.User);
    Assert(view.NewRecord(), 'could not initialize a new MJ: User Views object for the filter-compile check');
    view.EntityID = entity.ID;
    view.FilterState = JSON.stringify(filterState);
    await view.UpdateWhereClause();
    return view.WhereClause ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────────────────

const V1: NamedCheck = {
    Id: 'view-execution.V1',
    Name: 'V1: dynamic {EntityName, ExtraFilter} returns exactly the matching rows (wire)',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const r = await new RunView().RunView(
            { EntityName: ENTITY, Fields: ['ID'], ExtraFilter: `(${u.Filter}) AND (${u.SubsetFilter})`, IgnoreMaxRows: true, ResultType: 'simple' },
            ctx.User,
        );
        requireSuccess(r, 'V1 filtered RunView');
        const got = idSet((r.Results ?? []) as UniverseRow[]);
        Assert(got.size > 0, 'V1 returned zero rows — the assertion would be vacuous');
        assertSameIdSet(got, u.SubsetIds, 'V1 filtered result');
        console.log(`      → filter selected exactly ${got.size} of ${u.AllIds.size} universe rows`);
    },
};

const V2: NamedCheck = {
    Id: 'view-execution.V2',
    Name: 'V2: Filter-JSON compiles to the expected WHERE (nested groups, operators, quoting)',
    Fn: async (ctx: IntegrationCheckContext) => {
        const entity = ctx.Provider.EntityByName(ENTITY);
        Assert(entity != null, `entity '${ENTITY}' not found in metadata`);

        // Nested group: an AND whose second member is an OR group → the OR must be parenthesized.
        const nested = await compileFilterState(ctx, entity!, {
            logic: 'and',
            filters: [
                { field: 'Name', operator: 'startswith', value: 'A' },
                { logic: 'or', filters: [{ field: 'Name', operator: 'eq', value: 'X' }, { field: 'Name', operator: 'contains', value: 'Y' }] },
            ],
        });
        AssertEqual(nested, `([Name] LIKE 'A%') AND (([Name] = 'X') OR ([Name] LIKE '%Y%'))`, 'V2 nested group compile');

        // Numeric field → NO quotes; string field → quotes. Same compile, different quoting.
        const numeric = await compileFilterState(ctx, entity!, {
            logic: 'and',
            filters: [{ field: 'Sequence', operator: 'gt', value: 5 }, { field: 'Name', operator: 'neq', value: 'ID' }],
        });
        AssertEqual(numeric, `([Sequence] > 5) AND ([Name] <> 'ID')`, 'V2 quoting by field type');

        // Null operators emit no operand at all.
        const nulls = await compileFilterState(ctx, entity!, {
            logic: 'or',
            filters: [{ field: 'Description', operator: 'isnull', value: '' }, { field: 'Description', operator: 'isnotnull', value: '' }],
        });
        AssertEqual(nulls, `([Description] IS NULL) OR ([Description] IS NOT NULL)`, 'V2 null operators');
        console.log(`      → 3 FilterState shapes compiled to the exact expected WHERE text`);
    },
};

/** One injection probe: the clause and whether the server must accept it. */
interface InjectionProbe {
    Clause: string;
    MustBeAccepted: boolean;
    Why: string;
}

const V3: NamedCheck = {
    Id: 'view-execution.V3',
    Name: 'V3: ExtraFilter injection guard rejects ;/--/DROP/UNION, accepts them inside string literals',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const probes: InjectionProbe[] = [
            { Clause: `${u.SubsetFilter}; DROP TABLE Foo`, MustBeAccepted: false, Why: 'statement separator + DROP' },
            { Clause: `${u.SubsetFilter} UNION SELECT 1`, MustBeAccepted: false, Why: 'UNION' },
            { Clause: `${u.SubsetFilter} -- trailing comment`, MustBeAccepted: false, Why: 'line comment' },
            { Clause: `${u.SubsetFilter} /* block */`, MustBeAccepted: false, Why: 'block comment' },
            { Clause: `${u.SubsetFilter} AND Name IS NOT NULL`, MustBeAccepted: true, Why: 'benign clause' },
            // Forbidden words appear ONLY inside a quoted literal → the validator strips literals first.
            { Clause: `${u.SubsetFilter} AND Name <> 'drop;union--update'`, MustBeAccepted: true, Why: 'forbidden words inside a string literal' },
        ];

        const rejected: string[] = [];
        const accepted: string[] = [];
        for (const p of probes) {
            const ok = await probeAccepted(p.Clause, ctx.User);
            if (ok) {
                accepted.push(p.Why);
            } else {
                rejected.push(p.Why);
            }
            AssertEqual(ok, p.MustBeAccepted, `V3 probe [${p.Why}] — clause: ${p.Clause}`);
        }
        Assert(rejected.length === 4 && accepted.length === 2, `V3 expected 4 rejections + 2 acceptances, got ${rejected.length}/${accepted.length}`);
        console.log(`      → rejected: ${rejected.join(', ')}   accepted: ${accepted.join(', ')}`);
    },
};

/** Run an ExtraFilter over the wire; true = the server accepted it, false = it refused. */
async function probeAccepted(clause: string, user: UserInfo): Promise<boolean> {
    try {
        const r = await new RunView().RunView(
            { EntityName: ENTITY, Fields: ['ID'], ExtraFilter: clause, MaxRows: 1, ResultType: 'simple' }, user,
        );
        return r.Success === true;
    } catch {
        // A thrown transport/validation error is a refusal too.
        return false;
    }
}

const V4: NamedCheck = {
    Id: 'view-execution.V4',
    Name: 'V4: Fields projection returns the requested subset PLUS the PK, never extra columns (wire)',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const entity = ctx.Provider.EntityByName(ENTITY);
        Assert(entity != null, `entity '${ENTITY}' not found in metadata`);
        const pkNames = entity!.PrimaryKeys.map(p => p.Name);
        AssertEqual(pkNames.length, 1, `${ENTITY} must have a single-column PK for this bundle`);

        const r = await new RunView().RunView(
            { EntityName: ENTITY, Fields: ['Sequence'], ExtraFilter: u.Filter, MaxRows: 5, ResultType: 'simple' }, ctx.User,
        );
        requireSuccess(r, 'V4 projection RunView');
        const rows = (r.Results ?? []) as Array<Record<string, unknown>>;
        Assert(rows.length > 0, 'V4 returned zero rows — the projection assertion would be vacuous');

        const allowed = new Set<string>(['Sequence', ...pkNames].map(n => n.toLowerCase()));
        for (const row of rows) {
            const keys = Object.keys(row);
            const extra = keys.filter(k => !allowed.has(k.toLowerCase()));
            Assert(extra.length === 0, `V4 projection returned unrequested column(s): ${extra.join(', ')}`);
            for (const pk of pkNames) {
                Assert(keys.some(k => k.toLowerCase() === pk.toLowerCase()), `V4 projection dropped the PK column '${pk}'`);
            }
            Assert(keys.some(k => k.toLowerCase() === 'sequence'), 'V4 projection dropped the requested column Sequence');
        }
        console.log(`      → ${rows.length} rows, columns exactly {Sequence, ${pkNames.join(', ')}}`);
    },
};

const V9: NamedCheck = {
    Id: 'view-execution.V9',
    Name: 'V9: OFFSET pagination over a stable sort — union == full set, no duplicates, no gaps',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const size = pageSize(u);
        const seen = new Set<string>();
        let pages = 0;
        for (let start = 0; ; start += size) {
            const r = await new RunView().RunView(
                { EntityName: ENTITY, Fields: ['ID'], ExtraFilter: u.Filter, OrderBy: 'ID', MaxRows: size, StartRow: start, ResultType: 'simple' },
                ctx.User,
            );
            requireSuccess(r, `V9 page at offset ${start}`);
            const rows = (r.Results ?? []) as UniverseRow[];
            if (rows.length === 0) {
                break;
            }
            pages++;
            const before = seen.size;
            for (const row of rows) {
                seen.add(normId(row.ID));
            }
            AssertEqual(seen.size - before, rows.length, `V9 page at offset ${start} returned duplicate row(s) already seen on an earlier page`);
            Assert(rows.length <= size, `V9 page at offset ${start} returned ${rows.length} rows, more than MaxRows=${size}`);
            if (rows.length < size) {
                break;
            }
            Assert(pages < 200, 'V9 pagination did not terminate within 200 pages — suspected offset bug');
        }
        Assert(pages >= 2, `V9 needs at least 2 pages to be meaningful, walked ${pages}`);
        assertSameIdSet(seen, u.AllIds, 'V9 union of OFFSET pages');
        console.log(`      → ${pages} pages × ${size} rows reconstructed all ${u.AllIds.size} rows exactly once`);
    },
};

const V10: NamedCheck = {
    Id: 'view-execution.V10',
    Name: 'V10: keyset (AfterKey) walk returns every row exactly once; short final page ends it',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const size = pageSize(u);
        const seen = new Set<string>();
        let after: CompositeKey | undefined = undefined;
        let pages = 0;
        let lastPageLength = -1;
        for (;;) {
            const r: RunViewResult = await new RunView().RunView(
                { EntityName: ENTITY, Fields: ['ID'], ExtraFilter: u.Filter, AfterKey: after, MaxRows: size, ResultType: 'simple' },
                ctx.User,
            );
            requireSuccess(r, `V10 keyset page ${pages + 1}`);
            const rows = (r.Results ?? []) as UniverseRow[];
            if (rows.length === 0) {
                lastPageLength = 0;
                break;
            }
            pages++;
            const before = seen.size;
            for (const row of rows) {
                seen.add(normId(row.ID));
            }
            AssertEqual(seen.size - before, rows.length, `V10 keyset page ${pages} re-returned row(s) from an earlier page`);
            Assert(rows.length <= size, `V10 keyset page ${pages} returned ${rows.length} rows, more than MaxRows=${size}`);
            lastPageLength = rows.length;
            if (rows.length < size) {
                break;
            }
            after = CompositeKey.FromID(rows[rows.length - 1].ID);
            Assert(pages < 200, 'V10 keyset walk did not terminate within 200 pages — suspected seek-predicate bug');
        }
        Assert(pages >= 2, `V10 needs at least 2 keyset pages to be meaningful, walked ${pages}`);
        Assert(lastPageLength < size, `V10 the walk must end on a SHORT page (got ${lastPageLength} with MaxRows=${size})`);
        assertSameIdSet(seen, u.AllIds, 'V10 union of keyset pages');
        console.log(`      → ${pages} keyset pages reconstructed all ${u.AllIds.size} rows exactly once; final page had ${lastPageLength} rows`);
    },
};

/** Metadata-driven discovery of a readable composite-PK entity for V11 (never hardcoded). */
async function findReadableCompositePkEntity(ctx: IntegrationCheckContext): Promise<EntityInfo | null> {
    const candidates = ctx.Provider.Entities.filter(e => (e.PrimaryKeys?.length ?? 0) > 1);
    for (const e of candidates) {
        const r = await new RunView().RunView({ EntityName: e.Name, MaxRows: 1, ResultType: 'simple' }, ctx.User);
        if (r.Success) {
            return e;
        }
    }
    return null;
}

const V11: NamedCheck = {
    Id: 'view-execution.V11',
    Name: 'V11: keyset on a composite-PK entity is refused — never silently degrades to OFFSET',
    Fn: async (ctx: IntegrationCheckContext) => {
        const entity = await findReadableCompositePkEntity(ctx);
        if (!entity) {
            console.log('      → SKIPPED: this deployment has no readable composite-PK entity, so the AfterKeyNotSupportedError(CompositePK) branch is unreachable here.');
            return;
        }

        let refusal = '';
        try {
            const r = await new RunView().RunView(
                { EntityName: entity.Name, AfterKey: CompositeKey.FromID('00000000-0000-0000-0000-000000000000'), MaxRows: 5, ResultType: 'simple' },
                ctx.User,
            );
            Assert(r.Success === false, `V11 keyset on composite-PK entity '${entity.Name}' SUCCEEDED — it silently degraded instead of refusing`);
            Assert((r.Results?.length ?? 0) === 0, 'V11 refused query still returned rows');
            refusal = r.ErrorMessage ?? '';
        } catch (e) {
            refusal = e instanceof Error ? e.message : String(e);
        }

        const lower = refusal.toLowerCase();
        Assert(
            lower.includes('composite') || lower.includes('single-column primary key') || lower.includes('afterkey'),
            `V11 refusal message does not identify the AfterKey/composite-PK cause: "${refusal}"`,
        );
        console.log(`      → '${entity.Name}' (${entity.PrimaryKeys.length}-column PK) refused AfterKey: ${refusal.slice(0, 120)}`);
    },
};

const V12: NamedCheck = {
    Id: 'view-execution.V12',
    Name: 'V12: MaxRows honored; IgnoreMaxRows returns the full set; entity UserViewMaxRows fallback',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const cap = 3;
        Assert(u.AllIds.size > cap, `V12 needs a universe larger than MaxRows=${cap}, got ${u.AllIds.size}`);

        const capped = await new RunView().RunView(
            { EntityName: ENTITY, Fields: ['ID'], ExtraFilter: u.Filter, OrderBy: 'ID', MaxRows: cap, ResultType: 'simple' }, ctx.User,
        );
        requireSuccess(capped, 'V12 MaxRows RunView');
        AssertEqual((capped.Results ?? []).length, cap, 'V12 MaxRows honored');

        const full = await new RunView().RunView(
            { EntityName: ENTITY, Fields: ['ID'], ExtraFilter: u.Filter, IgnoreMaxRows: true, ResultType: 'simple' }, ctx.User,
        );
        requireSuccess(full, 'V12 IgnoreMaxRows RunView');
        assertSameIdSet(idSet((full.Results ?? []) as UniverseRow[]), u.AllIds, 'V12 IgnoreMaxRows full set');

        await assertUserViewMaxRowsFallback(ctx);
    },
};

/** The third V12 leg: an entity carrying UserViewMaxRows caps an unbounded RunView at that value. */
async function assertUserViewMaxRowsFallback(ctx: IntegrationCheckContext): Promise<void> {
    const withCap = ctx.Provider.Entities.find(e => (e.UserViewMaxRows ?? 0) > 0);
    if (!withCap) {
        console.log('      → MaxRows + IgnoreMaxRows verified; no entity in this deployment sets UserViewMaxRows, so the fallback leg is unreachable.');
        return;
    }
    const count = await new RunView().RunView({ EntityName: withCap.Name, ResultType: 'count_only' }, ctx.User);
    requireSuccess(count, `V12 count_only on '${withCap.Name}'`);
    const total = count.TotalRowCount ?? 0;

    const unbounded = await new RunView().RunView({ EntityName: withCap.Name, ResultType: 'simple' }, ctx.User);
    requireSuccess(unbounded, `V12 unbounded RunView on '${withCap.Name}'`);
    const returned = (unbounded.Results ?? []).length;

    const expected = Math.min(withCap.UserViewMaxRows, total);
    AssertEqual(returned, expected, `V12 '${withCap.Name}' UserViewMaxRows fallback (cap=${withCap.UserViewMaxRows}, total=${total})`);
    console.log(`      → MaxRows + IgnoreMaxRows verified; '${withCap.Name}' capped at UserViewMaxRows=${withCap.UserViewMaxRows} (total ${total})`);
}

function aggregateValue(results: readonly AggregateResult[] | undefined, alias: string): number {
    const hit = (results ?? []).find(a => a.alias === alias);
    Assert(hit != null, `aggregate '${alias}' missing from AggregateResults`);
    Assert(!hit!.error, `aggregate '${alias}' returned an error: ${hit!.error}`);
    const n = Number(hit!.value);
    Assert(Number.isFinite(n), `aggregate '${alias}' value is not numeric: ${JSON.stringify(hit!.value)}`);
    return n;
}

const V13: NamedCheck = {
    Id: 'view-execution.V13',
    Name: 'V13: aggregates are unaffected by pagination but DO honor the WHERE clause',
    Fn: async (ctx: IntegrationCheckContext) => {
        const u = await getUniverse(ctx.User);
        const cap = 2;
        Assert(u.AllIds.size > cap, `V13 needs a universe larger than MaxRows=${cap}`);

        // Leg 1 — a paginated read still aggregates over the FULL matching set.
        const paged = await new RunView().RunView(
            {
                EntityName: ENTITY, Fields: ['ID'], ExtraFilter: u.Filter, OrderBy: 'ID', MaxRows: cap,
                ResultType: 'simple', Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }],
            },
            ctx.User,
        );
        requireSuccess(paged, 'V13 paginated aggregate RunView');
        AssertEqual((paged.Results ?? []).length, cap, 'V13 pagination still capped the returned rows');
        AssertEqual(aggregateValue(paged.AggregateResults, 'Cnt'), u.AllIds.size, 'V13 aggregate ignored pagination and counted the full set');

        // Leg 2 — narrowing the WHERE clause MUST narrow the aggregate (proves it is not a table-wide count).
        const narrowed = await new RunView().RunView(
            {
                EntityName: ENTITY, Fields: ['ID'], ExtraFilter: `(${u.Filter}) AND (${u.SubsetFilter})`, MaxRows: cap,
                ResultType: 'simple', Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }],
            },
            ctx.User,
        );
        requireSuccess(narrowed, 'V13 narrowed aggregate RunView');
        const narrowCount = aggregateValue(narrowed.AggregateResults, 'Cnt');
        AssertEqual(narrowCount, u.SubsetIds.size, 'V13 aggregate honored the narrowed WHERE clause');
        Assert(narrowCount < u.AllIds.size, 'V13 narrowed aggregate is not actually narrower — the check would be vacuous');
        console.log(`      → COUNT(*) = ${u.AllIds.size} under pagination, ${narrowCount} under the narrowed filter`);
    },
};

export const ViewExecutionChecks: NamedCheck[] = [V1, V2, V3, V4, V9, V10, V11, V12, V13];

for (const check of ViewExecutionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
