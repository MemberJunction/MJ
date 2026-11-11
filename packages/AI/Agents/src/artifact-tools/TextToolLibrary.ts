import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { CompileSafeUserRegex, IsSafeUserRegex } from '@memberjunction/core-entities';
import { EnsureNodeVmSafeRegexExecutorRegistered, ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';

const GREP_REGEX_BUDGET_MS = 150;
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

interface LineMatch {
    lineNumber: number;
    text: string;
}

interface UnsearchableLine {
    lineNumber: number;
    reason: 'exceeds_64kb_regex_limit' | 'regex_timeout' | 'budget_expired';
}

/**
 * Tool library for searching and slicing plain-text artifact content.
 * Provides literal/regex grep and line-range extraction.
 */
@RegisterClass(BaseArtifactToolLibrary, 'TextToolLibrary')
export class TextToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'grep',
                description:
                    'Search lines in the text by case-insensitive literal substring (default false for use_regex) or by regular expression when use_regex is true. Returns a stable result object with matching lines and line numbers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'Literal text substring (default) or regex pattern (when use_regex/useRegex is true) to search for.'
                        },
                        flags: { type: 'string', description: 'Optional regex flags when use_regex is true (e.g., "i" for case-insensitive).' },
                        case_sensitive: {
                            type: 'boolean',
                            description:
                                'Case-sensitive matching. Defaults to false (case-insensitive) for literal search; when use_regex is true, defaults to regex flags (case-sensitive unless flags includes "i", and explicit case_sensitive overrides flags).'
                        },
                        caseSensitive: {
                            type: 'boolean',
                            description: 'Alias for case_sensitive (default false).'
                        },
                        use_regex: {
                            type: 'boolean',
                            description:
                                'Optional (default false): set true to evaluate pattern as a regular expression instead of a literal substring.'
                        },
                        useRegex: {
                            type: 'boolean',
                            description:
                                'Alias for use_regex (default false): set true to evaluate pattern as a regular expression instead of a literal substring.'
                        }
                    },
                    required: ['pattern']
                }
            },
            {
                name: 'get_lines',
                description: 'Return lines from `start` (0-based) for `count` lines.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        start: { type: 'number', description: 'Start line number (0-based).' },
                        count: { type: 'number', description: 'Number of lines to return.' }
                    },
                    required: ['start', 'count']
                }
            }
        ];
    }

    protected async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');

        switch (toolName) {
            case 'grep':
                return this.handleGrep(contentStr, input);
            case 'get_lines':
                return this.handleGetLines(contentStr, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown tool: "${toolName}"` };
        }
    }

    private handleGrep(content: string, input: Record<string, unknown>): ArtifactToolResult {
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
            return {
                success: true,
                data: {
                    matches,
                    matchCount: matches.length,
                    partial: false,
                    timedOut: false,
                    unsearchableCount: 0,
                    unsearchableLines: [],
                    warnings: []
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

    private handleGetLines(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const start = Number(input.start ?? 0);
        const count = Number(input.count ?? 20);
        const lines = content.split('\n');

        const sliced = lines.slice(start, start + count);
        const result: LineMatch[] = sliced.map((text, idx) => ({
            lineNumber: start + idx,
            text
        }));

        return { success: true, data: result };
    }
}
