import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import { BaseRealtimeChannelClient, type RealtimeChannelContext } from '../channels/base-realtime-channel-client';
import type { RealtimeChannelEvent } from '../channels/channel-contract-types';
import { FormChannel, makeChannelContext } from './channel-test-helpers';

/** A state-holding channel whose ceiling and pictures the test controls. */
class BoardChannel extends BaseRealtimeChannelClient {
    public Frame: string | null = 'frame-1';
    public Pushed: string[] = [];
    public Ceiling: RealtimeChannelExposure = 'pixels';
    public Board: Record<string, number> = { a: 1 };
    public get ChannelName(): string {
        return 'Board';
    }
    public override get TabTitle(): string {
        return 'Board';
    }
    public override GetDescriptor() {
        return {
            Key: 'Board',
            Version: '2.0.0',
            DisplayName: 'Board',
            Instructions: 'A board.',
            Nouns: [{ Name: 'board', Description: 'The board', Schema: { type: 'object' } }],
            Verbs: [],
            DisplayPolicy: 'open-on-start' as const,
            DefaultAvailability: 'all-sessions' as const,
            MaxExposure: this.Ceiling,
        };
    }
    public override GetState() {
        return { board: { ...this.Board } };
    }
    public EnableVision(): void {
        this.EnableVisualPerception({ GetLatestFrame: async () => this.Frame });
    }
    public Edit(value: number): number {
        this.Board = { ...this.Board, a: value };
        return this.RecordChange({ Author: 'user' });
    }
    public Picture(): Promise<void> {
        return this.NotifyVisualChange();
    }
    public Finish(): void {
        this.Complete({ done: true });
    }
    public InstallBridge(calls: Array<{ Enabled: boolean; Notify: boolean }>): void {
        this.VisualVideoBridge = {
            IsActive: false,
            Start: () => undefined,
            Stop: () => undefined,
            Register: () => true,
            SetSourceEnabled: (enabled: boolean, notify = true) => {
                calls.push({ Enabled: enabled, Notify: notify });
            },
            PushFrame: (frame: string) => {
                this.Pushed.push(frame);
                return true;
            },
        } as unknown as NonNullable<BoardChannel['VisualVideoBridge']>;
    }
}

/** A context whose client has a live inbound video track (a connected session). */
function liveContext(): RealtimeChannelContext & { Notes: string[] } {
    return makeChannelContext({
        Client: {
            IsTrackEstablished: (modality: string, direction: string) => modality === 'video' && direction === 'inbound',
            EstablishedTracks: [],
        } as unknown as RealtimeChannelContext['Client'],
    });
}

/** A context with no client: the channel is mounted but the call is not connected yet. */
function preConnectContext(): RealtimeChannelContext & { Notes: string[] } {
    return makeChannelContext();
}

describe('exposure: the effective level', () => {
    it('defaults to the channel ceiling, which is what every channel had before exposure policy', () => {
        expect(new BoardChannel().Exposure).toBe('pixels');
        const state = new BoardChannel();
        state.Ceiling = 'state';
        expect(state.Exposure).toBe('state');
    });

    it('is the minimum of the ceiling, the server policy and the user choice', () => {
        const channel = new BoardChannel();
        channel.ApplyExposure({ Policy: 'state' });
        expect(channel.Exposure).toBe('state');
        channel.ApplyExposure({ Policy: 'pixels', User: 'none' });
        expect(channel.Exposure).toBe('none');
        channel.ApplyExposure({ Policy: 'pixels', User: 'pixels' });
        expect(channel.Exposure).toBe('pixels');
    });

    it('can never be raised above the ceiling by policy or by the user', () => {
        const channel = new BoardChannel();
        channel.Ceiling = 'state';
        channel.ApplyExposure({ Policy: 'pixels', User: 'pixels' });
        expect(channel.Exposure).toBe('state');
    });

    it('a legacy channel (synthesized descriptor) is usable with ApplyExposure and keeps its ceiling', () => {
        class Legacy extends BaseRealtimeChannelClient {
            public get ChannelName(): string {
                return 'Legacy';
            }
        }
        const legacy = new Legacy();
        expect(legacy.Exposure).toBe('state');
        legacy.ApplyExposure({ Policy: 'none' });
        expect(legacy.Exposure).toBe('none');
    });

    it('exposes the reasons it was lowered', () => {
        const channel = new BoardChannel();
        channel.ApplyExposure({ Policy: 'state', Reasons: ['why'] });
        expect(channel.ExposureReasons).toEqual(['why']);
    });
});

describe('exposure gates what the model is told (state)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('at state or pixels a change produces the coalesced structured note', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.Edit(2);
        vi.advanceTimersByTime(800);
        expect(ctx.Notes.filter((n) => n.includes('state_changed'))).toHaveLength(1);
    });

    it('at none the model hears NOTHING about changes, but Events$ still sees every change', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.ApplyExposure({ Policy: 'none' });
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        channel.Edit(2);
        vi.advanceTimersByTime(2000);
        expect(ctx.Notes.filter((n) => n.includes('state_changed'))).toEqual([]);
        expect(events.some((e) => e.Name === 'state_changed')).toBe(true);
    });

    it('withdrawing exposure drops a note that was already pending', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.Edit(2); // arms the debounce
        channel.ApplyExposure({ Policy: 'none' });
        vi.advanceTimersByTime(2000);
        expect(ctx.Notes.filter((n) => n.includes('state_changed'))).toEqual([]);
    });

    it('restoring exposure re-baselines: the model gets a FULL snapshot, not a delta against a stale picture', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.Edit(2);
        vi.advanceTimersByTime(800); // the model has been told a snapshot with a: 2
        ctx.Notes.length = 0;
        channel.ApplyExposure({ Policy: 'none' });
        channel.Edit(3); // happened while the model could not see
        channel.ApplyExposure({ Policy: 'state' });
        vi.advanceTimersByTime(800);
        const note = ctx.Notes.find((n) => n.includes('state_changed'));
        expect(note).toContain('"snapshot"');
        expect(note).toContain('"a":3');
    });

    it('the opened note carries the state only when exposure allows it', async () => {
        const channel = new FormChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        await channel.Open({ title: 'T' });
        expect(ctx.Notes.at(-1)).toContain('"state"');

        const hidden = new FormChannel();
        const hiddenCtx = liveContext();
        hidden.Initialize(hiddenCtx);
        hidden.ApplyExposure({ Policy: 'none' });
        await hidden.Open({ title: 'T' });
        expect(hiddenCtx.Notes.at(-1)).toContain('opened');
        expect(hiddenCtx.Notes.at(-1)).not.toContain('"state"');
        expect(hiddenCtx.Notes.at(-1)).toContain('"exposure":"none"');
    });

    it('the completed note carries the output only when exposure allows it', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.Finish();
        expect(ctx.Notes.at(-1)).toContain('"done":true');

        const hidden = new BoardChannel();
        const hiddenCtx = liveContext();
        hidden.Initialize(hiddenCtx);
        hidden.ApplyExposure({ Policy: 'none' });
        hidden.Finish();
        expect(hiddenCtx.Notes.at(-1)).toContain('completed');
        expect(hiddenCtx.Notes.at(-1)).not.toContain('"done"');
    });
});

describe('exposure gates frames (pixels)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('at pixels a change pushes a frame', async () => {
        vi.setSystemTime(100_000);
        const channel = new BoardChannel();
        channel.Initialize(liveContext());
        channel.EnableVision();
        channel.InstallBridge([]);
        await channel.Picture();
        expect(channel.Pushed).toEqual(['frame-1']);
    });

    it('at state a change pushes NO frame (state notes still flow)', async () => {
        vi.setSystemTime(100_000);
        const channel = new BoardChannel();
        channel.Initialize(liveContext());
        channel.EnableVision();
        channel.InstallBridge([]);
        channel.ApplyExposure({ Policy: 'state' });
        await channel.Picture();
        expect(channel.Pushed).toEqual([]);
    });

    it('a pending settle frame is dropped when pixels are withdrawn, and a fresh one is sent when restored', async () => {
        vi.setSystemTime(100_000);
        const channel = new BoardChannel();
        channel.Initialize(liveContext());
        channel.EnableVision();
        channel.InstallBridge([]);
        await channel.Picture(); // leading frame
        await channel.Picture(); // inside the cooldown: arms the trailing settle
        channel.ApplyExposure({ Policy: 'state' });
        await vi.advanceTimersByTimeAsync(2000);
        expect(channel.Pushed).toEqual(['frame-1']); // the settle never fired

        channel.Frame = 'frame-2';
        channel.ApplyExposure({ Policy: 'pixels' });
        await vi.advanceTimersByTimeAsync(2000);
        expect(channel.Pushed).toEqual(['frame-1', 'frame-2']);
    });

    it('switches its video source off at the arbiter (silently: the channel tells the model itself) and back on', () => {
        const channel = new BoardChannel();
        channel.Initialize(liveContext());
        channel.EnableVision();
        const calls: Array<{ Enabled: boolean; Notify: boolean }> = [];
        channel.InstallBridge(calls);
        channel.ApplyExposure({ User: 'state' });
        channel.ApplyExposure({});
        expect(calls).toEqual([
            { Enabled: false, Notify: false },
            { Enabled: true, Notify: false },
        ]);
    });

    it('does not request the video track when the SERVER policy rules pixels out, but still does for a user toggle', () => {
        const channel = new BoardChannel();
        channel.Initialize(preConnectContext());
        channel.EnableVision();
        expect(channel.GetSourcedTracks()).toHaveLength(1);

        const policed = new BoardChannel();
        policed.ApplyExposure({ Policy: 'state' });
        policed.Initialize(preConnectContext());
        policed.EnableVision();
        expect(policed.GetSourcedTracks()).toEqual([]);

        const userOff = new BoardChannel();
        userOff.ApplyExposure({ User: 'state' });
        userOff.Initialize(preConnectContext());
        userOff.EnableVision();
        expect(userOff.GetSourcedTracks()).toHaveLength(1); // the user can turn it back on mid-call
    });
});

describe('exposure changes are announced to the agent', () => {
    it('tells the model what changed and why once the call is live', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.ApplyExposure({ Policy: 'state', Reasons: ['this agent requires a zero-data-retention model'] });
        const note = ctx.Notes.at(-1) ?? '';
        expect(note).toContain('[channel:Board#1] exposure_changed');
        expect(note).toContain('"exposure":"state"');
        expect(note).toContain('"was":"pixels"');
        expect(note).toContain("'pixels' is withheld");
        expect(note).toContain('zero-data-retention');
    });

    it('says nothing before the call is connected (the catalog note carries the limits then)', () => {
        const channel = new BoardChannel();
        const ctx = preConnectContext();
        channel.Initialize(ctx);
        channel.ApplyExposure({ Policy: 'none' });
        expect(ctx.Notes).toEqual([]);
    });

    it('emits exposure_changed on Events$ regardless, and nothing when nothing changed', () => {
        const channel = new BoardChannel();
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        channel.ApplyExposure({ Policy: 'state' });
        channel.ApplyExposure({ Policy: 'state' });
        const changes = events.filter((e) => e.Name === 'exposure_changed');
        expect(changes).toHaveLength(1);
        expect(changes[0].Payload).toMatchObject({ exposure: 'state', was: 'pixels' });
    });

    it('announces restoring exposure without a limit sentence', () => {
        const channel = new BoardChannel();
        const ctx = liveContext();
        channel.Initialize(ctx);
        channel.ApplyExposure({ User: 'none' });
        channel.ApplyExposure({});
        const note = ctx.Notes.at(-1) ?? '';
        expect(note).toContain('"exposure":"pixels"');
        expect(note).not.toContain('limit');
    });
});
