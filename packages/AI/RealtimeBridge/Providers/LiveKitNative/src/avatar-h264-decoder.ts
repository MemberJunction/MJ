/**
 * @fileoverview The avatar's video decoder: H.264 access units (Annex B) into an ffmpeg child, raw I420 frames out, each
 * frame matched to the access unit it came from. Constrained Baseline has no frame reordering and ffmpeg passes frame
 * timing through, so the decoder returns one frame per access unit, in order: the n-th frame belongs to the n-th unit
 * written, and carries its sequence number, timeline segment and presentation time.
 *
 * A fence ({@link AvatarH264Decoder.Fence}, on a barge-in) discards the frames of every unit written before it: ffmpeg
 * still decodes them (it needs them as references), and their frames are dropped as they come out.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { LogError } from '@memberjunction/core';
import { AvatarDecoderProcess, AvatarVideoDecoderArgs, type AvatarProcessSpawner } from './avatar-decoder-process';
import type { FfmpegVersion } from './ffmpeg-locator';
import { I420ByteLength } from './video-frame-pixels';

/** One H.264 access unit to decode, and where it sits on the avatar's timeline. */
export interface AvatarVideoUnit {
    /** Its place in the order units were written. */
    Seq: number;
    /** The timeline segment it belongs to (see `AvatarMediaClock`). */
    Epoch: number;
    /** Its presentation time, in seconds on the stream's timeline. */
    Time: number;
    /** The access unit in Annex B form, ending with an access unit delimiter. */
    Data: Uint8Array;
}

/** One decoded frame, with the place of the unit it came from. */
export interface AvatarVideoFrame {
    Seq: number;
    Epoch: number;
    Time: number;
    Width: number;
    Height: number;
    /** The I420 planes, contiguous. */
    Data: Uint8Array;
}

/** What the publisher needs from a video decoder (tests pass a fake). */
export interface IAvatarVideoDecoder {
    /** Writes one access unit. */
    Decode(unit: AvatarVideoUnit): void;
    /** Discards the frames of every unit written so far as they come out. */
    Fence(): void;
    /** Stops reading frames, so the decoder blocks (back-pressure). */
    PauseOutput(): void;
    /** Reads frames again. */
    ResumeOutput(): void;
    /** Ends the decoder; no failure is reported for it. */
    Dispose(): void;
}

/** What a video decoder needs. */
export interface AvatarVideoDecoderOptions {
    /** The frame size the stream's init declares. */
    Width: number;
    Height: number;
    /** Receives each frame that is not fenced off. */
    OnFrame: (frame: AvatarVideoFrame) => void;
    /** Called once when the decoder dies on its own. */
    OnFailure: (reason: string) => void;
}

/** Where a unit's frame goes once decoded. */
interface PendingUnit {
    Seq: number;
    Epoch: number;
    Time: number;
}

/** The H.264 decoder: a long-lived ffmpeg child framing its output by the declared size. */
export class AvatarH264Decoder implements IAvatarVideoDecoder {
    private readonly process: AvatarDecoderProcess;
    private readonly frameBytes: number;
    private readonly pending: PendingUnit[] = [];
    private frame: Uint8Array;
    private filled = 0;
    private fenceSeq = 0;
    private nextSeq = 0;
    private reportedSurplus = false;

    /**
     * @param options The frame size and the callbacks.
     * @param path The ffmpeg binary.
     * @param version Its release (decides the arguments).
     * @param spawn Starts the process (tests pass a fake).
     */
    constructor(private readonly options: AvatarVideoDecoderOptions, path: string, version: FfmpegVersion, spawn?: AvatarProcessSpawner) {
        this.frameBytes = I420ByteLength(options.Width, options.Height);
        this.frame = new Uint8Array(this.frameBytes);
        this.process = new AvatarDecoderProcess({
            Name: 'video',
            Path: path,
            Args: AvatarVideoDecoderArgs(version),
            OnOutput: (chunk) => this.readOutput(chunk),
            OnFailure: options.OnFailure,
            Spawn: spawn,
        });
    }

    /** @inheritdoc */
    public Decode(unit: AvatarVideoUnit): void {
        this.pending.push({ Seq: unit.Seq, Epoch: unit.Epoch, Time: unit.Time });
        this.nextSeq = unit.Seq + 1;
        this.process.Write(unit.Data);
    }

    /** @inheritdoc */
    public Fence(): void {
        this.fenceSeq = this.nextSeq;
    }

    /** @inheritdoc */
    public PauseOutput(): void {
        this.process.PauseOutput();
    }

    /** @inheritdoc */
    public ResumeOutput(): void {
        this.process.ResumeOutput();
    }

    /** @inheritdoc */
    public Dispose(): void {
        this.process.Dispose();
    }

    /** Fills frames from ffmpeg's output; each full one goes to its unit. */
    private readOutput(chunk: Uint8Array): void {
        let offset = 0;
        while (offset < chunk.length) {
            const take = Math.min(this.frameBytes - this.filled, chunk.length - offset);
            this.frame.set(chunk.subarray(offset, offset + take), this.filled);
            this.filled += take;
            offset += take;
            if (this.filled === this.frameBytes) {
                this.completeFrame(this.frame);
                this.frame = new Uint8Array(this.frameBytes);
                this.filled = 0;
            }
        }
    }

    private completeFrame(data: Uint8Array): void {
        const unit = this.pending.shift();
        if (!unit) {
            if (!this.reportedSurplus) {
                this.reportedSurplus = true;
                LogError('[AvatarH264Decoder] the decoder returned more frames than access units written; the extra ones are dropped.');
            }
            return;
        }
        if (unit.Seq >= this.fenceSeq) {
            this.options.OnFrame({ ...unit, Width: this.options.Width, Height: this.options.Height, Data: data });
        }
    }
}
