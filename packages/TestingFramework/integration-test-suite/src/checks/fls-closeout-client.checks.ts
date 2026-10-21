/**
 * fls-closeout-client.checks.ts — the 'fls-closeout-client' bundle (client transport, needs MJAPI):
 * the field-level security close-out fixes that live in MJAPI's transports, proven OVER THE WIRE
 * as genuinely restricted principals.
 *
 *   CW1  a restricted user's object holds no denied value after a wire Load and after a wire Save
 *   CW2  GraphQL create carrying a denied key is refused with the client-input wording, and nothing is written
 *   CW3  GraphQL update carrying a denied key, and one carrying an unknown key in OldValues___, are refused with
 *        the SAME wording; the stored row does not move
 *   CW4  transaction-group create and update carrying a denied key and an unknown key are refused with the
 *        SAME wording; nothing is written
 *   CW5  a transaction-group update's returned delta carries no denied value
 *   CW6  the client's own transaction group creates a record for a restricted user (its payload omits the
 *        denied fields), and the result carries none of them
 *   CW7  REST get and REST runView (an entity_object request is answered as simple rows) carry no denied value
 *   CW8  REST create and update carrying a denied key and an unknown key are refused with the SAME wording;
 *        an allowed REST update's response carries no denied value
 *   CW9  over the wire, an unknown column in a filter is refused with the denied column's wording, and a
 *        raw RunDynamicView whose OverrideExcludeFilter names a denied column is refused
 *
 * IDENTITIES. Per-user enforcement over the wire is only observable through per-user authentication
 * (see `fls-enforcement-client`): this bundle reuses that bundle's fixture (`SetupFlsClientFixture`),
 * which mints user API keys for the seeded reader, writer and multi users and builds a GraphQL
 * connection authenticated as each. The multi user is the write identity: entity-level create and
 * update through the Writer role, and — tightened here — a read Deny on Title through the Denier role,
 * so a denied key in client input is something it could only have fabricated. The reader (Email
 * denied) is the read identity. REST needs a raw key, so Setup mints one more key each for the reader
 * and the multi user.
 *
 * Raw GraphQL and raw REST bodies are sent exactly as any API caller can send them, bypassing the
 * client library (which never sends a denied key), because that is the input the gate exists for.
 *
 * REST is optional on MJAPI (`MJ_REST_API_ENABLED=true` / `restApiOptions.enabled`); CW7 and CW8 skip
 * loudly when the endpoint does not answer. Set `MJAPI_REST_URL` when REST is not at
 * `<MJAPI origin><MJAPI_BASE_PATH>/api/v1`.
 *
 * Teardown restores the Title rule, deletes the rows the checks created and the extra keys, then
 * runs the shared fixture's teardown. Skips loudly when MJAPI is unreachable, the seed is absent,
 * or the entity is already FLS-enabled; a present seed that fails to provision fails every check.
 */
import { RunView, FieldSecurityDenialMessage, FieldSecurityClientInputMessage } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, LoadClientConfig } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, FlsClientFixture } from '@memberjunction/testing-integration';
import {
    SEEDED_FLS_ENTITY, SEED_FIXTURES_COMMAND, FLS_DENIER_ROLE, FLS_DENY_READ_FIELD, FLS_READER_DENIED_FIELD
} from '@memberjunction/testing-integration';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJEmployeeEntity, MJEntityFieldPermissionEntity } from '@memberjunction/core-entities';
import {
    SetupFlsClientFixture, TeardownFlsClientFixture, SetFieldRuleOverWire, WaitForWirePropagation,
    FirstCompanyIdOverWire, MintFullAccessUserKey, DeleteMintedUserKeys
} from './fls-client.checks';
import type { MintedUserKeyIds } from './fls-client.checks';
import {
    ErrorText, AssertDeniedEqualsUnknown, AssertValuesWithheld, AssertValuePresent, AssertEntityObjectWithholds, UNKNOWN_FIELD
} from './fls-closeout-shared';

const BUNDLE = 'fls-closeout-client';
/** Tags the rows this bundle creates; short, because the whole last name must fit in 50 characters. */
const MARKER = '(mjit fls-cw)';
/** How long Setup waits for MJAPI to honour a freshly minted key over REST (its scope cache has a ~60s envelope). */
const REST_READY_TIMEOUT_MS = 120_000;
const REST_READY_POLL_MS = 5_000;

/** The documents the raw-wire checks send, as any API caller can. */
const CREATE_EMPLOYEE_MUTATION = `
    mutation CreateEmployee($input: CreateMJEmployeeInput!) {
        CreateMJEmployee(input: $input) { ID FirstName }
    }
`;
const UPDATE_EMPLOYEE_MUTATION = `
    mutation UpdateEmployee($input: UpdateMJEmployeeInput!) {
        UpdateMJEmployee(input: $input) { ID FirstName }
    }
`;
const EXECUTE_TG_MUTATION = `
    mutation ExecuteTransactionGroup($group: TransactionInputType!) {
        ExecuteTransactionGroup(group: $group) { Success ErrorMessages ResultsJSON }
    }
`;

/** The stored values of the wire fixture's denied columns. */
interface WireMarkers {
    Email: string;
    Title: string;
}

/** What this bundle provisions on top of the shared wire fixture. */
interface CloseoutClientState extends MintedUserKeyIds {
    Markers?: WireMarkers;
    ProvisionError?: string;
    /** Why the multi-identity checks skip (the multi user is not seeded). */
    MultiSkipReason?: string;
    TitleRuleID?: string;
    CompanyID?: string;
    ReaderRawKey?: string;
    MultiRawKey?: string;
    /** The REST base URL once a minted key is honoured there; absent when REST is off. */
    RestBase?: string;
    RestSkipReason?: string;
}

const state: CloseoutClientState = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };

/** One write's outcome: whether it went through, and the reason the caller was given. */
interface WireOutcome {
    Done: boolean;
    Message: string;
}

/** One item of `TransactionInputType.Items`. */
interface TransactionItemInput {
    EntityName: string;
    EntityObjectJSON: string;
    OperationType: 'Create' | 'Update' | 'Delete';
}

/** What `ExecuteTransactionGroup` returns. */
interface TransactionGroupOutput {
    ExecuteTransactionGroup?: { Success: boolean; ErrorMessages: string[]; ResultsJSON: string[] } | null;
}

/** The part of a GraphQL client error that carries the server's own message. */
interface GraphQLErrorShape {
    response?: { errors?: Array<{ message?: string }> };
}

/** The fixture as the checks use it. */
interface ReadyWire {
    Fx: FlsClientFixture;
    Markers: WireMarkers;
}

// ─────────────────────────────────────────────────────────────────── helpers

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function skip(checkId: string, reason: string): void {
    console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${reason}`);
}

function hasGraphQLErrors(e: unknown): e is GraphQLErrorShape {
    return typeof e === 'object' && e !== null && 'response' in e;
}

/** The server's own message for a failed GraphQL call: its first GraphQL error, else the thrown error's text. */
function wireErrorText(e: unknown): string {
    return (hasGraphQLErrors(e) ? e.response?.errors?.[0]?.message : undefined) ?? ErrorText(e);
}

/** The fixture, or undefined after a loud skip. A seed that is present but failed to provision fails. */
function ready(ctx: IntegrationCheckContext, checkId: string): ReadyWire | undefined {
    const fx = ctx.FlsClientFixture;
    if (fx?.ProvisionError || state.ProvisionError) {
        Assert(false, `${checkId}: the wire fixture could not be provisioned: ${fx?.ProvisionError ?? state.ProvisionError}`);
    }
    if (!fx || !fx.Usable || !state.Markers) {
        skip(checkId, `${fx?.Reason ?? 'fixture not provisioned'}. Seed with \`${SEED_FIXTURES_COMMAND}\` and start MJAPI.`);
        return undefined;
    }
    return { Fx: fx, Markers: state.Markers };
}

/** {@link ready} for a check that writes as the multi user. */
function readyForMulti(ctx: IntegrationCheckContext, checkId: string): (ReadyWire & { Multi: GraphQLDataProvider }) | undefined {
    const r = ready(ctx, checkId);
    if (!r) return undefined;
    if (!r.Fx.MultiProvider || state.MultiSkipReason) {
        skip(checkId, state.MultiSkipReason ?? 'the multi-role wire identity is not provisioned');
        return undefined;
    }
    // BuildUserKeyProviderWithRetry builds a GraphQLDataProvider; the raw-wire checks need its ExecuteGQL.
    return { ...r, Multi: r.Fx.MultiProvider as GraphQLDataProvider };
}

/** The fixture employee as the system-key identity reads it now: the stored truth, cache bypassed. */
async function storedFixtureRow(fx: FlsClientFixture): Promise<Record<string, unknown>> {
    const res = await new RunView().RunView<Record<string, unknown>>(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `ID = '${fx.FixtureEmployeeID}'`, ResultType: 'simple', BypassCache: true });
    Assert(res.Success && res.Results.length === 1, `reading the stored fixture row failed: ${res.ErrorMessage ?? `${res.Results.length} rows`}`);
    return res.Results[0];
}

/** Employee rows whose LastName is exactly `lastName`, as stored. */
async function storedRowsWithLastName(lastName: string): Promise<Array<{ ID: string }>> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `LastName = '${lastName.replace(/'/g, "''")}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true });
    Assert(res.Success, `reading back created rows failed: ${res.ErrorMessage}`);
    return res.Results;
}

/** Asserts no row was written under `lastName`; tracks any that was, so teardown removes it. */
async function assertNothingCreated(fx: FlsClientFixture, lastName: string, what: string): Promise<void> {
    const rows = await storedRowsWithLastName(lastName);
    fx.CreatedEmployeeIDs.push(...rows.map(row => row.ID));
    AssertEqual(rows.length, 0, `${what}: a refused create must write nothing`);
}

async function sendGQL(provider: GraphQLDataProvider, document: string, variables: Record<string, unknown>): Promise<WireOutcome> {
    try {
        await provider.ExecuteGQL(document, variables);
        return { Done: true, Message: '' };
    } catch (e) {
        return { Done: false, Message: wireErrorText(e) };
    }
}

/** Runs a raw transaction group; a refusal arrives thrown or as `Success: false` with per-item messages. */
async function sendTransactionGroup(provider: GraphQLDataProvider, items: TransactionItemInput[]): Promise<WireOutcome & { Results: string[] }> {
    try {
        const data = (await provider.ExecuteGQL(EXECUTE_TG_MUTATION, { group: { Items: items, Variables: [] } })) as TransactionGroupOutput | null;
        const result = data?.ExecuteTransactionGroup;
        Assert(result != null, 'ExecuteTransactionGroup returned no result');
        return { Done: result!.Success, Message: (result!.ErrorMessages ?? []).join(' | '), Results: result!.ResultsJSON ?? [] };
    } catch (e) {
        return { Done: false, Message: wireErrorText(e), Results: [] };
    }
}

/** A create payload for a new employee with a unique last name, plus `extra` keys. */
function newEmployeeValues(companyID: string, label: string, extra: Record<string, string>): { LastName: string; Values: Record<string, string> } {
    // Employee.LastName holds 50 characters: a longer value fails client validation before any
    // request is sent, which would make a create check pass or fail for the wrong reason.
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const lastName = `${label.slice(0, 20)} ${unique} ${MARKER}`;
    return {
        LastName: lastName,
        Values: { FirstName: 'CloseoutWire', LastName: lastName, CompanyID: companyID, Email: `it-fls-cw-${Date.now()}@integration.test`, ...extra },
    };
}

// ─────────────────────────────────────────────────────────────────── REST

/** The REST base URL: `MJAPI_REST_URL`, else the GraphQL endpoint's origin plus `MJAPI_BASE_PATH` and `/api/v1`. */
function restBaseUrl(): string {
    if (process.env.MJAPI_REST_URL) {
        return process.env.MJAPI_REST_URL.replace(/\/$/, '');
    }
    const origin = new URL(LoadClientConfig().Url).origin;
    const basePath = (process.env.MJAPI_BASE_PATH ?? '').replace(/\/$/, '');
    return `${origin}${basePath}/api/v1`;
}

/** One REST call as the holder of `rawKey`; the body is parsed JSON when there is one. */
async function rest(rawKey: string, method: 'GET' | 'POST' | 'PUT', path: string, body?: Record<string, unknown>): Promise<{ Status: number; Body: Record<string, unknown> }> {
    const response = await fetch(`${state.RestBase ?? restBaseUrl()}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-api-key': rawKey },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        parsed = { error: text };
    }
    return { Status: response.status, Body: parsed };
}

/** Waits (bounded) until REST honours the minted reader key; records why REST is unavailable otherwise. */
async function probeRest(): Promise<void> {
    const deadline = Date.now() + REST_READY_TIMEOUT_MS;
    let last = '';
    for (;;) {
        try {
            const probe = await rest(state.ReaderRawKey!, 'GET', '/users/current');
            if (probe.Status === 200) {
                state.RestBase = restBaseUrl();
                return;
            }
            if (probe.Status === 404) {
                state.RestSkipReason = `REST is not enabled on MJAPI (${restBaseUrl()} answered 404); set MJ_REST_API_ENABLED=true`;
                return;
            }
            last = `HTTP ${probe.Status}`;
        } catch (e) {
            last = ErrorText(e);
        }
        if (Date.now() > deadline) {
            state.RestSkipReason = `REST at ${restBaseUrl()} never accepted the minted key (${last})`;
            return;
        }
        await sleep(REST_READY_POLL_MS);
    }
}

function restPath(id?: string): string {
    return `/entities/${encodeURIComponent(SEEDED_FLS_ENTITY)}${id ? `/${encodeURIComponent(id)}` : ''}`;
}

function restText(body: Record<string, unknown>): string {
    return typeof body['error'] === 'string' ? body['error'] : JSON.stringify(body);
}

// ─────────────────────────────────────────────────────────────────── lifecycle

/** Gives the fixture employee a Title (as the writer, who may write it) and records both denied values. */
async function prepareMarkers(fx: FlsClientFixture): Promise<WireMarkers> {
    const emp = await fx.WriterProvider!.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY);
    Assert(await emp.Load(fx.FixtureEmployeeID!), 'the writer must load the wire fixture employee');
    const title = `IT FLS Wire Title ${Date.now().toString(36)}`;
    emp.Title = title;
    Assert(await emp.Save(), `giving the wire fixture a Title failed: ${emp.LatestResult?.CompleteMessage ?? ''}`);
    const stored = await storedFixtureRow(fx);
    return { Email: String(stored[FLS_READER_DENIED_FIELD]), Title: title };
}

/** Denies the multi user Title (through the Denier role) and waits until MJAPI enforces it on the multi connection. */
async function denyTitleForMulti(ctx: IntegrationCheckContext, fx: FlsClientFixture): Promise<void> {
    state.TitleRuleID = await SetFieldRuleOverWire(ctx, FLS_DENY_READ_FIELD, FLS_DENIER_ROLE, { Read: 'Deny', Update: 'No Access', Create: 'No Access' });
    await WaitForWirePropagation(fx.MultiProvider!,
        rows => rows.length > 0 && rows.every(row => !(FLS_DENY_READ_FIELD in row)), 'Title stripped from the multi user\'s results');
    // The server now enforces the rule, but the multi connection still holds the metadata it
    // loaded before it: refresh it, so the client knows which fields to leave out of its writes.
    await fx.MultiProvider!.Refresh();
    const entity = fx.MultiProvider!.EntityByName(SEEDED_FLS_ENTITY);
    const denied = entity?.GetDeniedReadFields(fx.MultiProvider!.CurrentUser!) ?? new Set<string>();
    if (!denied.has(FLS_DENY_READ_FIELD.toLowerCase())) {
        throw new Error(`the multi connection's refreshed metadata does not deny '${FLS_DENY_READ_FIELD}'`);
    }
}

/** Mints the raw keys REST needs and waits until REST honours them. */
async function provisionRest(ctx: IntegrationCheckContext, fx: FlsClientFixture): Promise<void> {
    const readerID = fx.ReaderProvider!.CurrentUser?.ID;
    const multiID = fx.MultiProvider?.CurrentUser?.ID;
    if (!readerID) {
        state.RestSkipReason = 'the reader connection has no current user';
        return;
    }
    state.ReaderRawKey = await MintFullAccessUserKey(ctx, state, readerID, 'IT131 FLS close-out REST reader (mj-integration-test)');
    if (multiID) {
        state.MultiRawKey = await MintFullAccessUserKey(ctx, state, multiID, 'IT131 FLS close-out REST multi (mj-integration-test)');
    }
    await probeRest();
}

async function setupCloseoutClient(ctx: IntegrationCheckContext): Promise<void> {
    Object.assign(state, {
        Markers: undefined, ProvisionError: undefined, MultiSkipReason: undefined, TitleRuleID: undefined, CompanyID: undefined,
        ReaderRawKey: undefined, MultiRawKey: undefined, RestBase: undefined, RestSkipReason: undefined,
        CreatedKeyIds: [], CreatedScopeRuleIds: [],
    });
    await SetupFlsClientFixture(ctx);
    const fx = ctx.FlsClientFixture;
    if (!fx?.Usable) {
        return;
    }
    try {
        state.Markers = await prepareMarkers(fx);
        state.CompanyID = await FirstCompanyIdOverWire(ctx, fx);
        if (fx.MultiProvider) {
            await denyTitleForMulti(ctx, fx);
        } else {
            state.MultiSkipReason = 'the seeded multi user is absent, so no wire identity can both write the entity and be denied a field';
        }
        await provisionRest(ctx, fx);
    } catch (e) {
        state.ProvisionError = ErrorText(e);
    }
}

/** Restores the multi user's Title rule to the read-only role's snapshot default. */
async function restoreTitleRule(ctx: IntegrationCheckContext): Promise<void> {
    if (!state.TitleRuleID) return;
    try {
        const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
        if (await efp.Load(state.TitleRuleID)) {
            efp.ReadAccess = 'Allow';
            efp.UpdateAccess = 'No Access';
            efp.CreateAccess = 'No Access';
            await efp.Save();
        }
    } catch { /* best-effort */ }
}

async function teardownCloseoutClient(ctx: IntegrationCheckContext): Promise<void> {
    await restoreTitleRule(ctx);
    await DeleteMintedUserKeys(ctx, state);
    await TeardownFlsClientFixture(ctx);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, { Setup: setupCloseoutClient, Teardown: teardownCloseoutClient });

// ─────────────────────────────────────────────────────────────────── checks

/** CW1 — over the wire, the multi user's object holds no Title after Load and after Save; the stored Title is untouched. */
export async function CheckCw1WireObjectWidth(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForMulti(ctx, 'CW1');
    if (!r) return;
    const emp = await r.Multi.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY);
    Assert(await emp.Load(r.Fx.FixtureEmployeeID!), 'CW1: the multi user must load the fixture employee over the wire');
    await AssertEntityObjectWithholds(emp, FLS_DENY_READ_FIELD, r.Markers.Title, 'CW1 after a wire Load');
    try {
        emp.FirstName = 'CloseoutWireSave';
        Assert(await emp.Save(), `CW1: a restricted user's save of an allowed field must succeed over the wire: ${emp.LatestResult?.CompleteMessage ?? ''}`);
        await AssertEntityObjectWithholds(emp, FLS_DENY_READ_FIELD, r.Markers.Title, 'CW1 after a wire Save');
        const stored = await storedFixtureRow(r.Fx);
        AssertEqual(stored['FirstName'], 'CloseoutWireSave', 'CW1: the allowed edit must persist');
        AssertEqual(stored[FLS_DENY_READ_FIELD], r.Markers.Title, 'CW1: the withheld Title must keep its stored value');
    } finally {
        emp.FirstName = 'WireFixture';
        await emp.Save().catch(() => false);
    }
}

/** CW2 — a GraphQL create carrying a denied key is refused with the client-input wording; nothing is written. */
export async function CheckCw2GraphQLCreateDeniedKeyRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForMulti(ctx, 'CW2');
    if (!r) return;
    const created = newEmployeeValues(state.CompanyID!, 'CW2', { [FLS_DENY_READ_FIELD]: 'fabricated' });
    const outcome = await sendGQL(r.Multi, CREATE_EMPLOYEE_MUTATION, { input: created.Values });
    Assert(!outcome.Done, 'CW2: a create naming a field the caller cannot read must be refused');
    Assert(outcome.Message.includes(FieldSecurityClientInputMessage(FLS_DENY_READ_FIELD, SEEDED_FLS_ENTITY)),
        `CW2: the refusal must read "${FieldSecurityClientInputMessage(FLS_DENY_READ_FIELD, SEEDED_FLS_ENTITY)}", got '${outcome.Message}'`);
    await assertNothingCreated(r.Fx, created.LastName, 'CW2');
}

/** CW3 — GraphQL update: a denied key and an unknown OldValues___ key are refused with the same wording; nothing moves. */
export async function CheckCw3GraphQLUpdateDeniedEqualsUnknown(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForMulti(ctx, 'CW3');
    if (!r) return;
    const id = r.Fx.FixtureEmployeeID!;
    const denied = await sendGQL(r.Multi, UPDATE_EMPLOYEE_MUTATION, { input: { ID: id, FirstName: 'CW3Denied', [FLS_DENY_READ_FIELD]: 'fabricated' } });
    const unknown = await sendGQL(r.Multi, UPDATE_EMPLOYEE_MUTATION,
        { input: { ID: id, FirstName: 'CW3Unknown', OldValues___: [{ Key: 'ID', Value: id }, { Key: UNKNOWN_FIELD, Value: 'probe' }] } });
    Assert(!denied.Done && !unknown.Done, 'CW3: both updates must be refused');
    AssertDeniedEqualsUnknown(denied.Message, FLS_DENY_READ_FIELD, unknown.Message, UNKNOWN_FIELD,
        FieldSecurityClientInputMessage, SEEDED_FLS_ENTITY, 'CW3 GraphQL update');
    const stored = await storedFixtureRow(r.Fx);
    AssertEqual(stored['FirstName'], 'WireFixture', 'CW3: a refused update must not move the row');
    AssertEqual(stored[FLS_DENY_READ_FIELD], r.Markers.Title, 'CW3: a refused update must not write the denied field');
}

/** CW4 — transaction-group create and update: a denied key and an unknown key get the same refusal; nothing is written. */
export async function CheckCw4TransactionGroupDeniedEqualsUnknown(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForMulti(ctx, 'CW4');
    if (!r) return;
    const create = async (key: string) => {
        const created = newEmployeeValues(state.CompanyID!, `CW4 ${key}`, { [key]: 'fabricated' });
        const outcome = await sendTransactionGroup(r.Multi, [{ EntityName: SEEDED_FLS_ENTITY, EntityObjectJSON: JSON.stringify(created.Values), OperationType: 'Create' }]);
        await assertNothingCreated(r.Fx, created.LastName, `CW4 create with '${key}'`);
        return outcome;
    };
    const update = (key: string) => sendTransactionGroup(r.Multi, [{
        EntityName: SEEDED_FLS_ENTITY, OperationType: 'Update',
        EntityObjectJSON: JSON.stringify({ ID: r.Fx.FixtureEmployeeID, FirstName: 'CW4', [key]: 'fabricated' }),
    }]);
    for (const [label, send] of [['create', create], ['update', update]] as const) {
        const denied = await send(FLS_DENY_READ_FIELD);
        const unknown = await send(UNKNOWN_FIELD);
        Assert(!denied.Done && !unknown.Done, `CW4 ${label}: both transaction groups must be refused`);
        AssertDeniedEqualsUnknown(denied.Message, FLS_DENY_READ_FIELD, unknown.Message, UNKNOWN_FIELD,
            FieldSecurityClientInputMessage, SEEDED_FLS_ENTITY, `CW4 transaction-group ${label}`);
    }
    const stored = await storedFixtureRow(r.Fx);
    AssertEqual(stored['FirstName'], 'WireFixture', 'CW4: a refused transaction-group update must not move the row');
}

/** CW5 — a transaction-group update's returned delta carries no value the caller may not read. */
export async function CheckCw5TransactionGroupDeltaProjected(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForMulti(ctx, 'CW5');
    if (!r) return;
    const send = (firstName: string) => sendTransactionGroup(r.Multi, [{
        EntityName: SEEDED_FLS_ENTITY, OperationType: 'Update', EntityObjectJSON: JSON.stringify({ ID: r.Fx.FixtureEmployeeID, FirstName: firstName }),
    }]);
    try {
        const outcome = await send('CW5Delta');
        Assert(outcome.Done, `CW5: an update of an allowed field must succeed: ${outcome.Message}`);
        Assert(outcome.Results.length === 1, 'CW5: the group must return one result');
        const delta = JSON.parse(outcome.Results[0]) as Record<string, unknown>;
        AssertValuesWithheld(delta, FLS_DENY_READ_FIELD, r.Markers.Title, 'CW5 transaction-group update delta');
        AssertEqual(delta['FirstName'], 'CW5Delta', 'CW5: the delta must still carry the field that changed');
    } finally {
        await send('WireFixture');
    }
}

/** CW6 — the client's transaction group creates a record for a restricted user, and the result carries no denied value. */
export async function CheckCw6ClientTransactionGroupCreate(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForMulti(ctx, 'CW6');
    if (!r) return;
    const tg = await r.Multi.CreateTransactionGroup();
    const emp = await r.Multi.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY);
    emp.NewRecord();
    const created = newEmployeeValues(state.CompanyID!, 'CW6', {});
    emp.FirstName = created.Values['FirstName'];
    emp.LastName = created.LastName;
    emp.CompanyID = state.CompanyID!;
    emp.Email = created.Values['Email'];
    emp.TransactionGroup = tg;
    const queued = await emp.Save();
    Assert(queued, `CW6: queuing the create in the transaction group must succeed: ${emp.LatestResult?.CompleteMessage ?? ''}`);
    const submitted = await tg.Submit();
    const rows = await storedRowsWithLastName(created.LastName);
    r.Fx.CreatedEmployeeIDs.push(...rows.map(row => row.ID));
    Assert(submitted, `CW6: a restricted user's transaction-group create must succeed (the client omits fields it may not read): ${emp.LatestResult?.CompleteMessage ?? ''}`);
    AssertEqual(rows.length, 1, 'CW6: the create must write exactly one row');
    const values = emp.GetAll() as Record<string, unknown>;
    Assert(values[FLS_DENY_READ_FIELD] == null, `CW6: the created object must hold no value for the denied field (got '${String(values[FLS_DENY_READ_FIELD])}')`);
}

/** The REST checks' preconditions: the fixture, and REST answering with the minted keys. */
function readyForRest(ctx: IntegrationCheckContext, checkId: string): ReadyWire | undefined {
    const r = ready(ctx, checkId);
    if (!r) return undefined;
    if (!state.RestBase) {
        skip(checkId, state.RestSkipReason ?? 'REST was not provisioned');
        return undefined;
    }
    return r;
}

/** CW7 — REST get and REST runView (entity_object is answered as simple rows) carry no denied value. */
export async function CheckCw7RestReadsProjected(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForRest(ctx, 'CW7');
    if (!r) return;
    const one = await rest(state.ReaderRawKey!, 'GET', restPath(r.Fx.FixtureEmployeeID));
    AssertEqual(one.Status, 200, `CW7: REST get as the reader must succeed: ${restText(one.Body)}`);
    AssertValuesWithheld(one.Body, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CW7 REST get');

    const view = await rest(state.ReaderRawKey!, 'POST', `/views/${encodeURIComponent(SEEDED_FLS_ENTITY)}`,
        { ExtraFilter: `ID = '${r.Fx.FixtureEmployeeID}'`, ResultType: 'entity_object', BypassCache: true });
    AssertEqual(view.Status, 200, `CW7: REST runView as the reader must succeed: ${restText(view.Body)}`);
    const rows = view.Body['Results'];
    Assert(Array.isArray(rows) && rows.length === 1, `CW7: REST runView must return the fixture row (got ${JSON.stringify(view.Body).slice(0, 200)})`);
    const row = (rows as Record<string, unknown>[])[0];
    AssertValuesWithheld(row, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CW7 REST runView row');
    Assert(UUIDsEqual(String(row['ID']), r.Fx.FixtureEmployeeID!) && row['FirstName'] === 'WireFixture',
        'CW7: an entity_object request must come back as plain field values, not a serialized entity object');
}

/** CW8 — REST create and update: denied and unknown keys get the same refusal; an allowed update's response carries no denied value. */
export async function CheckCw8RestWritesGated(ctx: IntegrationCheckContext): Promise<void> {
    const r = readyForRest(ctx, 'CW8');
    if (!r) return;
    if (!state.MultiRawKey) return skip('CW8', 'no REST key for the multi user (the multi user is not seeded)');
    const key = state.MultiRawKey;
    const create = async (field: string) => {
        const created = newEmployeeValues(state.CompanyID!, `CW8 ${field}`, { [field]: 'fabricated' });
        const response = await rest(key, 'POST', restPath(), created.Values);
        await assertNothingCreated(r.Fx, created.LastName, `CW8 REST create with '${field}'`);
        return response;
    };
    const update = (field: string) => rest(key, 'PUT', restPath(r.Fx.FixtureEmployeeID), { FirstName: 'CW8', [field]: 'fabricated' });
    for (const [label, send] of [['create', create], ['update', update]] as const) {
        const denied = await send(FLS_DENY_READ_FIELD);
        const unknown = await send(UNKNOWN_FIELD);
        Assert(denied.Status >= 400 && unknown.Status >= 400, `CW8 REST ${label}: both requests must be refused (got ${denied.Status} and ${unknown.Status})`);
        AssertDeniedEqualsUnknown(restText(denied.Body), FLS_DENY_READ_FIELD, restText(unknown.Body), UNKNOWN_FIELD,
            FieldSecurityClientInputMessage, SEEDED_FLS_ENTITY, `CW8 REST ${label}`);
    }
    try {
        const allowed = await rest(key, 'PUT', restPath(r.Fx.FixtureEmployeeID), { FirstName: 'CW8Allowed' });
        AssertEqual(allowed.Status, 200, `CW8: an allowed REST update must succeed: ${restText(allowed.Body)}`);
        AssertValuesWithheld(allowed.Body, FLS_DENY_READ_FIELD, r.Markers.Title, 'CW8 REST update response');
        AssertEqual(allowed.Body['FirstName'], 'CW8Allowed', 'CW8: the response must carry the allowed edit');
    } finally {
        await rest(key, 'PUT', restPath(r.Fx.FixtureEmployeeID), { FirstName: 'WireFixture' }).catch(() => undefined);
    }
}

/** The text of a wire RunView the server must refuse; throws if it ran. */
async function wireRunViewRefusal(provider: IMetadataProvider, params: Record<string, string | boolean>, what: string): Promise<string> {
    let succeeded = false;
    let message = '';
    try {
        const res = await RunView.FromMetadataProvider(provider).RunView({ EntityName: SEEDED_FLS_ENTITY, ResultType: 'simple', BypassCache: true, ...params });
        succeeded = res.Success;
        message = res.ErrorMessage ?? '';
    } catch (e) {
        message = wireErrorText(e);
    }
    Assert(!succeeded, `${what}: the request must be refused over the wire, but it ran`);
    return message;
}

const RUN_DYNAMIC_VIEW_QUERY = `
    query RunDynamicView($input: RunDynamicViewInput!) {
        RunDynamicView(input: $input) { Success ErrorMessage RowCount }
    }
`;

/**
 * Sends a raw RunDynamicView carrying `overrideExcludeFilter`; returns the refusal text, and throws
 * if the request ran. The client library never sends OverrideExcludeFilter on an entity-name
 * request, but any API caller can, so the raw document is what the server must refuse.
 */
async function rawOverrideExcludeFilterRefusal(provider: GraphQLDataProvider, overrideExcludeFilter: string): Promise<string> {
    let succeeded = false;
    let message = '';
    try {
        const data = (await provider.ExecuteGQL(RUN_DYNAMIC_VIEW_QUERY, {
            input: { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: '', OverrideExcludeFilter: overrideExcludeFilter, ResultType: 'simple' },
        })) as { RunDynamicView?: { Success: boolean; ErrorMessage?: string | null } } | null;
        succeeded = data?.RunDynamicView?.Success === true;
        message = data?.RunDynamicView?.ErrorMessage ?? '';
    } catch (e) {
        message = wireErrorText(e);
    }
    Assert(!succeeded, 'CW9 OverrideExcludeFilter: the raw request must be refused over the wire, but it ran');
    return message;
}

/** CW9 — over the wire: an unknown column gets the denied column's wording; OverrideExcludeFilter on a denied column is refused. */
export async function CheckCw9WireFilterGate(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CW9');
    if (!r) return;
    const reader = r.Fx.ReaderProvider!;
    const denied = await wireRunViewRefusal(reader, { ExtraFilter: `${FLS_READER_DENIED_FIELD} LIKE '%@%'` }, 'CW9 denied column');
    const unknown = await wireRunViewRefusal(reader, { ExtraFilter: `${UNKNOWN_FIELD} LIKE '%@%'` }, 'CW9 unknown column');
    AssertDeniedEqualsUnknown(denied, FLS_READER_DENIED_FIELD, unknown, UNKNOWN_FIELD, FieldSecurityDenialMessage, SEEDED_FLS_ENTITY, 'CW9 wire ExtraFilter');
    const override = await rawOverrideExcludeFilterRefusal(reader as GraphQLDataProvider, `${FLS_READER_DENIED_FIELD} LIKE '%@%'`);
    Assert(override.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)),
        `CW9: OverrideExcludeFilter naming a denied column must be refused with the ambiguous wording, got '${override}'`);
    AssertValuePresent(await storedFixtureRow(r.Fx), FLS_READER_DENIED_FIELD, r.Markers.Email, 'CW9 stored row (control)');
}

/** The 'fls-closeout-client' bundle (client transport, needs MJAPI + seeded fixtures). */
export const FlsCloseoutClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.CW1`, Name: 'CW1: over the wire, a restricted user\'s object holds no denied value after Load and after Save, and the stored value is untouched', Fn: CheckCw1WireObjectWidth },
    { Id: `${BUNDLE}.CW2`, Name: 'CW2: a GraphQL create carrying a denied key is refused with the client-input wording, and nothing is written', Fn: CheckCw2GraphQLCreateDeniedKeyRefused },
    { Id: `${BUNDLE}.CW3`, Name: 'CW3: a GraphQL update carrying a denied key and one carrying an unknown OldValues___ key are refused with the same wording, and the row does not move', Fn: CheckCw3GraphQLUpdateDeniedEqualsUnknown },
    { Id: `${BUNDLE}.CW4`, Name: 'CW4: transaction-group create and update carrying a denied key and an unknown key are refused with the same wording, and nothing is written', Fn: CheckCw4TransactionGroupDeniedEqualsUnknown },
    { Id: `${BUNDLE}.CW5`, Name: 'CW5: a transaction-group update\'s returned delta carries no value the caller may not read', Fn: CheckCw5TransactionGroupDeltaProjected },
    { Id: `${BUNDLE}.CW6`, Name: 'CW6: the client\'s own transaction group creates a record for a restricted user, and the created object holds no denied field', Fn: CheckCw6ClientTransactionGroupCreate },
    { Id: `${BUNDLE}.CW7`, Name: 'CW7: REST get and REST runView (an entity_object request answered as plain rows) carry no denied value', Fn: CheckCw7RestReadsProjected },
    { Id: `${BUNDLE}.CW8`, Name: 'CW8: REST create and update carrying a denied key and an unknown key are refused with the same wording; an allowed REST update\'s response carries no denied value', Fn: CheckCw8RestWritesGated },
    { Id: `${BUNDLE}.CW9`, Name: 'CW9: over the wire, an unknown column in a filter gets the denied column\'s wording, and OverrideExcludeFilter naming a denied column is refused', Fn: CheckCw9WireFilterGate },
];

for (const check of FlsCloseoutClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
