/**
 * Deterministic audio checks on a delivered Video Studio mix (§9, step 1): the critic cannot hear,
 * so loudness, masking, clipping, unexpected pauses, and missing audio are measured here, with
 * ffmpeg (`ebur128`, `astats`, `silencedetect`) and the worker's own stems, before any vision-critic
 * call. Everything in this file is pure: parsers over ffmpeg's log output, and evaluators over
 * measurements, so it is unit-testable without ffmpeg.
 */

import type {
    CheckIssue,
    RenderAudioCheckThresholds,
    RenderAudioNarrationTrack,
    RenderLoudnessTarget,
} from '@memberjunction/video-studio-core';

/** No audio stream, or a silent one, where narration, music, or effects were specified. */
export const MJ_AUDIO_MISSING_CODE = 'MJ_AUDIO_MISSING';
/** A narration clip, music file, or effect file in the plan could not be read or decoded. */
export const MJ_AUDIO_SOURCE_MISSING_CODE = 'MJ_AUDIO_SOURCE_MISSING';
/** Integrated loudness outside the target tolerance. */
export const MJ_AUDIO_LOUDNESS_CODE = 'MJ_AUDIO_LOUDNESS';
/** True peak above the limit. */
export const MJ_AUDIO_TRUE_PEAK_CODE = 'MJ_AUDIO_TRUE_PEAK';
/** Samples at full scale (hard clipping). */
export const MJ_AUDIO_CLIPPING_CODE = 'MJ_AUDIO_CLIPPING';
/** Music too close to narration while a line is spoken. */
export const MJ_AUDIO_NARRATION_MASKED_CODE = 'MJ_AUDIO_NARRATION_MASKED';
/** A pause inside a narration line that its punctuation does not explain. */
export const MJ_AUDIO_LINE_PAUSE_CODE = 'MJ_AUDIO_LINE_PAUSE';

/** Loudness summary parsed from ffmpeg `ebur128`. */
export interface Ebur128Summary {
    IntegratedLufs?: number;
    LoudnessRangeLu?: number;
    TruePeakDb?: number;
}

/** Overall peak statistics parsed from ffmpeg `astats`. */
export interface AstatsSummary {
    PeakLevelDb?: number;
    PeakCount?: number;
}

/** First-pass measurement printed by ffmpeg `loudnorm` with `print_format=json`. */
export interface LoudnormMeasurement {
    InputI: number;
    InputTp: number;
    InputLra: number;
    InputThresh: number;
    TargetOffset: number;
}

function parseLevel(raw: string | undefined): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    if (/^-?inf$/i.test(raw.trim())) {
        return Number.NEGATIVE_INFINITY;
    }
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : undefined;
}

/**
 * Parses the `Summary:` block of ffmpeg `ebur128=peak=true` from stderr.
 */
export function ParseEbur128Summary(stderr: string): Ebur128Summary {
    const at = stderr.lastIndexOf('Summary:');
    const summary = at >= 0 ? stderr.slice(at) : '';
    const trueSection = summary.indexOf('True peak:');
    return {
        IntegratedLufs: parseLevel(/\bI:\s+(-?inf|-?[\d.]+)\s+LUFS/i.exec(summary)?.[1]),
        LoudnessRangeLu: parseLevel(/\bLRA:\s+(-?[\d.]+)\s+LU\b/i.exec(summary)?.[1]),
        TruePeakDb: trueSection >= 0 ? parseLevel(/Peak:\s+(-?inf|-?[\d.]+)\s+dBFS/i.exec(summary.slice(trueSection))?.[1]) : undefined,
    };
}

/**
 * Parses the `Overall` section of ffmpeg `astats` from stderr.
 */
export function ParseAstatsOverall(stderr: string): AstatsSummary {
    const at = stderr.lastIndexOf('] Overall');
    const overall = at >= 0 ? stderr.slice(at) : '';
    return {
        PeakLevelDb: parseLevel(/Peak level dB:\s+(-?inf|-?[\d.]+)/i.exec(overall)?.[1]),
        PeakCount: parseLevel(/Peak count:\s+([\d.]+)/i.exec(overall)?.[1]),
    };
}

/**
 * Parses ffmpeg `silencedetect` output into intervals. A silence still open at the end of the input
 * ends at `endSeconds`.
 */
export function ParseSilenceDetect(stderr: string, endSeconds: number): Array<{ Start: number; End: number }> {
    const silences: Array<{ Start: number; End: number }> = [];
    let open: number | undefined;
    for (const line of stderr.split(/\r?\n/)) {
        const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
        if (start) {
            open = Math.max(0, Number.parseFloat(start[1]));
            continue;
        }
        const end = /silence_end:\s*(-?[\d.]+)/.exec(line);
        if (end && open !== undefined) {
            silences.push({ Start: open, End: Number.parseFloat(end[1]) });
            open = undefined;
        }
    }
    if (open !== undefined) {
        silences.push({ Start: open, End: endSeconds });
    }
    return silences;
}

/**
 * Parses the JSON block printed by ffmpeg `loudnorm=...:print_format=json`. Returns `null` when the
 * block is missing or any measured value is not finite (for example a silent input).
 */
export function ParseLoudnormJson(stderr: string): LoudnormMeasurement | null {
    const start = stderr.lastIndexOf('{');
    const end = stderr.lastIndexOf('}');
    if (start < 0 || end <= start) {
        return null;
    }
    try {
        const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
        const measurement: LoudnormMeasurement = {
            InputI: Number.parseFloat(raw['input_i']),
            InputTp: Number.parseFloat(raw['input_tp']),
            InputLra: Number.parseFloat(raw['input_lra']),
            InputThresh: Number.parseFloat(raw['input_thresh']),
            TargetOffset: Number.parseFloat(raw['target_offset']),
        };
        return Object.values(measurement).every((v) => Number.isFinite(v)) ? measurement : null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pauses inside a narration line
// ---------------------------------------------------------------------------

const PAUSE_PUNCTUATION = /[,;:!?.…—–][)"'”’]*$/;
const DOTTED_ACRONYM = /^[("'“‘]*(?:[A-Za-z]\.){2,}[)"'”’]*$/;

/** True when a word's trailing punctuation explains a pause after it (a dotted acronym's dot does not). */
function endsWithPause(word: string): boolean {
    return PAUSE_PUNCTUATION.test(word) && !DOTTED_ACRONYM.test(word);
}

/**
 * Counts the pauses a line's punctuation explains: a `, ; : . ! ? … — –` (or a standalone dash) that is
 * followed by whitespace. Dots inside a token (`A.I`, `3.5`) do not count, and nor does the final
 * punctuation of the line.
 */
export function CountExpectedPauses(text: string): number {
    const tokens = (text ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
    let count = 0;
    for (let i = 0; i < tokens.length - 1; i++) {
        if (/^[-\u2014\u2013]+$/.test(tokens[i])) {
            continue; // a standalone dash is counted once, from the word before it
        }
        if (endsWithPause(tokens[i]) || /^[-\u2014\u2013]+$/.test(tokens[i + 1])) {
            count++;
        }
    }
    return count;
}

/** An unexplained pause inside a narration line. */
export interface UnexpectedLinePause {
    LineKey: string;
    BeatKey?: string;
    Start: number;
    End: number;
    /** Words either side of the pause, when word timings are known. */
    Between?: [string, string];
    /** The word the pause falls inside (a spelled-out term such as "A … I"), when word timings are known. */
    InsideWord?: string;
}

/**
 * Finds silences fully inside a narration line (silence touching the line's edges is its lead-in or
 * tail, not a pause) that the line's punctuation does not explain. With word timings, each pause is
 * attributed to the word before it, and it is expected only when that word ends in punctuation.
 * Without word timings, the longest pauses beyond the punctuation count are reported.
 */
export function FindUnexpectedLinePauses(
    lines: readonly RenderAudioNarrationTrack[],
    silences: ReadonlyArray<{ Start: number; End: number }>,
    minPauseSeconds: number,
): UnexpectedLinePause[] {
    const found: UnexpectedLinePause[] = [];
    for (const line of lines) {
        const lineStart = line.StartSeconds;
        const lineEnd = line.StartSeconds + line.DurationSeconds;
        const interior = silences.filter((s) => s.Start > lineStart && s.End < lineEnd && s.End - s.Start >= minPauseSeconds);
        if (interior.length === 0) {
            continue;
        }
        const words = line.WordTimings ?? [];
        if (words.length > 0) {
            found.push(...attributePausesToWords(line, interior, words));
        } else {
            const excess = interior.length - CountExpectedPauses(line.Text);
            const longest = [...interior].sort((a, b) => b.End - b.Start - (a.End - a.Start)).slice(0, Math.max(0, excess));
            for (const pause of longest.sort((a, b) => a.Start - b.Start)) {
                found.push({ LineKey: line.Key, BeatKey: line.BeatKey, Start: pause.Start, End: pause.End });
            }
        }
    }
    return found;
}

function attributePausesToWords(
    line: RenderAudioNarrationTrack,
    pauses: ReadonlyArray<{ Start: number; End: number }>,
    words: NonNullable<RenderAudioNarrationTrack['WordTimings']>,
): UnexpectedLinePause[] {
    const found: UnexpectedLinePause[] = [];
    for (const pause of pauses) {
        const inside = words.find((w) => w.StartSeconds < pause.Start && w.EndSeconds > pause.End);
        if (inside) {
            found.push({ LineKey: line.Key, BeatKey: line.BeatKey, Start: pause.Start, End: pause.End, InsideWord: inside.Word });
            continue;
        }
        const beforeIndex = findLastIndex(words, (w) => w.EndSeconds <= pause.Start + 0.06);
        const before = beforeIndex >= 0 ? words[beforeIndex] : undefined;
        const after = words.find((w) => w.StartSeconds >= pause.End - 0.06);
        if (!before || !after || endsWithPause(before.Word)) {
            continue;
        }
        found.push({ LineKey: line.Key, BeatKey: line.BeatKey, Start: pause.Start, End: pause.End, Between: [before.Word, after.Word] });
    }
    return found;
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i--) {
        if (predicate(items[i])) {
            return i;
        }
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Narration-to-music level difference measured over one narration line. */
export interface LineMaskingMeasurement {
    LineKey: string;
    BeatKey?: string;
    StartSeconds: number;
    /** Narration level minus music level in dB (`+Infinity` when the music is silent there). */
    RatioDb: number;
}

/** Everything the audio evaluator needs. */
export interface AudioCheckInput {
    /** Whether narration, music, or effects were specified. */
    AudioExpected: boolean;
    /** Whether the delivered file has an audio stream. */
    HasAudioStream: boolean;
    /** Sources in the plan that could not be read or decoded. */
    MissingSources: string[];
    /** Final loudness and peaks. */
    Loudness: Ebur128Summary;
    /** Final sample peak statistics. */
    Peaks: AstatsSummary;
    /** Loudness target (checked only when `Enabled`). */
    Target: RenderLoudnessTarget;
    /** Per-line narration-to-music measurements (empty without music or narration). */
    Masking: LineMaskingMeasurement[];
    /** Unexpected pauses inside narration lines. */
    LinePauses: UnexpectedLinePause[];
    /** Thresholds. */
    Thresholds: RenderAudioCheckThresholds;
}

/** Level in LUFS below which a mix counts as silent. */
export const SILENT_MIX_LUFS = -60;

function audioIssue(code: string, message: string, extra: Partial<CheckIssue> = {}): CheckIssue {
    return { Code: code, Category: 'Audio', Severity: 'Error', Message: message, ...extra };
}

function formatSeconds(value: number): string {
    return `${value.toFixed(2)}s`;
}

function evaluatePresence(input: AudioCheckInput): CheckIssue[] {
    const issues = input.MissingSources.map((src) =>
        audioIssue(MJ_AUDIO_SOURCE_MISSING_CODE, `Audio source "${src}" in the mix plan is missing from the bundle or could not be decoded.`, { File: src }),
    );
    if (!input.AudioExpected) {
        return issues;
    }
    const integrated = input.Loudness.IntegratedLufs;
    if (!input.HasAudioStream) {
        issues.push(audioIssue(MJ_AUDIO_MISSING_CODE, 'The rendered MP4 has no audio stream, but narration, music, or sound effects are specified.'));
    } else if (integrated === undefined || integrated < SILENT_MIX_LUFS) {
        issues.push(
            audioIssue(
                MJ_AUDIO_MISSING_CODE,
                `The rendered audio is silent (integrated loudness ${integrated === undefined ? 'unmeasured' : `${integrated} LUFS`}), but narration, music, or sound effects are specified.`,
            ),
        );
    }
    return issues;
}

function evaluateLevels(input: AudioCheckInput): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const { Loudness, Target, Thresholds, Peaks } = input;
    const integrated = Loudness.IntegratedLufs;
    if (Target.Enabled && integrated !== undefined && integrated >= SILENT_MIX_LUFS) {
        const distance = Math.abs(integrated - Target.IntegratedLufs);
        if (distance > Thresholds.LoudnessToleranceLu) {
            issues.push(
                audioIssue(
                    MJ_AUDIO_LOUDNESS_CODE,
                    `Integrated loudness is ${integrated.toFixed(1)} LUFS; the target is ${Target.IntegratedLufs} LUFS ±${Thresholds.LoudnessToleranceLu} LU.`,
                ),
            );
        }
    }
    const truePeak = Loudness.TruePeakDb;
    if (Target.Enabled && truePeak !== undefined && truePeak > Target.TruePeakDb + Thresholds.TruePeakToleranceDb) {
        issues.push(
            audioIssue(MJ_AUDIO_TRUE_PEAK_CODE, `True peak is ${truePeak.toFixed(1)} dBTP, above the ${Target.TruePeakDb} dBTP limit.`),
        );
    }
    if (Peaks.PeakLevelDb !== undefined && Peaks.PeakLevelDb >= -0.01 && (Peaks.PeakCount ?? 0) >= 2) {
        issues.push(
            audioIssue(MJ_AUDIO_CLIPPING_CODE, `The mix clips: ${Peaks.PeakCount} samples reach full scale (${Peaks.PeakLevelDb.toFixed(2)} dBFS).`),
        );
    }
    return issues;
}

function evaluateNarration(input: AudioCheckInput): CheckIssue[] {
    const issues: CheckIssue[] = [];
    for (const m of input.Masking) {
        if (m.RatioDb < input.Thresholds.MinNarrationToMusicDb) {
            issues.push(
                audioIssue(
                    MJ_AUDIO_NARRATION_MASKED_CODE,
                    `Narration line "${m.LineKey}" at ${formatSeconds(m.StartSeconds)} is only ${m.RatioDb.toFixed(1)} dB above the music (needs ${input.Thresholds.MinNarrationToMusicDb} dB). Lower Audio.Music.GainDb or add a MusicDuck cue.`,
                    { TimestampSeconds: m.StartSeconds, ...(m.BeatKey ? { BeatKey: m.BeatKey } : {}) },
                ),
            );
        }
    }
    for (const pause of input.LinePauses) {
        const where = pause.InsideWord
            ? ` inside "${pause.InsideWord}"`
            : pause.Between
              ? ` between "${pause.Between[0]}" and "${pause.Between[1]}"`
              : '';
        issues.push(
            audioIssue(
                MJ_AUDIO_LINE_PAUSE_CODE,
                `Narration line "${pause.LineKey}" has a ${formatSeconds(pause.End - pause.Start)} pause at ${formatSeconds(pause.Start)}${where} that its punctuation does not explain (the voice may be spelling out a term such as "A.I."). Add a pronunciation rule to the brand kit voice or reword the line.`,
                { TimestampSeconds: Math.round(pause.Start * 1000) / 1000, ...(pause.BeatKey ? { BeatKey: pause.BeatKey } : {}) },
            ),
        );
    }
    return issues;
}

/**
 * Evaluates every deterministic audio check and returns `Category: 'Audio'` issues, all `Error`
 * severity so they route back like other deterministic failures.
 */
export function EvaluateAudioChecks(input: AudioCheckInput): CheckIssue[] {
    const presence = evaluatePresence(input);
    if (presence.some((i) => i.Code === MJ_AUDIO_MISSING_CODE)) {
        return presence;
    }
    return [...presence, ...evaluateLevels(input), ...evaluateNarration(input)];
}
