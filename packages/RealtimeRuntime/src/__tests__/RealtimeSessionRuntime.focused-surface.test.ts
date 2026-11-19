import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { JSONObject, RealtimeContextNoteOptions } from '@memberjunction/ai';
import type { RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type RealtimeChannelContext,
    type StartRealtimeClientSessionResult,
} from '../index';
import { FormChannel } from './channel-test-helpers';

@RegisterClass(BaseRealtimeChannelClient, 'FocusedSurfaceFormChannel')
class FocusedSurfaceFormChannel extends FormChannel {
    public CapturedContext: RealtimeChannelContext | null = null;
    protected override OnInitialize(): void {
        this.CapturedContext = this.Context;
    }
}

@RegisterClass(BaseRealtimeChannelClient, 'FocusedSurfaceMediaChannel')
class FocusedSurfaceMediaChannel extends BaseRealtimeChannelClient {
    public get ChannelName(): string {
        return 'media';
    }
    public override get TabTitle(): string {
        return 'Media';
    }
    public override GetState(): JSONObject {
        return { activeItemId: 'img-1', items: [{ id: 'img-1', title: 'Architecture diagram' }] };
    }
}

@RegisterClass(BaseRealtimeClient, 'focused-surface-fake-provider')
class FocusedSurfaceFakeClient extends BaseRealtimeClient {
    public static Notes: Array<{ Text: string; Options?: RealtimeContextNoteOptions }> = [];
    public static ListenOnConnect = true;
    public static Instance: FocusedSurfaceFakeClient | null = null;

    public async Connect(): Promise<void> {
        FocusedSurfaceFakeClient.Instance = this;
        this.emitStateChange(FocusedSurfaceFakeClient.ListenOnConnect ? 'listening' : 'connecting');
    }

    public EmitState(state: 'connecting' | 'listening'): void {
        this.emitStateChange(state);
    }

    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(text: string, options?: RealtimeContextNoteOptions): void {
        FocusedSurfaceFakeClient.Notes.push({ Text: text, Options: options });
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

class FakeMediaHost implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

class FocusMintProvider {
    public readonly sessionId = 'transport-focus';
    public Entities: Array<{ Name: string }> = [{ Name: 'MJ: AI Agent Channels' }];
    public Policy: RealtimeSessionClientPolicy | null = null;

    public async ExecuteGQL(query: string): Promise<Record<string, StartRealtimeClientSessionResult>> {
        if (query.includes('mutation StartRealtimeClientSession')) {
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-focus-1',
                ConversationId: 'conv-focus-1',
                Provider: 'focused-surface-fake-provider',
                Model: 'm',
                EphemeralToken: 'tok',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
                ClientPolicyJson: this.Policy ? JSON.stringify(this.Policy) : undefined,
            };
            return { StartRealtimeClientSession: result };
        }
        return {};
    }

    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

describe('RealtimeSessionRuntime — focused surface notes & GetSurfaceSnapshot', () => {
    beforeEach(() => {
        FocusedSurfaceFakeClient.Notes = [];
        FocusedSurfaceFakeClient.ListenOnConnect = true;
        FocusedSurfaceFakeClient.Instance = null;
        vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
            Config: async () => undefined,
            AgentChannels: [
                { ID: 'c-form', Name: 'Form', ClientPluginClass: 'FocusedSurfaceFormChannel', IsActive: true },
                { ID: 'c-media', Name: 'media', ClientPluginClass: 'FocusedSurfaceMediaChannel', IsActive: true },
            ],
        } as unknown as AIEngineBase);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits [surface] notes with StateKey on tab switches across channels and Activity, respecting exposure', async () => {
        const provider = new FocusMintProvider();
        provider.Policy = {
            Version: 1,
            Channels: [
                { Key: 'Form', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'config' },
                { Key: 'media', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'config' },
            ],
        };
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        runtime.Provider = provider as unknown as IMetadataProvider;

        await runtime.StartRealtimeSession('agent-1', null, null, 'Sage');
        FocusedSurfaceFakeClient.Notes = [];

        runtime.SetFocusedChannel('media');
        runtime.SetFocusedChannel('media'); // duplicate should be ignored
        runtime.SetFocusedChannel('Form');
        runtime.SetFocusedChannel(null); // switch to Activity

        const surfaceNotes = FocusedSurfaceFakeClient.Notes.filter((n) => n.Text.startsWith('[surface]'));
        expect(surfaceNotes).toHaveLength(3);
        expect(surfaceNotes[0].Options?.StateKey).toBe('focused-surface');
        expect(surfaceNotes[0].Text).toContain('Media (media)');
        expect(surfaceNotes[0].Text).toContain('Architecture diagram');
        expect(surfaceNotes[1].Text).toContain('Form (Form)');
        expect(surfaceNotes[2].Text).toContain('Activity');

        // Snapshot exposes active surface + state of every open channel
        runtime.SetFocusedChannel('media');
        const formChannel = runtime.ActiveChannels.find((c) => c.ChannelName === 'Form') as FocusedSurfaceFormChannel;
        const snapshot = formChannel.CapturedContext?.GetSurfaceSnapshot?.();
        expect(snapshot).toBeDefined();
        expect(snapshot?.ActiveSurface).toBe('media');
        const entries = snapshot?.ActiveChannels as Array<Record<string, unknown>>;
        expect(entries.find((e) => e.ChannelKey === 'media')?.IsFocused).toBe(true);
        expect(entries.find((e) => e.ChannelKey === 'Form')?.State).toEqual({ fields: { name: '' } });

        // Setting exposure to 'none' omits state from both [surface] notes and GetSurfaceSnapshot
        runtime.SetUserChannelExposure('media', 'none');
        FocusedSurfaceFakeClient.Notes = [];
        runtime.SetFocusedChannel('Form');
        runtime.SetFocusedChannel('media');
        const hiddenNote = FocusedSurfaceFakeClient.Notes.find((n) => n.Text.includes('Media (media)'));
        expect(hiddenNote?.Text).toContain('"exposure":"none"');
        expect(hiddenNote?.Text).not.toContain('Architecture diagram');

        const redactedSnapshot = runtime.GetSurfaceSnapshot();
        const redactedEntries = redactedSnapshot.ActiveChannels as Array<Record<string, unknown>>;
        expect(redactedEntries.find((e) => e.ChannelKey === 'media')?.State).toBeUndefined();

        await runtime.EndRealtimeSession();
    });

    it('flushes a pending focused-surface note as soon as the session reaches listening', async () => {
        FocusedSurfaceFakeClient.ListenOnConnect = false;
        const provider = new FocusMintProvider();
        provider.Policy = {
            Version: 1,
            Channels: [{ Key: 'media', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'config' }],
        };
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        runtime.Provider = provider as unknown as IMetadataProvider;

        await runtime.StartRealtimeSession('agent-1', null, null, 'Sage');
        runtime.SetFocusedChannel('media');
        expect(FocusedSurfaceFakeClient.Notes.filter((n) => n.Text.startsWith('[surface]'))).toHaveLength(0);

        FocusedSurfaceFakeClient.Instance!.EmitState('listening');
        const surfaceNotes = FocusedSurfaceFakeClient.Notes.filter((n) => n.Text.startsWith('[surface]'));
        expect(surfaceNotes).toHaveLength(1);
        expect(surfaceNotes[0].Text).toContain('Media (media)');

        await runtime.EndRealtimeSession();
    });
});
