/**
 * @fileoverview One ffmpeg child process that decodes an elementary stream for the meeting bot's avatar: written to its
 * stdin, read from its stdout. {@link AvatarVideoDecoderArgs} and {@link AvatarAudioDecoderArgs} are the two command
 * lines (by ffmpeg version); {@link AvatarDecoderProcess} runs one, keeps the tail of its stderr for the log, and
 * reports an exit it did not ask for. A crash ends the child, never MJAPI.
 *
 * The arguments keep latency low without dropping input: one decoder thread (frame threading adds a frame of delay per
 * thread), `-flags low_delay`, minimal probing (`-probesize 32 -analyzeduration 0`), output flushed per packet, and
 * frame timing passed through (`-fps_mode passthrough` from ffmpeg 5.1, `-vsync passthrough` before it). Never
 * `-fflags nobuffer`: it dropped packets read from a pipe.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { IsFfmpegVersionAtLeast, type FfmpegVersion } from './ffmpeg-locator';

/** The ffmpeg release that added `-fps_mode` (and deprecated `-vsync`). */
const FPS_MODE_VERSION: FfmpegVersion = { Major: 5, Minor: 1, Text: '5.1' };

/** How much of a decoder's stderr is kept for the log, in characters. */
const STDERR_TAIL_CHARS = 2048;

/** Arguments every avatar decoder starts with: quiet, no keyboard, one thread, minimal probing of its input. */
const COMMON_INPUT_ARGS: readonly string[] = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1', '-probesize', '32', '-analyzeduration', '0'];

/** Whether this ffmpeg takes `-fps_mode` (5.1 and later) rather than `-vsync`. */
export function FfmpegTakesFpsMode(version: FfmpegVersion): boolean {
    return IsFfmpegVersionAtLeast(version, FPS_MODE_VERSION);
}

/**
 * The video decoder: H.264 Annex B on stdin, raw I420 frames on stdout, one per access unit in order.
 *
 * @param version The ffmpeg release, which decides the frame-timing flag.
 */
export function AvatarVideoDecoderArgs(version: FfmpegVersion): string[] {
    const passthrough = FfmpegTakesFpsMode(version) ? ['-fps_mode', 'passthrough'] : ['-vsync', 'passthrough'];
    return [...COMMON_INPUT_ARGS, '-flags', 'low_delay', '-f', 'h264', '-i', 'pipe:0', ...passthrough, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-flush_packets', '1', 'pipe:1'];
}

/**
 * The voice decoder: AAC frames with ADTS headers on stdin, mono 16-bit PCM at `sampleRate` on stdout.
 *
 * @param sampleRate The rate of the bot's voice track (the model's output rate).
 */
export function AvatarAudioDecoderArgs(sampleRate: number): string[] {
    return [...COMMON_INPUT_ARGS, '-f', 'aac', '-i', 'pipe:0', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-flush_packets', '1', 'pipe:1'];
}

/** The part of a child process a decoder uses. */
export interface AvatarChildProcess {
    stdin: Writable | null;  // case-violation-ok-legacy-back-compat: mirrors node:child_process's ChildProcess
    stdout: Readable | null;  // case-violation-ok-legacy-back-compat: mirrors node:child_process's ChildProcess
    stderr: Readable | null;  // case-violation-ok-legacy-back-compat: mirrors node:child_process's ChildProcess
    kill(signal?: NodeJS.Signals): boolean;  // case-violation-ok-legacy-back-compat: mirrors node:child_process's ChildProcess
    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;  // case-violation-ok-legacy-back-compat: mirrors node:child_process's ChildProcess
    on(event: 'error', listener: (err: Error) => void): this;  // case-violation-ok-legacy-back-compat: mirrors node:child_process's ChildProcess
}

/** Starts a decoder process (tests pass one that returns in-memory streams). */
export type AvatarProcessSpawner = (path: string, args: readonly string[]) => AvatarChildProcess;

/** Starts the real ffmpeg: no shell, all three pipes. */
export const SpawnAvatarDecoderProcess: AvatarProcessSpawner = (path, args) => spawn(path, [...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

/** What runs one decoder process. */
export interface AvatarDecoderProcessOptions {
    /** `'video'` or `'voice'`, for the log. */
    Name: string;
    /** The ffmpeg binary. */
    Path: string;
    /** Its arguments. */
    Args: readonly string[];
    /** Receives everything ffmpeg writes to stdout, in order. */
    OnOutput: (chunk: Uint8Array) => void;
    /** Called once when the process ends or fails to start without having been disposed, with what happened. */
    OnFailure: (reason: string) => void;
    /** Starts the process. Default {@link SpawnAvatarDecoderProcess}. */
    Spawn?: AvatarProcessSpawner;
}

/** One supervised decoder child process. */
export class AvatarDecoderProcess {
    private readonly child: AvatarChildProcess;
    private stderrTail = '';
    private ended = false;

    /** Starts the process at once. A failure to start is reported through `OnFailure`, never thrown. */
    constructor(private readonly options: AvatarDecoderProcessOptions) {
        this.child = (options.Spawn ?? SpawnAvatarDecoderProcess)(options.Path, options.Args);
        this.child.stdout?.on('data', (chunk: Uint8Array) => this.options.OnOutput(chunk));
        this.child.stderr?.on('data', (chunk: Uint8Array) => this.keepStderr(chunk));
        // A write to a process that just died fails with EPIPE; the exit reports it.
        this.child.stdin?.on('error', () => undefined);
        this.child.on('error', (err) => this.fail(`could not start: ${err.message}`));
        this.child.on('exit', (code, signal) => this.fail(`exited (${signal ? `signal ${signal}` : `code ${code}`})`));
    }

    /** What the decoder last wrote to stderr, for the log. */
    public get Stderr(): string {
        return this.stderrTail.trim();
    }

    /** Whether the process is still taking input. */
    public get IsRunning(): boolean {
        return !this.ended;
    }

    /**
     * Writes one unit of the elementary stream. The pipe buffers what ffmpeg has not read yet, so a decoder whose output
     * is paused (see {@link PauseOutput}) holds the compressed backlog, which is small at the avatar's bitrate.
     */
    public Write(bytes: Uint8Array): void {
        if (!this.ended) {
            this.child.stdin?.write(bytes);
        }
    }

    /** Stops reading the decoder's output, so ffmpeg blocks writing it (back-pressure from a full frame queue). */
    public PauseOutput(): void {
        this.child.stdout?.pause();
    }

    /** Reads the decoder's output again. */
    public ResumeOutput(): void {
        this.child.stdout?.resume();
    }

    /** Ends the process; no failure is reported for it. */
    public Dispose(): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.child.stdin?.destroy();
        this.child.kill('SIGKILL');
    }

    private keepStderr(chunk: Uint8Array): void {
        this.stderrTail = (this.stderrTail + Buffer.from(chunk).toString('utf8')).slice(-STDERR_TAIL_CHARS);
    }

    private fail(what: string): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.child.stdin?.destroy();
        const stderr = this.Stderr;
        this.options.OnFailure(`the ${this.options.Name} decoder ${what}${stderr ? `: ${stderr.split(/\r?\n/).slice(-3).join(' | ')}` : ''}`);
    }
}
