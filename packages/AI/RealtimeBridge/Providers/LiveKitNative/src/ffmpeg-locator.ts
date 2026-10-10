/**
 * @fileoverview Where the meeting bot finds ffmpeg, which decodes an agent's live avatar (H.264 video, AAC voice):
 * `MJ_FFMPEG_PATH` when set, else `ffmpeg` on the `PATH`. {@link FfmpegLocator} probes it once per thread (the version
 * and the decoder list, each within {@link FFMPEG_PROBE_TIMEOUT_MS}) and keeps the answer: a usable ffmpeg (version
 * {@link MINIMUM_FFMPEG_VERSION} or later, with the `h264` and `aac` decoders), or why there is none. A meeting whose
 * host has none asks the model for audio only.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { execFile } from 'node:child_process';
import { BaseSingleton } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';

/** The environment variable naming the ffmpeg binary to use. */
export const FFMPEG_PATH_ENV = 'MJ_FFMPEG_PATH';

/** How long one probe command may take (ms) before ffmpeg counts as unusable. */
export const FFMPEG_PROBE_TIMEOUT_MS = 3_000;

/** The oldest ffmpeg the decoders' arguments support (Ubuntu 20.04's). */
export const MINIMUM_FFMPEG_VERSION: FfmpegVersion = { Major: 4, Minor: 2, Text: '4.2' };

/** The decoders an avatar needs: H.264 for the face, AAC for the voice. */
export const REQUIRED_FFMPEG_DECODERS: readonly string[] = ['h264', 'aac'];

/** An ffmpeg release, as its `-version` output names it. */
export interface FfmpegVersion {
    Major: number;
    Minor: number;
    /** The version as printed (`9.0.2`, `n7.1.1-22-g…`), or the library version a development build was read from. */
    Text: string;
}

/** What the probe found: a usable ffmpeg, or why there is none. */
export type FfmpegProbeResult =
    | { Available: true; Path: string; Version: FfmpegVersion }
    | { Available: false; Reason: string };

/** Runs ffmpeg with the given arguments and resolves with what it printed; rejects when it fails or times out. */
export type FfmpegRunner = (path: string, args: readonly string[], timeoutMs: number) => Promise<string>;

/** libavformat's major version → ffmpeg's major (58 is ffmpeg 4, 63 is ffmpeg 9), for development builds (`N-…`). */
const LAVF_MAJOR_OFFSET = 54;

/** The ffmpeg binary to run: `MJ_FFMPEG_PATH` when it names one, else `ffmpeg` (found on the `PATH`). */
export function ResolveFfmpegPath(env: NodeJS.ProcessEnv = process.env): string {
    const configured = env[FFMPEG_PATH_ENV]?.trim();
    return configured ? configured : 'ffmpeg';
}

/**
 * Reads the release from `ffmpeg -version`: `ffmpeg version 9.0.2`, `ffmpeg version n7.1.1-22-g…` (BtbN), or
 * `ffmpeg version 4.2.7-0ubuntu0.1`. A development build (`ffmpeg version N-117541-g…`) names no release, so its
 * libavformat version is mapped instead. `null` when neither is there.
 *
 * @param output What `ffmpeg -version` printed.
 */
export function ParseFfmpegVersion(output: string): FfmpegVersion | null {
    const release = /ffmpeg version n?(\d+)\.(\d+)(\S*)/i.exec(output);
    if (release) {
        return { Major: Number(release[1]), Minor: Number(release[2]), Text: `${release[1]}.${release[2]}${release[3]}` };
    }
    const lavf = /libavformat\s+(\d+)\.\s*(\d+)\./.exec(output);
    if (!lavf) {
        return null;
    }
    const lavfMajor = Number(lavf[1]);
    const lavfMinor = Number(lavf[2]);
    return { Major: lavfMajor - LAVF_MAJOR_OFFSET, Minor: minorFromLibavformat(lavfMajor, lavfMinor), Text: `libavformat ${lavfMajor}.${lavfMinor}` };
}

/** The ffmpeg minor version a libavformat version shipped in, where the decoders' arguments depend on it. */
function minorFromLibavformat(lavfMajor: number, lavfMinor: number): number {
    if (lavfMajor === 58) {
        return lavfMinor >= 76 ? 4 : lavfMinor >= 45 ? 3 : lavfMinor >= 29 ? 2 : lavfMinor >= 20 ? 1 : 0;
    }
    if (lavfMajor === 59) {
        return lavfMinor >= 27 ? 1 : 0; // ffmpeg 5.1 shipped libavformat 59.27
    }
    return 0;
}

/** Whether `version` is at least `minimum`. */
export function IsFfmpegVersionAtLeast(version: FfmpegVersion, minimum: FfmpegVersion): boolean {
    return version.Major > minimum.Major || (version.Major === minimum.Major && version.Minor >= minimum.Minor);
}

/**
 * The decoder names `ffmpeg -decoders` lists (` VFS..D h264   H.264 / AVC …`), without the legend above them.
 *
 * @param output What `ffmpeg -hide_banner -decoders` printed.
 */
export function ParseFfmpegDecoders(output: string): Set<string> {
    const names = new Set<string>();
    for (const line of output.split(/\r?\n/)) {
        const match = /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line);
        if (match && match[1] !== '=') {
            names.add(match[1]);
        }
    }
    return names;
}

/** Runs ffmpeg through `execFile`: no shell, a timeout, and its output as text. */
const defaultRunner: FfmpegRunner = (path, args, timeoutMs) =>
    new Promise<string>((resolve, reject) => {
        execFile(path, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(String(stdout));
        });
    });

/**
 * Finds and probes ffmpeg once per thread, keeping the answer. `BaseSingleton` gives one per thread, so a media worker
 * probes on its own. Restart the process after installing ffmpeg.
 */
export class FfmpegLocator extends BaseSingleton<FfmpegLocator> {
    private runner: FfmpegRunner = defaultRunner;
    private env: NodeJS.ProcessEnv = process.env;
    private probe: Promise<FfmpegProbeResult> | null = null;

    protected constructor() {
        super();
    }

    /** This thread's locator. */
    public static get Instance(): FfmpegLocator {
        return super.getInstance<FfmpegLocator>();
    }

    /**
     * Replaces how ffmpeg is run and where its path is read from (tests), and forgets the last probe.
     *
     * @param runner Runs ffmpeg; omit for the real one.
     * @param env The environment `MJ_FFMPEG_PATH` is read from; omit for `process.env`.
     */
    public Configure(runner?: FfmpegRunner, env?: NodeJS.ProcessEnv): void {
        this.runner = runner ?? defaultRunner;
        this.env = env ?? process.env;
        this.probe = null;
    }

    /** The usable ffmpeg, or why there is none; probed on the first call and remembered. Never rejects. */
    public Probe(): Promise<FfmpegProbeResult> {
        if (!this.probe) {
            this.probe = this.runProbe().then((result) => {
                LogStatus(
                    result.Available === true
                        ? `[FfmpegLocator] meeting avatars decode with ffmpeg ${result.Version.Text} at ${result.Path}`
                        : `[FfmpegLocator] meeting avatars are off on this host: ${result.Reason}`,
                );
                return result;
            });
        }
        return this.probe;
    }

    private async runProbe(): Promise<FfmpegProbeResult> {
        const path = ResolveFfmpegPath(this.env);
        const version = await this.readVersion(path);
        if (typeof version === 'string') {
            return { Available: false, Reason: version };
        }
        if (!IsFfmpegVersionAtLeast(version, MINIMUM_FFMPEG_VERSION)) {
            return { Available: false, Reason: `ffmpeg ${version.Text} at ${path} is older than ${MINIMUM_FFMPEG_VERSION.Text}` };
        }
        const missing = await this.missingDecoders(path);
        if (typeof missing === 'string') {
            return { Available: false, Reason: missing };
        }
        if (missing.length > 0) {
            return { Available: false, Reason: `ffmpeg at ${path} has no ${missing.join(' or ')} decoder` };
        }
        return { Available: true, Path: path, Version: version };
    }

    /** The version, or why it could not be read. */
    private async readVersion(path: string): Promise<FfmpegVersion | string> {
        try {
            return ParseFfmpegVersion(await this.runner(path, ['-version'], FFMPEG_PROBE_TIMEOUT_MS)) ?? `${path} printed no ffmpeg version`;
        } catch (err) {
            return `ffmpeg could not be run at ${path} (set ${FFMPEG_PATH_ENV}, or put ffmpeg on the PATH): ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    /** The required decoders ffmpeg lacks, or why its list could not be read. */
    private async missingDecoders(path: string): Promise<string[] | string> {
        try {
            const decoders = ParseFfmpegDecoders(await this.runner(path, ['-hide_banner', '-decoders'], FFMPEG_PROBE_TIMEOUT_MS));
            return REQUIRED_FFMPEG_DECODERS.filter((name) => !decoders.has(name));
        } catch (err) {
            return `ffmpeg at ${path} did not list its decoders: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
}
