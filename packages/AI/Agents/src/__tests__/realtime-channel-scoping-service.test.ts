/**
 * Channel scoping + client-tool tiers in {@link RealtimeClientSessionService} (the server half of
 * Realtime Channels v2): candidates → policy, narrowed tools, the app tool tier in the prompt, and the
 * raw-`AgentSettings` read that lets a new settings field work before CodeGen refreshes the generated copy.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    BaseRealtimeModel,
    ClientRealtimeSessionConfig,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolDefinition,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
    AppContextSnapshot,
    ClientToolMetadata,
    IAgentSettings,
    RealtimeChannelCandidate,
} from '@memberjunction/ai-core-plus';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    RealtimeModelResolution,
    CoAgentSystemPromptResolution,
} from '../realtime/realtime-client-session-service';
import type { RealtimeChannelRegistryRow } from '../realtime/realtime-channel-policy';

class MockModel extends BaseRealtimeModel {
    public LastParams: RealtimeSessionParams | null = null;
    constructor() {
        super('mock-key');
    }
    public override get SupportsClientDirect(): boolean {
        return true;
    }
    async StartSession(): Promise<IRealtimeSession> {
        throw new Error('not used');
    }
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        this.LastParams = params;
        return { Provider: 'mock', Model: params.Model, EphemeralToken: 't', ExpiresAt: '2099-01-01T00:00:00Z', SessionConfig: {} };
    }
}

class ScopingService extends RealtimeClientSessionService {
    public Model = new MockModel();
    public Settings: IAgentSettings | null = null;
    public Registry: RealtimeChannelRegistryRow[] = [];
    public Tiers: { App?: ClientToolMetadata[]; Static?: ClientToolMetadata[] } | null = null;

    protected override async configureEngine(): Promise<void> {}
    protected override async resolveRealtimeModel(): Promise<RealtimeModelResolution | null> {
        return { Model: this.Model, ModelID: 'm1', VendorID: 'v1', APIName: 'mock' };
    }
    protected override getCoAgentSystemPromptText(): string {
        return 'CO-AGENT PROMPT';
    }
    protected override resolveCoAgentSystemPrompt(): CoAgentSystemPromptResolution {
        return { Text: 'CO-AGENT PROMPT', PromptID: 'p1' };
    }
    protected override async createCoAgentObservabilityRun(): Promise<null> {
        return null;
    }
    protected override resolveTargetAgent(id: string): MJAIAgentEntityExtended | null {
        return { ID: id, Name: 'Sales Agent', Description: 'd' } as unknown as MJAIAgentEntityExtended;
    }
    protected override readChannelRegistry(): RealtimeChannelRegistryRow[] {
        return this.Registry;
    }
    protected override async loadAppAgentSettings(): Promise<IAgentSettings | null> {
        return this.Settings;
    }
    protected override async resolveSessionClientToolTiers(applicationId: string | undefined, targetAgentId: string, contextUser: UserInfo) {
        return this.Tiers ?? super.resolveSessionClientToolTiers(applicationId, targetAgentId, contextUser);
    }
    public ExposeResolveAppRealtimeOverrides(appId: string | undefined): Promise<string | null> {
        return this.resolveAppRealtimeOverrides(appId, user, provider);
    }
    public ExposeBuildAppContextSection(ctx?: AppContextSnapshot): string {
        return this.buildAppContextSection(ctx);
    }
}

const user = { ID: 'user-1', Email: 'u@example.com' } as unknown as UserInfo;
const provider = {} as unknown as IMetadataProvider;

const tool = (Name: string): RealtimeToolDefinition => ({ Name, Description: `${Name} tool`, ParametersSchema: { type: 'object' } });
const meta = (Name: string, Description = `${Name} does a thing`): ClientToolMetadata => ({ Name, Description, InputSchema: {} });

function candidate(key: string, overrides: Partial<RealtimeChannelCandidate> = {}): RealtimeChannelCandidate {
    return { Key: key, DefaultAvailability: 'all-sessions', DisplayPolicy: 'open-on-start', MaxExposure: 'state', ToolNamePrefix: `${key}_`, Tools: [tool(`${key}_Do`)], ...overrides };
}

function input(overrides: Partial<PrepareClientSessionInput> = {}): PrepareClientSessionInput {
    return {
        CoAgent: { ID: 'co-1', Name: 'Realtime Co-Agent', InjectNotes: false, InjectExamples: false } as unknown as MJAIAgentEntityExtended,
        TargetAgentID: 'target-1',
        AgentSessionID: 'session-1',
        ...overrides,
    };
}

function snapshot(tools?: ClientToolMetadata[]): AppContextSnapshot {
    return {
        App: { Name: 'Data Explorer', Description: '' },
        ActiveNavItem: { Name: 'Home' },
        OtherNavItems: [],
        User: { Name: 'Ada', Roles: [] },
        Capabilities: tools ? { Tools: tools } : undefined,
    };
}

afterEach(() => vi.restoreAllMocks());

describe('PrepareClientSession — channel scoping', () => {
    it('without candidates the declared tools are used exactly as sent and no policy is returned', async () => {
        const svc = new ScopingService();
        svc.Tiers = {};
        const result = await svc.PrepareClientSession(input({ ExtraTools: [tool('Whiteboard_Do')] }), user, provider);
        expect(result.Success).toBe(true);
        expect(result.ClientPolicy).toBeUndefined();
        expect(svc.Model.LastParams?.Tools?.map((t) => t.Name)).toContain('Whiteboard_Do');
    });

    it('scopes candidates against the registry and returns the policy; vetoed channels\' tools never reach the model', async () => {
        const svc = new ScopingService();
        svc.Tiers = {};
        svc.Registry = [{ Name: 'Whiteboard', IsActive: true }, { Name: 'RemoteBrowser', IsActive: false }];
        const result = await svc.PrepareClientSession(
            input({
                ChannelCandidates: [candidate('Whiteboard'), candidate('RemoteBrowser')],
                ExtraTools: [tool('Whiteboard_Do'), tool('RemoteBrowser_Do')],
            }),
            user,
            provider,
        );
        expect(result.ClientPolicy?.Channels.map((c) => c.Key)).toEqual(['Whiteboard']);
        expect(result.ClientPolicy?.ExcludedChannels).toEqual([{ Key: 'RemoteBrowser', Reason: 'inactive-registry-row' }]);
        const names = svc.Model.LastParams?.Tools?.map((t) => t.Name) ?? [];
        expect(names).toContain('Whiteboard_Do');
        expect(names).not.toContain('RemoteBrowser_Do');
        // The interactive-surface framing is built from the SCOPED tools too.
        expect(svc.Model.LastParams?.SystemPrompt).toContain('interactive-surface');
    });

    it('reads the agent/app channel configuration from the effective cascade (include opts a channel in)', async () => {
        const svc = new ScopingService();
        svc.Tiers = {};
        svc.Registry = [{ Name: 'Form', IsActive: true }];
        const result = await svc.PrepareClientSession(
            input({
                ChannelCandidates: [candidate('Form', { DefaultAvailability: 'opt-in' })],
                ConfigOverridesJson: JSON.stringify({ realtime: { channels: { include: ['Form'], displayPolicy: { Form: 'on-demand' } } } }),
            }),
            user,
            provider,
        );
        expect(result.ClientPolicy?.Channels[0]).toMatchObject({ Key: 'Form', DisplayPolicy: 'on-demand', Source: 'config' });
        expect(svc.Model.LastParams?.Tools?.map((t) => t.Name)).not.toContain('Form_Do'); // on-demand: no native tools
    });

    it('returns the app/static client-tool tiers inside the policy', async () => {
        const svc = new ScopingService();
        svc.Tiers = { App: [meta('AppTool')], Static: [meta('StaticTool')] };
        svc.Registry = [{ Name: 'Whiteboard', IsActive: true }];
        const result = await svc.PrepareClientSession(input({ ChannelCandidates: [candidate('Whiteboard')] }), user, provider);
        expect(result.ClientPolicy?.ClientTools).toEqual({ App: [meta('AppTool')], Static: [meta('StaticTool')] });
    });
});

describe('PrepareClientSession — exposure policy (agent cap and zero data retention)', () => {
    const wb = (): RealtimeChannelCandidate => candidate('Whiteboard', { MaxExposure: 'pixels' });
    const config = (channels: object): string => JSON.stringify({ realtime: { channels } });

    async function prepare(channels: object | null, model: { Privacy?: { ZeroDataRetention?: boolean } } | null | 'throws') {
        const svc = new ScopingService();
        svc.Tiers = {};
        svc.Registry = [{ Name: 'Whiteboard', IsActive: true }];
        const spy = vi.spyOn(AIEngine.Instance, 'GetEffectiveModelConfiguration').mockReturnValue(model === 'throws' ? null : model);
        if (model === 'throws') {
            // Only the zero-data-retention lookup (the first call, made while scoping) fails; the later
            // session-bag lookup is unrelated and must keep working.
            spy.mockImplementationOnce(() => {
                throw new Error('catalog unavailable');
            });
        }
        const result = await svc.PrepareClientSession(
            input({ ChannelCandidates: [wb()], ConfigOverridesJson: channels ? config(channels) : undefined }),
            user,
            provider,
        );
        return result.ClientPolicy?.Channels[0];
    }

    it('with no exposure configuration the server exposure is the channel ceiling', async () => {
        const channel = await prepare(null, null);
        expect(channel).toMatchObject({ MaxExposure: 'pixels', Exposure: 'pixels' });
        expect(channel?.ExposureLimits).toBeUndefined();
    });

    it("the agent's channels.config.<Key>.maxExposure lowers what rides in the policy", async () => {
        const channel = await prepare({ config: { Whiteboard: { maxExposure: 'state' } } }, null);
        expect(channel?.Exposure).toBe('state');
        expect(channel?.ExposureLimits?.[0]).toMatchObject({ Source: 'agent', Level: 'state' });
    });

    it('DOWNGRADES pixels to state when the agent requires zero data retention and the model does not declare it', async () => {
        const channel = await prepare({ requireZeroDataRetentionFor: ['pixels'] }, { Privacy: { ZeroDataRetention: false } });
        expect(channel?.Exposure).toBe('state');
        expect(channel?.ExposureLimits?.[0].Source).toBe('zero-data-retention');
        expect(channel?.ExposureLimits?.[0].Reason).toMatch(/zero-data-retention model/);
    });

    it('does NOT downgrade when the model declares Privacy.ZeroDataRetention: true', async () => {
        const channel = await prepare({ requireZeroDataRetentionFor: ['pixels'] }, { Privacy: { ZeroDataRetention: true } });
        expect(channel?.Exposure).toBe('pixels');
    });

    it('fails CLOSED: a model whose catalog row cannot be read counts as not declaring zero data retention', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const channel = await prepare({ requireZeroDataRetentionFor: ['pixels'] }, 'throws');
        expect(channel?.Exposure).toBe('state');
        logged.mockRestore();
    });

    it('an agent with no requirement is unaffected by a model that lacks zero data retention', async () => {
        const channel = await prepare({ include: ['Whiteboard'] }, null);
        expect(channel?.Exposure).toBe('pixels');
    });
});

describe('PrepareClientSession — the app client-tool tier', () => {
    it('layers the app\'s tools beneath the surface manifest, through the unified resolver, in the prompt', async () => {
        const svc = new ScopingService();
        svc.Tiers = { App: [meta('AppOnly', 'App level tool'), meta('Shared', 'app version')], Static: [meta('StaticOnly', 'Static level tool')] };
        const ctx = snapshot([meta('Shared', 'surface version'), meta('SurfaceOnly', 'Surface tool')]);
        const result = await svc.PrepareClientSession(input({ AppContext: ctx }), user, provider);
        const prompt = result.SessionParams?.SystemPrompt ?? '';
        expect(prompt).toContain('AppOnly');
        expect(prompt).toContain('SurfaceOnly');
        expect(prompt).toContain('surface version'); // the surface wins a name collision
        expect(prompt).not.toContain('app version');
        expect(prompt).not.toContain('StaticOnly'); // the agent's static tools stay out of the voice prompt
    });

    it('leaves the snapshot untouched when the surface already covers every app tool', async () => {
        const svc = new ScopingService();
        svc.Tiers = { App: [meta('Covered')] };
        const ctx = snapshot([meta('Covered')]);
        const scoped = await svc['scopeSessionInput'](input({ AppContext: ctx }), {}, user, provider);
        expect(scoped.Input.AppContext).toBe(ctx);
    });

    it('adds app tools when the surface published none, and does nothing without a snapshot', async () => {
        const svc = new ScopingService();
        svc.Tiers = { App: [meta('AppOnly')] };
        const withTools = await svc['scopeSessionInput'](input({ AppContext: snapshot() }), {}, user, provider);
        expect(withTools.Input.AppContext?.Capabilities?.Tools?.map((t) => t.Name)).toEqual(['AppOnly']);
        const none = await svc['scopeSessionInput'](input(), {}, user, provider);
        expect(none.Input.AppContext).toBeUndefined();
    });
});

describe('Application.AgentSettings is read from the RAW column', () => {
    it('resolveAppRealtimeOverrides maps Realtime.Channels and RelevantAgents from the parsed settings', async () => {
        const svc = new ScopingService();
        svc.Settings = {
            RelevantAgents: [{ AgentID: 'agent-9', Label: 'Skip', Disclosure: 'silent' }],
            Realtime: { Disclosure: 'mention', Channels: { Exclude: ['Media'], Include: ['Form'] } },
        };
        const json = await svc.ExposeResolveAppRealtimeOverrides('app-1');
        expect(JSON.parse(json ?? '{}')).toEqual({
            realtime: {
                disclosure: 'mention',
                allowedAgents: [{ agentId: 'agent-9', label: 'Skip', disclosure: 'silent' }],
                channels: { include: ['Form'], exclude: ['Media'] },
            },
        });
    });

    it('is null when the app has no usable settings', async () => {
        const svc = new ScopingService();
        svc.Settings = null;
        expect(await svc.ExposeResolveAppRealtimeOverrides('app-1')).toBeNull();
    });
});

describe('resolveSessionClientToolTiers (real implementation)', () => {
    class TiersService extends ScopingService {
        protected override async resolveSessionClientToolTiers(applicationId: string | undefined, targetAgentId: string, contextUser: UserInfo) {
            return RealtimeClientSessionService.prototype['resolveSessionClientToolTiers'].call(this, applicationId, targetAgentId, contextUser);
        }
        public Tiers2(appId: string | undefined, target: string) {
            return this.resolveSessionClientToolTiers(appId, target, user);
        }
    }

    function stubEngine(definitions: object[], staticTools: object[]): void {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            ClientToolDefinitions: definitions,
            GetClientToolsForAgent: () => staticTools,
        } as unknown as AIEngine);
    }

    const def = (ID: string, Name: string, extra: object = {}) => ({ ID, Name, Description: `${Name} desc`, InputSchemaJSON: null, OutputSchemaJSON: null, Category: null, DefaultTimeoutMs: null, ...extra });

    it('resolves the app tier from AgentSettings.ClientTools (ID then Name, by priority) and the static tier from the agent junction', async () => {
        const svc = new TiersService();
        svc.Settings = {
            ClientTools: [
                { Name: 'Second', Priority: 2 },
                { ClientToolDefinitionID: 'def-1', Priority: 1 },
                { Name: 'Missing' },
            ],
        };
        stubEngine([def('def-1', 'First', { InputSchemaJSON: '{"type":"object"}' }), def('def-2', 'Second')], [def('def-3', 'FromAgent')]);
        const log = vi.spyOn(await import('@memberjunction/core'), 'LogStatus').mockImplementation(() => undefined);
        const tiers = await svc.Tiers2('app-1', 'target-1');
        expect(tiers.App?.map((t) => t.Name)).toEqual(['First', 'Second']);
        expect(tiers.App?.[0].InputSchema).toEqual({ type: 'object' });
        expect(tiers.Static?.map((t) => t.Name)).toEqual(['FromAgent']);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("'Missing' matches no tool definition"));
    });

    it('yields empty tiers (never throws) when the engine is unavailable', async () => {
        const svc = new TiersService();
        vi.spyOn(AIEngine, 'Instance', 'get').mockImplementation(() => {
            throw new Error('engine not loaded');
        });
        vi.spyOn(await import('@memberjunction/core'), 'LogError').mockImplementation(() => undefined);
        expect(await svc.Tiers2('app-1', 'target-1')).toEqual({});
    });
});
