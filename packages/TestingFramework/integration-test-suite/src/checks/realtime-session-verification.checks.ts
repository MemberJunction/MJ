/**
 * realtime-session-verification.checks.ts — the 'realtime-session-verification' bundle (RSV1–RSV6).
 *
 * TRANSPORT: **CLIENT** (needs a live MJAPI). Mid-session identity verification of a realtime session and
 * the authorization of its event subscription, driven end to end OVER THE WIRE — the doctrine in
 * `testing-integration/CATALOG.md`:
 *
 *  - the operations are called through the typed `GraphQLRealtimeSessionClient` (the same client the
 *    browser runtime and the embeddable widget use): two mutations, a query and the
 *    `RealtimeSessionEvents` subscription,
 *  - the emailed link is redeemed with a real HTTP `GET` then `POST` against MJAPI's public
 *    `/realtime/verify` route,
 *  - session rows, the owner's attempt to forge server-decided state, and every observation of a
 *    server-side effect (the email, the audit row) go through `GraphQLDataProvider` / `RunView`.
 *
 * ## What it needs from MJAPI
 * `realtime.identityVerification` enabled with a `communicationProvider`, an `hmacSecret`, and
 * **`deliveryMode: 'dry-run'`** — the engine then builds and LOGS the email without delivering it, and
 * this bundle reads the link and code from the `MJ: Communication Logs` row over the wire. (The code and
 * token exist nowhere else: they are stored hashed, keyed by a server-only secret, so even this process —
 * which can read the session row — cannot recover them. That is the property under test.) When MJAPI is
 * not configured for verification every check skips LOUDLY; it never fails for an environment gap.
 *
 * ## Identity
 * The wire has one identity (the system API key). Fixture sessions are owned by `ctx.User`, which is that
 * identity in the standard integration setup (the same assumption `entity-server-invariants` ESI4 makes);
 * each check first PROVES it by reading its own fixture back through the verification API and skips loudly
 * if the server says "not found". "A non-owner" is a session owned by a different user, as seen by the one
 * wire identity.
 *
 * ## Server-decided fixtures
 * Sessions that carry a deadline or a policy snapshot cannot be created over the wire (the entity guard
 * refuses it — RSV3 proves that). They are seeded in-process by the server-transport bundle
 * `realtime-session-guard`, which runs first, and handed over through `realtime-session-fixtures-state`.
 * Checks that need them skip loudly when the seed did not run (e.g. this bundle was run alone).
 *
 * | Check | Proves |
 * |---|---|
 * | RSV1 | request → email → link GET has no side effects → link POST verifies → `identity.verified` observed → deadline extended; single use; token and code stored hashed |
 * | RSV2 | the typed-code path: wrong code refused and counted, right code verifies, replay refused |
 * | RSV3 | over the wire the owner cannot forge verification state or move the deadline; ordinary Config edits work |
 * | RSV4 | the session's policy snapshot is enforced: a consumer address is refused and no email is sent |
 * | RSV5 | non-owner and malformed-id access is refused identically on every operation and on the subscription |
 * | RSV6 | an event reaches only the subscription of the session it is about |
 *
 * Every check writes (sessions, and the server writes comm-log/audit rows), so all are `RequiresMutation`.
 * Fixtures are tagged "(mj-integration-test — safe to delete)" and swept in Teardown.
 *
 * NOTE: could not be executed where it was authored (no database, no MJAPI); it type-checks and is
 * registered. First-run behaviour against a live MJAPI is unproven.
 */
import { Metadata, RunView } from '@memberjunction/core';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLRealtimeSessionClient } from '@memberjunction/graphql-dataprovider';
import type { RealtimeSessionClientEvent, RealtimeSessionVerificationResult } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry, LoadClientConfig } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    ClearSeededRealtimeSessions,
    GetSeededRealtimeSessions,
    REALTIME_SESSION_FIXTURE_TAG,
    SEEDED_VERIFIED_MAX_SECONDS,
} from './realtime-session-fixtures-state';

const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const COMM_LOG_ENTITY = 'MJ: Communication Logs';
const AUDIT_LOG_ENTITY = 'MJ: Audit Logs';

/** The public verify route's mount path — a URL contract with every emailed link already sent. */
const VERIFY_ROUTE = '/realtime/verify';

/** Milliseconds to let a just-opened subscription register server-side before triggering an event. */
const SUBSCRIPTION_SETTLE_MS = 1_500;
/** Upper bounds for the things this bundle waits on (all polling is bounded). */
const EVENT_TIMEOUT_MS = 15_000;
const EMAIL_TIMEOUT_MS = 10_000;
const POLL_MS = 400;
/** How long to wait to be sure something did NOT happen. */
const QUIET_MS = 2_500;

const BUSINESS_DOMAIN = 'mj-integration-test.example';

// ───────────────────────── fixture bookkeeping ─────────────────────────

/** Session ids this bundle created over the wire (deleted in Teardown). */
let createdSessionIds: string[] = [];
/** Addresses this bundle asked the server to email (their comm-log rows are removed in Teardown). */
let usedAddresses: string[] = [];

let addressCounter = 0;
function freshAddress(): string {
    addressCounter++;
    return `rsv-${Date.now().toString(36)}-${addressCounter}@${BUSINESS_DOMAIN}`;
}

// ───────────────────────── wire plumbing ─────────────────────────

/** The real wire provider (the driver's `ctx.Provider` can be a facade — see transaction-groups.checks.ts). */
function resolveWireProvider(ctx: IntegrationCheckContext): GraphQLDataProvider | null {
    if (ctx.Provider instanceof GraphQLDataProvider) {
        return ctx.Provider;
    }
    const globalProvider = Metadata.Provider; // global-provider-ok: the client bootstrap installs the GraphQLDataProvider as the process global; the wire path deliberately resolves it
    return globalProvider instanceof GraphQLDataProvider ? globalProvider : null;
}

interface Wire {
    Provider: GraphQLDataProvider;
    Client: GraphQLRealtimeSessionClient;
    /** `scheme://host:port` of MJAPI, where the public verify route lives. */
    Origin: string;
}

function wireFor(ctx: IntegrationCheckContext, checkId: string): Wire | null {
    const provider = resolveWireProvider(ctx);
    if (!provider) {
        console.warn(`  ⚠ ${checkId} SKIPPED — no GraphQL wire provider (this bundle runs on the client transport against a live MJAPI)`);
        return null;
    }
    return { Provider: provider, Client: new GraphQLRealtimeSessionClient(provider), Origin: new URL(LoadClientConfig().Url).origin };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `done` until it returns a value or the timeout elapses. Bounded. */
async function waitFor<T>(done: () => T | undefined | Promise<T | undefined>, timeoutMs: number): Promise<T | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await done();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() >= deadline) {
            return undefined;
        }
        await sleep(POLL_MS);
    }
}

// ───────────────────────── sessions over the wire ─────────────────────────

/** The `Config` of a plain fixture session: tagged, and carrying none of the server-decided keys. */
function plainConfig(purpose: string): string {
    return JSON.stringify({ tag: REALTIME_SESSION_FIXTURE_TAG, purpose: `realtime-session-verification ${purpose}` });
}

async function firstAgentID(user: UserInfo): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>({ EntityName: 'MJ: AI Agents', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user);
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/** Another active user (a session owned by them is "someone else's" to the wire identity), or undefined. */
async function otherUserID(ctx: IntegrationCheckContext): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Users', Fields: ['ID'], ExtraFilter: `IsActive=1 AND ID<>'${EscapeSQLString(ctx.User.ID)}'`, ResultType: 'simple', MaxRows: 1 },
        ctx.User,
    );
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/** Creates a plain session over the wire, owned by `ownerUserID`. Registered for Teardown. */
async function createWireSession(ctx: IntegrationCheckContext, wire: Wire, ownerUserID: string, purpose: string): Promise<string | undefined> {
    const agentID = await firstAgentID(ctx.User);
    if (!agentID) {
        return undefined;
    }
    const session = await wire.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
    session.NewRecord();
    session.AgentID = agentID;
    session.UserID = ownerUserID;
    session.Status = 'Active';
    session.LastActiveAt = new Date();
    session.Config_ = plainConfig(purpose);
    Assert(await session.Save(), `session fixture save failed over the wire: ${session.LatestResult?.CompleteMessage}`);
    createdSessionIds.push(session.ID);
    return session.ID;
}

interface SessionRow {
    ID: string;
    Config: string | null;
    __mj_CreatedAt: string | Date;
}

/** Reads a session row over the wire, bypassing every cache. */
async function readSession(ctx: IntegrationCheckContext, sessionId: string): Promise<SessionRow> {
    const r = await new RunView().RunView<SessionRow>(
        { EntityName: SESSION_ENTITY, ExtraFilter: `ID='${EscapeSQLString(sessionId)}'`, Fields: ['ID', 'Config', '__mj_CreatedAt'], ResultType: 'simple', BypassCache: true },
        ctx.User,
    );
    const row = r.Results?.[0];
    Assert(r.Success && !!row, `session ${sessionId} did not read back over the wire: ${r.ErrorMessage ?? 'no row'}`);
    return row!;
}

function configObject(raw: string | null): Record<string, unknown> {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

/**
 * Proves the wire identity owns `sessionId` by asking the verification API about it. Returns false (after
 * a loud note) when verification is not available on this MJAPI or the session is not the caller's.
 */
async function wireOwnsSession(wire: Wire, sessionId: string, checkId: string): Promise<boolean> {
    const status = await wire.Client.GetVerificationStatus(sessionId);
    if (status.ErrorCode === 'verification_unavailable') {
        console.warn(`  ⚠ ${checkId} SKIPPED — identity verification is not enabled on this MJAPI `
            + '(needs realtime.identityVerification: enabled, communicationProvider, hmacSecret, deliveryMode "dry-run")');
        return false;
    }
    if (!status.Success) {
        console.warn(`  ⚠ ${checkId} SKIPPED — the wire identity cannot see its own fixture session (${status.ErrorCode}); `
            + 'the integration API key must authenticate as the same user as ctx.User');
        return false;
    }
    return true;
}

// ───────────────────────── observing server-side effects ─────────────────────────

interface EmailCredentials {
    Token: string;
    Code: string;
}

/** Polls `MJ: Communication Logs` over the wire for the email sent to `address`. */
async function readEmailTo(ctx: IntegrationCheckContext, address: string): Promise<EmailCredentials | undefined> {
    usedAddresses.push(address);
    return waitFor(async () => {
        const r = await new RunView().RunView<{ MessageContent: string | null }>(
            {
                EntityName: COMM_LOG_ENTITY,
                Fields: ['MessageContent'],
                ExtraFilter: `Direction='Sending' AND MessageContent LIKE '%${EscapeSQLString(address)}%'`,
                OrderBy: 'MessageDate DESC',
                ResultType: 'simple',
                MaxRows: 1,
                BypassCache: true,
            },
            ctx.User,
        );
        const content = r.Success ? r.Results?.[0]?.MessageContent : undefined;
        if (!content) {
            return undefined;
        }
        const text = (JSON.parse(content) as { TextBody?: string }).TextBody ?? '';
        const token = /mj_rv_[0-9a-f]{32}_[0-9a-f]{64}/.exec(text)?.[0];
        const code = /conversation:\s+(\S+)\s/.exec(text)?.[1];
        return token && code ? { Token: token, Code: code } : undefined;
    }, EMAIL_TIMEOUT_MS);
}

/** True when the server logged ANY email to `address` within the quiet window. */
async function emailWasLogged(ctx: IntegrationCheckContext, address: string): Promise<boolean> {
    await sleep(QUIET_MS);
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: COMM_LOG_ENTITY, Fields: ['ID'], ExtraFilter: `MessageContent LIKE '%${EscapeSQLString(address)}%'`, ResultType: 'simple', MaxRows: 1, BypassCache: true },
        ctx.User,
    );
    return r.Success && (r.Results?.length ?? 0) > 0;
}

/** A live view of a session's event subscription. */
interface Watcher {
    Events: RealtimeSessionClientEvent[];
    Errors: unknown[];
    Stop(): void;
}

/** Subscribes and waits for the subscription to register server-side, so a following event cannot be missed. */
async function watch(wire: Wire, sessionId: string): Promise<Watcher> {
    const events: RealtimeSessionClientEvent[] = [];
    const errors: unknown[] = [];
    const subscription = wire.Client.SubscribeToSessionEvents(sessionId).subscribe({
        next: (event) => events.push(event),
        error: (error: unknown) => errors.push(error),
    });
    await sleep(SUBSCRIPTION_SETTLE_MS);
    return { Events: events, Errors: errors, Stop: () => subscription.unsubscribe() };
}

/** Redeems an emailed link the way a person would: GET the confirm page, then POST the form. */
async function openLink(wire: Wire, token: string): Promise<{ GetStatus: number; GetType: string; GetCache: string; PostStatus?: number }> {
    const page = await fetch(`${wire.Origin}${VERIFY_ROUTE}/${token}`);
    await page.text();
    return { GetStatus: page.status, GetType: page.headers.get('content-type') ?? '', GetCache: page.headers.get('cache-control') ?? '' };
}

async function submitLink(wire: Wire, token: string): Promise<number> {
    const response = await fetch(`${wire.Origin}${VERIFY_ROUTE}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(token)}`,
    });
    await response.text();
    return response.status;
}

/** Requests verification for a fresh address and returns the credentials read back from the email log. */
async function requestAndReadEmail(
    ctx: IntegrationCheckContext,
    wire: Wire,
    sessionId: string,
): Promise<{ Address: string; Credentials: EmailCredentials; Requested: RealtimeSessionVerificationResult }> {
    const address = freshAddress();
    const requested = await wire.Client.RequestVerification({ AgentSessionID: sessionId, Name: 'Pat Integration', Email: address });
    Assert(requested.Success, `request refused: ${requested.ErrorCode} ${requested.Message}`);
    AssertEqual(requested.VerificationState, 'pending', 'state after request');
    const credentials = await readEmailTo(ctx, address);
    Assert(
        !!credentials,
        `no email to ${address} appeared in MJ: Communication Logs within ${EMAIL_TIMEOUT_MS}ms — MJAPI must run with `
            + 'realtime.identityVerification.deliveryMode = "dry-run" (and the communication provider must be able to build a message)',
    );
    return { Address: address, Credentials: credentials!, Requested: requested };
}

const isVerifiedEvent = (event: RealtimeSessionClientEvent): boolean => event.Type === 'identity.verified';

// ───────────────────────── the checks ─────────────────────────

export const RealtimeSessionVerificationChecks: NamedCheck[] = [
    {
        Id: 'realtime-session-verification.RSV1',
        Name: 'RSV1: request → email → link GET (no side effects) → link POST verifies → identity.verified observed → deadline extended; single use; stored hashed',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const id = 'realtime-session-verification.RSV1';
            const wire = wireFor(ctx, id);
            if (!wire) {
                return;
            }
            const seeded = GetSeededRealtimeSessions()?.Capped;
            const sessionId = seeded?.SessionID ?? (await createWireSession(ctx, wire, ctx.User.ID, 'RSV1'));
            if (!sessionId || !(await wireOwnsSession(wire, sessionId, id))) {
                return;
            }
            if (!seeded) {
                console.warn(`  ⚠ ${id}: no seeded capped session (realtime-session-guard did not run) — the deadline-extension assertions are SKIPPED`);
            }

            const watcher = await watch(wire, sessionId);
            try {
                const before = await readSession(ctx, sessionId);
                const { Credentials } = await requestAndReadEmail(ctx, wire, sessionId);

                // Hashed at rest: neither secret is recoverable from the row the session owner can read.
                const pending = (await readSession(ctx, sessionId)).Config ?? '';
                Assert(!pending.includes(Credentials.Token), 'the raw link token is stored in Session.Config');
                Assert(!pending.includes(`"${Credentials.Code}"`) && !pending.includes(Credentials.Code), 'the raw code is stored in Session.Config');
                Assert(pending.includes('CodeHash'), 'the pending verification is not recorded on the session');

                // A mail scanner GETs every link: that must change nothing.
                const page = await openLink(wire, Credentials.Token);
                AssertEqual(page.GetStatus, 200, 'the confirm page renders');
                Assert(/text\/html/i.test(page.GetType), `the confirm page is HTML, got '${page.GetType}'`);
                Assert(/no-store/i.test(page.GetCache), `the confirm page must be no-store, got '${page.GetCache}'`);
                AssertEqual((await wire.Client.GetVerificationStatus(sessionId)).VerificationState, 'pending', 'a GET must not consume the link');

                // The human's click.
                AssertEqual(await submitLink(wire, Credentials.Token), 200, 'the link POST verifies');
                AssertEqual((await wire.Client.GetVerificationStatus(sessionId)).VerificationState, 'verified', 'state after the link POST');

                const event = await waitFor(() => watcher.Events.find(isVerifiedEvent), EVENT_TIMEOUT_MS);
                Assert(!!event, `no identity.verified event reached the subscription within ${EVENT_TIMEOUT_MS}ms`);
                AssertEqual(event!.AgentSessionID, sessionId, 'the event is addressed to the session');
                AssertEqual(watcher.Errors.length, 0, 'the subscription errored');

                const after = await readSession(ctx, sessionId);
                const verifiedConfig = configObject(after.Config);
                Assert(JSON.stringify(verifiedConfig['identityVerification'] ?? {}).includes('"Verified"'), 'the verified identity is not recorded on the session');
                Assert(!('Pending' in ((verifiedConfig['identityVerification'] as Record<string, unknown>) ?? {})), 'the pending verification survived a successful redemption');

                if (seeded) {
                    const beforeDeadline = Date.parse(String(configObject(before.Config)['maxSessionDeadlineIso']));
                    const afterDeadline = Date.parse(String(verifiedConfig['maxSessionDeadlineIso']));
                    Assert(afterDeadline > beforeDeadline, `the deadline was not extended (before ${beforeDeadline}, after ${afterDeadline})`);
                    const started = new Date(after.__mj_CreatedAt).getTime();
                    Assert(Math.abs(afterDeadline - (started + SEEDED_VERIFIED_MAX_SECONDS * 1000)) < 5_000, 'the deadline is session start + verifiedMaxSeconds');
                }

                // Single use.
                AssertEqual(await submitLink(wire, Credentials.Token), 410, 'a redeemed link redeems a second time');
                await sleep(QUIET_MS);
                AssertEqual(watcher.Events.filter(isVerifiedEvent).length, 1, 'a replay must not publish a second event');

                const audit = await new RunView().RunView<{ Details: string | null }>(
                    { EntityName: AUDIT_LOG_ENTITY, Fields: ['Details'], ExtraFilter: `RecordID='${EscapeSQLString(sessionId)}'`, ResultType: 'simple', BypassCache: true },
                    ctx.User,
                );
                if (audit.Success && (audit.Results?.length ?? 0) > 0) {
                    console.log('      → audit row recorded for the verification');
                } else {
                    console.warn(`  ⚠ ${id}: no MJ: Audit Logs row — push metadata/audit-log-types so 'Realtime Identity Verified' exists (the server logs instead until then)`);
                }
            } finally {
                watcher.Stop();
            }
        },
    },
    {
        Id: 'realtime-session-verification.RSV2',
        Name: 'RSV2: typed code — wrong code refused and counted, right code verifies and publishes once, replay refused',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const id = 'realtime-session-verification.RSV2';
            const wire = wireFor(ctx, id);
            const sessionId = wire ? await createWireSession(ctx, wire, ctx.User.ID, 'RSV2') : undefined;
            if (!wire || !sessionId || !(await wireOwnsSession(wire, sessionId, id))) {
                return;
            }
            const watcher = await watch(wire, sessionId);
            try {
                const { Credentials } = await requestAndReadEmail(ctx, wire, sessionId);
                const wrong = Credentials.Code === '000000' ? '111111' : '000000';

                const bad = await wire.Client.SubmitVerificationCode({ AgentSessionID: sessionId, Code: wrong });
                Assert(!bad.Success && bad.ErrorCode === 'invalid_code', `a wrong code must be refused as invalid_code, got ${bad.ErrorCode}`);
                Assert(typeof bad.AttemptsRemaining === 'number', 'a wrong code reports the attempts remaining');
                await sleep(QUIET_MS);
                AssertEqual(watcher.Events.length, 0, 'a wrong code publishes nothing');

                const good = await wire.Client.SubmitVerificationCode({ AgentSessionID: sessionId, Code: Credentials.Code });
                Assert(good.Success, `the right code was refused: ${good.ErrorCode} ${good.Message}`);
                AssertEqual(good.VerificationState, 'verified', 'state after the right code');
                Assert(!!(await waitFor(() => watcher.Events.find(isVerifiedEvent), EVENT_TIMEOUT_MS)), 'no identity.verified event after the right code');

                const replay = await wire.Client.SubmitVerificationCode({ AgentSessionID: sessionId, Code: Credentials.Code });
                Assert(!replay.Success, 'a used code is accepted again');
                // …and the link in the same email is dead too: one verification, whichever is used first.
                AssertEqual(await submitLink(wire, Credentials.Token), 410, 'the emailed link works after the code was used');
                AssertEqual(watcher.Events.filter(isVerifiedEvent).length, 1, 'exactly one event for one verification');
            } finally {
                watcher.Stop();
            }
        },
    },
    {
        Id: 'realtime-session-verification.RSV3',
        Name: 'RSV3: over the wire the owner cannot forge verification state or the deadline (create or update); ordinary Config edits work',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const id = 'realtime-session-verification.RSV3';
            const wire = wireFor(ctx, id);
            const sessionId = wire ? await createWireSession(ctx, wire, ctx.User.ID, 'RSV3') : undefined;
            if (!wire || !sessionId) {
                return;
            }
            const forgedState = { SendCount: 0, Verified: { Email: `forged@${BUSINESS_DOMAIN}`, Name: 'Forged', VerifiedAt: new Date().toISOString(), Method: 'link' } };

            // UPDATE: the resolver must dispatch to MJAIAgentSessionEntityServer, which refuses the change.
            const forged = await wire.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
            Assert(await forged.Load(sessionId), `session ${sessionId} did not load over the wire`);
            forged.Config_ = JSON.stringify({ ...configObject(forged.Config_), identityVerification: forgedState });
            Assert(!(await forged.Save()), 'the owner forged Config.identityVerification with a Save over the wire');
            Assert(!('identityVerification' in configObject((await readSession(ctx, sessionId)).Config)), 'a refused forge left verification state behind');

            const moved = await wire.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
            await moved.Load(sessionId);
            moved.Config_ = JSON.stringify({ ...configObject(moved.Config_), maxSessionDeadlineIso: new Date(Date.now() + 86_400_000).toISOString() });
            Assert(!(await moved.Save()), 'the owner moved Config.maxSessionDeadlineIso with a Save over the wire');
            Assert(!('maxSessionDeadlineIso' in configObject((await readSession(ctx, sessionId)).Config)), 'a refused deadline move left a deadline behind');

            // CREATE: a brand-new row cannot be born carrying server-decided state either.
            const agentID = await firstAgentID(ctx.User);
            if (agentID) {
                const born = await wire.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
                born.NewRecord();
                born.AgentID = agentID;
                born.UserID = ctx.User.ID;
                born.Status = 'Active';
                born.LastActiveAt = new Date();
                born.Config_ = JSON.stringify({ tag: REALTIME_SESSION_FIXTURE_TAG, purpose: 'realtime-session-verification RSV3 born', identityVerification: forgedState });
                const saved = await born.Save();
                if (saved) {
                    createdSessionIds.push(born.ID); // so Teardown removes it before the assertion below fails the check
                }
                Assert(!saved, 'a session was created over the wire already carrying a forged verified identity');
            }

            // The guard is narrow: ordinary Config edits are not blocked.
            const benign = await wire.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
            await benign.Load(sessionId);
            benign.Config_ = JSON.stringify({ ...configObject(benign.Config_), uiHint: 'rsv3' });
            Assert(await benign.Save(), `an ordinary Config edit was refused: ${benign.LatestResult?.CompleteMessage}`);
            AssertEqual(configObject((await readSession(ctx, sessionId)).Config)['uiHint'], 'rsv3', 'the ordinary edit persisted');
        },
    },
    {
        Id: 'realtime-session-verification.RSV4',
        Name: 'RSV4: the session\'s policy snapshot is enforced — a consumer-domain address is refused and no email is sent',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const id = 'realtime-session-verification.RSV4';
            const wire = wireFor(ctx, id);
            const seeded = GetSeededRealtimeSessions()?.BusinessOnly;
            if (!wire) {
                return;
            }
            if (!seeded) {
                console.warn(`  ⚠ ${id} SKIPPED — no seeded business-only session (the server-transport bundle realtime-session-guard did not run in this process)`);
                return;
            }
            if (!(await wireOwnsSession(wire, seeded.SessionID, id))) {
                return;
            }
            const consumer = `rsv-${Date.now().toString(36)}@gmail.com`;
            usedAddresses.push(consumer);
            const refused = await wire.Client.RequestVerification({ AgentSessionID: seeded.SessionID, Name: 'Pat Integration', Email: consumer });
            Assert(!refused.Success && refused.ErrorCode === 'consumer_domain', `expected consumer_domain, got ${refused.ErrorCode}`);
            Assert(!(await emailWasLogged(ctx, consumer)), 'a refused address still triggered an email');
            AssertEqual((await wire.Client.GetVerificationStatus(seeded.SessionID)).VerificationState, 'unverified', 'a refusal leaves the session unverified');

            const { Requested } = await requestAndReadEmail(ctx, wire, seeded.SessionID);
            AssertEqual(Requested.VerificationState, 'pending', 'a business address is accepted under the same policy');
        },
    },
    {
        Id: 'realtime-session-verification.RSV5',
        Name: 'RSV5: a session owned by someone else, and a malformed id, are refused identically by every operation and by the subscription',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const id = 'realtime-session-verification.RSV5';
            const wire = wireFor(ctx, id);
            if (!wire) {
                return;
            }
            const own = await createWireSession(ctx, wire, ctx.User.ID, 'RSV5 own');
            if (!own || !(await wireOwnsSession(wire, own, id))) {
                return;
            }
            const strangerOwner = await otherUserID(ctx);
            if (!strangerOwner) {
                console.warn(`  ⚠ ${id} SKIPPED — the database has only one active user, so there is no "someone else" to own a session`);
                return;
            }
            const stranger = await createWireSession(ctx, wire, strangerOwner, 'RSV5 stranger');
            Assert(!!stranger, 'could not create a session owned by another user');
            const missing = '00000000-0000-4000-8000-00000000dead';

            // The owner's own subscription opens and stays open.
            const ownerWatch = await watch(wire, own);
            AssertEqual(ownerWatch.Errors.length, 0, "the owner's subscription was refused");
            ownerWatch.Stop();

            const probe = async (sessionId: string): Promise<RealtimeSessionVerificationResult[]> => [
                await wire.Client.GetVerificationStatus(sessionId),
                await wire.Client.RequestVerification({ AgentSessionID: sessionId, Name: 'Mallory', Email: freshAddress() }),
                await wire.Client.SubmitVerificationCode({ AgentSessionID: sessionId, Code: '123456' }),
            ];
            const forStranger = await probe(stranger!);
            const forMissing = await probe(missing);
            for (const result of forStranger) {
                Assert(!result.Success && result.ErrorCode === 'session_not_found', `someone else's session must read as not found, got ${result.ErrorCode}`);
            }
            // No oracle: a session that exists but is not yours is indistinguishable from one that does not exist.
            AssertEqual(JSON.stringify(forStranger), JSON.stringify(forMissing), 'a stranger session and a missing session must be indistinguishable');
            Assert(!(await emailWasLogged(ctx, 'Mallory')), 'a refused request still triggered an email');

            for (const target of [stranger!, missing, "x' OR 1=1 --"]) {
                const refusedWatch = await watch(wire, target);
                refusedWatch.Stop();
                Assert(refusedWatch.Errors.length > 0, `a subscription to '${target}' was admitted`);
                AssertEqual(refusedWatch.Events.length, 0, 'a refused subscription delivered events');
            }
        },
    },
    {
        Id: 'realtime-session-verification.RSV6',
        Name: 'RSV6: an event reaches only the subscription of the session it is about',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const id = 'realtime-session-verification.RSV6';
            const wire = wireFor(ctx, id);
            if (!wire) {
                return;
            }
            const a = await createWireSession(ctx, wire, ctx.User.ID, 'RSV6 A');
            const b = await createWireSession(ctx, wire, ctx.User.ID, 'RSV6 B');
            if (!a || !b || !(await wireOwnsSession(wire, a, id))) {
                return;
            }
            const watchA = await watch(wire, a);
            const watchB = await watch(wire, b);
            try {
                const { Credentials } = await requestAndReadEmail(ctx, wire, a);
                const verified = await wire.Client.SubmitVerificationCode({ AgentSessionID: a, Code: Credentials.Code });
                Assert(verified.Success, `verification failed: ${verified.ErrorCode}`);
                const event = await waitFor(() => watchA.Events.find(isVerifiedEvent), EVENT_TIMEOUT_MS);
                Assert(!!event, "session A's own subscription did not receive its event");
                AssertEqual(event!.AgentSessionID, a, 'the event names session A');
                await sleep(QUIET_MS);
                AssertEqual(watchB.Events.length, 0, "session B's subscription received an event about session A");
                AssertEqual((await wire.Client.GetVerificationStatus(b)).VerificationState, 'unverified', 'session B was affected by A\'s verification');
            } finally {
                watchA.Stop();
                watchB.Stop();
            }
        },
    },
];

for (const check of RealtimeSessionVerificationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/** Best-effort wire deletion of everything this bundle (and the seed bundle) left behind. */
async function sweep(ctx: IntegrationCheckContext): Promise<void> {
    const seeded = GetSeededRealtimeSessions();
    const sessionIds = [...createdSessionIds, ...(seeded ? [seeded.Capped.SessionID, seeded.BusinessOnly.SessionID] : [])];
    for (const sessionId of sessionIds) {
        const audit = await new RunView().RunView<BaseEntity>(
            { EntityName: AUDIT_LOG_ENTITY, ExtraFilter: `RecordID='${EscapeSQLString(sessionId)}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        for (const row of audit.Success ? (audit.Results ?? []) : []) {
            await row.Delete().catch(() => false);
        }
        const rows = await new RunView().RunView<MJAIAgentSessionEntity>(
            { EntityName: SESSION_ENTITY, ExtraFilter: `ID='${EscapeSQLString(sessionId)}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        for (const row of rows.Success ? (rows.Results ?? []) : []) {
            if (!(await row.Delete())) {
                console.error(`realtime-session-verification teardown: could not delete session ${row.ID}: ${row.LatestResult?.CompleteMessage}`);
            }
        }
    }
    // The dry-run email log holds the live link and code; remove those rows too.
    for (const address of usedAddresses) {
        const logs = await new RunView().RunView<BaseEntity>(
            { EntityName: COMM_LOG_ENTITY, ExtraFilter: `MessageContent LIKE '%${EscapeSQLString(address)}%'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        for (const row of logs.Success ? (logs.Results ?? []) : []) {
            await row.Delete().catch(() => false);
        }
    }
    createdSessionIds = [];
    usedAddresses = [];
    ClearSeededRealtimeSessions();
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('realtime-session-verification', {
    Setup: async () => {
        createdSessionIds = [];
        usedAddresses = [];
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        await sweep(ctx);
    },
});
