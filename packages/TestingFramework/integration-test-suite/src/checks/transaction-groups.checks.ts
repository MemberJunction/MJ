/**
 * transaction-groups.checks.ts — the 'transaction-groups' bundle (TG1–TG5): the TransactionGroup
 * atomicity + security contract, exercised CLIENT-FIRST over the real GraphQL wire (Domain 2 of
 * the integration-test expansion catalog: CD8 / CD9 / SEC1).
 *
 * Everything goes through `ctx.Provider.CreateTransactionGroup()` — `GraphQLTransactionGroup` on
 * the client transport (queue → one `ExecuteTransactionGroup` mutation → server reconstructs the
 * group → `SQLServerTransactionGroup` runs it inside a real sql.Transaction) — so each check
 * proves the whole chain, not an in-process shortcut.
 *
 *   - TG1        Factory + empty-group contract: the provider hands back its transport-appropriate
 *                TransactionGroupBase; Submit() with no items returns true and resets to Pending.
 *   - TG2 (CD8)  Atomic commit: two creates queue (DEFERRED — nothing persisted before Submit),
 *                Submit persists BOTH and finalizes both client entities with server-assigned IDs.
 *   - TG3 (CD8)  Rollback integrity: item 2 hits a real FK violation → Submit reports failure,
 *                NEITHER row persists (all-or-nothing), and item 1's entity is NOT finalized as
 *                saved against phantom data. This is the wire-level pin for the client-side
 *                false-success defect fixed in GraphQLTransactionGroup.HandleSubmit (per-item
 *                success used to ignore the server's transaction-level Success flag, so a rolled-
 *                back group reported Submit()===true and finalized entities with unpersisted data).
 *   - TG4 (CD9)  Variable dependency: the parent's server-assigned PK threads into the child's FK
 *                via TransactionVariable (Define/Use) across the wire, verified in-memory AND in DB.
 *   - TG5 (SEC1) **Scope-bypass pin (bug-register B1)**: a restricted user API key (allow
 *                'view:run', deny 'entity:create') attempting a Create via a raw
 *                ExecuteTransactionGroup mutation MUST be refused by the same API-key scope gate
 *                the singular CRUD resolvers enforce, and no row may persist. Before the fix
 *                (TransactionResolver had no CheckAPIKeyScopeAuthorization call at all), this
 *                check FAILS: the mutation succeeds and the row is created — that proven-to-fail
 *                red run is the point of the pin.
 *
 * MUTATION TIER: TG2–TG5 write to the database (`RequiresMutation: true`). TG1 is read-only.
 * TG5 additionally requires the CLIENT transport (a live MJAPI to attack over the wire) and
 * skips-as-pass loudly on the server transport, where no wire — and hence no API-key scope
 * ceiling — exists to exercise.
 *
 * Fixtures are throwaway `MJ: Action Categories` rows, name-prefixed per run and tagged
 * "(mj-integration-test — safe to delete)". Teardown sweeps EVERYTHING matching the prefix
 * (children before parents), so even a pre-fix bypass leak cannot orphan a row. TG5's API-key
 * fixtures (key + scope rules + usage logs) self-clean in the check's own try/finally,
 * mirroring the `api-keys` bundle's AK3.
 */
import { Metadata, RunView, TransactionGroupBase, TransactionVariable } from '@memberjunction/core';
import type { RunViewParams, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLTransactionGroup } from '@memberjunction/graphql-dataprovider';
import {
    MJActionCategoryEntity,
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
    MJAPIKeyUsageLogEntity
} from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, TransactionGroupsFixture } from '@memberjunction/testing-integration';

/**
 * Resolve the REAL GraphQL wire provider (adversarial review F1): under `mj test` the
 * driver's ctx.Provider is a `new Metadata()` FACADE (BaseTestDriver.Provider fallback),
 * never a GraphQLDataProvider instance — gating on `ctx.Provider instanceof` made the
 * SEC1 pin (TG5) and TG1's wire-impl leg silently skip forever. The facade DELEGATES to
 * the process-global provider, so the honest resolution is: ctx.Provider when it IS the
 * wire, else the global. On the client transport a missing wire is a FAILURE (wiring
 * regression), not a skip.
 */
function resolveWireProvider(ctx: IntegrationCheckContext): GraphQLDataProvider | null {
    if (ctx.Provider instanceof GraphQLDataProvider) { return ctx.Provider; }
    const globalProvider = Metadata.Provider;
    return globalProvider instanceof GraphQLDataProvider ? (globalProvider as GraphQLDataProvider) : null;
}

const CATEGORY_ENTITY = 'MJ: Action Categories';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** A UUID that (provably — TG3 asserts it) matches no Action Category, to force a real FK violation. */
const MISSING_PARENT_ID = '00000000-0000-0000-0000-00000000dead';

/** Fetch the fixture (throws if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): TransactionGroupsFixture {
    Assert(ctx.TransactionGroupsFixture != null, 'transaction-groups fixture missing (bundle Setup did not run)');
    return ctx.TransactionGroupsFixture!;
}

/**
 * Creates a NEW (unsaved) Action Category, attaches it to the transaction group, and calls Save()
 * — which, per the TransactionGroup contract, QUEUES the write and returns true without touching
 * the database. The name carries the per-run prefix so teardown's sweep always finds it.
 */
async function queueCreate(
    ctx: IntegrationCheckContext, tg: TransactionGroupBase, suffix: string, parentID?: string
): Promise<MJActionCategoryEntity> {
    const f = fx(ctx);
    const cat = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    cat.NewRecord();
    cat.Name = `${f.Prefix}-${suffix} ${FIXTURE_TAG}`;
    cat.Status = 'Active';
    if (parentID) {
        cat.ParentID = parentID;
    }
    cat.TransactionGroup = tg;
    const queued = await cat.Save();
    Assert(queued, `queueing '${suffix}' into the transaction group failed: ${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return cat;
}

/** Fresh-from-DB Action Category rows (BypassCache) matching a Name filter. */
async function categoryRows(
    ctx: IntegrationCheckContext, nameFilter: string
): Promise<Array<{ ID: string; Name: string; ParentID: string | null }>> {
    const result = await new RunView().RunView<{ ID: string; Name: string; ParentID: string | null }>({
        EntityName: CATEGORY_ENTITY,
        ExtraFilter: nameFilter,
        Fields: ['ID', 'Name', 'ParentID'],
        ResultType: 'simple',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `reading ${CATEGORY_ENTITY} failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

/** The exact GraphQL document GraphQLTransactionGroup sends — reused by TG5's raw restricted-key attack. */
const EXECUTE_TG_MUTATION = `
mutation ExecuteTransactionGroup($group: TransactionInputType!) {
    ExecuteTransactionGroup(group: $group) {
        Success
        ErrorMessages
        ResultsJSON
    }
}`;

/** Shape of the raw GraphQL wire response TG5 inspects. */
interface WireGraphQLResponse {
    data?: {
        ExecuteTransactionGroup?: { Success: boolean; ErrorMessages: string[]; ResultsJSON: string[] } | null;
    } | null;
    errors?: Array<{ message: string }>;
}

export const TransactionGroupsChecks: NamedCheck[] = [
    {
        Id: 'transaction-groups.TG1',
        Name: 'TG1: provider hands back its transport TransactionGroup; empty Submit returns true and resets to Pending',
        Fn: async (ctx: IntegrationCheckContext) => {
            const tg = await ctx.Provider.CreateTransactionGroup();
            Assert(tg instanceof TransactionGroupBase, 'CreateTransactionGroup must return a TransactionGroupBase');
            const wireForImpl = resolveWireProvider(ctx);
            if (wireForImpl) {
                // ctx.Provider may be the driver's Metadata facade — the FACADE delegates
                // CreateTransactionGroup to the wire provider, so the impl assertion applies
                // whenever a wire exists in the process (review F1).
                Assert(tg instanceof GraphQLTransactionGroup,
                    'the client provider must hand back its WIRE implementation (GraphQLTransactionGroup), not some other transport');
            }
            AssertEqual(tg.Status, 'Pending', 'a fresh group starts Pending');

            // Documented contract (TransactionGroupBase.Submit): no queued items → returns true and
            // the group goes BACK to Pending (reusable), never Complete.
            const ok = await tg.Submit();
            Assert(ok === true, 'Submit() of an empty group must return true');
            AssertEqual(tg.Status, 'Pending', 'an empty Submit must reset the group to Pending, not Complete');

            console.log(`      → transport-appropriate TransactionGroup created; empty Submit true + status back to Pending`);
        }
    },
    {
        Id: 'transaction-groups.TG2',
        Name: 'TG2: two creates DEFER until Submit, then BOTH persist atomically and finalize with server IDs',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const tg = await ctx.Provider.CreateTransactionGroup();
            const a = await queueCreate(ctx, tg, 'commit-a');
            const b = await queueCreate(ctx, tg, 'commit-b');
            AssertEqual(tg.Status, 'Pending', 'group still Pending after queuing');

            // Deferred-execution proof: both Save() calls returned true, yet nothing may have hit
            // the database before Submit. Without this leg, a provider that ignored the group and
            // saved immediately would pass the rest of the check vacuously.
            const pre = await categoryRows(ctx, `Name LIKE '${f.Prefix}-commit-%'`);
            AssertEqual(pre.length, 0, 'Save() with a TransactionGroup must DEFER the write until Submit');
            Assert(!a.IsSaved && !b.IsSaved, 'entities must not be finalized before Submit');

            const ok = await tg.Submit();
            Assert(ok, 'Submit() of two valid creates must succeed');
            AssertEqual(tg.Status, 'Complete', 'group Complete after a successful Submit');
            Assert(a.IsSaved && b.IsSaved, 'both entities must be finalized by the transaction callbacks');
            Assert(a.ID.length > 0 && b.ID.length > 0, 'server-assigned IDs must flow back into the client entities');

            const post = await categoryRows(ctx, `Name LIKE '${f.Prefix}-commit-%'`);
            AssertEqual(post.length, 2, 'both rows persisted by the single transaction');
            Assert(post.some(r => UUIDsEqual(r.ID, a.ID)), `persisted rows must include ${a.ID}`);
            Assert(post.some(r => UUIDsEqual(r.ID, b.ID)), `persisted rows must include ${b.ID}`);

            console.log(`      → 0 rows pre-Submit (deferred), 2 rows post-Submit, both client entities finalized`);
        }
    },
    {
        Id: 'transaction-groups.TG3',
        Name: 'TG3: item 2 fails (FK violation) → Submit false, NEITHER row persists, item 1 not finalized (all-or-nothing)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            // Precondition: the poison FK target must genuinely not exist, otherwise item 2 would
            // succeed and this check would prove nothing.
            const poison = await categoryRows(ctx, `ID='${MISSING_PARENT_ID}'`);
            AssertEqual(poison.length, 0, `precondition: no Action Category may exist with ID ${MISSING_PARENT_ID}`);

            const tg = await ctx.Provider.CreateTransactionGroup();
            const good = await queueCreate(ctx, tg, 'rb-good');
            // Passes CLIENT validation (nullable FK, no client-side FK check) and fails only at the
            // database constraint — inside the server transaction, after item 1 already executed.
            await queueCreate(ctx, tg, 'rb-bad', MISSING_PARENT_ID);

            const ok = await tg.Submit();
            AssertEqual(ok, false,
                'Submit() must report failure when any item fails — a true here means the client swallowed a server rollback ' +
                '(the GraphQLTransactionGroup false-success defect: per-item success computed from ResultsJSON presence, ignoring Success=false)');
            AssertEqual(tg.Status, 'Failed', 'group must be Failed after a rollback');

            const rows = await categoryRows(ctx, `Name LIKE '${f.Prefix}-rb-%'`);
            AssertEqual(rows.length, 0, 'ROLLBACK INTEGRITY: the first (valid) item must NOT persist when the second fails');
            Assert(!good.IsSaved, 'the first entity must not be finalized as saved against phantom (rolled-back) data');

            console.log(`      → Submit false, status Failed, 0 rows persisted, first entity left unsaved — all-or-nothing holds`);
        }
    },
    {
        Id: 'transaction-groups.TG4',
        Name: 'TG4: TransactionVariable threads the parent PK into the child FK across the wire (Define → Use)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const tg = await ctx.Provider.CreateTransactionGroup();
            const parent = await queueCreate(ctx, tg, 'var-parent');
            const child = await queueCreate(ctx, tg, 'var-child'); // ParentID deliberately unset
            Assert(child.ParentID == null, 'precondition: the child FK must be unset before Submit — the variable must supply it');

            // Parent DEFINES the variable from its post-insert ID; child USES it as its ParentID.
            tg.AddVariable(new TransactionVariable('TGParentID', parent, 'ID', 'Define'));
            tg.AddVariable(new TransactionVariable('TGParentID', child, 'ParentID', 'Use'));

            const ok = await tg.Submit();
            Assert(ok, 'Submit() of the variable-dependent pair must succeed');
            Assert(parent.ID.length > 0, 'parent must come back with a server-assigned ID');
            Assert(UUIDsEqual(child.ParentID ?? '', parent.ID),
                `in-memory child.ParentID must equal the parent PK (got ${child.ParentID}, expected ${parent.ID})`);

            // And the DATABASE must agree — the in-memory value alone could be a callback artifact.
            const rows = await categoryRows(ctx, `Name LIKE '${f.Prefix}-var-child%'`);
            AssertEqual(rows.length, 1, 'exactly one child row persisted');
            Assert(UUIDsEqual(rows[0].ParentID ?? '', parent.ID),
                `persisted child.ParentID must equal the parent PK (got ${rows[0].ParentID})`);

            console.log(`      → parent PK ${parent.ID.slice(0, 8)}… threaded into child FK via TransactionVariable, in memory AND in DB`);
        }
    },
    {
        Id: 'transaction-groups.TG5',
        Name: 'TG5: SEC1 pin — a view:run-only API key CANNOT Create through ExecuteTransactionGroup (scope-bypass fix)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const wire = resolveWireProvider(ctx);
            if (!wire) {
                // IT47 declares transport 'client' — if no GraphQL wire is resolvable IN a
                // client-transport run, that is a WIRING REGRESSION and this security pin
                // must go RED, not silently skip (review F1: the pin skipped forever under
                // the driver's Metadata-facade Provider).
                throw new Error('TG5: no GraphQLDataProvider resolvable in a client-transport run — the SEC1 pin cannot execute (wiring regression)');
            }
            const url = wire.ConfigData.URL;

            // ---- mint a RESTRICTED user API key over the wire: allow view:run, DENY entity:create.
            // The explicit deny makes the pin independent of the deployment's defaultBehaviorNoScopes:
            // if the resolver consults the scope gate AT ALL, this key is refused; before the fix the
            // gate was never consulted, so the Create succeeded — the proven-to-fail red run.
            const engine = GetAPIKeyEngine();
            await engine.Config(true, ctx.User, ctx.Provider);
            const viewScope = engine.Scopes.find(s => s.FullPath === 'view:run');
            const createScope = engine.Scopes.find(s => s.FullPath === 'entity:create');
            Assert(!!viewScope && !!createScope, `seeded scopes 'view:run' / 'entity:create' not found (got ${engine.Scopes.length} scopes)`);

            const created = await engine.CreateAPIKey({ UserId: ctx.User.ID, Label: `mj-tg-scope-pin ${FIXTURE_TAG}` }, ctx.User, ctx.Provider);
            Assert(created.Success && !!created.RawKey && !!created.APIKeyId, `CreateAPIKey failed: ${created.Error}`);
            const scopeRules: MJAPIKeyScopeEntity[] = [];

            try {
                for (const [scope, isDeny] of [[viewScope!, false], [createScope!, true]] as const) {
                    const rule = await ctx.Provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
                    rule.NewRecord();
                    rule.APIKeyID = created.APIKeyId!;
                    rule.ScopeID = scope.ID;
                    rule.ResourcePattern = '*';
                    rule.PatternType = 'Include';
                    rule.IsDeny = isDeny;
                    rule.Priority = isDeny ? 10 : 0;
                    Assert(await rule.Save(), `saving key scope rule failed: ${rule.LatestResult?.CompleteMessage}`);
                    scopeRules.push(rule);
                }

                // ---- CONTROL: the identical transaction succeeds on the system-authenticated channel,
                // proving the payload shape is valid — so a refusal below is the scope gate, not a
                // malformed request.
                const controlTg = await ctx.Provider.CreateTransactionGroup();
                const control = await queueCreate(ctx, controlTg, 'scope-control');
                Assert(await controlTg.Submit(), 'control: the same Create-in-a-group must succeed on the system channel');
                Assert(await control.Delete(), `control row cleanup failed: ${control.LatestResult?.CompleteMessage}`);

                // ---- THE ATTACK: raw ExecuteTransactionGroup with the restricted key.
                const attemptName = `${f.Prefix}-scope-bypass ${FIXTURE_TAG}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': created.RawKey! },
                    body: JSON.stringify({
                        query: EXECUTE_TG_MUTATION,
                        variables: {
                            group: {
                                Items: [{
                                    EntityName: CATEGORY_ENTITY,
                                    EntityObjectJSON: JSON.stringify({ Name: attemptName, Status: 'Active' }),
                                    OperationType: 'Create'
                                }],
                                Variables: []
                            }
                        }
                    })
                });
                Assert(response.status !== 401,
                    'the restricted key failed AUTHENTICATION (HTTP 401) — the scope gate was never reached, so this run is inconclusive (key validation environment issue, not a pass)');
                const json = (await response.json()) as WireGraphQLResponse;

                const tgResult = json.data?.ExecuteTransactionGroup;
                Assert(!(tgResult && tgResult.Success === true),
                    'SCOPE BYPASS (bug-register B1): a view:run-only API key executed a Create via ExecuteTransactionGroup — the mutation must route every item through CheckAPIKeyScopeAuthorization like the singular CRUD resolvers');
                const messages = (json.errors ?? []).map(e => e.message);
                Assert(messages.some(m => m.includes('entity:create')),
                    `expected an 'entity:create' scope denial from the resolver's scope gate; got: ${messages.length > 0 ? messages.join(' | ').slice(0, 400) : '(no GraphQL errors at all)'}`);

                // ---- and the database must be untouched by the denied attempt.
                const leaked = await categoryRows(ctx, `Name='${attemptName.replace(/'/g, "''")}'`);
                AssertEqual(leaked.length, 0, 'the scope-denied transaction must not have persisted a row');

                console.log(`      → restricted key: control Create OK on system channel; ExecuteTransactionGroup DENIED with entity:create scope error; 0 rows leaked`);
            } finally {
                // FK-safe self-clean, AK3-style: usage logs (denials are logged) → scope rules → key.
                const logs = await new RunView().RunView<MJAPIKeyUsageLogEntity>(
                    { EntityName: 'MJ: API Key Usage Logs', ExtraFilter: `APIKeyID='${created.APIKeyId}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                for (const log of logs.Results ?? []) {
                    await log.Delete().catch(() => undefined);
                }
                for (const rule of scopeRules.reverse()) {
                    await rule.Delete().catch(() => undefined);
                }
                const key = await ctx.Provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
                if (await key.Load(created.APIKeyId!).catch(() => false)) {
                    await key.Delete().catch(() => undefined);
                }
            }
        }
    }
];

for (const check of TransactionGroupsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/** Resolves an entity's ID from the provider's metadata, failing loudly if it is missing. */
function requireEntityID(provider: IMetadataProvider, name: string): string {
    const id = provider.EntityByName(name)?.ID;
    Assert(!!id, `could not resolve the entity ID for '${name}'`);
    return id!;
}

/** Deletes every fixture Action Category matching the run prefix — children before parents. */
async function sweepCategories(provider: IMetadataProvider, user: UserInfo, prefix: string): Promise<void> {
    const params: RunViewParams = {
        EntityName: CATEGORY_ENTITY,
        ExtraFilter: `Name LIKE '${prefix}%'`,
        ResultType: 'entity_object',
        BypassCache: true
    };
    const result = await new RunView().RunView<MJActionCategoryEntity>(params, user).catch(() => undefined);
    const rows = result?.Results ?? [];
    // Two passes: rows WITH a ParentID (children) first, then roots — FK-safe for the
    // self-referencing ActionCategory.ParentID without needing creation-order bookkeeping.
    for (const pass of [rows.filter(r => r.ParentID != null), rows.filter(r => r.ParentID == null)]) {
        for (const row of pass) {
            await row.Delete().catch(() => undefined);
        }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('transaction-groups', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup creates NO rows — each mutating check queues exactly what it needs under the
        // per-run prefix, and teardown sweeps by that prefix, so nothing can be orphaned even by
        // a mid-transaction failure (or a pre-fix TG5 bypass leak).
        ctx.TransactionGroupsFixture = {
            ActionCategoryEntityID: requireEntityID(ctx.Provider, CATEGORY_ENTITY),
            Prefix: `mj-tg-${Date.now()}`
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.TransactionGroupsFixture;
        if (!f) {
            return;
        }
        await sweepCategories(ctx.Provider, ctx.User, f.Prefix);
        ctx.TransactionGroupsFixture = undefined;
    }
});
