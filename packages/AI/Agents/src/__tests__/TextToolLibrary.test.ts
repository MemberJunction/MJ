import { describe, it, expect } from 'vitest';
import { TextToolLibrary } from '../artifact-tools/TextToolLibrary';

interface LineMatch {
    lineNumber: number;
    text: string;
}

interface TextGrepResultData {
    matches: LineMatch[];
    matchCount: number;
    partial: boolean;
    timedOut: boolean;
    unsearchableCount: number;
    unsearchableLines: Array<{ lineNumber: number; reason: string }>;
    warnings: string[];
}

const sampleText = `Line zero: Hello World
Line one: foo bar
Line two: HELLO again
Line three: baz qux
Line four: final line`;

describe('TextToolLibrary', () => {
    const lib = new TextToolLibrary();

    // Slice 1: GetToolList returns 2 tools
    describe('GetToolList', () => {
        it('should return 2 subclass tools plus inherited get_full (3 total)', () => {
            const tools = lib.GetToolList();
            expect(tools).toHaveLength(3);
            const names = tools.map(t => t.name);
            expect(names).toContain('get_full');
            expect(names).toContain('grep');
            expect(names).toContain('get_lines');
        });
    });

    // Slice 2: grep returns matching lines with line numbers
    describe('grep', () => {
        it('should return matching lines with line numbers with case_sensitive: true', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'Hello', case_sensitive: true }, sampleText);
            expect(result.success).toBe(true);
            const data = result.data as TextGrepResultData;
            expect(data.matches).toHaveLength(1);
            expect(data.matchCount).toBe(1);
            expect(data.matches[0].lineNumber).toBe(0);
            expect(data.matches[0].text).toBe('Line zero: Hello World');
        });

        it('should perform case-insensitive literal search by default', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'hello' }, sampleText);
            expect(result.success).toBe(true);
            const data = result.data as TextGrepResultData;
            expect(data.matches).toHaveLength(2);
            expect(data.matchCount).toBe(2);
            expect(data.matches[0].lineNumber).toBe(0);
            expect(data.matches[1].lineNumber).toBe(2);
        });

        // Slice 3: grep with case-insensitive flag in regex mode
        it('should support case-insensitive flag', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'hello', flags: 'i', use_regex: true }, sampleText);
            expect(result.success).toBe(true);
            const data = result.data as TextGrepResultData;
            expect(data.matches).toHaveLength(2);
            expect(data.matchCount).toBe(2);
            expect(data.matches[0].lineNumber).toBe(0);
            expect(data.matches[1].lineNumber).toBe(2);
        });

        // Slice 4: grep with no matches returns empty array
        it('should return empty array when no matches', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'ZZZZZ' }, sampleText);
            expect(result.success).toBe(true);
            const data = result.data as TextGrepResultData;
            expect(data.matches).toHaveLength(0);
            expect(data.matchCount).toBe(0);
        });

        it('shows "showing 50 of N" in warnings when > 50 lines are unsearchable', async () => {
            const longLines = Array.from({ length: 60 }, (_, i) => `Line ${i}: ` + 'x'.repeat(70_000)).join('\n');
            const res = await lib.InvokeTool('grep', { pattern: 'target', use_regex: true }, longLines);
            expect(res.success).toBe(true);
            const data = res.data as TextGrepResultData;
            expect(data.unsearchableCount).toBe(60);
            expect(data.unsearchableLines).toHaveLength(50);
            expect(data.warnings.some(w => w.includes('showing 50 of 60'))).toBe(true);
        });

        it('emits regex-like syntax hint warning when literal search has 0 matches for regex-looking patterns', async () => {
            const expectedHint = 'Pattern matched 0 literal occurrences and contains regex-like syntax; pass use_regex: true if you intended a regular expression search.';

            const resPipe = await lib.InvokeTool('grep', { pattern: 'ERROR|WARN' }, 'Just an informational line');
            expect(resPipe.success).toBe(true);
            const dataPipe = resPipe.data as TextGrepResultData;
            expect(dataPipe.matchCount).toBe(0);
            expect(dataPipe.warnings).toContain(expectedHint);

            const resDigit = await lib.InvokeTool('grep', { pattern: 'foo\\d+' }, 'foo123 and bar');
            expect(resDigit.success).toBe(true);
            const dataDigit = resDigit.data as TextGrepResultData;
            expect(dataDigit.matchCount).toBe(0);
            expect(dataDigit.warnings).toContain(expectedHint);

            // Plain literal searches with 0 matches should NOT emit false regex warnings
            const resDollar = await lib.InvokeTool('grep', { pattern: '$100' }, 'No prices here');
            expect(resDollar.success).toBe(true);
            const dataDollar = resDollar.data as TextGrepResultData;
            expect(dataDollar.matchCount).toBe(0);
            expect(dataDollar.warnings).toEqual([]);

            const resDraft = await lib.InvokeTool('grep', { pattern: '[DRAFT]' }, 'Final published notes');
            expect(resDraft.success).toBe(true);
            const dataDraft = resDraft.data as TextGrepResultData;
            expect(dataDraft.matchCount).toBe(0);
            expect(dataDraft.warnings).toEqual([]);
        });

        it('TextToolLibrary.grep 500,000-line log with match on line 499_999 returns matchCount: 1 in < 2500 ms', async () => {
            const logContent = 'standard log row entry info\n'.repeat(499_999) + 'CRITICAL_ERROR at end of processing log';
            const t0 = performance.now();
            const res = await lib.InvokeTool('grep', { pattern: 'CRITICAL_ERROR' }, logContent);
            const elapsed = performance.now() - t0;

            expect(res.success).toBe(true);
            const data = res.data as TextGrepResultData;
            expect(data.matchCount).toBe(1);
            expect(data.matches[0].lineNumber).toBe(499_999);
            expect(elapsed).toBeLessThan(2500);
        });
    });

    // Slice 5: get_lines returns a slice of lines
    describe('get_lines', () => {
        it('should return a slice of lines', async () => {
            const result = await lib.InvokeTool('get_lines', { start: 1, count: 2 }, sampleText);
            expect(result.success).toBe(true);
            const lines = result.data as LineMatch[];
            expect(lines).toHaveLength(2);
            expect(lines[0]).toEqual({ lineNumber: 1, text: 'Line one: foo bar' });
            expect(lines[1]).toEqual({ lineNumber: 2, text: 'Line two: HELLO again' });
        });

        // Slice 6: get_lines handles out-of-bounds gracefully
        it('should handle out-of-bounds gracefully', async () => {
            const result = await lib.InvokeTool('get_lines', { start: 3, count: 100 }, sampleText);
            expect(result.success).toBe(true);
            const lines = result.data as LineMatch[];
            expect(lines).toHaveLength(2); // only lines 3 and 4 exist
            expect(lines[0].lineNumber).toBe(3);
            expect(lines[1].lineNumber).toBe(4);
        });

        it('should return empty when start is beyond end', async () => {
            const result = await lib.InvokeTool('get_lines', { start: 999, count: 5 }, sampleText);
            expect(result.success).toBe(true);
            const lines = result.data as LineMatch[];
            expect(lines).toHaveLength(0);
        });
    });

    describe('error handling', () => {
        it('should return error for unknown tool name', async () => {
            const result = await lib.InvokeTool('unknown_tool', {}, sampleText);
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('Unknown tool');
        });
    });
});
