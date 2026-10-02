import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type RealtimeChannelContext,
    type StartRealtimeClientSessionResult,
} from '../index';
import { FormChannel, LegacyEchoChannel } from './channel-test-helpers';

@RegisterClass(BaseRealtimeChannelClient, 'ScopedEchoChannel')
class RegisteredEcho extends LegacyEchoChannel {
    public Ctx: RealtimeChannelContext | null = null;
    protected override OnInitialize(): void {
        this.Ctx = this.Context;
    }
    public get ContextForTest(): RealtimeChannelContext | null {
        return this.Context;
    }
}

@RegisterClass(BaseRealtimeChannelClient, 'ScopedFormChannel')
class RegisteredForm extends FormChannel {
    public Initialized = false;
    protected override OnInitialize(): void {
        this.Initialized = true;
    }
    public get ContextForTest(): RealtimeChannelContext | null {
        return this.Context;
    }
}

@RegisterClass(BaseRealtimeClient, 'scoped-fake-provider')
class ScopedFakeClient extends BaseRealtimeClient {
    public static Notes: string[] = [];
    /** Whether Connect reports `listening` (the control channel is usable) before it resolves. */
    public static ListenOnConnect = true;
    public static Instance: ScopedFakeClient | null = null;
    public async Connect(): Promise<void> {
        ScopedFakeClient.Instance = this;
        if (ScopedFakeClient.ListenOnConnect) {
            this.emitStateChange('listening');
        }
    }
    public ReportListening(): void {
        this.emitStateChange('listening');
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(text: string): void {
        ScopedFakeClient.Notes.push(text);
    }
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

class Host implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

interface MintCall {
    query: string;
    variables: Record<string, unknown>;
}

/** A provider that answers the mint with a configurable policy and records every call. */
class MintProvider {
    public readonly sessionId = 'transport-1';
    public Calls: MintCall[] = [];
    public Policy: RealtimeSessionClientPolicy | string | null = null;
    public RejectChannelScoping = false;
    constructor(public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }]) {}
    public async ExecuteGQL(query: string, variables: Record<string, unknown>): Promise<unknown> {
        this.Calls.push({ query, variables });
        if (query.includes('mutation StartRealtimeClientSession')) {
            if (this.RejectChannelScoping && query.includes('channelCandidatesJson')) {
                throw new Error('Unknown argument "channelCandidatesJson" on field "Mutation.StartRealtimeClientSession".');
            }
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-1',
                ConversationId: 'conv-1',
                Provider: 'scoped-fake-provider',
                Model: 'm',
                EphemeralToken: 't',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
            };
            if (this.Policy !== null && query.includes('ClientPolicyJson')) {
                result.ClientPolicyJson = typeof this.Policy === 'string' ? this.Policy : JSON.stringify(this.Policy);
            }
            return { StartRealtimeClientSession: result };
        }
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
    public mints(): MintCall[] {
        return this.Calls.filter((c) => c.query.includes('mutation StartRealtimeClientSession'));
    }
}

function stubRegistry(rows: Array<{ ID: string; Name: string; ClientPluginClass: string; IsActive: boolean }>): void {
    vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
        Config: async () => undefined,
        AgentChannels: rows,
    } as unknown as AIEngineBase);
}

const ECHO_ROW = { ID: 'c1', Name: 'Echo', ClientPluginClass: 'ScopedEchoChannel', IsActive: true };
const FORM_ROW = { ID: 'c2', Name: 'Form', ClientPluginClass: 'ScopedFormChannel', IsActive: true };

function build(provider: MintProvider = new MintProvider()) {
    const runtime = new RealtimeSessionRuntime(new Host());
    runtime.Provider = provider as unknown as IMetadataProvider;
    return { runtime, provider };
}

async function start(runtime: RealtimeSessionRuntime, options?: Parameters<RealtimeSessionRuntime['StartRealtimeSession']>[12]): Promise<void> {
    await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null, options);
}

function policy(channels: RealtimeSessionClientPolicy['Channels'], rest: Partial<RealtimeSessionClientPolicy> = {}): RealtimeSessionClientPolicy {
    return { Version: 1, Channels: channels, ...rest };
}

describe('RealtimeSessionRuntime — channel scoping at mint', () => {
    beforeEach(() => {
        ScopedFakeClient.Notes = [];
        ScopedFakeClient.ListenOnConnect = true;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('reports every prepared channel as a candidate and asks the server for the resolved policy', async () => {
        stubRegistry([ECHO_ROW, FORM_ROW]);
        const { runtime, provider } = build();
        await start(runtime);

        const [mint] = provider.mints();
        expect(mint.query).toContain('$channelCandidatesJson');
        expect(mint.query).toContain('ClientPolicyJson');
        const candidates = JSON.parse(String(mint.variables['channelCandidatesJson'])) as Array<{ Key: string; Tools: unknown[]; Registry?: string }>;
        expect(candidates.map((c) => c.Key).sort()).toEqual(['Echo', 'Form']);
        expect(candidates.every((c) => c.Registry === undefined)).toBe(true); // the browser's registry view never goes over the wire
        await runtime.EndRealtimeSession();
    });

    it('declares only the locally in-scope native tools at mint (the opt-in Form channel is not in scope by default)', async () => {
        stubRegistry([ECHO_ROW, FORM_ROW]);
        const { runtime, provider } = build();
        await start(runtime);
        const tools = JSON.parse(String(provider.mints()[0].variables['clientToolsJson'])) as Array<{ Name: string }>;
        expect(tools.map((t) => t.Name)).toEqual(['Echo_Say']);
        await runtime.EndRealtimeSession();
    });

    it('activates exactly the channels the server policy puts in the session', async () => {
        stubRegistry([ECHO_ROW, FORM_ROW]);
        const provider = new MintProvider();
        provider.Policy = policy([{ Key: 'Form', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'config' }]);
        const { runtime } = build(provider);
        await start(runtime);

        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Form']); // Echo vetoed by the server
        expect(runtime.GetResolvedChannel('form')).toMatchObject({ Key: 'Form', Source: 'config' });
        expect(runtime.GetResolvedChannel('Echo')).toBeNull();
        await runtime.EndRealtimeSession();
    });

    it('never initializes a channel the server vetoed', async () => {
        stubRegistry([ECHO_ROW, FORM_ROW]);
        const provider = new MintProvider();
        provider.Policy = policy([{ Key: 'Form', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'config' }]);
        const { runtime } = build(provider);
        await start(runtime);
        const echo = runtime.ActiveChannels.find((c) => c.ChannelName === 'Echo');
        expect(echo).toBeUndefined();
        await runtime.EndRealtimeSession();
    });

    it('falls back to the locally resolved scope when the server returns no policy', async () => {
        stubRegistry([ECHO_ROW, FORM_ROW]);
        const { runtime } = build(); // server returns no ClientPolicyJson
        await start(runtime);
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Echo']); // all-sessions yes, opt-in Form no
        await runtime.EndRealtimeSession();
    });

    it('falls back locally when the policy is unreadable', async () => {
        stubRegistry([ECHO_ROW]);
        const provider = new MintProvider();
        provider.Policy = '{not json';
        const { runtime } = build(provider);
        await start(runtime);
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Echo']);
        await runtime.EndRealtimeSession();
    });

    it('ignores a policy channel this host has no plugin for', async () => {
        stubRegistry([ECHO_ROW]);
        const provider = new MintProvider();
        provider.Policy = policy([
            { Key: 'Echo', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' },
            { Key: 'Ghost', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' },
        ]);
        const { runtime } = build(provider);
        await start(runtime);
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Echo']);
        await runtime.EndRealtimeSession();
    });

    it('delivers the resolved per-channel config to the channel context', async () => {
        stubRegistry([FORM_ROW]);
        const provider = new MintProvider();
        const config: JSONObject = { allowedDomains: ['example.com'] };
        provider.Policy = policy([{ Key: 'Form', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'config', Config: config }]);
        const { runtime } = build(provider);
        await start(runtime);
        const form = runtime.ActiveChannels[0] as RegisteredForm;
        expect(form.ContextForTest?.ChannelConfig).toEqual(config);
        await runtime.EndRealtimeSession();
    });

    it('gives a channel an empty ChannelConfig when none was configured', async () => {
        stubRegistry([ECHO_ROW]);
        const { runtime } = build();
        await start(runtime);
        expect((runtime.ActiveChannels[0] as RegisteredEcho).ContextForTest?.ChannelConfig).toEqual({});
        await runtime.EndRealtimeSession();
    });

    it('activates channels BEFORE the session id is adopted (the sessions adapter treats that emission as the initial set)', async () => {
        stubRegistry([ECHO_ROW]);
        const { runtime } = build();
        const ids: Array<string | null> = [];
        runtime.ActiveChannels$.subscribe((channels) => {
            if (channels.length > 0) {
                ids.push(runtime.CurrentAgentSessionId);
            }
        });
        await start(runtime);
        expect(ids).toEqual([null]);
        expect(runtime.CurrentAgentSessionId).toBe('session-1');
        await runtime.EndRealtimeSession();
    });

    it('mints with the ORIGINAL mutation when there are no channels, so a channel-less session is unchanged', async () => {
        stubRegistry([]);
        const { runtime, provider } = build();
        await start(runtime);
        const [mint] = provider.mints();
        expect(mint.query).not.toContain('channelCandidatesJson');
        expect(mint.query).not.toContain('ClientPolicyJson');
        await runtime.EndRealtimeSession();
    });

    it('retries with the original mutation against a server that predates channel scoping, and remembers', async () => {
        stubRegistry([ECHO_ROW]);
        const provider = new MintProvider();
        provider.RejectChannelScoping = true;
        const { runtime } = build(provider);

        await start(runtime);
        expect(provider.mints()).toHaveLength(2);
        expect(provider.mints()[0].query).toContain('channelCandidatesJson');
        expect(provider.mints()[1].query).not.toContain('channelCandidatesJson');
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Echo']); // resolved locally
        await runtime.EndRealtimeSession();

        await start(runtime);
        expect(provider.mints()).toHaveLength(3); // asked once more, not twice: the downgrade was remembered
        expect(provider.mints()[2].query).not.toContain('channelCandidatesJson');
        await runtime.EndRealtimeSession();
    });

    it('does not mask an unrelated mint failure as a scoping downgrade', async () => {
        stubRegistry([ECHO_ROW]);
        const provider = new MintProvider();
        provider.ExecuteGQL = async () => {
            throw new Error('database is down');
        };
        const { runtime } = build(provider);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await start(runtime);
        expect(runtime.LastStartError?.message).toContain('database is down');
        spy.mockRestore();
    });
});

describe('RealtimeSessionRuntime — the kill switch and host-declared channels', () => {
    beforeEach(() => {
        ScopedFakeClient.Notes = [];
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('an inactive registry row keeps its channel out of the session, even when the host declared it', async () => {
        stubRegistry([{ ...ECHO_ROW, IsActive: false }]);
        const { runtime } = build();
        await start(runtime, { HostChannels: [{ ClientPluginClass: 'ScopedEchoChannel' }] });
        expect(runtime.ActiveChannels).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('a connect-only provider (no entity metadata) gets the channels the host declares, with no registry rows', async () => {
        const getProviderInstance = vi.spyOn(AIEngineBase, 'GetProviderInstance');
        const { runtime } = build(new MintProvider([]));
        await start(runtime, { HostChannels: [{ ClientPluginClass: 'ScopedEchoChannel' }] });
        expect(getProviderInstance).not.toHaveBeenCalled();
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Echo']);
        expect(runtime.GetResolvedChannel('Echo')).toMatchObject({ Source: 'host' });
        await runtime.EndRealtimeSession();
    });

    it('an opt-in channel is available to a host that declares it', async () => {
        stubRegistry([]);
        const { runtime } = build();
        await start(runtime, { HostChannels: [{ Create: () => new RegisteredForm(), DisplayPolicy: 'headless', Config: { mode: 'embed' } }] });
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Form']);
        expect((runtime.ActiveChannels[0] as RegisteredForm).ContextForTest?.ChannelConfig).toEqual({ mode: 'embed' });
        await runtime.EndRealtimeSession();
    });

    it('the host\'s instance replaces the registry\'s for the same channel', async () => {
        stubRegistry([ECHO_ROW]);
        const { runtime } = build();
        const mine = new RegisteredEcho();
        await start(runtime, { HostChannels: [{ Create: () => mine }] });
        expect(runtime.ActiveChannels).toEqual([mine]);
        await runtime.EndRealtimeSession();
    });

    it('a host declaration that names nothing buildable, or whose factory throws, is skipped without failing the session', async () => {
        stubRegistry([]);
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { runtime } = build();
        await start(runtime, {
            HostChannels: [
                {},
                {
                    Create: () => {
                        throw new Error('factory broke');
                    },
                },
                { ClientPluginClass: 'NoSuchPlugin' },
            ],
        });
        expect(runtime.IsActive).toBe(true);
        expect(runtime.ActiveChannels).toEqual([]);
        err.mockRestore();
        await runtime.EndRealtimeSession();
    });

    it('a channel with an unreadable descriptor is left out, not fatal', async () => {
        stubRegistry([]);
        class BadDescriptor extends LegacyEchoChannel {
            public override GetDescriptor(): never {
                throw new Error('bad descriptor');
            }
        }
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { runtime } = build();
        await start(runtime, { HostChannels: [{ Create: () => new BadDescriptor() }] });
        expect(runtime.IsActive).toBe(true);
        expect(runtime.ActiveChannels).toEqual([]);
        err.mockRestore();
        await runtime.EndRealtimeSession();
    });
});

describe('RealtimeSessionRuntime — on-demand channels and the ContextTool proxy', () => {
    beforeEach(() => {
        ScopedFakeClient.Notes = [];
        ScopedFakeClient.ListenOnConnect = true;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    async function startWithOnDemandForm() {
        stubRegistry([ECHO_ROW, FORM_ROW]);
        const provider = new MintProvider();
        provider.Policy = policy([
            { Key: 'Echo', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' },
            { Key: 'Form', DisplayPolicy: 'on-demand', MaxExposure: 'state', Source: 'config' },
        ]);
        const { runtime } = build(provider);
        await start(runtime);
        const echo = runtime.ActiveChannels[0] as RegisteredEcho;
        return { runtime, echo, provider };
    }

    it('advertises an on-demand channel without initializing it or publishing it as active', async () => {
        const { runtime } = await startWithOnDemandForm();
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Echo']);
        expect(runtime.AdvertisedChannels.map((c) => c.ChannelName)).toEqual(['Form']);
        expect((runtime.AdvertisedChannels[0] as RegisteredForm).Initialized).toBe(false);
        await runtime.EndRealtimeSession();
    });

    it('describes channels to the model with a catalog note when the call goes live', async () => {
        const { runtime } = await startWithOnDemandForm();
        const note = ScopedFakeClient.Notes.find((n) => n.startsWith('[channels]'));
        expect(note).toContain('Form (channel "Form", available — open it first)');
        expect(note).toContain('SetField(name:string, value:string)');
        expect(note).not.toContain('"Echo"'); // a legacy channel whose native tools describe it
        await runtime.EndRealtimeSession();
    });

    it('holds the catalog note until the control channel is usable, then sends it exactly once', async () => {
        ScopedFakeClient.ListenOnConnect = false; // Connect resolves before the provider reports `listening`
        const { runtime } = await startWithOnDemandForm();
        expect(ScopedFakeClient.Notes.some((n) => n.startsWith('[channels]'))).toBe(false);
        ScopedFakeClient.Instance!.ReportListening();
        ScopedFakeClient.Instance!.ReportListening();
        expect(ScopedFakeClient.Notes.filter((n) => n.startsWith('[channels]'))).toHaveLength(1);
        await runtime.EndRealtimeSession();
    });

    it('opens an on-demand channel mid-session through the proxy: mounted, restored, published, announced', async () => {
        const { runtime, echo } = await startWithOnDemandForm();
        const published: string[][] = [];
        const activity: string[] = [];
        runtime.ActiveChannels$.subscribe((c) => published.push(c.map((x) => x.ChannelName)));
        runtime.ChannelActivity$.subscribe((c) => activity.push(c.ChannelName));

        const result = await echo.ContextForTest!.DispatchContextAction!({ Target: { Channel: 'Form' }, Action: 'open', Params: { title: 'Signup' } });

        expect(result.Success).toBe(true);
        const form = runtime.ActiveChannels.find((c) => c.ChannelName === 'Form') as RegisteredForm;
        expect(form.Initialized).toBe(true);
        expect(form.Opened).toEqual({ title: 'Signup' });
        expect(runtime.AdvertisedChannels).toEqual([]);
        expect(published.at(-1)).toEqual(['Echo', 'Form']);
        expect(activity).toContain('Form');
        expect(runtime.HasChannelBeenUsed('Form')).toBe(true);

        const verb = await echo.ContextForTest!.DispatchContextAction!({ Target: { Channel: 'Form' }, Action: 'SetField', Params: { name: 'name', value: 'Ada' } });
        expect(verb.Success).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('refuses a verb on a channel that is still only advertised', async () => {
        const { runtime, echo } = await startWithOnDemandForm();
        const result = await echo.ContextForTest!.DispatchContextAction!({ Target: { Channel: 'Form' }, Action: 'SetField', Params: { name: 'a', value: 'b' } });
        expect(result.ErrorCode).toBe('channel_not_open');
        await runtime.EndRealtimeSession();
    });

    it('puts a channel whose mount throws back to advertised so the agent can retry', async () => {
        const { runtime, echo } = await startWithOnDemandForm();
        const advertised = runtime.AdvertisedChannels[0] as RegisteredForm;
        let fail = true;
        vi.spyOn(advertised, 'Initialize').mockImplementation(() => {
            if (fail) {
                throw new Error('init failed');
            }
        });
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const first = await echo.ContextForTest!.DispatchContextAction!({ Target: { Channel: 'Form' }, Action: 'open', Params: { title: 't' } });
        expect(first.ErrorCode).toBe('open_failed');
        expect(runtime.AdvertisedChannels).toHaveLength(1);
        fail = false;
        const second = await echo.ContextForTest!.DispatchContextAction!({ Target: { Channel: 'Form' }, Action: 'open', Params: { title: 't' } });
        expect(second.Success).toBe(true);
        err.mockRestore();
        await runtime.EndRealtimeSession();
    });

    it('drops everything at teardown: no channels, no advertised, no resolved policy', async () => {
        const { runtime } = await startWithOnDemandForm();
        await runtime.EndRealtimeSession();
        expect(runtime.ActiveChannels).toEqual([]);
        expect(runtime.AdvertisedChannels).toEqual([]);
        expect(runtime.GetResolvedChannel('Form')).toBeNull();
    });
});

describe('RealtimeSessionRuntime — owner-keyed app client tools', () => {
    afterEach(() => vi.restoreAllMocks());

    async function startWithContext() {
        stubRegistry([ECHO_ROW]);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const provider = new MintProvider();
        provider.Policy = policy([{ Key: 'Echo', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' }], {
            ClientTools: { App: [{ Name: 'AppOnlyTool', Description: 'declared by the app', InputSchema: {} }] },
        });
        const { runtime } = build(provider);
        await start(runtime);
        const ctx = (runtime.ActiveChannels[0] as RegisteredEcho).ContextForTest!;
        return { runtime, ctx };
    }

    it('registering one owner replaces only that owner, and the unregister/clear forms work', async () => {
        const { runtime, ctx } = await startWithContext();
        runtime.RegisterAppClientTools([{ Name: 'NavigateToApp', Handler: () => 'nav' }], 'explorer.global');
        runtime.RegisterAppClientTools([{ Name: 'SetFilter', Handler: () => 'filter' }], 'explorer.surface');
        runtime.RegisterAppClientTools([{ Name: 'SetSort', Handler: () => 'sort' }], 'explorer.surface');

        expect((await ctx.ExecuteClientTool!('NavigateToApp', {})).Result).toBe('nav'); // survived the surface refresh
        expect((await ctx.ExecuteClientTool!('SetSort', {})).Result).toBe('sort');
        expect((await ctx.ExecuteClientTool!('SetFilter', {})).Success).toBe(false); // the surface's previous tool is gone

        runtime.UnregisterAppClientTools('explorer.surface');
        expect((await ctx.ExecuteClientTool!('SetSort', {})).Success).toBe(false);
        expect((await ctx.ExecuteClientTool!('NavigateToApp', {})).Success).toBe(true);

        runtime.ClearAppClientTools();
        expect((await ctx.ExecuteClientTool!('NavigateToApp', {})).Success).toBe(false);
        await runtime.EndRealtimeSession();
    });

    it('the single-argument form still replaces everything it registered before (back-compat)', async () => {
        const { runtime, ctx } = await startWithContext();
        runtime.RegisterAppClientTools([{ Name: 'A', Handler: () => 'a' }]);
        runtime.RegisterAppClientTools([{ Name: 'B', Handler: () => 'b' }]);
        expect((await ctx.ExecuteClientTool!('A', {})).Success).toBe(false);
        expect((await ctx.ExecuteClientTool!('B', {})).Result).toBe('b');
        await runtime.EndRealtimeSession();
    });

    it('a tool the app declares but the host has no handler for says so, instead of reading like a typo', async () => {
        const { runtime, ctx } = await startWithContext();
        const declared = await ctx.ExecuteClientTool!('AppOnlyTool', {});
        expect(declared.Success).toBe(false);
        expect(declared.ErrorMessage).toContain('declared for this app but this surface has not registered it');
        const unknown = await ctx.ExecuteClientTool!('Bogus', {});
        expect(unknown.ErrorMessage).toContain('No client tool named "Bogus"');
        await runtime.EndRealtimeSession();
    });

    it('lists tools as registered, not lower-cased, in the available list', async () => {
        const { runtime, ctx } = await startWithContext();
        runtime.RegisterAppClientTools([{ Name: 'ExportData', Handler: () => 1 }]);
        const out = await ctx.ExecuteClientTool!('Bogus', {});
        expect(out.ErrorMessage).toContain('Available: ExportData.');
        await runtime.EndRealtimeSession();
    });

    it('contains a throwing handler as a structured failure', async () => {
        const { runtime, ctx } = await startWithContext();
        runtime.RegisterAppClientTools([
            {
                Name: 'Boom',
                Handler: () => {
                    throw new Error('handler exploded');
                },
            },
        ]);
        expect(await ctx.ExecuteClientTool!('Boom', {})).toEqual({ Success: false, ErrorMessage: 'handler exploded' });
        await runtime.EndRealtimeSession();
    });
});
