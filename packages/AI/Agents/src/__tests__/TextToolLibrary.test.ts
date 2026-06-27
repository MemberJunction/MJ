import { describe, it, expect } from 'vitest';
import { TextToolLibrary } from '../artifact-tools/TextToolLibrary';

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
        it('should return matching lines with line numbers', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'Hello' }, sampleText);
            expect(result.success).toBe(true);
            const matches = result.data as { lineNumber: number; text: string }[];
            expect(matches).toHaveLength(1);
            expect(matches[0].lineNumber).toBe(0);
            expect(matches[0].text).toBe('Line zero: Hello World');
        });

        // Slice 3: grep with case-insensitive flag
        it('should support case-insensitive flag', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'hello', flags: 'i' }, sampleText);
            expect(result.success).toBe(true);
            const matches = result.data as { lineNumber: number; text: string }[];
            expect(matches).toHaveLength(2);
            expect(matches[0].lineNumber).toBe(0);
            expect(matches[1].lineNumber).toBe(2);
        });

        // Slice 4: grep with no matches returns empty array
        it('should return empty array when no matches', async () => {
            const result = await lib.InvokeTool('grep', { pattern: 'ZZZZZ' }, sampleText);
            expect(result.success).toBe(true);
            const matches = result.data as { lineNumber: number; text: string }[];
            expect(matches).toHaveLength(0);
        });
    });

    // Slice 5: get_lines returns a slice of lines
    describe('get_lines', () => {
        it('should return a slice of lines', async () => {
            const result = await lib.InvokeTool('get_lines', { start: 1, count: 2 }, sampleText);
            expect(result.success).toBe(true);
            const lines = result.data as { lineNumber: number; text: string }[];
            expect(lines).toHaveLength(2);
            expect(lines[0]).toEqual({ lineNumber: 1, text: 'Line one: foo bar' });
            expect(lines[1]).toEqual({ lineNumber: 2, text: 'Line two: HELLO again' });
        });

        // Slice 6: get_lines handles out-of-bounds gracefully
        it('should handle out-of-bounds gracefully', async () => {
            const result = await lib.InvokeTool('get_lines', { start: 3, count: 100 }, sampleText);
            expect(result.success).toBe(true);
            const lines = result.data as { lineNumber: number; text: string }[];
            expect(lines).toHaveLength(2); // only lines 3 and 4 exist
            expect(lines[0].lineNumber).toBe(3);
            expect(lines[1].lineNumber).toBe(4);
        });

        it('should return empty when start is beyond end', async () => {
            const result = await lib.InvokeTool('get_lines', { start: 999, count: 5 }, sampleText);
            expect(result.success).toBe(true);
            const lines = result.data as { lineNumber: number; text: string }[];
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
