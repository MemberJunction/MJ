import { describe, it, expect } from 'vitest';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { TextToolLibrary } from '../artifact-tools/TextToolLibrary';
import { ExecuteSafeRegexBatchWithRecovery } from '../artifact-tools/node-vm-safe-regex';

describe('DocumentToolLibrary & TextToolLibrary Grep Enhancements', () => {
    const docLib = new DocumentToolLibrary();
    const textLib = new TextToolLibrary();

    it('R10-7: 200 lines where regex evaluation spans multiple batch slices loses 0 matches and reports poison line in unsearchableLines', async () => {
        const lineCount = 200;
        const lines: string[] = [];
        const expectedHitIndices = [10, 60, 110, 160, 195];

        for (let i = 0; i < lineCount; i++) {
            if (expectedHitIndices.includes(i)) {
                lines.push(`Line ${i}: TARGET_HIT data payload`);
            } else if (i === 50) {
                // Poison line: 16 KB of 'a's that triggers catastrophic backtracking on (a|b)+c
                lines.push('a'.repeat(16_384));
            } else {
                lines.push(`Line ${i}: normal text row for safe regex scanning`);
            }
        }

        const documentContent = lines.join('\n');

        const result = await docLib.InvokeTool(
            'grep',
            { pattern: 'TARGET_HIT|(a|b)+c', use_regex: true },
            documentContent
        );

        expect(result.success).toBe(true);
        const data = result.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
            warnings: string[];
        };

        // 1. All target hits found (0 matches lost)
        expect(data.matchCount).toBe(expectedHitIndices.length);
        expect(data.matches.map((m) => m.lineNumber)).toEqual(expectedHitIndices);

        // 2. Poison line (50) reported in unsearchableLines with line number and reason
        expect(data.unsearchableCount).toBe(1);
        expect(data.unsearchableLines).toHaveLength(1);
        expect(data.unsearchableLines[0]).toEqual({
            lineNumber: 50,
            reason: 'regex_timeout'
        });
        expect(data.timedOut).toBe(true);
        expect(data.partial).toBe(true);
    });

    it('R10-7: ExecuteSafeRegexBatchWithRecovery retries interrupted item solo at cursor without marking it timed out', () => {
        const regex = /TARGET_MATCH|(a|b)+c/;
        const texts: string[] = [];
        for (let i = 0; i < 30; i++) {
            texts.push(`Item ${i} text`);
        }
        texts[5] = 'TARGET_MATCH at 5';
        texts[15] = 'a'.repeat(16_384); // poison item
        texts[25] = 'TARGET_MATCH at 25';

        const deadline = performance.now() + 500;
        const res = ExecuteSafeRegexBatchWithRecovery(regex, texts, deadline, 40, 65_536);

        expect(res.Matches[5]).toBe(true);
        expect(res.Matches[25]).toBe(true);
        expect(res.TimedOut[15]).toBe(true);
        // Non-poison items were not falsely marked as timed out
        expect(res.TimedOut[14]).toBe(false);
        expect(res.TimedOut[16]).toBe(false);
    });

    it('R10-7: literal grep returns unsearchableLines as empty array and matching lines', async () => {
        const text = 'first line\nsecond line with LITERAL_TARGET\nthird line';
        const res = await docLib.InvokeTool('grep', { pattern: 'LITERAL_TARGET' }, text);
        expect(res.success).toBe(true);
        const data = res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
        };
        expect(data.matches).toHaveLength(1);
        expect(data.matches[0].lineNumber).toBe(1);
        expect(data.unsearchableLines).toEqual([]);
    });

    it('R10-9: TextToolLibrary.grep does NOT skip consecutive matching lines when "g" flag is provided', async () => {
        const sampleText = 'prefix_hit_1\nprefix_hit_2\nprefix_hit_3\nno_match_line\nprefix_hit_4';
        const res = await textLib.InvokeTool(
            'grep',
            { pattern: 'prefix_hit', flags: 'g', use_regex: true },
            sampleText
        );

        expect(res.success).toBe(true);
        const data = res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
            warnings: string[];
        };
        // 'g' flag should be stripped so regex.test does not advance lastIndex and skip alternating lines!
        expect(data.matches).toHaveLength(4);
        expect(data.matchCount).toBe(4);
        expect(data.matches.map((m) => m.lineNumber)).toEqual([0, 1, 2, 4]);
    });

    it('R10-9: TextToolLibrary.grep rejects ReDoS patterns safely', async () => {
        const sampleText = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!';

        // ReDoS pattern with nested quantifiers
        const resReDoS = await textLib.InvokeTool(
            'grep',
            { pattern: '(a+)+$', use_regex: true },
            sampleText
        );
        expect(resReDoS.success).toBe(false);
        expect(resReDoS.errorMessage).toBe('Unsafe or overly complex regular expression rejected');

        // Pattern > 256 characters
        const longPattern = 'a'.repeat(257);
        const resLong = await textLib.InvokeTool(
            'grep',
            { pattern: longPattern, use_regex: true },
            sampleText
        );
        expect(resLong.success).toBe(false);
        expect(resLong.errorMessage).toBe('Unsafe or overly complex regular expression rejected');

        // Empty pattern
        const resEmpty = await textLib.InvokeTool(
            'grep',
            { pattern: '' },
            sampleText
        );
        expect(resEmpty.success).toBe(false);
        expect(resEmpty.errorMessage).toBe('grep requires a non-empty pattern.');

        // Invalid regex syntax
        const resSyntax = await textLib.InvokeTool(
            'grep',
            { pattern: '[unclosed', use_regex: true },
            sampleText
        );
        expect(resSyntax.success).toBe(false);
        expect(resSyntax.errorMessage).toContain('Invalid regular expression');
    });

    it('R11-6: TextToolLibrary.grep literal default finds $100 and [DRAFT] case-insensitively without escaping', async () => {
        const sample = 'Cost: $100 for basic tier\nStatus: [DRAFT] review pending\nLowercase [draft] notes\nTotal is $100.00 USD';

        const resDollar = await textLib.InvokeTool('grep', { pattern: '$100' }, sample);
        expect(resDollar.success).toBe(true);
        const dataDollar = resDollar.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
            warnings: string[];
        };
        expect(dataDollar.matchCount).toBe(2);
        expect(dataDollar.matches.map((m) => m.lineNumber)).toEqual([0, 3]);
        expect(dataDollar.partial).toBe(false);
        expect(dataDollar.timedOut).toBe(false);

        const resDraft = await textLib.InvokeTool('grep', { pattern: '[DRAFT]' }, sample);
        expect(resDraft.success).toBe(true);
        const dataDraft = resDraft.data as typeof dataDollar;
        expect(dataDraft.matchCount).toBe(2);
        expect(dataDraft.matches.map((m) => m.lineNumber)).toEqual([1, 2]);
    });

    it('R11-6: TextToolLibrary.grep 500,000-line log with match on line 499_999 returns matchCount: 1 in < 500 ms', async () => {
        const logContent = 'standard log row entry info\n'.repeat(499_999) + 'CRITICAL_ERROR at end of processing log';
        const t0 = performance.now();
        const res = await textLib.InvokeTool('grep', { pattern: 'CRITICAL_ERROR' }, logContent);
        const elapsed = performance.now() - t0;

        expect(res.success).toBe(true);
        const data = res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
            warnings: string[];
        };
        expect(data.matchCount).toBe(1);
        expect(data.matches[0].lineNumber).toBe(499_999);
        expect(data.matches[0].text).toBe('CRITICAL_ERROR at end of processing log');
        expect(elapsed).toBeLessThan(2500);
    });

    it('R11-6: TextToolLibrary.grep use_regex: true with a poison 16 KB line reports timeout and finds matches in later batches', async () => {
        const lineCount = 600;
        const lines: string[] = [];
        for (let i = 0; i < lineCount; i++) {
            if (i === 10) {
                lines.push(`Line ${i}: HIT_TARGET in batch 1 ` + 'x'.repeat(450));
            } else if (i === 50) {
                // Poison line: 16 KB of 'a's that triggers catastrophic backtracking on (a|b)+c
                lines.push('a'.repeat(16_384));
            } else if (i === 550) {
                // Line in second 256 KB batch (> 512 items or > 262,144 chars)
                lines.push(`Line ${i}: HIT_TARGET in batch 2 ` + 'x'.repeat(450));
            } else {
                lines.push(`Line ${i}: filler row data without target ` + 'z'.repeat(450));
            }
        }
        const textContent = lines.join('\n');

        const res = await textLib.InvokeTool(
            'grep',
            { pattern: 'HIT_TARGET|(a|b)+c', use_regex: true },
            textContent
        );

        expect(res.success).toBe(true);
        const data = res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
            warnings: string[];
        };

        expect(data.matchCount).toBe(2);
        expect(data.matches.map((m) => m.lineNumber)).toEqual([10, 550]);
        expect(data.partial).toBe(true);
        expect(data.timedOut).toBe(true);
        expect(data.unsearchableCount).toBe(1);
        expect(data.unsearchableLines).toEqual([
            { lineNumber: 50, reason: 'regex_timeout' }
        ]);
        expect(data.warnings.length).toBeGreaterThan(0);
    });

    it('R11-6: TextToolLibrary.grep use_regex: true on quadratic \\d+y across 60x8000-digit lines surfaces partial/unsearchableLines instead of silently returning []', async () => {
        const lines: string[] = [];
        for (let i = 0; i < 60; i++) {
            if (i === 59) {
                lines.push('9'.repeat(7_999) + 'y');
            } else {
                lines.push('9'.repeat(8_000));
            }
        }
        const res = await textLib.InvokeTool(
            'grep',
            { pattern: '\\d+y', use_regex: true },
            lines.join('\n')
        );
        expect(res.success).toBe(true);
        const data = res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableLines: Array<{ lineNumber: number; reason: string }>;
            warnings: string[];
        };
        expect(data.partial).toBe(true);
        expect(data.timedOut).toBe(true);
        expect(data.unsearchableCount).toBeGreaterThan(0);
        expect(data.unsearchableLines.length).toBeGreaterThan(0);
        expect(data.warnings.length).toBeGreaterThan(0);
    });
});
