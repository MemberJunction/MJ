/**
 * Doubles and fixtures for the avatar tests: the committed lip-sync fixture split into pieces, a fake decoder child
 * process (in-memory streams), fake decoders the publisher drives, and fakes of the voice queue and the room outlet.
 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { AvatarAudioDecoderOptions, AvatarAudioUnit, IAvatarAudioDecoder } from '../avatar-aac-decoder';
import type { AvatarChildProcess } from '../avatar-decoder-process';
import type { AvatarVideoDecoderOptions, AvatarVideoFrame, AvatarVideoUnit, IAvatarVideoDecoder } from '../avatar-h264-decoder';
import type { AvailableFfmpeg, AvatarDecoderFactory, AvatarVideoOutlet, AvatarVoiceQueue } from '../avatar-publisher';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The committed lip-sync fixture's path. */
export const SYNC_FIXTURE = resolve(HERE, 'fixtures', 'avatar-sync-flash-beep.mp4');

/** A usable ffmpeg, as a probe would report it. */
export const FFMPEG_9: AvailableFfmpeg = { Available: true, Path: '/usr/bin/ffmpeg', Version: { Major: 9, Minor: 0, Text: '9.0.2' } };

/** A fixture split into the pieces a Gemini session sends: `[ftyp + moov]`, then each `moof + mdat` (fresh buffers). */
export function FixturePieces(path: string = SYNC_FIXTURE): ArrayBuffer[] {
    const file = new Uint8Array(readFileSync(path));
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const boxes: Uint8Array[] = [];
    for (let offset = 0; offset < file.length; offset += view.getUint32(offset)) {
        boxes.push(file.subarray(offset, offset + view.getUint32(offset)));
    }
    const join = (...parts: Uint8Array[]): ArrayBuffer => {
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const part of parts) {
            out.set(part, at);
            at += part.length;
        }
        return out.buffer;
    };
    const pieces = [join(boxes[0], boxes[1])];
    for (let i = 2; i + 1 < boxes.length; i += 2) {
        pieces.push(join(boxes[i], boxes[i + 1]));
    }
    return pieces;
}

/** Calls `visit` with each box laid end to end from `start` to `end`: its type, payload start and end (32-bit sizes). */
function forEachBox(view: DataView, start: number, end: number, visit: (type: string, payload: number, boxEnd: number) => void): void {
    for (let offset = start; offset + 8 <= end; offset += view.getUint32(offset)) {
        const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
        visit(type, offset + 8, offset + view.getUint32(offset));
    }
}

/**
 * A copy of a fixture fragment with each track's decode times (`tfdt`) moved by the given ticks of that track's
 * timescale: a stream whose video starts after its audio, or a next stream whose times continue forward.
 *
 * @param piece A `moof` + `mdat` piece.
 * @param shifts Ticks to add, by track id.
 */
export function ShiftDecodeTimes(piece: ArrayBuffer, shifts: Record<number, number>): ArrayBuffer {
    const bytes = new Uint8Array(piece.slice(0));
    const view = new DataView(bytes.buffer);
    forEachBox(view, 0, bytes.length, (type, payload, end) => {
        if (type !== 'moof') {
            return;
        }
        forEachBox(view, payload, end, (child, trafPayload, trafEnd) => {
            if (child !== 'traf') {
                return;
            }
            let track = -1;
            forEachBox(view, trafPayload, trafEnd, (leaf, at) => {
                if (leaf === 'tfhd') {
                    track = view.getUint32(at + 4); // after the version and flags
                } else if (leaf === 'tfdt' && shifts[track]) {
                    if (view.getUint8(at) === 1) {
                        view.setBigUint64(at + 4, view.getBigUint64(at + 4) + BigInt(shifts[track]));
                    } else {
                        view.setUint32(at + 4, view.getUint32(at + 4) + shifts[track]);
                    }
                }
            });
        });
    });
    return bytes.buffer;
}

/** A decoder child process made of in-memory streams: the test reads stdin, writes stdout and stderr, and ends it. */
export class FakeChildProcess extends EventEmitter implements AvatarChildProcess {
    public readonly stdin = new PassThrough();
    public readonly stdout = new PassThrough();
    public readonly stderr = new PassThrough();
    public readonly Written: Buffer[] = [];
    public Killed: NodeJS.Signals | null = null;

    constructor() {
        super();
        this.stdin.on('data', (chunk: Buffer) => this.Written.push(chunk));
    }

    public kill(signal?: NodeJS.Signals): boolean {
        this.Killed = signal ?? 'SIGTERM';
        return true;
    }

    /** The process exits on its own. */
    public Exit(code: number | null, signal: NodeJS.Signals | null = null): void {
        this.emit('exit', code, signal);
    }
}

/** A video decoder the test drives: it records units and emits the frames the test asks for. */
export class FakeVideoDecoder implements IAvatarVideoDecoder {
    public readonly Units: AvatarVideoUnit[] = [];
    public Fences = 0;
    public Paused = false;
    public Disposed = false;
    constructor(public readonly Options: AvatarVideoDecoderOptions) {}
    public Decode(unit: AvatarVideoUnit): void {
        this.Units.push(unit);
    }
    public Fence(): void {
        this.Fences++;
    }
    public PauseOutput(): void {
        this.Paused = true;
    }
    public ResumeOutput(): void {
        this.Paused = false;
    }
    public Dispose(): void {
        this.Disposed = true;
    }
    /** Emits the frame of a unit written, its bytes filled with `fill`. */
    public EmitFrame(unit: AvatarVideoUnit, fill = 0): AvatarVideoFrame {
        const frame: AvatarVideoFrame = { Seq: unit.Seq, Epoch: unit.Epoch, Time: unit.Time, Width: this.Options.Width, Height: this.Options.Height, Data: new Uint8Array(4).fill(fill) };
        this.Options.OnFrame(frame);
        return frame;
    }
    /** The decoder dies. */
    public Fail(reason = 'the video decoder exited (code 1)'): void {
        this.Options.OnFailure(reason);
    }
}

/** A voice decoder the test drives: it records units and emits their PCM on request. */
export class FakeAudioDecoder implements IAvatarAudioDecoder {
    public readonly Units: AvatarAudioUnit[] = [];
    public Fences = 0;
    public Disposed = false;
    constructor(public readonly Options: AvatarAudioDecoderOptions) {}
    public Decode(unit: AvatarAudioUnit): void {
        this.Units.push(unit);
    }
    public Fence(): void {
        this.Fences++;
    }
    public Dispose(): void {
        this.Disposed = true;
    }
    /** Emits a unit's PCM: `Samples` samples of `value`. */
    public EmitPcm(unit: AvatarAudioUnit, value = 1): void {
        this.Options.OnPcm({ Seq: unit.Seq, Epoch: unit.Epoch, Time: unit.Time, Pcm: new Int16Array(unit.Samples).fill(value) });
    }
    /** The decoder dies. */
    public Fail(reason = 'the voice decoder exited (code 1)'): void {
        this.Options.OnFailure(reason);
    }
}

/** A decoder factory recording every decoder it created. */
export class FakeDecoders implements AvatarDecoderFactory {
    public readonly Videos: FakeVideoDecoder[] = [];
    public readonly Audios: FakeAudioDecoder[] = [];
    public Video(options: AvatarVideoDecoderOptions): IAvatarVideoDecoder {
        const decoder = new FakeVideoDecoder(options);
        this.Videos.push(decoder);
        return decoder;
    }
    public Audio(options: AvatarAudioDecoderOptions): IAvatarAudioDecoder {
        const decoder = new FakeAudioDecoder(options);
        this.Audios.push(decoder);
        return decoder;
    }
    /** The decoder in use: the last one created. */
    public get video(): FakeVideoDecoder {
        return this.Videos[this.Videos.length - 1];
    }
    public get audio(): FakeAudioDecoder {
        return this.Audios[this.Audios.length - 1];
    }
}

/** A voice queue whose playout the test sets. */
export class FakeVoiceQueue implements AvatarVoiceQueue {
    public Enqueued = 0;
    public Played = 0;
    public readonly Chunks: Int16Array[] = [];
    constructor(private readonly sampleRate = 24000) {}
    public EnqueuedMs(): number {
        return this.Enqueued;
    }
    public PlayedMs(): number {
        return this.Played;
    }
    public Enqueue(samples: Int16Array): void {
        this.Chunks.push(samples);
        this.Enqueued += (samples.length / this.sampleRate) * 1000;
    }
}

/**
 * A room outlet that records publishing, frames and attributes; publishing resolves unless told to fail, once
 * `PublishGate` (when set) resolves.
 */
export class FakeOutlet implements AvatarVideoOutlet {
    public readonly Published: Array<{ Width: number; Height: number }> = [];
    public readonly Captured: AvatarVideoFrame[] = [];
    public readonly Attributes: Array<Record<string, string>> = [];
    public Unpublished = 0;
    public FailPublish = false;
    public PublishGate: Promise<void> | null = null;
    public async Publish(width: number, height: number): Promise<void> {
        await this.PublishGate;
        if (this.FailPublish) {
            throw new Error('the room refused the track');
        }
        this.Published.push({ Width: width, Height: height });
    }
    public Capture(frame: AvatarVideoFrame): void {
        this.Captured.push(frame);
    }
    public async Unpublish(): Promise<void> {
        this.Unpublished++;
    }
    public async SetAttributes(attributes: Record<string, string>): Promise<void> {
        this.Attributes.push(attributes);
    }
}

/** Lets promise continuations run (the probe, publishing). */
export async function Settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}
