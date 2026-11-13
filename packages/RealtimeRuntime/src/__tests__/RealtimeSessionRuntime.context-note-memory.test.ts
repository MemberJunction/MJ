import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeContextNoteOptions } from '@memberjunction/ai';
import {
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type StartRealtimeClientSessionResult,
} from '../index';
import { FormChannel, makeChannelContext } from './channel-test-helpers';

@RegisterClass(BaseRealtimeClient, 'memory-options-fake-provider')
class MemoryOptionsFakeClient extends BaseRealtimeClient {
    public static RecordedCalls: Array<{ Text: string; Options?: RealtimeContextNoteOptions }> = [];
    public static ListenOnConnect = true;
    public static Instance: MemoryOptionsFakeClient | null = null;

    public async Connect(): Promise<void> {
        MemoryOptionsFakeClient.Instance = this;
        if (MemoryOptionsFakeClient.ListenOnConnect) {
            this.emitStateChange('listening');
        } else {
            this.emitStateChange('connecting');
        }
    }

    public EmitState(state: 'connecting' | 'listening' | 'speaking'): void {
        this.emitStateChange(state);
    }

    public SendText(): void {}
    public CancelActiveResponse(): void {}

    public SendContextNote(text: string, options?: RealtimeContextNoteOptions): void {
        this.ConversationMemory.Record({ Kind: 'note', Text: text, ...options });
        MemoryOptionsFakeClient.RecordedCalls.push({ Text: text, Options: options });
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

class SimpleMintProvider {
    public readonly sessionId = 'transport-mem';
    public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }];

    public async ExecuteGQL(query: string): Promise<unknown> {
        if (query.includes('mutation StartRealtimeClientSession')) {
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-mem-1',
                ConversationId: 'conv-mem-1',
                Provider: 'memory-options-fake-provider',
                Model: 'm',
                EphemeralToken: 'tok',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
            };
            return { StartRealtimeClientSession: result };
        }
        return {};
    }

    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

describe('RealtimeSessionRuntime & BaseRealtimeChannelClient context-note memory options', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        MemoryOptionsFakeClient.RecordedCalls = [];
        MemoryOptionsFakeClient.ListenOnConnect = true;
        MemoryOptionsFakeClient.Instance = null;
        vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
            Config: async () => undefined,
            AgentChannels: [],
        } as unknown as AIEngineBase);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('suppresses SendContextNote before initial listening, forwards options once live, and preserves notes arriving mid-resume', async () => {
        MemoryOptionsFakeClient.ListenOnConnect = false;
        const runtime = new RealtimeSessionRuntime(new Host());
        runtime.Provider = new SimpleMintProvider() as unknown as IMetadataProvider;

        await runtime.StartRealtimeSession('agent-1', null, null, 'Sage');
        expect(MemoryOptionsFakeClient.Instance).not.toBeNull();

        // Pre-live (initial connecting): suppressed so t=0 duplicate notes are not sent
        runtime.SendContextNote('[app-context] initial duplicate', { StateKey: 'app-context' });
        expect(MemoryOptionsFakeClient.RecordedCalls).toHaveLength(0);

        // Session goes live
        MemoryOptionsFakeClient.Instance!.EmitState('listening');
        runtime.SendContextNote('[app-context] delta screen 1', {
            StateKey: 'app-context',
            MemoryText: '[app-context] full snapshot screen 1',
        });
        expect(MemoryOptionsFakeClient.RecordedCalls).toHaveLength(1);
        expect(MemoryOptionsFakeClient.RecordedCalls[0]).toEqual({
            Text: '[app-context] delta screen 1',
            Options: {
                StateKey: 'app-context',
                MemoryText: '[app-context] full snapshot screen 1',
            },
        });

        // Mid-call reconnect starts (listening -> connecting sets Resuming$ = true)
        MemoryOptionsFakeClient.Instance!.EmitState('connecting');
        runtime.SendContextNote('[app-context] delta screen 2 during outage', {
            StateKey: 'app-context',
            MemoryText: '[app-context] full snapshot screen 2',
        });
        expect(MemoryOptionsFakeClient.RecordedCalls).toHaveLength(2);

        const memory = MemoryOptionsFakeClient.Instance!.ConversationMemory;
        const seed = memory.Seed();
        expect(memory.StateEntryCount).toBe(1);
        expect(seed.Entries.map((e) => e.Text)).toEqual(['[app-context] full snapshot screen 2']);

        await runtime.EndRealtimeSession();
    });

    it('tags BaseRealtimeChannelClient opened, perception, and exposure-withdrawal notes with replaceable StateKey + full MemoryText, while keeping Complete durable', async () => {
        const memoryClient = new MemoryOptionsFakeClient();
        const recorded: Array<{ Text: string; Options?: RealtimeContextNoteOptions }> = [];
        const channel = new FormChannel();
        channel.Initialize(
            makeChannelContext({
                Client: memoryClient,
                SendContextNote: (text: string, options?: RealtimeContextNoteOptions) => {
                    memoryClient.ConversationMemory.Record({ Kind: 'note', Text: text, ...options });
                    recorded.push({ Text: text, Options: options });
                },
            }),
        );

        await channel.Open({ title: 'Initial Form' });
        expect(recorded).toHaveLength(1);
        const expectedStateKey = `channel:${channel.ChannelName}:${channel.InstanceId}`;
        expect(recorded[0].Options?.StateKey).toBe(expectedStateKey);
        expect(recorded[0].Options?.MemoryText).toContain('state_snapshot');

        // Mutate state twice inside perception window -> coalesces into delta on wire + full state_snapshot in MemoryText
        channel.ApplyVerb('SetField', { name: 'name', value: 'Step 1' });
        channel.ApplyVerb('SetField', { name: 'name', value: 'Step 2' });
        vi.advanceTimersByTime(1000);

        expect(recorded).toHaveLength(2);
        expect(recorded[1].Text).toContain('delta');
        expect(recorded[1].Options?.StateKey).toBe(expectedStateKey);
        expect(recorded[1].Options?.MemoryText).toContain('state_snapshot');
        expect(recorded[1].Options?.MemoryText).toContain('Step 2');
        expect(memoryClient.ConversationMemory.StateEntryCount).toBe(1);
        expect(memoryClient.ConversationMemory.Seed().Entries[0].Text).toContain('Step 2');

        // Complete() is a discrete submission event -> unkeyed durable note
        channel.Submit();
        expect(recorded).toHaveLength(3);
        expect(recorded[2].Options).toBeUndefined();
        expect(memoryClient.ConversationMemory.EntryCount).toBe(1);

        // Withdrawing exposure to 'none' overwrites the channel's state key in reconnect memory so Step 2 cannot leak
        channel.ApplyExposure({ Policy: 'none', Reasons: ['Zero data retention enabled'] });
        expect(recorded).toHaveLength(4);
        expect(recorded[3].Options?.StateKey).toBe(expectedStateKey);
        const postWithdrawSeedTexts = memoryClient.ConversationMemory.Seed().Entries.map((e) => e.Text);
        expect(postWithdrawSeedTexts.some((t) => t.includes('Step 2'))).toBe(false);
        expect(postWithdrawSeedTexts.some((t) => t.includes('exposure_changed'))).toBe(true);

        channel.Dispose();
    });
});
