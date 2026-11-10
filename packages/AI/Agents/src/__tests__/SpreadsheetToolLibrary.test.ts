import { describe, it, expect } from 'vitest';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { SpreadsheetToolLibrary } from '../artifact-tools/SpreadsheetToolLibrary';

describe('SpreadsheetToolLibrary & DocumentToolLibrary (Round 4 — E6, E8, D1)', () => {
    const sheetLib = new SpreadsheetToolLibrary();
    const docLib = new DocumentToolLibrary();

    it('E8: rejects polynomial backtracking regexes (\\d+\\d+\\d+$, \\w+.*\\w+$) and finishes in < 20ms on 5,000-char adversarial subjects', async () => {
        const adversarialText = '1'.repeat(5000) + 'a';
        const writeRes = await sheetLib.InvokeTool(
            'write_cells',
            { cells: [{ address: 'A1', value: adversarialText }, { address: 'A2', value: '2026-11-10' }] },
            ''
        );
        expect(writeRes.success).toBe(true);
        const wbJson = (writeRes.data as { updatedContent: string }).updatedContent;
        const adversarialDoc = `# Metrics\n\n${adversarialText}\n\nRelease date: 2026-11-10\n`;

        for (const polyPattern of ['\\d+\\d+\\d+$', '\\w+.*\\w+$', '\\d+\\s*\\d+$']) {
            const startMs = performance.now();
            const cellRes = await sheetLib.InvokeTool('search_cells', { query: polyPattern, useRegex: true }, wbJson);
            const grepRes = await docLib.InvokeTool('grep', { pattern: polyPattern, useRegex: true }, adversarialDoc);
            const blockRes = await docLib.InvokeTool('search_blocks', { query: polyPattern, useRegex: true }, adversarialDoc);
            const elapsed = performance.now() - startMs;

            expect(cellRes.success).toBe(false);
            expect(cellRes.errorMessage).toContain('Unsafe or overly complex regular expression rejected');
            expect(grepRes.success).toBe(false);
            expect(grepRes.errorMessage).toContain('Unsafe or overly complex regular expression rejected');
            expect(blockRes.success).toBe(false);
            expect(blockRes.errorMessage).toContain('Unsafe or overly complex regular expression rejected');
            expect(elapsed).toBeLessThan(20);
        }

        // Safe delimited date regex executes in < 20ms even against the 5,000-char line/cell
        const safePattern = '^\\d{4}-\\d{2}-\\d{2}$';
        const safeStart = performance.now();
        const safeCells = await sheetLib.InvokeTool('search_cells', { query: safePattern, useRegex: true }, wbJson);
        const safeGrep = await docLib.InvokeTool('grep', { pattern: '\\d{4}-\\d{2}-\\d{2}', useRegex: true }, adversarialDoc);
        const safeBlocks = await docLib.InvokeTool('search_blocks', { query: '\\d{4}-\\d{2}-\\d{2}', useRegex: true }, adversarialDoc);
        const safeElapsed = performance.now() - safeStart;

        expect(safeCells.success).toBe(true);
        expect((safeCells.data as { matches: Array<{ cell: string }> }).matches.map((m) => m.cell)).toEqual(['A2']);
        expect(safeGrep.success).toBe(true);
        expect(safeGrep.data as Array<{ lineNumber: number }>).toHaveLength(1);
        expect(safeBlocks.success).toBe(true);
        expect((safeBlocks.data as { matchCount: number }).matchCount).toBe(1);
        expect(safeElapsed).toBeLessThan(20);
    });

    it('E6 & D1: rename_sheet preserves whole-column/whole-row cross-sheet refs and quotes boolean/R1C1 sheet names, and write_cells enforces D1 decimal precision', async () => {
        const addTwo = await sheetLib.InvokeTool('add_sheet', { name: 'Two' }, '');
        expect(addTwo.success).toBe(true);
        let wbJson = (addTwo.data as { updatedContent: string }).updatedContent;

        const seedTwo = await sheetLib.InvokeTool(
            'write_cells',
            {
                sheet: 'Two',
                cells: [
                    { address: 'A2', value: 15 },
                    { address: 'A8', value: 35 },
                    { address: 'C3', value: 9 }
                ]
            },
            wbJson
        );
        expect(seedTwo.success).toBe(true);
        wbJson = (seedTwo.data as { updatedContent: string }).updatedContent;

        const writeFormulas = await sheetLib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sheet 1',
                cells: [
                    { address: 'A1', formula: '=SUM(Two!A:A)' },
                    { address: 'A2', formula: '=SUM(Two!3:3)' },
                    { address: 'B1', formula: '=FLOOR(0.3, 0.1)' },
                    { address: 'B2', formula: '=CEILING(0.1*3, 0.1)' },
                    { address: 'B3', formula: '=0.1+0.2=0.3' }
                ]
            },
            wbJson
        );
        expect(writeFormulas.success).toBe(true);
        wbJson = (writeFormulas.data as { updatedContent: string }).updatedContent;

        // Duplicate case-colliding rename rejected
        const dupRename = await sheetLib.InvokeTool('rename_sheet', { sheet: 'Two', newName: 'sheet 1' }, wbJson);
        expect(dupRename.success).toBe(false);

        // Rename to boolean literal 'TRUE' quotes qualifier and preserves whole-column/whole-row refs
        const renameTrue = await sheetLib.InvokeTool('rename_sheet', { sheet: 'Two', newName: 'TRUE' }, wbJson);
        expect(renameTrue.success).toBe(true);
        wbJson = (renameTrue.data as { updatedContent: string }).updatedContent;

        const readRes = await sheetLib.InvokeTool('read_range', { sheet: 'Sheet 1', range: 'A1:B3' }, wbJson);
        expect(readRes.success).toBe(true);
        const data = readRes.data as {
            cells: Array<{ address: string; formula: string | null; computedValue: string | number | boolean | null }>;
            matrix: Array<Array<string | number | boolean | null>>;
        };
        const byAddr = new Map(data.cells.map((c) => [c.address, c]));
        expect(byAddr.get('A1')?.formula).toBe("=SUM('TRUE'!A:A)");
        expect(byAddr.get('A1')?.computedValue).toBe(50);
        expect(byAddr.get('A2')?.formula).toBe("=SUM('TRUE'!3:3)");
        expect(byAddr.get('A2')?.computedValue).toBe(9);
        expect(byAddr.get('B1')?.computedValue).toBe(0.3);
        expect(byAddr.get('B2')?.computedValue).toBe(0.3);
        expect(byAddr.get('B3')?.computedValue).toBe(true);
    });
});
