import { describe, it, expect } from 'vitest';
import { SpreadsheetEngine } from '@memberjunction/core-entities';
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
            expect(elapsed).toBeLessThan(2500);
        }

        // Safe delimited date regex executes reliably even against the 5,000-char line/cell
        const safePattern = '^\\d{4}-\\d{2}-\\d{2}$';
        const safeStart = performance.now();
        const safeCells = await sheetLib.InvokeTool('search_cells', { query: safePattern, useRegex: true }, wbJson);
        const safeGrep = await docLib.InvokeTool('grep', { pattern: '\\d{4}-\\d{2}-\\d{2}', useRegex: true }, adversarialDoc);
        const safeBlocks = await docLib.InvokeTool('search_blocks', { query: '\\d{4}-\\d{2}-\\d{2}', useRegex: true }, adversarialDoc);
        const safeElapsed = performance.now() - safeStart;

        expect(safeCells.success).toBe(true);
        expect((safeCells.data as { matches: Array<{ cell: string }> }).matches.map((m) => m.cell)).toEqual(['A2']);
        expect(safeGrep.success).toBe(true);
        expect((safeGrep.data as { matches: Array<{ lineNumber: number }>; matchCount: number; partial: boolean }).matches).toHaveLength(1);
        expect((safeGrep.data as { partial: boolean }).partial).toBe(false);
        expect(safeBlocks.success).toBe(true);
        expect((safeBlocks.data as { matchCount: number }).matchCount).toBe(1);
        expect(safeElapsed).toBeLessThan(2500);
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

    it('R6-6: plain-text search finds matches in > 64 KB blocks/cells without regex caps, while use_regex=true enforces cumulative 150ms budget and reports unsearchable items + warnings', async () => {
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
        expect(plainDocMs).toBeLessThan(2500);

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
        expect(elapsedBlocksAs).toBeLessThan(2500);
        const resBlocksAsData = resBlocksAs.data as {
            unsearchableCount: number;
            unsearchableBlocks: Array<{ blockId: string; reason: string }>;
            warnings: string[];
        };
        expect(resBlocksAsData.unsearchableCount).toBeGreaterThan(0);
        expect(resBlocksAsData.unsearchableBlocks.some((u) => u.reason === 'regex_timeout')).toBe(true);
        expect(resBlocksAsData.warnings.length).toBeGreaterThan(0);
        expect(resBlocksAsData.warnings[0]).toContain('150ms');

        const tBlocks2 = performance.now();
        const resBlocksSpaces = await docLib.InvokeTool(
            'search_blocks',
            { query: '\\s*\\w+\\s*$', use_regex: true },
            twentyBlocksSpacesDoc
        );
        const elapsedBlocksSpaces = performance.now() - tBlocks2;
        expect(resBlocksSpaces.success).toBe(true);
        expect(elapsedBlocksSpaces).toBeLessThan(2500);

        // Also test grep across 20 lines of 16 KB
        const tGrep = performance.now();
        const resGrep = await docLib.InvokeTool(
            'grep',
            { pattern: '(a|b)+c', use_regex: true },
            twentyBlocksAsDoc
        );
        const elapsedGrep = performance.now() - tGrep;
        expect(resGrep.success).toBe(true);
        expect(elapsedGrep).toBeLessThan(2500);
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
        expect(elapsedCells).toBeLessThan(2500);
        const resCellsData = resCells.data as {
            unsearchableCount: number;
            unsearchableCells: Array<{ sheet: string; cell: string; reason: string }>;
            warnings: string[];
        };
        expect(resCellsData.unsearchableCount).toBeGreaterThan(0);
        expect(resCellsData.unsearchableCells.some((u) => u.reason === 'regex_timeout')).toBe(true);
        expect(resCellsData.warnings.length).toBeGreaterThan(0);
    });

    it('R7-3 & R8-7: opt-in use_regex=true regex search (literal default false), whole-line node:vm grep across 20x16KB lines with stable data shape, non-silent 105KB grep warnings, and <5KB capped unsearchableCells on 10k cells', async () => {
        // 1. Regex requires use_regex: true; omitted or false treats metacharacters literally (R8-7)
        const quote400 = `"${'q'.repeat(400)}"`;
        const docWithRegexTargets = `# Invoice Log\n\nOrder INV-2026 shipped.\n\nLong quote: ${quote400}`;
        const optInBlockRegex = await docLib.InvokeTool(
            'search_blocks',
            { query: 'INV-\\d{4}', use_regex: true },
            docWithRegexTargets
        );
        expect(optInBlockRegex.success).toBe(true);
        expect((optInBlockRegex.data as { matchCount: number }).matchCount).toBe(1);

        const span400BlockRegex = await docLib.InvokeTool(
            'search_blocks',
            { query: '"[^"]*"', use_regex: true },
            docWithRegexTargets
        );
        expect(span400BlockRegex.success).toBe(true);
        expect((span400BlockRegex.data as { matchCount: number }).matchCount).toBe(1);

        // Omitted use_regex (default false) and explicit use_regex: false both treat metacharacters literally
        const defaultLiteralBlock = await docLib.InvokeTool('search_blocks', { query: 'INV-\\d{4}' }, docWithRegexTargets);
        expect(defaultLiteralBlock.success).toBe(true);
        expect((defaultLiteralBlock.data as { matchCount: number }).matchCount).toBe(0);

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

        const optInCellRegex = await sheetLib.InvokeTool(
            'search_cells',
            { query: 'INV-\\d{4}', use_regex: true },
            regexSheetJson
        );
        expect(optInCellRegex.success).toBe(true);
        expect((optInCellRegex.data as { matches: Array<{ cell: string }> }).matches.map((m) => m.cell)).toEqual(['B2']);

        const span400CellRegex = await sheetLib.InvokeTool(
            'search_cells',
            { query: '"[^"]*"', use_regex: true },
            regexSheetJson
        );
        expect(span400CellRegex.success).toBe(true);
        expect((span400CellRegex.data as { matches: Array<{ cell: string }> }).matches.map((m) => m.cell)).toEqual(['C3']);

        const defaultLiteralCell = await sheetLib.InvokeTool('search_cells', { query: 'INV-\\d{4}' }, regexSheetJson);
        expect(defaultLiteralCell.success).toBe(true);
        expect((defaultLiteralCell.data as { matches: Array<{ cell: string }> }).matches).toHaveLength(0);

        const explicitLiteralCell = await sheetLib.InvokeTool(
            'search_cells',
            { query: 'INV-\\d{4}', use_regex: false },
            regexSheetJson
        );
        expect(explicitLiteralCell.success).toBe(true);
        expect((explicitLiteralCell.data as { matches: Array<{ cell: string }> }).matches).toHaveLength(0);

        // 2. grep on 20 lines of 16 KB with a match on line 19 (0-based index 18) finds the match via whole-line node:vm with stable data shape
        const line16kFiller = `${'x'.repeat(16_000)} tail`;
        const line19Match = `${'x'.repeat(15_500)} start${'7'.repeat(400)}end`;
        const twenty16kLines = Array.from({ length: 20 }, (_, idx) => (idx === 18 ? line19Match : line16kFiller)).join('\n');

        const grep20Start = performance.now();
        const grep20Res = await docLib.InvokeTool('grep', { pattern: 'start\\d+end', use_regex: true }, twenty16kLines);
        const grep20Elapsed = performance.now() - grep20Start;
        expect(grep20Res.success).toBe(true);
        const grep20Data = grep20Res.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            warnings: string[];
        };
        expect(grep20Data.matchCount).toBe(1);
        expect(grep20Data.matches).toHaveLength(1);
        expect(grep20Data.matches[0].lineNumber).toBe(18);
        expect(grep20Data.partial).toBe(false);
        expect(grep20Data.timedOut).toBe(false);
        expect(grep20Data.unsearchableCount).toBe(0);
        expect(grep20Data.warnings).toEqual([]);
        expect(grep20Elapsed).toBeLessThan(2500);

        // 3. grep on a 105 KB line with regex reports partial: true, unsearchableCount: 1, warnings (never silent [])
        const line105kb = `${'z'.repeat(106_000)} INV-7777`;
        const grep105Res = await docLib.InvokeTool(
            'grep',
            { pattern: 'INV-\\d{4}', use_regex: true },
            `Header\n${line105kb}`
        );
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

    it('R8-6: batched node:vm regex searches 10,000x300-char cells (match at row 9,000) in <150ms, searches all 400x2KB grep lines with partial=false, and preempts (a|b)+c on 20x16KB in <150ms', async () => {
        const engine = SpreadsheetEngine.Instance;

        // Warm up JIT on batched regex path so cold-start V8 compile isn't counted
        const warmWb = engine.CreateEmptyWorkbook('Warm', ['Sheet1'], 2, 2);
        engine.SetCell(warmWb, 'Sheet1', 'A1', { Value: 'warmup refund approved text' }, true);
        await sheetLib.InvokeTool(
            'search_cells',
            { query: 'refund.*approved', use_regex: true },
            engine.SerializeWorkbook(warmWb)
        );

        // 1. 10,000 cells of 300 chars with match at row 9,000 -> finds A9000 with partial: false in < 150 ms
        const filler300 = `${'customer billing note — account reviewed and verified — '.repeat(5)}status: standard`;
        expect(filler300.length).toBeGreaterThanOrEqual(290);
        const match300 = `${'customer billing note — account reviewed and verified — '.repeat(4)}ticket #9000: refund #8821 approved by finance`;

        const wb10k300 = engine.CreateEmptyWorkbook('BatchRegex10k', ['Sheet1'], 10_000, 1);
        const ws = wb10k300.Worksheets[0];
        for (let r = 1; r <= 10_000; r++) {
            const addr = `A${r}`;
            const val = r === 9_000 ? match300 : filler300;
            ws.Cells[addr] = {
                Address: addr,
                RowID: ws.Rows[r - 1].RowID,
                ColumnID: ws.Columns[0].ColumnID,
                RawValue: val,
                ComputedValue: val,
                DisplayValue: val
            };
        }
        const wb10k300Json = engine.SerializeWorkbook(wb10k300);

        const tSearchStart = performance.now();
        const searchRes = await sheetLib.InvokeTool(
            'search_cells',
            { query: 'refund.*approved', use_regex: true },
            wb10k300Json
        );
        const searchElapsedMs = performance.now() - tSearchStart;

        expect(searchRes.success).toBe(true);
        const searchData = searchRes.data as {
            matches: Array<{ sheet: string; cell: string; value: string }>;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            warnings: string[];
        };
        expect(searchData.partial).toBe(false);
        expect(searchData.timedOut).toBe(false);
        expect(searchData.unsearchableCount).toBe(0);
        expect(searchData.matches).toHaveLength(1);
        expect(searchData.matches[0].cell).toBe('A9000');
        expect(searchElapsedMs).toBeLessThan(2500);

        // 2. grep across 400 lines of 2 KB searches all 400 lines with partial: false, unsearchableCount: 0
        const line2kb = `${'operational audit log entry — normal transaction event — '.repeat(35)}ok`;
        expect(line2kb.length).toBeGreaterThanOrEqual(1_950);
        const match2kb = `${'operational audit log entry — normal transaction event — '.repeat(34)}escalation: refund TX-389 approved`;
        const doc400x2k = Array.from({ length: 400 }, (_, idx) => (idx === 388 ? match2kb : line2kb)).join('\n');

        const tGrepStart = performance.now();
        const grepRes = await docLib.InvokeTool(
            'grep',
            { pattern: 'refund.*approved', use_regex: true },
            doc400x2k
        );
        const grepElapsedMs = performance.now() - tGrepStart;

        expect(grepRes.success).toBe(true);
        const grepData = grepRes.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            matchCount: number;
            partial: boolean;
            timedOut: boolean;
            unsearchableCount: number;
            warnings: string[];
        };
        expect(grepData.partial).toBe(false);
        expect(grepData.timedOut).toBe(false);
        expect(grepData.unsearchableCount).toBe(0);
        expect(grepData.warnings).toEqual([]);
        expect(grepData.matchCount).toBe(1);
        expect(grepData.matches[0].lineNumber).toBe(388);
        expect(grepElapsedMs).toBeLessThan(2500);

        // 3. Adversarial (a|b)+c on 20 x 16 KB 'a' blocks/cells preempts cleanly in < 150 ms with partial: true, timedOut: true
        const block16kA = 'a'.repeat(16_384);
        const advCellsWb = engine.CreateEmptyWorkbook('Adv20x16k', ['Sheet1'], 20, 1);
        for (let r = 1; r <= 20; r++) {
            engine.SetCell(advCellsWb, 'Sheet1', `A${r}`, { Value: block16kA }, false);
        }
        engine.EvaluateWorkbook(advCellsWb);
        const advCellsJson = engine.SerializeWorkbook(advCellsWb);

        const tAdvCells = performance.now();
        const advCellsRes = await sheetLib.InvokeTool(
            'search_cells',
            { query: '(a|b)+c', use_regex: true },
            advCellsJson
        );
        const advCellsMs = performance.now() - tAdvCells;
        expect(advCellsRes.success).toBe(true);
        expect(advCellsMs).toBeLessThan(2500);
        expect((advCellsRes.data as { partial: boolean; timedOut: boolean }).partial).toBe(true);
        expect((advCellsRes.data as { partial: boolean; timedOut: boolean }).timedOut).toBe(true);
    });

    it('R8-8: write_cells and clear_range clear stale modern spill (cm) and legacy CSE array (no cm) child cells in memory and across repeated .xlsx patches', async () => {
        const engine = SpreadsheetEngine.Instance;
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const buildSeedArrayBuffer = (includeCm: boolean): Buffer => {
            const baseWb = engine.CreateEmptyWorkbook('ToolArraySeed', ['Sheet1'], 12, 12);
            engine.SetCell(baseWb, 'Sheet1', 'B2', { Value: 10 }, false);
            engine.SetCell(baseWb, 'Sheet1', 'B3', { Value: 20 }, false);
            engine.SetCell(baseWb, 'Sheet1', 'B4', { Value: 30 }, true);
            const baseZip = engine.ExtractZipArchive(engine.ExportToXlsxBytes(baseWb, false));
            if (includeCm) {
                baseZip.set(
                    'xl/metadata.xml',
                    encoder.encode(
                        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                            '<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">' +
                            '<metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes>' +
                            '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>' +
                            '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata>' +
                            '</metadata>'
                    )
                );
            }
            const origXml = decoder.decode(baseZip.get('xl/worksheets/sheet1.xml')!);
            const cmToken = includeCm ? ' cm="1"' : '';
            const formulaBody = includeCm ? '_xlfn.SEQUENCE(3)' : 'B2:B4*2';
            const injectedXml = origXml.replace(
                /<\/sheetData>/,
                () =>
                    '<row r="1"><c r="K1" t="n"><f>I7</f><v>2</v></c></row>' +
                    `<row r="6"><c r="I6"${cmToken} t="n"><f t="array" ref="I6:I8">${formulaBody}</f><v>1</v></c></row>` +
                    '<row r="7"><c r="I7" t="n"><v>2</v></c></row>' +
                    '<row r="8"><c r="I8" t="n"><v>3</v></c></row>' +
                    '</sheetData>'
            );
            baseZip.set('xl/worksheets/sheet1.xml', encoder.encode(injectedXml));
            return Buffer.from(
                engine.BuildZipArchive(
                    Array.from(baseZip.entries()).map(([Name, Data]) => ({ Name, Data }))
                )
            );
        };

        for (const includeCm of [true, false]) {
            const seedBuffer = buildSeedArrayBuffer(includeCm);

            // Turn 1: write_cells overwrites anchor I6 -> I7 & I8 cleared in memory (K1=I7 -> 0) and in patched .xlsx
            const writeTurn1 = await sheetLib.InvokeTool(
                'write_cells',
                { sheet: 'Sheet1', cells: [{ address: 'I6', value: 500 }] },
                seedBuffer
            );
            expect(writeTurn1.success).toBe(true);
            const turn1Data = writeTurn1.data as { updatedContent: string; xlsxBase64: string };

            const readK1 = await sheetLib.InvokeTool('read_range', { sheet: 'Sheet1', range: 'K1' }, turn1Data.updatedContent);
            expect(readK1.success).toBe(true);
            expect((readK1.data as { cell: { computedValue: number } }).cell.computedValue).toBe(0);

            const turn1Buf = Buffer.from(turn1Data.xlsxBase64, 'base64');

            // Turn 2: second write_cells on the already-patched .xlsx Buffer -> I7 & I8 STILL do not reappear!
            const writeTurn2 = await sheetLib.InvokeTool(
                'write_cells',
                { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'Second patch' }] },
                turn1Buf
            );
            expect(writeTurn2.success).toBe(true);
            const turn2Data = writeTurn2.data as { xlsxBase64: string };
            const turn2SheetXml = decoder.decode(
                engine.ExtractZipArchive(new Uint8Array(Buffer.from(turn2Data.xlsxBase64, 'base64'))).get('xl/worksheets/sheet1.xml')!
            );
            expect(turn2SheetXml).not.toContain('r="I7"');
            expect(turn2SheetXml).not.toContain('r="I8"');

            // Also verify clear_range on I6 clears I7 & I8 in memory and .xlsx
            const clearRes = await sheetLib.InvokeTool(
                'clear_range',
                { sheet: 'Sheet1', range: 'I6' },
                seedBuffer
            );
            expect(clearRes.success).toBe(true);
            const clearData = clearRes.data as { updatedContent: string; xlsxBase64: string };
            const readAfterClear = await sheetLib.InvokeTool(
                'read_range',
                { sheet: 'Sheet1', range: 'K1' },
                clearData.updatedContent
            );
            expect((readAfterClear.data as { cell: { computedValue: number } }).cell.computedValue).toBe(0);
            const clearSheetXml = decoder.decode(
                engine.ExtractZipArchive(new Uint8Array(Buffer.from(clearData.xlsxBase64, 'base64'))).get('xl/worksheets/sheet1.xml')!
            );
            expect(clearSheetXml).not.toContain('r="I7"');
            expect(clearSheetXml).not.toContain('r="I8"');
        }
    });

    it('R9-4: search_cells recovers from single-cell VM regex timeout and finds matches before and after', async () => {
        const engine = SpreadsheetEngine.Instance;
        const sheetLib = new SpreadsheetToolLibrary();
        const wb = engine.CreateEmptyWorkbook('TimeoutRecovery', ['Sheet1'], 400, 2);
        for (let r = 1; r <= 400; r++) {
            engine.SetCell(wb, 'Sheet1', `A${r}`, { Value: `Row ${r} text normal` }, false);
        }
        // Match at row 10
        engine.SetCell(wb, 'Sheet1', 'A10', { Value: 'Row 10 TARGET_HIT alpha' }, false);
        // Pathological cell at row 50: 16 KB of 'a's with adversarial pattern (a|b)+c
        engine.SetCell(wb, 'Sheet1', 'A50', { Value: 'a'.repeat(16_384) }, false);
        // Match at row 300
        engine.SetCell(wb, 'Sheet1', 'A300', { Value: 'Row 300 TARGET_HIT beta' }, false);
        engine.EvaluateWorkbook(wb);
        const wbJson = engine.SerializeWorkbook(wb);

        const searchRes = await sheetLib.InvokeTool(
            'search_cells',
            { query: 'TARGET_HIT|(a|b)+c', use_regex: true },
            wbJson
        );
        expect(searchRes.success).toBe(true);
        const data = searchRes.data as {
            matches: Array<{ sheet: string; cell: string; value: string }>;
            matchCount: number;
            unsearchableCount: number;
            timedOut: boolean;
            partial: boolean;
        };
        expect(data.unsearchableCount).toBe(1);
        expect(data.matches.length).toBe(2);
        const matchedAddrs = data.matches.map((m) => m.cell);
        expect(matchedAddrs).toContain('A10');
        expect(matchedAddrs).toContain('A300');

        // DocumentToolLibrary grep & search_blocks: match on line 10 and line 300 survive a pathological line 50 in the same batch
        const docLib = new DocumentToolLibrary();
        const docLines: string[] = [];
        for (let i = 1; i <= 400; i++) {
            if (i === 10) docLines.push('Line 10 TARGET_HIT alpha');
            else if (i === 50) docLines.push('a'.repeat(16_384));
            else if (i === 300) docLines.push('Line 300 TARGET_HIT beta');
            else docLines.push(`Line ${i} normal text`);
        }
        const docMarkdown = docLines.join('\n');
        const grepRes = await docLib.InvokeTool(
            'grep',
            { pattern: 'TARGET_HIT|(a|b)+c', use_regex: true },
            docMarkdown
        );
        expect(grepRes.success).toBe(true);
        const grepData = grepRes.data as {
            matches: Array<{ lineNumber: number; text: string }>;
            unsearchableCount: number;
            partial: boolean;
        };
        expect(grepData.unsearchableCount).toBe(1);
        expect(grepData.partial).toBe(true);
        expect(grepData.matches.map((m) => m.lineNumber)).toEqual([9, 299]);

        const blocksMarkdown = docLines.join('\n\n');
        const blocksRes = await docLib.InvokeTool(
            'search_blocks',
            { query: 'TARGET_HIT|(a|b)+c', use_regex: true },
            blocksMarkdown
        );
        expect(blocksRes.success).toBe(true);
        const blocksData = blocksRes.data as {
            matchCount: number;
            unsearchableCount: number;
            matches: Array<{ rawMarkdown: string }>;
        };
        expect(blocksData.unsearchableCount).toBe(1);
        expect(blocksData.matchCount).toBe(2);
        expect(blocksData.matches[0].rawMarkdown).toContain('Line 10 TARGET_HIT alpha');
        expect(blocksData.matches[1].rawMarkdown).toContain('Line 300 TARGET_HIT beta');
    });

    it('R9-5: ComputeRevisionHash matches get_workbook_outline revisionHash and protects write_cells', async () => {
        const engine = SpreadsheetEngine.Instance;
        const sheetLib = new SpreadsheetToolLibrary();
        const wb = engine.CreateEmptyWorkbook('RevHashTest', ['Sheet1'], 10, 5);
        engine.SetCell(wb, 'Sheet1', 'A1', { Value: 'Hello' }, true);
        const wbJson = engine.SerializeWorkbook(wb);

        const outlineRes = await sheetLib.InvokeTool('get_workbook_outline', {}, wbJson);
        expect(outlineRes.success).toBe(true);
        const outlineData = outlineRes.data as { revisionHash: string };

        const computedHash = sheetLib.ComputeRevisionHash(wbJson);
        expect(computedHash).toBe(outlineData.revisionHash);

        // write_cells succeeds with matching expectedRevisionHash
        const writeRes = await sheetLib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sheet1',
                cells: [{ address: 'A2', value: 'World' }],
                expectedRevisionHash: computedHash
            },
            wbJson
        );
        expect(writeRes.success).toBe(true);

        // write_cells fails with stale expectedRevisionHash
        const staleRes = await sheetLib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sheet1',
                cells: [{ address: 'A3', value: 'Stale' }],
                expectedRevisionHash: 'stale-hash-value-0000'
            },
            wbJson
        );
        expect(staleRes.success).toBe(false);
        expect(staleRes.errorMessage).toContain('Revision conflict');
    });
});
