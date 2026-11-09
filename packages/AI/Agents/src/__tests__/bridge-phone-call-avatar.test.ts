/**
 * A phone call never asks the model for an avatar (#5317), end to end through the bridged path every telephony host
 * uses: `CreateBridgeRealtimeSession({ PhoneCall: true })` → `BaseAgent.StartBridgeRealtimeSession` → the real session
 * prep → the driver's `StartSession` → the real bridged-session wiring. A voiced agent whose persona has a face would ask
 * for it anywhere a person can see it; on a phone call the driver gets no avatar request, the persona's voice stays, and
 * the session reports `phone` as its avatar status.
 *
 * Only the steps with no bearing on the avatar are stubbed on the service prototype (engine config, the system prompt
 * and memory, the config bag's catalog layer, observability runs), and the avatar resolution returns a face, as the
 * persona metadata would.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { BaseRealtimeModel, type IRealtimeSession, type JSONObject, type RealtimeSessionParams } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntityExtended, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';

import { CreateBridgeRealtimeSession } from '../realtime/bridge-realtime-session-factory';
import { RealtimeClientSessionService } from '../realtime/realtime-client-session-service';
import type { RealtimeAvatarResolution } from '../realtime/realtime-avatar-resolution';

const DRIVER = 'PhoneProbeDriver';
const MODEL_ID = 'model-phone-probe';
const BEN = { AvatarID: 'Ben', PersonaName: 'Ben', Source: 'persona' as const };

/** The params every session the probe driver opened was started with, in order. */
const started: RealtimeSessionParams[] = [];

/**
 * A session reporting what a driver that renders avatars reports: granted when asked for one, and no status of its own
 * when asked for none.
 */
function probeSession(params: RealtimeSessionParams): IRealtimeSession {
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
        ...(params.Avatar ? { AvatarStatus: { Requested: true, Granted: true } } : {}),
    };
}

class PhoneProbeDriver extends BaseRealtimeModel {
    /** The default model walk takes only drivers that can also mint browser sessions. */
    public override get SupportsClientDirect(): boolean {
        return true;
    }
    /** Renders avatars, so a meeting's request is the driver's to grant. */
    public override SupportsAvatarOutput(): boolean {
        return true;
    }
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        started.push(params);
        return probeSession(params);
    }
}

const coAgent = { ID: 'co-agent-phone', Name: 'Phone Probe Co-Agent' } as unknown as MJAIAgentEntityExtended;
const model = { ID: MODEL_ID, Name: 'Phone Probe Model', IsActive: true, AIModelType: 'Realtime', PowerRank: 5 } as unknown as MJAIModelEntityExtended;
const vendorRow = {
    ID: 'mv-phone-probe', ModelID: MODEL_ID, DriverClass: DRIVER, Priority: 1, Status: 'Active', VendorID: 'v-phone-probe', APIName: 'phone-probe-live',
} as unknown as MJAIModelVendorEntity;
const contextUser = { ID: 'user-1' } as unknown as UserInfo;
const metadataProvider = {} as unknown as IMetadataProvider;

type ServiceInternals = {
    configureEngine: () => Promise<void>;
    buildCompanionSystemPrompt: () => Promise<string>;
    assembleMemoryContext: () => Promise<string>;
    buildSessionConfigBag: () => JSONObject | undefined;
    ResolveSessionAvatar: () => RealtimeAvatarResolution;
    createCoAgentObservabilityRun: () => Promise<null>;
    resolveCoAgentSystemPrompt: () => { Text: string; PromptID: string | null };
    resolveNarrationInstructionsTemplate: () => string | null;
};
const proto = RealtimeClientSessionService.prototype as unknown as ServiceInternals;

beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, PhoneProbeDriver, DRIVER, 100);
});

beforeEach(() => {
    started.length = 0;
    vi.stubEnv(`AI_VENDOR_API_KEY__${DRIVER.toUpperCase()}`, 'sk-phone-probe');
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([coAgent]);
    vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([model]);
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockReturnValue([vendorRow]);
    vi.spyOn(proto, 'configureEngine').mockResolvedValue(undefined);
    vi.spyOn(proto, 'buildCompanionSystemPrompt').mockResolvedValue('You voice the agent.');
    vi.spyOn(proto, 'assembleMemoryContext').mockResolvedValue('');
    vi.spyOn(proto, 'buildSessionConfigBag').mockReturnValue(undefined);
    vi.spyOn(proto, 'ResolveSessionAvatar').mockReturnValue({ Avatar: BEN, Voice: 'Puck' });
    vi.spyOn(proto, 'createCoAgentObservabilityRun').mockResolvedValue(null);
    vi.spyOn(proto, 'resolveCoAgentSystemPrompt').mockReturnValue({ Text: '', PromptID: null });
    vi.spyOn(proto, 'resolveNarrationInstructionsTemplate').mockReturnValue(null);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

function open(extra: { PhoneCall?: boolean; AvatarDelivery?: 'room' }): Promise<IRealtimeSession> {
    return CreateBridgeRealtimeSession({ AgentID: coAgent.ID, TargetAgentID: 'target-1', ContextUser: contextUser, MetadataProvider: metadataProvider, ...extra });
}

describe('A phone call through the bridged path asks the driver for no avatar (#5317)', () => {
    it("sends the driver no avatar request, keeps the persona's voice, and reports phone", async () => {
        const session = await open({ PhoneCall: true });
        expect(started).toHaveLength(1);
        expect(started[0].Avatar).toBeUndefined();
        expect(started[0].Config?.['voice']).toBe('Puck');
        expect(session.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'phone' });
    });

    it('sends no request even when a room could publish the avatar (a SIP call in a LiveKit room)', async () => {
        const session = await open({ PhoneCall: true, AvatarDelivery: 'room' });
        expect(started[0].Avatar).toBeUndefined();
        expect(session.AvatarStatus?.Reason).toBe('phone');
    });

    it('still asks for the avatar in a meeting room that publishes it, and leaves the status to the driver', async () => {
        const session = await open({ AvatarDelivery: 'room' });
        expect(started[0].Avatar).toEqual({ ...BEN, Delivery: 'room' });
        expect(session.AvatarStatus).toEqual({ Requested: true, Granted: true });
    });
});
