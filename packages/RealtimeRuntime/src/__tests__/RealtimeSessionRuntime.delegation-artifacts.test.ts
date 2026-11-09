import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, type RealtimeClientToolCall } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type StartRealtimeClientSessionResult,
} from '../index';
import type { ParsedDelegationArtifact } from '../session/delegation-result-parser';

/** A channel that hosts artifacts when its config says `autoOpen`, and records what it was handed. */
@RegisterClass(BaseRealtimeChannelClient, 'ArtifactHostChannel')
class ArtifactHostChannel extends BaseRealtimeChannelClient {
    public static Instance: ArtifactHostChannel | null = null;
    public Received: ParsedDelegationArtifact[][] = [];
    public AskedWith: JSONObject[] = [];
    public Initialized = false;
    public Throw = false;
    public constructor() {
        super();
        // Recorded at construction so a test can inspect a channel that is advertised but never mounted.
        ArtifactHostChannel.Instance = this;
    }
    public get ChannelName(): string {
        return 'ArtifactHost';
    }
    public override get TabTitle(): string {
        return 'Artifacts';
    }
    public override GetDescriptor() {
        return {
            Key: 'ArtifactHost',
            Version: '2.0.0',
            DisplayName: 'Artifact host',
            Instructions: 'Hosts artifacts.',
            Nouns: [],
            Verbs: [],
            DisplayPolicy: 'on-demand' as const,
            DefaultAvailability: 'opt-in' as const,
            MaxExposure: 'state' as const,
        };
    }
    protected override OnInitialize(): void {
        this.Initialized = true;
    }
    public override AcceptsDelegationArtifacts(_artifacts: readonly ParsedDelegationArtifact[], config: JSONObject): boolean {
        this.AskedWith.push(config);
        return config['autoOpen'] === true;
    }
    public override OnDelegationArtifacts(artifacts: readonly ParsedDelegationArtifact[]): void {
        if (this.Throw) {
            throw new Error('could not open');
        }
        this.Received.push([...artifacts]);
    }
}

/** A channel that never asks for artifacts (the default). */
@RegisterClass(BaseRealtimeChannelClient, 'UninterestedChannel')
class UninterestedChannel extends BaseRealtimeChannelClient {
    public Received = 0;
    public get ChannelName(): string {
        return 'Uninterested';
    }
    public override OnDelegationArtifacts(): void {
        this.Received++;
    }
}

@RegisterClass(BaseRealtimeClient, 'delegation-fake-provider')
class DelegationFakeClient extends BaseRealtimeClient {
    public static Instance: DelegationFakeClient | null = null;
    public async Connect(): Promise<void> {
        DelegationFakeClient.Instance = this;
        this.emitStateChange('listening');
    }
    public FireToolCall(call: RealtimeClientToolCall): void {
        this.emitToolCall(call);
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

class Host implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

class MintProvider {
    public ToolResult = '{}';
    constructor(public Policy: RealtimeSessionClientPolicy | null, public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }]) {}
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (query.includes('mutation StartRealtimeClientSession')) {
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-1',
                ConversationId: 'conv-1',
                Provider: 'delegation-fake-provider',
                Model: 'm',
                EphemeralToken: 't',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
            };
            if (this.Policy && query.includes('ClientPolicyJson')) {
                result.ClientPolicyJson = JSON.stringify(this.Policy);
            }
            return { StartRealtimeClientSession: result };
        }
        if (query.includes('mutation ExecuteRealtimeSessionTool')) {
            return { ExecuteRealtimeSessionTool: this.ToolResult };
        }
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

const ROWS = [
    { ID: 'c1', Name: 'ArtifactHost', ClientPluginClass: 'ArtifactHostChannel', IsActive: true },
    { ID: 'c2', Name: 'Uninterested', ClientPluginClass: 'UninterestedChannel', IsActive: true },
];

const toolResult = (artifacts: unknown, success = true): string => JSON.stringify({ success, output: 'done', runId: 'run-1', artifacts });

/** A policy that puts the artifact host in the session as an `on-demand` (advertised, unopened) channel. */
function policy(config: JSONObject = {}, display: 'on-demand' | 'open-on-start' = 'on-demand'): RealtimeSessionClientPolicy {
    return {
        Version: 1,
        Channels: [
            { Key: 'ArtifactHost', DisplayPolicy: display, MaxExposure: 'state', Source: 'config', Config: config },
            { Key: 'Uninterested', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' },
        ],
    };
}

async function startWith(p: RealtimeSessionClientPolicy, toolResultJson: string): Promise<RealtimeSessionRuntime> {
    const runtime = new RealtimeSessionRuntime(new Host());
    const provider = new MintProvider(p);
    provider.ToolResult = toolResultJson;
    runtime.Provider = provider as unknown as IMetadataProvider;
    await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null);
    return runtime;
}

/** Fires a delegated tool call and lets its result (and the artifact offer that follows) settle. */
async function delegate(): Promise<void> {
    DelegationFakeClient.Instance?.FireToolCall({ CallID: 'call-1', ToolName: 'invoke-target-agent', ArgumentsJson: '{}' });
    await vi.waitFor(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
}

const ARTIFACT = { artifactId: 'art-1', artifactVersionId: 'ver-2', name: 'Revenue dashboard' };

describe('RealtimeSessionRuntime — offering delegated artifacts to channels', () => {
    beforeEach(() => {
        ArtifactHostChannel.Instance = null;
        DelegationFakeClient.Instance = null;
        vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({ Config: async () => undefined, AgentChannels: ROWS } as unknown as AIEngineBase);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('mounts an advertised channel that wants the artifacts, then hands them over, and reveals its tab', async () => {
        const runtime = await startWith(policy({ autoOpen: true }), toolResult([ARTIFACT]));
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Uninterested']);
        expect(ArtifactHostChannel.Instance?.Initialized).toBe(false); // advertised, not mounted

        const activity: string[] = [];
        runtime.ChannelActivity$.subscribe((c) => activity.push(c.ChannelName));
        await delegate();

        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toContain('ArtifactHost');
        expect(ArtifactHostChannel.Instance?.Initialized).toBe(true);
        expect(ArtifactHostChannel.Instance?.Received).toEqual([[{ ArtifactID: 'art-1', ArtifactVersionID: 'ver-2', Name: 'Revenue dashboard' }]]);
        expect(activity).toContain('ArtifactHost');
        await runtime.EndRealtimeSession();
    });

    it('asks with the channel\'s RESOLVED config, before the channel is initialized', async () => {
        const runtime = await startWith(policy({ autoOpen: true, maxInstances: 3 }), toolResult([ARTIFACT]));
        await delegate();
        expect(ArtifactHostChannel.Instance?.AskedWith[0]).toEqual({ autoOpen: true, maxInstances: 3 });
        await runtime.EndRealtimeSession();
    });

    it('leaves an advertised channel unmounted when it declines', async () => {
        const runtime = await startWith(policy({ autoOpen: false }), toolResult([ARTIFACT]));
        await delegate();
        expect(ArtifactHostChannel.Instance?.Initialized).toBe(false);
        expect(ArtifactHostChannel.Instance?.Received).toEqual([]);
        expect(runtime.ActiveChannels.map((c) => c.ChannelName)).toEqual(['Uninterested']);
        await runtime.EndRealtimeSession();
    });

    it('hands artifacts to a channel that is already open without remounting it', async () => {
        const runtime = await startWith(policy({ autoOpen: true }, 'open-on-start'), toolResult([ARTIFACT]));
        expect(ArtifactHostChannel.Instance?.Initialized).toBe(true);
        const before = runtime.ActiveChannels.length;
        await delegate();
        expect(runtime.ActiveChannels).toHaveLength(before);
        expect(ArtifactHostChannel.Instance?.Received).toHaveLength(1);
        await runtime.EndRealtimeSession();
    });

    it('never bothers a channel that did not ask (the default)', async () => {
        const runtime = await startWith(policy({ autoOpen: true }), toolResult([ARTIFACT]));
        await delegate();
        const uninterested = runtime.ActiveChannels.find((c) => c.ChannelName === 'Uninterested') as UninterestedChannel;
        expect(uninterested.Received).toBe(0);
        await runtime.EndRealtimeSession();
    });

    it('offers nothing when the delegation failed or produced no artifacts', async () => {
        const failed = await startWith(policy({ autoOpen: true }), toolResult([ARTIFACT], false));
        await delegate();
        expect(ArtifactHostChannel.Instance?.Received).toEqual([]);
        await failed.EndRealtimeSession();

        ArtifactHostChannel.Instance = null;
        const none = await startWith(policy({ autoOpen: true }), toolResult([]));
        await delegate();
        expect(ArtifactHostChannel.Instance?.Received ?? []).toEqual([]);
        await none.EndRealtimeSession();
    });

    it('a channel that throws is logged and does not disturb the delegation or the other channels', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const runtime = await startWith(policy({ autoOpen: true }, 'open-on-start'), toolResult([ARTIFACT]));
        if (ArtifactHostChannel.Instance) {
            ArtifactHostChannel.Instance.Throw = true;
        }
        const results: boolean[] = [];
        runtime.DelegationResult$.subscribe((r) => results.push(r.Success));
        await delegate();
        expect(results).toEqual([true]);
        expect(error.mock.calls.some((c) => String(c[0]).includes("Channel 'ArtifactHost' failed to take a delegated run's artifacts"))).toBe(true);
        await runtime.EndRealtimeSession();
    });
});
