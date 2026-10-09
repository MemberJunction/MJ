import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerContent, LiveServerMessage, Part } from '@google/genai';
import type { RealtimeClientUsage } from '../generic/baseRealtimeClient';
import type { GeminiClientConnectArgs, GeminiLiveClientSession } from '../drivers/geminiRealtimeClient';
import { InstallFakeMse } from './helpers/fake-mse';
import {
    AVATAR_FRAME_SECONDS,
    AvatarAudioFragment,
    AvatarInitSegment,
    AvatarVideoFragment,
    PieceToBase64,
} from './helpers/fmp4-pieces';
import { FakeGeminiSession, FakeMediaStream, FakeTrack, GeminiTestClient, makeGeminiAvatarConfig } from './helpers/realtime-fakes';

/**
 * The avatar's generated video in the Gemini browser client's usage: seconds from the fragments' durations (Core's
 * reader), counted inside a model turn until `generationComplete`, an interrupted turn counting what arrived before
 * `interrupted`; emitted once per second, as amounts, in updates of their own. And Google's response-side token split,
 * VIDEO included, read from `usageMetadata.responseTokensDetails`.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

function videoPart(piece: ArrayBuffer): Part {
    return { inlineData: { data: PieceToBase64(piece), mimeType: 'video/mp4' } };
}

function emit(client: GeminiTestClient, content: LiveServerContent): void {
    client.Emit({ serverContent: content } as LiveServerMessage);
}

/** Sends one model part per piece, as Gemini does. */
function emitPieces(client: GeminiTestClient, ...pieces: ArrayBuffer[]): void {
    for (const piece of pieces) {
        emit(client, { modelTurn: { role: 'model', parts: [videoPart(piece)] } });
    }
}

/** `n` one-frame video fragments. */
function frames(n: number): ArrayBuffer[] {
    return Array.from({ length: n }, (_, i) => AvatarVideoFragment(1, i + 1));
}

/** The avatar seconds of each update that carried some, in order, to the nanosecond (sums of 1/24 s are inexact). */
function secondsEmitted(usages: RealtimeClientUsage[]): number[] {
    return usages.map((u) => u.OutputTokenDetails?.VideoSeconds).filter((s): s is number => s !== undefined).map(toNanos);
}

/** Expected seconds: `counts[i]` frames each, to the nanosecond. */
function frameSeconds(...counts: number[]): number[] {
    return counts.map((count) => toNanos(count * AVATAR_FRAME_SECONDS));
}

function toNanos(seconds: number): number {
    return Math.round(seconds * 1e9) / 1e9;
}

async function connectAvatar(client: GeminiTestClient = new GeminiTestClient()): Promise<{ Client: GeminiTestClient; Usages: RealtimeClientUsage[] }> {
    const usages: RealtimeClientUsage[] = [];
    client.OnUsage((usage) => usages.push(usage));
    await client.Connect(makeGeminiAvatarConfig(), new FakeMediaStream([new FakeTrack()]));
    return { Client: client, Usages: usages };
}

/** A client whose seam opens a new fake socket per connection, so a test can resume the session. */
class ResumingClient extends GeminiTestClient {
    public readonly Connections: GeminiClientConnectArgs[] = [];

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        this.Connections.push(args);
        this.LastConnectArgs = args;
        return new FakeGeminiSession();
    }

    /** Has Google announce the connection is ending after issuing a handle; the client resumes on a new one. */
    public async Resume(): Promise<void> {
        const current = this.Connections.length - 1;
        this.Connections[current].OnMessage({ sessionResumptionUpdate: { newHandle: `h${current}`, resumable: true } } as LiveServerMessage);
        this.Connections[current].OnMessage({ goAway: { timeLeft: '60s' } } as LiveServerMessage);
        await vi.advanceTimersByTimeAsync(0);
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GeminiRealtimeClient avatar video in usage', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        InstallFakeMse();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('what counts', () => {
        it("emits a turn's video seconds once, at generationComplete, in an update of their own", async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(3));
            expect(usages).toEqual([]);

            emit(client, { generationComplete: true });

            expect(usages).toHaveLength(1);
            expect(Object.keys(usages[0])).toEqual(['OutputTokenDetails']);
            expect(secondsEmitted(usages)).toEqual(frameSeconds(3));
        });

        it("counts the video track only: a muxed stream's audio fragments add nothing", async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), AvatarVideoFragment(1, 1), AvatarAudioFragment(2), AvatarVideoFragment(1, 3), AvatarAudioFragment(4));
            emit(client, { generationComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2));
        });

        it("adds up a fragment's samples", async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(false), AvatarVideoFragment(24));
            emit(client, { turnComplete: true });

            expect(secondsEmitted(usages)[0]).toBeCloseTo(1, 12);
        });

        it('does not count video after generationComplete: the idle frames until turnComplete', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            emit(client, { generationComplete: true });
            emitPieces(client, ...frames(5));
            emit(client, { turnComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2));
            // Still played, though: the avatar holds its face between turns.
            expect(client.Playout.Appended).toHaveLength(8);
        });

        it('counts the next turn again after turnComplete', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            emit(client, { generationComplete: true });
            emit(client, { turnComplete: true });
            emitPieces(client, ...frames(3));
            emit(client, { generationComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2, 3));
        });

        it('ends the count at turnComplete when generationComplete never came', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            emit(client, { turnComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2));
        });

        it('times the fragments by the latest init segment', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(true, 90000), ...frames(1));
            emit(client, { turnComplete: true });
            emitPieces(client, AvatarInitSegment(true, 45000), ...frames(1));
            emit(client, { turnComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(1, 2));
        });

        it('does not count video it cannot time, and says so once', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, ...frames(2));
            emitPieces(client, AvatarInitSegment(), ...frames(1));
            emit(client, { generationComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(1));
            expect(warn.mock.calls.filter((call) => String(call[0]).includes("Could not read the avatar video's duration"))).toHaveLength(1);
        });
    });

    describe('interruptions, flushes and resumes', () => {
        it('an interrupted turn counts what arrived before interrupted, not the late parts it drops', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            emit(client, { interrupted: true });
            emitPieces(client, ...frames(4));
            emit(client, { turnComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2));
        });

        it("a flush does not subtract: a cancelled response's video still counts, and so does what follows in the turn", async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            client.CancelActiveResponse();
            emitPieces(client, ...frames(1));
            emit(client, { generationComplete: true });

            expect(client.Playout.FlushCount).toBe(1);
            expect(secondsEmitted(usages)).toEqual(frameSeconds(3));
        });

        it('a resume emits what the cut turn generated, once, and the next turn counts from 0', async () => {
            vi.useFakeTimers();
            const { Client: client, Usages: usages } = await connectAvatar(new ResumingClient());
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            await (client as ResumingClient).Resume();
            emitPieces(client, ...frames(3));
            emit(client, { generationComplete: true });
            emit(client, { turnComplete: true });

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2, 3));
        });

        it('emits what the turn generated so far when the session disconnects', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emitPieces(client, AvatarInitSegment(), ...frames(2));
            await client.Disconnect();

            expect(secondsEmitted(usages)).toEqual(frameSeconds(2));
        });

        it('emits nothing for a turn without video, and never the same seconds twice', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            emit(client, { generationComplete: true });
            emit(client, { turnComplete: true });
            emitPieces(client, AvatarInitSegment(), ...frames(1));
            emit(client, { generationComplete: true });
            emit(client, { turnComplete: true });
            await client.Disconnect();

            expect(secondsEmitted(usages)).toEqual(frameSeconds(1));
        });
    });

    describe("Google's response-side token split", () => {
        it('reads responseTokensDetails into OutputTokenDetails: TEXT, AUDIO and VIDEO', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            client.Emit({
                usageMetadata: {
                    promptTokenCount: 120,
                    responseTokenCount: 6342,
                    responseTokensDetails: [
                        { modality: 'TEXT', tokenCount: 50 },
                        { modality: 'AUDIO', tokenCount: 100 },
                        { modality: 'VIDEO', tokenCount: 6192 },
                    ],
                },
            } as LiveServerMessage);

            expect(usages[0].OutputTokenDetails).toEqual({ TextTokens: 50, AudioTokens: 100, VideoTokens: 6192 });
            expect(usages[0].OutputTokens).toBe(6342);
        });

        it('adds up repeated modalities and keeps none it does not know', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            client.Emit({
                usageMetadata: {
                    responseTokensDetails: [
                        { modality: 'VIDEO', tokenCount: 6192 },
                        { modality: 'VIDEO', tokenCount: 10 },
                        { modality: 'DOCUMENT', tokenCount: 7 },
                        { modality: 'AUDIO' },
                    ],
                },
            } as LiveServerMessage);

            expect(usages[0].OutputTokenDetails).toEqual({ VideoTokens: 6202 });
        });

        it('sends no output split when Google reports none', async () => {
            const { Client: client, Usages: usages } = await connectAvatar();
            client.Emit({ usageMetadata: { promptTokenCount: 10, responseTokenCount: 5 } } as LiveServerMessage);

            expect(usages[0].OutputTokenDetails).toBeUndefined();
        });
    });
});
