import { ArtifactToolResult, BaseArtifactToolLibrary } from '@memberjunction/ai-core-plus';
import { CompileSafeUserRegex, IsSafeUserRegex } from '@memberjunction/core-entities';
import { EnsureNodeVmSafeRegexExecutorRegistered, ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';

export type GrepRawToolInput = Parameters<BaseArtifactToolLibrary['InvokeTool']>[1];

export const GREP_REGEX_BUDGET_MS = 500;
const BATCH_REGEX_MAX_MS = 40;
const MAX_BATCH_ITEMS = 512;
const MAX_BATCH_CHARS = 262_144;
const MAX_REGEX_INPUT_BYTES = 65_536;
const MAX_SAFE_UTF16_UNITS_FOR_64KB = 21_845;
const MAX_REPORTED_UNSEARCHABLE_LINES = 50;

function exceedsRegexInputBytes(text: string): boolean {
    if (text.length <= MAX_SAFE_UTF16_UNITS_FOR_64KB) {
        return false;
    }
    return Buffer.byteLength(text, 'utf8') > MAX_REGEX_INPUT_BYTES;
}

export interface LineMatch {
    lineNumber: number;
    text: string;
}

export interface UnsearchableLine {
    lineNumber: number;
    reason: 'exceeds_64kb_regex_limit' | 'regex_timeout' | 'budget_expired';
}

export interface StructuredGrepResultData {
    matches: LineMatch[];
    matchCount: number;
    partial: boolean;
    timedOut: boolean;
    unsearchableCount: number;
    unsearchableLines: UnsearchableLine[];
    warnings: string[];
}

function looksLikeRegexPattern(pattern: string): boolean {
    if (/\\[dwsbDWSB]|\.\*|\.\+|(?:^|[^\\])\|/.test(pattern)) {
        return true;
    }
    if (/^\^/.test(pattern)) {
        return true;
    }
    if (/(?:[\w\]\)])\$$/.test(pattern)) {
        return true;
    }
    return false;
}

/**
 * Shared line-by-line grep execution helper used by DocumentToolLibrary and TextToolLibrary.
 * Evaluates plain-text substring searches or bounded safe regex queries across lines.
 */
export async function ExecuteStructuredLineGrep(
    content: string,
    input: GrepRawToolInput
): Promise<ArtifactToolResult> {
    const patternStr = String(input.pattern ?? '');
    if (!patternStr) {
        return { success: false, data: null, errorMessage: 'grep requires a non-empty pattern.' };
    }
    const flags = input.flags != null ? String(input.flags) : undefined;
    const lines = content.split('\n');
    const explicitRegex = input.useRegex === true || input.use_regex === true;
    const explicitCaseSensitive = input.case_sensitive === true || input.caseSensitive === true;
    const explicitCaseInsensitive = input.case_sensitive === false || input.caseSensitive === false;

    if (!explicitRegex) {
        const caseSensitive = explicitCaseSensitive;
        const needle = caseSensitive ? patternStr : patternStr.toLowerCase();
        const matches: LineMatch[] = [];
        for (let i = 0; i < lines.length; i++) {
            const hay = caseSensitive ? lines[i] : lines[i].toLowerCase();
            if (hay.includes(needle)) {
                matches.push({ lineNumber: i, text: lines[i] });
            }
        }
        const warnings: string[] = [];
        if (matches.length === 0 && looksLikeRegexPattern(patternStr)) {
            warnings.push(
                'Pattern matched 0 literal occurrences and contains regex-like syntax; pass use_regex: true if you intended a regular expression search.'
            );
        }
        return {
            success: true,
            data: {
                matches,
                matchCount: matches.length,
                partial: false,
                timedOut: false,
                unsearchableCount: 0,
                unsearchableLines: [],
                warnings
            }
        };
    }

    EnsureNodeVmSafeRegexExecutorRegistered();

    if (patternStr.length > 256) {
        return {
            success: false,
            data: null,
            errorMessage: 'Unsafe or overly complex regular expression rejected'
        };
    }

    let cleanFlags = flags ? flags.replace(/[gy]/g, () => '') : '';
    if (explicitCaseSensitive) {
        cleanFlags = cleanFlags.replace(/i/g, () => '');
    } else if (explicitCaseInsensitive && !cleanFlags.includes('i')) {
        cleanFlags += 'i';
    }
    const effectiveFlags = cleanFlags.length > 0 ? cleanFlags : undefined;

    try {
        new RegExp(patternStr, effectiveFlags);
    } catch (err) {
        return {
            success: false,
            data: null,
            errorMessage: `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`
        };
    }

    const safeRegex = CompileSafeUserRegex(patternStr, effectiveFlags);
    if (!safeRegex || !IsSafeUserRegex(patternStr, effectiveFlags)) {
        return {
            success: false,
            data: null,
            errorMessage: 'Unsafe or overly complex regular expression rejected'
        };
    }

    const matches: LineMatch[] = [];
    const unsearchableLines: UnsearchableLine[] = [];
    let tooLongCount = 0;
    let timeoutCount = 0;
    let budgetSkippedCount = 0;
    let budgetExpired = false;
    const regexDeadline = performance.now() + GREP_REGEX_BUDGET_MS;

    const recordUnsearchableLine = (
        lineNumber: number,
        reason: UnsearchableLine['reason']
    ): void => {
        if (reason === 'exceeds_64kb_regex_limit') {
            tooLongCount++;
        } else if (reason === 'regex_timeout') {
            timeoutCount++;
        } else {
            budgetSkippedCount++;
        }
        if (unsearchableLines.length < MAX_REPORTED_UNSEARCHABLE_LINES) {
            unsearchableLines.push({ lineNumber, reason });
        }
    };

    let pendingLineNums: number[] = [];
    let pendingTexts: string[] = [];
    let pendingChars = 0;

    const flushLineBatch = (): void => {
        if (pendingLineNums.length === 0) return;
        if (budgetExpired) {
            for (let k = 0; k < pendingLineNums.length; k++) {
                recordUnsearchableLine(pendingLineNums[k], 'budget_expired');
            }
            pendingLineNums = [];
            pendingTexts = [];
            pendingChars = 0;
            return;
        }

        const recRes = ExecuteSafeRegexBatchWithRecovery(
            safeRegex,
            pendingTexts,
            regexDeadline,
            BATCH_REGEX_MAX_MS,
            MAX_REGEX_INPUT_BYTES
        );
        if (recRes.BudgetExpired) {
            budgetExpired = true;
        }
        for (let k = 0; k < pendingLineNums.length; k++) {
            if (recRes.Matches[k]) {
                matches.push({ lineNumber: pendingLineNums[k], text: pendingTexts[k] });
            } else if (recRes.TimedOut[k]) {
                recordUnsearchableLine(pendingLineNums[k], 'regex_timeout');
            } else if (recRes.BudgetSkipped[k]) {
                recordUnsearchableLine(pendingLineNums[k], 'budget_expired');
            } else if (recRes.InputTooLong[k]) {
                recordUnsearchableLine(pendingLineNums[k], 'exceeds_64kb_regex_limit');
            }
        }
        pendingLineNums = [];
        pendingTexts = [];
        pendingChars = 0;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (exceedsRegexInputBytes(line)) {
            flushLineBatch();
            recordUnsearchableLine(i, 'exceeds_64kb_regex_limit');
            continue;
        }
        if (budgetExpired) {
            recordUnsearchableLine(i, 'budget_expired');
            continue;
        }
        pendingLineNums.push(i);
        pendingTexts.push(line);
        pendingChars += line.length;
        if (pendingLineNums.length >= MAX_BATCH_ITEMS || pendingChars >= MAX_BATCH_CHARS) {
            flushLineBatch();
        }
    }
    flushLineBatch();

    const unsearchableCount = tooLongCount + timeoutCount + budgetSkippedCount;
    const timedOut = timeoutCount > 0 || budgetSkippedCount > 0;
    const partial = unsearchableCount > 0 || timedOut;

    const warnings: string[] = [];
    if (tooLongCount > 0) {
        warnings.push(
            `${tooLongCount} line(s) exceeded the 64 KB regex limit and were not searched. Retry with use_regex: false for plain-text search across arbitrarily long lines.`
        );
    }
    if (timedOut) {
        warnings.push(
            `${timeoutCount + budgetSkippedCount} line(s) timed out or were skipped after reaching the ${GREP_REGEX_BUDGET_MS}ms regex time budget. Simplify the pattern or retry with use_regex: false for plain-text search.`
        );
    }
    if (unsearchableCount > 0) {
        const capNote = unsearchableCount > unsearchableLines.length ? ` (showing ${unsearchableLines.length} of ${unsearchableCount})` : '';
        warnings.push(
            `${unsearchableCount} line(s) could not be searched within the regex execution budget${capNote}.`
        );
    }

    return {
        success: true,
        data: {
            matches,
            matchCount: matches.length,
            partial,
            timedOut,
            unsearchableCount,
            unsearchableLines,
            warnings
        }
    };
}
