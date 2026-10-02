import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChannelInboundVideoBridge } from '@memberjunction/ai-realtime-client';
import type { RealtimeChannelContext } from '../channels/base-realtime-channel-client';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import type { RealtimeChannelEvent } from '../channels/channel-contract-types';
import { makeChannelContext } from './channel-test-helpers';

/** A channel that opts into visual perception through the base class, with a frame it controls. */
class PictureChannel extends BaseRealtimeChannelClient {
    public Frame: string | null = 'frame-1';
    public Pushed: string[] = [];
    public get ChannelName(): string {
        return 'Picture';
    }
    public Enable(options: Parameters<PictureChannel['EnableVisualPerception']>[1] = {}): void {
        this.EnableVisualPerception({ GetLatestFrame: async () => this.Frame }, options);
    }
    public Edit(): Promise<void> {
        this.RecordChange({ Author: 'user', Perceive: false });
        return this.NotifyVisualChange();
    }
    public AgentEdited(): Promise<void> {
        this.RecordChange({ Author: 'agent', Perceive: false });
        return this.ConfirmVisualChange();
    }
    public InstallBridge(started: { count: number }): void {
        this.VisualVideoBridge = {
            IsActive: false,
            Start: () => {
                started.count++;
            },
            Stop: () => undefined,
            PushFrame: (frame: string) => {
                this.Pushed.push(frame);
                return true;
            },
        } as unknown as ChannelInboundVideoBridge;
    }
}

function videoContext(established = true, rate?: number): RealtimeChannelContext {
    return makeChannelContext({
        Client: {
            IsTrackEstablished: (modality: string, direction: string) => established && modality === 'video' && direction === 'inbound',
            EstablishedTracks: rate ? [{ Descriptor: { Modality: 'video', Direction: 'inbound', Rate: rate } }] : [],
        } as unknown as RealtimeChannelContext['Client'],
    });
}

describe('BaseRealtimeChannelClient — visual perception', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sources the inbound video track only once visual perception is enabled', () => {
        const channel = new PictureChannel();
        expect(channel.GetSourcedTracks()).toEqual([]);
        channel.Initialize(videoContext());
        channel.Enable();
        expect(channel.GetSourcedTracks().map((t) => `${t.Direction}:${t.Modality}`)).toEqual(['inbound:video']);
    });

    it('pushes a user-change frame and tags the frame_pushed event with the change id', async () => {
        vi.setSystemTime(50_000);
        const channel = new PictureChannel();
        channel.Initialize(videoContext());
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));

        await channel.Edit();

        expect(channel.Pushed).toEqual(['frame-1']);
        const pushed = events.find((e) => e.Name === 'frame_pushed');
        expect(pushed?.ChangeId).toBe(1);
        expect(pushed?.Payload).toMatchObject({ reason: 'change' });
    });

    it('sends the structured do-not-narrate confirmation after a successful agent edit', async () => {
        const channel = new PictureChannel();
        const ctx = videoContext();
        channel.Initialize(ctx);
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        await channel.AgentEdited();
        expect(channel.Pushed).toEqual(['frame-1']);
        const note = (ctx as unknown as { Notes: string[] }).Notes.find((n) => n.includes('frame_confirmed'));
        expect(note).toContain('[channel:Picture#1] frame_confirmed');
        expect(note).toContain('do NOT narrate');
    });

    it('uses a literal confirmation note when the channel supplies one (legacy wording preserved)', async () => {
        const channel = new PictureChannel();
        const ctx = videoContext();
        channel.Initialize(ctx);
        channel.Enable({ ConfirmationNote: '[picture] done' });
        channel.InstallBridge({ count: 0 });
        await channel.AgentEdited();
        expect((ctx as unknown as { Notes: string[] }).Notes).toContain('[picture] done');
    });

    it('starts the bridge poller only when the channel asks for the legacy behavior', () => {
        const without = new PictureChannel();
        without.Initialize(videoContext());
        without.Enable();
        const a = { count: 0 };
        without.InstallBridge(a);
        without.OnSessionStarted();
        expect(a.count).toBe(0);

        const withPoller = new PictureChannel();
        withPoller.Initialize(videoContext());
        withPoller.Enable({ StartBridgePoller: true });
        const b = { count: 0 };
        withPoller.InstallBridge(b);
        withPoller.OnSessionStarted();
        expect(b.count).toBe(1);
    });

    it('does nothing without an established inbound video track', async () => {
        const channel = new PictureChannel();
        channel.Initialize(videoContext(false));
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        await channel.Edit();
        await channel.AgentEdited();
        expect(channel.Pushed).toHaveLength(0);
    });

    it('paces frames to the negotiated cadence (floor 250ms)', async () => {
        vi.setSystemTime(100_000);
        const channel = new PictureChannel();
        channel.Initialize(videoContext(true, 20)); // 20 fps requested -> clamped to the 250ms floor
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        await channel.Edit();
        channel.Frame = 'frame-2';
        vi.setSystemTime(100_100); // inside the 250ms floor
        await channel.Edit();
        expect(channel.Pushed).toEqual(['frame-1']);
        await vi.advanceTimersByTimeAsync(250);
        expect(channel.Pushed).toEqual(['frame-1', 'frame-2']);
    });

    it('NotifyVisualChange and ConfirmVisualChange are inert before visual perception is enabled', async () => {
        const channel = new PictureChannel();
        channel.Initialize(videoContext());
        await expect(channel.Edit()).resolves.toBeUndefined();
        await expect(channel.AgentEdited()).resolves.toBeUndefined();
    });
});
