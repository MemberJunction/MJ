import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '../custom/ArtifactPermissionDelegate';
import {
    DocumentBlockExecutionResult,
    DocumentBlockSpec,
    DocumentLiveBlockEngine
} from '../custom/DocumentLiveBlockEngine';
import {
    CompileSafeUserRegex,
    IsSafeUserRegex,
    MAX_AST_DEPTH,
    MAX_FORMULA_LENGTH,
    SanitizeWorksheetName,
    SpreadsheetCellEditContext,
    SpreadsheetEngine,
    SpreadsheetLiveTableSpec,
    WorkbookSpec
} from '../custom/SpreadsheetEngine';

function makeUser(id: string, name: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@example.org`;
    u.IsActive = true;
    return u;
}

describe('Spreadsheet & Slide Wave 2A Track B Fixes + NW-4 Modeling & Native OOXML', () => {
    const engine = SpreadsheetEngine.Instance;

    beforeEach(() => {
        DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // P0-7: RLS/FLS Leakage Prevention
    // -----------------------------------------------------------------------

    it('P0-7: cloneWorkbookWithoutViewerScopedData purges >256-cell range dependents (=SUM(A:A), =VLOOKUP, =COUNTIF, =MJ.AI) and deletes AiInputHash', () => {
        const wb = engine.CreateEmptyWorkbook('RLS >256 Strip', ['Data'], 420, 6);
        const sheet = wb.Worksheets[0];

        // Seed a LiveTable in column A (rows 1..300) and viewer values in column B rows 1..300
        sheet.LiveTables.push({
            TableID: 'tbl-salary',
            Title: 'Salaries',
            SourceType: 'SavedQuery',
            Mode: 'Live',
            AnchorCell: 'A1',
            IncludeHeaders: true,
            QueryID: 'q-salary',
            QueryName: 'Salaries',
            LastRowCount: 300,
            LastColumnCount: 2
        });

        for (let r = 1; r <= 300; r++) {
            const nameVal = r === 1 ? 'Employee' : r === 260 ? 'Alice' : `Emp${r}`;
            const salVal = r === 1 ? 'Salary' : r === 260 ? 250000 : 1000;
            engine.SetCell(wb, sheet.SheetID, `A${r}`, { Value: nameVal, LiveTableID: 'tbl-salary' }, false);
            engine.SetCell(wb, sheet.SheetID, `B${r}`, { Value: salVal, LiveTableID: 'tbl-salary' }, false);
        }

        // Dependent formulas spanning >256 cells (triggers rangeWatchersBySheet instead of cell-by-cell enumeration)
        engine.SetCell(wb, sheet.SheetID, 'D1', { Formula: '=SUM(B:B)' }, false);
        engine.SetCell(wb, sheet.SheetID, 'D2', { Formula: '=VLOOKUP("Alice", A1:B300, 2, FALSE)' }, false);
        engine.SetCell(wb, sheet.SheetID, 'D3', { Formula: '=COUNTIF(B1:B400, ">0")' }, false);
        engine.SetCell(wb, sheet.SheetID, 'D4', { Formula: '=MJ.AI("Summarize compensation", A1:B300)' }, false);
        sheet.Cells['D4'].ComputedValue = 'Sensitive compensation summary';
        sheet.Cells['D4'].RawValue = 'Sensitive compensation summary';
        sheet.Cells['D4'].DisplayValue = 'Sensitive compensation summary';
        sheet.Cells['D4'].AiInputHash = 'hash-sensitive-123';

        engine.EvaluateWorkbook(wb);
        expect(sheet.Cells['D1'].ComputedValue).toBe(250000 + 298 * 1000);
        expect(sheet.Cells['D2'].ComputedValue).toBe(250000);
        expect(sheet.Cells['D3'].ComputedValue).toBe(299);

        // SerializeWorkbook strips viewer-scoped data via cloneWorkbookWithoutViewerScopedData
        const serialized = engine.SerializeWorkbook(wb);
        const rawParsed: WorkbookSpec = JSON.parse(serialized);
        const rawSheet = rawParsed.Worksheets[0];

        expect(rawSheet.Cells['A260']).toBeUndefined();
        expect(rawSheet.Cells['B260']).toBeUndefined();
        expect(rawSheet.Cells['D1'].ComputedValue).toBeNull();
        expect(rawSheet.Cells['D1'].RawValue).toBeNull();
        expect(rawSheet.Cells['D2'].ComputedValue).toBeNull();
        expect(rawSheet.Cells['D3'].ComputedValue).toBeNull();
        expect(rawSheet.Cells['D4'].ComputedValue).toBeNull();
        expect(rawSheet.Cells['D4'].AiInputHash).toBeUndefined();

        // ParseWorkbook re-evaluates formulas against empty stripped B:B (zero leakage of 250000!)
        const reparsed = engine.ParseWorkbook(serialized);
        expect(reparsed.Worksheets[0].Cells['D1'].ComputedValue).toBe(0);
        expect(reparsed.Worksheets[0].Cells['D2'].ComputedValue).toBe('#N/A');
        expect(reparsed.Worksheets[0].Cells['D3'].ComputedValue).toBe(0);
    });

    it('P0-7: FreezeLiveTable stamps LiveTableID & LastColumnCount, and UnfreezeLiveTable purges full B..Z footprint', () => {
        const wb = engine.CreateEmptyWorkbook('Freeze Unfreeze Footprint', ['Sheet1'], 20, 10);
        const sheet = wb.Worksheets[0];
        const tableSpec: SpreadsheetLiveTableSpec = {
            TableID: 'tbl-wide',
            Title: 'Wide Query',
            SourceType: 'SavedQuery',
            Mode: 'Live',
            AnchorCell: 'B2',
            IncludeHeaders: true,
            QueryID: 'q-wide',
            QueryName: 'Wide Query'
        };
        sheet.LiveTables.push(tableSpec);

        const execResult: DocumentBlockExecutionResult = {
            BlockID: 'tbl-wide',
            Kind: 'SavedQuery',
            Mode: 'Live',
            Success: true,
            Columns: [
                { Name: 'ColA', DisplayName: 'ColA', Type: 'string' },
                { Name: 'ColB', DisplayName: 'ColB', Type: 'number' },
                { Name: 'ColC', DisplayName: 'ColC', Type: 'number' },
                { Name: 'ColD', DisplayName: 'ColD', Type: 'string' }
            ],
            Rows: [
                { ColA: 'R1', ColB: 10, ColC: 20, ColD: 'Secret-1' },
                { ColA: 'R2', ColB: 30, ColC: 40, ColD: 'Secret-2' }
            ],
            TotalRowCount: 2
        };

        const frozen = engine.FreezeLiveTable(
            wb,
            sheet.SheetID,
            'tbl-wide',
            execResult,
            { ID: 'user-owner', Name: 'Owner' },
            true
        );
        expect(frozen.Mode).toBe('Frozen');
        expect(frozen.LastRowCount).toBe(2);
        expect(frozen.LastColumnCount).toBe(4);
        // Header B2..E2 and rows B3..E4 must all carry LiveTableID === 'tbl-wide'
        for (const addr of ['B2', 'C2', 'D2', 'E2', 'B3', 'C3', 'D3', 'E3', 'B4', 'C4', 'D4', 'E4']) {
            expect(sheet.Cells[addr]?.LiveTableID).toBe('tbl-wide');
        }
        expect(sheet.Cells['E4']?.ComputedValue).toBe('Secret-2');

        // Put a dependent formula referencing E4
        engine.SetCell(wb, sheet.SheetID, 'G4', { Formula: '=E4' });
        expect(sheet.Cells['G4'].ComputedValue).toBe('Secret-2');

        // Unfreeze must purge ALL columns B..E across rows 2..4 (no leaked columns!)
        const unfrozen = engine.UnfreezeLiveTable(wb, sheet.SheetID, 'tbl-wide');
        expect(unfrozen.Mode).toBe('Live');
        expect(unfrozen.LastRowCount).toBe(0);
        expect(unfrozen.LastColumnCount).toBe(0);
        for (const addr of ['B2', 'C2', 'D2', 'E2', 'B3', 'C3', 'D3', 'E3', 'B4', 'C4', 'D4', 'E4']) {
            expect(sheet.Cells[addr]).toBeUndefined();
        }
        expect(sheet.Cells['G4'].ComputedValue).toBe(0);
    });

    // -----------------------------------------------------------------------
    // P0-11: Prototype Pollution, Parser/AST Depth DoS, & ReDoS Obfuscation
    // -----------------------------------------------------------------------

    it('P0-11: blocks __proto__/constructor/prototype cell addresses in ImportFromXlsxBytes without polluting Object.prototype', () => {
        const maliciousZip = engine.BuildZipArchive([
            {
                Name: '[Content_Types].xml',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
                )
            },
            {
                Name: 'xl/workbook.xml',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
                )
            },
            {
                Name: 'xl/_rels/workbook.xml.rels',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
                )
            },
            {
                Name: 'xl/worksheets/sheet1.xml',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>42</v></c><c r="__proto__"><v>99</v></c><c r="constructor"><v>88</v></c><c r="prototype"><v>77</v></c></row></sheetData></worksheet>'
                )
            }
        ]);

        const imported = engine.ImportFromXlsxBytes(maliciousZip);
        const ws = imported.Worksheets[0];
        expect(ws.Cells['A1']?.ComputedValue).toBe(42);
        expect(Object.hasOwn(ws.Cells, '__proto__')).toBe(false);
        expect(Object.hasOwn(ws.Cells, 'constructor')).toBe(false);
        expect(Object.hasOwn(ws.Cells, 'prototype')).toBe(false);
        expect(Object.hasOwn(Object.prototype, 'ComputedValue')).toBe(false);
    });

    it('P0-11: enforces MAX_FORMULA_LENGTH and MAX_AST_DEPTH without throwing RangeError on 1,500 nested parens', () => {
        const wb = engine.CreateEmptyWorkbook('DoS Guard');
        const ws = wb.Worksheets[0];

        expect(MAX_FORMULA_LENGTH).toBe(8192);
        expect(MAX_AST_DEPTH).toBe(128);

        const overlong = '=' + '1+'.repeat(4200) + '1';
        expect(overlong.length).toBeGreaterThan(MAX_FORMULA_LENGTH);
        engine.SetCell(wb, ws.SheetID, 'A1', { Formula: overlong });
        expect(ws.Cells['A1'].ComputedValue).toBe('#VALUE!');

        const deepParens = '=' + '('.repeat(1500) + '7' + ')'.repeat(1500);
        expect(() => engine.SetCell(wb, ws.SheetID, 'A2', { Formula: deepParens })).not.toThrow();
        expect(['#VALUE!', '#CALC!']).toContain(ws.Cells['A2'].ComputedValue);
    });

    it('P0-11: IsSafeUserRegex decodes \\xNN, \\uNNNN, and \\u{...} inside and outside character classes to stop obfuscated ReDoS', () => {
        expect(IsSafeUserRegex('(\\x61+)+')).toBe(false);
        expect(IsSafeUserRegex('([\\u0061-\\u007a]+)+')).toBe(false);
        expect(IsSafeUserRegex('(\\u{61}+)*')).toBe(false);
        expect(CompileSafeUserRegex('([\\x61]+)+')).toBeNull();
        expect(IsSafeUserRegex('^[A-Za-z0-9_-]{1,32}$')).toBe(true);
    });

    // -----------------------------------------------------------------------
    // P0-12 / P0-21 / P1-4 / P1-6 / P2-3
    // -----------------------------------------------------------------------

    it('P0-21 / P1-6 / P1-4: SanitizeWorksheetName strips bad chars, ExportToXlsxBytes deduplicates 31-char names, and SerializeWorkbook preserves timestamps', () => {
        expect(SanitizeWorksheetName('Q4: [Revenue] / North*')).toBe('Q4   Revenue    North');
        expect(SanitizeWorksheetName('///').length).toBeGreaterThan(0);

        const wb = engine.CreateEmptyWorkbook('Sheet Names & Timestamps', [
            'Revenue_Summary_Department_Region_North',
            'Revenue_Summary_Department_Region_South'
        ]);
        wb.CreatedAt = '2025-01-01T00:00:00.000Z';
        wb.UpdatedAt = '2025-01-02T00:00:00.000Z';

        const snap1 = engine.SerializeWorkbook(wb, { preserveTimestamps: true });
        const snap2 = engine.SerializeWorkbook(wb, { preserveTimestamps: true });
        expect(snap1).toBe(snap2);
        expect(JSON.parse(snap1).UpdatedAt).toBe('2025-01-02T00:00:00.000Z');

        const xlsxBytes = engine.ExportToXlsxBytes(wb);
        const entries = engine.ExtractZipArchive(xlsxBytes);
        const workbookXml = new TextDecoder().decode(entries.get('xl/workbook.xml')!);
        const names = Array.from(workbookXml.matchAll(/name="([^"]+)"/g)).map((m) => m[1]);
        const userSheetNames = names.filter((n) => n !== '_mj_sheets_meta');
        expect(userSheetNames.length).toBe(2);
        expect(new Set(userSheetNames).size).toBe(2);
        for (const n of userSheetNames) {
            expect(n.length).toBeLessThanOrEqual(31);
        }
    });

    it('P0-12: enforces protected-range write locks across AddProtectedRange, InsertRows, DeleteRows, SortWorksheet, and EvaluateAiFormulas', async () => {
        const ownerCtx: SpreadsheetCellEditContext = { UserID: 'owner-1', IsEditor: true };
        const editorCtx: SpreadsheetCellEditContext = { UserID: 'editor-2', IsEditor: true };

        const wb = engine.CreateEmptyWorkbook('Protected Locks');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Value: 'Name' }, false);
        engine.SetCell(wb, ws.SheetID, 'B1', { Value: 'Score' }, false);
        engine.SetCell(wb, ws.SheetID, 'A2', { Value: 'Bob' }, false);
        engine.SetCell(wb, ws.SheetID, 'B2', { Value: 10 }, false);
        engine.SetCell(wb, ws.SheetID, 'A3', { Value: 'Alice' }, false);
        engine.SetCell(wb, ws.SheetID, 'B3', { Value: 20 }, false);
        engine.SetCell(wb, ws.SheetID, 'C3', { Formula: '=MJ.AI("Rate", B3)' }, false);

        engine.AddProtectedRange(
            wb,
            ws.SheetID,
            {
                RangeID: 'prot-row3',
                Range: 'A3:C3',
                LockedByUserID: 'owner-1',
                AllowEditors: false,
                Description: 'Locked executive row'
            },
            ownerCtx
        );

        // Non-owner cannot overwrite existing protected range rule
        expect(() =>
            engine.AddProtectedRange(
                wb,
                ws.SheetID,
                {
                    RangeID: 'prot-row3',
                    Range: 'A3:C3',
                    LockedByUserID: 'editor-2',
                    AllowEditors: true
                },
                editorCtx
            )
        ).toThrow();

        // Non-owner cannot insert rows at row 3 or above (shifts protected range), delete row 3, or sort worksheet
        expect(() => engine.InsertRows(wb, ws.SheetID, 3, 1, editorCtx)).toThrow();
        expect(() => engine.DeleteRows(wb, ws.SheetID, 3, 1, editorCtx)).toThrow();
        // Verify protected range was NOT deleted!
        expect(ws.ProtectedRanges.some((r) => r.RangeID === 'prot-row3')).toBe(true);
        expect(() => engine.SortWorksheet(wb, ws.SheetID, { ColumnLetter: 'A', Direction: 'asc' }, editorCtx)).toThrow();

        // Non-owner cannot mutate protected =MJ.AI cell via EvaluateAiFormulas
        await expect(
            engine.EvaluateAiFormulas(wb, makeUser('editor-2', 'Editor'), undefined, {
                EditContext: editorCtx,
                AiEvaluator: async (cells) =>
                    cells.map((c) => ({
                        SheetID: c.SheetID,
                        Address: c.Address,
                        InputHash: c.InputHash,
                        Value: 'Good'
                    }))
            })
        ).rejects.toThrow(/protected/i);
    });

    it('P1-6 / P0-7: ImportFromCsv neutralizes formulas by default, ExportToCsv neutralizes =+-@\\t\\r & strips viewer-scoped live values', () => {
        const csvInput = '=1+1,+cmd,Normal\n-2+3,@SUM(A1),"\t=HYPERLINK()"';
        const safeImported = engine.ImportFromCsv(csvInput, 'CSV');
        const safeSheet = safeImported.Worksheets[0];
        expect(safeSheet.Cells['A1'].Formula).toBeNull();
        expect(safeSheet.Cells['A1'].ComputedValue).toBe('=1+1');

        const allowedFormulaWb = engine.ImportFromCsv('=1+1,20', 'CSV', 'FormulaCSV', { AllowFormulas: true });
        expect(allowedFormulaWb.Worksheets[0].Cells['A1'].Formula).toBe('=1+1');
        expect(allowedFormulaWb.Worksheets[0].Cells['A1'].ComputedValue).toBe(2);

        // Add a live table value and formula-injection strings before ExportToCsv
        const wb = engine.CreateEmptyWorkbook('CSV Export Security');
        const ws = wb.Worksheets[0];
        ws.LiveTables.push({
            TableID: 'tbl-sec',
            Title: 'Users',
            SourceType: 'EntityView',
            Mode: 'Live',
            AnchorCell: 'B2',
            IncludeHeaders: false,
            EntityName: 'MJ: Users'
        });
        engine.SetCell(wb, ws.SheetID, 'A1', { Value: '=CMD|"/C calc"!A0', Literal: true }, false);
        engine.SetCell(wb, ws.SheetID, 'B1', { Value: '+SUM(1,2)' }, false);
        engine.SetCell(wb, ws.SheetID, 'C1', { Value: '-2+3' }, false);
        engine.SetCell(wb, ws.SheetID, 'D1', { Value: '@IMPORTXML()' }, false);
        engine.SetCell(wb, ws.SheetID, 'A2', { Value: 'Public' }, false);
        engine.SetCell(wb, ws.SheetID, 'B2', { Value: 'ViewerSecret', LiveTableID: 'tbl-sec' }, false);

        const defaultCsv = engine.ExportToCsv(wb);
        expect(defaultCsv).toContain("'=CMD");
        expect(defaultCsv).toContain("'+SUM");
        expect(defaultCsv).toContain("'-2+3");
        expect(defaultCsv).toContain("'@IMPORTXML");
        expect(defaultCsv).not.toContain('ViewerSecret');

        const rawViewerCsv = engine.ExportToCsv(wb, ws.SheetID, {
            IncludeViewerScopedValues: true,
            NeutralizeFormulas: false
        });
        expect(rawViewerCsv).toContain('ViewerSecret');
        expect(rawViewerCsv).not.toContain("'=CMD");
    });

    it('P1-6 / P2-3: parses =MJ.AI, persists AiInputHash in _mj_sheets_meta, blocks LLM on AccessDenied (#MJ_ACCESS_DENIED!), and COUNT(TRUE)===1', async () => {
        const wb = engine.CreateEmptyWorkbook('AI & COUNT');
        const ws = wb.Worksheets[0];

        engine.SetCell(wb, ws.SheetID, 'A1', { Value: true }, false);
        engine.SetCell(wb, ws.SheetID, 'A2', { Formula: '=COUNT(TRUE, A1, "skip", 5)' });
        expect(ws.Cells['A2'].ComputedValue).toBe(2);
        engine.SetCell(wb, ws.SheetID, 'A3', { Formula: '=COUNT(TRUE)' });
        expect(ws.Cells['A3'].ComputedValue).toBe(1);

        // =MJ.AI formula parsing + round-trip via _mj_sheets_meta
        engine.SetCell(wb, ws.SheetID, 'B1', { Value: 'Clean Metric' }, false);
        engine.SetCell(wb, ws.SheetID, 'C1', { Formula: '=MJ.AI("Summarize", B1)' }, false);
        const parsedCustom = engine.ParseMjCustomFunctionFormula(ws.Cells['C1'].Formula!, wb, ws, 'C1');
        expect(parsedCustom?.Kind).toBe('AI');

        ws.Cells['C1'].AiInputHash = 'hash-roundtrip-ok';
        ws.Cells['C1'].ComputedValue = 'Metric looks strong';
        const xlsxBytes = engine.ExportToXlsxBytes(wb, true);
        const reimported = engine.ImportFromXlsxBytes(xlsxBytes);
        const rWs = reimported.Worksheets[0];
        expect(rWs.Cells['C1']?.Formula).toBe('=MJ.AI("Summarize", B1)');
        expect(rWs.Cells['C1']?.AiInputHash).toBe('hash-roundtrip-ok');

        // AccessDenied cell dependency must fail closed and NEVER send data to AiEvaluator
        engine.SetCell(wb, ws.SheetID, 'D1', { Value: '#MJ_ACCESS_DENIED!' }, false);
        ws.Cells['D1'].AccessDenied = true;
        engine.SetCell(wb, ws.SheetID, 'E1', { Formula: '=MJ.AI("Analyze restricted row", D1)' }, false);

        const aiParsed = engine.ParseMjAiFormula(ws.Cells['E1'].Formula!)!;
        const ctx = engine.ComputeAiFormulaContextAndHash(wb, ws, aiParsed);
        expect(ctx.AccessDenied).toBe(true);

        let evaluatorCalls = 0;
        const evalRes = await engine.EvaluateAiFormulas(wb, makeUser('u1', 'Tester'), undefined, {
            TargetAddresses: ['E1'],
            AiEvaluator: async (cells) => {
                evaluatorCalls += cells.length;
                return [];
            }
        });
        expect(evaluatorCalls).toBe(0);
        expect(evalRes.AccessDeniedCount).toBe(1);
        expect(ws.Cells['E1'].AccessDenied).toBe(true);
        expect(ws.Cells['E1'].ComputedValue).toBe('#MJ_ACCESS_DENIED!');
    });

    it('P1-6 / P2-3: OOXML strips XML 1.0 control chars, decodes _x000D_ & numeric entities, rejects .. rels traversal & bad CRC-32, preserves xl/media/*', () => {
        const wb = engine.CreateEmptyWorkbook('OOXML Hardening');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Value: 'Clean\u0000\u0007Text' });
        const bytes = engine.ExportToXlsxBytes(wb);
        const zipEntries = engine.ExtractZipArchive(bytes);
        const sheetXml = new TextDecoder().decode(zipEntries.get('xl/worksheets/sheet1.xml')!);
        expect(sheetXml).not.toContain('\u0000');
        expect(sheetXml).not.toContain('\u0007');
        expect(sheetXml).toContain('CleanText');

        // Inject xl/media/logo.png and patch workbook via PatchXlsxBytes -> media preserved untouched
        const mediaBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 99, 100]);
        const withMediaEntries = Array.from(zipEntries.entries()).map(([Name, Data]) => ({ Name, Data }));
        withMediaEntries.push({ Name: 'xl/media/logo.png', Data: mediaBytes });
        const withMediaZip = engine.BuildZipArchive(withMediaEntries);

        engine.SetCell(wb, ws.SheetID, 'B1', { Value: 'Patched' });
        const patched = engine.PatchXlsxBytes(withMediaZip, wb);
        const patchedEntries = engine.ExtractZipArchive(patched);
        expect(Array.from(patchedEntries.get('xl/media/logo.png')!)).toEqual(Array.from(mediaBytes));

        // Corrupt a byte inside ZIP entry payload (after local header) to trigger CRC-32 mismatch
        const corrupted = new Uint8Array(bytes);
        corrupted[Math.min(corrupted.length - 10, 80)] ^= 0xff;
        expect(() => engine.ExtractZipArchive(corrupted)).toThrow();

        // Numeric entities & _x000D_ decoding
        const encodedXmlZip = engine.BuildZipArchive([
            {
                Name: 'xl/workbook.xml',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>'
                )
            },
            {
                Name: 'xl/_rels/workbook.xml.rels',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
                )
            },
            {
                Name: 'xl/worksheets/sheet1.xml',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&#65;&#x42;_x000D_Line2</t></is></c></row></sheetData></worksheet>'
                )
            }
        ]);
        const entityImported = engine.ImportFromXlsxBytes(encodedXmlZip);
        expect(entityImported.Worksheets[0].Cells['A1']?.ComputedValue).toBe('AB\rLine2');

        // Path traversal Target="../../etc/passwd" must NOT resolve
        const traversalZip = engine.BuildZipArchive([
            {
                Name: 'xl/workbook.xml',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evil" sheetId="1" r:id="rId1"/></sheets></workbook>'
                )
            },
            {
                Name: 'xl/_rels/workbook.xml.rels',
                Data: new TextEncoder().encode(
                    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="../../etc/passwd.xml"/></Relationships>'
                )
            },
            {
                Name: 'etc/passwd.xml',
                Data: new TextEncoder().encode(
                    '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SECRET</t></is></c></row></sheetData></worksheet>'
                )
            }
        ]);
        const traversalWb = engine.ImportFromXlsxBytes(traversalZip);
        expect(traversalWb.Worksheets[0].Cells['A1']?.ComputedValue).not.toBe('SECRET');
    });

    it('P1-6: executeImportRangeFunction rejects binary ContentMode === "File" artifacts with a clear error', async () => {
        const wb = engine.CreateEmptyWorkbook('ImportRange File Mode');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Formula: '=MJ.IMPORTRANGE("Binary Workbook", "Sheet1!A1:B2")' }, false);

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: '11111111-1111-1111-1111-111111111111',
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'Mocked reader'
        });

        let callIdx = 0;
        const realRv = new RunView();
        vi.spyOn(realRv, 'RunView').mockImplementation(async () => {
            callIdx++;
            if (callIdx === 1) {
                return {
                    Success: true,
                    Results: [{ ID: '11111111-1111-1111-1111-111111111111', Name: 'Binary Workbook' }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1
                };
            }
            return {
                Success: true,
                Results: [
                    {
                        ID: '22222222-2222-2222-2222-222222222222',
                        VersionNumber: 1,
                        ContentMode: 'File',
                        FileID: 'file-xyz-999',
                        Content: null,
                        Configuration: null
                    }
                ],
                RowCount: 1,
                TotalRowCount: 1,
                UserView: null,
                ErrorMessage: '',
                ExecutionTime: 1
            };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(realRv);

        await engine.EvaluateMjCustomFunctions(wb, makeUser('u-viewer', 'Viewer'), Metadata.Provider);
        expect(ws.Cells['A1'].ComputedValue).toBe('#VALUE!');
        expect(ws.Cells['A1'].ErrorMessage).toContain('binary file');
    });

    // -----------------------------------------------------------------------
    // NW-4: Dynamic Arrays, LET/LAMBDA, #SPILL!, =MJ.* AST, CRUD & Native OOXML
    // -----------------------------------------------------------------------

    it('NW-4: evaluates native 2D dynamic arrays (FILTER, UNIQUE, SORT, SORTBY, SEQUENCE, LET, LAMBDA) and #SPILL! collisions', () => {
        const wb = engine.CreateEmptyWorkbook('Dynamic Arrays', ['Main'], 30, 15);
        const ws = wb.Worksheets[0];

        // Source dataset A1:C5
        const rows: Array<[string, string, number | string]> = [
            ['Dept', 'Rep', 'Rev'],
            ['Sales', 'Bob', 300],
            ['Eng', 'Alice', 100],
            ['Sales', 'Bob', 200],
            ['Sales', 'Carol', 500]
        ];
        rows.forEach((r, idx) => {
            engine.SetCell(wb, ws.SheetID, `A${idx + 1}`, { Value: r[0] }, false);
            engine.SetCell(wb, ws.SheetID, `B${idx + 1}`, { Value: r[1] }, false);
            engine.SetCell(wb, ws.SheetID, `C${idx + 1}`, { Value: r[2] }, false);
        });

        // FILTER Sales reps with Rev >= 200
        engine.SetCell(wb, ws.SheetID, 'E1', { Formula: '=FILTER(B2:C5, (A2:A5="Sales")*(C2:C5>=200), "None")' });
        expect(ws.Cells['E1'].ComputedValue).toBe('Bob');
        expect(ws.Cells['F1'].ComputedValue).toBe(300);
        expect(ws.Cells['E2'].ComputedValue).toBe('Bob');
        expect(ws.Cells['F2'].ComputedValue).toBe(200);
        expect(ws.Cells['E3'].ComputedValue).toBe('Carol');
        expect(ws.Cells['F3'].ComputedValue).toBe(500);

        // FILTER empty returns if_empty fallback or #CALC!
        engine.SetCell(wb, ws.SheetID, 'E6', { Formula: '=FILTER(B2:B5, A2:A5="Legal", "EmptyFallback")' });
        expect(ws.Cells['E6'].ComputedValue).toBe('EmptyFallback');
        engine.SetCell(wb, ws.SheetID, 'E7', { Formula: '=FILTER(B2:B5, A2:A5="Legal")' });
        expect(ws.Cells['E7'].ComputedValue).toBe('#CALC!');

        // UNIQUE + UNIQUE(exactly_once)
        engine.SetCell(wb, ws.SheetID, 'H1', { Formula: '=UNIQUE(B2:B5)' });
        expect([ws.Cells['H1'].ComputedValue, ws.Cells['H2'].ComputedValue, ws.Cells['H3'].ComputedValue]).toEqual([
            'Bob',
            'Alice',
            'Carol'
        ]);
        engine.SetCell(wb, ws.SheetID, 'I1', { Formula: '=UNIQUE(B2:B5, FALSE, TRUE)' });
        expect([ws.Cells['I1'].ComputedValue, ws.Cells['I2'].ComputedValue]).toEqual(['Alice', 'Carol']);

        // SORT & SORTBY (multi-key)
        engine.SetCell(wb, ws.SheetID, 'K1', { Formula: '=SORT(C2:C5, 1, -1)' });
        expect([
            ws.Cells['K1'].ComputedValue,
            ws.Cells['K2'].ComputedValue,
            ws.Cells['K3'].ComputedValue,
            ws.Cells['K4'].ComputedValue
        ]).toEqual([500, 300, 200, 100]);

        engine.SetCell(wb, ws.SheetID, 'L1', { Formula: '=SORTBY(B2:C5, A2:A5, 1, C2:C5, -1)' });
        expect(ws.Cells['L1'].ComputedValue).toBe('Alice'); // Eng first
        expect(ws.Cells['L2'].ComputedValue).toBe('Carol'); // Sales 500 next
        expect(ws.Cells['M2'].ComputedValue).toBe(500);

        // SEQUENCE(2, 3, 10, 5) + downstream SUM over spilled region + #SPILL! unblock
        engine.SetCell(wb, ws.SheetID, 'A10', { Value: 'Blocker' }, false);
        engine.SetCell(wb, ws.SheetID, 'A9', { Formula: '=SEQUENCE(2, 3, 10, 5)' });
        expect(ws.Cells['A9'].ComputedValue).toBe('#SPILL!');
        // Clear blocker and re-evaluate -> spills 10,15,20 / 25,30,35
        engine.SetCell(wb, ws.SheetID, 'A10', { Value: null });
        expect(ws.Cells['A9'].ComputedValue).toBe(10);
        expect(ws.Cells['B9'].ComputedValue).toBe(15);
        expect(ws.Cells['C10'].ComputedValue).toBe(35);
        engine.SetCell(wb, ws.SheetID, 'D10', { Formula: '=SUM(A9:C10)' });
        expect(ws.Cells['D10'].ComputedValue).toBe(135);

        // LET + LAMBDA (immediate and LET-bound)
        engine.SetCell(wb, ws.SheetID, 'A13', { Formula: '=LAMBDA(x, y, x*y + 1)(3, 4)' });
        expect(ws.Cells['A13'].ComputedValue).toBe(13);
        engine.SetCell(wb, ws.SheetID, 'A14', { Formula: '=LET(rate, 0.25, fn, LAMBDA(amt, amt*(1+rate)), fn(200))' });
        expect(ws.Cells['A14'].ComputedValue).toBe(250);
    });

    it('NW-4: evaluates =MJ.QUERY / =MJ.VIEW / =MJ.AI arguments via AST and enforces #SPILL! on multi-row =MJ.* outputs', async () => {
        const wb = engine.CreateEmptyWorkbook('MJ Functions AST');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Value: 'North' }, false);
        engine.SetCell(wb, ws.SheetID, 'B1', { Formula: '=UPPER(A1)' });
        expect(ws.Cells['B1'].ComputedValue).toBe('NORTH');

        const capturedSpecs: DocumentBlockSpec[] = [];
        vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockImplementation(async (spec) => {
            capturedSpecs.push(spec);
            return {
                BlockID: spec.BlockID,
                Kind: spec.Kind,
                Mode: spec.Mode,
                Success: true,
                Columns: [{ Name: 'Account', DisplayName: 'Account', Type: 'string' }],
                Rows: [{ Account: 'Acme' }, { Account: 'Globex' }],
                TotalRowCount: 2
            };
        });

        engine.SetCell(wb, ws.SheetID, 'D1', { Formula: '=MJ.QUERY("RegionalSales", "Region=\'" & B1 & "\'")' }, false);
        // Place blocker at D5 so second =MJ.VIEW at D4 triggers #SPILL!
        engine.SetCell(wb, ws.SheetID, 'D5', { Value: 'Obstacle' }, false);
        engine.SetCell(wb, ws.SheetID, 'D4', { Formula: '=MJ.VIEW("MJ: Users", "(default)", "Region=\'" & B1 & "\'")' }, false);

        await engine.EvaluateMjCustomFunctions(wb, makeUser('u-analyst', 'Analyst'), Metadata.Provider, {
            BypassCache: true
        });
        // AST evaluated B1 -> NORTH inside both =MJ.QUERY and =MJ.VIEW arguments
        expect(JSON.stringify(capturedSpecs)).toContain("Region='NORTH'");
        expect(ws.Cells['D1'].ComputedValue).toBe('Acme');
        expect(ws.Cells['D2'].ComputedValue).toBe('Globex');
        expect(ws.Cells['D2'].SpilledFrom).toBe('D1');
        // D4 blocked by Obstacle at D5 -> #SPILL!
        expect(ws.Cells['D4'].ComputedValue).toBe('#SPILL!');

        // =MJ.AI AST argument context
        engine.SetCell(wb, ws.SheetID, 'F1', { Formula: '=MJ.AI("Describe", UPPER(A1))' }, false);
        const parsedAi = engine.ParseMjAiFormula(ws.Cells['F1'].Formula!)!;
        const aiCtx = engine.ComputeAiFormulaContextAndHash(wb, ws, parsedAi);
        expect(aiCtx.AccessDenied).toBe(false);
        expect(aiCtx.ContextValuesJSON).toContain('NORTH');
    });

    it('NW-4: supports MergeCells/UnmergeCells, Validation/CF/NamedRange CRUD helpers, and stable RowID re-anchoring across SortWorksheet & row edits', () => {
        const wb = engine.CreateEmptyWorkbook('Modeling CRUD & Anchoring');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Value: 'Item' }, false);
        engine.SetCell(wb, ws.SheetID, 'B1', { Value: 'Priority' }, false);
        engine.SetCell(wb, ws.SheetID, 'A2', { Value: 'Zebra' }, false);
        engine.SetCell(wb, ws.SheetID, 'B2', { Value: 10 }, false);
        engine.SetCell(wb, ws.SheetID, 'A3', { Value: 'Alpha' }, false);
        engine.SetCell(wb, ws.SheetID, 'B3', { Value: 50 }, false);

        // MergeCells & UnmergeCells
        expect(engine.MergeCells(wb, ws.SheetID, 'D1:F1')).toBe('D1:F1');
        expect(() => engine.MergeCells(wb, ws.SheetID, 'E1:G2')).toThrow(/overlaps/i);
        expect(ws.MergeRanges).toEqual(['D1:F1']);

        // Single-row anchored rules on row 3 ('Alpha')
        engine.AddValidationRule(wb, ws.SheetID, {
            RuleID: 'val-alpha',
            Range: 'B3',
            RuleType: 'numberRange',
            MinValue: 0,
            MaxValue: 100
        });
        engine.AddConditionalFormat(wb, ws.SheetID, {
            RuleID: 'cf-alpha',
            Range: 'A3:B3',
            Operator: 'gt',
            Value1: 20,
            HighlightTone: 'success'
        });
        engine.AddProtectedRange(wb, ws.SheetID, {
            RangeID: 'prot-alpha',
            Range: 'A3:B3',
            LockedByUserID: 'owner-1',
            AllowEditors: true
        });
        engine.SetNamedRange(wb, { Name: 'AlphaScore', SheetID: ws.SheetID, Range: 'B3' });

        // Sort ascending by column A -> 'Alpha' (old row 3) moves to row 2!
        engine.SortWorksheet(
            wb,
            ws.SheetID,
            { ColumnLetter: 'A', Direction: 'asc', HeaderRows: 1 },
            { UserID: 'owner-1', BypassProtection: true }
        );
        expect(ws.Cells['A2'].ComputedValue).toBe('Alpha');
        expect(ws.ValidationRules.find((r) => r.RuleID === 'val-alpha')?.Range).toBe('B2');
        expect(ws.ConditionalFormats.find((r) => r.RuleID === 'cf-alpha')?.Range).toBe('A2:B2');
        expect(ws.ProtectedRanges.find((r) => r.RangeID === 'prot-alpha')?.Range).toBe('A2:B2');
        expect(wb.NamedRanges.find((n) => n.Name === 'AlphaScore')?.Range).toBe('B2');

        // Insert 2 rows at row 1 -> shifts D1:F1 merge down to D3:F3
        engine.InsertRows(wb, ws.SheetID, 1, 2, { BypassProtection: true });
        expect(ws.MergeRanges).toContain('D3:F3');

        expect(engine.UnmergeCells(wb, ws.SheetID, 'D3:F3')).toBe(1);
        expect(engine.RemoveValidationRule(wb, ws.SheetID, 'val-alpha')).toBe(true);
        expect(engine.RemoveConditionalFormat(wb, ws.SheetID, 'cf-alpha')).toBe(true);
        expect(engine.RemoveNamedRange(wb, 'AlphaScore')).toBe(true);
    });

    it('NW-4: exports native OOXML <mergeCells>, <dataValidations>, <hyperlinks>, xl/comments1.xml, and DrawingML <c:chartSpace> + round-trips cleanly', () => {
        const wb = engine.CreateEmptyWorkbook('Native OOXML Export');
        const ws = wb.Worksheets[0];

        engine.SetCell(wb, ws.SheetID, 'A1', { Value: 'Quarterly Summary' }, false);
        engine.MergeCells(wb, ws.SheetID, 'A1:C1');

        engine.SetCell(wb, ws.SheetID, 'A2', { Value: 'Q1' }, false);
        engine.SetCell(wb, ws.SheetID, 'B2', { Value: 125, Note: 'Verified by Finance' }, false);
        engine.SetCell(wb, ws.SheetID, 'A3', { Value: 'Q2' }, false);
        engine.SetCell(wb, ws.SheetID, 'B3', { Value: 180 }, false);
        engine.SetCell(
            wb,
            ws.SheetID,
            'C2',
            { Formula: '=HYPERLINK("https://docs.memberjunction.org", "Docs")' },
            false
        );

        engine.AddValidationRule(wb, ws.SheetID, {
            RuleID: 'val-status',
            Range: 'C3:C5',
            RuleType: 'list',
            AllowedValues: ['Draft', 'Approved', 'Locked'],
            ErrorMessage: 'Choose workflow status'
        });

        ws.Charts.push({
            ChartID: 'chart-qrev',
            Title: 'Quarterly Growth',
            ChartType: 'bar',
            SheetID: ws.SheetID,
            SourceRange: 'A2:B3',
            PositionCell: 'E2'
        });

        const xlsxWithMeta = engine.ExportToXlsxBytes(wb, true);
        const entries = engine.ExtractZipArchive(xlsxWithMeta);
        const sheetXml = new TextDecoder().decode(entries.get('xl/worksheets/sheet1.xml')!);
        const sheetRels = new TextDecoder().decode(entries.get('xl/worksheets/_rels/sheet1.xml.rels')!);
        const commentsXml = new TextDecoder().decode(entries.get('xl/comments1.xml')!);
        const drawingXml = new TextDecoder().decode(entries.get('xl/drawings/drawing1.xml')!);
        const chartXml = new TextDecoder().decode(entries.get('xl/charts/chart1.xml')!);

        expect(sheetXml).toContain('<mergeCells');
        expect(sheetXml).toContain('ref="A1:C1"');
        expect(sheetXml).toContain('<dataValidations');
        expect(sheetXml).toContain('Draft,Approved,Locked');
        expect(sheetXml).toContain('<hyperlinks>');
        expect(sheetRels).toContain('https://docs.memberjunction.org');
        expect(commentsXml).toContain('Verified by Finance');
        expect(drawingXml).toContain('<xdr:wsDr');
        expect(chartXml).toContain('<c:chartSpace');
        expect(chartXml).toContain('Quarterly Growth');

        // Also test Excel-compatible import WITHOUT _mj_sheets_meta (pure native OOXML parsing!)
        const xlsxExcelOnly = engine.ExportToXlsxBytes(wb, false);
        const nativeImported = engine.ImportFromXlsxBytes(xlsxExcelOnly);
        const impSheet = nativeImported.Worksheets[0];
        expect(impSheet.MergeRanges).toContain('A1:C1');
        expect(impSheet.ValidationRules.some((r) => r.RuleType === 'list' && r.AllowedValues?.includes('Approved'))).toBe(true);
        expect(impSheet.Cells['B2']?.Note).toBe('Verified by Finance');
        expect(impSheet.Charts.length).toBeGreaterThanOrEqual(1);
        expect(impSheet.Charts[0].Title).toBe('Quarterly Growth');
    });
});
