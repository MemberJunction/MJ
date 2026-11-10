import { describe, expect, it, beforeEach, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ColumnIndexToLetter,
    ColumnLetterToIndex,
    FormatCellAddress,
    ParseCellAddress,
    ParseRangeAddress,
    SpreadsheetEngine,
    XlsxOpenXmlAdapter
} from '../custom/SpreadsheetEngine';
import { SlideDeckEngine } from '../custom/SlideDeckEngine';
import { DocumentLiveBlockEngine } from '../custom/DocumentLiveBlockEngine';

function createMockUser(id: string, name: string, canRead = true): UserInfo {
    return {
        ID: id,
        Name: name,
        Email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.org`,
        IsActive: true,
        UserRoles: [{ Role: canRead ? 'Member' : 'Restricted' }]
    } as unknown as UserInfo;
}

describe('SpreadsheetEngine (Wave 3 — MJ Sheets § 6 & § 7.2)', () => {
    const engine = SpreadsheetEngine.Instance;

    beforeEach(() => {
        engine.ClearViewerFunctionCache();
        DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
    });

    it('converts between 1-based column indices, letters, and A1 coordinates', () => {
        expect(ColumnIndexToLetter(1)).toBe('A');
        expect(ColumnIndexToLetter(26)).toBe('Z');
        expect(ColumnIndexToLetter(27)).toBe('AA');
        expect(ColumnLetterToIndex('A')).toBe(1);
        expect(ColumnLetterToIndex('Z')).toBe(26);
        expect(ColumnLetterToIndex('AA')).toBe(27);

        const parsed = ParseCellAddress('$C$14');
        expect(parsed).toEqual({
            row: 14,
            col: 3,
            colLetter: 'C',
            absCol: true,
            absRow: true
        });
        expect(FormatCellAddress(14, 3, true, true)).toBe('$C$14');
        expect(ParseRangeAddress('B2:D10')).toEqual({
            startRow: 2,
            endRow: 10,
            startCol: 2,
            endCol: 4
        });
    });

    it('Accept #1: preserves formula targets via stable RowID/ColumnID when inserting rows or columns concurrently', () => {
        const wb = engine.CreateEmptyWorkbook('Q1 Budget', ['Summary'], 15, 8);
        const sheet = wb.Worksheets[0];

        // Populate B2:B5 with numbers and B6 with =SUM(B2:B5)
        engine.SetCell(wb, sheet.SheetID, 'B2', { Value: 100 }, false);
        engine.SetCell(wb, sheet.SheetID, 'B3', { Value: 200 }, false);
        engine.SetCell(wb, sheet.SheetID, 'B4', { Value: 300 }, false);
        engine.SetCell(wb, sheet.SheetID, 'B5', { Value: 400 }, false);
        const sumCell = engine.SetCell(wb, sheet.SheetID, 'B6', { Formula: '=SUM(B2:B5)' }, true);

        expect(sumCell.ComputedValue).toBe(1000);
        expect(sumCell.FormulaStable).toContain('@RANGE(');

        // User A inserts 1 row at the very top (row 1) -> B2:B5 shifts down to B3:B6, and B6 moves to B7 with =SUM(B3:B6)
        engine.InsertRows(wb, sheet.SheetID, 1, 1);
        const shiftedSum = sheet.Cells['B7'];
        expect(shiftedSum).toBeDefined();
        expect(shiftedSum.Formula).toBe('=SUM(B3:B6)');
        expect(shiftedSum.ComputedValue).toBe(1000);

        // User B inserts 1 row INSIDE the range (at row 5, between B4 and B5) and writes 250 into the new row (B5)
        engine.InsertRows(wb, sheet.SheetID, 5, 1);
        engine.SetCell(wb, sheet.SheetID, 'B5', { Value: 250 }, true);
        const expandedSum = sheet.Cells['B8'];
        expect(expandedSum).toBeDefined();
        expect(expandedSum.Formula).toBe('=SUM(B3:B7)');
        expect(expandedSum.ComputedValue).toBe(1250);

        // Insert a column at column A (index 1) -> column B shifts right to column C (`=SUM(C3:C7)`)
        engine.InsertColumns(wb, sheet.SheetID, 1, 1);
        const colShiftedSum = sheet.Cells['C8'];
        expect(colShiftedSum).toBeDefined();
        expect(colShiftedSum.Formula).toBe('=SUM(C3:C7)');
        expect(colShiftedSum.ComputedValue).toBe(1250);
    });

    it('Accept #3: evaluates headless formulas, cross-sheet references, named ranges, VLOOKUP, SUMIF, and cycle detection', () => {
        const wb = engine.CreateEmptyWorkbook('Association Metrics', ['Revenue', 'Rates'], 20, 10);
        const revSheet = wb.Worksheets[0];
        const ratesSheet = wb.Worksheets[1];

        // Set tax rate on Rates!B2 and bind a NamedRange 'TaxRate'
        engine.SetCell(wb, ratesSheet.SheetID, 'B2', { Value: 0.08 }, false);
        wb.NamedRanges.push({
            Name: 'TaxRate',
            SheetID: ratesSheet.SheetID,
            Range: 'B2'
        });

        // Populate Revenue table
        engine.SetCell(wb, revSheet.SheetID, 'A2', { Value: 'Gold' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'B2', { Value: 1000 }, false);
        engine.SetCell(wb, revSheet.SheetID, 'A3', { Value: 'Silver' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'B3', { Value: 500 }, false);
        engine.SetCell(wb, revSheet.SheetID, 'A4', { Value: 'Gold' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'B4', { Value: 1500 }, false);

        // Formulas
        engine.SetCell(wb, revSheet.SheetID, 'C2', { Formula: '=ROUND(B2 * (1 + TaxRate), 2)' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'C3', { Formula: "=B3 * 'Rates'!B2" }, false);
        engine.SetCell(wb, revSheet.SheetID, 'D2', { Formula: '=SUMIF(A2:A4, "Gold", B2:B4)' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'D3', { Formula: '=VLOOKUP("Silver", A2:B4, 2)' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'D4', { Formula: '=IF(D2 > 2000, "Target Met", "Below")' }, false);

        // Cycle detection
        engine.SetCell(wb, revSheet.SheetID, 'E2', { Formula: '=E3 + 1' }, false);
        engine.SetCell(wb, revSheet.SheetID, 'E3', { Formula: '=E2 + 1' }, true);

        expect(revSheet.Cells['C2'].ComputedValue).toBe(1080);
        expect(revSheet.Cells['C3'].ComputedValue).toBe(40);
        expect(revSheet.Cells['D2'].ComputedValue).toBe(2500);
        expect(revSheet.Cells['D3'].ComputedValue).toBe(500);
        expect(revSheet.Cells['D4'].ComputedValue).toBe('Target Met');
        expect(revSheet.Cells['E2'].ComputedValue).toBe('#CYCLE!');
    });

    it('Accept #2 & O5: refreshes LiveTables under viewer RLS/FLS, fills down CalculatedColumns, blocks unauthorized viewers, and freezes with O5 warning', async () => {
        const wb = engine.CreateEmptyWorkbook('Member Dues', ['Dues'], 20, 10);
        const sheet = wb.Worksheets[0];
        sheet.LiveTables.push({
            TableID: 'tbl-dues',
            Title: 'Regional Dues',
            SourceType: 'SavedQuery',
            QueryName: 'Regional Dues Query',
            QueryParameters: { Year: 2026, TenantID: 'attacker-override' },
            AnchorCell: 'A1',
            IncludeHeaders: true,
            Mode: 'Live',
            CalculatedColumns: [
                {
                    Header: 'With Processing Fee',
                    FormulaTemplate: '=ROUND(B{ROW} * 1.03, 2)',
                    FormatType: 'currency'
                }
            ]
        });

        const allowedUser = createMockUser('u-allowed', 'Alice Admin', true);
        const deniedUser = createMockUser('u-denied', 'Bob Restricted', false);

        const mockProvider = {
            Entities: [],
            Queries: [
                {
                    ID: '11111111-2222-3333-4444-555555555555',
                    Name: 'Regional Dues Query',
                    Status: 'Approved',
                    Fields: [
                        { Name: 'Region', Sequence: 1, SQLBaseType: 'nvarchar' },
                        { Name: 'Amount', Sequence: 2, SQLBaseType: 'decimal' }
                    ],
                    Parameters: [
                        { Name: 'Year', IsServerSet: false, IsRequired: false },
                        { Name: 'TenantID', IsServerSet: true, IsRequired: false }
                    ],
                    UserCanRun: (u: UserInfo) => u.ID === allowedUser.ID
                }
            ],
            RunQuery: async () => ({
                Success: true,
                Results: [
                    { Region: 'North', Amount: 1000 },
                    { Region: 'South', Amount: 2000 }
                ],
                RowCount: 2,
                TotalRowCount: 2
            })
        } as unknown as IMetadataProvider;

        // 1. Refresh as allowedUser -> populates headers A1:C1, rows A2:B3, and calculated column C2:C3
        const resAllowed = await engine.RefreshLiveTables(wb, allowedUser, mockProvider);
        expect(resAllowed['tbl-dues'].Success).toBe(true);
        expect(resAllowed['tbl-dues'].StrippedServerSetParameters).toContain('TenantID');
        expect(sheet.Cells['A1'].ComputedValue).toBe('Region');
        expect(sheet.Cells['C1'].ComputedValue).toBe('With Processing Fee');
        expect(sheet.Cells['B2'].ComputedValue).toBe(1000);
        expect(sheet.Cells['C2'].Formula).toBe('=ROUND(B2 * 1.03, 2)');
        expect(sheet.Cells['C2'].ComputedValue).toBe(1030);
        expect(sheet.Cells['C2'].DisplayValue).toBe('$1,030.00');
        expect(sheet.Cells['C3'].ComputedValue).toBe(2060);

        // 2. Refresh as deniedUser -> AccessDenied, never leaks Alice's rows
        const resDenied = await engine.RefreshLiveTables(wb, deniedUser, mockProvider);
        expect(resDenied['tbl-dues'].AccessDenied).toBe(true);
        expect(sheet.LiveTables[0].AccessDenied).toBe(true);
        expect(sheet.Cells['A1'].ComputedValue).toBe('#MJ_ACCESS_DENIED!');

        // 3. Freeze requires explicit O5 acknowledgment
        expect(() =>
            engine.FreezeLiveTable(wb, sheet.SheetID, 'tbl-dues', resAllowed['tbl-dues'], allowedUser, false)
        ).toThrow(/acknowledgeSecurityWarning/);

        const frozen = engine.FreezeLiveTable(
            wb,
            sheet.SheetID,
            'tbl-dues',
            resAllowed['tbl-dues'],
            allowedUser,
            true
        );
        expect(frozen.Mode).toBe('Frozen');
        expect(frozen.FrozenSnapshot?.FrozenByUserID).toBe(allowedUser.ID);
    });

    it('§ 6.3 & § 7.2: evaluates =MJ.QUERY and =MJ.VIEW custom functions with viewer scoping, 60s cache, and #MJ_ACCESS_DENIED!', async () => {
        const wb = engine.CreateEmptyWorkbook('Forecast', ['Metrics'], 15, 8);
        const sheet = wb.Worksheets[0];

        engine.SetCell(
            wb,
            sheet.SheetID,
            'B2',
            { Formula: '=MJ.QUERY("Renewals by Month", 2026)', Style: { FormatType: 'currency' } },
            false
        );
        engine.SetCell(wb, sheet.SheetID, 'B3', { Formula: '=B2 * 1.1' }, false);
        engine.SetCell(
            wb,
            sheet.SheetID,
            'D2',
            { Formula: '=MJ.VIEW("Members", "(Default)", "DROP TABLE Users")' },
            false
        );

        let queryCallCount = 0;
        const allowedUser = createMockUser('u-1', 'Alice', true);
        const deniedUser = createMockUser('u-2', 'Bob', false);

        const mockProvider = {
            Entities: [],
            Queries: [
                {
                    ID: '99999999-8888-7777-6666-555555555555',
                    Name: 'Renewals by Month',
                    Status: 'Approved',
                    Fields: [{ Name: 'TotalRenewals', Sequence: 1, SQLBaseType: 'decimal' }],
                    Parameters: [{ Name: 'Year', IsServerSet: false, IsRequired: false }],
                    UserCanRun: (u: UserInfo) => u.ID === allowedUser.ID
                }
            ],
            RunQuery: async () => {
                queryCallCount++;
                return {
                    Success: true,
                    Results: [{ TotalRenewals: 5000 }],
                    RowCount: 1,
                    TotalRowCount: 1
                };
            }
        } as unknown as IMetadataProvider;

        // First evaluation for allowedUser
        const eval1 = await engine.EvaluateMjCustomFunctions(wb, allowedUser, mockProvider);
        expect(eval1.EvaluatedCount).toBe(2);
        expect(sheet.Cells['B2'].ComputedValue).toBe(5000);
        expect(sheet.Cells['B2'].DisplayValue).toBe('$5,000.00');
        // Downstream formula B3 (=B2 * 1.1) automatically recalculates from B2's scalar result!
        expect(sheet.Cells['B3'].ComputedValue).toBe(5500);
        // D2 rejected raw SQL filter injection
        expect(sheet.Cells['D2'].ComputedValue).toBe('#MJ_ACCESS_DENIED!');
        expect(queryCallCount).toBe(1);

        // Second evaluation for same allowedUser hits 60s viewer cache
        await engine.EvaluateMjCustomFunctions(wb, allowedUser, mockProvider);
        expect(queryCallCount).toBe(1);

        // Evaluation for deniedUser does NOT use allowedUser's cache and returns #MJ_ACCESS_DENIED!
        await engine.EvaluateMjCustomFunctions(wb, deniedUser, mockProvider);
        expect(sheet.Cells['B2'].AccessDenied).toBe(true);
        expect(sheet.Cells['B2'].ComputedValue).toBe('#MJ_ACCESS_DENIED!');
    });

    it('Accept #4: round-trips multi-sheet workbooks with formulas, formats, and column widths through .xlsx OpenXML bytes', () => {
        const wb = engine.CreateEmptyWorkbook('2026 Association Budget', ['Operating Budget', 'Assumptions'], 15, 8);
        const s1 = wb.Worksheets[0];
        const s2 = wb.Worksheets[1];
        s1.Columns[1].Width = 22;

        engine.SetCell(wb, s2.SheetID, 'B2', { Value: 0.12, Style: { FormatType: 'percent' } }, false);
        engine.SetCell(wb, s1.SheetID, 'A1', { Value: 'Line Item', Style: { Bold: true } }, false);
        engine.SetCell(wb, s1.SheetID, 'B1', { Value: 'Amount', Style: { Bold: true } }, false);
        engine.SetCell(wb, s1.SheetID, 'A2', { Value: 'Conferences' }, false);
        engine.SetCell(wb, s1.SheetID, 'B2', { Value: 12500, Style: { FormatType: 'currency' } }, false);
        engine.SetCell(wb, s1.SheetID, 'A3', { Value: 'Publications' }, false);
        engine.SetCell(wb, s1.SheetID, 'B3', { Value: 7500, Style: { FormatType: 'currency' } }, false);
        engine.SetCell(wb, s1.SheetID, 'A4', { Value: 'Total', Style: { Bold: true } }, false);
        engine.SetCell(
            wb,
            s1.SheetID,
            'B4',
            { Formula: '=SUM(B2:B3)', Style: { Bold: true, FormatType: 'currency' } },
            true
        );

        const xlsxBytes = engine.ExportToXlsxBytes(wb);
        expect(xlsxBytes[0]).toBe(0x50); // 'P'
        expect(xlsxBytes[1]).toBe(0x4b); // 'K'

        // Import solely from the .xlsx bytes (without external configuration)
        const imported = engine.ImportFromXlsxBytes(xlsxBytes);
        expect(imported.Worksheets.map((w) => w.Name)).toEqual(['Operating Budget', 'Assumptions']);
        const impS1 = imported.Worksheets[0];
        expect(impS1.Columns[1].Width).toBe(22);
        expect(impS1.Cells['B4'].Formula).toBe('=SUM(B2:B3)');
        expect(impS1.Cells['B4'].ComputedValue).toBe(20000);
        expect(impS1.Cells['B4'].DisplayValue).toBe('$20,000.00');
        expect(impS1.Cells['B4'].Style?.FormatType).toBe('currency');
        expect(imported.Worksheets[1].Cells['B2'].Style?.FormatType).toBe('percent');
    });

    it('Accept #5: updates a chart placed in a Slide when the underlying Sheet range changes', async () => {
        const sheetWb = engine.CreateEmptyWorkbook('Renewal Metrics', ['By Quarter'], 12, 6);
        const ws = sheetWb.Worksheets[0];
        engine.SetCell(sheetWb, ws.SheetID, 'A1', { Value: 'Quarter' }, false);
        engine.SetCell(sheetWb, ws.SheetID, 'B1', { Value: 'Revenue' }, false);
        engine.SetCell(sheetWb, ws.SheetID, 'A2', { Value: 'Q1' }, false);
        engine.SetCell(sheetWb, ws.SheetID, 'B2', { Value: 400 }, false);
        engine.SetCell(sheetWb, ws.SheetID, 'A3', { Value: 'Q2' }, false);
        engine.SetCell(sheetWb, ws.SheetID, 'B3', { Value: 600 }, true);

        ws.Charts.push({
            ChartID: 'chart-q-rev',
            Title: 'Quarterly Revenue',
            ChartType: 'bar',
            SheetID: ws.SheetID,
            SourceRange: 'A1:B3',
            PositionCell: 'D2'
        });

        let latestSheetSerialized = engine.SerializeWorkbook(sheetWb);
        const sheetArtifactId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const viewer = createMockUser('u-slide-viewer', 'Carol Viewer', true);

        // Create a slide deck with a chart region referencing the Sheet's chart-q-rev
        const slideEngine = SlideDeckEngine.Instance;
        const deck = slideEngine.CreateDefaultDeck('Board Update');
        deck.Slides[0].Layout = 'LiveDataSlide';
        deck.Slides[0].Regions = [
            {
                RegionID: 'r-sheet-chart',
                Label: 'Quarterly Revenue Chart',
                Kind: 'mj-block',
                MarkdownContent: '',
                BlockSpec: {
                    BlockID: 'blk-sheet-chart',
                    Kind: 'Artifact',
                    Title: 'Quarterly Revenue from Sheet',
                    Mode: 'Live',
                    DisplayMode: 'chart',
                    ChartType: 'bar',
                    ArtifactID: sheetArtifactId,
                    ArtifactType: 'Excel Spreadsheet',
                    SheetID: ws.SheetID,
                    SheetChartID: 'chart-q-rev'
                }
            }
        ];

        const runSingleMockView = async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sheetArtifactId,
                            Name: 'Renewal Metrics.xlsx',
                            Type: 'Excel Spreadsheet',
                            UserID: viewer.ID
                        }
                    ],
                    RowCount: 1,
                    TotalRowCount: 1
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'ver-1',
                            ArtifactID: sheetArtifactId,
                            VersionNumber: 1,
                            Content: latestSheetSerialized,
                            Configuration: latestSheetSerialized
                        }
                    ],
                    RowCount: 1,
                    TotalRowCount: 1
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0 };
        };

        const mockProvider = {
            Entities: [],
            Queries: [],
            RunView: runSingleMockView,
            RunViews: async (paramsList: Array<{ EntityName: string }>) =>
                Promise.all(paramsList.map((p) => runSingleMockView(p)))
        } as unknown as IMetadataProvider;

        // 1. Execute slide deck live blocks initially -> Q2 Revenue is 600
        const firstExec = await slideEngine.ExecuteDeckLiveBlocks(deck, mockProvider, viewer);
        expect(firstExec['blk-sheet-chart'].Success).toBe(true);
        expect(firstExec['blk-sheet-chart'].Rows).toEqual([
            { Quarter: 'Q1', Revenue: 400 },
            { Quarter: 'Q2', Revenue: 600 }
        ]);

        // 2. Update Q2 Revenue in the Sheet from 600 to 950 -> Slide block reflects 950 on refresh!
        engine.SetCell(sheetWb, ws.SheetID, 'B3', { Value: 950 }, true);
        latestSheetSerialized = engine.SerializeWorkbook(sheetWb);

        const secondExec = await slideEngine.ExecuteDeckLiveBlocks(deck, mockProvider, viewer);
        expect(secondExec['blk-sheet-chart'].Rows).toEqual([
            { Quarter: 'Q1', Revenue: 400 },
            { Quarter: 'Q2', Revenue: 950 }
        ]);
    });

    it('§ 6.1, O7 & D2: evaluates 2,500+ formula cells including a 1,500-row running-total chain with zero stack overflow and sub-50ms incremental SetCell updates', () => {
        const wb = engine.CreateEmptyWorkbook('100k Stress Test', ['BigGrid'], 5000, 20);
        const ws = wb.Worksheets[0];

        // Populate A1:A1500 with inputs, B1:B1500 with a 1,500-row running-total chain, and C1:C1500 with 1,500 extra formulas (3,000 total formulas!)
        for (let r = 1; r <= 1500; r++) {
            const addrA = `A${r}`;
            ws.Cells[addrA] = {
                RowID: ws.Rows[r - 1].RowID,
                ColumnID: ws.Columns[0].ColumnID,
                Address: addrA,
                RawValue: 2
            };
            const addrB = `B${r}`;
            const bFormula = r === 1 ? '=A1' : `=B${r - 1}+A${r}`;
            ws.Cells[addrB] = {
                RowID: ws.Rows[r - 1].RowID,
                ColumnID: ws.Columns[1].ColumnID,
                Address: addrB,
                RawValue: null,
                Formula: bFormula
            };
            const addrC = `C${r}`;
            ws.Cells[addrC] = {
                RowID: ws.Rows[r - 1].RowID,
                ColumnID: ws.Columns[2].ColumnID,
                Address: addrC,
                RawValue: null,
                Formula: `=A${r}*10+5`
            };
        }

        const evalStart = performance.now();
        engine.EvaluateWorkbook(wb);
        const fullEvalMs = performance.now() - evalStart;

        expect(ws.Rows.length * ws.Columns.length).toBe(100_000);
        expect(ws.Cells['B1500'].ComputedValue).toBe(3000);
        expect(ws.Cells['C1500'].ComputedValue).toBe(25);
        expect(fullEvalMs).toBeLessThan(1000);

        // Incremental dirty-subgraph recalculation: editing A1500 updates ONLY B1500 and C1500 in milliseconds
        const incStart = performance.now();
        engine.SetCell(wb, ws.SheetID, 'A1500', { Value: 102 }, true);
        const incMs = performance.now() - incStart;
        expect(ws.Cells['B1500'].ComputedValue).toBe(3100);
        expect(ws.Cells['C1500'].ComputedValue).toBe(1025);
        expect(incMs).toBeLessThan(50);
    });

    it('D2 & D4: enforces full Excel parity across rounding, modulo, strings, blank coercion, lookups, criteria wildcards, scientific notation, and 1900 serial dates', () => {
        const wb = engine.CreateEmptyWorkbook('Excel Parity Suite', ['Parity'], 40, 15);
        const s = wb.Worksheets[0];

        // Rounding & Modulo parity
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ROUND(-2.5, 0)')).toBe(-3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ROUND(1.005, 2)')).toBe(1.01);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=INT(-2.3)')).toBe(-3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MOD(-1, 3)')).toBe(2);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MOD(5, 0)')).toBe('#DIV/0!');

        // Scientific notation & postfix percent on arbitrary expressions
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUM(1e-11, 2e-11)')).toBe(3e-11);
        engine.SetCell(wb, s.SheetID, 'A1', { Value: 25 }, true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=(A1)%')).toBe(0.25);

        // LEFT / RIGHT zero-length & error propagation
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=LEFT("abc", 0)')).toBe('');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=RIGHT("abc", 0)')).toBe('');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=LEFT(#REF!, 2)')).toBe('#REF!');

        // Blank cell coercion & IS* functions (A9 is blank)
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=IF(A9=0, "zero", "nonzero")')).toBe('zero');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=IF(A9="", "empty", "nonempty")')).toBe('empty');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISBLANK(A9)')).toBe(true);
        engine.SetCell(wb, s.SheetID, 'A10', { Formula: '=LEFT("abc", 0)' }, true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISBLANK(A10)')).toBe(false);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISTEXT(A10)')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISNUMBER(A1)')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISERROR(#DIV/0!)')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISNA(#N/A)')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ISNA(#DIV/0!)')).toBe(false);

        // IFNA catches #N/A ONLY (distinct from IFERROR)
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=IFNA(#N/A, "missing")')).toBe('missing');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=IFNA(#DIV/0!, "missing")')).toBe('#DIV/0!');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=IFERROR(#DIV/0!, "fallback")')).toBe('fallback');

        // COUNTIF skipping blanks on numeric < criteria + wildcard matching
        engine.SetCell(wb, s.SheetID, 'B1', { Value: 2 }, true);
        // B2:B5 remain blank!
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIF(B1:B5, "<5")')).toBe(1);

        engine.SetCell(wb, s.SheetID, 'C1', { Value: 'Enterprise Gold' }, false);
        engine.SetCell(wb, s.SheetID, 'C2', { Value: 'Starter Plan' }, false);
        engine.SetCell(wb, s.SheetID, 'C3', { Value: 'Enterprise Plus' }, false);
        engine.SetCell(wb, s.SheetID, 'D1', { Value: 100 }, false);
        engine.SetCell(wb, s.SheetID, 'D2', { Value: 50 }, false);
        engine.SetCell(wb, s.SheetID, 'D3', { Value: 300 }, true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIF(C1:C5, "Enterprise*")')).toBe(2);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUMIFS(D1:D3, C1:C3, "Enterprise*", D1:D3, ">150")')).toBe(300);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIFS(C1:C3, "Enterprise*", D1:D3, ">=100")')).toBe(2);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=AVERAGEIFS(D1:D3, C1:C3, "Enterprise*")')).toBe(200);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUMPRODUCT(D1:D3, D1:D3)')).toBe(100 * 100 + 50 * 50 + 300 * 300);

        // 1D horizontal INDEX(F1:H1, 2), VLOOKUP 4th arg approx vs exact, XLOOKUP, and MATCH
        engine.SetCell(wb, s.SheetID, 'F1', { Value: 'Jan' }, false);
        engine.SetCell(wb, s.SheetID, 'G1', { Value: 'Feb' }, false);
        engine.SetCell(wb, s.SheetID, 'H1', { Value: 'Mar' }, false);
        engine.SetCell(wb, s.SheetID, 'J1', { Value: 10 }, false);
        engine.SetCell(wb, s.SheetID, 'K1', { Value: 'Tier 1' }, false);
        engine.SetCell(wb, s.SheetID, 'J2', { Value: 20 }, false);
        engine.SetCell(wb, s.SheetID, 'K2', { Value: 'Tier 2' }, false);
        engine.SetCell(wb, s.SheetID, 'J3', { Value: 30 }, false);
        engine.SetCell(wb, s.SheetID, 'K3', { Value: 'Tier 3' }, true);

        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=INDEX(F1:H1, 2)')).toBe('Feb');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=VLOOKUP(25, J1:K3, 2, TRUE)')).toBe('Tier 2');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=VLOOKUP(25, J1:K3, 2, FALSE)')).toBe('#N/A');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=VLOOKUP(20, J1:K3, 0, FALSE)')).toBe('#VALUE!');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=XLOOKUP(20, J1:J3, K1:K3, "None")')).toBe('Tier 2');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=XLOOKUP(99, J1:J3, K1:K3, "Missing")')).toBe('Missing');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MATCH(25, J1:J3, 1)')).toBe(2);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MATCH(25, J1:J3, 0)')).toBe('#N/A');

        // Excel 1900 serial dates + date arithmetic + TEXT
        const datePlus10 = engine.SetCell(wb, s.SheetID, 'M1', { Formula: '=DATE(2026, 1, 15) + 10' }, true);
        expect(typeof datePlus10.ComputedValue).toBe('number');
        expect(datePlus10.DisplayValue).toBe('2026-01-25');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=YEAR(M1)')).toBe(2026);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MONTH(M1)')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=DAY(M1)')).toBe(25);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=DAYS(M1, DATE(2026, 1, 15))')).toBe(10);
        expect(engine.FormatCellValue(engine.EvaluateFormulaExpression(wb, s.SheetID, '=EDATE(DATE(2026, 1, 31), 1)'), { FormatType: 'date' })).toBe('2026-02-28');
        expect(engine.FormatCellValue(engine.EvaluateFormulaExpression(wb, s.SheetID, '=EOMONTH(DATE(2024, 1, 15), 1)'), { FormatType: 'date' })).toBe('2024-02-29');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=TEXT(DATE(2026, 1, 15), "yyyy-mm-dd")')).toBe('2026-01-15');

        const todayCell = engine.SetCell(wb, s.SheetID, 'M2', { Formula: '=TODAY()+7' }, true);
        const todayBase = engine.EvaluateFormulaExpression(wb, s.SheetID, '=TODAY()') as number;
        expect(todayCell.ComputedValue).toBe(todayBase + 7);
        expect(todayCell.DisplayValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('B6: rejects truncated DEFLATE streams and high-ratio decompression bombs immediately', () => {
        // Helper to build a single-entry DEFLATE ZIP archive
        const buildDeflateZip = (entryName: string, compressedPayload: Uint8Array, declaredUncompSize: number): Uint8Array => {
            const nameBytes = new TextEncoder().encode(entryName);
            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(8, 8, true); // method 8 = DEFLATE
            lv.setUint32(18, compressedPayload.length, true);
            lv.setUint32(22, declaredUncompSize, true);
            lv.setUint16(26, nameBytes.length, true);
            local.set(nameBytes, 30);

            const central = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(central.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(10, 8, true);
            cv.setUint32(20, compressedPayload.length, true);
            cv.setUint32(24, declaredUncompSize, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint32(42, 0, true);
            central.set(nameBytes, 46);

            const cdOffset = local.length + compressedPayload.length;
            const eocd = new Uint8Array(22);
            const ev = new DataView(eocd.buffer);
            ev.setUint32(0, 0x06054b50, true);
            ev.setUint16(8, 1, true);
            ev.setUint16(10, 1, true);
            ev.setUint32(12, central.length, true);
            ev.setUint32(16, cdOffset, true);

            const total = new Uint8Array(cdOffset + central.length + eocd.length);
            total.set(local, 0);
            total.set(compressedPayload, local.length);
            total.set(central, cdOffset);
            total.set(eocd, cdOffset + central.length);
            return total;
        };

        // 1. Truncated DEFLATE stream (chopped mid-stream)
        const validXml = new TextEncoder().encode('<worksheet><sheetData/></worksheet>'.repeat(50));
        const fullCompressed = new Uint8Array(deflateRawSync(validXml));
        const truncatedCompressed = fullCompressed.subarray(0, Math.max(2, Math.floor(fullCompressed.length / 2)));
        const truncatedZip = buildDeflateZip('xl/worksheets/sheet1.xml', truncatedCompressed, validXml.length);
        expect(() => engine.ImportFromXlsxBytes(truncatedZip)).toThrow(/Truncated DEFLATE stream|Invalid/i);

        // 2. High-ratio compression bomb: 18 MB of zeroes compressed into ~18 KB with spoofed 1 KB header uncompSize
        const bombPlain = new Uint8Array(18 * 1024 * 1024);
        const bombCompressed = new Uint8Array(deflateRawSync(bombPlain));
        expect(bombCompressed.byteLength).toBeLessThan(100_000);
        const bombZip = buildDeflateZip('xl/worksheets/sheet1.xml', bombCompressed, 1024);
        expect(() => engine.ImportFromXlsxBytes(bombZip)).toThrow(/exceeds maximum allowed/i);
    });

    it('B4 & A5: strips viewer-scoped live table/spill/=MJ.* values on serialization and preserves =MJ.VIEW 3rd-arg filter', async () => {
        // A5: =MJ.VIEW 3rd argument with '=' must stay in positional Arguments, NOT split into NamedParameters
        const parsedView = engine.ParseMjCustomFunctionFormula(`=MJ.VIEW("Members", "Active Members", "Status='Active'")`);
        expect(parsedView).toBeTruthy();
        expect(parsedView!.Kind).toBe('VIEW');
        expect(parsedView!.Arguments).toEqual(["Status='Active'"]);
        expect(parsedView!.NamedParameters).toEqual({});

        const wb = engine.CreateEmptyWorkbook('Viewer Leak Guard', ['Data'], 20, 8);
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'D1', { Formula: `=MJ.VIEW("Members", "(Default)", "Status='Active'")` }, false);

        ws.LiveTables.push({
            TableID: 'tbl-live',
            Title: 'Live Members',
            SourceType: 'EntityView',
            EntityName: 'Members',
            AnchorCell: 'A1',
            IncludeHeaders: true,
            Mode: 'Live'
        });

        let rowsToReturn: Array<Record<string, unknown>> = [
            { ID: 'm1', Name: 'Secret Alice', Status: 'Active' },
            { ID: 'm2', Name: 'Secret Bob', Status: 'Active' }
        ];
        const mockEntity = {
            ID: 'ent-mem',
            Name: 'Members',
            DisplayNameOrName: 'Members',
            PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }],
            Fields: [
                { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, TSType: EntityFieldTSType.String },
                { Name: 'Name', DisplayNameOrName: 'Name', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String },
                { Name: 'Status', DisplayNameOrName: 'Status', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String }
            ] as unknown as EntityFieldInfo[],
            FieldLevelSecurityApplies: false,
            GetUserPermisions: () => ({ CanRead: true }),
            GetDeniedReadFields: () => new Set<string>()
        } as unknown as EntityInfo;

        let lastExtraFilter = '';
        const provider = {
            Entities: [mockEntity],
            Queries: [],
            RunView: async (params: { ExtraFilter?: string }) => {
                lastExtraFilter = params.ExtraFilter ?? '';
                return { Success: true, Results: rowsToReturn, TotalRowCount: rowsToReturn.length };
            }
        } as unknown as IMetadataProvider;

        const viewer = createMockUser('u-viewer', 'Alice', true);
        await engine.RefreshLiveTables(wb, viewer, provider);
        await engine.EvaluateMjCustomFunctions(wb, viewer, provider);

        expect(lastExtraFilter).toContain("Status = 'Active'");
        expect(ws.Cells['B2'].ComputedValue).toBe('Secret Alice');
        expect(ws.Cells['B3'].ComputedValue).toBe('Secret Bob');
        expect(ws.Cells['E1']?.SpilledFrom).toBe('D1');

        // Shrinking live table results clears stale row 3!
        rowsToReturn = [{ ID: 'm1', Name: 'Secret Alice', Status: 'Active' }];
        await engine.RefreshLiveTables(wb, viewer, provider);
        expect(ws.Cells['B2'].ComputedValue).toBe('Secret Alice');
        expect(ws.Cells['B3']).toBeUndefined();

        // SerializeWorkbook strips live table cells, spill cells, and resets D1 ComputedValue/DisplayValue
        const serialized = engine.SerializeWorkbook(wb);
        expect(serialized).not.toContain('Secret Alice');
        const reparsed = JSON.parse(serialized);
        expect(reparsed.Worksheets[0].Cells['B2']).toBeUndefined();
        expect(reparsed.Worksheets[0].Cells['E1']).toBeUndefined();
        expect(reparsed.Worksheets[0].Cells['D1'].ComputedValue).toBeNull();
        expect(reparsed.Worksheets[0].Cells['D1'].DisplayValue).toBe('');
    });

    it('D3 & E6: preserves unique RowID/ColumnID after deletes, shrinks cross-sheet @SHEET_RANGE endpoints, shifts non-cell metadata, and imports OOXML shared formulas & date numFmts', () => {
        const wb = engine.CreateEmptyWorkbook('Structural & XLSX', ['Summary', 'FY24 Q1'], 12, 8);
        const sumSheet = wb.Worksheets[0];
        const q1Sheet = wb.Worksheets[1];

        engine.SetCell(wb, q1Sheet.SheetID, 'B2', { Value: 10 }, false);
        engine.SetCell(wb, q1Sheet.SheetID, 'B3', { Value: 20 }, false);
        engine.SetCell(wb, q1Sheet.SheetID, 'B4', { Value: 30 }, true);

        const crossSum = engine.SetCell(wb, sumSheet.SheetID, 'A1', { Formula: "='FY24 Q1'!B2:B4" }, false);
        expect(crossSum.FormulaStable).toContain('@SHEET_RANGE(');
        engine.SetCell(wb, sumSheet.SheetID, 'A2', { Formula: "=SUM('FY24 Q1'!B2:B4)" }, true);
        expect(sumSheet.Cells['A2'].ComputedValue).toBe(60);

        // Configure non-cell range metadata on q1Sheet
        wb.NamedRanges.push({ Name: 'Q1Range', SheetID: q1Sheet.SheetID, Range: 'B2:B4' });
        q1Sheet.Charts.push({ ChartID: 'c1', Title: 'C', ChartType: 'bar', SheetID: q1Sheet.SheetID, SourceRange: 'B2:B4', PositionCell: 'D5' });
        q1Sheet.SortSpec = { ColumnLetter: 'B', Direction: 'asc' };
        q1Sheet.FilterSpecs = [{ ColumnLetter: 'B', Operator: 'gt', Value: '5' }];

        // Delete endpoint row 2 on 'FY24 Q1' -> range B2:B4 shrinks to surviving rows (now B2:B3 = 20 + 30 = 50), NOT #REF!!
        engine.DeleteRows(wb, q1Sheet.SheetID, 2, 1);
        expect(sumSheet.Cells['A2'].Formula).toBe("=SUM('FY24 Q1'!B2:B3)");
        expect(sumSheet.Cells['A2'].ComputedValue).toBe(50);
        expect(wb.NamedRanges[0].Range).toBe('B2:B3');
        expect(q1Sheet.Charts[0].SourceRange).toBe('B2:B3');
        expect(q1Sheet.Charts[0].PositionCell).toBe('D4');

        // Expand capacity after deletion -> never mints duplicate RowIDs!
        engine.SetCell(wb, q1Sheet.SheetID, 'A15', { Value: 99 }, true);
        const rowIds = q1Sheet.Rows.map((r) => r.RowID);
        expect(new Set(rowIds).size).toBe(rowIds.length);

        // Insert column at A on q1Sheet -> SortSpec and FilterSpecs shift from B to C
        engine.InsertColumns(wb, q1Sheet.SheetID, 1, 1);
        expect(q1Sheet.SortSpec?.ColumnLetter).toBe('C');
        expect(q1Sheet.FilterSpecs[0].ColumnLetter).toBe('C');

        // E6: Import .xlsx with OOXML shared formulas (<f t="shared" si="0">) and built-in date numFmtId="14"
        const exported = engine.ExportToXlsxBytes(engine.CreateEmptyWorkbook('SharedTest', ['Sheet1'], 5, 5), false);
        // Build a synthetic worksheet XML containing shared formulas and numFmtId=14 date style
        const baseWb = engine.CreateEmptyWorkbook('SharedFormulaBook', ['Sheet1'], 6, 6);
        const customWsXml = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            '<sheetData>',
            '<row r="1"><c r="A1" t="n"><v>10</v></c><c r="B1" t="n"><f t="shared" ref="B1:B3" si="0">A1*2</f><v>20</v></c><c r="C1" s="1" t="n"><v>46037</v></c></row>',
            '<row r="2"><c r="A2" t="n"><v>15</v></c><c r="B2" t="n"><f t="shared" si="0"/><v>30</v></c></row>',
            '<row r="3"><c r="A3" t="n"><v>25</v></c><c r="B3" t="n"><f t="shared" si="0"/><v>50</v></c></row>',
            '</sheetData></worksheet>'
        ].join('');
        const customStylesXml = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            '<fonts count="1"><font><sz val="11"/></font></fonts>',
            '<cellXfs count="2"><xf numFmtId="0" fontId="0"/><xf numFmtId="14" fontId="0" applyNumberFormat="1"/></cellXfs>',
            '</styleSheet>'
        ].join('');
        // Use internal buildZipArchive via a minimal stored ZIP helper
        expect(exported.length).toBeGreaterThan(0);
        expect(baseWb.Worksheets).toHaveLength(1);
        const enc = new TextEncoder();
        const zipEntries = [
            { Name: '[Content_Types].xml', Data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
            { Name: 'xl/workbook.xml', Data: enc.encode('<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>') },
            { Name: 'xl/_rels/workbook.xml.rels', Data: enc.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>') },
            { Name: 'xl/styles.xml', Data: enc.encode(customStylesXml) },
            { Name: 'xl/worksheets/sheet1.xml', Data: enc.encode(customWsXml) }
        ];
        const customZip = (engine as unknown as { buildZipArchive: (e: Array<{ Name: string; Data: Uint8Array }>) => Uint8Array }).buildZipArchive(zipEntries);
        const importedShared = engine.ImportFromXlsxBytes(customZip);
        const impWs = importedShared.Worksheets[0];
        expect(impWs.Cells['B1'].Formula).toBe('=A1*2');
        expect(impWs.Cells['B2'].Formula).toBe('=A2*2');
        expect(impWs.Cells['B3'].Formula).toBe('=A3*2');
        expect(impWs.Cells['B3'].ComputedValue).toBe(50);
        expect(impWs.Cells['C1'].Style?.FormatType).toBe('date');
        expect(impWs.Cells['C1'].DisplayValue).toBe('2026-01-15');
    });

    it('Round 2 Blockers 4 & 6, Plan §6.1 Functions, PatchXlsxBytes, UUID Row/Col IDs, and 10k-formula Recalc + Serialize Perf', async () => {
        const wb = engine.CreateEmptyWorkbook('Round 2 Verification', ['Calc'], 30, 15);
        const s = wb.Worksheets[0];

        // 1. Blocker 6: Full IEEE-754 doubles without 12-sig-digit snapping (preserves 15-digit IDs / order numbers)
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=1/3*3')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=10/3*3=10')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUM(1/3,1/3,1/3)')).toBe(1);
        expect(engine.FormatCellValue(engine.EvaluateFormulaExpression(wb, s.SheetID, '=0.1+0.2'))).toBe('0.3');
        engine.SetCell(wb, s.SheetID, 'A1', { Value: 100000000000001 }, false);
        engine.SetCell(wb, s.SheetID, 'A2', { Value: 1e14 }, true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=A1=A2')).toBe(false);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=A1-A2')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=1E14+1')).toBe(100000000000001);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=1E308*10')).toBe('#NUM!');

        // 2. Plan §6.1 Functions: COUNTBLANK, PRODUCT, FLOOR, CEILING, HLOOKUP, ROW, COLUMN, SUBSTITUTE, FIND, SEARCH, VALUE
        engine.SetCell(wb, s.SheetID, 'A1', { Value: 10 }, false);
        engine.SetCell(wb, s.SheetID, 'A2', { Value: null }, false);
        engine.SetCell(wb, s.SheetID, 'A3', { Value: 5 }, false);
        engine.SetCell(wb, s.SheetID, 'B1', { Value: 'Q1' }, false);
        engine.SetCell(wb, s.SheetID, 'C1', { Value: 'Q2' }, false);
        engine.SetCell(wb, s.SheetID, 'D1', { Value: 'Q3' }, false);
        engine.SetCell(wb, s.SheetID, 'B2', { Value: 110 }, false);
        engine.SetCell(wb, s.SheetID, 'C2', { Value: 220 }, false);
        engine.SetCell(wb, s.SheetID, 'D2', { Value: 330 }, false);
        const rowSelfCell = engine.SetCell(wb, s.SheetID, 'E7', { Formula: '=ROW()' }, false);
        const colSelfCell = engine.SetCell(wb, s.SheetID, 'E7', { Formula: '=COLUMN()' }, true);
        expect(colSelfCell.ComputedValue).toBe(5);
        engine.SetCell(wb, s.SheetID, 'E6', { Formula: '=ROW()' }, true);
        expect(s.Cells['E6'].ComputedValue).toBe(6);
        expect(rowSelfCell).toBeTruthy();

        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTBLANK(A1:A4)')).toBe(2);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=PRODUCT(A1, A3, 2)')).toBe(100);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=FLOOR(23.7, 5)')).toBe(20);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=CEILING(21.2, 5)')).toBe(25);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=HLOOKUP("Q2", B1:D2, 2, FALSE)')).toBe(220);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ROW(C9)')).toBe(9);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COLUMN(C9)')).toBe(3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUBSTITUTE("2025-Q1-2025", "2025", "2026", 2)')).toBe('2025-Q1-2026');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=FIND("Budget", "Annual Budget Plan")')).toBe(8);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=FIND("budget", "Annual Budget Plan")')).toBe('#VALUE!');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SEARCH("bud*plan", "Annual Budget Plan")')).toBe(8);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=VALUE("$1,250.50")')).toBe(1250.5);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=VALUE("12.5%")')).toBe(0.125);

        // 3. Collaborative UUID RowID / ColumnID on InsertRows / InsertColumns
        const insRows = engine.InsertRows(wb, s.SheetID, 2, 1);
        const insCols = engine.InsertColumns(wb, s.SheetID, 2, 1);
        expect(insRows[0].RowID).not.toContain('-row-ins-');
        expect(insCols[0].ColumnID).not.toContain('-col-ins-');
        expect(insRows[0].RowID).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/i);
        expect(insCols[0].ColumnID).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/i);

        // 4. Blocker 4: Styling or adding a Note to a live-table cell + dependent formula NEVER leaks live values on Serialize or ExportToXlsxBytes
        const liveWb = engine.CreateEmptyWorkbook('Exec Salaries', ['Payroll'], 15, 8);
        const lws = liveWb.Worksheets[0];
        lws.LiveTables.push({
            TableID: 'tbl-payroll',
            Title: 'Payroll',
            SourceType: 'EntityView',
            EntityName: 'Employees',
            AnchorCell: 'A1',
            IncludeHeaders: true,
            Mode: 'Live'
        });
        const mockEmpEntity = {
            ID: 'ent-emp',
            Name: 'Employees',
            DisplayNameOrName: 'Employees',
            PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }],
            Fields: [
                { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, TSType: EntityFieldTSType.String },
                { Name: 'Salary', DisplayNameOrName: 'Salary', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.Number }
            ] as unknown as EntityFieldInfo[],
            FieldLevelSecurityApplies: false,
            GetUserPermisions: () => ({ CanRead: true }),
            GetDeniedReadFields: () => new Set<string>()
        } as unknown as EntityInfo;
        const provider = {
            Entities: [mockEmpEntity],
            Queries: [],
            RunView: async () => ({
                Success: true,
                Results: [{ ID: 'emp-1', Salary: 250000 }],
                TotalRowCount: 1
            })
        } as unknown as IMetadataProvider;

        const admin = createMockUser('u-admin', 'Admin', true);
        await engine.RefreshLiveTables(liveWb, admin, provider);
        expect(lws.Cells['B2'].ComputedValue).toBe(250000);
        expect(lws.Cells['B2'].LiveTableID).toBe('tbl-payroll');

        // Admin bolds B2 and adds a Note, and writes a formula C2 = B2 * 1.1 (= 275000)
        engine.SetCell(liveWb, lws.SheetID, 'B2', { Style: { Bold: true }, Note: 'CEO base' }, true);
        engine.SetCell(liveWb, lws.SheetID, 'C2', { Formula: '=B2*1.1' }, true);
        expect(lws.Cells['B2'].LiveTableID).toBe('tbl-payroll');
        expect(lws.Cells['C2'].ComputedValue).toBe(275000);

        const serializedPayroll = engine.SerializeWorkbook(liveWb);
        expect(serializedPayroll).not.toContain('250000');
        expect(serializedPayroll).not.toContain('275000');
        const parsedPayroll = JSON.parse(serializedPayroll);
        expect(parsedPayroll.Worksheets[0].Cells['B2']?.RawValue).toBeNull();
        expect(parsedPayroll.Worksheets[0].Cells['B2']?.ComputedValue).toBeNull();
        expect(parsedPayroll.Worksheets[0].Cells['B2']?.Note).toBe('CEO base');
        expect(parsedPayroll.Worksheets[0].Cells['C2']?.Formula).toBe('=B2*1.1');
        expect(parsedPayroll.Worksheets[0].Cells['C2']?.ComputedValue).toBeNull();

        const xlsxPayroll = engine.ExportToXlsxBytes(liveWb, true);
        const xlsxText = new TextDecoder().decode(xlsxPayroll);
        expect(xlsxText).not.toContain('250000');
        expect(xlsxText).not.toContain('275000');

        // 5. PatchXlsxBytes preserves <mergeCells>, <dataValidations>, <conditionalFormatting>, untouched <row ht="24" customHeight="1">, removes calcChain.xml, and preserves extra ZIP entries
        const enc = new TextEncoder();
        const richWsXml = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            '<dimension ref="A1:B2"/>',
            '<sheetData>',
            '<row r="1" ht="24" customHeight="1"><c r="A1" s="2" t="n"><v>10</v></c><c r="B1" s="3"/></row>',
            '</sheetData>',
            '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>',
            '<conditionalFormatting sqref="A1:A10"><cfRule type="cellIs" operator="greaterThan" priority="1"><formula>50</formula></cfRule></conditionalFormatting>',
            '<dataValidations count="1"><dataValidation type="list" sqref="B1:B10"><formula1>"Yes,No"</formula1></dataValidation></dataValidations>',
            '</worksheet>'
        ].join('');
        const richOrigZip = (engine as unknown as { buildZipArchive: (e: Array<{ Name: string; Data: Uint8Array }>) => Uint8Array }).buildZipArchive([
            { Name: '[Content_Types].xml', Data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>') },
            { Name: 'xl/workbook.xml', Data: enc.encode('<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>') },
            { Name: 'xl/_rels/workbook.xml.rels', Data: enc.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="calcChain.xml"/></Relationships>') },
            { Name: 'xl/worksheets/sheet1.xml', Data: enc.encode(richWsXml) },
            { Name: 'xl/calcChain.xml', Data: enc.encode('<calcChain/>') },
            { Name: 'xl/drawings/drawing1.xml', Data: enc.encode('<wsDr/>') }
        ]);
        const importedRich = XlsxOpenXmlAdapter.Instance.ImportXlsx(richOrigZip);
        engine.SetCell(importedRich, importedRich.Worksheets[0].SheetID, 'A2', { Value: 999 }, true);
        const patchedZip = XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(richOrigZip, importedRich);
        const extractedPatched = (engine as unknown as { extractZipArchive: (b: Uint8Array) => Map<string, Uint8Array> }).extractZipArchive(patchedZip);
        expect(extractedPatched.has('xl/drawings/drawing1.xml')).toBe(true);
        expect(extractedPatched.has('xl/calcChain.xml')).toBe(false);
        const patchedSheetXml = new TextDecoder().decode(extractedPatched.get('xl/worksheets/sheet1.xml')!);
        expect(patchedSheetXml).toContain('<row r="1" ht="24" customHeight="1"><c r="A1" s="2" t="n"><v>10</v></c><c r="B1" s="3"/></row>');
        expect(patchedSheetXml).toContain('<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>');
        expect(patchedSheetXml).toContain('<conditionalFormatting sqref="A1:A10">');
        expect(patchedSheetXml).toContain('<dataValidations count="1">');
        expect(patchedSheetXml).toContain('<c r="A2" t="n"><v>999</v></c>');

        // 6. 10,000-formula incremental DAG recalculation test (deterministic work count, no wall-clock flake)
        const perfWb = engine.CreateEmptyWorkbook('10k Formulas', ['Perf'], 2505, 6);
        const pws = perfWb.Worksheets[0];
        for (let r = 1; r <= 2500; r++) {
            pws.Cells[`A${r}`] = { RowID: pws.Rows[r - 1].RowID, ColumnID: pws.Columns[0].ColumnID, Address: `A${r}`, RawValue: r };
            pws.Cells[`B${r}`] = { RowID: pws.Rows[r - 1].RowID, ColumnID: pws.Columns[1].ColumnID, Address: `B${r}`, RawValue: null, Formula: `=A${r}*2`, FormulaStable: `@CELL(${pws.Rows[r - 1].RowID},${pws.Columns[0].ColumnID})*2` };
            pws.Cells[`C${r}`] = { RowID: pws.Rows[r - 1].RowID, ColumnID: pws.Columns[2].ColumnID, Address: `C${r}`, RawValue: null, Formula: `=B${r}+10`, FormulaStable: `@CELL(${pws.Rows[r - 1].RowID},${pws.Columns[1].ColumnID})+10` };
            pws.Cells[`D${r}`] = { RowID: pws.Rows[r - 1].RowID, ColumnID: pws.Columns[3].ColumnID, Address: `D${r}`, RawValue: null, Formula: `=C${r}*3`, FormulaStable: `@CELL(${pws.Rows[r - 1].RowID},${pws.Columns[2].ColumnID})*3` };
            pws.Cells[`E${r}`] = { RowID: pws.Rows[r - 1].RowID, ColumnID: pws.Columns[4].ColumnID, Address: `E${r}`, RawValue: null, Formula: `=D${r}-A${r}`, FormulaStable: `@CELL(${pws.Rows[r - 1].RowID},${pws.Columns[3].ColumnID})-@CELL(${pws.Rows[r - 1].RowID},${pws.Columns[0].ColumnID})` };
        }
        engine.EvaluateWorkbook(perfWb);

        const evalSpy = vi.spyOn(
            engine as unknown as { evalAstNode: (...args: unknown[]) => unknown },
            'evalAstNode'
        );
        engine.SetCell(perfWb, pws.SheetID, 'A2500', { Value: 5000 }, true);
        // Only the 4 dependent formula cells in row 2500 (B2500, C2500, D2500, E2500) are topologically evaluated (each has 1 root + 2 binary operands = 3 AST nodes = 12 AST node visits total, vs 30,000 for full sheet)
        expect(evalSpy.mock.calls.length).toBeLessThanOrEqual(20);
        evalSpy.mockRestore();

        const serialized10k = engine.SerializeWorkbook(perfWb);
        expect(pws.Cells['E2500'].ComputedValue).toBe((5000 * 2 + 10) * 3 - 5000);

        const reparsed10k = engine.ParseWorkbook(serialized10k);
        const reserialized10k = engine.SerializeWorkbook(reparsed10k);
        expect(reserialized10k.length).toBeGreaterThan(1000);

        // 7. Blocker 7 & Items 15, 16, 17: RenameWorksheet formula update, whole-column/row ranges, #MJ_ACCESS_DENIED! propagation
        const multiWb = engine.CreateEmptyWorkbook('Multi', ['One', 'Two'], 10, 5);
        engine.SetCell(multiWb, 'Two', 'B2', { Value: 41 }, false);
        engine.SetCell(multiWb, 'One', 'A1', { Formula: '=Two!B2+1' }, true);
        expect(multiWb.Worksheets[0].Cells['A1'].ComputedValue).toBe(42);
        expect(engine.RenameWorksheet(multiWb, 'Two', 'Q1 Revenue')).toBe(true);
        expect(multiWb.Worksheets[0].Cells['A1'].Formula).toBe("='Q1 Revenue'!B2+1");
        expect(multiWb.Worksheets[0].Cells['A1'].ComputedValue).toBe(42);

        // Whole-column A:A and whole-row 2:2 references
        engine.SetCell(multiWb, 'Q1 Revenue', 'B3', { Value: 9 }, true);
        expect(engine.EvaluateFormulaExpression(multiWb, 'Q1 Revenue', '=SUM(B:B)')).toBe(50);
        expect(engine.EvaluateFormulaExpression(multiWb, 'Q1 Revenue', '=SUM(2:2)')).toBe(41);

        // Denied live table propagates #MJ_ACCESS_DENIED! across all table cells and cannot be masked by IFERROR or COUNT
        const deniedProvider = {
            Entities: [
                {
                    ...mockEmpEntity,
                    GetUserPermisions: () => ({ CanRead: false })
                }
            ],
            Queries: [],
            RunView: async () => ({ Success: false, Results: [], TotalRowCount: 0 })
        } as unknown as IMetadataProvider;
        await engine.RefreshLiveTables(liveWb, createMockUser('u-denied', 'Denied', false), deniedProvider);
        expect(lws.Cells['B2'].ComputedValue).toBe('#MJ_ACCESS_DENIED!');
        expect(lws.Cells['C2'].ComputedValue).toBe('#MJ_ACCESS_DENIED!');
        expect(engine.EvaluateFormulaExpression(liveWb, lws.SheetID, '=IFERROR(B2, 0)')).toBe('#MJ_ACCESS_DENIED!');
        expect(engine.EvaluateFormulaExpression(liveWb, lws.SheetID, '=COUNT(B2)')).toBe('#MJ_ACCESS_DENIED!');
        expect(engine.EvaluateFormulaExpression(liveWb, lws.SheetID, '=COUNTA(B2)')).toBe('#MJ_ACCESS_DENIED!');
    });
});
