/**
 * Realtime key precedence, end to end through the REAL resolution path: run key → the service's
 * `getAPIKeyForDriver` seam → (the seam's default) `AI_VENDOR_API_KEY__<driver>`.
 *
 * Nothing on the key path is mocked here: the real `GetAIAPIKey` reads a stubbed environment, the
 * real `SelectRealtimeVendorForModel` walks vendors, and the real `createModelInstance` builds the
 * driver through the ClassFactory. Only the engine's cached metadata (models + model-vendors) and a
 * key-capturing driver are supplied. The assertion is always the key the driver was CONSTRUCTED with
 * — the key the vendor session is minted on.
 *
 * Why it exists: the funnel once built its resolver with `MakeAIAPIKeyResolver(input.APIKeys)`,
 * which falls back to the environment itself. That resolver answered before the seam, so a subclass
 * overriding `getAPIKeyForDriver` (a vault, a different key, `undefined` to disable a vendor) lost
 * to `AI_VENDOR_API_KEY__<driver>` whenever the environment held one — even with no run keys. Cases
 * with the environment key present and the seam overridden are the ones that pin that.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { BaseRealtimeModel, IRealtimeSession, RealtimeSessionParams, AIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { MJAIModelVendorEntity } from '@memberjunction/core-entities';

import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    RealtimeModelResolutionOutcome,
    RealtimeSessionParamsPrep,
    BridgeRealtimeRuntime
} from '../realtime/realtime-client-session-service';
import { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';
import { BaseAgent } from '../base-agent';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MODEL_ID = 'model-voice';
const ENV_KEY = 'AI_VENDOR_API_KEY__VOICEDRIVER';

/** Every key a realtime driver was constructed with, in order — i.e. what each session minted on. */
const minted: Array<{ DriverClass: string; APIKey: string }> = [];

/** A realtime driver that records the key it was constructed with. Registered per driver class below. */
function capturingDriver(driverClass: string) {
    return class extends BaseRealtimeModel {
        constructor(apiKey: string) {
            super(apiKey);
            minted.push({ DriverClass: driverClass, APIKey: apiKey });
        }
        public override get SupportsClientDirect(): boolean { return true; }
        public async StartSession(): Promise<IRealtimeSession> {
            return {} as unknown as IRealtimeSession;
        }
    };
}

const model = {
    ID: MODEL_ID, Name: 'Voice Model', IsActive: true, AIModelType: 'Realtime', PowerRank: 5
} as unknown as MJAIModelEntityExtended;

function vendor(driverClass: string, priority: number): MJAIModelVendorEntity {
    return {
        ID: `mv-${driverClass}`, ModelID: MODEL_ID, DriverClass: driverClass, Priority: priority,
        Status: 'Active', VendorID: `v-${driverClass}`, APIName: `api-${driverClass}`
    } as unknown as MJAIModelVendorEntity;
}

/** The model-vendor rows the engine serves; reset per test. VoiceDriver alone unless a case adds more. */
let vendorRows: MJAIModelVendorEntity[] = [];

const coAgent = { ID: 'co-agent', Name: 'Probe Co-Agent' } as unknown as MJAIAgentEntityExtended;

// ── Service seams ─────────────────────────────────────────────────────────────

/** Exposes the funnel. The key seam is left alone — it is the thing under test. */
class FunnelService extends RealtimeClientSessionService {
    public Resolve(input: PrepareClientSessionInput, effectiveConfig?: RealtimeCoAgentConfig): Promise<RealtimeModelResolutionOutcome> {
        return this.resolveModelForSession(input, coAgent, effectiveConfig);
    }
}

/** A subclass whose `getAPIKeyForDriver` is replaced — the downstream override the funnel must honour. */
class SeamOverrideService extends FunnelService {
    constructor(private readonly seam: (driverClass: string) => string | undefined) { super(); }
    protected override getAPIKeyForDriver(driverClass: string): string | undefined {
        return this.seam(driverClass);
    }
}

/** The three ways resolveModelForSession picks a model; each must honour the same key order. */
const branches: Array<{ name: string; input: (keys?: AIAPIKey[]) => PrepareClientSessionInput; config?: RealtimeCoAgentConfig }> = [
    {
        name: 'requested model (PreferredModelID)',
        input: (keys) => ({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', PreferredModelID: MODEL_ID, APIKeys: keys })
    },
    {
        name: 'configured modelPreference',
        input: (keys) => ({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', APIKeys: keys }),
        config: { realtime: { modelPreference: MODEL_ID } }
    },
    {
        name: 'default candidate walk',
        input: (keys) => ({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', APIKeys: keys })
    }
];

const RUN_KEYS: AIAPIKey[] = [{ driverClass: 'VoiceDriver', apiKey: 'sk-run' }];

beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, capturingDriver('VoiceDriver'), 'VoiceDriver', 100);
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, capturingDriver('BackupDriver'), 'BackupDriver', 100);
});

beforeEach(() => {
    minted.length = 0;
    vendorRows = [vendor('VoiceDriver', 9)];
    // The platform holds a key for VoiceDriver in EVERY case: the regression only shows when it does.
    vi.stubEnv(ENV_KEY, 'sk-platform');
    vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([model]);
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockImplementation(() => vendorRows);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

// ── The funnel, per branch ────────────────────────────────────────────────────

describe.each(branches)('RealtimeClientSessionService key precedence — $name', ({ input, config }) => {
    it('mints on the RUN key when the session carries one, ahead of the platform key', async () => {
        const outcome = await new FunnelService().Resolve(input(RUN_KEYS), config);
        expect(outcome.Resolution?.DriverClass).toBe('VoiceDriver');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('mints on the platform (environment) key with no run keys — the seam\'s default', async () => {
        const outcome = await new FunnelService().Resolve(input(), config);
        expect(outcome.Resolution?.DriverClass).toBe('VoiceDriver');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-platform' }]);
    });

    it('an overridden seam that answers undefined disables the vendor — the environment key does not get past it', async () => {
        const outcome = await new SeamOverrideService(() => undefined).Resolve(input(), config);
        expect(outcome.Resolution).toBeUndefined();
        expect(minted).toEqual([]);
    });

    it('an overridden seam that answers with its own key is used instead of the environment key', async () => {
        await new SeamOverrideService(() => 'sk-vault').Resolve(input(), config);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-vault' }]);
    });

    it('a run key still wins over an overridden seam', async () => {
        await new SeamOverrideService(() => 'sk-vault').Resolve(input(RUN_KEYS), config);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('RuntimeOnly: the session still mints on the run key it carries', async () => {
        await new FunnelService().Resolve({ ...input(RUN_KEYS), CredentialScope: 'RuntimeOnly' }, config);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('RuntimeOnly: with no run key for the vendor, neither the environment nor the seam mints one', async () => {
        const fromEnvironment = await new FunnelService().Resolve({ ...input(), CredentialScope: 'RuntimeOnly' }, config);
        const fromSeam = await new SeamOverrideService(() => 'sk-vault').Resolve({ ...input(), CredentialScope: 'RuntimeOnly' }, config);
        expect(fromEnvironment.Resolution).toBeUndefined();
        expect(fromSeam.Resolution).toBeUndefined();
        expect(minted).toEqual([]);
    });

    it('selection and mint agree — a vendor the seam refuses is skipped, and the one it keys is minted on its key', async () => {
        // VoiceDriver outranks BackupDriver and is keyed by the environment. The seam refuses it and
        // keys BackupDriver from a vault, so selection must pass over VoiceDriver and the mint must
        // then use the vault key — never select one vendor and mint another's key.
        vendorRows = [vendor('VoiceDriver', 9), vendor('BackupDriver', 1)];
        const seam = (driverClass: string) => (driverClass === 'BackupDriver' ? 'sk-vault-backup' : undefined);
        const outcome = await new SeamOverrideService(seam).Resolve(input(), config);
        expect(outcome.Resolution?.DriverClass).toBe('BackupDriver');
        expect(minted).toEqual([{ DriverClass: 'BackupDriver', APIKey: 'sk-vault-backup' }]);
    });
});

// ── Probe: from an agent run, through the bridge path, to the driver ──────────

/**
 * The closest in-process stand-in for "a LiveKit / bridge voice session started from an agent run
 * mints on the run's key": `BaseAgent.StartBridgeRealtimeSession` → `buildBridgePrepInput` → the
 * service's `PrepareRealtimeSessionParams` → the funnel → the ClassFactory driver. Only the steps with
 * no bearing on keys are stubbed on the service prototype (engine config, system-prompt/memory
 * assembly, observability wiring), because `StartBridgeRealtimeSession` constructs the service itself.
 */
describe('probe: BaseAgent.StartBridgeRealtimeSession mints on the run\'s key', () => {
    type ServiceInternals = {
        configureEngine: () => Promise<void>;
        buildSessionParams: () => Promise<RealtimeSessionParams>;
        getAPIKeyForDriver: (driverClass: string) => string | undefined;
    };
    const proto = RealtimeClientSessionService.prototype as unknown as ServiceInternals;
    let prep: RealtimeSessionParamsPrep | null = null;

    beforeEach(() => {
        prep = null;
        vi.spyOn(proto, 'configureEngine').mockResolvedValue(undefined);
        vi.spyOn(proto, 'buildSessionParams').mockResolvedValue({ Model: 'api-VoiceDriver', SystemPrompt: '' });
        vi.spyOn(RealtimeClientSessionService.prototype, 'WireBridgeRealtimeSession').mockImplementation(
            async (_session, _input, p): Promise<BridgeRealtimeRuntime> => {
                prep = p;
                return { Finalize: async () => undefined };
            }
        );
    });

    function start(apiKeys?: AIAPIKey[], data?: Record<string, unknown>, CredentialScope?: ExecuteAgentParams['CredentialScope']): Promise<IRealtimeSession> {
        const params: ExecuteAgentParams = {
            agent: coAgent,
            conversationMessages: [],
            contextUser: { ID: 'u1' } as unknown as UserInfo,
            apiKeys,
            data,
            CredentialScope
        };
        return new BaseAgent().StartBridgeRealtimeSession(params);
    }

    it('run carries a key for the realtime driver → the session mints on it', async () => {
        await start(RUN_KEYS);
        expect(prep?.Resolution?.DriverClass).toBe('VoiceDriver');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('same, with a per-session model override (the requested-model branch)', async () => {
        await start(RUN_KEYS, { realtimeModelID: MODEL_ID });
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('no run keys, AI_VENDOR_API_KEY__<driver> set → the session mints on the platform key', async () => {
        await start(undefined);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-platform' }]);
    });

    it('RuntimeOnly with no run keys → no session, even though the platform holds a key', async () => {
        await expect(start(undefined, undefined, 'RuntimeOnly')).rejects.toThrow();
        expect(minted).toEqual([]);
    });

    it('no run keys, seam overridden → the override decides, not the environment', async () => {
        vi.spyOn(proto, 'getAPIKeyForDriver').mockReturnValue(undefined);
        await expect(start(undefined)).rejects.toThrow();
        expect(minted).toEqual([]);

        vi.spyOn(proto, 'getAPIKeyForDriver').mockReturnValue('sk-vault');
        await start(undefined);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-vault' }]);
    });
});

/** The server-run realtime path (`executeRealtimeSession`) resolves in BaseAgent itself, with no seam. */
describe('probe: BaseAgent.resolveRealtimeModel (server-run realtime session)', () => {
    class ProbeAgent extends BaseAgent {
        public Resolve(apiKeys?: AIAPIKey[], CredentialScope?: ExecuteAgentParams['CredentialScope']) {
            return this.resolveRealtimeModel({ agent: coAgent, conversationMessages: [], apiKeys, CredentialScope });
        }
    }

    it('mints on the run key when the run carries one', async () => {
        const result = await new ProbeAgent().Resolve(RUN_KEYS);
        expect(result?.driverClass).toBe('VoiceDriver');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('mints on the platform key with no run keys', async () => {
        await new ProbeAgent().Resolve();
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-platform' }]);
    });

    it('RuntimeOnly with no run keys → no model, not the platform key', async () => {
        expect(await new ProbeAgent().Resolve(undefined, 'RuntimeOnly')).toBeNull();
        expect(minted).toEqual([]);
    });
});
