/**
 * Unit tests for {@link MeetingControlsChannelServer} — the server-only facilitator channel.
 * Pins: ClassFactory registration; the SERVER-ONLY contract (it has no client surface and its
 * server-tool hooks are the whole interface); the DYNAMIC tool vocabulary (MuteParticipant present
 * only when the platform advertises the capability); tool execution (raise/lower/call-on/mute/timer)
 * including capability-gated mute and malformed-arg tolerance; and the perception feed wiring from
 * the injected event source through the context's SendContextNote sink. Zero platform — the bridge
 * event source is faked and the clock is injected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseRealtimeChannelServer, RealtimeChannelServerContext } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import {
    MeetingControlsChannelServer,
    LoadMeetingControlsChannelServer,
    IMeetingControlsEventSource,
    MeetingControlsCapability,
    MEETING_CONTROLS_TOOL_PREFIX,
} from '../realtime/meeting-controls-channel-server';
import { MeetingParticipant } from '../realtime/meeting-controls-state';

/** A controllable clock. */
class FakeClock {
    public nowMs = 1_000_000;
    public read = (): number => this.nowMs;
    public advance(seconds: number): void { this.nowMs += seconds * 1000; }
}

/** A fake bridge event source the test drives directly. */
class FakeEventSource implements IMeetingControlsEventSource {
    public rosterHandler: ((p: MeetingParticipant[]) => void) | null = null;
    public speakingHandler: ((ids: string[]) => void) | null = null;
    public handHandler: ((id: string, raised: boolean) => void) | null = null;
    public mutedIds: string[] = [];
    public muteShouldThrow = false;

    constructor(public readonly Capabilities: ReadonlyArray<MeetingControlsCapability> = ['Mute']) {}

    OnRosterChange(h: (p: MeetingParticipant[]) => void): void { this.rosterHandler = h; }
    OnSpeakingChange(h: (ids: string[]) => void): void { this.speakingHandler = h; }
    OnHandRaiseChange(h: (id: string, raised: boolean) => void): void { this.handHandler = h; }
    async MuteParticipant(id: string): Promise<void> {
        if (this.muteShouldThrow) { throw new Error('mute failed'); }
        this.mutedIds.push(id);
    }

    // drivers
    emitRoster(p: MeetingParticipant[]): void { this.rosterHandler?.(p); }
    emitSpeaking(ids: string[]): void { this.speakingHandler?.(ids); }
    emitHand(id: string, raised: boolean): void { this.handHandler?.(id, raised); }
}

function part(id: string, name = id, isAgent = false): MeetingParticipant {
    return { ParticipantId: id, DisplayName: name, Role: isAgent ? 'Agent' : 'Participant', IsAgent: isAgent };
}

/** Builds a started channel with a fake source + a context that captures perception notes. */
async function startChannel(opts: { capabilities?: MeetingControlsCapability[]; clock?: FakeClock } = {}): Promise<{
    channel: MeetingControlsChannelServer;
    source: FakeEventSource;
    notes: string[];
    clock: FakeClock;
}> {
    const clock = opts.clock ?? new FakeClock();
    const source = new FakeEventSource(opts.capabilities ?? ['Mute']);
    const channel = new MeetingControlsChannelServer({ EventSource: source, Clock: clock.read });
    const notes: string[] = [];
    const ctx: RealtimeChannelServerContext = {
        AgentSessionID: 's1', AgentID: 'a1', UserID: 'u1', ConversationID: null,
        SendContextNote: (t) => notes.push(t),
    };
    channel.Initialize(ctx);
    await channel.OnSessionStarted();
    return { channel, source, notes, clock };
}

const exec = (c: MeetingControlsChannelServer, bare: string, args = '{}') =>
    c.ExecuteServerTool(`${MEETING_CONTROLS_TOOL_PREFIX}${bare}`, args);

describe('MeetingControlsChannelServer — contract & registration', () => {
    it('registers under MeetingControlsChannelServer and reports its channel + prefix', () => {
        LoadMeetingControlsChannelServer();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelServer, 'MeetingControlsChannelServer');
        expect(reg).toBeTruthy();
        const inst = new MeetingControlsChannelServer();
        expect(inst.ChannelName).toBe('Meeting Controls');
        expect(inst.ToolNamePrefix).toBe(MEETING_CONTROLS_TOOL_PREFIX);
    });

    it('is a server-only channel — there is no GetSurfaceComponent on the server half', () => {
        const inst = new MeetingControlsChannelServer();
        // The server channel contract has no surface concept at all; assert the method is absent.
        expect((inst as unknown as Record<string, unknown>)['GetSurfaceComponent']).toBeUndefined();
    });

    it('a discovery instance (no event source) is inert at session start but still lists tools', async () => {
        const inst = new MeetingControlsChannelServer();
        inst.Initialize({ AgentSessionID: 's', AgentID: 'a', UserID: 'u', ConversationID: null });
        await expect(inst.OnSessionStarted()).resolves.toBeUndefined();
        // No capability source → no Mute tool, but the rest of the vocabulary is present.
        const names = inst.GetServerToolDefinitions().map((t) => t.Name);
        expect(names).toContain('MeetingControls_RaiseHand');
        expect(names).not.toContain('MeetingControls_MuteParticipant');
    });
});

describe('MeetingControlsChannelServer — dynamic tool vocabulary', () => {
    it('includes MuteParticipant only when the platform advertises Mute', async () => {
        const withMute = await startChannel({ capabilities: ['Mute'] });
        expect(withMute.channel.GetServerToolDefinitions().map((t) => t.Name)).toContain('MeetingControls_MuteParticipant');

        const noMute = await startChannel({ capabilities: [] });
        expect(noMute.channel.GetServerToolDefinitions().map((t) => t.Name)).not.toContain('MeetingControls_MuteParticipant');
    });

    it('always offers RaiseHand, LowerHand, CallOnParticipant, SetTimer', async () => {
        const { channel } = await startChannel({ capabilities: [] });
        const names = channel.GetServerToolDefinitions().map((t) => t.Name);
        expect(names).toEqual(expect.arrayContaining([
            'MeetingControls_RaiseHand', 'MeetingControls_LowerHand',
            'MeetingControls_CallOnParticipant', 'MeetingControls_SetTimer',
        ]));
        // Every tool name carries the prefix (collision-safe).
        expect(names.every((n) => n.startsWith(MEETING_CONTROLS_TOOL_PREFIX))).toBe(true);
    });
});

describe('MeetingControlsChannelServer — tool execution', () => {
    it('RaiseHand enqueues a rostered participant and reports their position', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a', 'Alice'), part('b', 'Bob')]);

        const r = await exec(channel, 'RaiseHand', '{"participantId":"a"}');
        expect(r.Success).toBe(true);
        expect(channel.State.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['a']);
    });

    it('RaiseHand fails for a missing id or a non-rostered participant', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a')]);
        expect((await exec(channel, 'RaiseHand', '{}')).Success).toBe(false);
        expect((await exec(channel, 'RaiseHand', '{"participantId":"ghost"}')).Success).toBe(false);
    });

    it('CallOnParticipant calls the front of the queue when no id is given', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a', 'Alice'), part('b', 'Bob')]);
        await exec(channel, 'RaiseHand', '{"participantId":"a"}');
        await exec(channel, 'RaiseHand', '{"participantId":"b"}');

        const r = await exec(channel, 'CallOnParticipant', '{}');
        expect(r.Output).toContain('Alice');
        expect(channel.State.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['b']);
    });

    it('CallOnParticipant fails when the queue is empty', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a')]);
        expect((await exec(channel, 'CallOnParticipant', '{}')).Success).toBe(false);
    });

    it('MuteParticipant actuates the platform mute and mirrors state', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a', 'Alice')]);

        const r = await exec(channel, 'MuteParticipant', '{"participantId":"a"}');
        expect(r.Success).toBe(true);
        expect(source.mutedIds).toEqual(['a']);
        expect(channel.State.GetMuted()).toEqual(['a']);
    });

    it('MuteParticipant is refused when the platform lacks the capability', async () => {
        const { channel, source } = await startChannel({ capabilities: [] });
        source.emitRoster([part('a')]);
        const r = await exec(channel, 'MuteParticipant', '{"participantId":"a"}');
        expect(r.Success).toBe(false);
        expect(source.mutedIds).toEqual([]);
    });

    it('MuteParticipant surfaces a platform failure as a structured error (never throws)', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a')]);
        source.muteShouldThrow = true;
        const r = await exec(channel, 'MuteParticipant', '{"participantId":"a"}');
        expect(r.Success).toBe(false);
        expect(channel.State.GetMuted()).toEqual([]); // not marked when actuation failed
    });

    it('SetTimer sets / clears the agenda timer', async () => {
        const { channel } = await startChannel();
        expect((await exec(channel, 'SetTimer', '{"seconds":90}')).Success).toBe(true);
        expect(channel.State.GetTimer()?.DurationSeconds).toBe(90);
        await exec(channel, 'SetTimer', '{"seconds":0}');
        expect(channel.State.GetTimer()).toBeNull();
    });

    it('SetTimer rejects a missing/negative value', async () => {
        const { channel } = await startChannel();
        expect((await exec(channel, 'SetTimer', '{}')).Success).toBe(false);
        expect((await exec(channel, 'SetTimer', '{"seconds":-5}')).Success).toBe(false);
    });

    it('tolerates malformed argument JSON without throwing', async () => {
        const { channel } = await startChannel();
        await expect(exec(channel, 'RaiseHand', '{not json')).resolves.toMatchObject({ Success: false });
    });

    it('returns a structured failure for an unknown tool', async () => {
        const { channel } = await startChannel();
        const r = await exec(channel, 'Nonexistent', '{}');
        expect(r.Success).toBe(false);
    });
});

describe('MeetingControlsChannelServer — perception feed', () => {
    it('emits a perception note on roster, speaking, and platform hand-raise changes', async () => {
        const { source, notes } = await startChannel();
        source.emitRoster([part('a', 'Alice'), part('b', 'Bob')]);
        source.emitSpeaking(['a']);
        source.emitHand('b', true);

        expect(notes.some((n) => n.includes('roster changed'))).toBe(true);
        expect(notes.some((n) => n.includes('speaking changed'))).toBe(true);
        expect(notes.some((n) => n.includes('hand raised'))).toBe(true);
        // The latest note carries the queue with Bob in it.
        const last = notes[notes.length - 1];
        expect(last).toContain('"HandRaiseQueue"');
        expect(last).toContain('b');
    });

    it('platform hand-raise feeds the SAME queue as the agent tool', async () => {
        const { channel, source } = await startChannel();
        source.emitRoster([part('a'), part('b')]);
        source.emitHand('a', true);        // platform raise
        await exec(channel, 'RaiseHand', '{"participantId":"b"}'); // agent raise
        expect(channel.State.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['a', 'b']);
    });

    it('does not throw when the context supplies no perception sink', async () => {
        const source = new FakeEventSource();
        const channel = new MeetingControlsChannelServer({ EventSource: source });
        channel.Initialize({ AgentSessionID: 's', AgentID: 'a', UserID: 'u', ConversationID: null }); // no SendContextNote
        await channel.OnSessionStarted();
        expect(() => source.emitRoster([part('a')])).not.toThrow();
    });
});
