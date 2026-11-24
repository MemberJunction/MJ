/**
 * comms-v2-wire.checks.ts — the 'comms-v2-wire' bundle (CV2W1–CV2W5, IT191): the Comms V2 surfaces
 * that have a wire, driven over that wire against a running MJAPI.
 *
 * TRANSPORT: **client**. Nothing here calls an engine class in this process. Fixtures are saved
 * and every assertion is read through the GraphQL provider; the public routes are plain HTTP
 * requests to MJAPI's `/comms` mount; the work the routes enqueue is consumed by MJAPI's own
 * work-queue host and its registered `comms.activity` handler, and the checks poll for the result.
 *
 *   CV2W1: POST /comms/unsubscribe/:token (RFC 8058 one-click) answers 200 and the handler writes a
 *          'User Unsubscribe' suppression for the log's endpoint; an unknown token answers 404 and a
 *          malformed one 400.
 *   CV2W2: a correctly signed SendGrid event webhook POST (a hard bounce) answers 202 and the
 *          handler writes a 'Hard Bounce' suppression and marks the endpoint Hard Bounced.
 *   CV2W3: a webhook signed with the wrong key, one whose body was changed after signing, and one
 *          with no signature headers are each refused with 401, and no suppression appears.
 *   CV2W4: V1 RunEntityCommunicationByViewID over GraphQL in preview mode returns the recipient's
 *          message and writes no Communication Log.
 *   CV2W5: the same query routed to V2 Send (ContextData.UseV2) for a recipient whose endpoint has
 *          an active Hard Bounce suppression reports the recipient skipped with that reason and
 *          writes no Communication Log (so nothing was handed to a provider).
 *
 * WHAT IS NOT HERE, AND WHY.
 *   - A real (non-preview) V1 send over GraphQL. The mutation input has no DryRun and MJAPI holds
 *     no test provider, so a send that is not blocked would reach the real provider. CV2W5 covers
 *     the non-preview path with a recipient the gate must block.
 *   - "No provider call" as a direct assertion. A provider call cannot be observed from outside
 *     MJAPI; CV2W5 asserts what the wire shows (skipped, no log row) and comms-v2-send.CV2S4
 *     asserts the call count in-process with a counting provider.
 *
 * NEEDS. MJAPI running with its work-queue host on (`workQueue.enabled`, the default) and
 * `metadata/` pushed (the comms.activity topic and subscription). CV2W2 also needs a key pair:
 * MJAPI started with COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID set to the public key, and this
 * process given the private key in MJ_IT_SENDGRID_WEBHOOK_PRIVATE_KEY (PEM, or base64 PKCS#8 DER);
 * without the private key CV2W2 skips (allowlisted, gate `credentials`). The `/comms` base URL is
 * MJ_IT_COMMS_URL, else the GraphQL endpoint's origin + MJAPI_BASE_PATH + `/comms`.
 *
 * FIXTURES. All created through MJAPI, named with the run's tag and tagged safe to delete; see
 * comms-v2-fixtures.ts for the naming rules and for the append-only rows teardown cannot remove.
 * CV2W4/CV2W5 use a throwaway `MJ: Employees` row as the recipient and, when the entity has no
 * email message-type mapping, a temporary one that teardown removes. The two Communication Runs
 * MJAPI starts for CV2W4 and CV2W5 are not removed: the V1 result does not return their IDs.
 */
import { createPrivateKey, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCommunicationEndpointEntity,
    MJCommunicationLogEntity,
    MJCommunicationSuppressionEntity,
    MJCompanyEntity,
    MJEmployeeEntity,
    MJEntityCommunicationFieldEntity,
    MJEntityCommunicationMessageTypeEntity,
} from '@memberjunction/core-entities';
import { ComputeEndpointHash } from '@memberjunction/communication-engine';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry, LoadClientConfig, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { COMMS_IT_TAG, COMMS_IT_TAG_ASCII, CommsCleanup, CommsTestAddress, NewCommsRunTag } from './comms-v2-fixtures';
import { Sleep } from './wire-sessions';

const BUNDLE = 'comms-v2-wire';
const EMPLOYEES_ENTITY = 'MJ: Employees';
const SIGNATURE_HEADER = 'X-Twilio-Email-Event-Webhook-Signature';
const TIMESTAMP_HEADER = 'X-Twilio-Email-Event-Webhook-Timestamp';
const PRIVATE_KEY_ENV = 'MJ_IT_SENDGRID_WEBHOOK_PRIVATE_KEY';
/** How long a check waits for MJAPI's work-queue host to consume what a route enqueued. */
const HANDLER_WAIT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;
/** How long a refused request is given to (wrongly) produce a suppression: longer than the host's slowest idle poll (5 s). */
const NEGATIVE_WAIT_MS = 7_000;
/** How long MJAPI's entity-communications engine is given to pick up a mapping saved through it. */
const MAPPING_WAIT_MS = 60_000;

// ── state ──────────────────────────────────────────────────────────────────────────────────────

/** Rows every check refers to and none of them creates. */
interface WireRefs {
    Wire: GraphQLDataProvider;
    User: UserInfo;
    RunTag: string;
    CommsUrl: string;
    ChannelID: string;
    ProviderID: string;
    ProviderName: string;
    ProviderMessageTypeID: string;
    ProviderMessageTypeName: string;
    SenderID: string;
}

/** A recipient a public route acts on: an endpoint and a sent log that points at it. */
interface WireRecipient {
    Address: string;
    Endpoint: MJCommunicationEndpointEntity;
    Log: MJCommunicationLogEntity;
}

/** The record RunEntityCommunicationByViewID is run against, and what makes its entity communicable. */
interface EntityCommsFixture {
    EntityID: string;
    Address: string;
    Employee: MJEmployeeEntity;
    Endpoint: MJCommunicationEndpointEntity;
}

interface WireState {
    Refs: WireRefs;
    Endpoints: MJCommunicationEndpointEntity[];
    Logs: MJCommunicationLogEntity[];
    Suppressions: MJCommunicationSuppressionEntity[];
    EntityComms?: EntityCommsFixture;
    Employee?: MJEmployeeEntity;
    CreatedCompany?: MJCompanyEntity;
    CreatedMessageType?: MJEntityCommunicationMessageTypeEntity;
    CreatedField?: MJEntityCommunicationFieldEntity;
}

let state: WireState | undefined;
/** Set when Setup could not build the shared references; every check then fails with it. */
let setupError: string | undefined;

function fx(): WireState {
    Assert(setupError == null, `${BUNDLE} setup failed: ${setupError ?? ''}`);
    Assert(state != null, `${BUNDLE} state missing (bundle Setup did not run)`);
    return state!;
}

/** The real wire provider (the driver's `ctx.Provider` can be a facade — see livekit-room.checks.ts). */
function resolveWireProvider(ctx: IntegrationCheckContext): GraphQLDataProvider | null {
    if (ctx.Provider instanceof GraphQLDataProvider) {
        return ctx.Provider;
    }
    const globalProvider = Metadata.Provider; // global-provider-ok: the client bootstrap installs the GraphQLDataProvider as the process global; the wire path deliberately resolves it
    return globalProvider instanceof GraphQLDataProvider ? globalProvider : null;
}

/** MJAPI's public `/comms` mount: the override, else the GraphQL origin plus MJAPI_BASE_PATH. */
function resolveCommsUrl(): string {
    const override = process.env.MJ_IT_COMMS_URL?.trim();
    if (override) {
        return override.replace(/\/+$/, '');
    }
    const basePath = (process.env.MJAPI_BASE_PATH ?? '').trim().replace(/^\/*/, '/').replace(/\/+$/, '');
    return `${new URL(LoadClientConfig().Url).origin}${basePath}/comms`;
}

// ── reads over GraphQL ─────────────────────────────────────────────────────────────────────────

/** The first row of `entityName` matching `filter`, read through MJAPI; fails the check when there is none. */
async function requireRow<T>(user: UserInfo, entityName: string, filter: string, fields: string[], what: string): Promise<T> {
    const res = await new RunView().RunView<T>(
        { EntityName: entityName, ExtraFilter: filter, Fields: fields, MaxRows: 1, ResultType: 'simple', BypassCache: true },
        user,
    );
    Assert(res.Success, `reading ${what} over GraphQL failed: ${res.ErrorMessage ?? ''}`);
    Assert(res.Results.length > 0, `${what} not found (is metadata/ pushed?)`);
    return res.Results[0];
}

interface SuppressionRow {
    ID: string;
    Reason: MJCommunicationSuppressionEntity['Reason'];
    Source: MJCommunicationSuppressionEntity['Source'];
    Status: MJCommunicationSuppressionEntity['Status'];
    CommunicationLogID: string | null;
}

async function readSuppressions(user: UserInfo, endpointID: string): Promise<SuppressionRow[]> {
    const res = await new RunView().RunView<SuppressionRow>(
        {
            EntityName: 'MJ: Communication Suppressions',
            ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(endpointID)}'`,
            Fields: ['ID', 'Reason', 'Source', 'Status', 'CommunicationLogID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    Assert(res.Success, `reading suppressions over GraphQL failed: ${res.ErrorMessage ?? ''}`);
    return res.Results;
}

/** Polls (bounded) until the endpoint has an active suppression with `reason`. */
async function waitForSuppression(user: UserInfo, endpointID: string, reason: SuppressionRow['Reason'], cause: string): Promise<SuppressionRow> {
    const deadline = Date.now() + HANDLER_WAIT_MS;
    for (;;) {
        const match = (await readSuppressions(user, endpointID)).find((s) => s.Reason === reason && s.Status === 'Active');
        if (match) {
            return match;
        }
        if (Date.now() > deadline) {
            Assert(false, `no active '${reason}' suppression for the endpoint ${HANDLER_WAIT_MS} ms after ${cause}: is MJAPI's work-queue host running (workQueue.enabled) with the comms.activity subscription pushed?`);
        }
        await Sleep(POLL_INTERVAL_MS);
    }
}

async function readEndpointStatus(user: UserInfo, endpointID: string): Promise<MJCommunicationEndpointEntity['Status']> {
    const row = await requireRow<{ Status: MJCommunicationEndpointEntity['Status'] }>(
        user, 'MJ: Communication Endpoints', `ID='${EscapeSQLString(endpointID)}'`, ['Status'], 'the fixture endpoint');
    return row.Status;
}

async function countLogs(user: UserInfo, filter: string): Promise<number> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Communication Logs', ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        user,
    );
    Assert(res.Success, `reading communication logs over GraphQL failed: ${res.ErrorMessage ?? ''}`);
    return res.Results.length;
}

// ── fixtures, saved through MJAPI ──────────────────────────────────────────────────────────────

async function loadRefs(wire: GraphQLDataProvider, user: UserInfo): Promise<WireRefs> {
    const channel = await requireRow<{ ID: string }>(user, 'MJ: Communication Base Message Types', "Type='Email'", ['ID'], 'the Email base message type');
    const provider = await requireRow<{ ID: string; Name: string }>(user, 'MJ: Communication Providers', "Name='SendGrid'", ['ID', 'Name'], 'the SendGrid provider');
    const messageType = await requireRow<{ ID: string; Name: string }>(
        user,
        'MJ: Communication Provider Message Types',
        `CommunicationProviderID='${EscapeSQLString(provider.ID)}' AND CommunicationBaseMessageTypeID='${EscapeSQLString(channel.ID)}'`,
        ['ID', 'Name'],
        "SendGrid's email message type",
    );
    const sender = await requireRow<{ ID: string }>(user, 'MJ: Communication Senders', "IsDefault=1 AND Status='Active'", ['ID'], 'the default active sender');
    return {
        Wire: wire,
        User: user,
        RunTag: NewCommsRunTag('cv2w'),
        CommsUrl: resolveCommsUrl(),
        ChannelID: channel.ID,
        ProviderID: provider.ID,
        ProviderName: provider.Name,
        ProviderMessageTypeID: messageType.ID,
        ProviderMessageTypeName: messageType.Name,
        SenderID: sender.ID,
    };
}

async function createEndpoint(s: WireState, address: string): Promise<MJCommunicationEndpointEntity> {
    const endpoint = await s.Refs.Wire.GetEntityObject<MJCommunicationEndpointEntity>('MJ: Communication Endpoints', s.Refs.User);
    endpoint.NewRecord();
    endpoint.BaseMessageTypeID = s.Refs.ChannelID;
    endpoint.NormalizedValue = address;
    endpoint.ValueHash = ComputeEndpointHash(address);
    endpoint.Domain = 'integration.test';
    endpoint.Status = 'Active';
    Assert(await endpoint.Save(), `saving the fixture endpoint over GraphQL failed: ${endpoint.LatestResult?.CompleteMessage ?? ''}`);
    s.Endpoints.push(endpoint);
    return endpoint;
}

/** An endpoint and a completed outbound log pointing at it, as a real send would have left them. */
async function createRecipient(s: WireState, label: string): Promise<WireRecipient> {
    const address = CommsTestAddress(s.Refs.RunTag, label);
    const endpoint = await createEndpoint(s, address);
    const log = await s.Refs.Wire.GetEntityObject<MJCommunicationLogEntity>('MJ: Communication Logs', s.Refs.User);
    log.NewRecord();
    log.CommunicationProviderID = s.Refs.ProviderID;
    log.CommunicationProviderMessageTypeID = s.Refs.ProviderMessageTypeID;
    log.Direction = 'Sending';
    log.Status = 'Complete';
    log.MessageDate = new Date();
    log.CommunicationSenderID = s.Refs.SenderID;
    log.CommunicationEndpointID = endpoint.ID;
    log.RecipientAddress = address;
    log.MessageClass = 'Marketing';
    log.UnsubscribeToken = randomUUID();
    log.TrackingToken = randomUUID();
    log.CorrelationData = JSON.stringify({ IntegrationTest: COMMS_IT_TAG, Run: s.Refs.RunTag });
    Assert(await log.Save(), `saving the fixture log over GraphQL failed: ${log.LatestResult?.CompleteMessage ?? ''}`);
    s.Logs.push(log);
    return { Address: address, Endpoint: endpoint, Log: log };
}

async function firstCompanyId(s: WireState): Promise<string> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Companies', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
        s.Refs.User,
    );
    Assert(res.Success, `reading companies over GraphQL failed: ${res.ErrorMessage ?? ''}`);
    if (res.Results.length > 0) {
        return res.Results[0].ID;
    }
    const company = await s.Refs.Wire.GetEntityObject<MJCompanyEntity>('MJ: Companies', s.Refs.User);
    company.NewRecord();
    company.Name = `IT Comms Wire ${s.Refs.RunTag}`;
    company.Description = `Comms V2 wire fixture ${COMMS_IT_TAG}`;
    Assert(await company.Save(), `saving the fixture company over GraphQL failed: ${company.LatestResult?.CompleteMessage ?? ''}`);
    s.CreatedCompany = company;
    return company.ID;
}

/** Gives `MJ: Employees` an email message-type mapping for the run when it has none. */
async function ensureEmailMapping(s: WireState, entityID: string): Promise<void> {
    const existing = await new RunView().RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Entity Communication Message Types',
            ExtraFilter: `EntityID='${EscapeSQLString(entityID)}' AND BaseMessageTypeID='${EscapeSQLString(s.Refs.ChannelID)}' AND IsActive=1`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        s.Refs.User,
    );
    Assert(existing.Success, `reading entity communication message types over GraphQL failed: ${existing.ErrorMessage ?? ''}`);
    if (existing.Results.length > 0) {
        return;
    }
    const mapping = await s.Refs.Wire.GetEntityObject<MJEntityCommunicationMessageTypeEntity>('MJ: Entity Communication Message Types', s.Refs.User);
    mapping.NewRecord();
    mapping.EntityID = entityID;
    mapping.BaseMessageTypeID = s.Refs.ChannelID;
    mapping.IsActive = true;
    Assert(await mapping.Save(), `saving the temporary message-type mapping over GraphQL failed: ${mapping.LatestResult?.CompleteMessage ?? ''}`);
    s.CreatedMessageType = mapping;

    const field = await s.Refs.Wire.GetEntityObject<MJEntityCommunicationFieldEntity>('MJ: Entity Communication Fields', s.Refs.User);
    field.NewRecord();
    field.EntityCommunicationMessageTypeID = mapping.ID;
    field.FieldName = 'Email';
    field.Priority = 1;
    Assert(await field.Save(), `saving the temporary communication field over GraphQL failed: ${field.LatestResult?.CompleteMessage ?? ''}`);
    s.CreatedField = field;
}

/** The throwaway employee CV2W4 and CV2W5 send to, with an endpoint for its address; built once per run. */
async function ensureEntityComms(s: WireState): Promise<EntityCommsFixture> {
    if (s.EntityComms) {
        return s.EntityComms;
    }
    const entity = s.Refs.Wire.EntityByName(EMPLOYEES_ENTITY);
    Assert(entity != null, `${EMPLOYEES_ENTITY} is not in the metadata MJAPI served`);
    const address = CommsTestAddress(s.Refs.RunTag, 'emp');
    const employee = await s.Refs.Wire.GetEntityObject<MJEmployeeEntity>(EMPLOYEES_ENTITY, s.Refs.User);
    employee.NewRecord();
    employee.FirstName = 'CommsWire';
    // Employee.LastName holds 50 characters.
    employee.LastName = `mj-it safe-to-delete ${s.Refs.RunTag}`.slice(0, 50);
    employee.Email = address;
    employee.CompanyID = await firstCompanyId(s);
    employee.Active = true;
    Assert(await employee.Save(), `saving the fixture employee over GraphQL failed: ${employee.LatestResult?.CompleteMessage ?? ''}`);
    s.Employee = employee;
    await ensureEmailMapping(s, entity!.ID);
    const endpoint = await createEndpoint(s, address);
    s.EntityComms = { EntityID: entity!.ID, Address: address, Employee: employee, Endpoint: endpoint };
    return s.EntityComms;
}

// ── the public /comms routes ───────────────────────────────────────────────────────────────────

interface HttpAnswer {
    Status: number;
    Body: Record<string, unknown>;
}

async function postComms(s: WireState, path: string, headers: Record<string, string>, body: string): Promise<HttpAnswer> {
    const response = await fetch(`${s.Refs.CommsUrl}${path}`, {
        method: 'POST',
        headers: { 'User-Agent': COMMS_IT_TAG_ASCII, ...headers },
        body,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        parsed = { error: text.slice(0, 300) };
    }
    return { Status: response.status, Body: parsed };
}

/** The one-click POST a mail client sends for `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. */
function postUnsubscribe(s: WireState, token: string): Promise<HttpAnswer> {
    return postComms(s, `/unsubscribe/${token}`, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
}

/** The private key matching the public key MJAPI verifies SendGrid webhooks with, when this process was given it. */
function loadWebhookSigningKey(): KeyObject | undefined {
    const raw = process.env[PRIVATE_KEY_ENV]?.trim();
    if (!raw) {
        return undefined;
    }
    if (raw.includes('-----BEGIN')) {
        return createPrivateKey(raw.replace(/\\n/g, '\n'));
    }
    return createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
}

/** SendGrid's Event Webhook signature: ECDSA P-256 over SHA-256 of `timestamp + body`, DER, base64. */
function signWebhook(key: KeyObject, timestamp: string, body: string): string {
    const signer = createSign('SHA256');
    signer.update(timestamp);
    signer.update(body);
    signer.end();
    return signer.sign(key, 'base64');
}

/** One SendGrid hard-bounce event for the recipient, correlated to its log the way a real send's custom args are. */
function hardBounceBody(s: WireState, recipient: WireRecipient, label: string): string {
    return JSON.stringify([
        {
            email: recipient.Address,
            timestamp: Math.floor(Date.now() / 1000),
            event: 'bounce',
            type: 'bounce',
            bounce_classification: 'Invalid Address',
            status: '5.1.1',
            reason: COMMS_IT_TAG_ASCII,
            sg_event_id: `mj-it-${s.Refs.RunTag}-${label}`,
            sg_message_id: `mj-it-${s.Refs.RunTag}-${label}.filter0001`,
            mj_log_id: recipient.Log.ID,
        },
    ]);
}

function postWebhook(s: WireState, body: string, signature?: { Signature: string; Timestamp: string }): Promise<HttpAnswer> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (signature) {
        headers[SIGNATURE_HEADER] = signature.Signature;
        headers[TIMESTAMP_HEADER] = signature.Timestamp;
    }
    return postComms(s, '/webhooks/sendgrid', headers, body);
}

function nowTimestamp(): string {
    return String(Math.floor(Date.now() / 1000));
}

// ── V1 RunEntityCommunication over GraphQL ─────────────────────────────────────────────────────

/**
 * The query as the resolver declares it. `EntityCommunicationsEngineClient` is not used: its
 * document declares `$entityID: Int!` and sends UUIDs for the message type's numeric fields, both
 * of which the schema refuses.
 */
const RUN_ENTITY_COMMUNICATION_GQL = `query RunEntityCommunicationByViewID($entityID: String!, $runViewByIDInput: RunViewByIDInput!, $providerName: String!, $providerMessageTypeName: String!, $message: CommunicationMessageInput!, $previewOnly: Boolean!, $includeProcessedMessages: Boolean!) {
    RunEntityCommunicationByViewID(entityID: $entityID, runViewByIDInput: $runViewByIDInput, providerName: $providerName, providerMessageTypeName: $providerMessageTypeName, message: $message, previewOnly: $previewOnly, includeProcessedMessages: $includeProcessedMessages) {
        Success
        ErrorMessage
        Results
    }
}`;

interface EntityCommsResultItem {
    RecipientData?: { To?: string };
    Skipped?: boolean;
    SkipReason?: string;
}

interface EntityCommsAnswer {
    Success: boolean;
    ErrorMessage?: string | null;
    Results?: { Results?: EntityCommsResultItem[] } | null;
}

interface EntityCommsResponse {
    RunEntityCommunicationByViewID?: EntityCommsAnswer;
}

interface EntityCommsCall {
    PreviewOnly: boolean;
    UseV2: boolean;
    Subject: string;
}

/** `CommunicationProviderMessageType` as the GraphQL schema declares it (its IDs are numbers there). */
interface MessageTypeInput {
    ID: number;
    CommunicationProviderID: number;
    CommunicationBaseMessageTypeID: number;
    Name: string;
    Status: string;
    AdditionalAttributes: string;
    _mj_CreatedAt: string;
    _mj_UpdatedAt: string;
    CommunicationProvider: string;
    CommunicationBaseMessageType: string;
}

/** The fields of `CommunicationMessageInput` these checks send. */
interface MessageInput {
    MessageType: MessageTypeInput;
    From: string;
    To: string;
    Subject: string;
    Body: string;
    ContextData: { UseV2?: boolean };
}

/** The message input. The schema types the message type's IDs as numbers, so only its names are meaningful. */
function buildMessageInput(s: WireState, call: EntityCommsCall): MessageInput {
    const now = new Date().toISOString();
    return {
        MessageType: {
            ID: 0,
            CommunicationProviderID: 0,
            CommunicationBaseMessageTypeID: 0,
            Name: s.Refs.ProviderMessageTypeName,
            Status: 'Active',
            AdditionalAttributes: '',
            _mj_CreatedAt: now,
            _mj_UpdatedAt: now,
            CommunicationProvider: s.Refs.ProviderName,
            CommunicationBaseMessageType: 'Email',
        },
        From: '',
        To: '',
        Subject: call.Subject,
        Body: `Comms V2 wire check ${s.Refs.RunTag} ${COMMS_IT_TAG_ASCII}`,
        ContextData: call.UseV2 ? { UseV2: true } : {},
    };
}

async function runEntityCommunication(s: WireState, target: EntityCommsFixture, call: EntityCommsCall): Promise<EntityCommsAnswer> {
    const response: EntityCommsResponse = await s.Refs.Wire.ExecuteGQL(RUN_ENTITY_COMMUNICATION_GQL, {
        entityID: target.EntityID,
        runViewByIDInput: { ViewID: '', ExtraFilter: `ID='${EscapeSQLString(target.Employee.ID)}'` },
        providerName: s.Refs.ProviderName,
        providerMessageTypeName: s.Refs.ProviderMessageTypeName,
        message: buildMessageInput(s, call),
        previewOnly: call.PreviewOnly,
        includeProcessedMessages: true,
    });
    const answer = response?.RunEntityCommunicationByViewID;
    Assert(answer != null, 'RunEntityCommunicationByViewID returned no payload');
    return answer!;
}

/** Runs the preview until MJAPI's engine has picked up the mapping saved through it (bounded). */
async function previewWhenMappingIsLive(s: WireState, target: EntityCommsFixture, subject: string): Promise<EntityCommsAnswer> {
    const deadline = Date.now() + MAPPING_WAIT_MS;
    for (;;) {
        const answer = await runEntityCommunication(s, target, { PreviewOnly: true, UseV2: false, Subject: subject });
        const notMappedYet = !answer.Success && /does not support (communication|message type)/i.test(answer.ErrorMessage ?? '');
        if (!notMappedYet || Date.now() > deadline) {
            return answer;
        }
        await Sleep(POLL_INTERVAL_MS);
    }
}

function resultItems(answer: EntityCommsAnswer): EntityCommsResultItem[] {
    return answer.Results?.Results ?? [];
}

async function suppressEndpoint(s: WireState, endpointID: string): Promise<void> {
    const suppression = await s.Refs.Wire.GetEntityObject<MJCommunicationSuppressionEntity>('MJ: Communication Suppressions', s.Refs.User);
    suppression.NewRecord();
    suppression.CommunicationEndpointID = endpointID;
    suppression.BaseMessageTypeID = s.Refs.ChannelID;
    suppression.Reason = 'Hard Bounce';
    suppression.Source = 'Admin';
    suppression.Status = 'Active';
    suppression.EffectiveAt = new Date(Date.now() - 60_000);
    suppression.Notes = `${COMMS_IT_TAG} run ${s.Refs.RunTag}`;
    Assert(await suppression.Save(), `saving the fixture suppression over GraphQL failed: ${suppression.LatestResult?.CompleteMessage ?? ''}`);
    s.Suppressions.push(suppression);
}

// ── checks ─────────────────────────────────────────────────────────────────────────────────────

export const CommsV2WireChecks: NamedCheck[] = [
    {
        Id: 'comms-v2-wire.CV2W1',
        Name: 'CV2W1: a one-click unsubscribe POST over HTTP is consumed by the comms.activity handler and suppresses the endpoint',
        Fn: async () => {
            const s = fx();
            const recipient = await createRecipient(s, 'unsub');
            const token = recipient.Log.UnsubscribeToken;
            Assert(token != null && token.length > 0, 'the fixture log has no UnsubscribeToken');

            const unknown = await postUnsubscribe(s, randomUUID());
            AssertEqual(unknown.Status, 404, `an unknown unsubscribe token must answer 404 (${JSON.stringify(unknown.Body)})`);
            const malformed = await postUnsubscribe(s, 'not-a-token');
            AssertEqual(malformed.Status, 400, `a malformed unsubscribe token must answer 400 (${JSON.stringify(malformed.Body)})`);

            const answer = await postUnsubscribe(s, token!);
            AssertEqual(answer.Status, 200, `POST /comms/unsubscribe/:token must answer 200 (${JSON.stringify(answer.Body)})`);
            AssertEqual(answer.Body.unsubscribed, true, 'the unsubscribe answer must say unsubscribed: true');

            const suppression = await waitForSuppression(s.Refs.User, recipient.Endpoint.ID, 'User Unsubscribe', 'the one-click unsubscribe POST');
            AssertEqual(suppression.Source, 'One-Click Header', 'the suppression must record the one-click header as its source');
            Assert(
                suppression.CommunicationLogID != null && UUIDsEqual(suppression.CommunicationLogID, recipient.Log.ID),
                'the suppression must point at the log whose token was posted',
            );
            const all = await readSuppressions(s.Refs.User, recipient.Endpoint.ID);
            AssertEqual(all.length, 1, 'the two refused requests must not have written suppressions of their own');
        },
    },
    {
        Id: 'comms-v2-wire.CV2W2',
        Name: 'CV2W2: a correctly signed SendGrid webhook POST is consumed by the comms.activity handler and hard-bounce-suppresses the endpoint',
        Fn: async () => {
            const s = fx();
            const key = loadWebhookSigningKey();
            if (!key) {
                SkipCheck(`${PRIVATE_KEY_ENV} is not set: signing needs the private key matching MJAPI's COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID`);
            }
            const recipient = await createRecipient(s, 'bounce');
            const body = hardBounceBody(s, recipient, 'bounce');
            const timestamp = nowTimestamp();

            const answer = await postWebhook(s, body, { Signature: signWebhook(key, timestamp, body), Timestamp: timestamp });
            AssertEqual(
                answer.Status,
                202,
                `a correctly signed webhook must answer 202 (${JSON.stringify(answer.Body)}); a 401 means MJAPI's COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID is not the public half of ${PRIVATE_KEY_ENV}`,
            );
            AssertEqual(answer.Body.accepted, true, 'the webhook answer must say accepted: true');

            const suppression = await waitForSuppression(s.Refs.User, recipient.Endpoint.ID, 'Hard Bounce', 'the signed webhook POST');
            AssertEqual(suppression.Source, 'Provider Webhook', 'the suppression must record the provider webhook as its source');
            Assert(
                suppression.CommunicationLogID != null && UUIDsEqual(suppression.CommunicationLogID, recipient.Log.ID),
                'the suppression must point at the log the event named',
            );
            AssertEqual(await readEndpointStatus(s.Refs.User, recipient.Endpoint.ID), 'Hard Bounced', 'the endpoint must be marked Hard Bounced');
        },
    },
    {
        Id: 'comms-v2-wire.CV2W3',
        Name: 'CV2W3: a SendGrid webhook POST with a bad signature is refused with 401 and suppresses nothing',
        Fn: async () => {
            const s = fx();
            const recipient = await createRecipient(s, 'forged');
            const body = hardBounceBody(s, recipient, 'forged');
            const timestamp = nowTimestamp();

            const stranger = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
            const wrongKey = await postWebhook(s, body, { Signature: signWebhook(stranger, timestamp, body), Timestamp: timestamp });
            AssertEqual(wrongKey.Status, 401, `a webhook signed with another key must answer 401 (${JSON.stringify(wrongKey.Body)})`);

            const unsigned = await postWebhook(s, body);
            AssertEqual(unsigned.Status, 401, `a webhook with no signature headers must answer 401 (${JSON.stringify(unsigned.Body)})`);

            // With the real key in hand, the sharper case: a valid signature over a different body.
            const key = loadWebhookSigningKey();
            if (key) {
                const signedBody = hardBounceBody(s, recipient, 'forged-original');
                const tampered = await postWebhook(s, body, { Signature: signWebhook(key, timestamp, signedBody), Timestamp: timestamp });
                AssertEqual(tampered.Status, 401, `a webhook whose body changed after signing must answer 401 (${JSON.stringify(tampered.Body)})`);
            }

            await Sleep(NEGATIVE_WAIT_MS);
            const suppressions = await readSuppressions(s.Refs.User, recipient.Endpoint.ID);
            AssertEqual(suppressions.length, 0, 'a refused webhook must not suppress the endpoint');
            AssertEqual(await readEndpointStatus(s.Refs.User, recipient.Endpoint.ID), 'Active', 'a refused webhook must leave the endpoint Active');
        },
    },
    {
        Id: 'comms-v2-wire.CV2W4',
        Name: 'CV2W4: V1 RunEntityCommunicationByViewID over GraphQL previews the message and writes no Communication Log',
        Fn: async () => {
            const s = fx();
            const target = await ensureEntityComms(s);
            const subject = `CV2W4 ${s.Refs.RunTag}`;

            const answer = await previewWhenMappingIsLive(s, target, subject);
            Assert(answer.Success, `the preview must succeed: ${answer.ErrorMessage ?? ''}`);
            const items = resultItems(answer);
            AssertEqual(items.length, 1, 'the preview must return exactly the one recipient the filter selects');
            Assert(items[0].Skipped !== true, `the recipient must not be skipped: ${items[0].SkipReason ?? ''}`);
            AssertEqual((items[0].RecipientData?.To ?? '').toLowerCase(), target.Address, 'the preview must address the employee record\'s Email');

            const logFilter = `RecipientAddress='${EscapeSQLString(target.Address)}' OR CommunicationEndpointID='${EscapeSQLString(target.Endpoint.ID)}'`;
            AssertEqual(await countLogs(s.Refs.User, logFilter), 0, 'a preview must write no Communication Log');
        },
    },
    {
        Id: 'comms-v2-wire.CV2W5',
        Name: 'CV2W5: a V2 Send over GraphQL to a recipient with an active suppression reports it skipped and writes no Communication Log',
        Fn: async () => {
            const s = fx();
            const target = await ensureEntityComms(s);
            await suppressEndpoint(s, target.Endpoint.ID);

            const answer = await runEntityCommunication(s, target, { PreviewOnly: false, UseV2: true, Subject: `CV2W5 ${s.Refs.RunTag}` });
            const items = resultItems(answer);
            AssertEqual(items.length, 1, `the send must report the one recipient (Success=${answer.Success}, ErrorMessage=${answer.ErrorMessage ?? ''})`);
            AssertEqual(items[0].Skipped, true, 'the suppressed recipient must be reported skipped');
            AssertEqual(items[0].SkipReason, 'Hard Bounce', 'the skip reason must be the suppression\'s reason');
            AssertEqual(answer.Success, false, 'a send with no deliverable recipient must not report success');

            const logFilter = `RecipientAddress='${EscapeSQLString(target.Address)}' OR CommunicationEndpointID='${EscapeSQLString(target.Endpoint.ID)}'`;
            AssertEqual(await countLogs(s.Refs.User, logFilter), 0, 'a blocked recipient must get no Communication Log, so nothing reached a provider');
            AssertEqual(await readEndpointStatus(s.Refs.User, target.Endpoint.ID), 'Active', 'a blocked send must not change the endpoint');
        },
    },
];

for (const check of CommsV2WireChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ── lifecycle ──────────────────────────────────────────────────────────────────────────────────

/** Deletes everything the run created or caused, children first. Never throws. */
async function teardownState(s: WireState): Promise<void> {
    const cleanup = new CommsCleanup(BUNDLE, s.Refs.User);
    const endpointIds = s.Endpoints.map((e) => e.ID);
    const logIds = s.Logs.map((l) => l.ID);
    await cleanup.DeleteEndpointDependents(endpointIds, logIds);
    await cleanup.DeleteWhere(
        'MJ: Communication Provider Events',
        `CommunicationProviderID='${EscapeSQLString(s.Refs.ProviderID)}' AND ProviderEventID LIKE 'mj-it-${EscapeSQLString(s.Refs.RunTag)}-%'`,
    );
    for (const log of s.Logs) {
        await cleanup.Delete(log, `fixture log ${log.ID}`);
    }
    for (const endpoint of s.Endpoints) {
        await cleanup.Delete(endpoint, `fixture endpoint ${endpoint.ID}`);
    }
    await cleanup.Delete(s.CreatedField, 'temporary communication field');
    await cleanup.Delete(s.CreatedMessageType, 'temporary message-type mapping');
    await cleanup.Delete(s.Employee, 'fixture employee');
    await cleanup.Delete(s.CreatedCompany, 'fixture company');
    cleanup.Report();
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        state = undefined;
        setupError = undefined;
        try {
            const wire = resolveWireProvider(ctx);
            Assert(wire != null, 'no GraphQL wire provider (this bundle runs on the client transport against a live MJAPI)');
            const user = wire!.CurrentUser ?? ctx.User;
            Assert(user != null, 'the wire provider resolved no current user');
            state = { Refs: await loadRefs(wire!, user), Endpoints: [], Logs: [], Suppressions: [] };
        } catch (error) {
            setupError = error instanceof Error ? error.message : String(error);
        }
    },
    Teardown: async () => {
        const s = state;
        state = undefined;
        setupError = undefined;
        if (!s) {
            return;
        }
        try {
            await teardownState(s);
        } catch {
            // teardown is best-effort: CommsCleanup already records and logs what it could not delete
        }
    },
});
