/**
 * Realtime voice sessions mint on the platform's MJ Credentials (AICredentialBindings and a vendor's
 * default credential), in the order a prompt resolves its key: platform credential → run key →
 * environment. `'RuntimeOnly'` keeps the run's own keys as the whole chain.
 *
 * The key path is real end to end — `SelectRealtimeVendorForModel`, the service's key chain, the
 * ClassFactory driver — except the credential read itself (`ResolvePlatformAICredential`), which is
 * replaced by a table of bound values so no credential store is needed. The assertion is always the
 * key the driver was CONSTRUCTED with: the key the vendor session is minted on.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { BaseRealtimeModel, IRealtimeSession, RealtimeSessionParams, AIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { MJAIModelVendorEntity } from '@memberjunction/core-entities';

const h = vi.hoisted(() => ({
    /** Vendor id (or `mv:<model-vendor id>`) → the credential value a binding there resolves to. */
    bound: new Map<string, string>(),
    calls: [] as Array<{ ModelVendorIDs?: string[]; VendorID?: string; ContextUser?: { ID: string }; Subsystem: string }>,
}));

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        ResolvePlatformAICredential: async (request: { ModelVendorIDs?: string[]; VendorID?: string; ContextUser?: { ID: string }; Subsystem: string }) => {
            h.calls.push(request);
            const rowKey = (request.ModelVendorIDs ?? []).map(id => h.bound.get(`mv:${id}`)).find(Boolean);
            return rowKey ?? (request.VendorID ? h.bound.get(request.VendorID) : undefined);
        },
    };
});

import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    RealtimeModelResolutionOutcome,
    RealtimeSessionParamsPrep,
    BridgeRealtimeRuntime,
} from '../realtime/realtime-client-session-service';
import { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';
import { ResolveRealtimePlatformCredentials } from '../realtime/realtime-platform-credentials';
import { GetRealtimeModelVoices } from '../realtime/bridge-realtime-session-factory';
import { BaseAgent } from '../base-agent';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MODEL_ID = 'model-voice';
const SECOND_MODEL_ID = 'model-voice-mini';
const ENV_KEY = 'AI_VENDOR_API_KEY__VOICEDRIVER';
const USER = { ID: 'user-1' } as unknown as UserInfo;

const minted: Array<{ DriverClass: string; APIKey: string }> = [];

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

function realtimeModel(id: string, powerRank: number): MJAIModelEntityExtended {
    return { ID: id, Name: id, IsActive: true, AIModelType: 'Realtime', PowerRank: powerRank } as unknown as MJAIModelEntityExtended;
}

function vendorRow(driverClass: string, priority: number, modelID = MODEL_ID): MJAIModelVendorEntity {
    return {
        ID: `mv-${modelID}-${driverClass}`, ModelID: modelID, DriverClass: driverClass, Priority: priority,
        Status: 'Active', VendorID: `v-${driverClass}`, APIName: `api-${driverClass}`,
    } as unknown as MJAIModelVendorEntity;
}

let models: MJAIModelEntityExtended[] = [];
let vendorRows: MJAIModelVendorEntity[] = [];
/** Targets with a credential binding, as `${bindingType}:${id}`. */
let bindingTargets = new Set<string>();

/** Binds a credential value to a vendor (a Vendor binding). */
function bindVendor(driverClass: string, value: string): void {
    h.bound.set(`v-${driverClass}`, value);
    bindingTargets.add(`Vendor:v-${driverClass}`);
}

const coAgent = { ID: 'co-agent', Name: 'Probe Co-Agent' } as unknown as MJAIAgentEntityExtended;

class FunnelService extends RealtimeClientSessionService {
    public Resolve(input: PrepareClientSessionInput, effectiveConfig?: RealtimeCoAgentConfig): Promise<RealtimeModelResolutionOutcome> {
        return this.resolveModelForSession(input, coAgent, effectiveConfig, USER);
    }
}

class SeamOverrideService extends FunnelService {
    constructor(private readonly seam: (driverClass: string) => string | undefined) { super(); }
    protected override getAPIKeyForDriver(driverClass: string): string | undefined {
        return this.seam(driverClass);
    }
}

const branches: Array<{ name: string; input: (keys?: AIAPIKey[]) => PrepareClientSessionInput; config?: RealtimeCoAgentConfig }> = [
    {
        name: 'requested model (PreferredModelID)',
        input: (keys) => ({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', PreferredModelID: MODEL_ID, APIKeys: keys }),
    },
    {
        name: 'configured modelPreference',
        input: (keys) => ({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', APIKeys: keys }),
        config: { realtime: { modelPreference: MODEL_ID } },
    },
    {
        name: 'default candidate walk',
        input: (keys) => ({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', APIKeys: keys }),
    },
];

const RUN_KEYS: AIAPIKey[] = [{ driverClass: 'VoiceDriver', apiKey: 'sk-run' }];

beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, capturingDriver('VoiceDriver'), 'VoiceDriver', 100);
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, capturingDriver('BackupDriver'), 'BackupDriver', 100);
    MJGlobal.Instance.ClassFactory.Register(BaseRealtimeModel, capturingDriver('UnkeyedDriver'), 'UnkeyedDriver', 100);
});

beforeEach(() => {
    minted.length = 0;
    h.bound.clear();
    h.calls.length = 0;
    bindingTargets = new Set();
    models = [realtimeModel(MODEL_ID, 5)];
    vendorRows = [vendorRow('VoiceDriver', 9)];
    vi.stubEnv(ENV_KEY, 'sk-platform');
    vi.spyOn(AIEngine.Instance, 'Models', 'get').mockImplementation(() => models);
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockImplementation(() => vendorRows);
    vi.spyOn(AIEngine.Instance, 'HasCredentialBindings').mockImplementation((type, id) => bindingTargets.has(`${type}:${id}`));
    vi.spyOn(AIEngine.Instance, 'VendorsByID', 'get').mockReturnValue(new Map());
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

// ── The session funnel, per branch ────────────────────────────────────────────

describe.each(branches)('RealtimeClientSessionService with MJ Credentials — $name', ({ input, config }) => {
    it('a Vendor binding wins over the environment key', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        const outcome = await new FunnelService().Resolve(input(), config);
        expect(outcome.Resolution?.DriverClass).toBe('VoiceDriver');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-bound' }]);
    });

    it('a Vendor binding wins over the run key under the default scope, as it does for prompts', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        await new FunnelService().Resolve(input(RUN_KEYS), config);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-bound' }]);
    });

    it('RuntimeOnly keeps the run key in front and reads no credential', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        await new FunnelService().Resolve({ ...input(RUN_KEYS), CredentialScope: 'RuntimeOnly' }, config);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
        expect(h.calls).toEqual([]);
    });

    it('with no binding, behaviour is unchanged: run key, then the environment, and no credential read', async () => {
        await new FunnelService().Resolve(input(RUN_KEYS), config);
        await new FunnelService().Resolve(input(), config);
        expect(minted).toEqual([
            { DriverClass: 'VoiceDriver', APIKey: 'sk-run' },
            { DriverClass: 'VoiceDriver', APIKey: 'sk-platform' },
        ]);
        expect(h.calls).toEqual([]);
    });

    it('selection and mint use the same key: a vendor keyed only by its binding is selected and minted on it', async () => {
        // VoiceDriver outranks BackupDriver, but the seam keys neither; only BackupDriver has a binding.
        vendorRows = [vendorRow('VoiceDriver', 9), vendorRow('BackupDriver', 1)];
        bindVendor('BackupDriver', 'sk-bound-backup');
        const outcome = await new SeamOverrideService(() => undefined).Resolve(input(), config);
        expect(outcome.Resolution?.DriverClass).toBe('BackupDriver');
        expect(minted).toEqual([{ DriverClass: 'BackupDriver', APIKey: 'sk-bound-backup' }]);
    });

    it('reads the credential as the calling user, under the realtime subsystem', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        await new FunnelService().Resolve(input(), config);
        expect(h.calls[0]).toMatchObject({ VendorID: 'v-VoiceDriver', ContextUser: { ID: 'user-1' }, Subsystem: 'RealtimeSession' });
    });
});

describe('RealtimeClientSessionService no-model message', () => {
    it('says how to fix it when no vendor has a key', async () => {
        const outcome = await new SeamOverrideService(() => undefined).Resolve({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1' });
        expect(outcome.Resolution).toBeUndefined();
        expect(outcome.ErrorMessage).toContain('AI Credential Binding');
        expect(outcome.ErrorMessage).toContain('AI_VENDOR_API_KEY__OPENAIREALTIME');
    });

    it('under RuntimeOnly, names the run\'s apiKeys as the only fix', async () => {
        const outcome = await new FunnelService().Resolve({ CoAgent: coAgent, TargetAgentID: '', AgentSessionID: 's1', CredentialScope: 'RuntimeOnly' });
        expect(outcome.ErrorMessage).toContain('RuntimeOnly');
        expect(outcome.ErrorMessage).toContain('apiKeys');
        expect(outcome.ErrorMessage).not.toContain('AI_VENDOR_API_KEY__');
    });
});

// ── From an agent run, through the bridge path, to the driver ─────────────────

describe('BaseAgent.StartBridgeRealtimeSession with a Vendor binding', () => {
    type ServiceInternals = {
        configureEngine: () => Promise<void>;
        buildSessionParams: (input: PrepareClientSessionInput) => Promise<RealtimeSessionParams>;
    };
    const proto = RealtimeClientSessionService.prototype as unknown as ServiceInternals;

    beforeEach(() => {
        vi.spyOn(proto, 'configureEngine').mockResolvedValue(undefined);
        vi.spyOn(proto, 'buildSessionParams').mockResolvedValue({ Model: 'api-VoiceDriver', SystemPrompt: '' });
        vi.spyOn(RealtimeClientSessionService.prototype, 'WireBridgeRealtimeSession').mockImplementation(
            async (_session, _input, _prep: RealtimeSessionParamsPrep): Promise<BridgeRealtimeRuntime> => ({ Finalize: async () => undefined }),
        );
    });

    function start(apiKeys?: AIAPIKey[], CredentialScope?: ExecuteAgentParams['CredentialScope']): Promise<IRealtimeSession> {
        return new BaseAgent().StartBridgeRealtimeSession({ agent: coAgent, conversationMessages: [], contextUser: USER, apiKeys, CredentialScope });
    }

    it('mints on the bound credential', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        await start(RUN_KEYS);
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-bound' }]);
        expect(h.calls[0].ContextUser).toEqual(USER);
    });

    it('RuntimeOnly mints on the run key', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        await start(RUN_KEYS, 'RuntimeOnly');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });
});

describe('BaseAgent.resolveRealtimeModel with MJ Credentials (server-run realtime session)', () => {
    class ProbeAgent extends BaseAgent {
        public Resolve(apiKeys?: AIAPIKey[], CredentialScope?: ExecuteAgentParams['CredentialScope']) {
            return this.resolveRealtimeModel({ agent: coAgent, conversationMessages: [], contextUser: USER, apiKeys, CredentialScope });
        }
    }

    it('mints on the bound credential ahead of the run key and the environment', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        const result = await new ProbeAgent().Resolve(RUN_KEYS);
        expect(result?.driverClass).toBe('VoiceDriver');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-bound' }]);
    });

    it('with no binding, mints on the run key, then the environment, as before', async () => {
        await new ProbeAgent().Resolve(RUN_KEYS);
        await new ProbeAgent().Resolve();
        expect(minted).toEqual([
            { DriverClass: 'VoiceDriver', APIKey: 'sk-run' },
            { DriverClass: 'VoiceDriver', APIKey: 'sk-platform' },
        ]);
    });

    it('RuntimeOnly ignores the binding', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        await new ProbeAgent().Resolve(RUN_KEYS, 'RuntimeOnly');
        expect(minted).toEqual([{ DriverClass: 'VoiceDriver', APIKey: 'sk-run' }]);
    });

    it('selects a vendor keyed only by its binding', async () => {
        // UnkeyedDriver outranks BackupDriver but has no key anywhere; BackupDriver has only a binding.
        vendorRows = [vendorRow('UnkeyedDriver', 9), vendorRow('BackupDriver', 1)];
        bindVendor('BackupDriver', 'sk-bound-backup');
        const result = await new ProbeAgent().Resolve();
        expect(result?.driverClass).toBe('BackupDriver');
        expect(minted).toEqual([{ DriverClass: 'BackupDriver', APIKey: 'sk-bound-backup' }]);
    });
});

// ── The pre-resolution itself ─────────────────────────────────────────────────

describe('ResolveRealtimePlatformCredentials', () => {
    it('reads a Vendor binding once however many models the vendor serves', async () => {
        models = [realtimeModel(MODEL_ID, 5), realtimeModel(SECOND_MODEL_ID, 4)];
        vendorRows = [vendorRow('VoiceDriver', 9), vendorRow('VoiceDriver', 9, SECOND_MODEL_ID)];
        bindVendor('VoiceDriver', 'sk-bound');

        const platform = await ResolveRealtimePlatformCredentials([MODEL_ID, SECOND_MODEL_ID], USER, 'Any');

        expect(h.calls).toHaveLength(1);
        expect(platform.KeyFor(MODEL_ID, 'VoiceDriver')).toBe('sk-bound');
        expect(platform.KeyFor(SECOND_MODEL_ID, 'VoiceDriver')).toBe('sk-bound');
        expect(platform.KeyFor(MODEL_ID, 'BackupDriver')).toBeUndefined();
    });

    it('resolves a ModelVendor binding for its own row only', async () => {
        models = [realtimeModel(MODEL_ID, 5), realtimeModel(SECOND_MODEL_ID, 4)];
        vendorRows = [vendorRow('VoiceDriver', 9), vendorRow('VoiceDriver', 9, SECOND_MODEL_ID)];
        const rowID = `mv-${SECOND_MODEL_ID}-VoiceDriver`;
        h.bound.set(`mv:${rowID}`, 'sk-row');
        bindingTargets.add(`ModelVendor:${rowID}`);

        const platform = await ResolveRealtimePlatformCredentials([MODEL_ID, SECOND_MODEL_ID], USER, 'Any');

        expect(platform.KeyFor(SECOND_MODEL_ID, 'VoiceDriver')).toBe('sk-row');
        expect(platform.KeyFor(MODEL_ID, 'VoiceDriver')).toBeUndefined();
    });

    it('skips the credential store when no row, vendor or credential type could apply', async () => {
        const platform = await ResolveRealtimePlatformCredentials([MODEL_ID], USER, 'Any');
        expect(platform.Count).toBe(0);
        expect(h.calls).toEqual([]);
    });

    it('resolves nothing under RuntimeOnly', async () => {
        bindVendor('VoiceDriver', 'sk-bound');
        const platform = await ResolveRealtimePlatformCredentials([MODEL_ID], USER, 'RuntimeOnly');
        expect(platform.Count).toBe(0);
        expect(h.calls).toEqual([]);
    });
});

describe('GetRealtimeModelVoices with MJ Credentials', () => {
    it('offers a model whose only key is a bound credential', async () => {
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        // BackupDriver has no environment key, so without a binding the model is not offered.
        vendorRows = [vendorRow('BackupDriver', 9)];
        expect(await GetRealtimeModelVoices(USER)).toEqual([]);

        bindVendor('BackupDriver', 'sk-bound-backup');
        const offered = await GetRealtimeModelVoices(USER);
        expect(offered.map(m => m.ModelID)).toEqual([MODEL_ID]);
        expect(minted.at(-1)).toEqual({ DriverClass: 'BackupDriver', APIKey: 'sk-bound-backup' });
    });
});
