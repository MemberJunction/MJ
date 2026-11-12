/**
 * Word-anchored narration cues for compositions (§8).
 *
 * Pre-Production measures when every narration word is spoken (`NarrationLine.WordTimings`).
 * This module stages those timings into the composition bundle as a self-contained classic
 * script (`mj/narration-cues.js`) that defines `window.MJNarration` and the shorthand
 * `window.mjCue(lineKey, word, nth?)`, so a composition can time an element to the exact word
 * that introduces it instead of to the start of the whole line.
 *
 * Browser and server safe: no Node APIs.
 */

import type { MJNarrationCues, NarrationCueTable } from './composition-runtime.js';
import type { RenderProjectBundle } from './render-contract.js';
import type { NarrationLine, VideoGenerationSpec } from './video-generation-spec.js';

/** Relative bundle path of the staged narration-cue script. */
export const MJ_NARRATION_CUES_PATH = 'mj/narration-cues.js';

/** `<script>` tag that loads the narration-cue script, injected into the entry HTML when missing. */
export const MJ_NARRATION_CUES_SCRIPT_TAG = `<script src="${MJ_NARRATION_CUES_PATH}"></script>`;

/**
 * Normalizes a word or phrase for cue matching: lower case, punctuation removed (apostrophes inside
 * words kept), whitespace collapsed. `'Data,'` and `'data'` match; `"AI's"` stays `"ai's"`.
 */
export function NormalizeCueWord(word: string): string {
    return (word ?? '')
        .toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/[^\p{L}\p{N}'\s-]+/gu, ' ')
        .replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Builds the serializable cue table from narration lines that have a resolved master-timeline start.
 * Lines without word timings still get an entry, so `mjCue` falls back to the line start.
 */
export function BuildNarrationCueTable(lines: readonly NarrationLine[]): NarrationCueTable {
    const table: NarrationCueTable = { Lines: {} };
    for (const line of lines ?? []) {
        if (!line?.Key || typeof line.StartSeconds !== 'number' || !Number.isFinite(line.StartSeconds)) {
            continue;
        }
        const duration = typeof line.DurationSeconds === 'number' && line.DurationSeconds > 0 ? line.DurationSeconds : 0;
        table.Lines[line.Key] = {
            Start: roundCueSeconds(line.StartSeconds),
            End: roundCueSeconds(line.StartSeconds + duration),
            Words: (line.WordTimings ?? []).map((wt) => ({
                Word: wt.Word,
                Key: NormalizeCueWord(wt.Word),
                Start: roundCueSeconds(wt.StartSeconds),
                End: roundCueSeconds(wt.EndSeconds),
            })),
        };
    }
    return table;
}

function roundCueSeconds(value: number): number {
    return Math.round(value * 1000) / 1000;
}

/**
 * Creates the `MJNarrationCues` runtime over a cue table.
 *
 * IMPORTANT: the body is intentionally self-contained (no outer module references) so
 * `CreateMJNarrationCues.toString()` can be serialized into `mj/narration-cues.js` and run in
 * headless Chromium. Every function is a pure lookup, so seeking stays deterministic.
 */
export function CreateMJNarrationCues(table: NarrationCueTable): MJNarrationCues {
    const lines = table && table.Lines ? table.Lines : {};
    const normalize = (text: string): string =>
        String(text ?? '')
            .toLowerCase()
            .replace(/[‘’]/g, "'")
            .replace(/[^\p{L}\p{N}'\s-]+/gu, ' ')
            .replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
    const findSpan = (lineKey: string, phrase: string, nth?: number): { Start: number; End: number } | null => {
        const line = lines[lineKey];
        if (!line) {
            return null;
        }
        const target = normalize(phrase).split(' ').filter((w) => w.length > 0);
        if (target.length === 0) {
            return null;
        }
        const wanted = typeof nth === 'number' && nth >= 1 ? Math.floor(nth) : 1;
        let seen = 0;
        for (let i = 0; i + target.length <= line.Words.length; i++) {
            let matches = true;
            for (let j = 0; j < target.length; j++) {
                if (line.Words[i + j].Key !== target[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                seen++;
                if (seen === wanted) {
                    return { Start: line.Words[i].Start, End: line.Words[i + target.length - 1].End };
                }
            }
        }
        return null;
    };
    const misses: string[] = [];
    const recordMiss = (lineKey: string, phrase: string): void => {
        const label = `${lineKey}:${phrase}`;
        if (misses.indexOf(label) < 0) {
            misses.push(label);
        }
    };
    return {
        Table: table,
        Misses: misses,
        Cue(lineKey: string, phrase: string, nth?: number): number {
            const span = findSpan(lineKey, phrase, nth);
            if (span) {
                return span.Start;
            }
            recordMiss(lineKey, phrase);
            const line = lines[lineKey];
            return line ? line.Start : 0;
        },
        CueEnd(lineKey: string, phrase: string, nth?: number): number {
            const span = findSpan(lineKey, phrase, nth);
            if (span) {
                return span.End;
            }
            recordMiss(lineKey, phrase);
            const line = lines[lineKey];
            return line ? line.End : 0;
        },
        Has(lineKey: string, phrase: string, nth?: number): boolean {
            return findSpan(lineKey, phrase, nth) !== null;
        },
        Line(lineKey: string): { Start: number; End: number } | null {
            const line = lines[lineKey];
            return line ? { Start: line.Start, End: line.End } : null;
        },
    };
}

/**
 * Serializes the narration-cue browser script for `table`. JSON is embedded with `<` escaped so the
 * script can never close an enclosing tag.
 */
export function BuildNarrationCuesScript(table: NarrationCueTable): string {
    const json = JSON.stringify(table).replace(/</g, '\\u003c');
    return [
        `window.MJNarration = (${CreateMJNarrationCues.toString()})(${json});`,
        'window.mjCue = function (lineKey, phrase, nth) { return window.MJNarration.Cue(lineKey, phrase, nth); };',
        'window.mjCueEnd = function (lineKey, phrase, nth) { return window.MJNarration.CueEnd(lineKey, phrase, nth); };',
    ].join('\n');
}

/**
 * Returns a new bundle with `mj/narration-cues.js` staged from the spec's narration lines (an empty
 * table when narration is disabled), and the entry HTML loading it. The `<script>` tag is inserted
 * on the same line as `<head>` (or before the first `<script>`) so authored line numbers in
 * diagnostics stay unchanged. Never mutates the input bundle.
 */
export function WithNarrationCues(
    bundle: RenderProjectBundle,
    spec: Pick<VideoGenerationSpec, 'Audio'>,
): RenderProjectBundle {
    const narrationEnabled = spec.Audio?.Narration?.Enabled !== false;
    const lines = narrationEnabled && Array.isArray(spec.Audio?.Narration?.Script) ? spec.Audio.Narration.Script : [];
    const script = BuildNarrationCuesScript(BuildNarrationCueTable(lines));
    const files = bundle.Files.filter(
        (file) => file.Path.replace(/\\/g, '/').replace(/^\.\//, '') !== MJ_NARRATION_CUES_PATH,
    ).map((file) =>
        file.Path === bundle.EntryFile ? { Path: file.Path, Content: InjectNarrationCuesScriptTag(file.Content) } : { ...file },
    );
    files.push({ Path: MJ_NARRATION_CUES_PATH, Content: script });
    return { ...bundle, Files: files, Assets: (bundle.Assets ?? []).map((asset) => ({ ...asset })) };
}

/**
 * Inserts `MJ_NARRATION_CUES_SCRIPT_TAG` into `html` without adding a line: right after the opening
 * `<head>` tag, else immediately before the first `<script`, else at the start. Returns `html`
 * unchanged when it already loads the script.
 */
export function InjectNarrationCuesScriptTag(html: string): string {
    if (new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*["']\\.?/?${MJ_NARRATION_CUES_PATH.replace(/[.]/g, '\\.')}["']`, 'i').test(html)) {
        return html;
    }
    const head = /<head\b[^>]*>/i.exec(html);
    if (head) {
        const at = head.index + head[0].length;
        return `${html.slice(0, at)}${MJ_NARRATION_CUES_SCRIPT_TAG}${html.slice(at)}`;
    }
    const firstScript = /<script\b/i.exec(html);
    if (firstScript) {
        return `${html.slice(0, firstScript.index)}${MJ_NARRATION_CUES_SCRIPT_TAG}${html.slice(firstScript.index)}`;
    }
    return `${MJ_NARRATION_CUES_SCRIPT_TAG}${html}`;
}

/**
 * One literal `mjCue` / `mjCueEnd` / `MJNarration.Cue` call that does not resolve against the cue table.
 */
export interface UnresolvedNarrationCue {
    /** Composition file path containing the call. */
    File: string;
    /** 1-based line number of the call. */
    Line: number;
    /** Line key argument. */
    LineKey: string;
    /** Word or phrase argument. */
    Phrase: string;
    /** Why it does not resolve. */
    Reason: 'UnknownLine' | 'WordNotSpoken';
}

const CUE_CALL_REGEX = /\b(?:mjCue|mjCueEnd|MJNarration\.(?:Cue|CueEnd|Has))\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]+)\3\s*(?:,\s*(\d+)\s*)?\)/g;

/**
 * Statically finds cue calls with literal arguments that cannot resolve (unknown line key, or a word
 * the line never speaks), so the composition is sent back before it renders an element at the wrong
 * moment. Calls with computed arguments are not checked.
 */
export function FindUnresolvedNarrationCues(
    files: Readonly<Record<string, string>>,
    table: NarrationCueTable,
): UnresolvedNarrationCue[] {
    const runtime = CreateMJNarrationCues(table);
    const unresolved: UnresolvedNarrationCue[] = [];
    for (const [file, content] of Object.entries(files ?? {})) {
        if (typeof content !== 'string' || file === MJ_NARRATION_CUES_PATH) {
            continue;
        }
        CUE_CALL_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = CUE_CALL_REGEX.exec(content)) !== null) {
            const lineKey = match[2];
            const phrase = match[4];
            const nth = match[5] ? Number(match[5]) : undefined;
            const line = table.Lines[lineKey];
            if (line && line.Words.length === 0) {
                continue; // no word timings for this line (the TTS gave none): the cue falls back to the line start
            }
            const reason = !line ? 'UnknownLine' : runtime.Has(lineKey, phrase, nth) ? null : 'WordNotSpoken';
            if (reason) {
                unresolved.push({ File: file, Line: lineNumberAt(content, match.index), LineKey: lineKey, Phrase: phrase, Reason: reason });
            }
        }
    }
    return unresolved;
}

function lineNumberAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (text.charCodeAt(i) === 10) {
            line++;
        }
    }
    return line;
}
