import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, type RealtimeClientToolCall } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import type { RealtimeChannelExposure, RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    BuildToolBackedVerbs,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type StartRealtimeClientSessionResult,
} from '../index';

const TOOLS: RealtimeToolDefinition[] = [
    { Name: 'Reader_Nudge', Description: 'Acts.', ParametersSchema: { type: 'object', properties: {} } },
    { Name: 'Reader_Peek', Description: 'Returns what the reader holds.', ParametersSchema: { type: 'object', properties: {} } },
];

/** A channel with NATIVE tools, one of which returns what the channel holds. */
@RegisterClass(BaseRealtimeChannelClient, 'VerbExposureReader')
class ReaderChannel extends BaseRealtimeChannelClient {
    public static Applied: string[] = [];
    public get ChannelName(): string {
        return 'Reader';
    }
    public override get ToolNamePrefix(): string {
        return 'Reader_';
    }
    public override GetToolDefinitions(): RealtimeToolDefinition[] {
        return TOOLS;
    }
    public override GetDescriptor() {
        return {
            Key: 'Reader',
            Version: '2.0.0',
            DisplayName: 'Reader',
            Instructions: 'Holds text.',
            Nouns: [{ Name: 'text', Description: 'The text', Schema: { type: 'object' } }],
            Verbs: BuildToolBackedVerbs(TOOLS, 'Reader_', 'agent', { Reader_Peek: 'state' }),
            DisplayPolicy: 'open-on-start' as const,
            DefaultAvailability: 'all-sessions' as const,
            MaxExposure: 'state' as const,
        };
    }
    public override ApplyAgentTool(toolName: string): string {
        ReaderChannel.Applied.push(toolName);
        return JSON.stringify({ success: true, text: 'private contents' });
    }
}

@RegisterClass(BaseRealtimeClient, 'verb-exposure-fake')
class FakeClient extends BaseRealtimeClient {
    public static Instance: FakeClient | null = null;
    public static Results: Array<{ CallID: string; Output: string }> = [];
    public async Connect(): Promise<void> {
        FakeClient.Instance = this;
        this.emitStateChange('listening');
    }
    public Fire(call: RealtimeClientToolCall): void {
        this.emitToolCall(call);
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(callID: string, outputJson: string): void {
        FakeClient.Results.push({ CallID: callID, Output: outputJson });
    }
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
    constructor(public Policy: RealtimeSessionClientPolicy, public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }]) {}
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (query.includes('mutation StartRealtimeClientSession')) {
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-1',
                ConversationId: 'conv-1',
                Provider: 'verb-exposure-fake',
                Model: 'm',
                EphemeralToken: 't',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
            };
            if (query.includes('ClientPolicyJson')) {
                result.ClientPolicyJson = JSON.stringify(this.Policy);
            }
            return { StartRealtimeClientSession: result };
        }
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

function policyFor(exposure: RealtimeChannelExposure): RealtimeSessionClientPolicy {
    return { Version: 1, Channels: [{ Key: 'Reader', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Exposure: exposure, Source: 'default' }] };
}

async function start(exposure: RealtimeChannelExposure): Promise<RealtimeSessionRuntime> {
    const runtime = new RealtimeSessionRuntime(new Host());
    runtime.Provider = new MintProvider(policyFor(exposure)) as unknown as IMetadataProvider;
    await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null);
    return runtime;
}

async function callTool(name: string): Promise<{ success: boolean; errorCode?: string; error?: string; text?: string }> {
    FakeClient.Results = [];
    FakeClient.Instance?.Fire({ CallID: `call-${name}`, ToolName: name, ArgumentsJson: '{}' });
    await vi.waitFor(() => expect(FakeClient.Results.length).toBeGreaterThan(0));
    return JSON.parse(FakeClient.Results[0].Output) as { success: boolean; errorCode?: string; error?: string; text?: string };
}

describe('RealtimeSessionRuntime: exposure policy on the native-tool route', () => {
    beforeEach(() => {
        ReaderChannel.Applied = [];
        FakeClient.Instance = null;
        vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
            Config: async () => undefined,
            AgentChannels: [{ ID: 'c1', Name: 'Reader', ClientPluginClass: 'VerbExposureReader', IsActive: true }],
        } as unknown as AIEngineBase);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it("a native tool whose result carries channel data is refused when exposure is 'none', and never reaches the channel", async () => {
        const runtime = await start('none');
        const result = await callTool('Reader_Peek');
        expect(result).toMatchObject({ success: false, errorCode: 'exposure_restricted' });
        expect(result.error).toContain('"Peek" is unavailable right now');
        expect(result.text).toBeUndefined();
        expect(ReaderChannel.Applied).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('a native tool that only acts still runs at none', async () => {
        const runtime = await start('none');
        expect((await callTool('Reader_Nudge')).success).toBe(true);
        expect(ReaderChannel.Applied).toEqual(['Reader_Nudge']);
        await runtime.EndRealtimeSession();
    });

    it("at 'state' the data-returning tool runs", async () => {
        const runtime = await start('state');
        expect(await callTool('Reader_Peek')).toMatchObject({ success: true, text: 'private contents' });
        await runtime.EndRealtimeSession();
    });

    it('turning exposure down mid-call takes the tool away, and turning it back gives it back', async () => {
        const runtime = await start('state');
        expect((await callTool('Reader_Peek')).success).toBe(true);
        runtime.SetUserChannelExposure('Reader', 'none');
        expect(await callTool('Reader_Peek')).toMatchObject({ success: false, errorCode: 'exposure_restricted' });
        runtime.SetUserChannelExposure('Reader', undefined);
        expect((await callTool('Reader_Peek')).success).toBe(true);
        await runtime.EndRealtimeSession();
    });
});
