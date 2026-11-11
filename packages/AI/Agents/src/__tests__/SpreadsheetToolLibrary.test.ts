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

    it('R6-6: plain-text search finds matches in > 64 KB blocks/cells without regex caps, while use_regex=true enforces cumulative 50ms budget and reports unsearchable items + warnings', async () => {
        // 1. 105 KB block & 105 KB cell containing 'revenue' near the end
        const large105kb = `${'padding text '.repeat(8200)}annual revenue grew 42% YoY`;
        expect(Buffer.byteLength(large105kb, 'utf8')).toBeGreaterThan(105_000);

        const largeDoc = `# Executive Summary\n\n${large105kb}\n`;

        const plainDocStart = performance.now();
        const plainDocRes = await docLib.InvokeTool('search_blocks', { query: 'revenue' }, largeDoc);
        const plainDocMs = performance.now() - plainDocStart;
        expect(plainDocRes.success).toBe(true);
        const plainDocData = plainDocRes.data as {
            matchCount: number;
            unsearchableCount: number;
            warnings: string[];
        };
        expect(plainDocData.matchCount).toBe(1);
        expect(plainDocData.unsearchableCount).toBe(0);
        expect(plainDocMs).toBeLessThan(50);

        // With use_regex: true on the 105 KB block -> reports unsearchableCount: 1 + warning
        const regex105kbDocRes = await docLib.InvokeTool(
            'search_blocks',
            { query: 'revenue', use_regex: true },
            largeDoc
        );
        expect(regex105kbDocRes.success).toBe(true);
        const regex105kbDocData = regex105kbDocRes.data as {
            matchCount: number;
            unsearchableCount: number;
            unsearchableBlocks: Array<{ blockId: string; reason: string }>;
            warnings: string[];
        };
        expect(regex105kbDocData.matchCount).toBe(0);
        expect(regex105kbDocData.unsearchableCount).toBe(1);
        expect(regex105kbDocData.unsearchableBlocks[0]?.reason).toBe('exceeds_64kb_regex_limit');
        expect(regex105kbDocData.warnings.length).toBeGreaterThan(0);
        expect(regex105kbDocData.warnings[0]).toContain('64 KB');

        // Same for SpreadsheetToolLibrary search_cells on a 105 KB cell
        const seed105 = await sheetLib.InvokeTool(
            'write_cells',
            { cells: [{ address: 'A1', value: large105kb }] },
            ''
        );
        expect(seed105.success).toBe(true);
        const wb105Json = (seed105.data as { updatedContent: string }).updatedContent;

        const plainCellRes = await sheetLib.InvokeTool('search_cells', { query: 'revenue' }, wb105Json);
        expect(plainCellRes.success).toBe(true);
        expect((plainCellRes.data as { matches: Array<{ cell: string }> }).matches).toHaveLength(1);

        const regex105CellRes = await sheetLib.InvokeTool(
            'search_cells',
            { query: 'revenue', use_regex: true },
            wb105Json
        );
        expect(regex105CellRes.success).toBe(true);
        const regex105CellData = regex105CellRes.data as {
            matches: Array<{ cell: string }>;
            unsearchableCount: number;
            unsearchableCells: Array<{ sheet: string; cell: string; reason: string }>;
            warnings: string[];
        };
        expect(regex105CellData.matches).toHaveLength(0);
        expect(regex105CellData.unsearchableCount).toBe(1);
        expect(regex105CellData.unsearchableCells[0]?.reason).toBe('exceeds_64kb_regex_limit');
        expect(regex105CellData.warnings.length).toBeGreaterThan(0);

        // 2. 20 blocks of 16 KB 'a' with use_regex: true and slow pattern (a|b)+c or \s*\w+\s*$
        const block16kAs = 'a'.repeat(16_384);
        const block16kSpaces = `${' '.repeat(8192)}${'a'.repeat(8191)}!`;
        const twentyBlocksAsDoc = Array.from({ length: 20 }, (_, i) => `## Block ${i + 1}\n\n${block16kAs}`).join('\n\n');
        const twentyBlocksSpacesDoc = Array.from({ length: 20 }, (_, i) => `## Block ${i + 1}\n\n${block16kSpaces}`).join('\n\n');

        const tBlocks1 = performance.now();
        const resBlocksAs = await docLib.InvokeTool(
            'search_blocks',
            { query: '(a|b)+c', use_regex: true },
            twentyBlocksAsDoc
        );
        const elapsedBlocksAs = performance.now() - tBlocks1;
        expect(resBlocksAs.success).toBe(true);
        expect(elapsedBlocksAs).toBeLessThan(150);
        const resBlocksAsData = resBlocksAs.data as {
            unsearchableCount: number;
            unsearchableBlocks: Array<{ blockId: string; reason: string }>;
            warnings: string[];
        };
        expect(resBlocksAsData.unsearchableCount).toBeGreaterThan(0);
        expect(resBlocksAsData.unsearchableBlocks.some((u) => u.reason === 'regex_timeout')).toBe(true);
        expect(resBlocksAsData.warnings.length).toBeGreaterThan(0);
        expect(resBlocksAsData.warnings[0]).toContain('50ms');

        const tBlocks2 = performance.now();
        const resBlocksSpaces = await docLib.InvokeTool(
            'search_blocks',
            { query: '\\s*\\w+\\s*$', use_regex: true },
            twentyBlocksSpacesDoc
        );
        const elapsedBlocksSpaces = performance.now() - tBlocks2;
        expect(resBlocksSpaces.success).toBe(true);
        expect(elapsedBlocksSpaces).toBeLessThan(150);

        // Also test grep across 20 lines of 16 KB
        const tGrep = performance.now();
        const resGrep = await docLib.InvokeTool(
            'grep',
            { pattern: '(a|b)+c', use_regex: true },
            twentyBlocksAsDoc
        );
        const elapsedGrep = performance.now() - tGrep;
        expect(resGrep.success).toBe(true);
        expect(elapsedGrep).toBeLessThan(150);
        const resGrepData = resGrep.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            warnings: string[];
        };
        expect(resGrepData.partial).toBe(true);
        expect(resGrepData.timedOut).toBe(true);
        expect(resGrepData.unsearchableCount).toBeGreaterThan(0);
        expect(resGrepData.warnings.length).toBeGreaterThan(0);

        // Also test SpreadsheetToolLibrary search_cells across 20 cells of 16 KB 'a'
        const seed20Cells = await sheetLib.InvokeTool(
            'write_cells',
            {
                cells: Array.from({ length: 20 }, (_, i) => ({
                    address: `A${i + 1}`,
                    value: block16kAs
                }))
            },
            ''
        );
        expect(seed20Cells.success).toBe(true);
        const wb20Json = (seed20Cells.data as { updatedContent: string }).updatedContent;

        const tCells = performance.now();
        const resCells = await sheetLib.InvokeTool(
            'search_cells',
            { query: '(a|b)+c', use_regex: true },
            wb20Json
        );
        const elapsedCells = performance.now() - tCells;
        expect(resCells.success).toBe(true);
        expect(elapsedCells).toBeLessThan(150);
        const resCellsData = resCells.data as {
            unsearchableCount: number;
            unsearchableCells: Array<{ sheet: string; cell: string; reason: string }>;
            warnings: string[];
        };
        expect(resCellsData.unsearchableCount).toBeGreaterThan(0);
        expect(resCellsData.unsearchableCells.some((u) => u.reason === 'regex_timeout')).toBe(true);
        expect(resCellsData.warnings.length).toBeGreaterThan(0);
    });

    it('R7-3: default regex search without use_regex, whole-line node:vm grep across 20x16KB lines, non-silent 105KB grep warnings, and <5KB capped unsearchableCells on 10k cells', async () => {
        // 1. Regex sent without use_regex matches in both search_blocks and search_cells (including >256-char spans)
        const quote400 = `"${'q'.repeat(400)}"`;
        const docWithRegexTargets = `# Invoice Log\n\nOrder INV-2026 shipped.\n\nLong quote: ${quote400}`;
        const defaultBlockRegex = await docLib.InvokeTool('search_blocks', { query: 'INV-\\d{4}' }, docWithRegexTargets);
        expect(defaultBlockRegex.success).toBe(true);
        expect((defaultBlockRegex.data as { matchCount: number }).matchCount).toBe(1);

        const span400BlockRegex = await docLib.InvokeTool('search_blocks', { query: '"[^"]*"' }, docWithRegexTargets);
        expect(span400BlockRegex.success).toBe(true);
        expect((span400BlockRegex.data as { matchCount: number }).matchCount).toBe(1);

        // Explicit use_regex: false treats metacharacters literally
        const explicitLiteralBlock = await docLib.InvokeTool(
            'search_blocks',
            { query: 'INV-\\d{4}', use_regex: false },
            docWithRegexTargets
        );
        expect(explicitLiteralBlock.success).toBe(true);
        expect((explicitLiteralBlock.data as { matchCount: number }).matchCount).toBe(0);

        const seedRegexSheet = await sheetLib.InvokeTool(
            'write_cells',
            {
                cells: [
                    { address: 'A1', value: 'Plain header' },
                    { address: 'B2', value: 'Invoice INV-9042 paid' },
                    { address: 'C3', value: quote400 }
                ]
            },
            ''
        );
        expect(seedRegexSheet.success).toBe(true);
        const regexSheetJson = (seedRegexSheet.data as { updatedContent: string }).updatedContent;

        const defaultCellRegex = await sheetLib.InvokeTool('search_cells', { query: 'INV-\\d{4}' }, regexSheetJson);
        expect(defaultCellRegex.success).toBe(true);
        expect((defaultCellRegex.data as { matches: Array<{ cell: string }> }).matches.map((m) => m.cell)).toEqual(['B2']);

        const span400CellRegex = await sheetLib.InvokeTool('search_cells', { query: '"[^"]*"' }, regexSheetJson);
        expect(span400CellRegex.success).toBe(true);
        expect((span400CellRegex.data as { matches: Array<{ cell: string }> }).matches.map((m) => m.cell)).toEqual(['C3']);

        const explicitLiteralCell = await sheetLib.InvokeTool(
            'search_cells',
            { query: 'INV-\\d{4}', use_regex: false },
            regexSheetJson
        );
        expect(explicitLiteralCell.success).toBe(true);
        expect((explicitLiteralCell.data as { matches: Array<{ cell: string }> }).matches).toHaveLength(0);

        // 2. grep on 20 lines of 16 KB with a match on line 19 (0-based index 18) finds the match via whole-line node:vm
        const line16kFiller = `${'x'.repeat(16_000)} tail`;
        const line19Match = `${'x'.repeat(15_500)} start${'7'.repeat(400)}end`;
        const twenty16kLines = Array.from({ length: 20 }, (_, idx) => (idx === 18 ? line19Match : line16kFiller)).join('\n');

        const grep20Start = performance.now();
        const grep20Res = await docLib.InvokeTool('grep', { pattern: 'start\\d+end' }, twenty16kLines);
        const grep20Elapsed = performance.now() - grep20Start;
        expect(grep20Res.success).toBe(true);
        expect(Array.isArray(grep20Res.data)).toBe(true);
        const grep20Matches = grep20Res.data as Array<{ lineNumber: number; text: string }>;
        expect(grep20Matches).toHaveLength(1);
        expect(grep20Matches[0].lineNumber).toBe(18);
        expect(grep20Elapsed).toBeLessThan(100);

        // 3. grep on a 105 KB line with regex reports partial: true, unsearchableCount: 1, warnings (never silent [])
        const line105kb = `${'z'.repeat(106_000)} INV-7777`;
        const grep105Res = await docLib.InvokeTool('grep', { pattern: 'INV-\\d{4}' }, `Header\n${line105kb}`);
        expect(grep105Res.success).toBe(true);
        const grep105Data = grep105Res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            warnings: string[];
        };
        expect(grep105Data.partial).toBe(true);
        expect(grep105Data.timedOut).toBe(false);
        expect(grep105Data.unsearchableCount).toBe(1);
        expect(grep105Data.warnings.some((w) => w.includes('64 KB'))).toBe(true);

        // 4. search_cells on a 10,000-cell sheet when budget expires caps unsearchableCells <= 25 and keeps JSON < 5 KB
        const slowPrefix = 'a'.repeat(16_384);
        const cells10k: Array<{ address: string; value: string }> = [];
        for (let i = 1; i <= 10_000; i++) {
            cells10k.push({
                address: `A${i}`,
                value: i <= 10 ? slowPrefix : `row-${i}`
            });
        }
        const seed10k = await sheetLib.InvokeTool('write_cells', { cells: cells10k }, '');
        expect(seed10k.success).toBe(true);
        const wb10kJson = (seed10k.data as { updatedContent: string }).updatedContent;

        const search10kRes = await sheetLib.InvokeTool(
            'search_cells',
            { query: '(a|b)+c', use_regex: true },
            wb10kJson
        );
        expect(search10kRes.success).toBe(true);
        const search10kData = search10kRes.data as {
            matches: Array<{ sheet: string; cell: string; value: string }>;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            unsearchableCells: Array<{ sheet: string; cell: string; reason: string }>;
            warnings: string[];
        };
        expect(search10kData.partial).toBe(true);
        expect(search10kData.timedOut).toBe(true);
        expect(search10kData.unsearchableCount).toBeGreaterThan(9_900);
        expect(search10kData.unsearchableCells.length).toBeLessThanOrEqual(25);
        expect(search10kData.warnings.some((w) => w.includes('Showing first 25'))).toBe(true);

        const serializedBytes = Buffer.byteLength(JSON.stringify(search10kRes), 'utf8');
        expect(serializedBytes).toBeLessThan(5_000);
    });
});
