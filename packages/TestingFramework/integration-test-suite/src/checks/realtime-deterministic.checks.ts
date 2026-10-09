/**
 * realtime-deterministic.checks.ts — the 'realtime-deterministic' bundle (RD1–RD18).
 *
 * Domain 10 deterministic legs — NO live sessions, NO sidecar, NO model calls:
 *  - realtime metadata integrity: agent channels (RD1), Realtime model → vendor DriverClass
 *    wiring (RD2), the co-agent pairing junction (RD3) — each skips-as-pass LOUDLY when the
 *    deployment has not seeded that slice,
 *  - agent-session row lifecycle via a tagged fixture (RD4) — also PINS the fact that agent
 *    sessions have NO *EntityServer invariants (a direct Save bypasses SessionManager entirely),
 *  - the bridge *EntityServer invariants from the Realtime Bridges guide, exercised through real
 *    Save() attempts: provider SupportedFeatures/DriverClass gates (RD5) and session-bridge
 *    outbound-target / status-timestamp / close-reason coherence (RD6),
 *  - bridge driver-registry ClassFactory resolution WITHOUT starting anything (RD7 — LoopbackBridge),
 *  - the Predictive Studio deterministic legs NOT covered by predictive-studio.checks.ts (PS1–PS5):
 *    the ML Algorithms / Use Cases / Rankings guidance-matrix integrity (RD8) and the
 *    ProductionModelPromotionGate's deterministic refusal paths — non-UUID injection refusal,
 *    leakage refusal, sign-off-reason gate, and the lifecycle state machine (RD9),
 *  - live avatars (RD13): a tagged persona with a face on the session's vendor, bound to the voiced agent, becomes the
 *    session's avatar request through the real session prep, on a run-scoped placeholder key (nothing is minted, no
 *    network); without that face, the prep asks for no avatar and says why (`no-binding`); its fixture rows are
 *    deleted afterwards,
 *  - realtime driver wiring (RD14): every Active realtime vendor row's DriverClass resolves to a BaseRealtimeModel in the
 *    ClassFactory, so a driver missing from the class-registration manifest is caught,
 *  - a bridged (server-held) realtime session's usage landing on its co-agent prompt run before
 *    finalize prices it, through the real wiring with a usage-only stand-in session (RD15),
 *  - avatar video pricing (RD16): a tagged co-agent-shaped prompt run on Gemini 3.8 Live × Vertex AI stores a minute of
 *    avatar usage through the real usage write and is finalized; its cost is the token row's line plus the video line
 *    priced from the model vendor's configuration, and both lines are written into its details; the run is deleted.
 *  - meeting avatars (RD17): the active LiveKit bridge provider lets an agent's bot publish video (its avatar rides
 *    `video-out`), and the native room module the bots join with answers the avatar probe (ffmpeg found or not, both
 *    reported) without opening anything.
 *  - the Modalities gate for avatars (RD18): through the real session prep on a run-scoped placeholder key, Gemini 3.8
 *    Live × Vertex AI asks for the voiced agent's face (its Video/Output row and its endpoint allow it); a tagged model
 *    on the same driver and API name whose Video/Output row has IsSupported=false asks for none (`endpoint`); without
 *    that row, its endpoint alone decides and it asks again. Its fixture rows are deleted afterwards.
 *
 * Every fixture row is tagged '(mj-integration-test — safe to delete)' and deleted in the same
 * check's finally block, so the bundle needs no shared lifecycle.
 */
import { BaseEntity, Metadata, ProviderType, RunView, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { BaseRealtimeModel, type AIAPIKey, type IRealtimeSession, type RealtimeUsage } from '@memberjunction/ai';
import { AIEngineBase, ReadCostLines, ReadRealtimeUsageRecord, RoundCost, type RealtimeUsageRecord } from '@memberjunction/ai-engine-base';
import type { MJAIAgentEntityExtended, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import {
    REALTIME_AGENT_TYPE_NAME,
    RealtimeClientSessionService,
    ReadRealtimeVideoOutputRow,
    RealtimeModelShowsAvatar,
    type PrepareClientSessionInput,
    type RealtimeSessionParamsPrep,
} from '@memberjunction/ai-agents';
import {
    MJAIAgentChannelSchema,
    MJAIAgentChannelEntity,
    MJAIAgentCoAgentEntity,
    MJAIAgentPersonaEntity,
    MJAIAgentRunEntity,
    MJAIAgentSessionEntity,
    MJAIAgentSessionBridgeEntity,
    MJAIBridgeProviderEntity,
    MJAIModelCostEntity,
    MJAIModelModalityEntity,
    MJAIModelPersonaEntity,
    MJAIModelVendorEntity,
    MJAIPersonaEntity,
    MJAIPersonaVendorEntity,
    MJAIPromptRunEntity,
    MJInteractionEntity,
    MJInteractionEventEntity,
    MJMeetingEntity,
    MJMeetingParticipantEntity,
    MJMLAlgorithmUseCaseRankingEntity,
    MJMLModelEntity,
    MJMLTrainingPipelineEntity,
    MJUserEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '@memberjunction/ai-bridge-server';
import { HandoffOfferRegistry, LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, RoomAuthorizationService, OFFER_UNAVAILABLE } from '@memberjunction/livekit-room-server';
import { InteractionLifecycleService } from '@memberjunction/telephony-adapters';
import { ProductionModelPromotionGate, detectSingleFeatureDominance } from '@memberjunction/predictive-studio';
import type { PromoteModelRequest } from '@memberjunction/predictive-studio';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { DeepDeleteRunTrees } from './_it-live-agent-harness';

const TAG = '(mj-integration-test — safe to delete)';

/** Simple-typed first-row ID lookup (RunView never throws; empty ⇒ undefined). */
async function firstID(entity: string, user: UserInfo, extraFilter = ''): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: entity, Fields: ['ID'], ExtraFilter: extraFilter, ResultType: 'simple', MaxRows: 1 }, user,
    );
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/**
 * Whether server-side entity invariants (the *EntityServer subclasses) are active on this run's
 * Save path: always true over the wire (MJAPI enforces them resolver-side), and in-process only
 * when the bootstrap registered the server subclass on the ClassFactory.
 */
function serverInvariantsActive(providerType: string, entityName: string): boolean {
    if (providerType === ProviderType.Network) {
        return true;
    }
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
    const sub: unknown = reg?.SubClass;
    return typeof sub === 'function' && /Server/.test((sub as { name: string }).name);
}

/** Create (but do not save) a tagged, valid agent-session fixture entity. */
async function buildSessionFixture(user: UserInfo): Promise<MJAIAgentSessionEntity | undefined> {
    const agentID = await firstID('MJ: AI Agents', user);
    if (!agentID) {
        return undefined;
    }
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const session = await md.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', user);
    session.NewRecord();
    session.AgentID = agentID;
    session.UserID = user.ID;
    session.Status = 'Active';
    session.LastActiveAt = new Date();
    session.Config_ = JSON.stringify({ tag: TAG, purpose: 'realtime-deterministic fixture' });
    return session;
}

/** Create (but do not save) a tagged, VALID bridge-provider fixture (Disabled so it is inert). */
async function buildProviderFixture(user: UserInfo): Promise<MJAIBridgeProviderEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const provider = await md.GetEntityObject<MJAIBridgeProviderEntity>('MJ: AI Bridge Providers', user);
    provider.NewRecord();
    provider.Name = `mj-integration-test bridge provider ${Date.now()} ${TAG}`;
    provider.Description = TAG;
    provider.BridgeType = 'Meeting';
    provider.DriverClass = LOOPBACK_BRIDGE_DRIVER_CLASS;
    provider.Status = 'Disabled';
    provider.SupportedFeatures = JSON.stringify({ AudioIn: true, AudioOut: true });
    return provider;
}

// ── RD14: realtime drivers resolve ─────────────────────────────────────────────────────────────────────

/**
 * Realtime drivers whose package this process does not load, with why. `mj test` loads the LITE server class
 * manifest (`@memberjunction/server-bootstrap-lite`); MJAPI loads the full one. A driver listed here is checked by
 * nothing in this tier, so the list stays as short as the lite manifest allows.
 */
const RD14_NOT_IN_THIS_PROCESS: ReadonlyMap<string, string> = new Map([
    ['HuggingFaceRealtime', '@memberjunction/ai-huggingface is in the full server manifest (MJAPI), not the lite one'],
]);

// ── RD13: the avatar from the voiced agent's persona ───────────────────────────────────────────────

/** The run-scoped key RD13 hands the session prep: a placeholder, since nothing is minted. */
const RD13_PLACEHOLDER_KEY = 'mj-integration-test-placeholder-key';

/** What RD13 needs from the deployment's metadata (nothing it creates). */
interface AvatarFixtureAnchors {
    CoAgent: MJAIAgentEntityExtended;
    Target: MJAIAgentEntityExtended;
    Model: MJAIModelEntityExtended;
    VendorRow: MJAIModelVendorEntity;
    VideoModalityID: string;
    AudioModalityID: string;
}

/** The rows RD13 (and RD18) create, in creation order; deleted in reverse. */
interface AvatarFixture {
    /** The check that owns the fixture, for its messages. */
    Check: 'RD13' | 'RD18';
    Rows: BaseEntity[];
    /** The tagged persona, once saved. */
    PersonaID?: string;
    /** The persona's face binding on the session's vendor, once saved; the no-binding leg removes it. */
    Face?: MJAIPersonaVendorEntity;
    AvatarID: string;
    Voice: string;
    PersonaName: string;
}

/** Whether a DriverClass resolves to a realtime driver in this process. */
function resolvesRealtimeDriver(driverClass: string): boolean {
    const sub: unknown = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeModel, driverClass)?.SubClass;
    return typeof sub === 'function' && (sub as { prototype: unknown }).prototype instanceof BaseRealtimeModel;
}

/** The Active realtime models, by name, each with its Active vendor rows that carry a DriverClass, highest priority first. */
function realtimeVendorRows(engine: AIEngineBase): Array<{ Model: MJAIModelEntityExtended; Rows: MJAIModelVendorEntity[] }> {
    return engine.Models
        .filter((m) => m.IsActive && String(m.AIModelType ?? '').trim().toLowerCase() === 'realtime')
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((model) => ({
            Model: model,
            Rows: engine.ModelVendors
                .filter((mv) => UUIDsEqual(mv.ModelID, model.ID) && mv.Status === 'Active' && (mv.DriverClass ?? '').trim().length > 0)
                .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0)),
        }));
}

/** A realtime model and the vendor row the session will run on: the first with a driver this process can create. */
function pickRealtimeVendor(engine: AIEngineBase): { Model: MJAIModelEntityExtended; VendorRow: MJAIModelVendorEntity } | undefined {
    for (const { Model, Rows } of realtimeVendorRows(engine)) {
        const row = Rows.find((r) => resolvesRealtimeDriver(r.DriverClass!));
        if (row?.VendorID) {
            return { Model, VendorRow: row };
        }
    }
    return undefined;
}

/** The anchors RD13 needs, or why the deployment cannot supply them. */
function findAvatarFixtureAnchors(engine: AIEngineBase): AvatarFixtureAnchors | string {
    return avatarAnchorsOn(engine, pickRealtimeVendor(engine), 'no Active realtime model with a vendor driver registered in this process');
}

/**
 * The avatar anchors on one model and vendor row: the first Active Realtime-type agent (the co-agent), the first Active
 * other agent without personas (the voiced agent), and the Video and Audio modalities; or why the deployment has none.
 */
function avatarAnchorsOn(
    engine: AIEngineBase,
    picked: { Model: MJAIModelEntityExtended; VendorRow: MJAIModelVendorEntity } | undefined,
    noModel: string,
): AvatarFixtureAnchors | string {
    const realtimeType = engine.AgentTypes.find((t) => t.Name.trim().toLowerCase() === 'realtime');
    const byName = (a: MJAIAgentEntityExtended, b: MJAIAgentEntityExtended): number => (a.Name ?? '').localeCompare(b.Name ?? '');
    const active = engine.Agents.filter((a) => a.Status === 'Active').sort(byName);
    const coAgent = realtimeType ? active.find((a) => UUIDsEqual(a.TypeID, realtimeType.ID)) : undefined;
    const target = active.find((a) => !UUIDsEqual(a.TypeID, realtimeType?.ID ?? '') && !engine.AgentPersonas.some((ap) => UUIDsEqual(ap.AgentID, a.ID)));
    const video = engine.GetModalityByName('Video');
    const audio = engine.GetModalityByName('Audio');
    if (!coAgent || !target || !picked || !video || !audio) {
        return !coAgent ? 'no Active agent of the Realtime type (the co-agent)'
            : !target ? 'no Active non-realtime agent without personas to voice'
            : !picked ? noModel
            : "no 'Video' or 'Audio' row in MJ: AI Modalities";
    }
    return { CoAgent: coAgent, Target: target, Model: picked.Model, VendorRow: picked.VendorRow, VideoModalityID: video.ID, AudioModalityID: audio.ID };
}

/** Saves one fixture row, recording it for cleanup first so a half-built fixture is still removed. */
async function saveFixtureRow(fixture: AvatarFixture, row: BaseEntity, what: string): Promise<void> {
    Assert(await row.Save(), `${fixture.Check}: the fixture ${what} did not save: ${row.LatestResult?.CompleteMessage}`);
    fixture.Rows.push(row);
}

/** A persona binding on the session's vendor: its voice (Audio) or its face (Video). */
async function personaBinding(md: Metadata, ctx: { User: UserInfo }, personaID: string, anchors: AvatarFixtureAnchors, modalityID: string, apiName: string): Promise<MJAIPersonaVendorEntity> {
    const binding = await md.GetEntityObject<MJAIPersonaVendorEntity>('MJ: AI Persona Vendors', ctx.User);
    binding.NewRecord();
    binding.PersonaID = personaID;
    binding.VendorID = anchors.VendorRow.VendorID!;
    binding.ModalityID = modalityID;
    binding.APIName = apiName;
    binding.Status = 'Active';
    binding.Priority = 0;
    if (modalityID === anchors.VideoModalityID) {
        binding.VendorSettingsObject = { Avatar: { Kind: 'preset' } };
    }
    return binding;
}

/** Creates the tagged persona, its voice and face on the session's vendor, its model persona row, and the voiced agent's persona row. */
async function createAvatarFixture(ctx: { User: UserInfo }, anchors: AvatarFixtureAnchors, fixture: AvatarFixture): Promise<void> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const persona = await md.GetEntityObject<MJAIPersonaEntity>('MJ: AI Personas', ctx.User);
    persona.NewRecord();
    persona.Name = fixture.PersonaName;
    persona.Description = TAG;
    persona.Source = 'Custom';
    persona.IsActive = true;
    await saveFixtureRow(fixture, persona, 'persona');
    fixture.PersonaID = persona.ID;
    await saveFixtureRow(fixture, await personaBinding(md, ctx, persona.ID, anchors, anchors.AudioModalityID, fixture.Voice), 'voice binding');
    const face = await personaBinding(md, ctx, persona.ID, anchors, anchors.VideoModalityID, fixture.AvatarID);
    await saveFixtureRow(fixture, face, 'face binding');
    fixture.Face = face;
    await saveFixtureRow(fixture, await modelPersonaRow(md, ctx, anchors.Model.ID, persona.ID), 'model persona row');
    const agentPersona = await md.GetEntityObject<MJAIAgentPersonaEntity>('MJ: AI Agent Personas', ctx.User);
    agentPersona.NewRecord();
    agentPersona.AgentID = anchors.Target.ID;
    agentPersona.PersonaID = persona.ID;
    agentPersona.IsDefault = true;
    agentPersona.IsAllowed = true;
    agentPersona.Sequence = 1;
    await saveFixtureRow(fixture, agentPersona, 'agent persona row');
}

/** A model persona row: the persona is one of the model's personas (unsaved). */
async function modelPersonaRow(md: Metadata, ctx: { User: UserInfo }, modelID: string, personaID: string): Promise<MJAIModelPersonaEntity> {
    const modelPersona = await md.GetEntityObject<MJAIModelPersonaEntity>('MJ: AI Model Personas', ctx.User);
    modelPersona.NewRecord();
    modelPersona.ModelID = modelID;
    modelPersona.PersonaID = personaID;
    modelPersona.Sequence = 9999;
    modelPersona.IsSupported = true;
    return modelPersona;
}

/** Deletes the fixture rows, newest first (FK-safe); never throws. */
async function deleteAvatarFixture(fixture: AvatarFixture): Promise<void> {
    for (const row of [...fixture.Rows].reverse()) {
        await row.Delete().catch(() => undefined);
    }
}

/** The prep input: the voiced agent and its co-agent, the picked model, a run-scoped key for its driver only, and the video setting. */
function avatarPrepInput(anchors: AvatarFixtureAnchors, videoEnabled: boolean): PrepareClientSessionInput {
    const runKey: AIAPIKey = { driverClass: anchors.VendorRow.DriverClass!, apiKey: RD13_PLACEHOLDER_KEY };
    return {
        CoAgentID: anchors.CoAgent.ID,
        TargetAgentID: anchors.Target.ID,
        AgentSessionID: crypto.randomUUID(),
        PreferredModelID: anchors.Model.ID,
        APIKeys: [runKey],
        CredentialScope: 'RuntimeOnly',
        ConfigOverridesJson: JSON.stringify({ realtime: { video: { enabled: videoEnabled } } }),
    };
}

/** Asserts the prep chose the picked model and vendor row on the run's key, and asked for the fixture's avatar and voice. */
function assertAvatarResolved(prep: RealtimeSessionParamsPrep, anchors: AvatarFixtureAnchors, fixture: AvatarFixture): void {
    Assert(prep.Success, `RD13: the session prep failed: ${prep.ErrorMessage}`);
    Assert(UUIDsEqual(prep.Resolution?.ModelID ?? '', anchors.Model.ID), 'RD13: the prep must run the requested model');
    Assert(UUIDsEqual(prep.Resolution?.ModelVendorID ?? '', anchors.VendorRow.ID), 'RD13: the prep must run on the vendor row the run key covers');
    AssertEqual(prep.Resolution?.DriverClass, anchors.VendorRow.DriverClass, 'RD13: the driver is the run key\'s driver');
    const avatar = prep.SessionParams?.Avatar;
    Assert(!!avatar, 'RD13: the session must ask for an avatar: the voiced agent\'s persona has a face on this vendor');
    AssertEqual(avatar!.AvatarID, fixture.AvatarID, 'RD13: the avatar is the face binding\'s APIName');
    AssertEqual(avatar!.PersonaName, fixture.PersonaName, 'RD13: the avatar names its persona');
    AssertEqual(avatar!.Source, 'persona', 'RD13: the avatar came from the voiced agent\'s persona');
    AssertEqual(avatar!.Kind, 'preset', 'RD13: the binding\'s avatar settings reach the request');
    AssertEqual(prep.SessionParams?.Config?.['voice'], fixture.Voice, 'RD13: the face\'s persona supplies the session\'s voice');
}

// ── RD18: the Modalities gate for avatars ──────────────────────────────────────────────────────────

/** The driver and API name that render avatars: Gemini 3.8 Live on Gemini Enterprise (Vertex AI). */
const RD18_AVATAR_DRIVER = 'GeminiEnterpriseRealtime';
const RD18_AVATAR_API_NAME = 'gemini-3.8-live';

/** The tagged model RD18 adds beside Gemini 3.8 Live: the same driver and API name, and its own Video/Output row. */
interface GatedModelFixture {
    Model: MJAIModelEntityExtended;
    VendorRow: MJAIModelVendorEntity;
    VideoOutput: MJAIModelModalityEntity;
}

/** Gemini 3.8 Live × Vertex AI: an Active realtime model's Active vendor row on the avatar driver and API name, its driver registered here. */
function pickAvatarVendor(engine: AIEngineBase): { Model: MJAIModelEntityExtended; VendorRow: MJAIModelVendorEntity } | undefined {
    for (const { Model, Rows } of realtimeVendorRows(engine)) {
        const row = Rows.find((r) => r.DriverClass!.trim() === RD18_AVATAR_DRIVER && (r.APIName ?? '').trim().toLowerCase() === RD18_AVATAR_API_NAME);
        if (row?.VendorID && resolvesRealtimeDriver(row.DriverClass!)) {
            return { Model, VendorRow: row };
        }
    }
    return undefined;
}

/** The anchors RD18 needs, or why the deployment cannot supply them. */
function findModalitiesGateAnchors(engine: AIEngineBase): AvatarFixtureAnchors | string {
    return avatarAnchorsOn(engine, pickAvatarVendor(engine),
        `no Active realtime model with an Active '${RD18_AVATAR_DRIVER}' vendor row for '${RD18_AVATAR_API_NAME}' whose driver is registered in this process`);
}

/**
 * The tagged model's name: `rd18-`, a five-character run id, and the fixture tag; 49 characters, since `MJ: AI Models.Name`
 * is nvarchar(50) and the persona's longer stamp doesn't fit there. The tag is also in its Description.
 */
function gatedModelName(): string {
    const runID = Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0');
    return `rd18-${runID} ${TAG}`;
}

/** Saves the tagged model and its vendor row on the same vendor, driver and API name as the anchor's row. */
async function createGatedModel(md: Metadata, ctx: { User: UserInfo }, anchors: AvatarFixtureAnchors, fixture: AvatarFixture): Promise<{ Model: MJAIModelEntityExtended; VendorRow: MJAIModelVendorEntity }> {
    const model = await md.GetEntityObject<MJAIModelEntityExtended>('MJ: AI Models', ctx.User);
    model.NewRecord();
    model.Name = gatedModelName();
    model.Description = TAG;
    model.AIModelTypeID = anchors.Model.AIModelTypeID;
    model.IsActive = true;
    model.PowerRank = 0;
    await saveFixtureRow(fixture, model, 'model');
    const vendorRow = await md.GetEntityObject<MJAIModelVendorEntity>('MJ: AI Model Vendors', ctx.User);
    vendorRow.NewRecord();
    vendorRow.ModelID = model.ID;
    vendorRow.VendorID = anchors.VendorRow.VendorID;
    vendorRow.TypeID = anchors.VendorRow.TypeID;
    vendorRow.DriverClass = anchors.VendorRow.DriverClass;
    vendorRow.APIName = anchors.VendorRow.APIName;
    vendorRow.Priority = 0;
    vendorRow.Status = 'Active';
    await saveFixtureRow(fixture, vendorRow, 'model vendor row');
    return { Model: model, VendorRow: vendorRow };
}

/** Creates the tagged model, a Video/Output row on it with IsSupported=false, and the fixture persona as one of its personas. */
async function createVideoOffModel(ctx: { User: UserInfo }, anchors: AvatarFixtureAnchors, fixture: AvatarFixture): Promise<GatedModelFixture> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const { Model, VendorRow } = await createGatedModel(md, ctx, anchors, fixture);
    const videoOutput = await md.GetEntityObject<MJAIModelModalityEntity>('MJ: AI Model Modalities', ctx.User);
    videoOutput.NewRecord();
    videoOutput.ModelID = Model.ID;
    videoOutput.ModalityID = anchors.VideoModalityID;
    videoOutput.Direction = 'Output';
    videoOutput.IsSupported = false;
    videoOutput.Comments = TAG;
    await saveFixtureRow(fixture, videoOutput, 'Video/Output row');
    await saveFixtureRow(fixture, await modelPersonaRow(md, ctx, Model.ID, fixture.PersonaID!), 'model persona row on the tagged model');
    return { Model, VendorRow, VideoOutput: videoOutput };
}

/** The anchors with the tagged model and its vendor row in place of Gemini 3.8 Live's. */
function onGatedModel(anchors: AvatarFixtureAnchors, gated: GatedModelFixture): AvatarFixtureAnchors {
    return { ...anchors, Model: gated.Model, VendorRow: gated.VendorRow };
}

/** RD18's first leg: Gemini 3.8 Live × Vertex AI, whose Video/Output row and endpoint both allow an avatar, asks for the face. */
function assertGateOpen(prep: RealtimeSessionParamsPrep, anchors: AvatarFixtureAnchors, fixture: AvatarFixture): void {
    Assert(prep.Success, `RD18: the prep on ${anchors.Model.Name} failed: ${prep.ErrorMessage}`);
    const resolution = prep.Resolution!;
    Assert(UUIDsEqual(resolution.ModelVendorID ?? '', anchors.VendorRow.ID), 'RD18: the prep must run on the Vertex AI row the run key covers');
    AssertEqual(ReadRealtimeVideoOutputRow(anchors.Model.ID, AIEngineBase.Instance), 'supported', `RD18: ${anchors.Model.Name}'s Video/Output row allows video`);
    Assert(RealtimeModelShowsAvatar(resolution, AIEngineBase.Instance), `RD18: ${anchors.Model.Name}'s row and its endpoint allow an avatar`);
    AssertEqual(prep.SessionParams?.Avatar?.AvatarID, fixture.AvatarID, "RD18: the session asks for the voiced agent's face");
    AssertEqual(prep.AvatarResolution?.Reason, undefined, 'RD18: with the gate open and a face, there is no reason to give');
}

/** RD18's second leg: the tagged model, on the same endpoint, whose Video/Output row has IsSupported=false, asks for none. */
function assertGateClosedByRow(prep: RealtimeSessionParamsPrep, gated: GatedModelFixture): void {
    Assert(prep.Success, `RD18: the prep on the tagged model failed: ${prep.ErrorMessage}`);
    const resolution = prep.Resolution!;
    Assert(UUIDsEqual(resolution.ModelVendorID ?? '', gated.VendorRow.ID), "RD18: the prep must run the tagged model on its own vendor row");
    Assert(resolution.Model.SupportsAvatarOutput(resolution.APIName), `RD18: the endpoint alone renders avatars for '${resolution.APIName}' on ${resolution.DriverClass}`);
    AssertEqual(ReadRealtimeVideoOutputRow(gated.Model.ID, AIEngineBase.Instance), 'unsupported', "RD18: the tagged model's Video/Output row turns video off");
    Assert(!RealtimeModelShowsAvatar(resolution, AIEngineBase.Instance), 'RD18: the row turns the avatar off whatever the endpoint renders');
    AssertEqual(prep.SessionParams?.Avatar, undefined, 'RD18: the session asks for no avatar');
    AssertEqual(prep.AvatarResolution?.Reason, 'endpoint', 'RD18: the prep says why: this voice model shows no avatar (endpoint)');
}

/** RD18's third leg: with the tagged model's row deleted, its endpoint alone decides, and the session asks for the face again. */
async function assertNoRowLeavesItToTheEndpoint(ctx: IntegrationCheckContext, service: RealtimeClientSessionService, anchors: AvatarFixtureAnchors, fixture: AvatarFixture, gated: GatedModelFixture): Promise<void> {
    Assert(await gated.VideoOutput.Delete(), `RD18: the fixture Video/Output row did not delete: ${gated.VideoOutput.LatestResult?.CompleteMessage}`);
    fixture.Rows.splice(fixture.Rows.indexOf(gated.VideoOutput), 1);
    await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    const prep = await service.PrepareRealtimeSessionParams(avatarPrepInput(onGatedModel(anchors, gated), true), ctx.User, ctx.Provider);
    Assert(prep.Success, `RD18: the prep on the tagged model without its row failed: ${prep.ErrorMessage}`);
    AssertEqual(ReadRealtimeVideoOutputRow(gated.Model.ID, AIEngineBase.Instance), 'unstated', 'RD18: the tagged model has no Video/Output row now');
    AssertEqual(prep.SessionParams?.Avatar?.AvatarID, fixture.AvatarID, 'RD18: with no row, the endpoint decides, and the session asks for the face');
}

// ── RD16: avatar video priced at finalize ──────────────────────────────────────────────────────────

/** One speaking minute on Gemini 3.8 Live: Google counts the avatar's 60 s of video as 371,520 of the 373,520 output tokens. */
const RD16_USAGE: RealtimeUsageRecord = {
    Input: { TextTokens: 7900, AudioTokens: 2100 },
    Output: { AudioTokens: 2000, VideoTokens: 371520, VideoSeconds: 60 },
};
const RD16_INPUT_TOKENS = 10000;
const RD16_OUTPUT_TOKENS = 373520;

/** What RD16 prices with: the Vertex AI rows for Gemini 3.8 Live, and a prompt to hang the run on. */
interface AvatarPricingAnchors {
    ModelID: string;
    VendorID: string;
    PromptID: string;
    CostRow: MJAIModelCostEntity;
    /** The model vendor's avatar video price per minute, from its resolved configuration. */
    PricePerMinute: number;
}

/** The anchors RD16 needs, or why the deployment cannot supply them. */
async function findAvatarPricingAnchors(engine: AIEngineBase, user: UserInfo): Promise<AvatarPricingAnchors | string> {
    const model = engine.Models.find((m) => m.Name.trim().toLowerCase() === 'gemini 3.8 live');
    const vendor = engine.Vendors.find((v) => v.Name.trim().toLowerCase() === 'vertex ai');
    if (!model || !vendor) {
        return !model ? "no 'Gemini 3.8 Live' model" : "no 'Vertex AI' vendor";
    }
    const row = engine.ModelVendors.find((mv) => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendor.ID) && engine.IsInferenceProvider(mv));
    const price = row ? engine.GetEffectiveModelConfiguration(model.ID, row.ID)?.Realtime?.Pricing?.AvatarVideoOutput : undefined;
    const costRow = engine.GetActiveModelCost(model.ID, vendor.ID, 'Realtime', 'Tokens');
    const promptID = await firstID('MJ: AI Prompts', user);
    if (typeof price?.Price !== 'number' || !costRow || !promptID) {
        return typeof price?.Price !== 'number' ? 'the Vertex AI model-vendor row has no Realtime.Pricing.AvatarVideoOutput price'
            : !costRow ? 'no Active Realtime token cost row for Gemini 3.8 Live on Vertex AI'
            : 'no AI prompt to hang the prompt run on';
    }
    return { ModelID: model.ID, VendorID: vendor.ID, PromptID: promptID, CostRow: costRow, PricePerMinute: price.Price };
}

/** A tagged, Running prompt run shaped like a realtime co-agent's, started two minutes ago (the stored video is capped at the elapsed time + 30 s). */
async function createAvatarPricingRun(anchors: AvatarPricingAnchors, user: UserInfo): Promise<MJAIPromptRunEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const run = await md.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', user);
    run.NewRecord();
    run.PromptID = anchors.PromptID;
    run.ModelID = anchors.ModelID;
    run.VendorID = anchors.VendorID;
    run.RunAt = new Date(Date.now() - 120_000);
    run.RunType = 'Single';
    run.Status = 'Running';
    run.Messages = JSON.stringify([{ role: 'system', content: TAG }]);
    Assert(await run.Save(), `RD16: the fixture prompt run did not save: ${run.LatestResult?.CompleteMessage}`);
    return run;
}

/** The cost RD16 expects from the rows it priced with: the token row over 10,000 in and 2,000 out, plus 60 s of video. */
function expectedAvatarRunCost(anchors: AvatarPricingAnchors, engine: AIEngineBase): { Tokens: number; Video: number } {
    const divisor = engine.GetPriceCalculator(anchors.CostRow)?.UnitsPerBillingUnit ?? 1_000_000;
    const videoTokens = RD16_USAGE.Output?.VideoTokens ?? 0;
    const tokens = (RD16_INPUT_TOKENS * Number(anchors.CostRow.InputPricePerUnit) + (RD16_OUTPUT_TOKENS - videoTokens) * Number(anchors.CostRow.OutputPricePerUnit)) / divisor;
    return { Tokens: RoundCost(tokens), Video: RoundCost(((RD16_USAGE.Output?.VideoSeconds ?? 0) / 60) * anchors.PricePerMinute) };
}

/** Asserts the finalized run: its cost is the two lines, both written beside the stored usage, and the token total is Google's. */
function assertAvatarRunPriced(run: MJAIPromptRunEntity, anchors: AvatarPricingAnchors, expected: { Tokens: number; Video: number }): void {
    AssertEqual(run.Status, 'Completed', 'RD16: the finalized prompt run is Completed');
    Assert(Math.abs(Number(run.Cost) - (expected.Tokens + expected.Video)) < 1e-8, `RD16: Cost should be ${expected.Tokens} + ${expected.Video}, was ${run.Cost}`);
    Assert(Math.abs(Number(run.TotalCost) - Number(run.Cost)) < 1e-8, `RD16: TotalCost should include the video line, was ${run.TotalCost}`);
    AssertEqual(run.CostCurrency, anchors.CostRow.Currency, "RD16: the cost is in the token row's currency");
    AssertEqual(run.TokensCompletion, RD16_OUTPUT_TOKENS, "RD16: TokensCompletion keeps Google's total, video tokens included");
    const lines = ReadCostLines(run.ModelSpecificResponseDetails);
    AssertEqual(lines.length, 2, 'RD16: CostLines holds the token line and the video line');
    const [tokenLine, videoLine] = lines;
    Assert(tokenLine.Modality === null && UUIDsEqual(tokenLine.CostRowID ?? '', anchors.CostRow.ID), 'RD16: the first line is the token cost row');
    AssertEqual(JSON.stringify([tokenLine.Input, tokenLine.Output, tokenLine.Cost]), JSON.stringify([RD16_INPUT_TOKENS, 2000, expected.Tokens]), "RD16: the token line prices the output without the video's tokens");
    AssertEqual(JSON.stringify([videoLine.Modality, videoLine.Measure, videoLine.Output, videoLine.Cost]), JSON.stringify(['Video', 'Seconds', 60, expected.Video]), 'RD16: the video line prices 60 s at the per-minute price');
    AssertEqual(ReadRealtimeUsageRecord(run.ModelSpecificResponseDetails)?.Output?.VideoSeconds, 60, 'RD16: the usage record stays beside the lines');
}

/** Whether the co-agent has a face on the session's vendor: it would then answer for a voiced agent without one. */
function coAgentHasFace(engine: AIEngineBase, anchors: AvatarFixtureAnchors): boolean {
    const faces = engine.GetModelPersonas(anchors.Model.ID, 'Video', anchors.VendorRow.VendorID!);
    return engine.GetAgentPersonas(anchors.CoAgent.ID).some((ap) => faces.some((f) => UUIDsEqual(f.Persona.ID, ap.Persona.ID)));
}

/**
 * RD13's no-binding leg: the voiced agent's persona loses its face on the vendor (its voice stays), and the prep asks for
 * no avatar and says why. Skipped, loudly, when the co-agent has a face on the vendor, since that face would answer.
 */
async function assertNoBindingReason(ctx: IntegrationCheckContext, service: RealtimeClientSessionService, anchors: AvatarFixtureAnchors, fixture: AvatarFixture): Promise<void> {
    if (coAgentHasFace(AIEngineBase.Instance, anchors)) {
        console.warn(`  ⚠ realtime-deterministic.RD13 no-binding leg SKIPPED — the co-agent '${anchors.CoAgent.Name}' has a face on this vendor, which would answer for the voiced agent`);
        return;
    }
    const face = fixture.Face!;
    Assert(await face.Delete(), `RD13: the fixture face binding did not delete: ${face.LatestResult?.CompleteMessage}`);
    fixture.Rows.splice(fixture.Rows.indexOf(face), 1);
    await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    const prep = await service.PrepareRealtimeSessionParams(avatarPrepInput(anchors, true), ctx.User, ctx.Provider);
    Assert(prep.Success, `RD13: the prep without a face failed: ${prep.ErrorMessage}`);
    AssertEqual(prep.SessionParams?.Avatar, undefined, 'RD13: a voiced agent without a face on this vendor asks for no avatar');
    AssertEqual(prep.AvatarResolution?.Reason, 'no-binding', 'RD13: the prep says why: the persona has no face on this vendor');
}

// ── RD15: a bridged session's usage ─────────────────────────────────────────

/** RD15 opens no model session: the wiring reads only the resolution's ids. */
class UnopenedRealtimeModel extends BaseRealtimeModel {
    public async StartSession(): Promise<IRealtimeSession> {
        throw new Error('RD15 opens no realtime model session.');
    }
}

/** A model session that only reports usage: RD15's stand-in for a provider socket (no network, no media). */
class UsageReportingSession implements IRealtimeSession {
    private usageHandler?: (usage: RealtimeUsage) => void;
    public SendInput(): void { /* no media */ }
    public async RegisterTools(): Promise<void> { /* no tools */ }
    public OnOutput(): void { /* no audio out */ }
    public OnTranscript(): void { /* no transcript */ }
    public OnToolCall(): void { /* no tool calls */ }
    public async SendToolResult(): Promise<void> { /* no tool calls */ }
    public OnInterruption(): void { /* no barge-in */ }
    public OnError(): void { /* no errors */ }
    public OnUsage(handler: (usage: RealtimeUsage) => void): void {
        this.usageHandler = handler;
    }
    public async Close(): Promise<void> { /* no socket */ }
    /** Reports usage as a driver does after a turn. */
    public Report(usage: RealtimeUsage): void {
        this.usageHandler?.(usage);
    }
}

/** The session service without the run watchdog: RD15 finalizes its own run, and must not start process-wide timers. */
class UsageCheckSessionService extends RealtimeClientSessionService {
    public override KeepCoAgentRunAlive(): void { /* RD15 finalizes its own run */ }
}

/** What RD15 wires a bridged session against. */
interface BridgedUsageFixture {
    CoAgent: MJAIAgentEntityExtended;
    ModelID: string;
    VendorID: string;
    /** Whether the model and vendor have an active Tokens price, so finalize must give the run a cost. */
    Priced: boolean;
}

/** One turn's usage, as the Gemini driver reports it; output video seconds stand in for an avatar's. */
const RD15_TURN: RealtimeUsage = {
    InputTokens: 1200,
    OutputTokens: 300,
    InputTokenDetails: { AudioTokens: 1000, TextTokens: 200 },
    OutputTokenDetails: { AudioTokens: 300, VideoSeconds: 2.5 },
};
/** A duration-only update (a running total), as GPT-Live reports it. */
const RD15_DURATION: RealtimeUsage = { InputTokens: 0, OutputTokens: 0, DurationSeconds: 42 };
/** Usage reported after the session was closed: never stored. */
const RD15_LATE: RealtimeUsage = { InputTokens: 999, OutputTokens: 999 };

/** Whether an agent has the active system prompt that gives its voice session a co-agent prompt run (first by ExecutionOrder). */
function hasActiveSystemPrompt(agentID: string): boolean {
    const engine = AIEngine.Instance;
    const first = (engine.AgentPrompts ?? [])
        .filter(ap => UUIDsEqual(ap.AgentID, agentID) && ap.Status === 'Active')
        .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
    return !!first && (engine.Prompts ?? []).some(p => UUIDsEqual(p.ID, first.PromptID));
}

/** An active Realtime co-agent with a system prompt, and a Realtime model-vendor pair (a priced one when there is one). */
function findBridgedUsageFixture(): BridgedUsageFixture | undefined {
    const engine = AIEngine.Instance;
    const realtimeType = (engine.AgentTypes ?? []).find(t => t.Name?.trim().toLowerCase() === REALTIME_AGENT_TYPE_NAME.toLowerCase());
    const coAgent = realtimeType
        ? (engine.Agents ?? []).find(a => a.Status === 'Active' && UUIDsEqual(a.TypeID, realtimeType.ID) && hasActiveSystemPrompt(a.ID))
        : undefined;
    const realtimeModels = (engine.Models ?? []).filter(m => m.IsActive && m.AIModelType?.trim().toLowerCase() === 'realtime');
    const pairs = (engine.ModelVendors ?? []).filter(mv => realtimeModels.some(m => UUIDsEqual(m.ID, mv.ModelID)));
    const priced = pairs.find(mv => AIEngineBase.Instance.GetActiveModelCost(mv.ModelID, mv.VendorID, 'Realtime', 'Tokens') !== null);
    const pair = priced ?? pairs[0];
    if (!coAgent || !pair) {
        return undefined;
    }
    return { CoAgent: coAgent, ModelID: pair.ModelID, VendorID: pair.VendorID, Priced: !!priced };
}

/** The prep a host hands the wiring after `PrepareRealtimeSessionParams`: the co-agent and the resolved model's ids. */
function bridgedUsagePrep(fixture: BridgedUsageFixture): RealtimeSessionParamsPrep {
    return {
        Success: true,
        CoAgent: fixture.CoAgent,
        Resolution: { Model: new UnopenedRealtimeModel(''), ModelID: fixture.ModelID, VendorID: fixture.VendorID, APIName: 'rd15-unopened' },
    };
}

/** Loads one row fresh from the database (no cache). */
async function loadFresh<T extends BaseEntity>(entityName: string, id: string, user: UserInfo): Promise<T | undefined> {
    const r = await new RunView().RunView<T>(
        { EntityName: entityName, ExtraFilter: `ID='${id}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    return r.Success ? r.Results?.[0] : undefined;
}

/** The stored record's quantities, as RD15 reads them back. */
interface StoredRealtimeUsage {
    Input?: { AudioTokens?: number; TextTokens?: number };
    Output?: { AudioTokens?: number; VideoSeconds?: number };
    DurationSeconds?: number;
}

/** Asserts the prompt run holds the turn's tokens and record, finalized, and nothing from after close. */
function assertPromptRunUsage(promptRun: MJAIPromptRunEntity): void {
    AssertEqual(promptRun.TokensPrompt, 1200, 'TokensPrompt holds the reported input (the late update not added)');
    AssertEqual(promptRun.TokensCompletion, 300, 'TokensCompletion holds the reported output');
    AssertEqual(promptRun.TokensUsed, 1500, 'TokensUsed is their sum');
    AssertEqual(promptRun.Status, 'Completed', 'the prompt run was finalized');
    Assert(promptRun.CompletedAt != null, 'finalize stamped CompletedAt');
    const details: { RealtimeUsage?: StoredRealtimeUsage } = JSON.parse(promptRun.ModelSpecificResponseDetails ?? '{}');
    const record = details.RealtimeUsage;
    AssertEqual(record?.Input?.AudioTokens, 1000, 'RealtimeUsage.Input.AudioTokens');
    AssertEqual(record?.Input?.TextTokens, 200, 'RealtimeUsage.Input.TextTokens');
    AssertEqual(record?.Output?.AudioTokens, 300, 'RealtimeUsage.Output.AudioTokens');
    AssertEqual(record?.Output?.VideoSeconds, 2.5, 'RealtimeUsage.Output.VideoSeconds');
    AssertEqual(record?.DurationSeconds, 42, 'RealtimeUsage.DurationSeconds (a running total)');
}

/** Asserts the run was priced at finalize (when it can be) and that the co-agent run carries its totals. */
function assertPricedAndRolledUp(promptRun: MJAIPromptRunEntity, coAgentRun: MJAIAgentRunEntity, mustBePriced: boolean): void {
    if (mustBePriced) {
        Assert(promptRun.Cost != null, 'an active Tokens price exists and pricing runs on this Save path, yet finalize left Cost NULL');
    } else {
        console.warn('  ⚠ realtime-deterministic.RD15: cost not asserted — no Realtime model-vendor pair has an active Tokens price, '
            + 'or the prompt run server subclass (pricing) is not active on this Save path');
    }
    AssertEqual(coAgentRun.TotalPromptTokensUsed, 1200, 'co-agent run TotalPromptTokensUsed (roll-up)');
    AssertEqual(coAgentRun.TotalCompletionTokensUsed, 300, 'co-agent run TotalCompletionTokensUsed (roll-up)');
    const expectedCost = promptRun.TotalCost ?? promptRun.Cost ?? 0;
    Assert(Math.abs((coAgentRun.TotalCost ?? 0) - expectedCost) < 1e-9, `co-agent run TotalCost ${coAgentRun.TotalCost} != prompt run ${expectedCost}`);
}

/**
 * Wires a usage-only stand-in session through the real `WireBridgeRealtimeSession`, reports a turn and a duration,
 * closes it (which finalizes the runs), reports once more, and checks what landed. Adds the co-agent run it created
 * to `cleanup` as soon as it exists, so the caller deletes it even when an assertion fails.
 */
async function runBridgedUsageScenario(ctx: IntegrationCheckContext, fixture: BridgedUsageFixture, cleanup: string[]): Promise<void> {
    const session = new UsageReportingSession();
    const input: PrepareClientSessionInput = { TargetAgentID: fixture.CoAgent.ID, AgentSessionID: '', UserID: ctx.User.ID };
    const runtime = await new UsageCheckSessionService().WireBridgeRealtimeSession(session, input, bridgedUsagePrep(fixture), ctx.User, ctx.Provider);
    const coAgentRunID = runtime.CoAgentRunID;
    const promptRunID = runtime.PromptRunID;
    if (coAgentRunID) {
        cleanup.push(coAgentRunID);
    }
    if (!coAgentRunID || !promptRunID) {
        Assert(false, 'the wiring created no co-agent run and prompt run: the usage has nowhere to land');
        return;
    }
    session.Report(RD15_TURN);
    session.Report(RD15_DURATION);
    await session.Close();
    session.Report(RD15_LATE);
    // The agent run is read first: prompt-run-linkage.test.ts scans the text after each prompt-run query for the
    // agent-run id column, which AIPromptRun does not have.
    const coAgentRun = await loadFresh<MJAIAgentRunEntity>('MJ: AI Agent Runs', coAgentRunID, ctx.User);
    const promptRun = await loadFresh<MJAIPromptRunEntity>('MJ: AI Prompt Runs', promptRunID, ctx.User);
    Assert(!!promptRun && !!coAgentRun, 'the co-agent prompt run or agent run did not read back');
    if (promptRun && coAgentRun) {
        assertPromptRunUsage(promptRun);
        const pricingActive = serverInvariantsActive(ctx.Provider.ProviderType, 'MJ: AI Prompt Runs');
        assertPricedAndRolledUp(promptRun, coAgentRun, fixture.Priced && pricingActive);
    }
}

export const RealtimeDeterministicChecks: NamedCheck[] = [
    {
        Id: 'realtime-deterministic.RD1',
        Name: 'RD1: seeded agent-channel metadata is coherent (names, JSON ConfigSchema, typed TransportType)',
        Fn: async (ctx): Promise<void> => {
            const r = await new RunView().RunView<MJAIAgentChannelEntity>(
                { EntityName: 'MJ: AI Agent Channels', ResultType: 'entity_object' }, ctx.User,
            );
            Assert(r.Success, `channels load failed: ${r.ErrorMessage}`);
            if (r.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD1 SKIPPED — no MJ: AI Agent Channels seeded in this deployment '
                    + '(push metadata/ai-agent-channels to exercise this check)');
                return;
            }
            for (const channel of r.Results) {
                Assert(channel.Name.trim().length > 0, `channel ${channel.ID} has an empty Name`);
                // Schema-driven (never a hand-copied union): the generated zod union is the CHECK-constraint truth.
                Assert(MJAIAgentChannelSchema.shape.TransportType.safeParse(channel.TransportType).success,
                    `channel '${channel.Name}' has TransportType '${channel.TransportType}' outside the generated union`);
                if (channel.ConfigSchema) {
                    try {
                        JSON.parse(channel.ConfigSchema);
                    } catch {
                        Assert(false, `channel '${channel.Name}' ConfigSchema is not valid JSON`);
                    }
                }
            }
            const active = r.Results.filter(c => c.IsActive).length;
            console.log(`      → ${r.Results.length} channels coherent (${active} active)`);
        }
    },
    {
        Id: 'realtime-deterministic.RD2',
        Name: "RD2: every active Realtime-type AI model has a vendor row carrying a non-empty DriverClass",
        Fn: async (ctx): Promise<void> => {
            const realtimeTypeID = await firstID('MJ: AI Model Types', ctx.User, `Name='Realtime'`);
            if (!realtimeTypeID) {
                console.warn("  ⚠ realtime-deterministic.RD2 SKIPPED — no 'Realtime' row in MJ: AI Model Types (realtime stack not seeded)");
                return;
            }
            const models = await new RunView().RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: AI Models',
                    Fields: ['ID', 'Name'],
                    ExtraFilter: `AIModelTypeID='${realtimeTypeID}' AND IsActive=1`,
                    ResultType: 'simple'
                }, ctx.User,
            );
            Assert(models.Success, `realtime models load failed: ${models.ErrorMessage}`);
            if (models.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD2 SKIPPED — no active Realtime models seeded');
                return;
            }
            const idList = models.Results.map(m => `'${m.ID}'`).join(',');
            const vendors = await new RunView().RunView<MJAIModelVendorEntity>(
                { EntityName: 'MJ: AI Model Vendors', ExtraFilter: `ModelID IN (${idList})`, ResultType: 'entity_object' }, ctx.User,
            );
            Assert(vendors.Success, `model vendors load failed: ${vendors.ErrorMessage}`);
            for (const model of models.Results) {
                const withDriver = vendors.Results.filter(v => UUIDsEqual(v.ModelID, model.ID) && (v.DriverClass ?? '').trim().length > 0);
                Assert(withDriver.length > 0,
                    `Realtime model '${model.Name}' has no MJ: AI Model Vendors row with a DriverClass — it can never be instantiated`);
            }
            console.log(`      → ${models.Results.length} active Realtime models all wired to a DriverClass-bearing vendor`);
        }
    },
    {
        Id: 'realtime-deterministic.RD3',
        Name: 'RD3: co-agent pairing junction integrity (targets present, no duplicate pairs, ≤1 default per (CoAgent, Type))',
        Fn: async (ctx): Promise<void> => {
            const r = await new RunView().RunView<MJAIAgentCoAgentEntity>(
                { EntityName: 'MJ: AI Agent Co Agents', ResultType: 'entity_object' }, ctx.User,
            );
            Assert(r.Success, `co-agent junction load failed: ${r.ErrorMessage}`);
            if (r.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD3 SKIPPED — no MJ: AI Agent Co Agents rows seeded');
                return;
            }
            const pairKeys = new Set<string>();
            const defaultsPerCoAgentType = new Map<string, number>();
            for (const row of r.Results) {
                Assert(row.CoAgentID.trim().length > 0, `pairing ${row.ID} has an empty CoAgentID`);
                Assert(!!row.TargetAgentID || !!row.TargetAgentTypeID,
                    `pairing ${row.ID} names neither a TargetAgentID nor a TargetAgentTypeID — it can never resolve a target`);
                const pairKey = `${NormalizeUUID(row.CoAgentID)}|${NormalizeUUID(row.TargetAgentID ?? '')}|${NormalizeUUID(row.TargetAgentTypeID ?? '')}|${row.Type}`;
                Assert(!pairKeys.has(pairKey), `duplicate co-agent pairing: ${pairKey}`);
                pairKeys.add(pairKey);
                if (row.IsDefault && row.Status === 'Active') {
                    const defaultKey = `${NormalizeUUID(row.CoAgentID)}|${row.Type}|${row.TargetAgentID ? 'agent' : 'type'}`;
                    const count = (defaultsPerCoAgentType.get(defaultKey) ?? 0) + 1;
                    defaultsPerCoAgentType.set(defaultKey, count);
                    Assert(count === 1, `more than one Active IsDefault pairing for (CoAgent, Type) key '${defaultKey}'`);
                }
            }
            console.log(`      → ${r.Results.length} pairings coherent (${defaultsPerCoAgentType.size} default slots)`);
        }
    },
    {
        Id: 'realtime-deterministic.RD4',
        Name: 'RD4: an agent-session row round-trips its lifecycle fields (and PINS that the EntityServer guards only the server-decided Config keys)',
        Fn: async (ctx): Promise<void> => {
            const session = await buildSessionFixture(ctx.User);
            if (!session) {
                console.warn('  ⚠ realtime-deterministic.RD4 SKIPPED — no MJ: AI Agents row available to anchor a session fixture');
                return;
            }
            try {
                Assert(await session.Save(), `session fixture save failed: ${session.LatestResult?.CompleteMessage}`);
                const reload = await new RunView().RunView<MJAIAgentSessionEntity>(
                    { EntityName: 'MJ: AI Agent Sessions', ExtraFilter: `ID='${session.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                const persisted = reload.Results?.[0];
                Assert(!!persisted, 'session fixture did not read back');
                AssertEqual(persisted!.Status, 'Active', 'session Status (typed union) persisted');
                Assert(UUIDsEqual(persisted!.UserID, ctx.User.ID), 'session UserID persisted');

                // Close it through the entity layer (the terminal shape the janitor writes).
                persisted!.Status = 'Closed';
                persisted!.CloseReason = 'Explicit';
                persisted!.ClosedAt = new Date();
                Assert(await persisted!.Save(), `session close save failed: ${persisted!.LatestResult?.CompleteMessage}`);
                AssertEqual(persisted!.Status, 'Closed', 'session close round-trip');

                // The save above succeeding WITHOUT a live session is itself a finding worth pinning:
                console.warn('  ⚠ PRODUCT NOTE (realtime-deterministic.RD4): MJ: AI Agent Sessions has an *EntityServer subclass, but it guards ONLY '
                    + 'the server-decided Config keys (identityVerification, maxSessionDeadlineIso); the other session invariants (CanRun '
                    + 'authorization, conversation resolution, terminal-close idempotency) live only in SessionManager and are bypassable '
                    + 'by any direct entity Save.');
            } finally {
                if (session.IsSaved) {
                    await session.Delete().catch(() => undefined);
                }
            }
            console.log('      → session lifecycle fields round-trip; fixture removed');
        }
    },
    {
        Id: 'realtime-deterministic.RD5',
        Name: 'RD5: bridge-provider EntityServer invariants — unknown/non-boolean feature flags are refused, valid rows save',
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: AI Bridge Providers';
            if (!new Metadata().EntityByName(entityName)) { // global-provider-ok: integration test script — single-provider process by design
                console.warn(`  ⚠ realtime-deterministic.RD5 SKIPPED — entity '${entityName}' not in metadata (bridge stack not installed)`);
                return;
            }
            if (!serverInvariantsActive(ctx.Provider.ProviderType, entityName)) {
                console.warn('  ⚠ realtime-deterministic.RD5 SKIPPED — the bridge *EntityServer subclass is not registered in this '
                    + 'process and the run is not over the wire, so invariants cannot be observed');
                return;
            }

            // Negative 1: unknown feature flag must be refused (never persisted).
            const badKey = await buildProviderFixture(ctx.User);
            badKey.SupportedFeatures = JSON.stringify({ NotARealFlag: true });
            try {
                AssertEqual(await badKey.Save(), false, 'a SupportedFeatures payload with an unknown flag must be refused');
                Assert((badKey.LatestResult?.CompleteMessage ?? '').includes('unknown feature flag'),
                    `refusal must name the unknown flag, got: ${badKey.LatestResult?.CompleteMessage}`);

                // Negative 2: a known flag with a non-boolean value must be refused.
                const badValue = await buildProviderFixture(ctx.User);
                badValue.SupportedFeatures = JSON.stringify({ AudioIn: 'yes' });
                AssertEqual(await badValue.Save(), false, 'a non-boolean feature-flag value must be refused');

                // Positive: a well-formed (Disabled, inert) provider saves and reads back.
                const good = await buildProviderFixture(ctx.User);
                try {
                    Assert(await good.Save(), `valid bridge provider save failed: ${good.LatestResult?.CompleteMessage}`);
                    AssertEqual(good.Status, 'Disabled', 'fixture provider stays Disabled (inert)');
                } finally {
                    if (good.IsSaved) {
                        await good.Delete().catch(() => undefined);
                    }
                }
            } finally {
                if (badKey.IsSaved) {
                    await badKey.Delete().catch(() => undefined); // defensive — a refused save should never persist
                }
            }
            console.log('      → SupportedFeatures/DriverClass invariants enforced on the real Save path');
        }
    },
    {
        Id: 'realtime-deterministic.RD6',
        Name: 'RD6: session-bridge EntityServer invariants — outbound target, status↔timestamp, close-reason coherence',
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: AI Agent Session Bridges';
            if (!new Metadata().EntityByName(entityName)) { // global-provider-ok: integration test script — single-provider process by design
                console.warn(`  ⚠ realtime-deterministic.RD6 SKIPPED — entity '${entityName}' not in metadata (bridge stack not installed)`);
                return;
            }
            if (!serverInvariantsActive(ctx.Provider.ProviderType, entityName)) {
                console.warn('  ⚠ realtime-deterministic.RD6 SKIPPED — the session-bridge *EntityServer subclass is not registered '
                    + 'in this process and the run is not over the wire');
                return;
            }
            const session = await buildSessionFixture(ctx.User);
            if (!session) {
                console.warn('  ⚠ realtime-deterministic.RD6 SKIPPED — no MJ: AI Agents row available to anchor the session fixture');
                return;
            }
            const provider = await buildProviderFixture(ctx.User);
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            let goodBridge: MJAIAgentSessionBridgeEntity | undefined;
            try {
                Assert(await session.Save(), `session fixture save failed: ${session.LatestResult?.CompleteMessage}`);
                Assert(await provider.Save(), `provider fixture save failed: ${provider.LatestResult?.CompleteMessage}`);

                const buildBridge = async (): Promise<MJAIAgentSessionBridgeEntity> => {
                    const bridge = await md.GetEntityObject<MJAIAgentSessionBridgeEntity>(entityName, ctx.User);
                    bridge.NewRecord();
                    bridge.AgentSessionID = session.ID;
                    bridge.ProviderID = provider.ID;
                    bridge.Direction = 'Inbound';
                    bridge.JoinMethod = 'OnDemand';
                    bridge.TurnMode = 'Passive';
                    bridge.Status = 'Pending';
                    bridge.Config_ = JSON.stringify({ tag: TAG });
                    return bridge;
                };

                // Negative 1: an Outbound bridge with no Address/ExternalConnectionID has nowhere to go.
                const noTarget = await buildBridge();
                noTarget.Direction = 'Outbound';
                AssertEqual(await noTarget.Save(), false, 'an Outbound bridge without Address/ExternalConnectionID must be refused');
                Assert((noTarget.LatestResult?.CompleteMessage ?? '').includes('Outbound bridge'),
                    `refusal must explain the missing outbound target, got: ${noTarget.LatestResult?.CompleteMessage}`);

                // Negative 2: Status 'Connected' without ConnectedAt breaks duration metrics.
                const noTimestamp = await buildBridge();
                noTimestamp.Status = 'Connected';
                AssertEqual(await noTimestamp.Save(), false, "Status 'Connected' without ConnectedAt must be refused");

                // Negative 3: a CloseReason on a non-terminal bridge is incoherent.
                const earlyClose = await buildBridge();
                earlyClose.CloseReason = 'Explicit';
                AssertEqual(await earlyClose.Save(), false, 'a CloseReason on an active (Pending) bridge must be refused');

                // Positive: a coherent Inbound/Pending bridge saves.
                goodBridge = await buildBridge();
                Assert(await goodBridge.Save(), `valid session bridge save failed: ${goodBridge.LatestResult?.CompleteMessage}`);
            } finally {
                if (goodBridge?.IsSaved) {
                    await goodBridge.Delete().catch(() => undefined);
                }
                if (provider.IsSaved) {
                    await provider.Delete().catch(() => undefined);
                }
                if (session.IsSaved) {
                    await session.Delete().catch(() => undefined);
                }
            }
            console.log('      → outbound-target / status-timestamp / close-reason invariants enforced');
        }
    },
    {
        Id: 'realtime-deterministic.RD7',
        Name: 'RD7: the bridge driver registry resolves LoopbackBridge via ClassFactory (case-insensitive, no session started)',
        Fn: async (): Promise<void> => {
            const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeBridge, LOOPBACK_BRIDGE_DRIVER_CLASS);
            Assert(!!reg, `no @RegisterClass(BaseRealtimeBridge, '${LOOPBACK_BRIDGE_DRIVER_CLASS}') registration found`);
            const sub: unknown = reg!.SubClass;
            Assert(typeof sub === 'function' && (sub as { prototype: unknown }).prototype instanceof BaseRealtimeBridge,
                'the LoopbackBridge registration must subclass BaseRealtimeBridge');
            AssertEqual((sub as { name: string }).name, LoopbackBridge.name,
                'the registration must resolve the LoopbackBridge class itself');

            // Key matching is trim + case-insensitive — the same contract the engine relies on
            // when a metadata row stores a differently-cased DriverClass.
            const mangled = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeBridge, '  loopbackbridge  ');
            Assert(!!mangled && mangled.SubClass === reg!.SubClass,
                'driver-class key resolution must be trim + case-insensitive');
            console.log(`      → '${LOOPBACK_BRIDGE_DRIVER_CLASS}' resolves deterministically without starting a session`);
        }
    },
    {
        Id: 'realtime-deterministic.RD8',
        Name: 'RD8: the ML guidance matrix (Algorithms × Use Cases × Rankings) is referentially coherent',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const [algorithms, useCases, rankings] = await rv.RunViews([
                { EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name'], ResultType: 'simple' },
                { EntityName: 'MJ: ML Algorithm Use Cases', Fields: ['ID', 'Name'], ResultType: 'simple' },
                { EntityName: 'MJ: ML Algorithm Use Case Rankings', ResultType: 'entity_object' },
            ], ctx.User);
            Assert(algorithms.Success && useCases.Success && rankings.Success,
                `guidance matrix load failed: ${algorithms.ErrorMessage || useCases.ErrorMessage || rankings.ErrorMessage}`);
            Assert(algorithms.Results.length > 0,
                'No MJ: ML Algorithms are seeded — run `mj sync push --include=ml-algorithms` first');
            if (rankings.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD8 ranking legs SKIPPED — no MJ: ML Algorithm Use Case Rankings seeded');
                return;
            }
            const algorithmIDs = new Set((algorithms.Results as { ID: string }[]).map(a => NormalizeUUID(a.ID)));
            const useCaseIDs = new Set((useCases.Results as { ID: string }[]).map(u => NormalizeUUID(u.ID)));
            const pairs = new Set<string>();
            for (const ranking of rankings.Results as MJMLAlgorithmUseCaseRankingEntity[]) {
                Assert(algorithmIDs.has(NormalizeUUID(ranking.MLAlgorithmID)),
                    `ranking ${ranking.ID} references a missing algorithm '${ranking.MLAlgorithmID}'`);
                Assert(useCaseIDs.has(NormalizeUUID(ranking.MLAlgorithmUseCaseID)),
                    `ranking ${ranking.ID} references a missing use case '${ranking.MLAlgorithmUseCaseID}'`);
                Assert(ranking.SuitabilityScore >= 1 && ranking.SuitabilityScore <= 5,
                    `ranking ${ranking.ID} SuitabilityScore ${ranking.SuitabilityScore} outside the documented 1..5 band`);
                const pair = `${NormalizeUUID(ranking.MLAlgorithmID)}|${NormalizeUUID(ranking.MLAlgorithmUseCaseID)}`;
                Assert(!pairs.has(pair), `duplicate (algorithm, use case) ranking pair ${pair}`);
                pairs.add(pair);
            }
            console.log(`      → ${rankings.Results.length} rankings over ${algorithms.Results.length} algorithms × ${useCases.Results.length} use cases are coherent`);
        }
    },
    {
        Id: 'realtime-deterministic.RD9',
        Name: 'RD9: ProductionModelPromotionGate refuses deterministically — non-UUID id, leakage, missing reason, illegal jump',
        Fn: async (ctx): Promise<void> => {
            const gate = new ProductionModelPromotionGate();
            type Promotable = PromoteModelRequest['targetStatus']; // derived, never hand-copied (rule 2c)
            const promote = (modelId: string, targetStatus: Promotable, signOff: boolean, reason?: string) =>
                gate.promote({ modelId, targetStatus, signOff, reason, contextUser: ctx.User, provider: ctx.Provider });

            // Injection-refusal leg (no fixture needed): a non-UUID id must never reach a SQL filter.
            const injected = await promote(`x' OR 1=1 --`, 'Validated', false);
            AssertEqual(injected.kind, 'not-found', 'a non-UUID model id must be refused as not-found (never concatenated into SQL)');

            const algorithmID = await firstID('MJ: ML Algorithms', ctx.User);
            if (!algorithmID) {
                console.warn('  ⚠ realtime-deterministic.RD9 fixture legs SKIPPED — no MJ: ML Algorithms seeded '
                    + '(run `mj sync push --include=ml-algorithms`)');
                return;
            }
            const targetEntityID = await firstID('MJ: Entities', ctx.User);
            Assert(!!targetEntityID, 'could not resolve a seed entity for the ML pipeline target');

            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const importance = { leaky_feature: 0.95, honest_feature: 0.05 };
            // Anti-vacuity: the SAME pure check the gate re-runs must flag this importance shape.
            Assert(detectSingleFeatureDominance(importance, 0.6).Dominant,
                'precondition: the fixture FeatureImportance must be dominance-flagged at threshold 0.6');

            const pipeline = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', ctx.User);
            pipeline.NewRecord();
            pipeline.Name = `mj-integration-test rd9 pipeline ${TAG}`;
            pipeline.Status = 'Draft';
            pipeline.TargetEntityID = targetEntityID!;
            pipeline.TargetVariable = 'Renewed';
            pipeline.ProblemType = 'classification';
            pipeline.AlgorithmID = algorithmID;
            pipeline.LeakageGuard = JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 });
            const model = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
            try {
                Assert(await pipeline.Save(), `rd9 pipeline save failed: ${pipeline.LatestResult?.CompleteMessage}`);
                model.NewRecord();
                model.PipelineID = pipeline.ID;
                model.Version = 1;
                model.AlgorithmID = algorithmID;
                model.FeatureSchema = JSON.stringify([{ Name: 'leaky_feature', Kind: 'numeric' }]);
                model.FeatureImportance = JSON.stringify(importance);
                model.TargetVariable = 'Renewed';
                model.ProblemType = 'classification';
                model.Status = 'Draft';
                Assert(await model.Save(), `rd9 model save failed: ${model.LatestResult?.CompleteMessage}`);

                // Leakage gate: a flagged model must be refused without sign-off…
                const refused = await promote(model.ID, 'Validated', false);
                AssertEqual(refused.kind, 'refused-leakage', 'a dominance-flagged model must be refused without sign-off');
                // …and a sign-off WITHOUT a justification must be refused too.
                const noReason = await promote(model.ID, 'Validated', true);
                AssertEqual(noReason.kind, 'signoff-reason-required', 'a leakage sign-off without a reason must be refused');

                // Lifecycle state machine: Draft → Published is an illegal jump (with a signed-off
                // reason so the leakage gate is satisfied and the TRANSITION rule is what refuses).
                const jump = await promote(model.ID, 'Published', true, 'integration-test sign-off probe');
                AssertEqual(jump.kind, 'invalid-transition', 'Draft → Published must be refused by the transition state machine');

                // None of the refusals may have mutated the model.
                const reload = await new RunView().RunView<MJMLModelEntity>(
                    { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${model.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                AssertEqual(String(reload.Results?.[0]?.Status), 'Draft', 'every refusal path must leave the model Status untouched');
            } finally {
                if (model.IsSaved) {
                    await model.Delete().catch(() => undefined);
                }
                if (pipeline.IsSaved) {
                    await pipeline.Delete().catch(() => undefined);
                }
            }
            console.log('      → all four deterministic refusal paths hold; model left immutable');
        }
    },
    {
        Id: 'realtime-deterministic.RD10',
        Name: 'RD10: interaction records, events, links, computed duration, and append-only event guard',
        Fn: async (ctx): Promise<void> => {
            const md = ctx.Provider ?? new Metadata();
            if (!md.EntityByName('MJ: Interactions') || !md.EntityByName('MJ: Interaction Events')) {
                console.warn('  ⚠ realtime-deterministic.RD10 SKIPPED — MJ: Interactions not in metadata');
                return;
            }

            const lifecycle = InteractionLifecycleService.Instance;
            const startTime = new Date(Date.now() - 65_000); // 65 seconds ago
            const interaction = await lifecycle.CreateInteraction({
                Channel: 'Phone',
                Direction: 'Inbound',
                Status: 'Active',
                StartedAt: startTime,
                ContextUser: ctx.User,
                MetadataProvider: ctx.Provider,
            });

            if (!interaction || !interaction.ID) {
                Assert(false, 'Failed to create fixture interaction');
                return;
            }

            try {
                // Link the caller (ctx.User)
                const userEntity = md.EntityByName('MJ: Users');
                Assert(!!userEntity, 'MJ: Users entity not found');
                const link = await lifecycle.CreateLink({
                    InteractionID: interaction.ID,
                    EntityID: userEntity!.ID,
                    RecordID: ctx.User.ID,
                    Role: 'Caller',
                    ContextUser: ctx.User,
                    MetadataProvider: ctx.Provider,
                });
                Assert(!!link && !!link.ID, 'Failed to create interaction link');

                // Append an Offered event
                const offeredEvent = await lifecycle.RecordEvent({
                    InteractionID: interaction.ID,
                    EventType: 'Offered',
                    ContextUser: ctx.User,
                    MetadataProvider: ctx.Provider,
                    Details: { note: 'Offered to agent for test' },
                });
                Assert(!!offeredEvent && !!offeredEvent.ID, 'Failed to record Offered event');

                // Close interaction (65 seconds duration)
                const endedTime = new Date();
                const closed = await lifecycle.CloseInteraction({
                    InteractionID: interaction.ID,
                    EndedAt: endedTime,
                    Abandoned: false,
                    CostPerMinute: 0.02,
                    ContextUser: ctx.User,
                    MetadataProvider: ctx.Provider,
                });
                Assert(closed, 'Failed to close interaction');

                // Reload interaction and verify fields
                const reloaded = await md.GetEntityObject<MJInteractionEntity>('MJ: Interactions', ctx.User);
                Assert(await reloaded.Load(interaction.ID), 'Failed to reload interaction');
                AssertEqual(reloaded.Status, 'Ended', 'Interaction status should be Ended');
                Assert(!!reloaded.EndedAt, 'Interaction EndedAt should be populated');
                Assert((reloaded.CostEstimate ?? 0) > 0, `CostEstimate should be > 0, got ${reloaded.CostEstimate}`);

                // Query events and verify count
                const rv = new RunView();
                const eventsResult = await rv.RunView<MJInteractionEventEntity>({
                    EntityName: 'MJ: Interaction Events',
                    ExtraFilter: `InteractionID = '${interaction.ID}'`,
                    ResultType: 'entity_object',
                    OrderBy: 'OccurredAt ASC',
                }, ctx.User);
                Assert(eventsResult.Success, `Failed to query events: ${eventsResult.ErrorMessage}`);
                // Expected events: Created, Answered, Offered, Ended
                const types = eventsResult.Results.map(e => e.EventType);
                Assert(types.includes('Created'), 'Events should include Created');
                Assert(types.includes('Answered'), 'Events should include Answered');
                Assert(types.includes('Offered'), 'Events should include Offered');
                Assert(types.includes('Ended'), 'Events should include Ended');

                // Verify append-only invariant on events when server invariants are active
                if (serverInvariantsActive(ctx.Provider.ProviderType, 'MJ: Interaction Events')) {
                    const eventToMutate = eventsResult.Results[0];
                    let updateThrew = false;
                    try {
                        eventToMutate.Details = 'Illegal mutated details';
                        const saved = await eventToMutate.Save();
                        if (!saved) updateThrew = true;
                    } catch {
                        updateThrew = true;
                    }
                    Assert(updateThrew, 'Interaction event update must be refused by append-only guard');

                    let deleteThrew = false;
                    try {
                        const deleted = await eventToMutate.Delete();
                        if (!deleted) deleteThrew = true;
                    } catch {
                        deleteThrew = true;
                    }
                    Assert(deleteThrew, 'Interaction event delete must be refused by append-only guard');
                }
            } finally {
                if (ctx.Pool) {
                    const s = ctx.Schema ?? '__mj';
                    await ctx.Pool.request().query(`
                        DELETE FROM [${s}].[InteractionEvent] WHERE InteractionID = '${interaction.ID}';
                        DELETE FROM [${s}].[InteractionLink] WHERE InteractionID = '${interaction.ID}';
                        DELETE FROM [${s}].[Interaction] WHERE ID = '${interaction.ID}';
                    `).catch(() => undefined);
                } else if (interaction.IsSaved) {
                    await interaction.Delete().catch(() => undefined);
                }
            }
            console.log('      → interaction lifecycle, computed duration/cost, and append-only event guard hold');
        }
    },
    {
        Id: 'realtime-deterministic.RD11',
        Name: 'RD11: durable hand-off offers transition state with compare-and-set concurrency guard',
        Fn: async (ctx): Promise<void> => {
            const md = ctx.Provider ?? new Metadata();
            if (!md.EntityByName('MJ: Interaction Offers')) {
                console.warn('  ⚠ realtime-deterministic.RD11 SKIPPED — MJ: Interaction Offers not in metadata');
                return;
            }

            const registry = HandoffOfferRegistry.Instance;
            const roomName = `it-rd11-room-${Date.now()}`;
            const offer = await registry.Create({
                RoomName: roomName,
                TargetUserID: ctx.User.ID,
                Mode: 'warm',
                Summary: 'Integration test offer for RD11',
                CallerLabel: 'Integration Test Caller',
                AgentName: 'TestAgent',
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });

            if (!offer || !offer.OfferID) {
                Assert(false, 'Failed to create durable hand-off offer');
                return;
            }
            AssertEqual(offer.Status, 'Pending', 'Initial offer status must be Pending');

            let raceInteractionID: string | undefined;
            let raceOffer1ID: string | undefined;
            let raceOffer2ID: string | undefined;

            try {
                // 1. Refuse resolution by wrong target user
                const wrongUserRes = await registry.ResolveForUser(
                    offer.OfferID,
                    '00000000-0000-0000-0000-000000000000',
                    'Accepted',
                    ctx.User,
                    ctx.Provider,
                );
                AssertEqual(wrongUserRes.Ok, false, 'Resolving offer for unauthorized user must fail');

                // 2. Accept offer on behalf of target user
                const acceptRes = await registry.ResolveForUser(
                    offer.OfferID,
                    ctx.User.ID,
                    'Accepted',
                    ctx.User,
                    ctx.Provider,
                );
                Assert(acceptRes.Ok, `Accepting offer failed: ${acceptRes.Ok ? '' : acceptRes.Reason}`);
                if (acceptRes.Ok) {
                    AssertEqual(acceptRes.Offer.Status, 'Accepted', 'Offer status must transition to Accepted');
                }

                // 3. Compare-and-set guard: attempting a second resolution must fail
                const raceRes = await registry.ResolveForUser(
                    offer.OfferID,
                    ctx.User.ID,
                    'Declined',
                    ctx.User,
                    ctx.Provider,
                );
                AssertEqual(raceRes.Ok, false, 'CAS guard: resolving an already resolved offer must fail');

                // 4. Real DB CAS race test: two concurrent accepts against the real database for offers sharing an InteractionID.
                // Exactly one should win, enforced by UX_InteractionOffer_OneAccepted, and the loser should get OFFER_UNAVAILABLE.
                const interaction = await md.GetEntityObject<MJInteractionEntity>('MJ: Interactions', ctx.User);
                interaction.Channel = 'Web';
                interaction.Direction = 'Inbound';
                interaction.RoomName = `it-rd11-race-${Date.now()}`;
                interaction.Status = 'Active';
                interaction.StartedAt = new Date();
                Assert(await interaction.Save(), 'Failed to create interaction for race check');
                raceInteractionID = interaction.ID;

                const raceOffer1 = await registry.Create({
                    InteractionID: interaction.ID,
                    RoomName: interaction.RoomName,
                    TargetUserID: ctx.User.ID,
                    Mode: 'warm',
                    Summary: 'Concurrent offer 1 for RD11',
                    CallerLabel: 'Race Caller 1',
                    AgentName: 'TestAgent',
                    ContextUser: ctx.User,
                    Provider: ctx.Provider,
                });
                const raceOffer2 = await registry.Create({
                    InteractionID: interaction.ID,
                    RoomName: interaction.RoomName,
                    TargetUserID: ctx.User.ID,
                    Mode: 'warm',
                    Summary: 'Concurrent offer 2 for RD11',
                    CallerLabel: 'Race Caller 2',
                    AgentName: 'TestAgent',
                    ContextUser: ctx.User,
                    Provider: ctx.Provider,
                });
                Assert(!!raceOffer1 && !!raceOffer1.OfferID, 'Failed to create raceOffer1');
                Assert(!!raceOffer2 && !!raceOffer2.OfferID, 'Failed to create raceOffer2');
                if (!raceOffer1 || !raceOffer2) {
                    return;
                }
                raceOffer1ID = raceOffer1.OfferID;
                raceOffer2ID = raceOffer2.OfferID;

                const [res1, res2] = await Promise.all([
                    registry.ResolveForUser(raceOffer1.OfferID, ctx.User.ID, 'Accepted', ctx.User, ctx.Provider),
                    registry.ResolveForUser(raceOffer2.OfferID, ctx.User.ID, 'Accepted', ctx.User, ctx.Provider),
                ]);

                const successCount = (res1.Ok ? 1 : 0) + (res2.Ok ? 1 : 0);
                AssertEqual(successCount, 1, 'Exactly one concurrent accept must succeed under UX_InteractionOffer_OneAccepted');
                const loser = res1.Ok ? res2 : res1;
                AssertEqual(loser.Ok, false, 'Losing accept must have Ok === false');
                if (!loser.Ok) {
                    AssertEqual(loser.Reason, OFFER_UNAVAILABLE, `Losing accept must receive OFFER_UNAVAILABLE, got ${loser.Reason}`);
                }
            } finally {
                if (ctx.Pool) {
                    const s = ctx.Schema ?? '__mj';
                    const offerIDs = [offer.OfferID, raceOffer1ID, raceOffer2ID].filter(Boolean).map(id => `'${id}'`).join(',');
                    if (offerIDs.length > 0) {
                        await ctx.Pool.request().query(`
                            DELETE FROM [${s}].[InteractionOffer] WHERE ID IN (${offerIDs});
                        `).catch(() => undefined);
                    }
                    if (raceInteractionID) {
                        await ctx.Pool.request().query(`
                            DELETE FROM [${s}].[Interaction] WHERE ID = '${raceInteractionID}';
                        `).catch(() => undefined);
                    }
                    await ctx.Pool.request().query(`
                        DELETE FROM [${s}].[Interaction] WHERE RoomName = '${roomName}';
                    `).catch(() => undefined);
                }
            }
            console.log('      → durable offer creation, user authorization, and CAS guard hold (including real DB race)');
        }
    },
    {
        Id: 'realtime-deterministic.RD12',
        Name: 'RD12: LiveKit room authorization enforces participant, host, cancelled meeting, and ad-hoc rules',
        Fn: async (ctx): Promise<void> => {
            const md = ctx.Provider ?? new Metadata();
            if (!md.EntityByName('MJ: Meetings') || !md.EntityByName('MJ: Meeting Participants')) {
                console.warn('  ⚠ realtime-deterministic.RD12 SKIPPED — MJ: Meetings not in metadata');
                return;
            }

            const authService = RoomAuthorizationService.Instance;

            // 1. Ad-hoc unlinked room is accessible to authenticated users
            const adHocRoom = `it-rd12-adhoc-${Date.now()}`;
            const adHocAuth = await authService.AuthorizeRoomAccess(adHocRoom, ctx.User, ctx.Provider);
            AssertEqual(adHocAuth.Authorized, true, 'Ad-hoc room must be accessible to authenticated user');

            // 2. Unauthenticated access is refused
            const unauth = await authService.AuthorizeRoomAccess(adHocRoom, null as unknown as UserInfo, ctx.Provider);
            AssertEqual(unauth.Authorized, false, 'Unauthenticated access must be refused');

            // 3. Resolve a secondary user from DB for participant testing
            const secondaryUserID = await firstID('MJ: Users', ctx.User, `ID <> '${ctx.User.ID}'`);
            if (!secondaryUserID) {
                console.warn('  ⚠ realtime-deterministic.RD12 participant legs SKIPPED — only 1 user in DB');
                return;
            }
            const uiRole = ctx.Provider.Roles.find((r) => r.Name === 'UI');
            const roleID = uiRole?.ID ?? 'e0afccec-6a37-ef11-86d4-000d3a4e707e';
            const secondaryUserEntity = await md.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
            Assert(await secondaryUserEntity.Load(secondaryUserID), 'Failed to load secondary user');
            const secondaryUser = new UserInfo(ctx.Provider, {
                ID: secondaryUserEntity.ID,
                Name: secondaryUserEntity.Name,
                Email: secondaryUserEntity.Email,
                IsActive: true,
                UserRoles: [
                    new UserRoleInfo({
                        UserID: secondaryUserEntity.ID,
                        RoleID: roleID,
                        Role: 'UI',
                        User: secondaryUserEntity.Name,
                    }),
                ],
            });
            Assert(!UUIDsEqual(secondaryUser.ID, ctx.User.ID), 'Secondary user must be distinct from context user');

            // Create a meeting fixture
            const meetingRoom = `it-rd12-meet-${Date.now()}`;
            const meeting = await md.GetEntityObject<MJMeetingEntity>('MJ: Meetings', ctx.User);
            meeting.NewRecord();
            meeting.Title = `RD12 Meeting Fixture ${TAG}`;
            meeting.RoomName = meetingRoom;
            meeting.HostUserID = ctx.User.ID;
            meeting.Status = 'Scheduled';
            Assert(await meeting.Save(), `Meeting save failed: ${meeting.LatestResult?.CompleteMessage}`);

            let participant: MJMeetingParticipantEntity | undefined;
            try {
                // Host is authorized
                const hostAuth = await authService.AuthorizeRoomAccess(meetingRoom, ctx.User, ctx.Provider);
                AssertEqual(hostAuth.Authorized, true, 'Meeting host must be authorized');

                // Stranger (not participant) is refused
                const strangerAuth = await authService.AuthorizeRoomAccess(meetingRoom, secondaryUser, ctx.Provider);
                AssertEqual(strangerAuth.Authorized, false, 'Non-participant stranger must be refused');

                // Add secondary user as Invited participant
                participant = await md.GetEntityObject<MJMeetingParticipantEntity>('MJ: Meeting Participants', ctx.User);
                participant.NewRecord();
                participant.MeetingID = meeting.ID;
                participant.UserID = secondaryUser.ID;
                participant.Role = 'Attendee';
                participant.InviteStatus = 'Invited';
                Assert(await participant.Save(), `Participant save failed: ${participant.LatestResult?.CompleteMessage}`);

                // Invited participant is authorized
                const invitedAuth = await authService.AuthorizeRoomAccess(meetingRoom, secondaryUser, ctx.Provider);
                AssertEqual(invitedAuth.Authorized, true, 'Invited participant must be authorized');

                // Declined participant is refused
                participant.InviteStatus = 'Declined';
                Assert(await participant.Save(), `Participant update failed: ${participant.LatestResult?.CompleteMessage}`);
                const declinedAuth = await authService.AuthorizeRoomAccess(meetingRoom, secondaryUser, ctx.Provider);
                AssertEqual(declinedAuth.Authorized, false, 'Declined participant must be refused');

                // Cancelled meeting refuses even the host
                meeting.Status = 'Cancelled';
                Assert(await meeting.Save(), `Meeting cancellation failed: ${meeting.LatestResult?.CompleteMessage}`);
                const cancelledAuth = await authService.AuthorizeRoomAccess(meetingRoom, ctx.User, ctx.Provider);
                AssertEqual(cancelledAuth.Authorized, false, 'Cancelled meeting must refuse host access');
            } finally {
                if (ctx.Pool) {
                    const s = ctx.Schema ?? '__mj';
                    if (participant?.IsSaved) {
                        await ctx.Pool.request().query(`DELETE FROM [${s}].[MeetingParticipant] WHERE ID = '${participant.ID}'`).catch(() => undefined);
                    }
                    if (meeting.IsSaved) {
                        await ctx.Pool.request().query(`DELETE FROM [${s}].[Meeting] WHERE ID = '${meeting.ID}'`).catch(() => undefined);
                    }
                } else {
                    if (participant?.IsSaved) await participant.Delete().catch(() => undefined);
                    if (meeting.IsSaved) await meeting.Delete().catch(() => undefined);
                }
            }
            console.log('      → room authorization rules (host, invited, declined, cancelled, ad-hoc) hold');
        }
    },
    {
        Id: 'realtime-deterministic.RD13',
        Name: "RD13: a voiced agent's persona with a face on the session's vendor becomes the session's avatar request; without the face, no-binding (run-scoped key, no network)",
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
            const anchors = findAvatarFixtureAnchors(AIEngineBase.Instance);
            if (typeof anchors === 'string') {
                console.warn(`  ⚠ realtime-deterministic.RD13 SKIPPED — ${anchors}`);
                return;
            }
            const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            const fixture: AvatarFixture = { Check: 'RD13', Rows: [], AvatarID: `mj-it-avatar-${stamp}`, Voice: `mj-it-voice-${stamp}`, PersonaName: `mj-it-rd13-persona-${stamp} ${TAG}` };
            try {
                await createAvatarFixture(ctx, anchors, fixture);
                await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider); // the engine reads the fixture rows now, not after its debounce
                const service = new RealtimeClientSessionService();
                assertAvatarResolved(await service.PrepareRealtimeSessionParams(avatarPrepInput(anchors, true), ctx.User, ctx.Provider), anchors, fixture);
                const off = await service.PrepareRealtimeSessionParams(avatarPrepInput(anchors, false), ctx.User, ctx.Provider);
                Assert(off.Success, `RD13: the prep with the video setting off failed: ${off.ErrorMessage}`);
                AssertEqual(off.SessionParams?.Avatar, undefined, 'RD13: with the video setting off, the session asks for no avatar');
                AssertEqual(off.AvatarResolution?.Reason, undefined, 'RD13: with the video setting off, there is no reason to give');
                await assertNoBindingReason(ctx, service, anchors, fixture);
            } finally {
                await deleteAvatarFixture(fixture);
                await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider).catch(() => undefined);
            }
            console.log(`      → '${anchors.Target.Name}' asks for its persona's face on ${anchors.VendorRow.DriverClass} (${anchors.Model.Name}); fixture removed`);
        }
    },
    {
        Id: 'realtime-deterministic.RD14',
        Name: 'RD14: every Active realtime vendor DriverClass resolves to a BaseRealtimeModel in the ClassFactory (no missing registration)',
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
            const rows = realtimeVendorRows(AIEngineBase.Instance).flatMap(({ Model, Rows }) => Rows.map((row) => ({ Model, Row: row })));
            if (rows.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD14 SKIPPED — no Active realtime model has an Active vendor row with a DriverClass');
                return;
            }
            const checked = rows.filter(({ Row }) => !RD14_NOT_IN_THIS_PROCESS.has(Row.DriverClass!.trim()));
            const unresolved = checked.filter(({ Row }) => !resolvesRealtimeDriver(Row.DriverClass!)).map(({ Model, Row }) => `${Model.Name} → ${Row.DriverClass}`);
            AssertEqual(unresolved.length, 0, `RD14: ${unresolved.length} realtime vendor DriverClass(es) resolve to no BaseRealtimeModel registration: ${unresolved.join('; ')}`);
            const skipped = rows.length - checked.length;
            console.log(`      → ${checked.length} realtime vendor DriverClass(es) resolve${skipped > 0 ? `; ${skipped} not loaded in this process (see RD14_NOT_IN_THIS_PROCESS)` : ''}`);
        }
    },
    {
        Id: 'realtime-deterministic.RD15',
        Name: "RD15: a bridged session's usage lands on its co-agent prompt run before finalize prices it; usage after close is not stored",
        Fn: async (ctx): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
            await AIEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
            const fixture = findBridgedUsageFixture();
            if (!fixture) {
                console.warn('  ⚠ realtime-deterministic.RD15 SKIPPED — no Active Realtime co-agent with a system prompt, '
                    + 'or no Realtime model-vendor row, in this deployment');
                return;
            }
            const cleanup: string[] = [];
            try {
                await runBridgedUsageScenario(ctx, fixture, cleanup);
            } finally {
                await DeepDeleteRunTrees(ctx.Provider, ctx.User, cleanup);
            }
            console.log(`      → usage stored on the co-agent prompt run, priced at finalize${fixture.Priced ? '' : ' (no price row: cost not asserted)'}; runs removed`);
        }
    },
    {
        Id: 'realtime-deterministic.RD16',
        Name: "RD16: a co-agent prompt run's avatar video is priced at finalize (Gemini 3.8 Live × Vertex AI): Cost = token line + video line, CostLines written",
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
            const anchors = await findAvatarPricingAnchors(AIEngineBase.Instance, ctx.User);
            if (typeof anchors === 'string') {
                console.warn(`  ⚠ realtime-deterministic.RD16 SKIPPED — ${anchors}`);
                return;
            }
            const service = new RealtimeClientSessionService();
            let runID: string | undefined;
            try {
                runID = (await createAvatarPricingRun(anchors, ctx.User)).ID;
                Assert(await service.AccumulatePromptRunUsage(runID, RD16_INPUT_TOKENS, RD16_OUTPUT_TOKENS, ctx.User, ctx.Provider, RD16_USAGE), 'RD16: the usage write failed');
                await service.FinalizeCoAgentRun(null, runID, ctx.User, ctx.Provider, true, null);
                const run = await new Metadata().GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', ctx.User); // global-provider-ok: integration test script — single-provider process by design
                Assert(await run.Load(runID), `RD16: could not reload the fixture prompt run ${runID}`);
                const expected = expectedAvatarRunCost(anchors, AIEngineBase.Instance);
                assertAvatarRunPriced(run, anchors, expected);
                console.log(`      → Cost ${run.Cost} ${run.CostCurrency} = ${expected.Tokens} (tokens) + ${expected.Video} (60 s of avatar video); fixture removed`);
            } finally {
                if (runID) {
                    const fixture = await new Metadata().GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', ctx.User); // global-provider-ok: integration test script — single-provider process by design
                    if (await fixture.Load(runID)) {
                        await fixture.Delete().catch(() => undefined);
                    }
                }
            }
        }
    },
    {
        Id: 'realtime-deterministic.RD17',
        Name: "RD17: the LiveKit bridge provider lets an agent's bot publish video, and its native room module answers the meeting-avatar probe",
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: AI Bridge Providers';
            if (!new Metadata().EntityByName(entityName)) { // global-provider-ok: integration test script — single-provider process by design
                console.warn(`  ⚠ realtime-deterministic.RD17 SKIPPED — entity '${entityName}' not in metadata (bridge stack not installed)`);
                return;
            }
            const result = await new RunView().RunView<MJAIBridgeProviderEntity>(
                { EntityName: entityName, ExtraFilter: `DriverClass='${LIVEKIT_BRIDGE_DRIVER_CLASS}' AND Status='Active'`, ResultType: 'entity_object' },
                ctx.User,
            );
            Assert(result.Success, `RD17: loading the LiveKit bridge provider failed: ${result.ErrorMessage}`);
            const provider = result.Results?.[0];
            if (!provider) {
                console.warn(`  ⚠ realtime-deterministic.RD17 SKIPPED — no Active '${LIVEKIT_BRIDGE_DRIVER_CLASS}' provider seeded`);
                return;
            }
            AssertEqual(provider.SupportedFeaturesObject?.VideoOut, true,
                "RD17: the LiveKit provider must allow VideoOut: an agent's avatar is published on video-out, and the bridge drops it otherwise");

            const support = await LiveKitAgentRoomCoordinator.Instance.DescribeAvatarVideo();
            const known = support.Supported === true || support.Reason === 'decoder-missing' || support.Reason === 'bridged';
            Assert(known, `RD17: the avatar probe answered with an unknown shape: ${JSON.stringify(support)}`);
            console.log(`      → video out allowed; meeting avatars on this host: ${support.Supported === true ? 'can be published' : `audio only (${support.Reason}${support.Detail ? `: ${support.Detail}` : ''})`}`);
        }
    },
    {
        Id: 'realtime-deterministic.RD18',
        Name: "RD18: an avatar shows only when the model's Video/Output modality row and its endpoint allow it: Gemini 3.8 Live × Vertex AI asks for one; a tagged model on the same endpoint whose row has IsSupported=false asks for none (endpoint); without the row, the endpoint decides (run-scoped key, no network)",
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
            const anchors = findModalitiesGateAnchors(AIEngineBase.Instance);
            if (typeof anchors === 'string') {
                console.warn(`  ⚠ realtime-deterministic.RD18 SKIPPED — ${anchors}`);
                return;
            }
            const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            const fixture: AvatarFixture = { Check: 'RD18', Rows: [], AvatarID: `mj-it-avatar-${stamp}`, Voice: `mj-it-voice-${stamp}`, PersonaName: `mj-it-rd18-persona-${stamp} ${TAG}` };
            try {
                await createAvatarFixture(ctx, anchors, fixture);
                const gated = await createVideoOffModel(ctx, anchors, fixture);
                await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider); // the engine reads the fixture rows now, not after its debounce
                const service = new RealtimeClientSessionService();
                assertGateOpen(await service.PrepareRealtimeSessionParams(avatarPrepInput(anchors, true), ctx.User, ctx.Provider), anchors, fixture);
                assertGateClosedByRow(await service.PrepareRealtimeSessionParams(avatarPrepInput(onGatedModel(anchors, gated), true), ctx.User, ctx.Provider), gated);
                await assertNoRowLeavesItToTheEndpoint(ctx, service, anchors, fixture, gated);
            } finally {
                await deleteAvatarFixture(fixture);
                await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider).catch(() => undefined);
            }
            console.log(`      → ${anchors.Model.Name} on ${anchors.VendorRow.DriverClass} asks for the face; a tagged model there with IsSupported=false asks for none (endpoint), and with no row asks again; fixture removed`);
        }
    }
];

for (const check of RealtimeDeterministicChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
