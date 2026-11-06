/**
 * The agent-run realtime path (`BaseAgent.executeRealtimeSession`, resolved by `BaseAgent.resolveRealtimeModel`) picks a
 * model's vendor by the same avatar rule as the co-agent session prep: a vendor that renders avatars (Vertex AI for
 * Gemini 3.8 Live) takes the session only when the session will show an avatar, or when it is the only keyed vendor.
 *
 * The real vendor walk and the real ClassFactory run here; only the engine's cached metadata, the keys and the agent's
 * effective configuration are supplied.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { BaseRealtimeModel, IRealtimeSession, AIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { MJAIModelVendorEntity } from '@memberjunction/core-entities';

import { BaseAgent } from '../base-agent';
import { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

const MODEL_ID = 'model-live';
const API_NAME = 'gemini-3.8-live';

/** A driver that renders an avatar for {@link API_NAME} when `renders` is set (Vertex AI), and none otherwise. */
function driver(renders: boolean) {
    return class extends BaseRealtimeModel {
        public override get SupportsClientDirect(): boolean { return true; }
        public override SupportsAvatarOutput(model: string): boolean { return renders && model === API_NAME; }
        public async StartSession(): Promise<IRealtimeSession> {
            return {} as unknown as IRealtimeSession;
        }
    };
}

const model = { ID: MODEL_ID, Name: 'Gemini 3.8 Live', IsActive: true, AIModelType: 'Realtime', PowerRank: 15 } as unknown as MJAIModelEntityExtended;

function vendor(driverClass: string, priority: number): MJAIModelVendorEntity {
    return {
        ID: `mv-${driverClass}`, ModelID: MODEL_ID, DriverClass: driverClass, Priority: priority,
        Status: 'Active', VendorID: `v-${driverClass}`, APIName: API_NAME,
    } as unknown as MJAIModelVendorEntity;
}

const coAgent = { ID: 'co-agent', Name: 'Probe Co-Agent' } as unknown as MJAIAgentEntityExtended;
const BOTH: AIAPIKey[] = [
    { driverClass: 'AvatarAgentDriver', apiKey: 'k-vertex' },
    { driverClass: 'PlainAgentDriver', apiKey: 'k-google' },
];
const VERTEX_ONLY: AIAPIKey[] = [{ driverClass: 'AvatarAgentDriver', apiKey: 'k-vertex' }];

/** Exposes the agent-run resolution, with the agent's effective configuration supplied. */
class ProbeAgent extends BaseAgent {
    constructor(private readonly config: RealtimeCoAgentConfig) { super(); }
    protected override resolveRealtimeEffectiveConfig(): RealtimeCoAgentConfig {
        return this.config;
    }
    public Resolve(apiKeys: AIAPIKey[], data?: ExecuteAgentParams['data']) {
        return this.resolveRealtimeModel({ agent: coAgent, conversationMessages: [], apiKeys, CredentialScope: 'RuntimeOnly', data });
    }
}

const VIDEO_ON: RealtimeCoAgentConfig = { realtime: { video: { enabled: true } } };
const VIDEO_OFF: RealtimeCoAgentConfig = { realtime: { video: { enabled: false } } };
const ROOM = { realtimeAvatarDelivery: 'room' };

let vendorRows: MJAIModelVendorEntity[] = [];

beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, driver(true), 'AvatarAgentDriver', 100);
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, driver(false), 'PlainAgentDriver', 100);
});

beforeEach(() => {
    // Vertex AI first by Priority, as the catalog ships it.
    vendorRows = [vendor('AvatarAgentDriver', 1), vendor('PlainAgentDriver', 0)];
    vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([model]);
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockImplementation(() => vendorRows);
    vi.spyOn(AIEngine.Instance, 'ModelModalities', 'get').mockReturnValue([]);
    vi.spyOn(AIEngine.Instance, 'GetModalityByName').mockReturnValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('BaseAgent.resolveRealtimeModel — Vertex AI only for agent runs that show an avatar', () => {
    it('takes the vendor that renders no avatar for an audio-only run when both are keyed', async () => {
        expect((await new ProbeAgent(VIDEO_OFF).Resolve(BOTH, ROOM))?.driverClass).toBe('PlainAgentDriver');
        expect((await new ProbeAgent({}).Resolve(BOTH))?.driverClass).toBe('PlainAgentDriver');
        // Video on, but nothing publishes the avatar (no room delivery), or the run is a phone call.
        expect((await new ProbeAgent(VIDEO_ON).Resolve(BOTH))?.driverClass).toBe('PlainAgentDriver');
        expect((await new ProbeAgent(VIDEO_ON).Resolve(BOTH, { ...ROOM, realtimePhoneCall: true }))?.driverClass).toBe('PlainAgentDriver');
    });

    it('takes Vertex AI for a run that shows an avatar, whatever the Priority', async () => {
        for (const vertexFirst of [true, false]) {
            vendorRows = [vendor('AvatarAgentDriver', vertexFirst ? 1 : 0), vendor('PlainAgentDriver', vertexFirst ? 0 : 1)];
            const resolution = await new ProbeAgent(VIDEO_ON).Resolve(BOTH, ROOM);
            expect(resolution?.driverClass).toBe('AvatarAgentDriver');
            expect(resolution?.vendorID).toBe('v-AvatarAgentDriver');
            expect(resolution?.modelVendorID).toBe('mv-AvatarAgentDriver');
        }
    });

    it('keeps Vertex AI for an audio-only run when it is the only keyed vendor', async () => {
        expect((await new ProbeAgent(VIDEO_OFF).Resolve(VERTEX_ONLY))?.driverClass).toBe('AvatarAgentDriver');
    });
});
