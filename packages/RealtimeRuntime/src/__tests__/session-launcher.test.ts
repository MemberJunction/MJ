import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ClientRealtimeSessionConfig, RealtimeTrackDescriptor } from '@memberjunction/ai';
import type { RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    DefaultRealtimeSessionLauncher,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type IRealtimeSessionLauncher,
    type RealtimeSessionLaunchContext,
    type RealtimeSessionLaunchRequest,
    type StartRealtimeClientSessionResult,
} from '../index';
import { LegacyEchoChannel } from './channel-test-helpers';

@RegisterClass(BaseRealtimeChannelClient, 'LauncherEchoChannel')
class LauncherEcho extends LegacyEchoChannel {}

/** A channel that shows the agent's video: it sinks outbound video, as the Avatar channel does. */
@RegisterClass(BaseRealtimeChannelClient, 'LauncherAvatarChannel')
class LauncherAvatar extends LegacyEchoChannel {
    public override get ChannelName(): string {
        return 'Avatar';
    }
    public override get ToolNamePrefix(): string {
        return 'Avatar_';
    }
    public override GetToolDefinitions(): [] {
        return [];
    }
    public override GetSunkTracks(): readonly RealtimeTrackDescriptor[] {
        return [{ Modality: 'video', Direction: 'outbound' }];
    }
}

@RegisterClass(BaseRealtimeClient, 'launcher-fake-provider')
class LauncherFakeClient extends BaseRealtimeClient {
    public async Connect(): Promise<void> {
        this.emitStateChange('listening');
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

/** A client driver that records the config it was asked to connect with. */
@RegisterClass(BaseRealtimeClient, 'launcher-relay-provider')
class RecordingRelayClient extends BaseRealtimeClient {
    public static readonly Configs: ClientRealtimeSessionConfig[] = [];
    public async Connect(config: ClientRealtimeSessionConfig): Promise<void> {
        RecordingRelayClient.Configs.push(config);
        this.emitStateChange('listening');
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

const RELAY_TICKET = '9e8d7c6b-1111-4222-8333-944455556666';
const RELAY_URL = `wss://mjapi.example.test/realtime/relay/${RELAY_TICKET}`;

/** A relay session as the server mints it: no token, the transport and the relay URL. */
const RELAY_MINT: Partial<StartRealtimeClientSessionResult> = { EphemeralToken: '', Transport: 'relay', RelayUrl: RELAY_URL };

class Host implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

function mintResult(overrides: Partial<StartRealtimeClientSessionResult> = {}): StartRealtimeClientSessionResult {
    return {
        AgentSessionId: 'session-1',
        ConversationId: 'conv-1',
        Provider: 'launcher-fake-provider',
        Model: 'm',
        EphemeralToken: 't',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Fake',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
        ...overrides,
    };
}

interface GqlCall {
    query: string;
    variables: Record<string, unknown>;
}

/** A GraphQL provider that answers the stock mint and records every call. */
class MintProvider {
    public readonly sessionId = 'transport-1';
    public Calls: GqlCall[] = [];
    public RejectChannelScoping = false;
    public RejectAvatarStatus = false;
    /** A server that predates the transport fields: it rejects `Transport` (the first one a validator meets). */
    public RejectTransport = false;
    /** Which rejection a server that predates both names first (a validation error carries one message). */
    public AvatarRejectionFirst = false;
    /** A server that predates the `showsAgentVideo` argument. */
    public RejectAgentVideo = false;
    /** What the mint returns, over the defaults. */
    public MintOverrides: Partial<StartRealtimeClientSessionResult> = {};
    public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }];
    public async ExecuteGQL(query: string, variables: Record<string, unknown>): Promise<unknown> {
        this.Calls.push({ query, variables });
        if (query.includes('mutation StartRealtimeClientSession')) {
            const rejections = [
                this.RejectChannelScoping && query.includes('channelCandidatesJson')
                    ? 'Unknown argument "channelCandidatesJson" on field "Mutation.StartRealtimeClientSession".'
                    : null,
                this.RejectAvatarStatus && query.includes('AvatarStatusJson')
                    ? 'Cannot query field "AvatarStatusJson" on type "StartRealtimeClientSessionResult".'
                    : null,
                this.RejectTransport && query.includes('RelayUrl')
                    ? 'Cannot query field "Transport" on type "StartRealtimeClientSessionResult".'
                    : null,
                this.RejectAgentVideo && query.includes('showsAgentVideo')
                    ? 'Unknown argument "showsAgentVideo" on field "Mutation.StartRealtimeClientSession".'
                    : null,
            ].filter((message): message is string => message !== null);
            if (rejections.length > 0) {
                throw new Error(this.AvatarRejectionFirst ? rejections[rejections.length - 1] : rejections[0]);
            }
            return { StartRealtimeClientSession: mintResult(this.MintOverrides) };
        }
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
    public mints(): GqlCall[] {
        return this.Calls.filter((c) => c.query.includes('mutation StartRealtimeClientSession'));
    }
}

function request(overrides: Partial<RealtimeSessionLaunchRequest> = {}): RealtimeSessionLaunchRequest {
    return {
        TargetAgentId: 'agent-1',
        ConversationId: null,
        LastSessionId: null,
        PreferredModelId: null,
        ClientTools: [],
        CoAgentId: null,
        ConfigOverridesJson: null,
        RecordingConsent: false,
        RecordingStartedAt: null,
        MediaCollectionId: null,
        ApplicationId: null,
        AppContext: null,
        ChannelCandidatesJson: null,
        ...overrides,
    };
}

const ECHO_ROW = { ID: 'c1', Name: 'Echo', ClientPluginClass: 'LauncherEchoChannel', IsActive: true };

function stubRegistry(rows: Array<Record<string, unknown>> = [ECHO_ROW]): void {
    vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
        Config: async () => undefined,
        AgentChannels: rows,
    } as unknown as AIEngineBase);
}

function build(provider: MintProvider = new MintProvider()) {
    const runtime = new RealtimeSessionRuntime(new Host());
    runtime.Provider = provider as unknown as IMetadataProvider;
    return { runtime, provider };
}

async function start(runtime: RealtimeSessionRuntime): Promise<void> {
    await runtime.StartRealtimeSession('agent-1', 'conv-9', null, 'Sage', null, [{ Name: 'Host_Tool', Description: 'd', ParametersSchema: { type: 'object' } }], null, null, true, null, 'app-1');
}

describe('DefaultRealtimeSessionLauncher', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('mints through the stock mutation with every request field mapped to its variable', async () => {
        const provider = new MintProvider();
        const result = await new DefaultRealtimeSessionLauncher().Launch(
            request({
                ConversationId: 'conv-1',
                LastSessionId: 'prior',
                PreferredModelId: 'model-1',
                ClientTools: [{ Name: 'T', Description: 'd', ParametersSchema: { type: 'object' } }],
                CoAgentId: 'co',
                ConfigOverridesJson: '{"a":1}',
                RecordingConsent: true,
                RecordingStartedAt: '2030-01-01T00:00:00Z',
                MediaCollectionId: 'kit',
                ApplicationId: 'app',
                AppContext: { Route: '/x' } as never,
            }),
            { Provider: provider as unknown as IMetadataProvider }
        );
        expect(result.EphemeralToken).toBe('t');
        const [mint] = provider.mints();
        expect(mint.variables).toMatchObject({
            targetAgentId: 'agent-1',
            conversationId: 'conv-1',
            lastSessionId: 'prior',
            preferredModelId: 'model-1',
            coAgentId: 'co',
            configOverridesJson: '{"a":1}',
            recordingConsent: true,
            recordingStartedAt: '2030-01-01T00:00:00Z',
            mediaCollectionId: 'kit',
            applicationId: 'app',
        });
        expect(JSON.parse(String(mint.variables['clientToolsJson']))).toHaveLength(1);
        expect(JSON.parse(String(mint.variables['appContextJson']))).toEqual({ Route: '/x' });
    });

    it('sends null — never an empty array — when there are no client tools', async () => {
        const provider = new MintProvider();
        await new DefaultRealtimeSessionLauncher().Launch(request(), { Provider: provider as unknown as IMetadataProvider });
        expect(provider.mints()[0].variables['clientToolsJson']).toBeNull();
    });

    it('uses the channel-scoping mutation only when there are candidates', async () => {
        const provider = new MintProvider();
        const launcher = new DefaultRealtimeSessionLauncher();
        const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
        await launcher.Launch(request(), context);
        await launcher.Launch(request({ ChannelCandidatesJson: '[{"Key":"Echo"}]' }), context);
        const [plain, scoped] = provider.mints();
        expect(plain.query).not.toContain('channelCandidatesJson');
        expect(scoped.query).toContain('$channelCandidatesJson');
        expect(scoped.query).toContain('ClientPolicyJson');
        expect(scoped.variables['channelCandidatesJson']).toBe('[{"Key":"Echo"}]');
    });

    it('retries without channel scoping against a server that predates it, and remembers', async () => {
        const provider = new MintProvider();
        provider.RejectChannelScoping = true;
        const launcher = new DefaultRealtimeSessionLauncher();
        const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
        await launcher.Launch(request({ ChannelCandidatesJson: '[]' }), context);
        expect(provider.mints()).toHaveLength(2); // rejected, then the plain mutation
        await launcher.Launch(request({ ChannelCandidatesJson: '[]' }), context);
        expect(provider.mints()).toHaveLength(3); // asked once; the second mint went straight to the plain mutation
    });

    it('asks for the avatar status in every mint, with or without channel scoping', async () => {
        const provider = new MintProvider();
        const launcher = new DefaultRealtimeSessionLauncher();
        const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
        await launcher.Launch(request(), context);
        await launcher.Launch(request({ ChannelCandidatesJson: '[]' }), context);
        const [plain, scoped] = provider.mints();
        expect(plain.query).toContain('AvatarStatusJson');
        expect(plain.query).not.toContain('ClientPolicyJson');
        expect(scoped.query).toContain('AvatarStatusJson');
        expect(scoped.query).toContain('ClientPolicyJson');
    });

    it('drops only the avatar status for a server that predates it, keeping channel scoping, and remembers', async () => {
        const provider = new MintProvider();
        provider.RejectAvatarStatus = true;
        const launcher = new DefaultRealtimeSessionLauncher();
        const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
        const result = await launcher.Launch(request({ ChannelCandidatesJson: '[{"Key":"Echo"}]' }), context);
        expect(result.EphemeralToken).toBe('t');
        const [rejected, retried] = provider.mints();
        expect(rejected.query).toContain('AvatarStatusJson');
        expect(retried.query).not.toContain('AvatarStatusJson');
        expect(retried.query).toContain('$channelCandidatesJson');
        expect(retried.query).toContain('ClientPolicyJson');
        expect(retried.variables['channelCandidatesJson']).toBe('[{"Key":"Echo"}]');

        await launcher.Launch(request({ ChannelCandidatesJson: '[]' }), context);
        expect(provider.mints()).toHaveLength(3); // asked once; the next mint went straight to the mutation without it
        expect(provider.mints()[2].query).not.toContain('AvatarStatusJson');
        expect(provider.mints()[2].query).toContain('$channelCandidatesJson');
    });

    it('keeps the avatar status when only channel scoping falls back', async () => {
        const provider = new MintProvider();
        provider.RejectChannelScoping = true;
        await new DefaultRealtimeSessionLauncher().Launch(request({ ChannelCandidatesJson: '[]' }), { Provider: provider as unknown as IMetadataProvider });
        const [, retried] = provider.mints();
        expect(retried.query).not.toContain('channelCandidatesJson');
        expect(retried.query).toContain('AvatarStatusJson');
    });

    it.each([false, true])('drops both, one at a time, for a server that predates both (avatar named first: %s)', async (avatarFirst) => {
        const provider = new MintProvider();
        provider.RejectChannelScoping = true;
        provider.RejectAvatarStatus = true;
        provider.AvatarRejectionFirst = avatarFirst;
        const launcher = new DefaultRealtimeSessionLauncher();
        const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
        const result = await launcher.Launch(request({ ChannelCandidatesJson: '[]' }), context);
        expect(result.EphemeralToken).toBe('t');
        expect(provider.mints()).toHaveLength(3);
        const last = provider.mints()[2].query;
        expect(last).not.toContain('channelCandidatesJson');
        expect(last).not.toContain('AvatarStatusJson');

        await launcher.Launch(request({ ChannelCandidatesJson: '[]' }), context);
        expect(provider.mints()).toHaveLength(4);
    });

    it('surfaces a failure that keeps naming an extension it already dropped, instead of retrying forever', async () => {
        const provider = new MintProvider();
        provider.ExecuteGQL = async (query: string, variables: Record<string, unknown>) => {
            provider.Calls.push({ query, variables });
            throw new Error('Cannot query field "AvatarStatusJson" on type "StartRealtimeClientSessionResult".');
        };
        await expect(new DefaultRealtimeSessionLauncher().Launch(request(), { Provider: provider as unknown as IMetadataProvider })).rejects.toThrow('AvatarStatusJson');
        expect(provider.mints()).toHaveLength(2);
    });

    it('surfaces any other mint failure instead of swallowing it', async () => {
        const provider = new MintProvider();
        provider.ExecuteGQL = async () => {
            throw new Error('Not authorized');
        };
        await expect(new DefaultRealtimeSessionLauncher().Launch(request({ ChannelCandidatesJson: '[]' }), { Provider: provider as unknown as IMetadataProvider })).rejects.toThrow('Not authorized');
    });

    it('rejects a mint that carries no ephemeral token', async () => {
        const provider = new MintProvider();
        provider.ExecuteGQL = async () => ({ StartRealtimeClientSession: mintResult({ EphemeralToken: '' }) });
        await expect(new DefaultRealtimeSessionLauncher().Launch(request(), { Provider: provider as unknown as IMetadataProvider })).rejects.toThrow('no ephemeral token');
    });

    describe('an app that shows no agent video', () => {
        it('says so (showsAgentVideo: false) only when the request does, so a host that may show it mints as before', async () => {
            const provider = new MintProvider();
            const launcher = new DefaultRealtimeSessionLauncher();
            const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
            await launcher.Launch(request({ ShowsAgentVideo: false }), context);
            await launcher.Launch(request({ ShowsAgentVideo: true }), context);
            await launcher.Launch(request(), context);
            const [none, shows, unstated] = provider.mints();
            expect(none.query).toContain('$showsAgentVideo: Boolean');
            expect(none.query).toContain('showsAgentVideo: $showsAgentVideo');
            expect(none.variables['showsAgentVideo']).toBe(false);
            for (const mint of [shows, unstated]) {
                expect(mint.query).not.toContain('showsAgentVideo');
                expect('showsAgentVideo' in mint.variables).toBe(false);
            }
        });

        it('drops only showsAgentVideo for a server that predates it, keeping the other extensions, and remembers', async () => {
            const provider = new MintProvider();
            provider.RejectAgentVideo = true;
            const launcher = new DefaultRealtimeSessionLauncher();
            const context: RealtimeSessionLaunchContext = { Provider: provider as unknown as IMetadataProvider };
            const result = await launcher.Launch(request({ ShowsAgentVideo: false, ChannelCandidatesJson: '[]' }), context);
            expect(result.EphemeralToken).toBe('t');
            const [rejected, retried] = provider.mints();
            expect(rejected.query).toContain('showsAgentVideo');
            expect(retried.query).not.toContain('showsAgentVideo');
            expect('showsAgentVideo' in retried.variables).toBe(false);
            expect(retried.query).toContain('$channelCandidatesJson');
            expect(retried.query).toContain('AvatarStatusJson');
            expect(retried.query).toContain('RelayUrl');
            expect(vi.mocked(console.warn).mock.calls.map((call) => String(call[0]))).toContain(
                "[RealtimeSession] The server does not take showsAgentVideo — minting without it; it may ask for an avatar this app can't show (the call stays audio only)."
            );

            await launcher.Launch(request({ ShowsAgentVideo: false }), context);
            expect(provider.mints()).toHaveLength(3); // asked once; the next mint went straight to the mutation without it
            expect(provider.mints()[2].query).not.toContain('showsAgentVideo');
        });
    });

    describe('the relay transport', () => {
        const launch = (provider: MintProvider, launcher = new DefaultRealtimeSessionLauncher()) =>
            launcher.Launch(request(), { Provider: provider as unknown as IMetadataProvider });

        it('asks for the transport and the relay URL in every mint', async () => {
            const provider = new MintProvider();
            await launch(provider);
            const [mint] = provider.mints();
            expect(mint.query).toMatch(/\n\s+Transport\n\s+RelayUrl\n/);
        });

        it('returns a relay session that carries a relay URL and no token', async () => {
            const provider = new MintProvider();
            provider.MintOverrides = RELAY_MINT;
            const result = await launch(provider);
            expect(result).toMatchObject({ EphemeralToken: '', Transport: 'relay', RelayUrl: RELAY_URL });
        });

        it('rejects a mint with no token unless it is a relay session with a relay URL', async () => {
            const cases: Array<Partial<StartRealtimeClientSessionResult>> = [
                { EphemeralToken: '', Transport: 'relay', RelayUrl: null },
                { EphemeralToken: '', Transport: null, RelayUrl: RELAY_URL },
                { EphemeralToken: '', Transport: 'direct', RelayUrl: RELAY_URL },
                { EphemeralToken: '', Transport: 'Relay', RelayUrl: RELAY_URL },
            ];
            for (const overrides of cases) {
                const provider = new MintProvider();
                provider.MintOverrides = overrides;
                await expect(launch(provider), JSON.stringify(overrides)).rejects.toThrow('no ephemeral token');
            }
        });

        it('drops only the transport fields for a server that predates them, keeping the other extensions, and remembers', async () => {
            const provider = new MintProvider();
            provider.RejectTransport = true;
            const launcher = new DefaultRealtimeSessionLauncher();
            const result = await launch(provider, launcher);
            expect(result.EphemeralToken).toBe('t');
            const [rejected, retried] = provider.mints();
            expect(rejected.query).toContain('RelayUrl');
            expect(retried.query).not.toContain('RelayUrl');
            expect(retried.query).not.toMatch(/\n\s+Transport\n/);
            expect(retried.query).toContain('AvatarStatusJson');
            expect(vi.mocked(console.warn).mock.calls.map((call) => String(call[0]))).toContain(
                '[RealtimeSession] The server does not report the session transport — minting without it; every session connects directly.'
            );

            await launch(provider, launcher);
            expect(provider.mints()).toHaveLength(3); // asked once; the next mint went straight to the mutation without them
            expect(provider.mints()[2].query).not.toContain('RelayUrl');
        });

        it('surfaces a failure that merely mentions a transport, rather than reading it as a server without the fields', async () => {
            const provider = new MintProvider();
            provider.ExecuteGQL = async (query: string, variables: Record<string, unknown>) => {
                provider.Calls.push({ query, variables });
                throw new Error('Transport error: the connection to MJAPI was reset');
            };
            await expect(launch(provider)).rejects.toThrow('Transport error');
            expect(provider.mints()).toHaveLength(1);
        });
    });
});

describe('RealtimeSessionRuntime.Launcher', () => {
    beforeEach(() => {
        stubRegistry();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('defaults to the stock launcher, and a default session mints exactly as it always did', async () => {
        const { runtime, provider } = build();
        expect(runtime.Launcher).toBeInstanceOf(DefaultRealtimeSessionLauncher);
        await start(runtime);
        const [mint] = provider.mints();
        expect(mint.variables).toMatchObject({ targetAgentId: 'agent-1', conversationId: 'conv-9', applicationId: 'app-1', recordingConsent: true });
        expect(mint.query).toContain('$channelCandidatesJson'); // Phase 1's channel candidates still ride the default mint
        const candidates = JSON.parse(String(mint.variables['channelCandidatesJson'])) as Array<{ Key: string }>;
        expect(candidates.map((c) => c.Key)).toEqual(['Echo']);
        const tools = JSON.parse(String(mint.variables['clientToolsJson'])) as Array<{ Name: string }>;
        expect(tools.map((t) => t.Name)).toEqual(['Host_Tool', 'Echo_Say']); // host tools, then the in-scope channel's native tools
        expect(runtime.IsActive).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('mints through a custom launcher INSTEAD of the stock mutation, with the resolved request', async () => {
        const { runtime, provider } = build();
        const seen: Array<{ request: RealtimeSessionLaunchRequest; context: RealtimeSessionLaunchContext }> = [];
        const launcher: IRealtimeSessionLauncher = {
            Launch: async (req, context) => {
                seen.push({ request: req, context });
                return mintResult();
            },
        };
        runtime.Launcher = launcher;
        await start(runtime);

        expect(provider.mints()).toHaveLength(0); // no Proxy, no stock mutation
        expect(runtime.IsActive).toBe(true);
        expect(runtime.CurrentAgentSessionId).toBe('session-1');
        const { request: req, context } = seen[0];
        expect(req).toMatchObject({ TargetAgentId: 'agent-1', ConversationId: 'conv-9', ApplicationId: 'app-1', RecordingConsent: true });
        expect(req.ClientTools.map((t) => t.Name)).toEqual(['Host_Tool', 'Echo_Say']);
        expect(JSON.parse(String(req.ChannelCandidatesJson))[0].Key).toBe('Echo');
        expect(context.Provider).toBe(provider);
        await runtime.EndRealtimeSession();
    });

    it("applies the policy a custom launcher's mint returns", async () => {
        const { runtime } = build();
        const policy: RealtimeSessionClientPolicy = { Version: 1, Channels: [] }; // a server that puts NO channel in this session
        runtime.Launcher = { Launch: async () => mintResult({ ClientPolicyJson: JSON.stringify(policy) }) };
        await start(runtime);
        expect(runtime.ActiveChannels).toHaveLength(0);
        await runtime.EndRealtimeSession();
    });

    it('fails the start, keeping the error, when the launcher throws', async () => {
        const { runtime } = build();
        runtime.Launcher = {
            Launch: async () => {
                throw new Error('guest exchange refused');
            },
        };
        await start(runtime);
        expect(runtime.IsActive).toBe(false);
        expect(runtime.LastStartError?.message).toContain('guest exchange refused');
    });

    it('fails the start when a launcher returns no ephemeral token', async () => {
        const { runtime } = build();
        runtime.Launcher = { Launch: async () => mintResult({ EphemeralToken: '' }) };
        await start(runtime);
        expect(runtime.IsActive).toBe(false);
        expect(runtime.LastStartError?.message).toContain('no ephemeral token');
    });

    it("hands a relay session's transport and relay URL to the client driver, and logs neither", async () => {
        const { runtime } = build();
        const logged = (['log', 'info', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
        RecordingRelayClient.Configs.length = 0;
        runtime.Launcher = { Launch: async () => mintResult({ ...RELAY_MINT, Provider: 'launcher-relay-provider' }) };
        await start(runtime);

        expect(runtime.IsActive).toBe(true);
        expect(RecordingRelayClient.Configs).toHaveLength(1);
        expect(RecordingRelayClient.Configs[0]).toMatchObject({ Provider: 'launcher-relay-provider', EphemeralToken: '', Transport: 'relay', RelayUrl: RELAY_URL });
        await runtime.EndRealtimeSession();
        const lines = [...logged, vi.mocked(console.warn), vi.mocked(console.error)].flatMap((spy) => spy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')));
        expect(lines.filter((line) => line.includes(RELAY_TICKET))).toEqual([]);
    });

    it('builds a direct config with no transport or relay URL, and leaves out a transport it does not know', () => {
        const { runtime } = build();
        const direct = runtime.BuildClientConfig(mintResult());
        expect('Transport' in direct).toBe(false);
        expect('RelayUrl' in direct).toBe(false);
        const unknown = runtime.BuildClientConfig(mintResult({ Transport: 'bridged' }));
        expect('Transport' in unknown).toBe(false);
        expect(runtime.BuildClientConfig(mintResult({ Transport: 'direct' })).Transport).toBe('direct');
        expect(runtime.BuildClientConfig(mintResult(RELAY_MINT))).toMatchObject({ Transport: 'relay', RelayUrl: RELAY_URL, EphemeralToken: '' });
    });

    describe("whether the host can show the agent's video", () => {
        const AVATAR_ROW = { ID: 'c2', Name: 'Avatar', ClientPluginClass: 'LauncherAvatarChannel', IsActive: true };

        it('tells the mint that a host with no channel that shows it (the embeddable widget, the mobile app) shows no agent video', async () => {
            const { runtime, provider } = build();
            await start(runtime);
            const [mint] = provider.mints();
            expect(mint.query).toContain('showsAgentVideo: $showsAgentVideo');
            expect(mint.variables['showsAgentVideo']).toBe(false);
            await runtime.EndRealtimeSession();
        });

        it('tells a custom launcher the same, in the request', async () => {
            const { runtime } = build();
            const seen: RealtimeSessionLaunchRequest[] = [];
            runtime.Launcher = {
                Launch: async (req) => {
                    seen.push(req);
                    return mintResult();
                },
            };
            await start(runtime);
            expect(seen[0].ShowsAgentVideo).toBe(false);
            await runtime.EndRealtimeSession();
        });

        it('says nothing for a host whose Avatar channel shows the agent video, so it mints as before', async () => {
            stubRegistry([ECHO_ROW, AVATAR_ROW]);
            const { runtime, provider } = build();
            await start(runtime);
            const [mint] = provider.mints();
            expect(mint.query).not.toContain('showsAgentVideo');
            expect('showsAgentVideo' in mint.variables).toBe(false);
            await runtime.EndRealtimeSession();
        });

        it('counts a channel the host brings that shows the agent video', async () => {
            const { runtime, provider } = build();
            await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null, {
                HostChannels: [{ Create: () => new LauncherAvatar() }],
            });
            expect('showsAgentVideo' in provider.mints()[0].variables).toBe(false);
            await runtime.EndRealtimeSession();
        });

        it('counts an Avatar channel switched off in the registry as none', async () => {
            stubRegistry([ECHO_ROW, { ...AVATAR_ROW, IsActive: false }]);
            const { runtime, provider } = build();
            await start(runtime);
            expect(provider.mints()[0].variables['showsAgentVideo']).toBe(false);
            await runtime.EndRealtimeSession();
        });
    });

    it('restores the stock launcher when set to null', async () => {
        const { runtime, provider } = build();
        runtime.Launcher = { Launch: async () => mintResult() };
        runtime.Launcher = null;
        expect(runtime.Launcher).toBeInstanceOf(DefaultRealtimeSessionLauncher);
        await start(runtime);
        expect(provider.mints()).toHaveLength(1);
        await runtime.EndRealtimeSession();
    });
});
