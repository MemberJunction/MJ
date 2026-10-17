/**
 * @fileoverview Pure timeline-fitting functions for Video Studio narration (§8).
 *
 * Re-computes storyboard beat boundaries, master-timeline narration start times, shifted word
 * timings, and proportionally re-timed audio cues from measured TTS clip durations.
 *
 * @module @memberjunction/video-studio
 */

import {
    AudioCue,
    NarrationLine,
    NarrationWordTiming,
    VideoBeat,
    VideoPacing,
} from '@memberjunction/video-studio-core';

/** Silence padding in seconds before the first narration line in a beat. */
export const NARRATION_LEAD_IN_SECONDS = 0.3;

/** Silence padding in seconds after the last narration line in a beat. */
export const NARRATION_TAIL_SECONDS = 0.5;

/** Silence gap in seconds between consecutive narration lines within the same beat. */
export const NARRATION_LINE_GAP_SECONDS = 0.2;

/**
 * Machine-readable issue codes emitted by narration timeline fitting and synthesis.
 */
export type NarrationIssueCode =
    | 'NarrationExceedsBeatMax'
    | 'FilmDurationOutOfBounds'
    | 'CueBeatNotFound'
    | 'NarrationModelNotFound'
    | 'UnresolvedPlaceholder'
    | 'SynthesisFailed'
    | 'NoWordTimings'
    | 'ClipNotStored'
    | 'CaptionsNotStored';

/**
 * Structured warning or error produced during narration synthesis or timeline fitting.
 */
export interface NarrationIssue {
    /** Machine-readable issue code. */
    Code: NarrationIssueCode | string;
    /** Whether the issue prevented synthesis (`'Error'`) or degraded non-fatally (`'Warning'`). */
    Severity: 'Error' | 'Warning';
    /** Optional `NarrationLine.Key` associated with the issue. */
    LineKey?: string;
    /** Optional `VideoBeat.Key` associated with the issue. */
    BeatKey?: string;
    /** Human-readable explanation of the issue. */
    Message: string;
}

/**
 * Optional archetype-level film duration bounds in seconds.
 */
export interface FilmDurationBounds {
    /** Minimum allowed total film duration in seconds. */
    MinSeconds: number;
    /** Maximum allowed total film duration in seconds. */
    MaxSeconds: number;
}

/**
 * Input parameters for {@link FitTimelineToNarration}.
 */
export interface FitTimelineInput {
    /** Storyboard beats in timeline order. */
    Beats: VideoBeat[];
    /** Narration lines carrying measured `DurationSeconds` and clip-relative `WordTimings`. */
    Lines: NarrationLine[];
    /** Audio cues to proportionally re-time onto the fitted beats. */
    Cues: AudioCue[];
    /** Optional beat-level pacing bounds from `Style.Pacing`. */
    Pacing?: VideoPacing;
    /** Optional film-level total duration bounds from the archetype. */
    FilmBounds?: FilmDurationBounds;
}

/**
 * Result returned by {@link FitTimelineToNarration}.
 */
export interface FitTimelineResult {
    /** Re-flowed storyboard beats starting at `0` and contiguous through `DurationSeconds`. */
    Beats: VideoBeat[];
    /** Narration lines with master-timeline `StartSeconds` and shifted `WordTimings`. */
    Lines: NarrationLine[];
    /** Re-timed audio cues mapped to their beat's new position and length. */
    Cues: AudioCue[];
    /** Total fitted film duration in seconds (equal to the final beat's `EndSeconds`). */
    DurationSeconds: number;
    /** Warnings collected during beat, cue, and film-bound checks. */
    Issues: NarrationIssue[];
}

/**
 * Rounds a timestamp or duration in seconds to microsecond precision to avoid IEEE-754 drift.
 */
function roundSeconds(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function cloneBeat(beat: VideoBeat): VideoBeat {
    return {
        ...beat,
        OnScreenText: [...beat.OnScreenText],
        DataRefs: [...beat.DataRefs],
        AssetRefs: [...beat.AssetRefs],
        LayoutNotes: { ...beat.LayoutNotes },
    };
}

function cloneWordTiming(wt: NarrationWordTiming): NarrationWordTiming {
    return {
        Word: wt.Word,
        StartSeconds: wt.StartSeconds,
        EndSeconds: wt.EndSeconds,
    };
}

function cloneLine(line: NarrationLine): NarrationLine {
    return {
        ...line,
        WordTimings: line.WordTimings ? line.WordTimings.map(cloneWordTiming) : undefined,
    };
}

function cloneCue(cue: AudioCue): AudioCue {
    return { ...cue };
}

/**
 * Computes the fitted duration for a single beat and shifts its narration lines onto the master timeline.
 */
function fitSingleBeat(
    beat: VideoBeat,
    beatStart: number,
    beatLines: NarrationLine[],
    pacing: VideoPacing | undefined,
    issues: NarrationIssue[],
): number {
    const measuredLines = beatLines.filter(
        (l) => typeof l.DurationSeconds === 'number' && Number.isFinite(l.DurationSeconds) && l.DurationSeconds >= 0,
    );

    if (measuredLines.length === 0) {
        return roundSeconds(Math.max(0, beat.EndSeconds - beat.StartSeconds));
    }

    const clipsTotal = measuredLines.reduce((sum, l) => sum + (l.DurationSeconds ?? 0), 0);
    const gapsTotal = (measuredLines.length - 1) * NARRATION_LINE_GAP_SECONDS;
    let beatLength = roundSeconds(NARRATION_LEAD_IN_SECONDS + clipsTotal + gapsTotal + NARRATION_TAIL_SECONDS);

    if (
        typeof pacing?.MinBeatDurationSeconds === 'number' &&
        Number.isFinite(pacing.MinBeatDurationSeconds) &&
        beatLength < pacing.MinBeatDurationSeconds
    ) {
        beatLength = roundSeconds(pacing.MinBeatDurationSeconds);
    }

    if (
        typeof pacing?.MaxBeatDurationSeconds === 'number' &&
        Number.isFinite(pacing.MaxBeatDurationSeconds) &&
        beatLength > pacing.MaxBeatDurationSeconds
    ) {
        issues.push({
            Code: 'NarrationExceedsBeatMax',
            Severity: 'Warning',
            BeatKey: beat.Key,
            Message: `Beat "${beat.Key}" narration length (${beatLength}s) exceeds Pacing.MaxBeatDurationSeconds (${pacing.MaxBeatDurationSeconds}s); keeping full speech length.`,
        });
    }

    let cursor = roundSeconds(beatStart + NARRATION_LEAD_IN_SECONDS);
    for (const line of measuredLines) {
        const lineStart = cursor;
        line.StartSeconds = lineStart;
        if (line.WordTimings) {
            line.WordTimings = line.WordTimings.map((wt) => ({
                Word: wt.Word,
                StartSeconds: roundSeconds(wt.StartSeconds + lineStart),
                EndSeconds: roundSeconds(wt.EndSeconds + lineStart),
            }));
        }
        cursor = roundSeconds(lineStart + (line.DurationSeconds ?? 0) + NARRATION_LINE_GAP_SECONDS);
    }

    return beatLength;
}

/**
 * Resolves the index of the beat that owns an audio cue (`BeatKey` first, then old timestamp containment).
 */
function findCueBeatIndex(cue: AudioCue, oldBeats: VideoBeat[]): number {
    if (cue.BeatKey && cue.BeatKey.trim().length > 0) {
        return oldBeats.findIndex((b) => b.Key === cue.BeatKey);
    }
    for (let i = 0; i < oldBeats.length; i++) {
        const b = oldBeats[i];
        const isLast = i === oldBeats.length - 1;
        const withinEnd = isLast ? cue.TimestampSeconds <= b.EndSeconds : cue.TimestampSeconds < b.EndSeconds;
        if (cue.TimestampSeconds >= b.StartSeconds && withinEnd) {
            return i;
        }
    }
    return oldBeats.findIndex(
        (b) => cue.TimestampSeconds >= b.StartSeconds && cue.TimestampSeconds <= b.EndSeconds,
    );
}

/**
 * Re-times audio cues proportionally to their owning beat's new start and length.
 */
function retimeCues(
    cues: AudioCue[],
    oldBeats: VideoBeat[],
    newBeats: VideoBeat[],
    issues: NarrationIssue[],
): AudioCue[] {
    return cues.map((rawCue) => {
        const cue = cloneCue(rawCue);
        const beatIdx = findCueBeatIndex(cue, oldBeats);
        if (beatIdx < 0) {
            issues.push({
                Code: 'CueBeatNotFound',
                Severity: 'Warning',
                BeatKey: cue.BeatKey,
                Message: `Audio cue "${cue.Key}" could not be matched to a storyboard beat (BeatKey: ${cue.BeatKey ?? 'none'}, TimestampSeconds: ${cue.TimestampSeconds}s); leaving timestamp unchanged.`,
            });
            return cue;
        }

        const oldBeat = oldBeats[beatIdx];
        const newBeat = newBeats[beatIdx];
        const oldLength = oldBeat.EndSeconds - oldBeat.StartSeconds;
        const newLength = newBeat.EndSeconds - newBeat.StartSeconds;
        const rawFraction = oldLength > 0 ? (cue.TimestampSeconds - oldBeat.StartSeconds) / oldLength : 0;
        const clampedFraction = Math.min(1, Math.max(0, rawFraction));
        cue.TimestampSeconds = roundSeconds(newBeat.StartSeconds + clampedFraction * newLength);
        return cue;
    });
}

/**
 * Fits storyboard beats, narration lines, and audio cues to measured narration clip durations (§8).
 *
 * Pure function: never mutates `input` or any nested object within it.
 */
export function FitTimelineToNarration(input: FitTimelineInput): FitTimelineResult {
    const issues: NarrationIssue[] = [];
    const oldBeats = input.Beats.map(cloneBeat);
    const newBeats = input.Beats.map(cloneBeat);
    const newLines = input.Lines.map(cloneLine);

    let cursor = 0;
    for (const beat of newBeats) {
        const beatLines = newLines.filter((l) => l.BeatKey === beat.Key);
        const beatStart = cursor;
        const beatLength = fitSingleBeat(beat, beatStart, beatLines, input.Pacing, issues);
        beat.StartSeconds = beatStart;
        beat.EndSeconds = roundSeconds(beatStart + beatLength);
        cursor = beat.EndSeconds;
    }

    const durationSeconds = newBeats.length > 0 ? newBeats[newBeats.length - 1].EndSeconds : 0;
    const newCues = retimeCues(input.Cues, oldBeats, newBeats, issues);

    if (input.FilmBounds) {
        const { MinSeconds, MaxSeconds } = input.FilmBounds;
        if (durationSeconds < MinSeconds || durationSeconds > MaxSeconds) {
            issues.push({
                Code: 'FilmDurationOutOfBounds',
                Severity: 'Warning',
                Message: `Fitted film duration (${durationSeconds}s) falls outside bounds [${MinSeconds}s, ${MaxSeconds}s].`,
            });
        }
    }

    return {
        Beats: newBeats,
        Lines: newLines,
        Cues: newCues,
        DurationSeconds: durationSeconds,
        Issues: issues,
    };
}
