/**
 * @fileoverview Pronunciation normalization for Video Studio narration (§8).
 *
 * Text-to-speech voices read some written forms badly: "A.I." comes out as "A … I", "e.g." as
 * "e g". Before each narration line is synthesized, its text is rewritten into a speakable form:
 * built-in defaults first, then the brand kit voice's `PronunciationNotes`. Captions and on-screen
 * copy keep the original text; word timings are mapped back onto the original words.
 *
 * ## `PronunciationNotes` format
 *
 * One rule per line (or separated by `;`): `<written form> => <spoken form>`. `->` and `→` also work.
 * Matching ignores case and surrounding punctuation, a written form may span several words, and a
 * possessive `'s` is kept. Lines without an arrow, and lines starting with `#`, are free-text notes
 * for humans and are ignored. Example:
 *
 * ```
 * MemberJunction => Member Junction
 * SQL => sequel
 * # Say "Skip" with a short i.
 * ```
 *
 * User rules win over the built-in defaults for the same written form.
 *
 * @module @memberjunction/video-studio
 */

import type { NarrationWordTiming } from '@memberjunction/video-studio-core';

/** One rewrite from a written form to a spoken form. */
export interface PronunciationRule {
    /** Written form (one or more words). */
    Pattern: string;
    /** Spoken form sent to TTS. */
    Replacement: string;
}

/** Result of {@link ParsePronunciationNotes}. */
export interface ParsedPronunciationNotes {
    /** Parsed rules, in the order written. */
    Rules: PronunciationRule[];
    /** Non-empty lines that are not rules (free-text guidance or malformed). */
    IgnoredLines: string[];
}

/** One aligned span between the display text and the spoken text, in whitespace-delimited words. */
export interface NarrationTokenGroup {
    DisplayStart: number;
    DisplayCount: number;
    SpokenStart: number;
    SpokenCount: number;
}

/** Result of {@link NormalizeNarrationText}. */
export interface NormalizedNarrationText {
    /** Original words (whitespace-delimited). */
    DisplayTokens: string[];
    /** Words sent to TTS. */
    SpokenTokens: string[];
    /** Text sent to TTS (`SpokenTokens` joined by single spaces). */
    SpokenText: string;
    /** Display/spoken alignment, covering every token on both sides in order. */
    Groups: NarrationTokenGroup[];
    /** True when any word was rewritten. */
    Changed: boolean;
}

/** Built-in rewrites applied after the brand kit's rules. Dotted acronyms are handled separately. */
export const DEFAULT_PRONUNCIATION_RULES: readonly PronunciationRule[] = Object.freeze([
    { Pattern: 'e.g.', Replacement: 'for example' },
    { Pattern: 'i.e.', Replacement: 'that is' },
    { Pattern: 'vs.', Replacement: 'versus' },
    { Pattern: '&', Replacement: 'and' },
]);

const RULE_ARROW = /\s*(?:=>|->|→)\s*/;
const LEADING_PUNCT = /^[("'“‘[]+/;
const TRAILING_PUNCT = /[.,;:!?)"'”’\]]+$/;
const POSSESSIVE = /['’]s$/i;
const DOTTED_ACRONYM_CORE = /^(?:[A-Z]\.)+[A-Z]$/;

/**
 * Parses `IBrandVoice.PronunciationNotes` into rules (see the module documentation for the format).
 */
export function ParsePronunciationNotes(notes?: string | null): ParsedPronunciationNotes {
    const rules: PronunciationRule[] = [];
    const ignored: string[] = [];
    for (const rawLine of (notes ?? '').split(/\r?\n|;/)) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const parts = line.startsWith('#') ? [] : line.split(RULE_ARROW);
        const pattern = parts[0]?.trim() ?? '';
        const replacement = parts.slice(1).join(' ').trim();
        if (parts.length === 2 && pattern && replacement) {
            rules.push({ Pattern: pattern, Replacement: replacement });
        } else {
            ignored.push(line);
        }
    }
    return { Rules: rules, IgnoredLines: ignored };
}

interface TokenParts {
    Lead: string;
    Core: string;
    Trail: string;
}

function splitToken(token: string): TokenParts {
    const lead = LEADING_PUNCT.exec(token)?.[0] ?? '';
    const rest = token.slice(lead.length);
    const trail = TRAILING_PUNCT.exec(rest)?.[0] ?? '';
    return { Lead: lead, Core: rest.slice(0, rest.length - trail.length), Trail: trail };
}

function patternWords(pattern: string): string[] {
    return pattern
        .trim()
        .split(/\s+/)
        .map((w) => splitToken(w).Core.toLowerCase())
        .filter((w) => w.length > 0);
}

interface CompiledRule {
    Words: string[];
    Replacement: string[];
    /** True when the written form ends with a dot that belongs to it (an abbreviation). */
    OwnsTrailingDot: boolean;
}

function compileRules(rules: readonly PronunciationRule[]): CompiledRule[] {
    return rules
        .map((rule) => ({
            Words: patternWords(rule.Pattern),
            Replacement: rule.Replacement.trim().split(/\s+/).filter((w) => w.length > 0),
            OwnsTrailingDot: rule.Pattern.trim().endsWith('.'),
        }))
        .filter((rule) => rule.Words.length > 0 && rule.Replacement.length > 0)
        .sort((a, b) => b.Words.length - a.Words.length);
}

/** Core of a token for matching: lower case, surrounding punctuation removed. */
function matchCore(token: string): string {
    return splitToken(token).Core.toLowerCase();
}

/** Removes the abbreviation's own dot from trailing punctuation, except at the very end of the text. */
function trailAfterAbbreviation(trail: string, isLastToken: boolean): string {
    return !isLastToken && trail.startsWith('.') ? trail.slice(1) : trail;
}

function tryRule(tokens: string[], at: number, rule: CompiledRule): string[] | null {
    if (at + rule.Words.length > tokens.length) {
        return null;
    }
    const lastIndex = at + rule.Words.length - 1;
    let possessive = '';
    for (let j = 0; j < rule.Words.length; j++) {
        let core = matchCore(tokens[at + j]);
        if (j === rule.Words.length - 1 && core !== rule.Words[j] && POSSESSIVE.test(core) && core.slice(0, -2) === rule.Words[j]) {
            possessive = "'s";
            core = core.slice(0, -2);
        }
        if (core !== rule.Words[j]) {
            return null;
        }
    }
    const first = splitToken(tokens[at]);
    const last = splitToken(tokens[lastIndex]);
    const trail = rule.OwnsTrailingDot ? trailAfterAbbreviation(last.Trail, lastIndex === tokens.length - 1) : last.Trail;
    const words = [...rule.Replacement];
    words[0] = `${first.Lead}${words[0]}`;
    words[words.length - 1] = `${words[words.length - 1]}${possessive}${trail}`;
    return words;
}

function tryDottedAcronym(tokens: string[], at: number): string[] | null {
    const { Lead, Core, Trail } = splitToken(tokens[at]);
    if (!DOTTED_ACRONYM_CORE.test(Core) || !Trail.startsWith('.')) {
        return null;
    }
    return [`${Lead}${Core.replace(/\./g, '')}${trailAfterAbbreviation(Trail, at === tokens.length - 1)}`];
}

/**
 * Rewrites `text` into its spoken form: brand-kit rules first (longest written form wins), then the
 * built-in defaults, then upper-case dotted acronyms (`A.I.` becomes `AI`, `U.S.A.` becomes `USA`;
 * `a.m.` is left alone). Returns the
 * spoken text plus a word alignment so timings measured on the spoken words can be mapped back.
 */
export function NormalizeNarrationText(
    text: string,
    rules: readonly PronunciationRule[] = [],
    includeDefaults = true,
): NormalizedNarrationText {
    const displayTokens = (text ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
    const compiled = compileRules(includeDefaults ? [...rules, ...DEFAULT_PRONUNCIATION_RULES] : rules);
    const spokenTokens: string[] = [];
    const groups: NarrationTokenGroup[] = [];
    let changed = false;
    for (let i = 0; i < displayTokens.length; ) {
        let replacement: string[] | null = null;
        let consumed = 1;
        for (const rule of compiled) {
            replacement = tryRule(displayTokens, i, rule);
            if (replacement) {
                consumed = rule.Words.length;
                break;
            }
        }
        replacement ??= includeDefaults ? tryDottedAcronym(displayTokens, i) : null;
        const spoken = replacement ?? [displayTokens[i]];
        changed ||= replacement !== null && spoken.join(' ') !== displayTokens.slice(i, i + consumed).join(' ');
        groups.push({ DisplayStart: i, DisplayCount: consumed, SpokenStart: spokenTokens.length, SpokenCount: spoken.length });
        spokenTokens.push(...spoken);
        i += consumed;
    }
    return { DisplayTokens: displayTokens, SpokenTokens: spokenTokens, SpokenText: spokenTokens.join(' '), Groups: groups, Changed: changed };
}

function splitSpanEvenly(words: string[], start: number, end: number): NarrationWordTiming[] {
    const step = (end - start) / words.length;
    return words.map((w, k) => ({ Word: w, StartSeconds: start + step * k, EndSeconds: start + step * (k + 1) }));
}

/**
 * Maps word timings measured on the spoken words back onto the display words. When the TTS returned
 * one timing per spoken word, each display group takes the span of its spoken words (split evenly when
 * one spoken span covers several display words). Otherwise display words are spread proportionally
 * over the timings. Returns `[]` when there are no timings.
 */
export function MapWordTimingsToDisplay(
    normalized: NormalizedNarrationText,
    spokenTimings: readonly NarrationWordTiming[],
): NarrationWordTiming[] {
    const display = normalized.DisplayTokens;
    if (spokenTimings.length === 0 || display.length === 0) {
        return [];
    }
    if (spokenTimings.length !== normalized.SpokenTokens.length) {
        return mapProportionally(display, spokenTimings);
    }
    const mapped: NarrationWordTiming[] = [];
    for (const group of normalized.Groups) {
        const words = display.slice(group.DisplayStart, group.DisplayStart + group.DisplayCount);
        if (group.SpokenCount === 0) {
            const at = spokenTimings[Math.min(group.SpokenStart, spokenTimings.length - 1)].StartSeconds;
            mapped.push(...splitSpanEvenly(words, at, at));
            continue;
        }
        const first = spokenTimings[group.SpokenStart];
        const last = spokenTimings[group.SpokenStart + group.SpokenCount - 1];
        mapped.push(...splitSpanEvenly(words, first.StartSeconds, last.EndSeconds));
    }
    return mapped;
}

function mapProportionally(display: readonly string[], timings: readonly NarrationWordTiming[]): NarrationWordTiming[] {
    const n = timings.length;
    const m = display.length;
    return display.map((word, i) => {
        const from = Math.min(n - 1, Math.floor((i * n) / m));
        const to = Math.max(from, Math.min(n - 1, Math.floor(((i + 1) * n) / m) - 1));
        return { Word: word, StartSeconds: timings[from].StartSeconds, EndSeconds: timings[to].EndSeconds };
    });
}
