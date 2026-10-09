/**
 * @fileoverview The avatar's voice decoder: AAC frames with ADTS headers into an ffmpeg child, mono 16-bit PCM out at
 * the bot's voice rate. ffmpeg returns each frame's samples in order and in full (AAC-LC: 1024 per frame at the
 * stream's rate), so the output is cut back into one PCM chunk per frame, each carrying its frame's sequence number,
 * timeline segment and presentation time: the clock places the face against exactly those samples. A frame the stream
 * declares shorter than it decodes (a stream's last frame) is trimmed to its declared length, so the voice stays on the
 * stream's timeline.
 *
 * A fence ({@link AvatarAacDecoder.Fence}, on a barge-in) discards the PCM of every frame written before it.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { LogError } from '@memberjunction/core';
import { AvatarAudioDecoderArgs, AvatarDecoderProcess, type AvatarProcessSpawner } from './avatar-decoder-process';

/** One AAC frame to decode, and where it sits on the avatar's timeline. */
export interface AvatarAudioUnit {
    /** Its place in the order frames were written. */
    Seq: number;
    /** The timeline segment it belongs to (see `AvatarMediaClock`). */
    Epoch: number;
    /** Its presentation time, in seconds on the stream's timeline. */
    Time: number;
    /** How many samples ffmpeg returns for it, at the decoder's output rate (its frame length, rate converted). */
    DecodedSamples: number;
    /** How many of them the stream's timeline gives it (its declared duration): at most {@link DecodedSamples}. */
    Samples: number;
    /** The frame with its ADTS header. */
    Data: Uint8Array;
}

/** One frame's decoded voice, with the frame's place. */
export interface AvatarPcmChunk {
    Seq: number;
    Epoch: number;
    Time: number;
    /** Mono 16-bit samples at the decoder's output rate. */
    Pcm: Int16Array;
}

/** What the publisher needs from a voice decoder (tests pass a fake). */
export interface IAvatarAudioDecoder {
    /** Writes one AAC frame. */
    Decode(unit: AvatarAudioUnit): void;
    /** Discards the PCM of every frame written so far as it comes out. */
    Fence(): void;
    /** Ends the decoder; no failure is reported for it. */
    Dispose(): void;
}

/** What a voice decoder needs. */
export interface AvatarAudioDecoderOptions {
    /** The bot's voice rate: the PCM comes out at it. */
    SampleRate: number;
    /** Receives each frame's PCM that is not fenced off. */
    OnPcm: (chunk: AvatarPcmChunk) => void;
    /** Called once when the decoder dies on its own. */
    OnFailure: (reason: string) => void;
}

/** A frame whose samples are being collected from the output. */
interface PendingFrame {
    Seq: number;
    Epoch: number;
    Time: number;
    /** The samples it keeps (its declared duration). */
    Samples: number;
    Bytes: Uint8Array;
    Filled: number;
}

/** The AAC decoder: a long-lived ffmpeg child whose output is cut back into frames. */
export class AvatarAacDecoder implements IAvatarAudioDecoder {
    private readonly process: AvatarDecoderProcess;
    private readonly pending: PendingFrame[] = [];
    private fenceSeq = 0;
    private nextSeq = 0;
    private reportedSurplus = false;

    /**
     * @param options The output rate and the callbacks.
     * @param path The ffmpeg binary.
     * @param spawn Starts the process (tests pass a fake).
     */
    constructor(private readonly options: AvatarAudioDecoderOptions, path: string, spawn?: AvatarProcessSpawner) {
        this.process = new AvatarDecoderProcess({
            Name: 'voice',
            Path: path,
            Args: AvatarAudioDecoderArgs(options.SampleRate),
            OnOutput: (chunk) => this.readOutput(chunk),
            OnFailure: options.OnFailure,
            Spawn: spawn,
        });
    }

    /** @inheritdoc */
    public Decode(unit: AvatarAudioUnit): void {
        if (unit.DecodedSamples > 0) {
            const samples = Math.max(0, Math.min(unit.Samples, unit.DecodedSamples));
            this.pending.push({ Seq: unit.Seq, Epoch: unit.Epoch, Time: unit.Time, Samples: samples, Bytes: new Uint8Array(unit.DecodedSamples * 2), Filled: 0 });
        }
        this.nextSeq = unit.Seq + 1;
        this.process.Write(unit.Data);
    }

    /** @inheritdoc */
    public Fence(): void {
        this.fenceSeq = this.nextSeq;
    }

    /** @inheritdoc */
    public Dispose(): void {
        this.process.Dispose();
    }

    /** Hands ffmpeg's output to the frames waiting for it, in order. */
    private readOutput(chunk: Uint8Array): void {
        let offset = 0;
        while (offset < chunk.length) {
            const frame = this.pending[0];
            if (!frame) {
                this.reportSurplus();
                return;
            }
            const take = Math.min(frame.Bytes.length - frame.Filled, chunk.length - offset);
            frame.Bytes.set(chunk.subarray(offset, offset + take), frame.Filled);
            frame.Filled += take;
            offset += take;
            if (frame.Filled === frame.Bytes.length) {
                this.pending.shift();
                this.completeFrame(frame);
            }
        }
    }

    private completeFrame(frame: PendingFrame): void {
        if (frame.Seq < this.fenceSeq || frame.Samples === 0) {
            return;
        }
        this.options.OnPcm({ Seq: frame.Seq, Epoch: frame.Epoch, Time: frame.Time, Pcm: new Int16Array(frame.Bytes.buffer, 0, frame.Samples) });
    }

    private reportSurplus(): void {
        if (!this.reportedSurplus) {
            this.reportedSurplus = true;
            LogError('[AvatarAacDecoder] the decoder returned more samples than the frames written decode to; the extra ones are dropped.');
        }
    }
}
