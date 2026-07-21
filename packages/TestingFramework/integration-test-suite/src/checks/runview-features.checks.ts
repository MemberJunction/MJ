/**
 * runview-features.checks.ts — the 'runview-features' bundle: "Domain 0b — cross-feature
 * interaction & edge cases (targeted, not swept)" from
 * plans/integration-test-expansion/test-catalog.md.
 *
 * TRANSPORT: CLIENT-FIRST. Every leg runs through `RunView` on the configured provider —
 * with the client bootstrap that is the GraphQLDataProvider over the real GraphQL wire to a
 * live MJAPI. These are the seams the swept `runview-matrix` bundle cannot see: two features
 * combined, boundaries past the end of the data, and hostile-but-benign literal values.
 *
 * READ-ONLY BY CONSTRUCTION. No fixtures, no lifecycle — the universe is DISCOVERED from
 * existing `MJ: Entity Fields` metadata rows; nothing is created or torn down.
 *
 * Checks:
 *   RVF1 — Fields + OrderBy on a column NOT in Fields: sorts correctly, sort column not leaked
 *   RVF2 — count_only + Aggregates together: zero rows, TotalRowCount AND aggregates populated
 *   RVF3 — MaxRows + Aggregates: the aggregate reflects the FULL set, not the capped page
 *   RVF4 — StartRow past the end: empty page, no error, TotalRowCount still full
 *   RVF5 — empty entity (0 rows) across every ResultType: clean empties everywhere
 *   RVF6 — ExtraFilter literal binding safety: apostrophes / unicode / very long strings are
 *          accepted (not injection-refused) and match literally
 *
 * Deliberately NOT implemented here:
 *   - "Fields projection matches the `|f:` client fingerprint slot" — pinned verbatim by
 *     client-cache C4/C5/C7 (per-Fields client slots, no cross-subset serving); duplicating
 *     it here would re-test the same slot mechanics with no added assertion power.
 */
import { RunView } from '@memberjunction/core';
import type { EntityInfo, RunViewResult, AggregateResult } from '@memberjunction/core';
import { Assert, AssertEqual, AssertRowShape } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Large, stable, single-uuid-PK entity with a numeric non-PK column (Sequence). */
const FIELDS_ENTITY = 'MJ: Entity Fields';

/** UUIDs come back uppercase on SQL Server and lowercase on PostgreSQL — compare normalized. */
function normId(id: string): string {
    return id.trim().toLowerCase();
}

/** Fail loudly on a failed RunView rather than silently asserting over an empty array. */
function requireSuccess(r: RunViewResult, what: string): void {
    Assert(r.Success === true, `${what} failed: ${r.ErrorMessage ?? '(no message)'}`);
}

function aggregateValue(results: readonly AggregateResult[] | undefined, alias: string): number {
    const hit = (results ?? []).find(a => a.alias === alias);
    Assert(hit != null, `aggregate '${alias}' missing from AggregateResults`);
    Assert(!hit!.error, `aggregate '${alias}' returned an error: ${hit!.error}`);
    const n = Number(hit!.value);
    Assert(Number.isFinite(n), `aggregate '${alias}' value is not numeric: ${JSON.stringify(hit!.value)}`);
    return n;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Discovered universe — MJ: Entity Fields rows of the first two MJ: Entities, memoized
// ─────────────────────────────────────────────────────────────────────────────────────────

interface FeatureUniverse {
    /** `EntityID IN ('a','b') AND Sequence IS NOT NULL` — the bounded predicate every leg reuses. */
    Filter: string;
    Rows: Array<{ ID: string; Sequence: number }>;
}

let universeMemo: FeatureUniverse | null = null;

/** Discover (never create) a bounded, Sequence-bearing universe with ≥2 distinct Sequence values. */
async function getUniverse(ctx: IntegrationCheckContext): Promise<FeatureUniverse> {
    if (universeMemo) {
        return universeMemo;
    }
    const rv = new RunView();
    const parents = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Entities', Fields: ['ID'], OrderBy: 'ID', MaxRows: 2, ResultType: 'simple' }, ctx.User,
    );
    requireSuccess(parents, 'universe discovery (MJ: Entities)');
    Assert(parents.Results.length === 2, `universe discovery needs 2 entities, got ${parents.Results.length}`);

    const filter = `EntityID IN ('${parents.Results.map(x => x.ID).join("','")}') AND Sequence IS NOT NULL`;
    const rows = await rv.RunView<{ ID: string; Sequence: number }>(
        { EntityName: FIELDS_ENTITY, Fields: ['ID', 'Sequence'], ExtraFilter: filter, IgnoreMaxRows: true, ResultType: 'simple' },
        ctx.User,
    );
    requireSuccess(rows, `universe discovery (${FIELDS_ENTITY})`);
    Assert(rows.Results.length >= 5, `universe too small: ${rows.Results.length} rows (need ≥ 5)`);
    const distinct = new Set(rows.Results.map(r => Number(r.Sequence)));
    Assert(distinct.size >= 2, 'universe must span ≥2 distinct Sequence values — the ordering legs would be vacuous');

    universeMemo = { Filter: filter, Rows: rows.Results };
    return universeMemo;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVF1 — Fields + OrderBy on a column NOT in Fields
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVF1: NamedCheck = {
    Id: 'runview-features.RVF1',
    Name: 'RVF1: OrderBy on a column NOT in Fields still sorts correctly and does not leak the sort column',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const rv = new RunView();
        const orderBy = 'Sequence DESC, ID ASC';

        // Reference: same filter + order WITH the sort column, so the expected ID order is known.
        const reference = await rv.RunView<{ ID: string; Sequence: number }>(
            { EntityName: FIELDS_ENTITY, Fields: ['Sequence'], ExtraFilter: u.Filter, OrderBy: orderBy, IgnoreMaxRows: true, ResultType: 'simple' },
            ctx.User,
        );
        requireSuccess(reference, 'RVF1 reference read');
        Assert(reference.Results.length >= 3, `RVF1 needs ≥3 rows, got ${reference.Results.length}`);

        // Probe: project ONLY Name — the sort column (Sequence) is not requested.
        const projected = await rv.RunView<{ ID: string; Name: string }>(
            { EntityName: FIELDS_ENTITY, Fields: ['Name'], ExtraFilter: u.Filter, OrderBy: orderBy, IgnoreMaxRows: true, ResultType: 'simple' },
            ctx.User,
        );
        requireSuccess(projected, 'RVF1 projected read');
        AssertEqual(projected.Results.length, reference.Results.length, 'RVF1 projection must not change the row count');
        AssertRowShape(projected.Results[0] as unknown as Record<string, unknown>, ['ID', 'Name'],
            'RVF1 the unprojected sort column must NOT leak into the returned shape');

        const referenceOrder = reference.Results.map(r => normId(r.ID)).join('|');
        const projectedOrder = projected.Results.map(r => normId(r.ID)).join('|');
        AssertEqual(projectedOrder, referenceOrder,
            'RVF1 projecting away the sort column must not change the server-side sort order');
        console.log(`      → ${projected.Results.length} rows sorted by an unprojected column, shape stayed {ID, Name}`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVF2 — count_only + Aggregates together
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVF2: NamedCheck = {
    Id: 'runview-features.RVF2',
    Name: 'RVF2: count_only + Aggregates — zero rows, but BOTH TotalRowCount and the aggregate come back',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        // Ground truth (GenericDatabaseProvider.InternalRunView): the aggregate query executes in
        // parallel regardless of ResultType, so count_only must still deliver AggregateResults.
        const u = await getUniverse(ctx);
        const r = await new RunView().RunView(
            { EntityName: FIELDS_ENTITY, ExtraFilter: u.Filter, ResultType: 'count_only', Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }] },
            ctx.User,
        );
        requireSuccess(r, 'RVF2 count_only + Aggregates read');
        AssertEqual(r.Results.length, 0, 'RVF2 count_only must return zero rows even with Aggregates attached');
        AssertEqual(r.TotalRowCount, u.Rows.length, 'RVF2 TotalRowCount must match the discovered universe');
        AssertEqual(aggregateValue(r.AggregateResults, 'Cnt'), u.Rows.length,
            'RVF2 the aggregate must be computed and agree with TotalRowCount');
        console.log(`      → count_only carried both TotalRowCount=${r.TotalRowCount} and COUNT(*)=${r.TotalRowCount}`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVF3 — MaxRows + Aggregates
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVF3: NamedCheck = {
    Id: 'runview-features.RVF3',
    Name: 'RVF3: MaxRows caps the rows but the aggregate (SUM) still reflects the FULL matching set',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const expectedSum = u.Rows.reduce((a, r) => a + Number(r.Sequence), 0);
        const cap = 2;
        Assert(u.Rows.length > cap, `RVF3 needs a universe larger than MaxRows=${cap}`);

        const r = await new RunView().RunView(
            {
                EntityName: FIELDS_ENTITY,
                Fields: ['ID'],
                ExtraFilter: u.Filter,
                MaxRows: cap,
                ResultType: 'simple',
                Aggregates: [{ expression: 'SUM(Sequence)', alias: 'SumSeq' }, { expression: 'COUNT(*)', alias: 'Cnt' }],
            },
            ctx.User,
        );
        requireSuccess(r, 'RVF3 MaxRows + Aggregates read');
        AssertEqual(r.Results.length, cap, 'RVF3 MaxRows must still cap the returned rows');
        AssertEqual(aggregateValue(r.AggregateResults, 'Cnt'), u.Rows.length, 'RVF3 COUNT(*) must ignore MaxRows');
        AssertEqual(aggregateValue(r.AggregateResults, 'SumSeq'), expectedSum,
            'RVF3 SUM(Sequence) must be computed over the FULL matching set, not the capped page');
        console.log(`      → ${cap} rows returned, SUM=${expectedSum} computed over all ${u.Rows.length} matching rows`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVF4 — StartRow past the end
// ─────────────────────────────────────────────────────────────────────────────────────────

const RVF4: NamedCheck = {
    Id: 'runview-features.RVF4',
    Name: 'RVF4: StartRow past the end of the result set — empty page, no error, TotalRowCount still full',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const u = await getUniverse(ctx);
        const r = await new RunView().RunView(
            {
                EntityName: FIELDS_ENTITY,
                Fields: ['ID'],
                ExtraFilter: u.Filter,
                OrderBy: 'ID ASC',
                StartRow: u.Rows.length + 100,
                MaxRows: 10,
                ResultType: 'simple',
            },
            ctx.User,
        );
        requireSuccess(r, 'RVF4 past-the-end page (must not error)');
        AssertEqual(r.Results.length, 0, 'RVF4 a page past the end must be empty');
        AssertEqual(r.TotalRowCount, u.Rows.length, 'RVF4 TotalRowCount must still report the full matching set');
        console.log(`      → offset ${u.Rows.length + 100} over ${u.Rows.length} rows returned a clean empty page (TotalRowCount=${r.TotalRowCount})`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVF5 — empty entity across every ResultType
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Discover the first readable entity with ZERO rows (dev DBs always have some). */
async function discoverEmptyEntity(ctx: IntegrationCheckContext): Promise<EntityInfo | null> {
    const rv = new RunView();
    const candidates = [...ctx.Provider.Entities]
        .filter(e => e.IncludeInAPI !== false && e.AllowAllRowsAPI !== false)
        .sort((a, b) => a.Name.localeCompare(b.Name));
    for (const entity of candidates) {
        try {
            const r = await rv.RunView({ EntityName: entity.Name, ResultType: 'count_only' }, ctx.User);
            if (r.Success && r.TotalRowCount === 0) {
                return entity;
            }
        } catch {
            // unreadable candidate — keep scanning; RVF5 skips only if NOTHING is empty
        }
    }
    return null;
}

const RVF5: NamedCheck = {
    Id: 'runview-features.RVF5',
    Name: 'RVF5: an empty entity returns clean empties across simple / entity_object / count_only (+ COUNT aggregate 0)',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        const entity = await discoverEmptyEntity(ctx);
        if (!entity) {
            console.warn('      ⚠ RVF5 SKIPPED — every readable entity in this deployment has at least one row; the empty-set branch is unreachable here.');
            return;
        }
        const rv = new RunView();

        const simple = await rv.RunView(
            { EntityName: entity.Name, ResultType: 'simple', Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }] }, ctx.User,
        );
        requireSuccess(simple, `RVF5 simple read of empty '${entity.Name}'`);
        AssertEqual(simple.Results.length, 0, 'RVF5 simple must return zero rows');
        AssertEqual(simple.TotalRowCount ?? 0, 0, 'RVF5 simple TotalRowCount must be 0');
        AssertEqual(aggregateValue(simple.AggregateResults, 'Cnt'), 0, 'RVF5 COUNT(*) over an empty set must be 0');

        const entityObj = await rv.RunView({ EntityName: entity.Name, ResultType: 'entity_object' }, ctx.User);
        requireSuccess(entityObj, `RVF5 entity_object read of empty '${entity.Name}'`);
        AssertEqual(entityObj.Results.length, 0, 'RVF5 entity_object must return zero rows');

        const countOnly = await rv.RunView({ EntityName: entity.Name, ResultType: 'count_only' }, ctx.User);
        requireSuccess(countOnly, `RVF5 count_only read of empty '${entity.Name}'`);
        AssertEqual(countOnly.TotalRowCount, 0, 'RVF5 count_only TotalRowCount must be 0');
        AssertEqual(countOnly.Results.length, 0, 'RVF5 count_only must return zero rows');
        console.log(`      → '${entity.Name}' (0 rows): all three ResultTypes + COUNT(*) returned clean empties`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// RVF6 — ExtraFilter literal binding safety
// ─────────────────────────────────────────────────────────────────────────────────────────

/** One literal probe: the value under test and the row count it must produce. */
interface LiteralProbe {
    Label: string;
    Clause: string;
    ExpectedRows: number;
}

const RVF6: NamedCheck = {
    Id: 'runview-features.RVF6',
    Name: 'RVF6: ExtraFilter literals — escaped apostrophes, unicode, and very long strings bind safely (no refusal, no injection)',
    Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
        // The injection guard must not confuse HOSTILE SQL (RVM8/V3 territory) with hostile-
        // LOOKING but properly-escaped literal VALUES. Every probe here must be ACCEPTED and
        // match literally. The control proves the same code path returns rows when it should.
        const entitiesEntity = ctx.Provider.EntityByName('MJ: Entities');
        Assert(entitiesEntity != null, "entity 'MJ: Entities' not found in metadata");
        const longValue = 'x'.repeat(600);
        const probes: LiteralProbe[] = [
            { Label: 'escaped apostrophes', Clause: `Name = 'O''Brien — integration ''quote'' probe'`, ExpectedRows: 0 },
            { Label: 'unicode + emoji', Clause: `Name = '日本語テスト🚀 zzz-probe'`, ExpectedRows: 0 },
            { Label: `600-char literal`, Clause: `Name = '${longValue}'`, ExpectedRows: 0 },
            { Label: 'control (existing value)', Clause: `Name = '${entitiesEntity!.Name}'`, ExpectedRows: 1 },
        ];
        const rv = new RunView();
        for (const p of probes) {
            const r = await rv.RunView(
                { EntityName: 'MJ: Entities', Fields: ['ID'], ExtraFilter: p.Clause, ResultType: 'simple' }, ctx.User,
            );
            Assert(r.Success === true, `RVF6 [${p.Label}] was refused/failed — benign literals must bind cleanly: ${r.ErrorMessage ?? ''}`);
            AssertEqual(r.Results.length, p.ExpectedRows, `RVF6 [${p.Label}] row count`);
        }
        console.log(`      → 3 hostile-looking literals bound cleanly to 0 rows; control matched exactly 1`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────────────────

export const RunViewFeatureChecks: NamedCheck[] = [RVF1, RVF2, RVF3, RVF4, RVF5, RVF6];

for (const check of RunViewFeatureChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
