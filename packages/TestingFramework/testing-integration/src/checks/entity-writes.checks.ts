/**
 * entity-writes.checks.ts — the 'entity-writes' bundle (EW1–EW8): the core data WRITE-SIDE
 * contract, exercised CLIENT-FIRST over the real GraphQL wire (Domain 2 of the integration-test
 * expansion catalog).
 *
 * Everything here goes through `GraphQLDataProvider` against a live MJAPI, so each check proves the
 * whole chain — client BaseEntity → mutation serialization → resolver → server entity subclass →
 * SQL → the returned view row — not just an in-process provider call.
 *
 *   - EW1 (CD1)  Record-change fidelity: create + 2 targeted updates produce exactly 3 RecordChanges
 *                with the right Type and before/after JSON; the versioning table does not version itself.
 *   - EW2 (CD2)  Virtual-field save-capture order: the row returned by a save carries the correct
 *                values for the VIEW-only columns (Parent / RootParentID), i.e. no @ResultTable skew.
 *   - EW3 (CD3)  Keyset pagination completeness: an AfterKey walk over a known fixture set visits
 *                every row exactly once and signals end-of-data with a short page.
 *   - EW4 (CD4)  Keyset guardrails: StartRow / non-PK OrderBy / wrong-shape AfterKey are refused,
 *                while the otherwise-identical valid call succeeds (positive control).
 *   - EW5 (CD5)  Linger-invalidation-after-save: a save inside the dedup linger window drops the
 *                lingered RunView entry, so the very next identical view sees the new row.
 *   - EW6 (CD11) UUID case-insensitive FK round-trip: an UPPERCASE FK saved over the wire is found
 *                by a lowercase filter and vice versa.
 *   - EW7 (CD12) datetimeoffset round-trip: a non-UTC-offset instant survives save → in-memory →
 *                Load() → RunView to the millisecond.
 *   - EW8 (CD10) ClassFactory server-subclass resolution: a save that passes CLIENT validation is
 *                rejected by the server-only `*EntityServer` invariant — proof the resolver
 *                instantiated the higher-priority server subclass.
 *
 * MUTATION TIER: EW1/EW2/EW3/EW5/EW6/EW7 write to the database and therefore carry
 * `RequiresMutation: true` (they run only under RUN_MUTATION_TESTS=1). EW4 and EW8 are read-only —
 * EW8's saves are rejected during validation, before any INSERT is attempted.
 *
 * Fixtures are throwaway rows in `MJ: Action Categories` / `MJ: Lists`, name-prefixed per run and
 * tagged "(mj-integration-test — safe to delete)". No pre-existing record is ever mutated.
 */
import { RunView, CompositeKey, ProviderBase, EntitySaveOptions } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJActionCategoryEntity, MJListEntity, MJTagScopeEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext, EntityWritesFixture } from '../check';

const CATEGORY_ENTITY = 'MJ: Action Categories';
const LIST_ENTITY = 'MJ: Lists';
const RECORD_CHANGE_ENTITY = 'MJ: Record Changes';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Rows for the keyset walk (EW3) and its page size — 12 @ 5/page = 5 + 5 + 2, so the last page is short. */
const KEYSET_ROWS = 12;
const KEYSET_PAGE = 5;

/** Deliberately unresolvable IDs for EW8 — nothing is inserted, so these never reach a FK check. */
const MISSING_TAG_ID = '00000000-0000-0000-0000-0000000000fe';
const MISSING_SCOPE_RECORD_ID = '00000000-0000-0000-0000-0000000000fd';

/** Fetch the fixture (throws if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): EntityWritesFixture {
    Assert(ctx.EntityWritesFixture != null, 'entity-writes fixture missing (bundle Setup did not run)');
    return ctx.EntityWritesFixture!;
}

/**
 * Creates a throwaway Action Category over the wire and registers it for teardown.
 * Registration happens BEFORE the Save() assertion so a failed save still can't orphan a row.
 */
async function createCategory(
    ctx: IntegrationCheckContext, suffix: string, parentID?: string
): Promise<MJActionCategoryEntity> {
    const f = fx(ctx);
    const cat = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    cat.NewRecord();
    cat.Name = `${f.Prefix}-${suffix} ${FIXTURE_TAG}`;
    cat.Status = 'Active';
    if (parentID) {
        cat.ParentID = parentID;
    }
    const saved = await cat.Save();
    if (cat.ID) {
        f.CategoryIds.push(cat.ID);
    }
    Assert(saved, `creating fixture category '${suffix}' failed: ${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return cat;
}

/** One row of `MJ: Record Changes` as read over the wire (simple result → plain JSON values). */
interface RecordChangeRow {
    ID: string;
    EntityID: string;
    RecordID: string;
    Type: string;
    ChangesJSON: string | null;
    ChangesDescription: string | null;
    FullRecordJSON: string | null;
}

/** The per-field before/after shape MJ writes into `RecordChange.ChangesJSON`. */
interface FieldChange {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}

/**
 * `RecordChange.RecordID` stores the record's CompositeKey TEXT ("ID|<uuid>"), not the bare UUID —
 * so a naive `RecordID='<uuid>'` filter silently matches nothing. Pull the value half for comparison.
 */
function recordIdValue(recordID: string): string {
    const parts = recordID.split('|');
    return (parts[parts.length - 1] ?? '').trim();
}

/** All Record Changes written for one record since the bundle started, newest last. */
async function fetchRecordChanges(
    ctx: IntegrationCheckContext, entityID: string, recordID: string
): Promise<RecordChangeRow[]> {
    const f = fx(ctx);
    const result = await new RunView().RunView<RecordChangeRow>({
        EntityName: RECORD_CHANGE_ENTITY,
        ExtraFilter: `EntityID='${entityID}' AND ChangedAt >= '${f.StartedAtIso}'`,
        OrderBy: 'ChangedAt ASC',
        ResultType: 'simple',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `reading ${RECORD_CHANGE_ENTITY} failed: ${result.ErrorMessage}`);
    return (result.Results ?? []).filter(r => UUIDsEqual(recordIdValue(r.RecordID), recordID));
}

/** Parses ChangesJSON into its per-field map, asserting it is present and well-formed. */
function parseChanges(row: RecordChangeRow, label: string): Record<string, FieldChange> {
    Assert(!!row.ChangesJSON && row.ChangesJSON.trim().length > 0, `${label}: ChangesJSON is empty`);
    const parsed: unknown = JSON.parse(row.ChangesJSON!);
    Assert(parsed != null && typeof parsed === 'object', `${label}: ChangesJSON did not parse to an object`);
    return parsed as Record<string, FieldChange>;
}

/** Runs a view and asserts it succeeded, returning the (possibly empty) rows. */
async function runRows<T extends object>(params: RunViewParams, user: UserInfo, label: string): Promise<T[]> {
    const result = await new RunView().RunView<T>(params, user);
    Assert(result.Success, `${label} failed: ${result.ErrorMessage}`);
    return (result.Results ?? []) as T[];
}

export const EntityWritesChecks: NamedCheck[] = [
    {
        Id: 'entity-writes.EW1',
        Name: 'EW1: create + 2 updates write exactly 3 Record Changes with correct before/after JSON',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const cat = await createCategory(ctx, 'rc');
            const createdName = cat.Name;

            cat.Description = 'entity-writes EW1 description';
            Assert(await cat.Save(), `update 1 failed: ${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            cat.Status = 'Disabled';
            Assert(await cat.Save(), `update 2 failed: ${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            const changes = await fetchRecordChanges(ctx, f.ActionCategoryEntityID, cat.ID);
            AssertEqual(changes.length, 3, `Record Change count for ${cat.ID}`);

            // --- identify rows by CONTENT, not by array position (two updates can share a timestamp) ---
            const creates = changes.filter(c => c.Type === 'Create');
            const updates = changes.filter(c => c.Type === 'Update');
            AssertEqual(creates.length, 1, 'Create rows');
            AssertEqual(updates.length, 2, 'Update rows');

            const created: unknown = JSON.parse(creates[0].FullRecordJSON ?? '{}');
            AssertEqual((created as { Name?: string }).Name, createdName, 'Create row FullRecordJSON.Name');

            const descRow = updates.find(u => parseChanges(u, 'update').Description != null);
            Assert(descRow != null, 'no Update row captured the Description change');
            const desc = parseChanges(descRow!, 'Description update').Description;
            AssertEqual(desc.field, 'Description', 'Description change field name');
            AssertEqual(desc.oldValue, null, 'Description oldValue (before)');
            AssertEqual(desc.newValue, 'entity-writes EW1 description', 'Description newValue (after)');

            const statusRow = updates.find(u => parseChanges(u, 'update').Status != null);
            Assert(statusRow != null, 'no Update row captured the Status change');
            const status = parseChanges(statusRow!, 'Status update').Status;
            AssertEqual(status.oldValue, 'Active', 'Status oldValue (before)');
            AssertEqual(status.newValue, 'Disabled', 'Status newValue (after)');
            Assert(descRow!.ID !== statusRow!.ID, 'the two updates must be two DISTINCT Record Change rows');

            // The versioning table must not version itself — writing 3 RecordChanges above must not
            // have produced any RecordChange rows whose EntityID is 'MJ: Record Changes'.
            const meta = await runRows<{ ID: string }>({
                EntityName: RECORD_CHANGE_ENTITY,
                ExtraFilter: `EntityID='${f.RecordChangeEntityID}' AND ChangedAt >= '${f.StartedAtIso}'`,
                Fields: ['ID'], ResultType: 'simple', BypassCache: true
            }, ctx.User, 'self-versioning probe');
            AssertEqual(meta.length, 0, `${RECORD_CHANGE_ENTITY} must not record changes about itself`);

            console.log(`      → 3 Record Changes (1 Create, 2 Update) with exact before/after; 0 self-versioning rows`);
        }
    },
    {
        Id: 'entity-writes.EW2',
        Name: 'EW2: a save returns correct VIEW-only virtual-field values (no result-column skew)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const parent = await createCategory(ctx, 'vf-parent');
            const child = await createCategory(ctx, 'vf-child', parent.ID);

            // `Parent` and `RootParentID` exist ONLY on the view — they are populated from the row the
            // save returns. A column-order skew in that mapping shows up here as a wrong/blank value.
            AssertEqual(child.Parent, parent.Name, 'virtual Parent name captured on INSERT');
            Assert(UUIDsEqual(child.RootParentID ?? '', parent.ID), `virtual RootParentID on INSERT: got ${child.RootParentID}, expected ${parent.ID}`);
            AssertEqual(child.Status, 'Active', 'base column Status still correct alongside the virtuals');

            // Same contract on UPDATE: rename the parent, re-save the child, virtuals must refresh.
            parent.Name = `${parent.Name} v2`;
            Assert(await parent.Save(), `parent rename failed: ${parent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            child.Description = 'entity-writes EW2';
            Assert(await child.Save(), `child update failed: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            AssertEqual(child.Parent, parent.Name, 'virtual Parent name refreshed on UPDATE');
            AssertEqual(child.Description, 'entity-writes EW2', 'base column Description correct on UPDATE');

            console.log(`      → virtual Parent/RootParentID correct on both INSERT and UPDATE`);
        }
    },
    {
        Id: 'entity-writes.EW3',
        Name: 'EW3: an AfterKey walk visits every row exactly once and signals end-of-data',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const walkPrefix = `${f.Prefix}-ks`;
            const expected = new Set<string>();
            for (let i = 0; i < KEYSET_ROWS; i++) {
                const cat = await createCategory(ctx, `ks-${String(i).padStart(2, '0')}`);
                expected.add(cat.ID.toLowerCase());
            }
            AssertEqual(expected.size, KEYSET_ROWS, 'fixture rows created (distinct IDs)');

            const filter = `Name LIKE '${walkPrefix}%'`;
            const seen: string[] = [];
            let after: CompositeKey | undefined;
            let pages = 0;
            let lastPageSize = KEYSET_PAGE;
            while (lastPageSize === KEYSET_PAGE) {
                Assert(pages < KEYSET_ROWS, 'runaway pagination — the keyset cursor is not advancing');
                const rows = await runRows<{ ID: string }>({
                    EntityName: CATEGORY_ENTITY, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple',
                    OrderBy: 'ID ASC', MaxRows: KEYSET_PAGE, AfterKey: after, BypassCache: true
                }, ctx.User, `keyset page ${pages + 1}`);
                pages++;
                lastPageSize = rows.length;
                for (const row of rows) {
                    Assert(!seen.includes(row.ID.toLowerCase()), `duplicate row across keyset pages: ${row.ID}`);
                    seen.push(row.ID.toLowerCase());
                }
                if (rows.length > 0) {
                    after = CompositeKey.FromID(rows[rows.length - 1].ID);
                }
            }

            // Completeness is the real invariant: the walk's union must be EXACTLY the fixture set.
            // (Note: GUID ordering on SQL Server is NOT lexicographic, so no string-order assertion here.)
            AssertEqual(seen.length, KEYSET_ROWS, 'total rows visited by the keyset walk');
            for (const id of expected) {
                Assert(seen.includes(id), `keyset walk missed fixture row ${id}`);
            }
            AssertEqual(pages, Math.floor(KEYSET_ROWS / KEYSET_PAGE) + 1, 'page count');
            AssertEqual(lastPageSize, KEYSET_ROWS % KEYSET_PAGE, 'short final page is the end-of-data signal');

            console.log(`      → ${seen.length}/${KEYSET_ROWS} rows in ${pages} keyset pages, no duplicates, short final page`);
        }
    },
    {
        Id: 'entity-writes.EW4',
        Name: 'EW4: AfterKey guardrails refuse StartRow / non-PK OrderBy / wrong-shape keys',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Positive control FIRST: without it, "everything fails" would pass this check vacuously.
            // BypassCache is deliberate: a warm client-cache slot for this entity is served WITHOUT
            // re-applying MaxRows (observed live — a MaxRows:1 read returns the whole maintained
            // slot once saves have upserted into it), which would make this seed non-deterministic.
            const seedRows = await runRows<{ ID: string }>({
                EntityName: CATEGORY_ENTITY, Fields: ['ID'], MaxRows: 1, ResultType: 'simple', BypassCache: true
            }, ctx.User, 'seed row lookup');
            Assert(seedRows.length === 1, `${CATEGORY_ENTITY} has no rows — cannot seed the keyset guardrail check`);
            const seed = CompositeKey.FromID(seedRows[0].ID);

            const valid = await new RunView().RunView<{ ID: string }>({
                EntityName: CATEGORY_ENTITY, Fields: ['ID'], MaxRows: 3, ResultType: 'simple',
                OrderBy: 'ID ASC', AfterKey: seed, BypassCache: true
            }, ctx.User);
            Assert(valid.Success, `positive control: a valid AfterKey call must succeed (got: ${valid.ErrorMessage})`);

            // Each leg differs from the control by exactly ONE illegal ingredient.
            const startRowConflict = await new RunView().RunView({
                EntityName: CATEGORY_ENTITY, Fields: ['ID'], MaxRows: 3, ResultType: 'simple',
                OrderBy: 'ID ASC', AfterKey: seed, StartRow: 5, BypassCache: true
            }, ctx.User);
            Assert(!startRowConflict.Success, 'AfterKey combined with StartRow must be refused (StartRowConflict)');

            const orderByConflict = await new RunView().RunView({
                EntityName: CATEGORY_ENTITY, Fields: ['ID'], MaxRows: 3, ResultType: 'simple',
                OrderBy: 'Name ASC', AfterKey: seed, BypassCache: true
            }, ctx.User);
            Assert(!orderByConflict.Success, 'AfterKey with a non-PK OrderBy must be refused (IncompatibleOrderBy)');

            const wrongShape = new CompositeKey([{ FieldName: 'Name', Value: 'not-the-pk' }]);
            const shapeConflict = await new RunView().RunView({
                EntityName: CATEGORY_ENTITY, Fields: ['ID'], MaxRows: 3, ResultType: 'simple',
                AfterKey: wrongShape, BypassCache: true
            }, ctx.User);
            Assert(!shapeConflict.Success, 'AfterKey naming a non-PK column must be refused (AfterKeyShape)');

            // NOTE (reported, not asserted): all three refusals arrive as Success=false with a NULL
            // ErrorMessage — the AfterKeyNotSupportedError Reason/message does not survive the
            // GraphQL wire, so the documented "branch on Reason" caller pattern is unavailable to
            // clients. Asserted here only at the level the wire honestly guarantees today.
            console.log(`      → valid AfterKey OK; StartRow / non-PK OrderBy / wrong-shape key all refused`);
        }
    },
    {
        Id: 'entity-writes.EW5',
        Name: 'EW5: a save inside the linger window invalidates the lingered RunView',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            Assert(ProviderBase.DedupLingerMs > 0, 'linger window is disabled — EW5 cannot observe invalidation');
            const suffix = 'linger';
            const filter = `Name LIKE '${f.Prefix}-${suffix}%'`;
            // Deliberately NO BypassCache: the linger entry is keyed on these exact params.
            const params: RunViewParams = {
                EntityName: CATEGORY_ENTITY, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', OrderBy: 'ID ASC'
            };

            const seeded = await createCategory(ctx, `${suffix}-a`);
            const warm = await runRows<{ ID: string }>(params, ctx.User, 'warm view');
            AssertEqual(warm.length, 1, 'baseline row count before the second save');
            Assert(warm.some(r => UUIDsEqual(r.ID, seeded.ID)), 'baseline view must contain the first fixture row');

            const startedAt = Date.now();
            const added = await createCategory(ctx, `${suffix}-b`);
            const afterSave = await runRows<{ ID: string }>(params, ctx.User, 'post-save view');
            const elapsed = Date.now() - startedAt;

            // Precondition: the re-run must land INSIDE the linger window, otherwise the entry would
            // have expired on its own and the check would prove nothing.
            Assert(elapsed < ProviderBase.DedupLingerMs,
                `post-save re-run took ${elapsed}ms, outside the ${ProviderBase.DedupLingerMs}ms linger window — inconclusive`);
            Assert(afterSave.some(r => UUIDsEqual(r.ID, added.ID)),
                `the lingered view served STALE data: row ${added.ID} saved ${elapsed}ms ago is missing`);
            AssertEqual(afterSave.length, 2, 'post-save row count');

            console.log(`      → save invalidated the lingered entry; re-run ${elapsed}ms later (window ${ProviderBase.DedupLingerMs}ms) saw the new row`);
        }
    },
    {
        Id: 'entity-writes.EW6',
        Name: 'EW6: an UPPERCASE FK saved over the wire round-trips through case-insensitive filters',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const parent = await createCategory(ctx, 'uuid-parent');
            // Deliberately push the FK across the wire in the OPPOSITE case to whatever the platform
            // returned (SQL Server uppercases, PostgreSQL lowercases), then filter in both cases.
            const flipped = parent.ID === parent.ID.toUpperCase() ? parent.ID.toLowerCase() : parent.ID.toUpperCase();
            Assert(flipped !== parent.ID, 'parent ID has no case to flip — the UUID case round-trip is not exercised');
            const child = await createCategory(ctx, 'uuid-child', flipped);

            Assert(UUIDsEqual(child.ParentID ?? '', parent.ID), `persisted ParentID must match the parent regardless of case (got ${child.ParentID})`);

            const lower = await runRows<{ ID: string }>({
                EntityName: CATEGORY_ENTITY, ExtraFilter: `ParentID='${parent.ID.toLowerCase()}'`,
                Fields: ['ID'], ResultType: 'simple', BypassCache: true
            }, ctx.User, 'lowercase FK filter');
            const upper = await runRows<{ ID: string }>({
                EntityName: CATEGORY_ENTITY, ExtraFilter: `ParentID='${parent.ID.toUpperCase()}'`,
                Fields: ['ID'], ResultType: 'simple', BypassCache: true
            }, ctx.User, 'uppercase FK filter');

            AssertEqual(lower.length, 1, 'rows found by the lowercase FK filter');
            AssertEqual(upper.length, 1, 'rows found by the uppercase FK filter');
            Assert(UUIDsEqual(lower[0].ID, child.ID), `lowercase filter found the wrong row: ${lower[0].ID}`);
            Assert(UUIDsEqual(upper[0].ID, child.ID), `uppercase filter found the wrong row: ${upper[0].ID}`);

            console.log(`      → FK written as ${flipped.slice(0, 8)}… and found by BOTH case variants`);
        }
    },
    {
        Id: 'entity-writes.EW7',
        Name: 'EW7: a non-UTC-offset datetimeoffset survives save → Load → RunView to the millisecond',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const entityRows = await runRows<{ ID: string }>({
                EntityName: 'MJ: Entities', Fields: ['ID'], MaxRows: 1, ResultType: 'simple'
            }, ctx.User, 'entity lookup for the List FK');
            Assert(entityRows.length === 1, 'no entities available to satisfy MJ: Lists.EntityID');

            // A deliberately non-UTC wall-clock literal with sub-second precision. JS Date carries an
            // INSTANT (no zone), so the observable contract is instant-equality to the millisecond —
            // the stored offset itself is a rendering concern and is not observable client-side.
            const instant = new Date('2023-03-14T09:26:53.123-05:00');
            const list = await ctx.Provider.GetEntityObject<MJListEntity>(LIST_ENTITY, ctx.User);
            list.NewRecord();
            list.Name = `${f.Prefix}-dto ${FIXTURE_TAG}`;
            list.EntityID = entityRows[0].ID;
            list.UserID = ctx.User.ID;
            list.LastRefreshedAt = instant;
            const saved = await list.Save();
            if (list.ID) {
                f.ListIds.push(list.ID);
            }
            Assert(saved, `List fixture save failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            const inMemory = list.LastRefreshedAt;
            Assert(inMemory instanceof Date, 'LastRefreshedAt is not a Date after save');
            AssertEqual(inMemory!.getTime(), instant.getTime(), 'instant preserved in the row returned by the save');

            const reloaded = await ctx.Provider.GetEntityObject<MJListEntity>(LIST_ENTITY, ctx.User);
            Assert(await reloaded.Load(list.ID), `reloading list ${list.ID} failed`);
            Assert(reloaded.LastRefreshedAt instanceof Date, 'reloaded LastRefreshedAt is not a Date');
            AssertEqual(reloaded.LastRefreshedAt!.getTime(), instant.getTime(), 'instant preserved through Load()');

            const viaView = await runRows<{ LastRefreshedAt: string | Date }>({
                EntityName: LIST_ENTITY, ExtraFilter: `ID='${list.ID}'`, Fields: ['LastRefreshedAt'],
                ResultType: 'simple', BypassCache: true
            }, ctx.User, 'datetimeoffset read-back');
            AssertEqual(viaView.length, 1, 'read-back row count');
            AssertEqual(new Date(viaView[0].LastRefreshedAt).getTime(), instant.getTime(), 'instant preserved through RunView');

            console.log(`      → ${instant.toISOString()} round-tripped byte-for-byte as an instant across all three surfaces`);
        }
    },
    {
        Id: 'entity-writes.EW8',
        Name: 'EW8: the resolver instantiates the server entity subclass (server-only invariant fires)',
        Fn: async (ctx: IntegrationCheckContext) => {
            // `MJTagScopeEntityServer` (server-only) enforces, in ValidateAsync(), that a TagScope's
            // TagID resolves to a real Tag. We save with SkipAsyncValidation so the LOCAL object
            // provably does not evaluate that invariant — therefore a refusal carrying its message
            // can only have been produced by the entity object the RESOLVER instantiated on the
            // server. That attribution holds whether or not this process happens to have the server
            // classes on its ClassFactory, which a purely "the client class lacks the rule" control
            // would not. No row is ever inserted: validation precedes the INSERT.
            const scope = await ctx.Provider.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', ctx.User);
            scope.NewRecord();
            scope.TagID = MISSING_TAG_ID;
            scope.ScopeEntityID = fx(ctx).ActionCategoryEntityID;
            scope.ScopeRecordID = MISSING_SCOPE_RECORD_ID;

            // CONTROL: synchronous validation must PASS locally, so the only remaining objection is
            // the server's async invariant. If this ever fails, the check is inconclusive, not green.
            const clientValidation = scope.Validate();
            Assert(clientValidation.Success,
                `local sync Validate() already rejects this record (${clientValidation.Errors.map(e => e.Message).join('; ')}) — EW8 cannot attribute the refusal to the server`);

            const options = new EntitySaveOptions();
            options.SkipAsyncValidation = true; // the local object will NOT run the invariant
            let saved: boolean;
            let message: string;
            try {
                saved = await scope.Save(options);
                message = scope.LatestResult?.CompleteMessage ?? '';
            } catch (error) {
                saved = false;
                message = error instanceof Error ? error.message : String(error);
            }
            Assert(!saved, 'the server subclass must refuse a TagScope pointing at a non-existent Tag');
            Assert(message.includes('but no such Tag exists'),
                `refusal did not come from MJTagScopeEntityServer.ValidateAsync; message was: ${message.slice(0, 300)}`);

            console.log(`      → local async validation skipped, server MJTagScopeEntityServer still refused — server subclass resolved`);
        }
    }
];

for (const check of EntityWritesChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/** Resolves an entity's ID from the provider's metadata, failing loudly if it is missing. */
function requireEntityID(provider: IMetadataProvider, name: string): string {
    const id = provider.EntityByName(name)?.ID;
    Assert(!!id, `could not resolve the entity ID for '${name}'`);
    return id!;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('entity-writes', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup creates NO rows — each mutating check creates exactly what it needs and appends the
        // IDs here, so the deterministic-only run (RUN_MUTATION_TESTS unset) writes nothing at all.
        ctx.EntityWritesFixture = {
            ActionCategoryEntityID: requireEntityID(ctx.Provider, CATEGORY_ENTITY),
            RecordChangeEntityID: requireEntityID(ctx.Provider, RECORD_CHANGE_ENTITY),
            Prefix: `mj-ew-${Date.now()}`,
            // Back-date the window by a second so a clock skew between this process and the DB can't
            // hide the very first Record Change behind the lower bound.
            StartedAtIso: new Date(Date.now() - 1000).toISOString(),
            CategoryIds: [],
            ListIds: []
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.EntityWritesFixture;
        if (!f) {
            return;
        }
        const provider = ctx.Provider;
        const user = ctx.User;
        for (const id of [...f.ListIds].reverse()) {
            const list = await provider.GetEntityObject<MJListEntity>(LIST_ENTITY, user).catch(() => undefined);
            if (list && (await list.Load(id).catch(() => false))) {
                await list.Delete().catch(() => undefined);
            }
        }
        // Reverse creation order deletes children before parents — FK-safe for the self-referencing
        // ActionCategory.ParentID, since a child is always created after its parent.
        for (const id of [...f.CategoryIds].reverse()) {
            const cat = await provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, user).catch(() => undefined);
            if (cat && (await cat.Load(id).catch(() => false))) {
                await cat.Delete().catch(() => undefined);
            }
        }
        ctx.EntityWritesFixture = undefined;
    }
});
