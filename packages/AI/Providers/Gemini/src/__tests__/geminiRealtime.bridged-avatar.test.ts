import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerMessage, Blob as GeminiBlob, Content, FunctionResponse, LiveServerContent, Part } from '@google/genai';
import type { IRealtimeSession, RealtimeSessionParams, RealtimeUsage, RealtimeVideoFrame } from '@memberjunction/ai';
import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';
import { ConfirmGeminiSetup } from './live-session-test-helpers';

// ── Fakes ──────────────────────────────────────────────────────────────────────

class FakeConnection implements GeminiLiveSession {
    /** Every realtime input sent: audio, text, activity markers. */
    public readonly RealtimeInputs: Array<{ audio?: GeminiBlob; text?: string; activityStart?: unknown; activityEnd?: unknown }> = [];
    public readonly ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public readonly ToolResponses: Array<FunctionResponse[] | FunctionResponse> = [];
    public sendRealtimeInput(params: { audio?: GeminiBlob; text?: string; activityStart?: unknown; activityEnd?: unknown }): void {
        this.RealtimeInputs.push(params);
    }
    public sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void {
        this.ClientContents.push(params);
    }
    public sendToolResponse(params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {
        this.ToolResponses.push(params.functionResponses);
    }
    public close(): void {}
}

/** The driver on Gemini Enterprise (or the Developer API), opening sessions on a fake connection. */
class BridgedGemini extends GeminiRealtime {
    public Args: GeminiConnectArgs | null = null;
    /** The connection opened last. */
    public Connection: FakeConnection | null = null;

    constructor(private readonly endpoint: 'developer' | 'enterprise' = 'enterprise') {
        super('k');
    }

    protected override get Endpoint(): 'developer' | 'enterprise' {
        return this.endpoint;
    }

    protected override async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        this.Args = args;
        ConfirmGeminiSetup(args);
        this.Connection = new FakeConnection();
        return this.Connection;
    }

    public Content(content: LiveServerContent): void {
        this.Args?.OnMessage({ serverContent: content } as LiveServerMessage);
    }

    public Parts(parts: Part[]): void {
        this.Content({ modelTurn: { role: 'model', parts } });
    }

    public Config(): Record<string, unknown> {
        return this.Args!.Config as Record<string, unknown>;
    }
}

// ── Media builders (a minimal avatar stream: video track 1 at 90 kHz, audio track 2 at 24 kHz) ──

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
}

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));
const box = (type: string, ...payload: Uint8Array[]): Uint8Array => {
    const body = concat(...payload);
    return concat(u32(8 + body.length), ascii(type), body);
};
const fullBox = (type: string, flags: number, ...payload: Uint8Array[]): Uint8Array => box(type, u32(flags), ...payload);

function trak(id: number, handler: string, timescale: number): Uint8Array {
    const mdhd = fullBox('mdhd', 0, u32(0), u32(0), u32(timescale), u32(0), u32(0));
    const hdlr = fullBox('hdlr', 0, u32(0), ascii(handler), new Uint8Array(13));
    const stbl = box('stbl', fullBox('stsd', 0, u32(0)));
    return box('trak', fullBox('tkhd', 0, new Uint8Array(8), u32(id), new Uint8Array(68)), box('mdia', mdhd, hdlr, box('minf', stbl)));
}

const INIT = concat(box('ftyp', ascii('iso5'), u32(512)), box('moov', trak(1, 'vide', 90000), trak(2, 'soun', 24000)));

/** One fragment with one sample on `track`, of `duration` ticks (tfhd defaults, default base is the moof). */
function fragment(track: number, decodeTime: number, duration: number): Uint8Array {
    const payload = new Uint8Array([1, 2, 3]);
    const traf = (dataOffset: number): Uint8Array =>
        box('traf', fullBox('tfhd', 0x2_0018, u32(track), u32(duration), u32(payload.length)), fullBox('tfdt', 0x0100_0000, u32(0), u32(decodeTime)), fullBox('trun', 0x1, u32(1), u32(dataOffset)));
    const moofLength = box('moof', traf(0)).length;
    return concat(box('moof', traf(moofLength + 8)), box('mdat', payload));
}

const b64 = (bytes: Uint8Array | number[]): string => Buffer.from(Uint8Array.from(bytes)).toString('base64');
const mp4Part = (bytes: Uint8Array, mimeType: string | undefined = 'video/mp4'): Part => ({ inlineData: { data: b64(bytes), ...(mimeType ? { mimeType } : {}) } });
const pcmPart = (bytes: number[]): Part => ({ inlineData: { data: b64(bytes), mimeType: 'audio/pcm;rate=24000' } });

const BEN: NonNullable<RealtimeSessionParams['Avatar']> = { AvatarID: 'Ben', PersonaName: 'Ben', Source: 'persona' };
const params = (avatar?: RealtimeSessionParams['Avatar'], model = 'gemini-3.8-live'): RealtimeSessionParams => ({ Model: model, SystemPrompt: 'hi', Avatar: avatar });
/** A meeting's session: the bridge commits each turn (automatic activity detection off). */
const meetingParams = (avatar: RealtimeSessionParams['Avatar']): RealtimeSessionParams => ({ ...params(avatar), Config: { disableAutoResponse: true } });

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('a bridged Gemini session whose host publishes the avatar into a room', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    const warnings = (): string[] => warn.mock.calls.map((c) => String(c[0]));

    describe('the grant', () => {
        it("asks for video and the avatar at 2 Mbps on Enterprise when the delivery is 'room'", async () => {
            const driver = new BridgedGemini('enterprise');
            const session = await driver.StartSession(params({ ...BEN, Delivery: 'room' }));
            expect(driver.Config()['responseModalities']).toEqual(['VIDEO']);
            expect(driver.Config()['avatarConfig']).toEqual({ avatarName: 'Ben', videoBitrateBps: 2_000_000 });
            expect(session.AvatarStatus).toEqual({ Requested: true, Granted: true });
            expect(warnings().filter((w) => w.includes('Avatar "Ben"'))).toEqual([]);
        });

        it("asks a meeting's avatar for the bitrate MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS names, and for none with 0", async () => {
            const key = 'MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS';
            const saved = process.env[key];
            try {
                process.env[key] = '3000000';
                const custom = new BridgedGemini('enterprise');
                await custom.StartSession(params({ ...BEN, Delivery: 'room' }));
                expect(custom.Config()['avatarConfig']).toEqual({ avatarName: 'Ben', videoBitrateBps: 3_000_000 });
                process.env[key] = '0';
                const omitted = new BridgedGemini('enterprise');
                await omitted.StartSession(params({ ...BEN, Delivery: 'room' }));
                expect(omitted.Config()['avatarConfig']).toEqual({ avatarName: 'Ben' });
                expect(omitted.Config()['responseModalities']).toEqual(['VIDEO']);
            } finally {
                if (saved === undefined) delete process.env[key];
                else process.env[key] = saved;
            }
        });

        it('declares the avatar on an outbound video track with its encoding', async () => {
            const session = await new BridgedGemini('enterprise').StartSession(params({ ...BEN, Delivery: 'room' }));
            expect(session.Capabilities?.SupportedOutboundTracks).toEqual([
                { Modality: 'audio', Direction: 'outbound' },
                { Modality: 'video', Direction: 'outbound', Encoding: 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"' },
            ]);
        });

        it("stays audio only without a 'room' delivery, reporting 'bridged'", async () => {
            for (const avatar of [BEN, { ...BEN, Delivery: 'client' as const }]) {
                const driver = new BridgedGemini('enterprise');
                const session = await driver.StartSession(params(avatar));
                expect(driver.Config()['responseModalities']).toEqual(['AUDIO']);
                expect(session.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'bridged' });
                expect(session.Capabilities?.SupportedOutboundTracks).toEqual([{ Modality: 'audio', Direction: 'outbound' }]);
            }
            expect(warnings().filter((w) => w.includes('Reason: bridged'))).toHaveLength(2);
        });

        it("reports why the model won't render it where the endpoint or the request rules it out", async () => {
            const developer = await new BridgedGemini('developer').StartSession(params({ ...BEN, Delivery: 'room' }));
            expect(developer.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'endpoint' });
            const custom = await new BridgedGemini('enterprise').StartSession(params({ ...BEN, Kind: 'custom', Delivery: 'room' }));
            expect(custom.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'custom-disabled' });
            const extended = await new BridgedGemini('enterprise').StartSession(params({ ...BEN, Delivery: 'room' }, 'gemini-3.8-live-extended-thinking'));
            expect(extended.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'endpoint' });
        });

        it('reports no status for a session that asked for no avatar', async () => {
            const session = await new BridgedGemini('enterprise').StartSession(params());
            expect(session.AvatarStatus).toBeUndefined();
        });
    });

    describe('parts', () => {
        let driver: BridgedGemini;
        let session: IRealtimeSession;
        let avatar: RealtimeVideoFrame[];
        let pcm: ArrayBuffer[];

        beforeEach(async () => {
            driver = new BridgedGemini('enterprise');
            session = await driver.StartSession(params({ ...BEN, Delivery: 'room' }));
            avatar = [];
            pcm = [];
            session.OnVideoFrame?.((frame) => avatar.push(frame));
            session.OnOutput((chunk) => pcm.push(chunk));
        });

        it('sends video/mp4 pieces to the video output, byte for byte, never to the audio output', () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 3750))]);
            expect(avatar.map((c) => c.MimeType)).toEqual(['video/mp4', 'video/mp4']);
            expect(new Uint8Array(avatar[0].Data)).toEqual(INIT);
            expect(pcm).toHaveLength(0);
        });

        it("hands each piece on as an fMP4 frame: the init, then fragments timed by the init's video track", () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 3750, 3750), 'video/mp4; codecs="avc1.42c01f"'), mp4Part(fragment(2, 0, 1024))]);
            expect(avatar.map((frame) => [frame.Kind, frame.Kind === 'fmp4' ? frame.Piece : null])).toEqual([
                ['fmp4', 'init'],
                ['fmp4', 'fragment'],
                ['fmp4', 'fragment'],
            ]);
            expect(avatar[1].MimeType).toBe('video/mp4; codecs="avc1.42c01f"');
            expect(avatar[1].PresentationTimeMs).toBeCloseTo(41.667, 3);
            expect(avatar[1].KeyFrame).toBe(true);
            // An audio-only fragment has no video sample to time.
            expect(avatar[2].PresentationTimeMs).toBeUndefined();
        });

        it("drops a video part that isn't MP4, reported once per type, and the turn's PCM still plays", () => {
            const webm = (bytes: number[]): Part => ({ inlineData: { data: b64(bytes), mimeType: 'video/webm' } });
            driver.Parts([webm([1, 2, 3, 4]), pcmPart([1, 1]), webm([5, 6, 7, 8])]);
            expect(avatar).toHaveLength(0);
            expect(pcm.map((b) => Array.from(new Uint8Array(b)))).toEqual([[1, 1]]);
            expect(warnings().filter((w) => w.includes('video/webm: it is not fragmented MP4'))).toHaveLength(1);
        });

        it('takes a part with no MIME type as a piece when it opens with an MP4 box, and as PCM otherwise', () => {
            driver.Parts([{ inlineData: { data: b64(INIT) } }]);
            expect(avatar.map((c) => c.MimeType)).toEqual(['video/mp4']);
            expect(pcm).toHaveLength(0);
            driver.Content({ turnComplete: true });
            driver.Parts([{ inlineData: { data: b64([1, 2, 3, 4]) } }]);
            expect(pcm.map((b) => Array.from(new Uint8Array(b)))).toEqual([[1, 2, 3, 4]]);
        });

        it("plays PCM before the turn's first video, drops it after (reported once), and plays it again in the next turn", () => {
            driver.Parts([pcmPart([1, 1]), mp4Part(INIT), pcmPart([2, 2]), pcmPart([3, 3])]);
            expect(pcm.map((b) => Array.from(new Uint8Array(b)))).toEqual([[1, 1]]);
            expect(warnings().filter((w) => w.includes('Dropped PCM audio'))).toHaveLength(1);
            driver.Content({ turnComplete: true });
            driver.Parts([pcmPart([4, 4])]);
            expect(pcm.map((b) => Array.from(new Uint8Array(b)))).toEqual([[1, 1], [4, 4]]);
        });

        it('drops media from interrupted until that turn completes, and still reports the interruption', () => {
            const interrupted = vi.fn();
            session.OnInterruption(interrupted);
            driver.Parts([mp4Part(INIT)]);
            driver.Content({ interrupted: true });
            driver.Parts([mp4Part(fragment(1, 3750, 3750)), pcmPart([5, 5])]);
            expect(interrupted).toHaveBeenCalledTimes(1);
            expect(avatar).toHaveLength(1);
            expect(pcm).toHaveLength(0);
            driver.Content({ turnComplete: true });
            driver.Parts([mp4Part(fragment(1, 7500, 3750))]);
            expect(avatar).toHaveLength(2);
        });

        it('drops other types once per session', () => {
            driver.Parts([{ inlineData: { data: b64([1]), mimeType: 'text/plain' } }, { inlineData: { data: b64([2]), mimeType: 'text/plain' } }]);
            expect(avatar).toHaveLength(0);
            expect(warnings().filter((w) => w.includes('text/plain'))).toHaveLength(1);
        });

        it("sends an MP4 piece to the avatar whatever type the part names, labelled video/mp4 for the room's publisher", () => {
            const moovOnly = INIT.subarray(new DataView(INIT.buffer, INIT.byteOffset).getUint32(0));
            driver.Parts([mp4Part(INIT, 'application/octet-stream'), mp4Part(moovOnly, 'application/mp4'), mp4Part(fragment(1, 0, 3750), 'audio/pcm;rate=24000')]);
            expect(avatar.map((c) => c.MimeType)).toEqual(['video/mp4', 'video/mp4', 'video/mp4']);
            expect(new Uint8Array(avatar[0].Data)).toEqual(INIT);
            expect(pcm).toHaveLength(0);
            expect(warnings().filter((w) => w.includes('Dropped model output'))).toEqual([]);
        });

        it('keeps the codecs of a video/mp4 type, and labels an MP4 piece of any other video type video/mp4', () => {
            const codecs = 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"';
            driver.Parts([mp4Part(INIT, codecs), mp4Part(fragment(1, 0, 3750), 'video/iso.segment')]);
            expect(avatar.map((c) => c.MimeType)).toEqual([codecs, 'video/mp4']);
        });

        it("drops a part of another video type that doesn't open with an MP4 box, reported once", () => {
            const notMp4 = (seed: number): Part => mp4Part(new Uint8Array([0, 0, 0, 9, seed, 2, 3, 4, 5]), 'video/iso.segment');
            driver.Parts([notMp4(1), notMp4(6)]);
            expect(avatar).toEqual([]);
            expect(warnings().filter((w) => w.includes('video/iso.segment: it is not fragmented MP4'))).toHaveLength(1);
        });

        it('never plays a part of another type that is not MP4: not to the avatar, not as PCM', () => {
            driver.Parts([
                { inlineData: { data: b64([0, 0, 0, 16, 109, 100, 97, 116, 1, 2, 3, 4, 5, 6, 7, 8]), mimeType: 'application/octet-stream' } },
                { inlineData: { data: b64([5, 6, 7, 8]), mimeType: 'audio/mp4' } },
            ]);
            expect(avatar).toHaveLength(0);
            expect(pcm).toHaveLength(0);
            expect(warnings().filter((w) => w.includes('Dropped model output'))).toHaveLength(2);
        });

        it("ends a barge-in's drop window when the session resumes on a new connection, and starts a new turn", async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            try {
                driver.Parts([mp4Part(INIT), pcmPart([1, 1])]);
                driver.Content({ interrupted: true });
                driver.Args?.OnMessage({ sessionResumptionUpdate: { newHandle: 'h1', resumable: true } } as LiveServerMessage);
                driver.Args?.OnMessage({ goAway: { timeLeft: '60s' } } as LiveServerMessage);
                await vi.advanceTimersByTimeAsync(0);
                driver.Parts([pcmPart([2, 2]), mp4Part(fragment(1, 0, 3750))]);
                expect(avatar).toHaveLength(2);
                expect(pcm.map((b) => Array.from(new Uint8Array(b)))).toEqual([[2, 2]]);
            } finally {
                vi.useRealTimers();
            }
        });

        it('stops sending to the avatar handler after Close', async () => {
            await session.Close();
            driver.Parts([mp4Part(INIT)]);
            expect(avatar).toHaveLength(0);
        });
    });

    describe('avatar seconds in usage', () => {
        let driver: BridgedGemini;
        let session: IRealtimeSession;
        let usage: RealtimeUsage[];

        beforeEach(async () => {
            driver = new BridgedGemini('enterprise');
            session = await driver.StartSession(params({ ...BEN, Delivery: 'room' }));
            usage = [];
            session.OnUsage((u) => usage.push(u));
        });

        const videoSeconds = (): number[] => usage.map((u) => u.OutputTokenDetails?.VideoSeconds ?? 0);

        it("reports the turn's video seconds at generationComplete, as a delta with no tokens", () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 45000)), mp4Part(fragment(2, 0, 24000)), mp4Part(fragment(1, 45000, 45000))]);
            expect(usage).toHaveLength(0);
            driver.Content({ generationComplete: true });
            expect(usage).toEqual([{ InputTokens: 0, OutputTokens: 0, OutputTokenDetails: { VideoSeconds: 1 } }]);
        });

        it('does not count video after generationComplete, nor report the turn twice', () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 45000))]);
            driver.Content({ generationComplete: true });
            driver.Parts([mp4Part(fragment(1, 45000, 45000))]);
            driver.Content({ turnComplete: true });
            expect(videoSeconds()).toEqual([0.5]);
        });

        it('counts what arrived before an interruption, and nothing dropped after it', () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 22500))]);
            driver.Content({ interrupted: true });
            driver.Parts([mp4Part(fragment(1, 22500, 22500))]);
            driver.Content({ turnComplete: true });
            expect(videoSeconds()).toEqual([0.25]);
        });

        it('reports at turnComplete when no generationComplete came, and each turn separately', () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 90000))]);
            driver.Content({ turnComplete: true });
            driver.Parts([mp4Part(fragment(1, 90000, 45000))]);
            driver.Content({ turnComplete: true });
            expect(videoSeconds()).toEqual([1, 0.5]);
        });

        it('reports what is pending when the session closes', async () => {
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 45000))]);
            await session.Close();
            expect(videoSeconds()).toEqual([0.5]);
        });

        it('counts no audio, and nothing before an init gave the timescales', () => {
            driver.Parts([mp4Part(fragment(1, 0, 45000)), mp4Part(INIT), mp4Part(fragment(2, 0, 24000))]);
            driver.Content({ generationComplete: true });
            expect(usage).toHaveLength(0);
        });
    });

    /** Vertex AI streams the avatar's video between answers too: it goes to the room, but the model is not generating. */
    describe('answer or idle', () => {
        let driver: BridgedGemini;
        let session: IRealtimeSession;
        let avatar: RealtimeVideoFrame[];

        /** Starts a session and has the model answer one turn with video: its words, the pieces, the turn's end. */
        async function afterOneAnswer(sessionParams: RealtimeSessionParams = params({ ...BEN, Delivery: 'room' })): Promise<void> {
            driver = new BridgedGemini('enterprise');
            session = await driver.StartSession(sessionParams);
            avatar = [];
            session.OnVideoFrame?.((frame) => avatar.push(frame));
            driver.Content({ outputTranscription: { text: 'Here is what I found.' } });
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 3750))]);
            driver.Content({ generationComplete: true });
            driver.Content({ turnComplete: true });
        }

        const spokenUpdates = (): string[] => (driver.Connection?.RealtimeInputs ?? []).flatMap((input) => (input.text ? [input.text] : []));

        it('idle video after turnComplete goes to the room, and holds no context note or spoken update: each goes out at once', async () => {
            await afterOneAnswer();
            driver.Parts([mp4Part(fragment(1, 3750, 3750))]);
            driver.Parts([mp4Part(fragment(1, 7500, 3750))]);
            expect(avatar).toHaveLength(4);

            session.SendContextNote?.('The report is ready.');
            session.RequestSpokenUpdate?.('Say that the report is ready.');
            expect(driver.Connection?.ClientContents.map((content) => content.turns?.[0]?.parts?.[0]?.text)).toEqual(['The report is ready.']);
            expect(spokenUpdates()).toEqual(['Say that the report is ready.']);
        });

        it("in a meeting, the bridge's next commit after idle video is not skipped as a duplicate", async () => {
            await afterOneAnswer(meetingParams({ ...BEN, Delivery: 'room' }));
            driver.Parts([mp4Part(fragment(1, 3750, 3750))]);

            expect(session.RequestSpokenUpdate?.('')).toBe(true);
            expect(driver.Connection?.RealtimeInputs.filter((input) => input.activityEnd)).toHaveLength(1);
        });

        it('a tool call ends the answer: the video while the tool runs holds no context note, and the result goes out at once', async () => {
            driver = new BridgedGemini('enterprise');
            session = await driver.StartSession(params({ ...BEN, Delivery: 'room' }));
            driver.Content({ outputTranscription: { text: 'Let me check.' } });
            driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 3750))]);
            driver.Args?.OnMessage({ toolCall: { functionCalls: [{ id: 'call-1', name: 'LookUpOrder', args: {} }] } } as LiveServerMessage);
            driver.Parts([mp4Part(fragment(1, 3750, 3750))]);

            session.SendContextNote?.('Still looking.');
            await session.SendToolResult('call-1', JSON.stringify({ status: 'shipped' }));
            expect(driver.Connection?.ClientContents).toHaveLength(1);
            expect(driver.Connection?.ToolResponses).toHaveLength(1);
        });

        it("the answer's video marks the model generating: a context note waits for the turn's end", async () => {
            driver = new BridgedGemini('enterprise');
            session = await driver.StartSession(params({ ...BEN, Delivery: 'room' }));
            driver.Content({ outputTranscription: { text: 'Sure.' }, modelTurn: { role: 'model', parts: [mp4Part(INIT)] } });

            session.SendContextNote?.('A note for later.');
            expect(driver.Connection?.ClientContents).toHaveLength(0);
            driver.Content({ turnComplete: true });
            expect(driver.Connection?.ClientContents).toHaveLength(1);
        });

        it('video before the model speaks is idle, and a voice part that plays starts the answer', async () => {
            driver = new BridgedGemini('enterprise');
            session = await driver.StartSession(params({ ...BEN, Delivery: 'room' }));
            driver.Parts([mp4Part(INIT)]);
            session.SendContextNote?.('First note.');
            expect(driver.Connection?.ClientContents).toHaveLength(1);

            driver.Content({ turnComplete: true });
            driver.Parts([pcmPart([1, 1])]);
            session.SendContextNote?.('Second note.');
            expect(driver.Connection?.ClientContents).toHaveLength(1);
        });
    });

    it('leaves a session without an avatar as it was: no usage of its own, nothing to the avatar output, video/mp4 dropped', async () => {
        const driver = new BridgedGemini('enterprise');
        const session = await driver.StartSession(params());
        const usage: RealtimeUsage[] = [];
        const pcm: ArrayBuffer[] = [];
        const avatar: RealtimeVideoFrame[] = [];
        session.OnUsage((u) => usage.push(u));
        session.OnOutput((chunk) => pcm.push(chunk));
        session.OnVideoFrame?.((frame) => avatar.push(frame));
        driver.Parts([mp4Part(INIT), mp4Part(fragment(1, 0, 45000)), pcmPart([1, 2])]);
        driver.Content({ generationComplete: true, turnComplete: true });
        expect(pcm).toHaveLength(1);
        expect(avatar).toHaveLength(0);
        expect(usage).toHaveLength(0);
        expect(warnings().some((w) => w.includes('Dropped model output of type video/mp4: only PCM audio is played'))).toBe(true);
    });
});
