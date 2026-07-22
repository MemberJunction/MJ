import { describe, it, expect } from 'vitest';
import { resamplePcm16Buffer } from '@memberjunction/ai-bridge-base';
import {
    RealTeamsBindings,
    buildGraphCreateCallRequest,
    parseTeamsJoinUrl,
    mapGraphRole,
    normalizeGraphParticipant,
    normalizeGraphRoster,
    transcodeInboundAudio,
    transcodeOutboundAudio,
    GraphCallParticipant,
    GraphCreateCallRequest,
    GraphCreateCallResult,
    IGraphCallsLike,
    IAcsMediaLike,
    AcsInboundAudioFrame,
} from '../real-teams-bindings';
import { TeamsAudioFrame, TeamsParticipant, TeamsJoinArgs } from '../teams-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// Test fixtures.
// ──────────────────────────────────────────────────────────────────────────────

const TEAMS_JOIN_URL =
    'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_ZmExOTk5%40thread.v2/0?context=%7B%22Tid%22%3A%22tenant-123%22%2C%22Oid%22%3A%22organizer-456%22%7D';

function pcm16(...samples: number[]): ArrayBuffer {
    const buf = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buf);
    samples.forEach((s, i) => view.setInt16(i * 2, s, true));
    return buf;
}

// ──────────────────────────────────────────────────────────────────────────────
// Fakes for the injected Graph + ACS surfaces — no network, no Graph/ACS install.
// ──────────────────────────────────────────────────────────────────────────────

class FakeGraph implements IGraphCallsLike {
    public Created?: GraphCreateCallRequest;
    public Deleted: string[] = [];
    public Chats: Array<{ threadId: string; text: string }> = [];
    public Muted: Array<{ callId: string; participantId: string }> = [];
    public Roster: GraphCallParticipant[];

    private participantsHandler?: (participants: GraphCallParticipant[]) => void;
    private endedHandler?: () => void;

    constructor(roster: GraphCallParticipant[] = []) {
        this.Roster = roster;
    }

    public async CreateCall(request: GraphCreateCallRequest): Promise<GraphCreateCallResult> {
        this.Created = request;
        return { CallId: 'call-1', BotParticipantId: 'bot-1' };
    }
    public async DeleteCall(callId: string): Promise<void> {
        this.Deleted.push(callId);
    }
    public async GetParticipants(): Promise<GraphCallParticipant[]> {
        return [...this.Roster];
    }
    public async PostChatMessage(threadId: string, text: string): Promise<void> {
        this.Chats.push({ threadId, text });
    }
    public async MuteParticipant(callId: string, participantId: string): Promise<void> {
        this.Muted.push({ callId, participantId });
    }
    public OnParticipantsUpdated(_callId: string, handler: (participants: GraphCallParticipant[]) => void): void {
        this.participantsHandler = handler;
    }
    public OnCallEnded(_callId: string, handler: () => void): void {
        this.endedHandler = handler;
    }

    // drive helpers
    public DriveParticipants(participants: GraphCallParticipant[]): void {
        this.participantsHandler?.(participants);
    }
    public DriveEnded(): void {
        this.endedHandler?.();
    }
}

/** ACS media fake WITH hand-raise support. */
class FakeAcsMedia implements IAcsMediaLike {
    public readonly SampleRate: number;
    public readonly Sent: ArrayBuffer[] = [];
    private audioHandler?: (frame: AcsInboundAudioFrame) => void;
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    constructor(sampleRate = 16000) {
        this.SampleRate = sampleRate;
    }

    public SendAudioFrame(_callId: string, pcm: ArrayBuffer): void {
        this.Sent.push(pcm);
    }
    public OnAudioFrame(_callId: string, handler: (frame: AcsInboundAudioFrame) => void): void {
        this.audioHandler = handler;
    }
    public OnHandRaise(_callId: string, handler: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = handler;
    }

    public DriveInbound(frame: AcsInboundAudioFrame): void {
        this.audioHandler?.(frame);
    }
    public DriveHandRaise(participantId: string, raised: boolean): void {
        this.handRaiseHandler?.(participantId, raised);
    }
}

/** ACS media fake WITHOUT hand-raise support — the tenant/build that omits the optional method. */
class FakeAcsMediaNoHandRaise implements IAcsMediaLike {
    public readonly SampleRate = 16000;
    public readonly Sent: ArrayBuffer[] = [];
    private audioHandler?: (frame: AcsInboundAudioFrame) => void;

    public SendAudioFrame(_callId: string, pcm: ArrayBuffer): void {
        this.Sent.push(pcm);
    }
    public OnAudioFrame(_callId: string, handler: (frame: AcsInboundAudioFrame) => void): void {
        this.audioHandler = handler;
    }
    public DriveInbound(frame: AcsInboundAudioFrame): void {
        this.audioHandler?.(frame);
    }
    // Intentionally NO OnHandRaise method.
}

function makeBindings(opts?: {
    roster?: GraphCallParticipant[];
    acsRate?: number;
    modelRate?: number;
}): { bindings: RealTeamsBindings; graph: FakeGraph; media: FakeAcsMedia } {
    const graph = new FakeGraph(opts?.roster ?? []);
    const media = new FakeAcsMedia(opts?.acsRate ?? 16000);
    const bindings = new RealTeamsBindings({ Graph: graph, Media: media, ModelSampleRate: opts?.modelRate ?? 16000 });
    return { bindings, graph, media };
}

const JOIN_ARGS: TeamsJoinArgs = { JoinUrl: TEAMS_JOIN_URL, BotDisplayName: 'Sage' };

// ──────────────────────────────────────────────────────────────────────────────
// Pure: meeting-URL / coordinate parsing.
// ──────────────────────────────────────────────────────────────────────────────

describe('parseTeamsJoinUrl', () => {
    it('extracts the thread id, organizer, and tenant from a full join URL', () => {
        const coords = parseTeamsJoinUrl(TEAMS_JOIN_URL);
        expect(coords).not.toBeNull();
        expect(coords!.ThreadId).toBe('19:meeting_ZmExOTk5@thread.v2');
        expect(coords!.OrganizerId).toBe('organizer-456');
        expect(coords!.TenantId).toBe('tenant-123');
        expect(coords!.MessageId).toBe('0');
    });

    it('extracts the thread id when there is no context blob', () => {
        const coords = parseTeamsJoinUrl(
            'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_ABC%40thread.v2/0',
        );
        expect(coords!.ThreadId).toBe('19:meeting_ABC@thread.v2');
        expect(coords!.OrganizerId).toBeUndefined();
        expect(coords!.TenantId).toBeUndefined();
    });

    it('tolerates a malformed context blob without throwing', () => {
        const coords = parseTeamsJoinUrl(
            'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_ABC%40thread.v2/0?context=not-json',
        );
        expect(coords!.ThreadId).toBe('19:meeting_ABC@thread.v2');
        expect(coords!.OrganizerId).toBeUndefined();
    });

    it('returns null when no thread id is present', () => {
        expect(parseTeamsJoinUrl('https://teams.microsoft.com/somethingelse')).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure: Graph create-call request shape (join payload construction).
// ──────────────────────────────────────────────────────────────────────────────

describe('buildGraphCreateCallRequest', () => {
    it('builds an application-hosted-media meeting-join request from a join URL', () => {
        const req = buildGraphCreateCallRequest(JOIN_ARGS);
        expect(req.CallType).toBe('meeting');
        expect(req.AppHostedMedia).toBe(true);
        expect(req.BotDisplayName).toBe('Sage');
        expect(req.JoinWebUrl).toBe(TEAMS_JOIN_URL);
        expect(req.ThreadId).toBe('19:meeting_ZmExOTk5@thread.v2');
        expect(req.OrganizerId).toBe('organizer-456');
        expect(req.TenantId).toBe('tenant-123');
    });

    it('prefers an explicit ThreadId / TenantId over the URL-parsed values', () => {
        const req = buildGraphCreateCallRequest({
            ...JOIN_ARGS,
            ThreadId: '19:meeting_EXPLICIT@thread.v2',
            TenantId: 'tenant-override',
        });
        expect(req.ThreadId).toBe('19:meeting_EXPLICIT@thread.v2');
        expect(req.TenantId).toBe('tenant-override');
    });

    it('throws when no thread id can be resolved', () => {
        expect(() =>
            buildGraphCreateCallRequest({ JoinUrl: 'https://teams.microsoft.com/nope', BotDisplayName: 'Sage' }),
        ).toThrow(/could not resolve a meeting thread id/i);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure: roster normalization.
// ──────────────────────────────────────────────────────────────────────────────

describe('roster normalization', () => {
    it('mapGraphRole maps organizer/presenter/coorganizer/attendee', () => {
        expect(mapGraphRole('organizer')).toBe('Organizer');
        expect(mapGraphRole('presenter')).toBe('Presenter');
        expect(mapGraphRole('coOrganizer')).toBe('Presenter');
        expect(mapGraphRole('attendee')).toBe('Attendee');
        expect(mapGraphRole(undefined)).toBe('Attendee');
    });

    it('normalizeGraphParticipant maps a Graph participant onto the bridge shape', () => {
        const p = normalizeGraphParticipant({ id: 'p-alice', displayName: 'Alice', role: 'organizer', isSelf: false });
        expect(p).toEqual<TeamsParticipant>({
            ParticipantId: 'p-alice',
            DisplayName: 'Alice',
            Role: 'Organizer',
            IsSelf: false,
        });
    });

    it('normalizeGraphRoster maps a full collection', () => {
        const roster = normalizeGraphRoster([
            { id: 'p-alice', displayName: 'Alice', role: 'organizer' },
            { id: 'bot-1', displayName: 'Sage', role: 'attendee', isSelf: true },
        ]);
        expect(roster.map((p) => p.ParticipantId)).toEqual(['p-alice', 'bot-1']);
        expect(roster[0].Role).toBe('Organizer');
        expect(roster[1].IsSelf).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure: audio transcode via the T0 codec (round-trip).
// ──────────────────────────────────────────────────────────────────────────────

describe('audio transcode (T0 codec)', () => {
    it('passes PCM through unchanged when ACS and model rates match', () => {
        const frame: AcsInboundAudioFrame = { Pcm: pcm16(100, -100, 5000), ParticipantId: 'p-alice', TimestampMs: 7 };
        const out = transcodeInboundAudio(frame, 16000, 16000);
        expect(new Uint8Array(out.Pcm)).toEqual(new Uint8Array(frame.Pcm));
        expect(out.ParticipantId).toBe('p-alice');
        expect(out.TimestampMs).toBe(7);
    });

    it('resamples inbound ACS 16k → model 24k via the T0 codec, preserving the speaker label', () => {
        const src = pcm16(0, 1000, 2000, 3000, 4000, 5000);
        const frame: AcsInboundAudioFrame = { Pcm: src, ParticipantId: 'p-bob', DisplayName: 'Bob' };
        const out = transcodeInboundAudio(frame, 16000, 24000);
        const expected = resamplePcm16Buffer(src, 16000, 24000);
        expect(new Uint8Array(out.Pcm)).toEqual(new Uint8Array(expected));
        expect(out.ParticipantId).toBe('p-bob');
        expect(out.DisplayName).toBe('Bob');
    });

    it('resamples outbound model 24k → ACS 16k via the T0 codec', () => {
        const src = pcm16(0, 1000, 2000, 3000, 4000, 5000);
        const out = transcodeOutboundAudio(src, 24000, 16000);
        const expected = resamplePcm16Buffer(src, 24000, 16000);
        expect(new Uint8Array(out)).toEqual(new Uint8Array(expected));
    });

    it('outbound returns a fresh copy (never the same reference) when rates match', () => {
        const src = pcm16(1, 2, 3);
        const out = transcodeOutboundAudio(src, 16000, 16000);
        expect(out).not.toBe(src);
        expect(new Uint8Array(out)).toEqual(new Uint8Array(src));
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealTeamsBindings — join payload + lifecycle via the injected Graph surface.
// ──────────────────────────────────────────────────────────────────────────────

describe('RealTeamsBindings — join / leave', () => {
    it('join posts a Graph create-call request and returns the bot + call handles', async () => {
        const { bindings, graph } = makeBindings();
        const result = await bindings.join(JOIN_ARGS);
        expect(result).toEqual({ BotParticipantId: 'bot-1', CallId: 'call-1' });
        expect(graph.Created?.CallType).toBe('meeting');
        expect(graph.Created?.AppHostedMedia).toBe(true);
        expect(graph.Created?.ThreadId).toBe('19:meeting_ZmExOTk5@thread.v2');
        expect(graph.Created?.BotDisplayName).toBe('Sage');
    });

    it('leave issues a Graph DeleteCall for the active call', async () => {
        const { bindings, graph } = makeBindings();
        await bindings.join(JOIN_ARGS);
        await bindings.leave();
        expect(graph.Deleted).toEqual(['call-1']);
    });

    it('leave is a no-op (no throw) before join', async () => {
        const { bindings, graph } = makeBindings();
        await expect(bindings.leave()).resolves.toBeUndefined();
        expect(graph.Deleted.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealTeamsBindings — audio in/out via the injected ACS surface.
// ──────────────────────────────────────────────────────────────────────────────

describe('RealTeamsBindings — audio', () => {
    it('sendAudioFrame transcodes model→ACS rate and pushes to the outbound socket', async () => {
        const { bindings, media } = makeBindings({ acsRate: 16000, modelRate: 24000 });
        await bindings.join(JOIN_ARGS);
        const src = pcm16(0, 1000, 2000, 3000);
        bindings.sendAudioFrame(src);
        expect(media.Sent.length).toBe(1);
        expect(new Uint8Array(media.Sent[0])).toEqual(new Uint8Array(resamplePcm16Buffer(src, 24000, 16000)));
    });

    it('sendAudioFrame drops audio (no throw) before join', () => {
        const { bindings, media } = makeBindings();
        bindings.sendAudioFrame(pcm16(1, 2));
        expect(media.Sent.length).toBe(0);
    });

    it('onAudioFrame delivers diarized, transcoded inbound frames', async () => {
        const { bindings, media } = makeBindings({ acsRate: 16000, modelRate: 24000 });
        const heard: TeamsAudioFrame[] = [];
        bindings.onAudioFrame((f) => heard.push(f));
        await bindings.join(JOIN_ARGS);

        const src = pcm16(0, 1000, 2000, 3000);
        media.DriveInbound({ Pcm: src, ParticipantId: 'p-alice', DisplayName: 'Alice', TimestampMs: 42 });

        expect(heard.length).toBe(1);
        expect(heard[0].ParticipantId).toBe('p-alice');
        expect(heard[0].DisplayName).toBe('Alice');
        expect(heard[0].TimestampMs).toBe(42);
        expect(new Uint8Array(heard[0].Pcm)).toEqual(new Uint8Array(resamplePcm16Buffer(src, 16000, 24000)));
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealTeamsBindings — roster, chat, mute (REST shape via injected mock).
// ──────────────────────────────────────────────────────────────────────────────

describe('RealTeamsBindings — roster / chat / mute', () => {
    it('getParticipants normalizes the Graph roster', async () => {
        const { bindings } = makeBindings({
            roster: [
                { id: 'p-alice', displayName: 'Alice', role: 'organizer' },
                { id: 'bot-1', displayName: 'Sage', role: 'attendee', isSelf: true },
            ],
        });
        await bindings.join(JOIN_ARGS);
        const roster = await bindings.getParticipants();
        expect(roster.find((p) => p.ParticipantId === 'p-alice')?.Role).toBe('Organizer');
        expect(roster.find((p) => p.ParticipantId === 'bot-1')?.IsSelf).toBe(true);
    });

    it('postChatMessage posts to the resolved meeting thread', async () => {
        const { bindings, graph } = makeBindings();
        await bindings.join(JOIN_ARGS);
        await bindings.postChatMessage('Some context here.');
        expect(graph.Chats).toEqual([{ threadId: '19:meeting_ZmExOTk5@thread.v2', text: 'Some context here.' }]);
    });

    it('postChatMessage is a no-op (no throw) before join', async () => {
        const { bindings, graph } = makeBindings();
        await expect(bindings.postChatMessage('hi')).resolves.toBeUndefined();
        expect(graph.Chats.length).toBe(0);
    });

    it('muteParticipant issues a Graph participant:mute against the active call', async () => {
        const { bindings, graph } = makeBindings();
        await bindings.join(JOIN_ARGS);
        await bindings.muteParticipant('p-alice');
        expect(graph.Muted).toEqual([{ callId: 'call-1', participantId: 'p-alice' }]);
    });

    it('participantsUpdated diffs the roster into per-participant join/leave events', async () => {
        const { bindings, graph } = makeBindings();
        const joined: string[] = [];
        const left: string[] = [];
        bindings.onParticipantJoin((p) => joined.push(p.ParticipantId));
        bindings.onParticipantLeave((id) => left.push(id));
        await bindings.join(JOIN_ARGS);

        graph.DriveParticipants([{ id: 'p-alice', role: 'organizer' }]);
        graph.DriveParticipants([
            { id: 'p-alice', role: 'organizer' },
            { id: 'p-bob', role: 'attendee' },
        ]);
        graph.DriveParticipants([{ id: 'p-bob', role: 'attendee' }]);

        expect(joined).toEqual(['p-alice', 'p-bob']);
        expect(left).toEqual(['p-alice']);
    });

    it('onMeetingEnded fires on a Graph callEnded notification', async () => {
        const { bindings, graph } = makeBindings();
        let ended = false;
        bindings.onMeetingEnded(() => (ended = true));
        await bindings.join(JOIN_ARGS);
        graph.DriveEnded();
        expect(ended).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealTeamsBindings — hand-raise (present) + hand-raise-absence tolerance.
// ──────────────────────────────────────────────────────────────────────────────

describe('RealTeamsBindings — hand-raise', () => {
    it('forwards hand-raise events when the ACS plane exposes the optional method', async () => {
        const { bindings, media } = makeBindings();
        const events: Array<{ id: string; raised: boolean }> = [];
        bindings.onHandRaise((id, raised) => events.push({ id, raised }));
        await bindings.join(JOIN_ARGS);

        media.DriveHandRaise('p-alice', true);
        media.DriveHandRaise('p-alice', false);

        expect(events).toEqual([
            { id: 'p-alice', raised: true },
            { id: 'p-alice', raised: false },
        ]);
    });

    it('tolerates an ACS plane WITHOUT OnHandRaise — join does not throw, handler simply never fires', async () => {
        const graph = new FakeGraph();
        const media = new FakeAcsMediaNoHandRaise();
        const bindings = new RealTeamsBindings({ Graph: graph, Media: media });
        let fired = false;
        bindings.onHandRaise(() => (fired = true));
        await expect(bindings.join(JOIN_ARGS)).resolves.toMatchObject({ CallId: 'call-1' });
        expect(fired).toBe(false);
    });
});
