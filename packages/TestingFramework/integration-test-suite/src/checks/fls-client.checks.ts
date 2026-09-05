/**
 * fls-client.checks.ts — the 'fls-enforcement-client' bundle (client transport, needs MJAPI):
 * Field-Level Security proven OVER THE WIRE. Covers test-plan 3.8 (single-record GraphQL
 * payload) and the wire-level halves of 3.1/3.2/3.4 — the legs the server-transport bundle
 * (IT87) cannot reach, because there enforcement and observation share a process.
 *
 * THE IDENTITY MODEL (why this bundle mints API keys): a GraphQL client authenticates as ONE
 * wire identity, and a passed contextUser does not change what the server returns (see the
 * RLS7 notes). So per-user enforcement over the wire is only observable through per-user
 * AUTHENTICATION. The lifecycle mints one user API key (mj_sk_*, `x-api-key`) each for the
 * seeded reader and writer users and builds two SECONDARY GraphQLDataProvider connections
 * (separateConnection — the process-global system-key provider is untouched); MJAPI resolves
 * each key to its user, roles and all, so the reader connection is a genuinely restricted
 * principal end to end.
 *
 * All provisioning happens THROUGH the wire as the system-key identity: enabling
 * EnableFieldLevelSecurity on 'MJ: Employees' runs the snapshot inside MJAPI's own entity
 * layer, and the reader role's Email rule is tightened to Deny the same way. Because MJAPI's
 * metadata refresh after those saves is asynchronous (the 5.6 propagation surface), Setup
 * POLLS the reader connection until the denied column disappears (bounded), which doubles as
 * live coverage of permission-change propagation to a running API.
 *
 * Teardown (best-effort, wire-only — the client transport has no SQL pool): delete the
 * fixture employee (writer identity), restore the reader's Email rule to the snapshot default,
 * disable the flag, and delete the minted keys + their usage logs. The snapshot's permission
 * rows themselves remain — deliberately: with the flag off they are inert ("disable keeps
 * rows" is the product's own semantic), the guard refuses deleting the system-user roles' last
 * Allow rows anyway, and the server-transport FLS bundles' SQL teardown sweeps them on their
 * next run.
 */
import { RunView, FieldSecurityDenialMessage } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { UUIDsEqual, GetGlobalObjectStore } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, LoadClientConfig } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, FlsClientFixture } from '@memberjunction/testing-integration';
import {
    SEEDED_FLS_ENTITY, SEED_FIXTURES_COMMAND,
    SEEDED_FLS_READER_EMAIL, SEEDED_FLS_WRITER_EMAIL,
    FLS_READER_ROLE, FLS_READER_DENIED_FIELD
} from '@memberjunction/testing-integration';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import {
    MJEntityEntity, MJEntityFieldPermissionEntity, MJEmployeeEntity, MJCompanyEntity,
    MJAPIKeyEntity, MJAPIKeyScopeEntity, MJAPIKeyUsageLogEntity
} from '@memberjunction/core-entities';

/**
 * How long Setup waits for MJAPI to start (a) honoring the freshly minted keys' scope rules
 * (the engine's scope cache has a staleness envelope, scopeCacheTTLMs default 60s) and
 * (b) enforcing the tightened permission rule (asynchronous metadata refresh). Both surfaces
 * are polled through the same reader connection.
 */
const PROPAGATION_TIMEOUT_MS = 150_000;
const PROPAGATION_POLL_MS = 5_000;

// ─────────────────────────────────────────────────────────────────── helpers

function skipIfUnusable(fx: FlsClientFixture | undefined, checkId: string): fx is FlsClientFixture {
    if (!fx || !fx.Usable) {
        console.warn(
            `  ⚠ ${checkId} SKIPPED — FLS client fixture not usable ` +
            `(${fx?.ProvisionError ?? fx?.Reason ?? 'fixture not provisioned'}). ` +
            `Seed with \`${SEED_FIXTURES_COMMAND}\` and start MJAPI.`
        );
        return false;
    }
    return true;
}

/** Resolve a seeded user's ID over the wire (system identity can read MJ: Users). */
async function findUserId(ctx: IntegrationCheckContext, email: string): Promise<string | undefined> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Users', ExtraFilter: `Email = '${email}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
    return res.Success && res.Results.length === 1 ? res.Results[0].ID : undefined;
}

/**
 * Build a SECONDARY GraphQL provider authenticated by a user API key, RETRYING while MJAPI's
 * scope cache catches up: scope rules are honored within a staleness envelope
 * (scopeCacheTTLMs, default 60s), so a freshly-granted `full_access` rule can be denied for
 * up to a minute after it is written. Bounded, so a genuinely unauthorized key still fails.
 */
async function buildUserKeyProviderWithRetry(rawKey: string): Promise<IMetadataProvider> {
    const deadline = Date.now() + 90_000;
    for (;;) {
        try {
            return await buildUserKeyProvider(rawKey);
        } catch (e) {
            if (Date.now() > deadline) {
                throw e;
            }
            await new Promise(resolve => setTimeout(resolve, 5_000));
        }
    }
}

/**
 * GraphQLDataProvider's Global-Object-Store key — it is a HARD singleton: its constructor
 * RETURNS the registered instance whenever one exists, so `new GraphQLDataProvider()` can
 * never create a second connection (it hands back — and Config() then RECONFIGURES — the
 * process-global system-key provider; that hijack authenticated every subsequent global call
 * as the last-configured user key when this bundle first ran). GraphQLDataProvider is on the
 * repo's known weak-singleton migration list; until it supports true secondary instances,
 * park the store slot around construction so a genuinely separate instance can exist.
 */
const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';

function newSecondaryGraphQLProvider(): GraphQLDataProvider {
    const store = GetGlobalObjectStore();
    const singleton = store?.[GRAPHQL_PROVIDER_SINGLETON_KEY];
    if (store) {
        delete store[GRAPHQL_PROVIDER_SINGLETON_KEY];
    }
    try {
        return new GraphQLDataProvider();
    } finally {
        if (store) {
            store[GRAPHQL_PROVIDER_SINGLETON_KEY] = singleton; // the real singleton stays the process global
        }
    }
}

/** Build a SECONDARY GraphQL provider authenticated by a user API key (separate connection). */
async function buildUserKeyProvider(rawKey: string): Promise<IMetadataProvider> {
    const client = LoadClientConfig();
    const provider = newSecondaryGraphQLProvider();
    const config = new GraphQLProviderConfigData(
        '',                       // no JWT — the user API key is the credential
        client.Url,
        '',                       // no websocket needed
        async () => '',           // no token to refresh
        undefined, undefined, undefined,
        undefined,                // NO system key — this connection must be only the user
        rawKey
    );
    const ok = await provider.Config(config, undefined, true /* separateConnection */);
    if (!ok) {
        throw new Error('secondary GraphQLDataProvider Config() returned false');
    }
    return provider as unknown as IMetadataProvider;
}

/**
 * One employees read through the given wire identity. BypassCache so every read observes the
 * server's CURRENT enforcement state — cache-hit stripping semantics are IT87/FLS11's subject,
 * not this bundle's; here a cached pre-tightening slot would only add noise.
 */
async function readEmployees(provider: IMetadataProvider, user?: UserInfo): Promise<Record<string, unknown>[]> {
    const res = await RunView.FromMetadataProvider(provider).RunView<Record<string, unknown>>(
        { EntityName: SEEDED_FLS_ENTITY, ResultType: 'simple', BypassCache: true }, user);
    Assert(res.Success, `employees read over the wire failed: ${res.ErrorMessage}`);
    return res.Results;
}

// ─────────────────────────────────────────────────────────────────── provisioning

/**
 * A CLIENT-FAITHFUL 'MJ: Entities' instance: the BASE generated class, constructed directly.
 *
 * Deliberately NOT GetEntityObject: the `mj test` process is a HYBRID — the CLI bootstrap
 * registers the server entity subclasses, so the ClassFactory would resolve
 * MJEntityEntityServer even on the client transport. Its Save() override then runs FLS
 * snapshot reconciliation LOCALLY (writing every permission row one-by-one over the wire)
 * AND the save mutation makes MJAPI run the same reconciliation server-side — the two
 * collide on UQ_EntityFieldPermission_Field_Role. A real browser only ever has the base
 * class, so constructing it directly is what restores client fidelity here.
 */
function clientEntityRecord(ctx: IntegrationCheckContext): MJEntityEntity {
    const info = ctx.Provider.EntityByName('MJ: Entities');
    if (!info) {
        throw new Error("'MJ: Entities' not in client metadata");
    }
    return new MJEntityEntity(info);
}

/** Enable field security on the target entity through the wire (the snapshot runs inside MJAPI). */
async function enableOverWire(ctx: IntegrationCheckContext, entityId: string): Promise<void> {
    const ent = clientEntityRecord(ctx);
    if (!(await ent.Load(entityId))) {
        throw new Error(`failed to load '${SEEDED_FLS_ENTITY}' entity record over the wire`);
    }
    ent.EnableFieldLevelSecurity = true;
    if (!(await ent.Save())) {
        throw new Error(`enable over the wire failed: ${ent.LatestResult?.CompleteMessage ?? 'Save() returned false'}`);
    }
}

/** Tighten the reader role's Email rule to Deny through the wire; returns the row ID for restore. */
async function tightenReaderEmail(ctx: IntegrationCheckContext): Promise<string> {
    const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
    const field = entity?.Fields.find(f => f.Name === FLS_READER_DENIED_FIELD);
    const role = ctx.Provider.Roles.find(r => r.Name === FLS_READER_ROLE);
    if (!field || !role) {
        throw new Error('Email field / FLS Reader role not resolvable from client metadata');
    }
    const rows = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Entity Field Permissions', ExtraFilter: `EntityFieldID = '${field.ID}' AND RoleID = '${role.ID}'`, Fields: ['ID'], ResultType: 'simple' },
        ctx.User);
    if (!rows.Success || rows.Results.length !== 1) {
        throw new Error(`expected one Email/Reader permission row over the wire, got ${rows.Results?.length ?? 'error'} (${rows.ErrorMessage ?? ''})`);
    }
    const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
    if (!(await efp.Load(rows.Results[0].ID))) {
        throw new Error('failed to load the Email/Reader permission row over the wire');
    }
    efp.ReadAccess = 'Deny';
    efp.UpdateAccess = 'No Access';
    efp.CreateAccess = 'No Access';
    if (!(await efp.Save())) {
        throw new Error(`tightening Email/Reader over the wire failed: ${efp.LatestResult?.CompleteMessage ?? ''}`);
    }
    return rows.Results[0].ID;
}

/**
 * Mint a user API key over the wire and grant it `full_access` on '*' — scope enforcement
 * fails closed, so a key with no scope rules cannot even run a batched view. Records the key
 * (and its scope rule) for teardown; returns the raw key.
 */
async function mintKey(ctx: IntegrationCheckContext, fx: FlsClientFixture, userId: string, label: string): Promise<string> {
    const engine = GetAPIKeyEngine();
    const created = await engine.CreateAPIKey({ UserId: userId, Label: label }, ctx.User);
    if (!created.Success || !created.RawKey || !created.APIKeyId) {
        throw new Error(`CreateAPIKey('${label}') failed: ${created.Error ?? 'no raw key returned'}`);
    }
    fx.CreatedKeyIds.push(created.APIKeyId);

    const fullAccess = engine.Scopes.find(s => s.FullPath === 'full_access');
    if (!fullAccess) {
        throw new Error("the seeded 'full_access' API scope was not found — cannot authorize the minted key");
    }
    const rule = await ctx.Provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
    rule.NewRecord();
    rule.APIKeyID = created.APIKeyId;
    rule.ScopeID = fullAccess.ID;
    rule.ResourcePattern = '*';
    rule.PatternType = 'Include';
    rule.IsDeny = false;
    rule.Priority = 0;
    if (!(await rule.Save())) {
        throw new Error(`granting full_access to the minted key failed: ${rule.LatestResult?.CompleteMessage ?? ''}`);
    }
    fx.CreatedScopeRuleIds.push(rule.ID);
    return created.RawKey;
}

/**
 * Wait (bounded) for MJAPI's asynchronous metadata refresh to start ENFORCING the tightened
 * rule on the reader connection — live coverage of the 5.6 propagation surface.
 */
async function waitForPropagation(reader: IMetadataProvider, condition: (rows: Record<string, unknown>[]) => boolean, what: string): Promise<void> {
    const deadline = Date.now() + PROPAGATION_TIMEOUT_MS;
    let lastProblem = '';
    let consecutive = 0;
    for (;;) {
        // A FAILED read is 'not yet', not fatal: the freshly-granted scope rule may still be
        // inside MJAPI's scope-cache staleness envelope, which surfaces as denied RunViews.
        try {
            const rows = await readEmployees(reader);
            if (condition(rows)) {
                // Require STABILITY, not one lucky read: enforcement can briefly flap while
                // MJAPI's provider instances converge on the refreshed metadata.
                consecutive++;
                if (consecutive >= 3) {
                    return;
                }
            } else {
                consecutive = 0;
                lastProblem = `condition '${what}' not met over ${rows.length} row(s)`;
            }
        } catch (e) {
            consecutive = 0;
            lastProblem = e instanceof Error ? e.message : String(e);
        }
        if (Date.now() > deadline) {
            throw new Error(
                `MJAPI did not reach '${what}' for the reader identity within ${PROPAGATION_TIMEOUT_MS / 1000}s ` +
                `(last problem: ${lastProblem}) — scope-rule honoring or permission-change propagation failed (test-plan 5.6)`);
        }
        await new Promise(resolve => setTimeout(resolve, PROPAGATION_POLL_MS));
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('fls-enforcement-client', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: FlsClientFixture = { Usable: false, EntityName: SEEDED_FLS_ENTITY, CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        ctx.FlsClientFixture = fx;

        const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
        if (!entity) {
            fx.Reason = `'${SEEDED_FLS_ENTITY}' not in client metadata`;
            return;
        }
        if (entity.EnableFieldLevelSecurity) {
            fx.Reason = `'${SEEDED_FLS_ENTITY}' already has field security enabled — refusing to mutate a configured entity`;
            return;
        }
        const readerId = await findUserId(ctx, SEEDED_FLS_READER_EMAIL);
        const writerId = await findUserId(ctx, SEEDED_FLS_WRITER_EMAIL);
        if (!readerId || !writerId) {
            fx.Reason = `seeded FLS users (${SEEDED_FLS_READER_EMAIL} / ${SEEDED_FLS_WRITER_EMAIL}) not found over the wire`;
            return;
        }

        try {
            await enableOverWire(ctx, entity.ID);
            fx.ReaderEfpRowID = await tightenReaderEmail(ctx);
            const readerKey = await mintKey(ctx, fx, readerId, 'IT89 FLS reader (mj-integration-test)');
            const writerKey = await mintKey(ctx, fx, writerId, 'IT89 FLS writer (mj-integration-test)');
            fx.ReaderProvider = await buildUserKeyProviderWithRetry(readerKey);
            fx.WriterProvider = await buildUserKeyProviderWithRetry(writerKey);

            // Phase 1: the reader key's scope rule is honored — any successful read proves it
            // (and the writer key, granted in the same pass, follows the same envelope).
            await waitForPropagation(fx.ReaderProvider, () => true, 'scope rule honored');

            // The writer identity creates the fixture row the checks read back.
            const emp = await fx.WriterProvider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY);
            emp.NewRecord();
            emp.FirstName = 'WireFixture';
            emp.LastName = 'Employee (mj-integration-test)';
            emp.CompanyID = await firstCompanyId(ctx, fx);
            emp.Email = `it-fls-wire-${Date.now()}@integration.test`;
            // The writer key's scope rule may lag the reader's by a few seconds — one retry.
            if (!(await emp.Save())) {
                await new Promise(resolve => setTimeout(resolve, 10_000));
                if (!(await emp.Save())) {
                    throw new Error(`creating the wire fixture employee failed: ${emp.LatestResult?.CompleteMessage ?? ''}`);
                }
            }
            fx.FixtureEmployeeID = emp.ID;

            // Phase 2: enforcement propagation — the tightened Email rule must actually BITE on
            // the wire before the checks run. Deliberately after the fixture employee exists, and
            // with a row-count demand in the condition, so this can never pass vacuously over an
            // empty table ("no row carries Email" is trivially true over 0 rows — the exact hole
            // the original leak hid behind). With the event-driven metadata refresh this
            // converges in about a second; the budget only bounds pathological environments.
            await waitForPropagation(
                fx.ReaderProvider,
                rows => rows.length > 0 && rows.every(r => !(FLS_READER_DENIED_FIELD in r)),
                'denied column stripped from reader list results');

            fx.Usable = true;
        } catch (e) {
            fx.ProvisionError = e instanceof Error ? e.message : String(e);
        }
    },

    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = ctx.FlsClientFixture;
        if (!fx || (!fx.Usable && !fx.ProvisionError && !fx.CreatedKeyIds.length)) {
            return; // nothing was provisioned
        }
        // Fixture employee — the writer identity owns delete permission on the entity.
        if (fx.FixtureEmployeeID && fx.WriterProvider) {
            await fx.WriterProvider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY)
                .then(async emp => { if (await emp.Load(fx.FixtureEmployeeID!)) { await emp.Delete(); } })
                .catch(() => undefined);
        }
        if (fx.CreatedCompanyID) {
            await ctx.Provider.GetEntityObject<MJCompanyEntity>('MJ: Companies', ctx.User)
                .then(async company => { if (await company.Load(fx.CreatedCompanyID!)) { await company.Delete(); } })
                .catch(() => undefined);
        }
        // Restore the reader's Email rule to the snapshot default.
        if (fx.ReaderEfpRowID) {
            await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User)
                .then(async efp => {
                    if (await efp.Load(fx.ReaderEfpRowID!)) {
                        efp.ReadAccess = 'Allow';
                        efp.UpdateAccess = 'No Access';
                        efp.CreateAccess = 'No Access';
                        await efp.Save();
                    }
                })
                .catch(() => undefined);
        }
        // Flag off (permission rows stay — inert by the product's own "disable keeps rows" semantic).
        // Same client-faithful base-class construction as the enable — see clientEntityRecord.
        try {
            const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
            const ent = clientEntityRecord(ctx);
            if (entity && (await ent.Load(entity.ID))) {
                ent.EnableFieldLevelSecurity = false;
                await ent.Save();
            }
        } catch { /* best-effort */ }
        // Minted keys: scope rules and usage logs first (FKs), then the keys.
        for (const ruleId of fx.CreatedScopeRuleIds) {
            await ctx.Provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User)
                .then(async rule => { if (await rule.Load(ruleId)) { await rule.Delete(); } })
                .catch(() => undefined);
        }
        for (const keyId of fx.CreatedKeyIds) {
            const logs = await new RunView().RunView<MJAPIKeyUsageLogEntity>(
                { EntityName: 'MJ: API Key Usage Logs', ExtraFilter: `APIKeyID = '${keyId}'`, ResultType: 'entity_object' }, ctx.User
            ).catch(() => ({ Success: false, Results: [] as MJAPIKeyUsageLogEntity[] }));
            if (logs.Success) {
                for (const log of logs.Results) {
                    await log.Delete().catch(() => undefined);
                }
            }
            await ctx.Provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User)
                .then(async key => { if (await key.Load(keyId)) { await key.Delete(); } })
                .catch(() => undefined);
        }
    }
});

/** First company ID over the wire; creates a marker fixture company when the table is empty. */
async function firstCompanyId(ctx: IntegrationCheckContext, fx: FlsClientFixture): Promise<string> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Companies', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    if (!res.Success) {
        throw new Error(`companies read over the wire failed: ${res.ErrorMessage}`);
    }
    if (res.Results.length > 0) {
        return res.Results[0].ID;
    }
    const company = await ctx.Provider.GetEntityObject<MJCompanyEntity>('MJ: Companies', ctx.User);
    company.NewRecord();
    company.Name = 'IT FLS Wire Fixture Co';
    company.Description = 'FLS wire integration-test fixture (mj-integration-test — safe to delete)';
    if (!(await company.Save())) {
        throw new Error(`creating the fixture company over the wire failed: ${company.LatestResult?.CompleteMessage ?? ''}`);
    }
    fx.CreatedCompanyID = company.ID;
    return company.ID;
}

// ─────────────────────────────────────────────────────────────────── checks

/**
 * FC1 — the restricted WIRE identity's list results omit the denied column (3.1 over the
 * wire). Provisioning already proved propagation (Setup polls); this pins the steady state.
 */
export async function CheckFc1_WireListStripsDeniedColumn(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsClientFixture, 'fls-enforcement-client.FC1')) return;
    const fx = ctx.FlsClientFixture!;
    const rows = await readEmployees(fx.ReaderProvider!);
    Assert(rows.length > 0, 'the wire fixture employee guarantees at least one row');
    for (const row of rows) {
        Assert(!(FLS_READER_DENIED_FIELD in row),
            `denied column ${FLS_READER_DENIED_FIELD} reached the restricted wire identity`);
    }
    const fixtureRow = rows.find(r => UUIDsEqual(String(r.ID), fx.FixtureEmployeeID!));
    Assert(fixtureRow != null && 'FirstName' in fixtureRow, 'allowed columns must survive to the restricted wire identity');
}

/**
 * FC2 — the single-record GraphQL payload omits the denied field (3.8): a restricted user's
 * entity LOAD over the wire arrives without the denied column's value.
 */
export async function CheckFc2_WireSingleRecordLoadStripped(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsClientFixture, 'fls-enforcement-client.FC2')) return;
    const fx = ctx.FlsClientFixture!;
    const emp = await fx.ReaderProvider!.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY);
    Assert(await emp.Load(fx.FixtureEmployeeID!), 'the restricted wire identity must be able to load the record');
    AssertEqual(emp.FirstName, 'WireFixture', 'allowed fields must arrive in the single-record payload');

    // The denied field must carry NO real value: absent from the payload entirely, or null.
    // (Reading it through the typed accessor may also throw — all three are "no value".)
    let emailValue: unknown = null;
    try {
        emailValue = emp.GetAll()[FLS_READER_DENIED_FIELD];
    } catch {
        emailValue = null;
    }
    Assert(emailValue === null || emailValue === undefined,
        `the denied ${FLS_READER_DENIED_FIELD} arrived in the single-record payload with a value ('${String(emailValue)}')`);
}

/** FC3 — the unrestricted WIRE identity still receives the column, with its real value (3.2 over the wire). */
export async function CheckFc3_WireUnrestrictedUserUnaffected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsClientFixture, 'fls-enforcement-client.FC3')) return;
    const fx = ctx.FlsClientFixture!;
    const rows = await readEmployees(fx.WriterProvider!);
    const fixtureRow = rows.find(r => UUIDsEqual(String(r.ID), fx.FixtureEmployeeID!));
    Assert(fixtureRow != null, 'fixture employee visible to the unrestricted wire identity');
    const email = fixtureRow![FLS_READER_DENIED_FIELD];
    Assert(typeof email === 'string' && email.startsWith('it-fls-wire-'),
        `${FLS_READER_DENIED_FIELD} must reach the unrestricted wire identity with its real value (got '${String(email)}')`);
}

/** FC4 — a caller-authored predicate on a denied field is rejected over the wire with the ambiguous message (3.4). */
export async function CheckFc4_WirePredicateRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsClientFixture, 'fls-enforcement-client.FC4')) return;
    const fx = ctx.FlsClientFixture!;
    let succeeded = false;
    let message = '';
    try {
        const res = await RunView.FromMetadataProvider(fx.ReaderProvider!).RunView(
            { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `${FLS_READER_DENIED_FIELD} LIKE '%@%'`, ResultType: 'simple' } as RunViewParams);
        succeeded = res.Success;
        message = res.ErrorMessage ?? '';
    } catch (e) {
        message = e instanceof Error ? e.message : String(e);
    }
    Assert(!succeeded, 'an ExtraFilter on a denied field must be rejected over the wire, not answered');
    Assert(message.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)),
        `the wire rejection must carry the ambiguous wording (got '${message}')`);
}

/** The 'fls-enforcement-client' bundle (client transport, needs MJAPI + seeded fixtures). */
export const FlsClientChecks: NamedCheck[] = [
    { Id: 'fls-enforcement-client.FC1', Name: 'FC1: list results to the restricted wire identity omit the denied column', Fn: CheckFc1_WireListStripsDeniedColumn },
    { Id: 'fls-enforcement-client.FC2', Name: 'FC2: the single-record GraphQL payload omits the denied field', Fn: CheckFc2_WireSingleRecordLoadStripped },
    { Id: 'fls-enforcement-client.FC3', Name: 'FC3: the unrestricted wire identity still receives the column with its real value', Fn: CheckFc3_WireUnrestrictedUserUnaffected },
    { Id: 'fls-enforcement-client.FC4', Name: 'FC4: a predicate on a denied field is rejected over the wire with the ambiguous message', Fn: CheckFc4_WirePredicateRejected }
];

for (const check of FlsClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
