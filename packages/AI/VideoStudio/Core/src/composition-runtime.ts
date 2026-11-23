import type { VideoFormat } from './video-generation-spec.js';

/**
 * Runtime global injected into every composition page by the render worker preamble (§7.3).
 *
 * Motion Engineer compositions read frozen data, dimensions, and deterministic random numbers
 * from `window.MJVideo` instead of external network calls or unseeded `Math.random()`.
 */
export interface MJVideoRuntime {
    /** Deeply frozen copy of `RenderProjectBundle.DataSnapshot` (or `{}` when omitted). */
    readonly Data: Readonly<Record<string, unknown>>;
    /** Deterministic integer seed from `RenderProjectBundle.Seed`. */
    readonly Seed: number;
    /** Target aspect ratio format of the composition ('16:9', '9:16', or '1:1'). */
    readonly Format: VideoFormat;
    /** Composition viewport width in pixels. */
    readonly Width: number;
    /** Composition viewport height in pixels. */
    readonly Height: number;
    /** Target frame rate in frames per second. */
    readonly Fps: number;
    /** Optional total composition duration in seconds. */
    readonly DurationSeconds?: number;
    /**
     * Deterministic `mulberry32` PRNG seeded from `Seed` at load and reset to
     * `hash(Seed, Math.round(t * 1000))` before each frame's `OnFrame` dispatch.
     * Also replaces `Math.random`.
     */
    Random(): number;
    /**
     * Deterministic order-independent hash of `(Seed, ...keys)` into `[0, 1)`.
     */
    Noise(...keys: (string | number)[]): number;
    /**
     * Registers a per-frame callback invoked with the exact seek time in seconds before each frame is captured.
     */
    OnFrame(cb: (timeSeconds: number) => void): void;
}

/**
 * One spoken word in the narration cue table (seconds on the master timeline).
 */
export interface NarrationCueWord {
    /** Word as written in the narration line (punctuation attached). */
    Word: string;
    /** Normalized match key (lower case, punctuation removed). */
    Key: string;
    /** When the word starts. */
    Start: number;
    /** When the word ends. */
    End: number;
}

/**
 * Timings of one narration line in the cue table.
 */
export interface NarrationCueLine {
    /** When the line starts. */
    Start: number;
    /** When the line ends. */
    End: number;
    /** Spoken words in order (empty when the TTS returned no word timings). */
    Words: NarrationCueWord[];
}

/**
 * Narration timings staged into every bundle at `mj/narration-cues.js`, keyed by `NarrationLine.Key`.
 */
export interface NarrationCueTable {
    /** Lines keyed by `NarrationLine.Key`. */
    Lines: Record<string, NarrationCueLine>;
}

/**
 * Word-anchored timing runtime (`window.MJNarration`), loaded automatically from `mj/narration-cues.js`.
 *
 * Use it to start an element exactly when the narration says the word that introduces it:
 * `const t = window.mjCue('line-3', 'revenue');` then animate relative to `t` inside `OnFrame`.
 * Matching ignores case and punctuation, and a multi-word phrase (`'own your data'`) matches
 * consecutive words. Prefer these lookups over typed timestamps: they follow the measured speech.
 */
export interface MJNarrationCues {
    /** The staged cue table. */
    readonly Table: NarrationCueTable;
    /** `lineKey:phrase` labels that did not resolve (diagnostics only). */
    readonly Misses: string[];
    /**
     * Seconds when the `nth` (1-based, default 1) occurrence of `phrase` starts in line `lineKey`.
     * Falls back to the line start when the phrase is not spoken, or `0` when the line is unknown.
     * Also available as `window.mjCue(lineKey, phrase, nth?)`.
     */
    Cue(lineKey: string, phrase: string, nth?: number): number;
    /** Seconds when that occurrence ends (falls back to the line end). Also `window.mjCueEnd(...)`. */
    CueEnd(lineKey: string, phrase: string, nth?: number): number;
    /** True when the phrase is spoken in the line. */
    Has(lineKey: string, phrase: string, nth?: number): boolean;
    /** Start and end of a line, or `null` when unknown. */
    Line(lineKey: string): { Start: number; End: number } | null;
}
