/**
 * A meeting says why an agent's avatar isn't shown when the session prep decided it (#5319), end to end through the
 * bridged path the LiveKit room coordinator uses: `CreateBridgeRealtimeSession({ AvatarDelivery: 'room' })` →
 * `BaseAgent.StartBridgeRealtimeSession` → the real session prep and avatar resolution → the driver's `StartSession` → the
 * real bridged-session wiring. When the prep asks the driver for no avatar (no face for the model's vendor, an unknown
 * avatar, a Video/Output row that turns video off), the driver reports nothing, so the session's `AvatarStatus` says why
 * and the bot's attributes (`AgentAvatarAttributes`, what the coordinator puts on the bot's token) carry
 * `audio-only:<reason>`, which the room words as its notice. A granted avatar is unchanged.
 *
 * A driver that renders no avatar (every driver but Gemini's) ignores a request and reports nothing (#5429): a meeting
 * whose prep asked such a driver for the persona's face says `endpoint`, as a browser call does, or `bridged` when the
 * room's bot can't publish the avatar. A status the driver reported, as the Gemini driver does, is unchanged.
 *
 * Only the steps with no bearing on the avatar are stubbed on the service prototype (engine config, the system prompt
 * and memory, the config bag's catalog layer, observability runs). The effective configuration is set per test (the
 * video setting), and the engine's persona and modality lookups answer as the metadata would.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import {
    AgentAvatarAttributes,
    BaseRealtimeModel,
    type IRealtimeSession,
    type JSONObject,
    type RealtimeAvatarStatus,
    type RealtimeSessionParams,
} from '@memberjunction/ai';
import type { ResolvedAgentPersona, ResolvedModelPersona } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntityExtended, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentPersonaEntity,
    MJAIModalityEntity,
    MJAIModelModalityEntity,
    MJAIModelVendorEntity,
    MJAIPersonaEntity,
    MJAIPersonaVendorEntity,
} from '@memberjunction/core-entities';

import { CreateBridgeRealtimeSession } from '../realtime/bridge-realtime-session-factory';
import { RealtimeClientSessionService } from '../realtime/realtime-client-session-service';
import type { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

const DRIVER = 'MeetingAvatarProbeDriver';
const MODEL_ID = 'model-meeting-probe';
const VENDOR_ID = 'v-meeting-probe';
const TARGET_ID = 'target-1';

/** The params every session the probe driver opened was started with, in order. */
const started: RealtimeSessionParams[] = [];

/** Whether the probe driver renders avatars for its model (`SupportsAvatarOutput`); set per test. */
let driverShowsAvatars = true;

/**
 * Whether the probe driver reports what became of an avatar request, as the Gemini driver does; set per test. Every
 * other driver renders no avatar and ignores the request, reporting nothing ({@link avatarlessDriver}).
 */
let driverReportsAvatar = true;

/**
 * What the probe driver reports, as the Gemini driver does on the server: `bridged` when asked without room delivery;
 * with it, `custom-disabled` for a custom avatar, else granted; nothing when not asked.
 */
function driverStatusFor(params: RealtimeSessionParams): RealtimeAvatarStatus | undefined {
    if (!params.Avatar) {
        return undefined;
    }
    if (params.Avatar.Delivery !== 'room') {
        return { Requested: true, Granted: false, Reason: 'bridged' };
    }
    return params.Avatar.Kind === 'custom' ? { Requested: true, Granted: false, Reason: 'custom-disabled' } : { Requested: true, Granted: true };
}

/** The probe acts as every driver but Gemini's: it renders no avatar (`SupportsAvatarOutput` false) and ignores a request. */
function avatarlessDriver(): void {
    driverShowsAvatars = false;
    driverReportsAvatar = false;
}

function probeSession(status: RealtimeAvatarStatus | undefined): IRealtimeSession {
    return {
        SendInput: () => undefined,
        RegisterTools: async () => undefined,
        OnOutput: () => undefined,
        OnTranscript: () => undefined,
        OnToolCall: () => undefined,
        SendToolResult: async () => undefined,
        OnInterruption: () => undefined,
        OnUsage: () => undefined,
        OnError: () => undefined,
        Close: async () => undefined,
        ...(status ? { AvatarStatus: status } : {}),
    };
}

class MeetingAvatarProbeDriver extends BaseRealtimeModel {
    /** The default model walk takes only drivers that can also mint browser sessions. */
    public override get SupportsClientDirect(): boolean {
        return true;
    }
    public override SupportsAvatarOutput(): boolean {
        return driverShowsAvatars;
    }
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        started.push(params);
        return probeSession(driverReportsAvatar ? driverStatusFor(params) : undefined);
    }
}

const coAgent = { ID: 'co-agent-meeting', Name: 'Meeting Probe Co-Agent' } as unknown as MJAIAgentEntityExtended;
const model = { ID: MODEL_ID, Name: 'Meeting Probe Model', IsActive: true, AIModelType: 'Realtime', PowerRank: 5 } as unknown as MJAIModelEntityExtended;
const vendorRow = {
    ID: 'mv-meeting-probe', ModelID: MODEL_ID, DriverClass: DRIVER, Priority: 1, Status: 'Active', VendorID: VENDOR_ID, APIName: 'meeting-probe-live',
} as unknown as MJAIModelVendorEntity;
const contextUser = { ID: 'user-1' } as unknown as UserInfo;
const metadataProvider = {} as unknown as IMetadataProvider;

/** The persona Ben: a face (`Ben`) and a voice (`Puck`) on the model's vendor, and the voiced agent's default persona. */
const BEN = { ID: 'p-ben', Name: 'Ben' } as unknown as MJAIPersonaEntity;
const BEN_FACE: ResolvedModelPersona = { Persona: BEN, PersonaVendor: { APIName: 'Ben', VendorSettingsObject: { Avatar: { Kind: 'preset' } } } } as unknown as ResolvedModelPersona;
/** Ben's face as a custom avatar (from a reference image), which the Gemini driver refuses as `custom-disabled`. */
const BEN_CUSTOM_FACE: ResolvedModelPersona = {
    Persona: BEN,
    PersonaVendor: { APIName: 'Ben', VendorSettingsObject: { Avatar: { Kind: 'custom', ReferenceImageFileID: 'file-ben' } } },
} as unknown as ResolvedModelPersona;
const BEN_VOICE: ResolvedModelPersona = { Persona: BEN, PersonaVendor: { APIName: 'Puck', VendorSettingsObject: null } } as unknown as ResolvedModelPersona;
const BEN_FOR_TARGET: ResolvedAgentPersona = { Persona: BEN, AgentPersona: { IsDefault: true } as unknown as MJAIAgentPersonaEntity };

/** What the persona metadata holds for the test: the model's faces, and the voiced agent's personas. */
let faces: ResolvedModelPersona[] = [];
let targetPersonas: ResolvedAgentPersona[] = [];

type ServiceInternals = {
    configureEngine: () => Promise<void>;
    resolveEffectiveConfig: () => RealtimeCoAgentConfig;
    buildCompanionSystemPrompt: () => Promise<string>;
    assembleMemoryContext: () => Promise<string>;
    buildSessionConfigBag: () => JSONObject | undefined;
    createCoAgentObservabilityRun: () => Promise<null>;
    resolveCoAgentSystemPrompt: () => { Text: string; PromptID: string | null };
    resolveNarrationInstructionsTemplate: () => string | null;
};
const proto = RealtimeClientSessionService.prototype as unknown as ServiceInternals;

/** The voiced agent's video setting is on (and, when given, names an avatar). */
function videoOn(avatarId?: string): void {
    const video = avatarId ? { enabled: true, avatarId } : { enabled: true };
    vi.spyOn(proto, 'resolveEffectiveConfig').mockReturnValue({ realtime: { video } });
}

/** The model's Video/Output row in the engine's cache: `IsSupported` false turns video off. */
function videoOutputRow(isSupported: boolean): void {
    vi.spyOn(AIEngine.Instance, 'GetModalityByName').mockImplementation((name: string) =>
        name.toLowerCase() === 'video' ? ({ ID: 'modality-video', Name: 'Video' } as unknown as MJAIModalityEntity) : undefined);
    vi.spyOn(AIEngine.Instance, 'ModelModalities', 'get').mockReturnValue([
        { ModelID: MODEL_ID, ModalityID: 'modality-video', Direction: 'Output', IsSupported: isSupported } as unknown as MJAIModelModalityEntity,
    ]);
}

beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, MeetingAvatarProbeDriver, DRIVER, 100);
});

beforeEach(() => {
    started.length = 0;
    driverShowsAvatars = true;
    driverReportsAvatar = true;
    faces = [];
    targetPersonas = [];
    vi.stubEnv(`AI_VENDOR_API_KEY__${DRIVER.toUpperCase()}`, 'sk-meeting-probe');
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([coAgent]);
    vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([model]);
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockReturnValue([vendorRow]);
    vi.spyOn(AIEngine.Instance, 'GetModelPersonas').mockImplementation((modelId: string, modalityName = 'Audio') => {
        if (modelId !== MODEL_ID) {
            return [];
        }
        return modalityName === 'Video' ? faces : faces.length > 0 ? [BEN_VOICE] : [];
    });
    vi.spyOn(AIEngine.Instance, 'GetAgentPersonas').mockImplementation((agentId: string) => (agentId === TARGET_ID ? targetPersonas : []));
    vi.spyOn(proto, 'configureEngine').mockResolvedValue(undefined);
    vi.spyOn(proto, 'resolveEffectiveConfig').mockReturnValue({});
    vi.spyOn(proto, 'buildCompanionSystemPrompt').mockResolvedValue('You voice the agent.');
    vi.spyOn(proto, 'assembleMemoryContext').mockResolvedValue('');
    vi.spyOn(proto, 'buildSessionConfigBag').mockReturnValue(undefined);
    vi.spyOn(proto, 'createCoAgentObservabilityRun').mockResolvedValue(null);
    vi.spyOn(proto, 'resolveCoAgentSystemPrompt').mockReturnValue({ Text: '', PromptID: null });
    vi.spyOn(proto, 'resolveNarrationInstructionsTemplate').mockReturnValue(null);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

/** Opens the agent's session as the LiveKit room coordinator does: room delivery when its bot can publish the avatar. */
function openMeeting(roomDelivery = true): Promise<IRealtimeSession> {
    return CreateBridgeRealtimeSession({
        AgentID: coAgent.ID,
        TargetAgentID: TARGET_ID,
        RoomName: 'meeting-room',
        ContextUser: contextUser,
        MetadataProvider: metadataProvider,
        ...(roomDelivery ? { AvatarDelivery: 'room' as const } : {}),
    });
}

const audioOnly = (reason: string) => ({ Requested: true, Granted: false, Reason: reason });

describe("A meeting session whose prep asked the driver for no avatar says why (#5319)", () => {
    it("reports no-binding when the voiced agent's persona has no face for the model's vendor, and the bot carries it", async () => {
        videoOn();
        const session = await openMeeting();
        expect(started).toHaveLength(1);
        expect(started[0].Avatar).toBeUndefined();
        expect(session.AvatarStatus).toEqual(audioOnly('no-binding'));
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({ 'mj.agentAvatar': 'audio-only:no-binding' });
    });

    it('reports unknown-avatar when the agent names an avatar the vendor has no face for', async () => {
        videoOn('Nobody');
        faces = [BEN_FACE];
        const session = await openMeeting();
        expect(started[0].Avatar).toBeUndefined();
        expect(session.AvatarStatus).toEqual(audioOnly('unknown-avatar'));
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({ 'mj.agentAvatar': 'audio-only:unknown-avatar' });
    });

    it("reports endpoint when the model's Video/Output row turns video off, though the persona has a face", async () => {
        videoOn();
        videoOutputRow(false);
        faces = [BEN_FACE];
        targetPersonas = [BEN_FOR_TARGET];
        const session = await openMeeting();
        expect(started[0].Avatar).toBeUndefined();
        expect(session.AvatarStatus).toEqual(audioOnly('endpoint'));
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({ 'mj.agentAvatar': 'audio-only:endpoint' });
    });

    it('reports endpoint, as a browser call does, when no face resolved on a model whose driver renders no avatar', async () => {
        videoOn();
        driverShowsAvatars = false;
        const session = await openMeeting();
        expect(session.AvatarStatus).toEqual(audioOnly('endpoint'));
    });

    it("reports bridged when the room's bot can't publish the avatar, as the driver says when asked there", async () => {
        videoOn();
        const session = await openMeeting(false);
        expect(started[0].Avatar).toBeUndefined();
        expect(session.AvatarStatus).toEqual(audioOnly('bridged'));
    });
});

describe('A meeting session the prep asked the driver about keeps the driver\'s status', () => {
    it("leaves a granted avatar granted: the bot says 'on'", async () => {
        videoOn();
        faces = [BEN_FACE];
        targetPersonas = [BEN_FOR_TARGET];
        const session = await openMeeting();
        expect(started[0].Avatar).toMatchObject({ AvatarID: 'Ben', Delivery: 'room' });
        expect(started[0].Config?.['voice']).toBe('Puck');
        expect(session.AvatarStatus).toEqual({ Requested: true, Granted: true });
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({ 'mj.agentAvatar': 'on' });
    });

    it("keeps the driver's bridged when the room's bot can't publish the face it asked for", async () => {
        videoOn();
        faces = [BEN_FACE];
        targetPersonas = [BEN_FOR_TARGET];
        const session = await openMeeting(false);
        expect(started[0].Avatar).toMatchObject({ AvatarID: 'Ben' });
        expect(session.AvatarStatus).toEqual(audioOnly('bridged'));
    });

    it('reports nothing when the agent asked for no avatar (its video setting is off), so the bot carries no attribute', async () => {
        const session = await openMeeting();
        expect(started[0].Avatar).toBeUndefined();
        expect(session.AvatarStatus).toBeUndefined();
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({});
    });

    it("keeps the reason the driver reported on a model that shows no avatar, as the Gemini driver's custom-disabled (#5429)", async () => {
        videoOn();
        driverShowsAvatars = false;
        faces = [BEN_CUSTOM_FACE];
        targetPersonas = [BEN_FOR_TARGET];
        const session = await openMeeting();
        expect(started[0].Avatar).toMatchObject({ AvatarID: 'Ben', Kind: 'custom', Delivery: 'room' });
        expect(session.AvatarStatus).toEqual(audioOnly('custom-disabled'));
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({ 'mj.agentAvatar': 'audio-only:custom-disabled' });
    });
});

describe('A meeting session whose driver renders no avatar and ignored the request says why (#5429)', () => {
    /** The voiced agent's persona has a face on the model's vendor, so the prep asks the driver for it. */
    function personaWithFace(): void {
        videoOn();
        faces = [BEN_FACE];
        targetPersonas = [BEN_FOR_TARGET];
    }

    it("reports endpoint, as a browser call does, and the bot carries audio-only:endpoint, when the room's bot can publish the avatar", async () => {
        personaWithFace();
        avatarlessDriver();
        const session = await openMeeting();
        expect(started).toHaveLength(1);
        expect(started[0].Avatar).toMatchObject({ AvatarID: 'Ben', Delivery: 'room' });
        expect(started[0].Config?.['voice']).toBe('Puck');
        expect(session.AvatarStatus).toEqual(audioOnly('endpoint'));
        expect(AgentAvatarAttributes(session.AvatarStatus)).toEqual({ 'mj.agentAvatar': 'audio-only:endpoint' });
    });

    it("reports bridged when the room's bot can't publish the avatar, as a driver asked there says", async () => {
        personaWithFace();
        avatarlessDriver();
        const session = await openMeeting(false);
        expect(started[0].Avatar).toMatchObject({ AvatarID: 'Ben' });
        expect(started[0].Avatar?.Delivery).toBeUndefined();
        expect(session.AvatarStatus).toEqual(audioOnly('bridged'));
    });
});
