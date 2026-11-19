/**
 * @fileoverview Parse WebVTT and SRT caption files into timed transcript cues.
 *
 * Captions are the cheapest timed transcript available: video hosts (YouTube, Vimeo) and
 * webinar platforms already publish them. Parsing them preserves the millisecond timings that
 * {@link TranscriptSegmenter} needs to emit time-windowed chapters, whereas flattening a
 * caption file to plain text discards them.
 *
 * @module @memberjunction/ai-segmentation
 */

import { TranscriptCue } from './Segmentation.types';

/** The character references caption files actually use. */
const ENTITIES: Readonly<Record<string, string>> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&lrm;': '',
    '&rlm;': '',
};
const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39|nbsp|lrm|rlm);/g;

/** Number of leading characters scanned when sniffing whether text is a caption file. */
const CAPTION_SNIFF_CHARS = 4096;
/** Maximum leading lines inspected by {@link LooksLikeCaptionText}. */
const CAPTION_SNIFF_LINES = 30;

/** A cue whose text lines are still being collected. */
interface OpenCue {
    StartMs: number;
    EndMs: number;
    Lines: string[];
}

/**
 * Fast, linear check for whether `text` begins like a WebVTT or SRT caption file.
 *
 * Used by {@link SuggestSegmenterKey} so raw `.vtt` / `.srt` text routes to
 * {@link TranscriptSegmenter} instead of structural prose chunking.
 */
export function LooksLikeCaptionText(text?: string): boolean {
    if (typeof text !== 'string' || text.length === 0) {
        return false;
    }
    const sample = text.slice(0, CAPTION_SNIFF_CHARS).replace(/^\uFEFF/, '');
    const lines = sample.split(/\r?\n/, CAPTION_SNIFF_LINES);
    let firstIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
            firstIdx = i;
            break;
        }
    }
    if (firstIdx < 0) {
        return false;
    }
    const first = lines[firstIdx].trim();
    if (first === 'WEBVTT' || first.startsWith('WEBVTT ') || first.startsWith('WEBVTT\t')) {
        return true;
    }
    if (isDigitsOnly(first) && firstIdx + 1 < lines.length) {
        return parseTimingLine(lines[firstIdx + 1].trim()) !== null;
    }
    return false;
}

/**
 * Parse WebVTT or SRT caption text into cues.
 *
 * Headers, `NOTE`/`STYLE`/`REGION` blocks and cue identifiers are skipped; markup is stripped;
 * a WebVTT voice tag becomes the cue's `Speaker`. Cues with no text left are dropped. Text that is
 * not a caption file yields an empty array, so callers can try this safely on any text.
 *
 * @param text - the caption file's contents.
 * @returns the cues in file order.
 */
export function ParseCaptionCues(text: string): TranscriptCue[] {
    if (typeof text !== 'string' || text.length === 0) {
        return [];
    }
    const cues: TranscriptCue[] = [];
    let open: OpenCue | null = null;
    let inMetadataBlock = false;

    const normalized = text.replace(/^\uFEFF/, '');
    for (const rawLine of normalized.split(/\r?\n/)) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line === '') {
            // Only a truly empty line ends a cue. YouTube's auto-captions put whitespace-only
            // lines inside cues, so treating those as the end would drop the cue's text.
            pushCue(cues, open);
            open = null;
            inMetadataBlock = false;
            continue;
        }
        if (inMetadataBlock) {
            continue;
        }
        if (!open && isMetadataBlockHeader(line)) {
            inMetadataBlock = true;
            continue;
        }
        const timing = parseTimingLine(line);
        if (timing !== null) {
            // A cue still open here had no empty line after it, so its trailing digits-only line
            // (and any whitespace-only separator lines above it) belong to this cue's SRT index.
            trimTrailingCueSeparator(open);
            pushCue(cues, open);
            open = { StartMs: timing.StartMs, EndMs: timing.EndMs, Lines: [] };
        } else if (open) {
            open.Lines.push(line);
        }
    }
    pushCue(cues, open);
    return cues;
}

/** True for WebVTT `NOTE`, `STYLE`, or `REGION` block headers. */
function isMetadataBlockHeader(line: string): boolean {
    const trimmed = line.trimStart();
    for (const prefix of ['NOTE', 'STYLE', 'REGION']) {
        if (trimmed === prefix) {
            return true;
        }
        if (trimmed.startsWith(prefix)) {
            const next = trimmed[prefix.length];
            if (next === ' ' || next === '\t') {
                return true;
            }
        }
    }
    return false;
}

/** Remove a trailing SRT cue index (and whitespace-only separator lines) when cues were not separated by `''`. */
function trimTrailingCueSeparator(open: OpenCue | null): void {
    if (!open || open.Lines.length === 0) {
        return;
    }
    if (!isDigitsOnly(open.Lines[open.Lines.length - 1])) {
        return;
    }
    open.Lines.pop();
    while (open.Lines.length > 0 && open.Lines[open.Lines.length - 1].trim().length === 0) {
        open.Lines.pop();
    }
}

/** True when a trimmed line consists solely of ASCII digits (an SRT cue number). */
function isDigitsOnly(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return false;
    }
    for (let i = 0; i < trimmed.length; i++) {
        const code = trimmed.charCodeAt(i);
        if (code < 48 || code > 57) {
            return false;
        }
    }
    return true;
}

/**
 * Parse a WebVTT/SRT timing line (`00:01:02.500 --> 00:01:04.000 align:start`) in linear time.
 */
function parseTimingLine(line: string): { StartMs: number; EndMs: number } | null {
    const arrow = line.indexOf('-->');
    if (arrow <= 0) {
        return null;
    }
    const leftPart = line.slice(0, arrow);
    // Require whitespace on both sides of `-->` per WebVTT and SRT grammar.
    const charBefore = leftPart[leftPart.length - 1];
    const rightSlice = line.slice(arrow + 3);
    const charAfter = rightSlice[0];
    if ((charBefore !== ' ' && charBefore !== '\t') || (charAfter !== ' ' && charAfter !== '\t')) {
        return null;
    }
    const startRaw = leftPart.trim();
    const rightTrimmed = rightSlice.trimStart();
    let endTokenEnd = rightTrimmed.length;
    for (let i = 0; i < rightTrimmed.length; i++) {
        const ch = rightTrimmed[i];
        if (ch === ' ' || ch === '\t') {
            endTokenEnd = i;
            break;
        }
    }
    const endRaw = rightTrimmed.slice(0, endTokenEnd);
    const startMs = parseTimestampMs(startRaw);
    const endMs = parseTimestampMs(endRaw);
    if (startMs === null || endMs === null) {
        return null;
    }
    return { StartMs: startMs, EndMs: endMs };
}

/**
 * Convert `hh:mm:ss.ttt`, `mm:ss.ttt`, or `hh:mm:ss,ttt` to milliseconds, or `null` if invalid.
 */
function parseTimestampMs(stamp: string): number | null {
    const sepDot = stamp.indexOf('.');
    const sepComma = stamp.indexOf(',');
    const sep = sepDot >= 0 && sepComma >= 0 ? -1 : Math.max(sepDot, sepComma);
    if (sep <= 0) {
        return null;
    }
    const clock = stamp.slice(0, sep);
    const fraction = stamp.slice(sep + 1);
    if (fraction.length < 1 || fraction.length > 3 || !isDigitsOnly(fraction)) {
        return null;
    }
    const parts = clock.split(':');
    if (parts.length < 2 || parts.length > 3) {
        return null;
    }
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!isDigitsOnly(part)) {
            return null;
        }
        if (i === parts.length - 1 && part.length !== 2) {
            return null;
        }
        if (i === parts.length - 2 && (part.length < 1 || part.length > 2)) {
            return null;
        }
    }
    const minutes = Number(parts[parts.length - 2]);
    const seconds = Number(parts[parts.length - 1]);
    if (minutes >= 60 || seconds >= 60) {
        return null;
    }
    const hours = parts.length === 3 ? Number(parts[0]) : 0;
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return totalSeconds * 1000 + Number(fraction.padEnd(3, '0'));
}

/** Turn an open cue into a {@link TranscriptCue} and keep it when it has text. */
function pushCue(cues: TranscriptCue[], open: OpenCue | null): void {
    if (!open) {
        return;
    }
    const raw = open.Lines.join(' ');
    const speaker = extractVoiceSpeaker(raw);
    const cueText = collapseWhitespace(
        stripMarkupTags(raw).replace(ENTITY_PATTERN, (entity) => ENTITIES[entity] ?? entity),
    );
    if (cueText.length === 0) {
        return;
    }
    cues.push({
        StartMs: open.StartMs,
        EndMs: open.EndMs,
        Text: cueText,
        ...(speaker ? { Speaker: speaker } : {}),
    });
}

/** Extract speaker name from a WebVTT `<v Speaker>` or `<v.loud Speaker>` span in linear time. */
function extractVoiceSpeaker(raw: string): string | undefined {
    let cursor = 0;
    while (cursor < raw.length) {
        const lt = raw.indexOf('<', cursor);
        if (lt < 0 || lt + 2 >= raw.length) {
            return undefined;
        }
        const tagChar = raw[lt + 1];
        const nextChar = raw[lt + 2];
        if ((tagChar === 'v' || tagChar === 'V') && (nextChar === '.' || nextChar === ' ' || nextChar === '\t')) {
            const gt = raw.indexOf('>', lt + 2);
            if (gt < 0) {
                return undefined;
            }
            const inner = raw.slice(lt + 2, gt);
            let wsIndex = -1;
            for (let i = 0; i < inner.length; i++) {
                if (inner[i] === ' ' || inner[i] === '\t') {
                    wsIndex = i;
                    break;
                }
            }
            if (wsIndex >= 0) {
                const speaker = inner.slice(wsIndex + 1).trim();
                if (speaker.length > 0) {
                    return speaker;
                }
            }
            cursor = gt + 1;
        } else {
            cursor = lt + 1;
        }
    }
    return undefined;
}

/** Strip `<...>` markup tags (including inline timestamps like `<00:00:01.000>`) in linear time. */
function stripMarkupTags(raw: string): string {
    let out = '';
    let cursor = 0;
    while (cursor < raw.length) {
        const lt = raw.indexOf('<', cursor);
        if (lt < 0) {
            out += raw.slice(cursor);
            break;
        }
        out += raw.slice(cursor, lt);
        const gt = raw.indexOf('>', lt + 1);
        if (gt < 0) {
            out += raw.slice(lt);
            break;
        }
        cursor = gt + 1;
    }
    return out;
}

/** Collapse runs of ASCII/Unicode whitespace to single spaces and trim ends. */
function collapseWhitespace(value: string): string {
    return value.split(/\s+/).filter((part) => part.length > 0).join(' ');
}
