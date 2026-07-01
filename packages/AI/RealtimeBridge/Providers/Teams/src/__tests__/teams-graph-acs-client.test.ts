import { describe, it, expect, vi } from 'vitest';
import {
    RealGraphCallsClient,
    PumpBackedAcsMedia,
    buildGraphCallBody,
    readCreateCallResult,
    readParticipantsCollection,
    readGraphParticipant,
    defaultGraphModuleLoader,
    type GraphModuleLike,
    type GraphClientLike,
    type GraphRequestLike,
    type IAcsMediaPump,
} from '../teams-graph-acs-client';
import type {
    GraphCreateCallRequest,
    GraphCallParticipant,
    AcsInboundAudioFrame,
} from '../real-teams-bindings';

// ──────────────────────────────────────────────────────────────────────────────
// A fake Graph module + client recording every api(path)/verb/body, with no SDK
// install and no network. Mirrors the FakeTwilioModule pattern in the Twilio tests.
// ──────────────────────────────────────────────────────────────────────────────

interface RecordedCall {
    path: string;
    verb: 'post' | 'get' | 'delete';
    body?: unknown;
}

class FakeGraphClient implements GraphClientLike {
    public readonly Calls: RecordedCall[] = [];
    /** Per-path canned responses, keyed by `${verb} ${path}`. */
    private readonly responses = new Map<string, unknown>();

    public SetResponse(verb: 'post' | 'get' | 'delete', path: string, response: unknown): void {
        this.responses.set(`${verb} ${path}`, response);
    }

    public api(path: string): GraphRequestLike {
        const record = (verb: 'post' | 'get' | 'delete', body?: unknown): Promise<unknown> => {
            this.Calls.push({ path, verb, body });
            return Promise.resolve(this.responses.get(`${verb} ${path}`) ?? {});
        };
        return {
            post: (body: unknown) => record('post', body),
            get: () => record('get'),
            delete: () => record('delete'),
        };
    }
}

function fakeModule(client: FakeGraphClient): { mod: GraphModuleLike; initCalls: GraphInitArgs[] } {
    const initCalls: GraphInitArgs[] = [];
    const mod: GraphModuleLike = {
        Client: {
            init: (options) => {
                // Capture the token the auth provider yields, proving the bearer wiring.
                let captured: string | null = null;
                options.authProvider((_e, token) => {
                    captured = token;
                });
                initCalls.push({ token: captured });
                return client;
            },
        },
    };
    return { mod, initCalls };
}

interface GraphInitArgs {
    token: string | null;
}

const JOIN_REQUEST: GraphCreateCallRequest = {
    CallType: 'meeting',
    BotDisplayName: 'AI Agent',
    JoinWebUrl: 'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_X%40thread.v2/0',
    ThreadId: '19:meeting_X@thread.v2',
    TenantId: 'tenant-123',
    AppHostedMedia: true,
};

describe('buildGraphCallBody (pure)', () => {
    it('maps the bridge request onto the Graph appHostedMedia call body', () => {
        const body = buildGraphCallBody(JOIN_REQUEST);
        expect(body['@odata.type']).toBe('#microsoft.graph.call');
        expect(body.mediaConfig['@odata.type']).toBe('#microsoft.graph.appHostedMediaConfig');
        expect(body.chatInfo.threadId).toBe('19:meeting_X@thread.v2');
        expect(body.meetingInfo.joinWebUrl).toBe(JOIN_REQUEST.JoinWebUrl);
        expect(body.tenantId).toBe('tenant-123');
    });

    it('omits tenantId when the request carries none', () => {
        const body = buildGraphCallBody({ ...JOIN_REQUEST, TenantId: undefined });
        expect('tenantId' in body).toBe(false);
    });
});

describe('readCreateCallResult (pure)', () => {
    it('reads the call id + bot participant id from a Graph response', () => {
        const result = readCreateCallResult({ id: 'call-9', myParticipantId: 'bot-9' });
        expect(result).toEqual({ CallId: 'call-9', BotParticipantId: 'bot-9' });
    });

    it('falls back to the call id when myParticipantId is absent', () => {
        const result = readCreateCallResult({ id: 'call-9' });
        expect(result.BotParticipantId).toBe('call-9');
    });

    it('throws when the response carries no call id', () => {
        expect(() => readCreateCallResult({})).toThrow(/no call id/i);
        expect(() => readCreateCallResult(null)).toThrow(/no call id/i);
    });
});

describe('readParticipantsCollection / readGraphParticipant (pure)', () => {
    it('reads a Graph participants collection into bridge participants', () => {
        const response = {
            value: [
                { id: 'p1', info: { identity: { user: { displayName: 'Alice' } } }, role: 'organizer' },
                { id: 'p2', info: { identity: { user: { displayName: 'Bob' } } }, meetingRole: 'attendee' },
            ],
        };
        const roster = readParticipantsCollection(response);
        expect(roster).toHaveLength(2);
        expect(roster[0]).toMatchObject({ id: 'p1', displayName: 'Alice', role: 'organizer' });
        expect(roster[1]).toMatchObject({ id: 'p2', displayName: 'Bob', role: 'attendee' });
    });

    it('returns an empty roster when value is missing or not an array', () => {
        expect(readParticipantsCollection({})).toEqual([]);
        expect(readParticipantsCollection({ value: 'nope' })).toEqual([]);
        expect(readParticipantsCollection(null)).toEqual([]);
    });

    it('marks the bot leg as self when the identity is an application with media streams', () => {
        const bot = readGraphParticipant({
            id: 'bot-1',
            info: { identity: { application: { id: 'app-1' } } },
            mediaStreams: [{ mediaType: 'audio' }],
            role: 'attendee',
        });
        expect(bot.isSelf).toBe(true);
    });
});

describe('RealGraphCallsClient', () => {
    it('builds the client once (memoized) and yields the resolved bearer token to authProvider', async () => {
        const fake = new FakeGraphClient();
        const { mod, initCalls } = fakeModule(fake);
        const loader = vi.fn(async () => mod);
        const client = new RealGraphCallsClient({ AccessToken: 'tok-abc', TenantId: 't1' }, loader);

        fake.SetResponse('post', '/communications/calls', { id: 'call-1', myParticipantId: 'bot-1' });
        await client.CreateCall(JOIN_REQUEST);
        await client.DeleteCall('call-1');

        expect(loader).toHaveBeenCalledTimes(1); // memoized
        expect(initCalls).toHaveLength(1);
        expect(initCalls[0].token).toBe('tok-abc');
    });

    it('CreateCall posts the appHostedMedia body and reads the result', async () => {
        const fake = new FakeGraphClient();
        fake.SetResponse('post', '/communications/calls', { id: 'call-7', myParticipantId: 'bot-7' });
        const client = new RealGraphCallsClient({ AccessToken: 'tok' }, async () => fakeModule(fake).mod);

        const result = await client.CreateCall(JOIN_REQUEST);

        expect(result).toEqual({ CallId: 'call-7', BotParticipantId: 'bot-7' });
        const post = fake.Calls.find((c) => c.path === '/communications/calls' && c.verb === 'post');
        expect(post).toBeDefined();
        const body = post?.body as { chatInfo: { threadId: string } };
        expect(body.chatInfo.threadId).toBe('19:meeting_X@thread.v2');
    });

    it('DeleteCall / GetParticipants / PostChatMessage / MuteParticipant address the right Graph paths', async () => {
        const fake = new FakeGraphClient();
        fake.SetResponse('get', '/communications/calls/call-1/participants', {
            value: [{ id: 'p1', info: { identity: { user: { displayName: 'Alice' } } }, role: 'presenter' }],
        });
        const client = new RealGraphCallsClient({ AccessToken: 'tok' }, async () => fakeModule(fake).mod);

        await client.DeleteCall('call-1');
        const roster = await client.GetParticipants('call-1');
        await client.PostChatMessage('19:meeting_X@thread.v2', 'hello');
        await client.MuteParticipant('call-1', 'p1');

        expect(roster).toHaveLength(1);
        expect(roster[0]).toMatchObject({ id: 'p1', role: 'presenter' });
        const paths = fake.Calls.map((c) => `${c.verb} ${c.path}`);
        expect(paths).toContain('delete /communications/calls/call-1');
        expect(paths).toContain('get /communications/calls/call-1/participants');
        expect(paths).toContain('post /chats/19%3Ameeting_X%40thread.v2/messages');
        expect(paths).toContain('post /communications/calls/call-1/participants/p1/mute');
    });

    it('retains webhook handlers and drives them via the ingress drive helpers', async () => {
        const fake = new FakeGraphClient();
        const client = new RealGraphCallsClient({ AccessToken: 'tok' }, async () => fakeModule(fake).mod);

        let rosterSeen: GraphCallParticipant[] | undefined;
        let endedSeen = false;
        client.OnParticipantsUpdated('call-1', (p) => (rosterSeen = p));
        client.OnCallEnded('call-1', () => (endedSeen = true));

        client.DriveParticipantsUpdated('call-1', [{ id: 'p1' }]);
        client.DriveCallEnded('call-1');

        expect(rosterSeen).toEqual([{ id: 'p1' }]);
        expect(endedSeen).toBe(true);
        // A drive for an unknown call is a silent no-op (never throws).
        expect(() => client.DriveCallEnded('unknown')).not.toThrow();
    });

    it('buildClient throws a clear error when no access token is resolved', async () => {
        const fake = new FakeGraphClient();
        const client = new RealGraphCallsClient({ AccessToken: '' }, async () => fakeModule(fake).mod);
        await expect(client.CreateCall(JOIN_REQUEST)).rejects.toThrow(/AccessToken/);
    });
});

describe('defaultGraphModuleLoader', () => {
    // The Graph SDK is hoisted in this monorepo, so the default loader resolves a real module. This proves
    // the unwrap + structural guard accept the genuine `@microsoft/microsoft-graph-client` shape (Client.init).
    // The "SDK absent" path — a clear, actionable throw naming the package — is exercised by the dynamic
    // import rejecting in deployments that omit the optional peer dep.
    it('resolves a module exposing the structural Client.init factory when the SDK is present', async () => {
        const mod = await defaultGraphModuleLoader();
        expect(typeof mod.Client.init).toBe('function');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// PumpBackedAcsMedia — routes the call-scoped IAcsMediaLike onto a server pump.
// ──────────────────────────────────────────────────────────────────────────────

class FakeAcsPump implements IAcsMediaPump {
    public readonly SampleRate = 16000;
    public readonly Sent: Array<{ callId: string; pcm: ArrayBuffer }> = [];
    private frameHandlers = new Map<string, (frame: AcsInboundAudioFrame) => void>();
    private handHandlers = new Map<string, (participantId: string, raised: boolean) => void>();

    public Send(callId: string, pcm: ArrayBuffer): void {
        this.Sent.push({ callId, pcm });
    }
    public OnFrame(callId: string, handler: (frame: AcsInboundAudioFrame) => void): void {
        this.frameHandlers.set(callId, handler);
    }
    public OnHandRaise(callId: string, handler: (participantId: string, raised: boolean) => void): void {
        this.handHandlers.set(callId, handler);
    }
    public DriveInbound(callId: string, frame: AcsInboundAudioFrame): void {
        this.frameHandlers.get(callId)?.(frame);
    }
    public DriveHandRaise(callId: string, participantId: string, raised: boolean): void {
        this.handHandlers.get(callId)?.(participantId, raised);
    }
}

/** A pump WITHOUT hand-raise — proves PumpBackedAcsMedia tolerates the optional method's absence. */
class FakeAcsPumpNoHandRaise implements IAcsMediaPump {
    public readonly SampleRate = 8000;
    public Send(): void {
        /* unused here */
    }
    public OnFrame(): void {
        /* unused here */
    }
    // Intentionally NO OnHandRaise.
}

describe('PumpBackedAcsMedia', () => {
    it('routes outbound + inbound frames keyed by the call id the binding supplies', () => {
        const pump = new FakeAcsPump();
        const media = new PumpBackedAcsMedia(pump);
        expect(media.SampleRate).toBe(16000);

        const pcm = new ArrayBuffer(8);
        media.SendAudioFrame('call-42', pcm);
        expect(pump.Sent).toEqual([{ callId: 'call-42', pcm }]);

        let seen: AcsInboundAudioFrame | undefined;
        media.OnAudioFrame('call-42', (f) => (seen = f));
        const frame: AcsInboundAudioFrame = { Pcm: new ArrayBuffer(4), ParticipantId: 'p1' };
        pump.DriveInbound('call-42', frame);
        expect(seen).toBe(frame);
    });

    it('wires hand-raise when the pump exposes it', () => {
        const pump = new FakeAcsPump();
        const media = new PumpBackedAcsMedia(pump);
        let raised: boolean | undefined;
        media.OnHandRaise('call-42', (_p, r) => (raised = r));
        pump.DriveHandRaise('call-42', 'p1', true);
        expect(raised).toBe(true);
    });

    it('tolerates a pump with no hand-raise support (no throw)', () => {
        const pump = new FakeAcsPumpNoHandRaise();
        const media = new PumpBackedAcsMedia(pump);
        expect(() => media.OnHandRaise('call-42', () => undefined)).not.toThrow();
    });
});
