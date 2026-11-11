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
            { pattern: 'prefix_hit', flags: 'g' },
            sampleText
        );

        expect(res.success).toBe(true);
        const matches = res.data as Array<{ lineNumber: number; text: string }>;
        // 'g' flag should be stripped so regex.test does not advance lastIndex and skip alternating lines!
        expect(matches).toHaveLength(4);
        expect(matches.map((m) => m.lineNumber)).toEqual([0, 1, 2, 4]);
    });

    it('R10-9: TextToolLibrary.grep rejects ReDoS patterns safely', async () => {
        const sampleText = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!';

        // ReDoS pattern with nested quantifiers
        const resReDoS = await textLib.InvokeTool(
            'grep',
            { pattern: '(a+)+$' },
            sampleText
        );
        expect(resReDoS.success).toBe(false);
        expect(resReDoS.errorMessage).toBe('Unsafe or overly complex regular expression rejected');

        // Pattern > 256 characters
        const longPattern = 'a'.repeat(257);
        const resLong = await textLib.InvokeTool(
            'grep',
            { pattern: longPattern },
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
            { pattern: '[unclosed' },
            sampleText
        );
        expect(resSyntax.success).toBe(false);
        expect(resSyntax.errorMessage).toContain('Invalid regular expression');
    });
});
