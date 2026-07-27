/**
 * pg-parity.checks.ts — the 'pg-parity' bundle: "Domain 8 — PostgreSQL Parity" from
 * packages/TestingFramework/integration-test-suite/docs/test-catalog.md.
 *
 * ── WHY THIS BUNDLE RUNS ON *BOTH* PLATFORMS ────────────────────────────────────────────────
 * The name says PostgreSQL, but the bundle deliberately carries NO platform declaration, so it
 * executes on SQL Server too. That is the whole design: every check here asserts a
 * platform-INDEPENDENT invariant ("a boolean round-trips as a boolean", "every row is visited
 * exactly once"), so SQL Server is the baseline oracle. A check that passes on SQL Server and
 * fails on PostgreSQL is a genuine parity bug in the PostgreSQL provider; a check that fails on
 * both is a bug in the check itself. Running it on one platform only would lose that signal and
 * leave us unable to tell the two apart.
 *
 * The name is kept as `pg-parity` because the *motivation* is PostgreSQL parity, and renaming it
 * to something platform-neutral would obscure why these particular invariants were chosen.
 *
 * ── TRANSPORT: SERVER (documented exception) ────────────────────────────────────────────────
 * The repo doctrine is CLIENT-FIRST, but these checks exist to exercise the DATA PROVIDER's own
 * SQL generation — identifier quoting, type marshalling, OFFSET/keyset paging — on each dialect.
 * Routing them over GraphQL would put MJAPI's serialization between the assertion and the thing
 * under test, so a PostgreSQL type-marshalling bug could be masked (or invented) by the wire
 * layer. The PostgreSQL CI lane also runs no MJAPI, so a client-transport bundle could not
 * execute there at all.
 *
 * ── FIXTURES ────────────────────────────────────────────────────────────────────────────────
 * The mutating checks create their own `MJ: User Views` row and delete it in a `finally`, the
 * shipped pattern (see view-execution V8). No BundleLifecycle is registered because nothing is
 * shared between checks — each owns and cleans up exactly what it created, so a crash mid-check
 * cannot orphan another check's fixture.
 *
 * ── CHECKS ──────────────────────────────────────────────────────────────────────────────────
 *   PG1 — CRUD + RunView round-trip: create → read → filter → update → delete            (MUT)
 *   PG2 — identifier quoting: mixed-case entity/field names survive projection,
 *         filtering and ordering                                                          (DET)
 *   PG4 — value round-trips: UUID, boolean and datetime come back as the right JS types   (MUT)
 *   PG5 — pagination parity: OFFSET pages and AfterKey keyset walks agree with the
 *         full set, with no duplicates and no gaps                                        (DET)
 *
 * PG3 (composite-PK CRUD, anchored to #3112) is deliberately NOT implemented. No multi-column
 * primary key exists anywhere in the v5 schema — every generated entity has a single-`ID` Load
 * signature — so the check would have no target and would degrade to the same skip-as-pass it
 * exists to eliminate. Its anchored defect is a CodeGen-TIME bug in generated PostgreSQL CRUD
 * bodies, which a lane that provisions from committed migrations and runs no `mj codegen` cannot
 * reach; it already carries unit regressions in PostgreSQLCodeGenProvider.test.ts. Recorded as a
 * documented gap in the catalog rather than shipped as a check that cannot fail.
 */
import { RunView, CompositeKey } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, RunViewResult } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJUserViewEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/**
 * The read-side entity: stable, many rows, single-column uniqueidentifier PK, and — the point
 * of PG2 — a physical table and columns whose names carry uppercase letters.
 */
const READ_ENTITY = 'MJ: Entity Fields';
/** The write-side entity: user-scoped, cheap to create, and carries uuid/bool/datetime columns. */
const WRITE_ENTITY = 'MJ: User Views';
/** Below this many rows the pagination legs prove nothing. */
const MIN_PAGING_ROWS = 12;
/** Page size for the pagination legs — small enough to force several pages. */
const PAGE_SIZE = 5;
/**
 * How many rows the pagination legs walk. BOTH walks are bounded to this same window: the
 * read entity has thousands of rows, and an unbounded keyset walk would page through all of
 * them — slow, and impossible to bound with a sane page cap.
 */
const PAGING_WINDOW = 60;

/** Narrow row shape for the read legs. Every field name here is deliberately mixed-case. */
interface FieldRow {
    ID: string;
    Name: string;
    EntityID: string;
    Sequence: number;
}

/** Marks fixtures so a crashed run leaves something greppable behind. */
function fixtureName(tag: string): string {
    return `it-pg-parity-${tag} ${Date.now().toString(36)} (mj-integration-test — safe to delete)`;
}

/** Fail loudly on a RunView error rather than asserting against an empty Results array. */
function requireSuccess(result: { Success: boolean; ErrorMessage?: string }, what: string): void {
    Assert(result.Success, `${what} failed: ${result.ErrorMessage ?? 'no error message'}`);
}

/** Read the fixture back by primary key. Used for every read-back leg so they cannot drift apart. */
async function readViewById(
    id: string, fields: string[], user: UserInfo, what: string
): Promise<Record<string, unknown>[]> {
    const result = await new RunView().RunView<Record<string, unknown>>({
        EntityName: WRITE_ENTITY,
        ExtraFilter: `ID = '${id}'`,
        Fields: fields,
        ResultType: 'simple'
    }, user);
    requireSuccess(result, what);
    return result.Results;
}

/**
 * Create a User View owned by the context user. Returns the saved entity; the caller is
 * responsible for deleting it in a `finally`.
 */
async function createUserView(
    provider: IMetadataProvider, user: UserInfo, tag: string
): Promise<MJUserViewEntity> {
    const entity = provider.EntityByName(READ_ENTITY);
    Assert(!!entity, `${READ_ENTITY} is not present in metadata — the fixture cannot be built`);

    const view = await provider.GetEntityObject<MJUserViewEntity>(WRITE_ENTITY, user);
    Assert(view.NewRecord(), `could not initialize a new ${WRITE_ENTITY} object`);
    view.Name = fixtureName(tag);
    view.EntityID = entity!.ID;
    view.UserID = user.ID;
    view.IsShared = false;
    view.IsDefault = false;
    Assert(await view.Save(), `${tag} fixture create failed: ${view.LatestResult?.CompleteMessage}`);
    return view;
}

const PG1: NamedCheck = {
    Id: 'pg-parity.PG1',
    Name: 'PG1: create → read → filter → update → delete round-trips identically on both platforms',
    RequiresMutation: true,
    Fn: async (ctx: IntegrationCheckContext) => {
        const view = await createUserView(ctx.Provider, ctx.User, 'pg1');
        const createdId = view.ID;
        Assert(!!createdId, 'PG1: the provider returned no primary key after Save() — the create leg never round-tripped');

        try {
            // READ by filter — exercises the generated WHERE against a uniqueidentifier/uuid column.
            const byId = await readViewById(createdId, ['ID', 'Name'], ctx.User, 'PG1 read-back by ID');
            AssertEqual(byId.length, 1, 'PG1: filtering on the new row must return exactly one row');
            Assert(UUIDsEqual(byId[0].ID as string, createdId),
                `PG1: read-back ID '${byId[0].ID}' does not match the created ID '${createdId}'`);
            AssertEqual(byId[0].Name, view.Name, 'PG1: the Name written must be the Name read back');

            // UPDATE — a second write path over the same row.
            const updatedName = `${view.Name} [updated]`;
            view.Name = updatedName;
            Assert(await view.Save(), `PG1 update failed: ${view.LatestResult?.CompleteMessage}`);

            const afterUpdate = await readViewById(createdId, ['ID', 'Name'], ctx.User, 'PG1 read-back after update');
            AssertEqual(afterUpdate.length, 1, 'PG1: the row must still be there after an update');
            AssertEqual(afterUpdate[0].Name, updatedName, 'PG1: the updated Name must be visible on re-read');
        } finally {
            await view.Delete();
        }

        // DELETE must actually remove the row. Verified AFTER the finally: a throw inside the
        // finally would replace whatever error the try block raised, so cleanup asserts out here.
        const afterDelete = await readViewById(createdId, ['ID'], ctx.User, 'PG1 read-back after delete');
        AssertEqual(afterDelete.length, 0, 'PG1: the row must be gone after Delete()');
    },
};

const PG2: NamedCheck = {
    Id: 'pg-parity.PG2',
    Name: 'PG2: mixed-case identifiers survive projection, filtering and ordering (quoting is not dropped)',
    Fn: async (ctx: IntegrationCheckContext) => {
        // PostgreSQL folds UNQUOTED identifiers to lower case, so a provider that emits
        // `SELECT EntityID FROM __mj.EntityField` instead of `SELECT "EntityID" FROM "__mj"."EntityField"`
        // fails with `column "entityid" does not exist`. SQL Server is case-insensitive and would
        // accept both, which is exactly why it makes a useful baseline: this check must pass there
        // unconditionally, so a failure isolates the dialect.
        //
        // All three SQL positions are exercised deliberately — projection, predicate and ORDER BY
        // are built by different code paths, and quoting has regressed in one without the others.
        const anchor = await new RunView().RunView<FieldRow>({
            EntityName: READ_ENTITY,
            Fields: ['ID', 'Name', 'EntityID', 'Sequence'],
            MaxRows: 1,
            ResultType: 'simple'
        }, ctx.User);
        requireSuccess(anchor, 'PG2 anchor read');
        Assert(anchor.Results.length === 1, `PG2 would be vacuous: ${READ_ENTITY} returned no rows`);
        const anchorRow = anchor.Results[0];

        const projected = await new RunView().RunView<FieldRow>({
            EntityName: READ_ENTITY,
            Fields: ['ID', 'Name', 'EntityID', 'Sequence'],
            ExtraFilter: `EntityID = '${anchorRow.EntityID}'`,
            OrderBy: 'Sequence ASC, Name ASC',
            ResultType: 'simple'
        }, ctx.User);
        requireSuccess(projected, 'PG2 mixed-case projection + filter + order');
        Assert(projected.Results.length > 0,
            'PG2: filtering on a mixed-case column returned nothing — quoting was likely dropped');

        // Every projected row must carry the mixed-case keys. A folded identifier surfaces here as
        // an `entityid` key (or an undefined value) rather than as a query error on some providers.
        for (const row of projected.Results) {
            Assert(Object.prototype.hasOwnProperty.call(row, 'EntityID'),
                `PG2: projected row is missing the mixed-case key 'EntityID' — got [${Object.keys(row).join(', ')}]`);
            Assert(row.EntityID != null && UUIDsEqual(row.EntityID, anchorRow.EntityID),
                `PG2: the mixed-case filter did not constrain the result set (row EntityID '${row.EntityID}')`);
        }

        // ORDER BY on mixed-case columns must actually order.
        const sequences = projected.Results.map(r => r.Sequence).filter(s => s != null);
        for (let i = 1; i < sequences.length; i++) {
            Assert(sequences[i - 1] <= sequences[i],
                `PG2: ORDER BY on a mixed-case column did not sort (position ${i}: ${sequences[i - 1]} > ${sequences[i]})`);
        }
    },
};

const PG4: NamedCheck = {
    Id: 'pg-parity.PG4',
    Name: 'PG4: UUID, boolean and datetime values round-trip as the right JS types on both platforms',
    RequiresMutation: true,
    Fn: async (ctx: IntegrationCheckContext) => {
        const view = await createUserView(ctx.Provider, ctx.User, 'pg4');
        const createdId = view.ID;
        try {
            // Flip both booleans so the round-trip cannot pass by accident on a default value.
            view.IsShared = true;
            view.IsDefault = false;
            Assert(await view.Save(), `PG4 boolean write failed: ${view.LatestResult?.CompleteMessage}`);

            const reread = await ctx.Provider.GetEntityObject<MJUserViewEntity>(WRITE_ENTITY, ctx.User);
            Assert(await reread.Load(view.ID), `PG4: could not reload the fixture by primary key '${view.ID}'`);

            // BOOLEAN. PostgreSQL returns real booleans; SQL Server returns BIT. Either driver
            // handing back 1/0, 't'/'f' or 'true'/'false' would still be *truthy-correct* while
            // breaking every `=== true` in product code, so assert the JS type, not just the value.
            AssertEqual(typeof reread.IsShared, 'boolean',
                `PG4: IsShared came back as ${typeof reread.IsShared} (${JSON.stringify(reread.IsShared)}), not a boolean`);
            AssertEqual(reread.IsShared, true, 'PG4: IsShared was written true and must read back true');
            AssertEqual(reread.IsDefault, false, 'PG4: IsDefault was written false and must read back false');

            // UUID. SQL Server returns uppercase, PostgreSQL lowercase — a real, shipped
            // difference. Case-insensitive comparison is the contract (UUIDsEqual); a raw ===
            // here would pass on one platform and fail on the other for no semantic reason.
            Assert(UUIDsEqual(reread.ID, view.ID),
                `PG4: reloaded ID '${reread.ID}' does not match '${view.ID}'`);
            Assert(UUIDsEqual(reread.UserID, ctx.User.ID),
                `PG4: UserID '${reread.UserID}' does not match the context user '${ctx.User.ID}'`);
            AssertEqual(typeof reread.ID, 'string', 'PG4: a uniqueidentifier/uuid must surface as a string');

            // DATETIME. Both drivers must hand back a real Date, not an ISO string.
            Assert(reread.__mj_CreatedAt instanceof Date,
                `PG4: __mj_CreatedAt came back as ${typeof reread.__mj_CreatedAt}, not a Date`);
            Assert(!Number.isNaN(reread.__mj_CreatedAt.getTime()),
                'PG4: __mj_CreatedAt is an Invalid Date — the driver parsed the timestamp incorrectly');

            // The same boolean must survive the RunView read path too, not just Load(). This is a
            // separate marshalling path (view projection rather than the single-row fetch).
            //
            // NOTE: this asserts the projected VALUE and deliberately does NOT filter on a boolean
            // literal. `ExtraFilter` is passed through as raw SQL, and a boolean literal cannot be
            // written portably there — SQL Server needs `= 1`, PostgreSQL needs `= true`. Hand-
            // writing either would make this bundle dialect-specific, which is exactly what it
            // exists not to be. Boolean-literal filter marshalling belongs to a check that owns a
            // per-dialect expectation; recorded as a gap rather than faked here.
            const projected = await readViewById(view.ID, ['ID', 'IsShared', 'IsDefault'], ctx.User,
                'PG4 boolean projection through RunView');
            AssertEqual(projected.length, 1, 'PG4: the fixture must be visible through RunView');
            AssertEqual(typeof projected[0].IsShared, 'boolean',
                `PG4: RunView projected IsShared as ${typeof projected[0].IsShared}, not a boolean`);
            AssertEqual(projected[0].IsShared, true, 'PG4: RunView must project the written true value');
            AssertEqual(projected[0].IsDefault, false, 'PG4: RunView must project the written false value');
        } finally {
            await view.Delete();
        }

        // Same reasoning as PG1: cleanup is verified outside the finally so a failed delete is a
        // reported failure rather than a silently leaked fixture.
        const afterDelete = await readViewById(createdId, ['ID'], ctx.User, 'PG4 read-back after delete');
        AssertEqual(afterDelete.length, 0, 'PG4: the fixture must be gone after Delete()');
    },
};

/**
 * Walk the first `window` rows using OFFSET pagination (`StartRow`), returning every id seen
 * in order. SQL Server generates OFFSET/FETCH here and PostgreSQL generates LIMIT/OFFSET, so
 * the two dialects reach this result by different generated SQL.
 */
async function walkByOffset(window: number, user: UserInfo): Promise<string[]> {
    const seen: string[] = [];
    for (let startRow = 0; startRow < window; startRow += PAGE_SIZE) {
        const page = await new RunView().RunView<FieldRow>({
            EntityName: READ_ENTITY,
            Fields: ['ID', 'Name', 'EntityID', 'Sequence'],
            OrderBy: 'ID ASC',
            StartRow: startRow,
            MaxRows: PAGE_SIZE,
            ResultType: 'simple'
        }, user);
        requireSuccess(page, `PG5 OFFSET page at StartRow=${startRow}`);
        seen.push(...page.Results.map(r => r.ID.toLowerCase()));
    }
    return seen;
}

/**
 * Walk the first `window` rows using keyset pagination (`AfterKey`), returning every id seen.
 *
 * Bounded twice over: it stops once `window` rows have been collected, and the loop itself is
 * capped at one page per expected page plus a slack page. The read entity has thousands of
 * rows, so an unbounded walk would page through all of them — and a provider that ignored
 * `AfterKey` entirely would loop forever. Hitting the cap is surfaced by the caller as a
 * coverage shortfall rather than swallowed.
 */
async function walkByKeyset(window: number, user: UserInfo): Promise<string[]> {
    const MAX_PAGES = Math.ceil(window / PAGE_SIZE) + 1;
    const seen: string[] = [];
    let afterKey: CompositeKey | undefined = undefined;

    for (let pages = 0; pages < MAX_PAGES && seen.length < window; pages++) {
        const page: RunViewResult<FieldRow> = await new RunView().RunView<FieldRow>({
            EntityName: READ_ENTITY,
            Fields: ['ID', 'Name', 'EntityID', 'Sequence'],
            OrderBy: 'ID ASC',
            AfterKey: afterKey,
            MaxRows: PAGE_SIZE,
            ResultType: 'simple'
        }, user);
        requireSuccess(page, `PG5 keyset page ${pages + 1}`);
        if (page.Results.length === 0) {
            break; // end of the set
        }
        seen.push(...page.Results.map(r => r.ID.toLowerCase()));
        afterKey = CompositeKey.FromID(page.Results[page.Results.length - 1].ID);
        if (page.Results.length < PAGE_SIZE) {
            break; // a short page signals the end of the set
        }
    }
    return seen;
}

const PG5: NamedCheck = {
    Id: 'pg-parity.PG5',
    Name: 'PG5: OFFSET pagination and AfterKey keyset walks cover the set exactly once on both platforms',
    Fn: async (ctx: IntegrationCheckContext) => {
        // OFFSET/FETCH (SQL Server) and LIMIT/OFFSET (PostgreSQL) are generated by different
        // provider code, as are the two keyset comparison predicates. Both must walk the SAME
        // window — the first PAGING_WINDOW rows by `ID ASC` — and produce a partition of it:
        // no duplicates, no gaps, nothing visited twice.
        const full = await new RunView().RunView<FieldRow>({
            EntityName: READ_ENTITY,
            Fields: ['ID', 'Name', 'EntityID', 'Sequence'],
            OrderBy: 'ID ASC',
            MaxRows: PAGING_WINDOW,
            ResultType: 'simple'
        }, ctx.User);
        requireSuccess(full, 'PG5 full-window read');
        Assert(full.Results.length >= MIN_PAGING_ROWS,
            `PG5 would be vacuous: needs at least ${MIN_PAGING_ROWS} rows, found ${full.Results.length}`);
        const window = full.Results.length;
        const expected = new Set(full.Results.map(r => r.ID.toLowerCase()));

        for (const [label, seen] of [
            ['OFFSET', await walkByOffset(window, ctx.User)],
            ['keyset', await walkByKeyset(window, ctx.User)],
        ] as const) {
            const seenSet = new Set(seen);
            AssertEqual(seen.length, seenSet.size,
                `PG5: the ${label} walk returned ${seen.length - seenSet.size} duplicate row(s)`);
            // Coverage shortfall is how an ignored/mis-generated AfterKey surfaces: the walk stops
            // early (or repeats page 1, caught above as duplicates) instead of covering the window.
            AssertEqual(seenSet.size, expected.size,
                `PG5: the ${label} walk covered ${seenSet.size} of ${expected.size} rows in the window`);
            for (const id of expected) {
                Assert(seenSet.has(id), `PG5: the ${label} walk never returned row '${id}' (a gap)`);
            }
        }
    },
};

export const PgParityChecks: NamedCheck[] = [PG1, PG2, PG4, PG5];

for (const check of PgParityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// NO platform declaration on purpose — see the "WHY THIS BUNDLE RUNS ON *BOTH* PLATFORMS" note
// in the file header. SQL Server is the baseline oracle that makes a PostgreSQL failure legible.
