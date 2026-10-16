/**
 * @fileoverview Pure WebVTT caption builder from master-timeline narration lines (§8).
 *
 * @module @memberjunction/video-studio
 */

import { NarrationLine, NarrationWordTiming } from '@memberjunction/video-studio-core';

/** Maximum number of words allowed in a single WebVTT caption cue. */
export const MAX_CAPTION_WORDS_PER_CUE = 7;

/** Maximum character length allowed in a single WebVTT caption cue. */
export const MAX_CAPTION_CHARS_PER_CUE = 42;

const SENTENCE_END_REGEX = /[.?!]['"”’)\]]*$/;

interface VttCue {
    StartSeconds: number;
    EndSeconds: number;
    Text: string;
}

/**
 * Formats a timestamp in seconds as a WebVTT timestamp (`HH:MM:SS.mmm`).
 */
export function FormatWebVttTimestamp(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const totalMs = Math.round(safeSeconds * 1000);
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const secs = Math.floor((totalMs % 60_000) / 1_000);
    const ms = totalMs % 1_000;

    return (
        `${String(hours).padStart(2, '0')}:` +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(secs).padStart(2, '0')}.` +
        `${String(ms).padStart(3, '0')}`
    );
}

function flushWordGroup(words: NarrationWordTiming[], cues: VttCue[]): void {
    if (words.length === 0) {
        return;
    }
    const first = words[0];
    const last = words[words.length - 1];
    cues.push({
        StartSeconds: first.StartSeconds,
        EndSeconds: last.EndSeconds,
        Text: words.map((w) => w.Word).join(' '),
    });
    words.length = 0;
}

function buildCuesFromWordTimings(wordTimings: NarrationWordTiming[], cues: VttCue[]): void {
    const currentGroup: NarrationWordTiming[] = [];
    let currentCharLength = 0;

    for (const wt of wordTimings) {
        const word = wt.Word.trim();
        if (!word) {
            continue;
        }
        const normalizedWt: NarrationWordTiming = {
            Word: word,
            StartSeconds: wt.StartSeconds,
            EndSeconds: wt.EndSeconds,
        };

        const projectedLength =
            currentGroup.length === 0 ? word.length : currentCharLength + 1 + word.length;

        if (
            currentGroup.length > 0 &&
            (currentGroup.length >= MAX_CAPTION_WORDS_PER_CUE || projectedLength > MAX_CAPTION_CHARS_PER_CUE)
        ) {
            flushWordGroup(currentGroup, cues);
            currentCharLength = 0;
        }

        currentGroup.push(normalizedWt);
        currentCharLength =
            currentGroup.length === 1 ? word.length : currentCharLength + 1 + word.length;

        if (
            SENTENCE_END_REGEX.test(word) ||
            currentGroup.length >= MAX_CAPTION_WORDS_PER_CUE ||
            currentCharLength >= MAX_CAPTION_CHARS_PER_CUE
        ) {
            flushWordGroup(currentGroup, cues);
            currentCharLength = 0;
        }
    }

    flushWordGroup(currentGroup, cues);
}

/**
 * Builds a WebVTT document (`WEBVTT\n...`) from master-timeline narration lines.
 *
 * Grouping rules for lines with `WordTimings`:
 * - Start a new cue after sentence-ending punctuation (`.`, `?`, `!`), at 7 words, or at 42 characters.
 * - Each cue spans from its first word's `StartSeconds` to its last word's `EndSeconds`.
 * - Lines without `WordTimings` emit a single fallback cue spanning `StartSeconds` to `StartSeconds + DurationSeconds`.
 * - Empty input returns `"WEBVTT\n"`.
 */
export function BuildWebVtt(lines: NarrationLine[]): string {
    if (!lines || lines.length === 0) {
        return 'WEBVTT\n';
    }

    const cues: VttCue[] = [];
    for (const line of lines) {
        if (line.WordTimings && line.WordTimings.length > 0) {
            buildCuesFromWordTimings(line.WordTimings, cues);
        } else {
            const text = line.Text?.trim();
            if (text && typeof line.DurationSeconds === 'number' && line.DurationSeconds > 0) {
                const start = line.StartSeconds ?? 0;
                cues.push({
                    StartSeconds: start,
                    EndSeconds: start + line.DurationSeconds,
                    Text: text,
                });
            }
        }
    }

    if (cues.length === 0) {
        return 'WEBVTT\n';
    }

    const blocks = cues.map(
        (cue) =>
            `${FormatWebVttTimestamp(cue.StartSeconds)} --> ${FormatWebVttTimestamp(cue.EndSeconds)}\n${cue.Text}`,
    );
    return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}
