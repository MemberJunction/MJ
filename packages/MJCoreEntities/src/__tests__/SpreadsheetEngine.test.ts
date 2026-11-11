import { describe, expect, it, beforeEach, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import {
    ColumnIndexToLetter,
    ColumnLetterToIndex,
    CompileSafeUserRegex,
    DecodeUtf8Fallback,
    DocumentFrozenSnapshot,
    EncodeUtf8Fallback,
    FormatCellAddress,
    IsSafeUserRegex,
    ParseCellAddress,
    ParseRangeAddress,
    RegisterSafeRegexBatchSandboxExecutor,
    RegisterSafeRegexSandboxExecutor,
    SafeRegexSearchBatchDetailed,
    SafeRegexSearchDetailed,
    SafeRegexTest,
    SpreadsheetEngine,
    SpreadsheetLiveTableSpec,
    ValidateExtraFilter,
    XlsxOpenXmlAdapter
} from '../custom/SpreadsheetEngine';
import { SlideDeckEngine } from '../custom/SlideDeckEngine';
import {
    ComputeFrozenSnapshotHash,
    DocumentBlockExecutionResult,
    DocumentLiveBlockEngine,
    ValidateFrozenBlockSnapshot
} from '../custom/DocumentLiveBlockEngine';

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

    it('C2: FreezeLiveTable preserves Live mode if HMAC secret is absent and accepts preSignedSnapshot from browser callers', () => {
        const wb = engine.CreateEmptyWorkbook('Freeze C2', ['Data'], 15, 6);
        const ws = wb.Worksheets[0];
        const table: SpreadsheetLiveTableSpec = {
            TableID: 'tbl-deals-c2',
            Title: 'Deals',
            SourceType: 'EntityView',
            EntityName: 'Deals',
            AnchorCell: 'A1',
            IncludeHeaders: true,
            Mode: 'Live'
        };
        ws.LiveTables.push(table);

        const execResult: DocumentBlockExecutionResult = {
            BlockID: table.TableID,
            Kind: 'EntityView',
            Mode: 'Live',
            Success: true,
            Columns: [
                { Name: 'Deal', DisplayName: 'Deal', Type: 'string' },
                { Name: 'Amount', DisplayName: 'Amount', Type: 'number' }
            ],
            Rows: [
                { Deal: 'Acme Renewal', Amount: 12500 },
                { Deal: 'Globex Expansion', Amount: 27500 }
            ],
            TotalRowCount: 2
        };

        // Pre-compute a server-signed snapshot while secret is available
        const serverSignedHash = ComputeFrozenSnapshotHash({
            FrozenAt: '2026-11-10T20:00:00.000Z',
            FrozenByUserID: 'user-1',
            FrozenByUserName: 'Alice',
            Columns: execResult.Columns,
            Rows: execResult.Rows,
            TotalRowCount: 2,
            SecurityWarningAcknowledged: true
        });
        const preSigned: DocumentFrozenSnapshot = {
            FrozenAt: '2026-11-10T20:00:00.000Z',
            FrozenByUserID: 'user-1',
            FrozenByUserName: 'Alice',
            Columns: execResult.Columns,
            Rows: execResult.Rows,
            TotalRowCount: 2,
            SecurityWarningAcknowledged: true,
            SnapshotContentHash: serverSignedHash
        };

        // Simulate browser runtime with NO MJ_FROZEN_BLOCK_HMAC_SECRET
        const prevHmacEnv = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        const prevSnapEnv = process.env.MJ_FROZEN_SNAPSHOT_SECRET;
        delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        delete process.env.MJ_FROZEN_SNAPSHOT_SECRET;
        DocumentLiveBlockEngine.Instance.SetSigningSecret('');
        try {
            expect(() =>
                engine.FreezeLiveTable(wb, ws.SheetID, table.TableID, execResult, { ID: 'user-1', Name: 'Alice' }, true)
            ).toThrow(/MJ_FROZEN_BLOCK_HMAC_SECRET/);

            // Crucial C2 invariant: table.Mode MUST remain 'Live' and FrozenSnapshot untouched when hash signing fails!
            expect(table.Mode).toBe('Live');
            expect(table.FrozenSnapshot ?? null).toBeNull();

            // Passing preSignedSnapshot succeeds in the browser without local HMAC secret!
            const frozen = engine.FreezeLiveTable(
                wb,
                ws.SheetID,
                table.TableID,
                execResult,
                { ID: 'user-1', Name: 'Alice' },
                true,
                preSigned
            );
            expect(frozen.Mode).toBe('Frozen');
            expect(frozen.FrozenSnapshot?.SnapshotContentHash).toBe(serverSignedHash);
            expect(ws.Cells['A2']?.RawValue).toBe('Acme Renewal');
            expect(ws.Cells['B3']?.RawValue).toBe(27500);
        } finally {
            if (prevHmacEnv !== undefined) process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = prevHmacEnv;
            if (prevSnapEnv !== undefined) process.env.MJ_FROZEN_SNAPSHOT_SECRET = prevSnapEnv;
            DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
        }

        // Verify the stored pre-signed snapshot validates cleanly on the server
        expect(ValidateFrozenBlockSnapshot(table.FrozenSnapshot!).Valid).toBe(true);
    });

    it('D1: 15-significant-digit IEEE-754 float normalization fixes decimal identities, criteria/lookups, and step functions without losing 15-digit precision', () => {
        const wb = engine.CreateEmptyWorkbook('Float D1', ['Math'], 20, 10);
        const s = wb.Worksheets[0];

        // Core Excel decimal identities
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=FLOOR(0.3, 0.1)')).toBe(0.3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=CEILING(0.1*3, 0.1)')).toBe(0.3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MOD(0.3, 0.1)')).toBe(0);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MROUND(0.1+0.2, 0.1)')).toBe(0.3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=TRUNC(0.1+0.2, 1)')).toBe(0.3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ROUNDUP(0.1*3, 1)')).toBe(0.3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ROUNDDOWN(0.1+0.2, 1)')).toBe(0.3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=INT((0.1+0.2)*10)')).toBe(3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=ROUND(1.005, 2)')).toBe(1.01);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=0.1+0.2=0.3')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=0.1+0.2<>0.3')).toBe(false);

        // Criteria & lookup functions on a cell holding =0.1+0.2
        engine.SetCell(wb, s.SheetID, 'A1', { Formula: '=0.1+0.2' }, false);
        engine.SetCell(wb, s.SheetID, 'A2', { Value: 0.4 }, false);
        engine.SetCell(wb, s.SheetID, 'B1', { Value: 100 }, false);
        engine.SetCell(wb, s.SheetID, 'B2', { Value: 200 }, false);
        engine.SetCell(wb, s.SheetID, 'C1', { Formula: '=0.1+0.2' }, false);
        engine.SetCell(wb, s.SheetID, 'D1', { Value: 0.4 }, false);
        engine.SetCell(wb, s.SheetID, 'C2', { Value: 'Found03' }, false);
        engine.SetCell(wb, s.SheetID, 'D2', { Value: 'Found04' }, true);

        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIF(A1:A2, 0.3)')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIF(A1:A2, "=0.3")')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIFS(A1:A2, 0.3, B1:B2, 100)')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUMIF(A1:A2, 0.3, B1:B2)')).toBe(100);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUMIFS(B1:B2, A1:A2, 0.3)')).toBe(100);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=AVERAGEIF(A1:A2, 0.3, B1:B2)')).toBe(100);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=AVERAGEIFS(B1:B2, A1:A2, 0.3)')).toBe(100);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MATCH(0.3, A1:A2, 0)')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=XMATCH(0.3, A1:A2, 0)')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=VLOOKUP(0.3, A1:B2, 2, FALSE)')).toBe(100);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=HLOOKUP(0.3, C1:D2, 2, FALSE)')).toBe('Found03');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=XLOOKUP(0.3, A1:A2, B1:B2, "Miss")')).toBe(100);

        // Preserve full 15-significant-digit distinction: 100000000000001 != 1E14 and difference === 1
        engine.SetCell(wb, s.SheetID, 'F1', { Value: 100000000000001 }, false);
        engine.SetCell(wb, s.SheetID, 'F2', { Value: 1e14 }, true);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=F1=F2')).toBe(false);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=F1-F2')).toBe(1);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=MOD(F1, F2)')).toBe(1);
    });

    it('D2 & E7: PatchXlsxBytes preserves shared formulas & array metadata on precedent edits, expands orphaned followers on master edits, and prefixes _xlfn. future functions', () => {
        // Seed a realistic .xlsx archive containing both a shared formula (H2:H5, si="0") and a dynamic-array formula (A1, cm="1", _xlfn.SEQUENCE)
        const baseWb = engine.CreateEmptyWorkbook('SharedAndArray', ['Sheet1'], 10, 10);
        const initialBytes = engine.ExportToXlsxBytes(baseWb, false);

        // Inject shared-formula master + followers and dynamic-array master into xl/worksheets/sheet1.xml via Patch/zip rebuild
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const entries = engine.ExtractZipArchive(initialBytes);

        const customSheet1Xml = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            '<dimension ref="A1:H5"/>',
            '<sheetData>',
            '<row r="1"><c r="A1" cm="1" t="n"><f t="array" ref="A1:A3">_xlfn.SEQUENCE(B1)</f><v>1</v></c><c r="B1" t="n"><v>3</v></c></row>',
            '<row r="2"><c r="G2" t="n"><v>10</v></c><c r="H2" s="1" t="n"><f t="shared" ref="H2:H5" si="0">G2*2</f><v>20</v></c></row>',
            '<row r="3"><c r="G3" t="n"><v>20</v></c><c r="H3" s="1" t="n"><f t="shared" si="0"/><v>40</v></c></row>',
            '<row r="4"><c r="G4" t="n"><v>30</v></c><c r="H4" s="1" t="n"><f t="shared" si="0"/><v>60</v></c></row>',
            '<row r="5"><c r="G5" t="n"><v>40</v></c><c r="H5" s="1" t="n"><f t="shared" si="0"/><v>80</v></c></row>',
            '</sheetData>',
            '</worksheet>'
        ].join('');
        entries.set('xl/worksheets/sheet1.xml', encoder.encode(customSheet1Xml));
        const seededXlsx = engine.BuildZipArchive(
            Array.from(entries.entries()).map(([Name, Data]) => ({ Name, Data }))
        );

        // Case A: Edit precedent G2 (10 -> 100) and B1 (3 -> 4) WITHOUT editing H2's or A1's formula
        const importedA = engine.ImportFromXlsxBytes(seededXlsx);
        expect(importedA.Worksheets[0].Cells['A1']?.Formula).toBe('=SEQUENCE(B1)');
        engine.SetCell(importedA, 'Sheet1', 'G2', { Value: 100 }, true);
        engine.SetCell(importedA, 'Sheet1', 'B1', { Value: 4 }, true);
        expect(importedA.Worksheets[0].Cells['H2']?.ComputedValue).toBe(200);

        const patchedBytesA = engine.PatchXlsxBytes(seededXlsx, importedA);
        const patchedEntriesA = engine.ExtractZipArchive(patchedBytesA);
        const xmlA = decoder.decode(patchedEntriesA.get('xl/worksheets/sheet1.xml')!);

        // Master <f t="shared" ref="H2:H5" si="0">G2*2</f> and followers MUST be preserved verbatim, with <v>200</v> updated!
        expect(xmlA).toContain('<f t="shared" ref="H2:H5" si="0">G2*2</f><v>200</v>');
        expect(xmlA).toContain('<f t="shared" si="0"/><v>40</v>');
        // Array metadata cm="1", t="array" ref="A1:A3", and _xlfn.SEQUENCE(B1) preserved!
        expect(xmlA).toContain('cm="1"');
        expect(xmlA).toContain('<f t="array" ref="A1:A3">_xlfn.SEQUENCE(B1)</f>');

        // Case B: Explicitly overwrite shared master H2 with a literal (999) AND edit A1 to a new dynamic-array formula + add XLOOKUP in C2
        const importedB = engine.ImportFromXlsxBytes(seededXlsx);
        engine.SetCell(importedB, 'Sheet1', 'H2', { Value: 999 }, true);
        engine.SetCell(importedB, 'Sheet1', 'A1', { Formula: '=SEQUENCE(5, 1, 10)' }, true);
        engine.SetCell(importedB, 'Sheet1', 'C2', { Formula: '=XLOOKUP(20, G2:G5, H2:H5)' }, true);

        const patchedBytesB = engine.PatchXlsxBytes(seededXlsx, importedB);
        const patchedEntriesB = engine.ExtractZipArchive(patchedBytesB);
        const xmlB = decoder.decode(patchedEntriesB.get('xl/worksheets/sheet1.xml')!);

        // Zero orphaned shared-formula tags may remain for si="0", and H3:H5 must have explicit translated formulas!
        expect(xmlB).not.toContain('t="shared"');
        expect(xmlB).toContain('<f>G3*2</f><v>40</v>');
        expect(xmlB).toContain('<f>G4*2</f><v>60</v>');
        expect(xmlB).toContain('<f>G5*2</f><v>80</v>');
        // Newly edited future functions get _xlfn. prefix in both PatchXlsxBytes and ExportToXlsxBytes, and A1 keeps cm="1" + t="array" with updated non-stale ref="A1" while omitting <v>#NAME?</v>!
        expect(xmlB).toContain('cm="1"');
        expect(xmlB).toContain('<f t="array" ref="A1">_xlfn.SEQUENCE(5, 1, 10)</f></c>');
        expect(xmlB).not.toContain('#NAME?');
        expect(xmlB).toContain('<f>_xlfn.XLOOKUP(20, G2:G5, H2:H5)</f><v>40</v>');

        const freshExportBytes = engine.ExportToXlsxBytes(importedB, false);
        const freshEntries = engine.ExtractZipArchive(freshExportBytes);
        const freshXml = decoder.decode(freshEntries.get('xl/worksheets/sheet1.xml')!);
        expect(freshXml).toContain('<f>_xlfn.XLOOKUP(20, G2:G5, H2:H5)</f>');
        expect(freshXml).not.toContain('#NAME?');
    });

    it('E6 & RenameWorksheet: supports whole-column/whole-row stable refs across rename & insert/delete, recalculates beyond row 25, rejects duplicate/empty names, and quotes boolean/R1C1 sheet names', () => {
        const wb = engine.CreateEmptyWorkbook('WholeRefs', ['Summary', 'Two'], 25, 12);
        engine.SetCell(wb, 'Two', 'A2', { Value: 10 }, false);
        engine.SetCell(wb, 'Two', 'A10', { Value: 25 }, false);
        engine.SetCell(wb, 'Two', 'C3', { Value: 7 }, false);
        engine.SetCell(wb, 'Summary', 'B1', { Formula: '=SUM(Two!A:A)' }, false);
        engine.SetCell(wb, 'Summary', 'B2', { Formula: '=SUM(Two!3:3)' }, true);

        expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe(35);
        expect(wb.Worksheets[0].Cells['B2']?.ComputedValue).toBe(7);

        // RenameWorksheet validation: reject empty and duplicate / case-colliding names
        expect(engine.RenameWorksheet(wb, 'Two', '   ')).toBe(false);
        expect(engine.RenameWorksheet(wb, 'Two', 'summary')).toBe(false);

        // Rename Two -> Renamed updates whole-column and whole-row cross-sheet refs without #REF!
        expect(engine.RenameWorksheet(wb, 'Two', 'Renamed')).toBe(true);
        expect(wb.Worksheets[0].Cells['B1']?.Formula).toBe('=SUM(Renamed!A:A)');
        expect(wb.Worksheets[0].Cells['B2']?.Formula).toBe('=SUM(Renamed!3:3)');
        expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe(35);

        // Insert column at A on Renamed shifts A:A -> B:B; insert row at 1 shifts 3:3 -> 4:4
        engine.InsertColumns(wb, 'Renamed', 1, 1);
        expect(wb.Worksheets[0].Cells['B1']?.Formula).toBe('=SUM(Renamed!B:B)');
        expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe(35);

        engine.InsertRows(wb, 'Renamed', 1, 1);
        expect(wb.Worksheets[0].Cells['B2']?.Formula).toBe('=SUM(Renamed!4:4)');
        expect(wb.Worksheets[0].Cells['B2']?.ComputedValue).toBe(7);

        // Whole-column =SUM(A:A) on Summary invalidates/recalculates when cells beyond row 25 (A50, A200) are edited!
        engine.SetCell(wb, 'Summary', 'D1', { Formula: '=SUM(A:A)' }, true);
        expect(wb.Worksheets[0].Cells['D1']?.ComputedValue).toBe(0);
        engine.SetCell(wb, 'Summary', 'A50', { Value: 120 }, true);
        expect(wb.Worksheets[0].Cells['D1']?.ComputedValue).toBe(120);
        engine.SetCell(wb, 'Summary', 'A200', { Value: 80 }, true);
        expect(wb.Worksheets[0].Cells['D1']?.ComputedValue).toBe(200);

        // Sheet quoting for boolean literals (TRUE / FALSE) and R1C1-style tokens (R1C1)
        expect(engine.RenameWorksheet(wb, 'Renamed', 'TRUE')).toBe(true);
        expect(wb.Worksheets[0].Cells['B1']?.Formula).toBe("=SUM('TRUE'!B:B)");
        expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe(35);

        expect(engine.RenameWorksheet(wb, 'TRUE', 'R1C1')).toBe(true);
        expect(wb.Worksheets[0].Cells['B1']?.Formula).toBe("=SUM('R1C1'!B:B)");
        expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe(35);
    });

    it('E8: IsSafeUserRegex rejects polynomial and exponential backtracking patterns and SafeRegexTest finishes in < 20ms on 5,000-char adversarial input', () => {
        expect(IsSafeUserRegex('\\d+\\d+\\d+$')).toBe(false);
        expect(IsSafeUserRegex('\\d+\\s*\\d+$')).toBe(false);
        expect(IsSafeUserRegex('\\w+.*\\w+$')).toBe(false);
        expect(IsSafeUserRegex('(a+)+$')).toBe(false);
        expect(IsSafeUserRegex('(a|a)*$')).toBe(false);
        expect(IsSafeUserRegex('(a+)\\1$')).toBe(false);
        expect(IsSafeUserRegex('(a|aa)'.repeat(12) + '$')).toBe(false);

        // Benign anchored & delimited patterns remain allowed
        expect(IsSafeUserRegex('^\\d+-\\d+-\\d+$')).toBe(true);
        expect(IsSafeUserRegex('^\\d+(\\.\\d+)?$')).toBe(true);
        expect(IsSafeUserRegex('foo.*bar')).toBe(true);
        expect(IsSafeUserRegex('^[^/]+/[^/]+$')).toBe(true);

        const adversarial = '1'.repeat(5000) + 'a';
        const startMs = performance.now();
        expect(CompileSafeUserRegex('\\d+\\d+\\d+$')).toBeNull();
        const safeCompiled = CompileSafeUserRegex('^\\d+(\\.\\d+)?$');
        expect(safeCompiled).not.toBeNull();
        expect(SafeRegexTest(safeCompiled!, adversarial)).toBe(false);
        const elapsedMs = performance.now() - startMs;
        expect(elapsedMs).toBeLessThan(20);

        // Linear two-pointer Excel wildcard matching finishes in < 20ms on multi-star adversarial text
        const wcWb = engine.CreateEmptyWorkbook('Wildcard ReDoS', ['Data'], 5, 3);
        const wcWs = wcWb.Worksheets[0];
        engine.SetCell(wcWb, wcWs.SheetID, 'A1', { Value: '1'.repeat(5000) + 'b' }, false);
        engine.SetCell(wcWb, wcWs.SheetID, 'B1', { Value: 'Found' }, true);
        const wcStartMs = performance.now();
        expect(engine.EvaluateFormulaExpression(wcWb, wcWs.SheetID, '=VLOOKUP("*1*1*1*1*a", A1:B1, 2, FALSE)')).toBe('#N/A');
        expect(performance.now() - wcStartMs).toBeLessThan(20);
    });

    it('Low: deterministic non-wall-clock SerializeWorkbook and ParseWorkbook sparse 1,000-row structural fidelity', () => {
        const wb = engine.CreateEmptyWorkbook('Sparse 1000', ['Ledger'], 1000, 12);
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Value: 'Account', Style: { Bold: true } }, false);
        engine.SetCell(wb, ws.SheetID, 'B1', { Value: 'Amount', Style: { Bold: true } }, false);
        const populatedRows = [2, 150, 400, 750, 999];
        for (let i = 0; i < populatedRows.length; i++) {
            const r = populatedRows[i];
            engine.SetCell(wb, ws.SheetID, `A${r}`, { Value: `Acct-${r}` }, false);
            engine.SetCell(wb, ws.SheetID, `B${r}`, { Value: (i + 1) * 100, Style: { FormatType: 'currency' } }, false);
        }
        engine.SetCell(wb, ws.SheetID, 'A1000', { Value: 'Total', Style: { Bold: true } }, false);
        engine.SetCell(wb, ws.SheetID, 'B1000', { Formula: '=SUM(B2:B999)', Style: { FormatType: 'currency', Bold: true } }, true);
        wb.NamedRanges.push({ Name: 'LedgerTotal', SheetID: ws.SheetID, Range: 'B1000' });

        // Deterministic sparse cell map invariant: 14 populated cells, NOT 1000 * 12 = 12,000 dense cells
        expect(Object.keys(ws.Cells)).toHaveLength(14);
        const revBefore = engine.ComputeRevisionHash(wb);

        const json = engine.SerializeWorkbook(wb);
        const parsed = engine.ParseWorkbook(json);
        const parsedWs = parsed.Worksheets[0];

        expect(parsedWs.Rows).toHaveLength(1000);
        expect(parsedWs.Columns).toHaveLength(12);
        expect(Object.keys(parsedWs.Cells)).toHaveLength(14);
        expect(parsedWs.Cells['B1000']?.Formula).toBe('=SUM(B2:B999)');
        expect(parsedWs.Cells['B1000']?.FormulaStable).toBe(ws.Cells['B1000']?.FormulaStable);
        expect(parsedWs.Cells['B1000']?.ComputedValue).toBe(1500);
        expect(parsedWs.Cells['B1000']?.Style?.FormatType).toBe('currency');
        expect(parsed.NamedRanges).toEqual([{ Name: 'LedgerTotal', SheetID: ws.SheetID, Range: 'B1000' }]);
        expect(engine.ComputeRevisionHash(parsed)).toBe(revBefore);
    });

    it('R5-5 & OOXML Polish: dynamic-array spill functions return honest #NAME?, omit <v>#NAME?</v> on .xlsx export/patch, emit _xlfn._xlws.SORT/FILTER + _xlfn.IFNA/DAYS, and preserve CSE t="array"', () => {
        const wb = engine.CreateEmptyWorkbook('R5 Array & OOXML', ['Sheet1'], 10, 8);
        const s = wb.Worksheets[0];
        engine.SetCell(wb, s.SheetID, 'A1', { Value: 30 }, false);
        engine.SetCell(wb, s.SheetID, 'A2', { Value: 10 }, false);
        engine.SetCell(wb, s.SheetID, 'A3', { Value: 20 }, false);
        engine.SetCell(wb, s.SheetID, 'B1', { Value: 1 }, false);
        engine.SetCell(wb, s.SheetID, 'B2', { Value: 0 }, false);
        engine.SetCell(wb, s.SheetID, 'B3', { Value: 1 }, true);

        // Unimplemented dynamic-array functions must return honest #NAME? (never silent wrong numbers!)
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SEQUENCE(3)')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUM(SEQUENCE(3))')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SORT(A1:A3, 1, -1)')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SORTBY(A1:A3, B1:B3)')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=FILTER(A1:A3, B1:B3=1)')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=UNIQUE(A1:A3)')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=RANDARRAY()')).toBe('#NAME?');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=LET(x, 5, x + 1)')).toBe('#NAME?');

        // Accurate scalar future functions keep working and round-trip with _xlfn.IFNA and _xlfn.DAYS
        engine.SetCell(wb, s.SheetID, 'D1', { Formula: '=IFNA(VLOOKUP(999, A1:B3, 2, FALSE), 42)' }, false);
        engine.SetCell(wb, s.SheetID, 'D2', { Formula: '=DAYS(DATE(2026, 1, 15), DATE(2026, 1, 5))' }, false);
        engine.SetCell(wb, s.SheetID, 'D3', { Formula: '=SORT(A1:A3, 1, -1)' }, false);
        engine.SetCell(wb, s.SheetID, 'D4', { Formula: '=FILTER(A1:A3, B1:B3=1)' }, true);

        expect(s.Cells['D1']?.ComputedValue).toBe(42);
        expect(s.Cells['D2']?.ComputedValue).toBe(10);
        expect(s.Cells['D3']?.ComputedValue).toBe('#NAME?');
        expect(s.Cells['D4']?.ComputedValue).toBe('#NAME?');

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const exported = engine.ExportToXlsxBytes(wb, false);
        const exportedFiles = engine.ExtractZipArchive(exported);
        const sheetXml = decoder.decode(exportedFiles.get('xl/worksheets/sheet1.xml')!);

        expect(sheetXml).toContain('<f>_xlfn.IFNA(VLOOKUP(999, A1:B3, 2, FALSE), 42)</f><v>42</v>');
        expect(sheetXml).toContain('<f>_xlfn.DAYS(DATE(2026, 1, 15), DATE(2026, 1, 5))</f><v>10</v>');
        expect(sheetXml).toContain('<c r="D3" cm="1"><f t="array" ref="D3">_xlfn._xlws.SORT(A1:A3, 1, -1)</f></c>');
        expect(sheetXml).toContain('<c r="D4" cm="1"><f t="array" ref="D4">_xlfn._xlws.FILTER(A1:A3, B1:B3=1)</f></c>');
        expect(sheetXml).not.toContain('#NAME?');
        expect(exportedFiles.has('xl/metadata.xml')).toBe(true);

        // Re-import strips _xlfn._xlws. and _xlfn. cleanly
        const reimported = engine.ImportFromXlsxBytes(exported);
        const rs = reimported.Worksheets[0];
        expect(rs.Cells['D1']?.Formula).toBe('=IFNA(VLOOKUP(999, A1:B3, 2, FALSE), 42)');
        expect(rs.Cells['D1']?.ComputedValue).toBe(42);
        expect(rs.Cells['D2']?.Formula).toBe('=DAYS(DATE(2026, 1, 15), DATE(2026, 1, 5))');
        expect(rs.Cells['D2']?.ComputedValue).toBe(10);
        expect(rs.Cells['D3']?.Formula).toBe('=SORT(A1:A3, 1, -1)');
        expect(rs.Cells['D4']?.Formula).toBe('=FILTER(A1:A3, B1:B3=1)');

        // Legacy CSE formula (<f t="array" ref="E1:E3">SUM(A1:A3)</f> without cm="1") preserves t="array" ref="E1:E3" on edit!
        const cseSheetXml = sheetXml.replace(
            '</sheetData>',
            '<row r="9"><c r="E9" t="n"><f t="array" ref="E9:E10">SUM(A1:A2)</f><v>40</v></c></row></sheetData>'
        );
        exportedFiles.set('xl/worksheets/sheet1.xml', encoder.encode(cseSheetXml));
        const cseSeedBytes = engine.BuildZipArchive(
            Array.from(exportedFiles.entries()).map(([Name, Data]) => ({ Name, Data }))
        );
        const cseWb = engine.ImportFromXlsxBytes(cseSeedBytes);
        engine.SetCell(cseWb, 'Sheet1', 'E9', { Formula: '=SUM(A1:A3)' }, false);
        engine.SetCell(cseWb, 'Sheet1', 'F9', { Formula: '=SEQUENCE(4)' }, true);
        const csePatchedBytes = engine.PatchXlsxBytes(cseSeedBytes, cseWb);
        const csePatchedXml = decoder.decode(engine.ExtractZipArchive(csePatchedBytes).get('xl/worksheets/sheet1.xml')!);
        expect(csePatchedXml).toContain('<c r="E9" t="n"><f t="array" ref="E9:E10">SUM(A1:A3)</f><v>60</v></c>');
        expect(csePatchedXml).toContain('<c r="F9" cm="1"><f t="array" ref="F9">_xlfn.SEQUENCE(4)</f></c>');
        expect(csePatchedXml).not.toContain('#NAME?');
    });

    it('R5-8: CheckStartupSecrets and ResolveSigningSecret treat empty and whitespace-only env vars identically as unset', () => {
        const liveBlockEngine = DocumentLiveBlockEngine.Instance;
        const origSecret = liveBlockEngine.GetSigningSecret();
        const origHmac = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        const origSnap = process.env.MJ_FROZEN_SNAPSHOT_SECRET;
        try {
            liveBlockEngine.SetSigningSecret('   ');
            expect(liveBlockEngine.GetSigningSecret()).toBeNull();

            process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = '';
            delete process.env.MJ_FROZEN_SNAPSHOT_SECRET;
            const emptyStatus = liveBlockEngine.CheckStartupSecrets();
            expect(emptyStatus.FrozenBlockSecretConfigured).toBe(false);
            expect(emptyStatus.Warnings.length).toBeGreaterThan(0);
            expect(liveBlockEngine.ResolveSigningSecret()).toBeNull();

            process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = '   \t  ';
            const wsStatus = liveBlockEngine.CheckStartupSecrets();
            expect(wsStatus.FrozenBlockSecretConfigured).toBe(false);
            expect(wsStatus.Warnings.length).toBeGreaterThan(0);
            expect(liveBlockEngine.ResolveSigningSecret()).toBeNull();

            // Whitespace MJ_FROZEN_BLOCK_HMAC_SECRET falls through cleanly to valid 32+ byte MJ_FROZEN_SNAPSHOT_SECRET
            const validFallback = '0123456789abcdef0123456789abcdef_valid_secret';
            process.env.MJ_FROZEN_SNAPSHOT_SECRET = validFallback;
            const fallbackStatus = liveBlockEngine.CheckStartupSecrets();
            expect(fallbackStatus.FrozenBlockSecretConfigured).toBe(true);
            expect(fallbackStatus.Warnings).toHaveLength(0);
            expect(liveBlockEngine.ResolveSigningSecret()).toBe(validFallback);
        } finally {
            liveBlockEngine.SetSigningSecret(origSecret);
            if (origHmac === undefined) delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
            else process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = origHmac;
            if (origSnap === undefined) delete process.env.MJ_FROZEN_SNAPSHOT_SECRET;
            else process.env.MJ_FROZEN_SNAPSHOT_SECRET = origSnap;
        }
    });

    it('R5 Regex & =SEARCH: allows pairwise-disjoint quantified alternations, preserves ^/$ anchors without window slicing, and evaluates adversarial =SEARCH in < 20ms', () => {
        // Disjoint quantified alternations are safe O(N)
        expect(IsSafeUserRegex('(a|b)*c')).toBe(true);
        expect(IsSafeUserRegex('(foo|bar)+')).toBe(true);
        expect(IsSafeUserRegex('^(cat|dog|fish)+$')).toBe(true);

        // Overlapping / ambiguous quantified alternations are rejected
        expect(IsSafeUserRegex('(a|a)*$')).toBe(false);
        expect(IsSafeUserRegex('(a|aa)+$')).toBe(false);
        expect(IsSafeUserRegex('(ab|a)*$')).toBe(false);
        expect(IsSafeUserRegex('(\\d|[0-9])+$')).toBe(false);
        expect(IsSafeUserRegex('(a|A)+$', 'i')).toBe(false);
        expect(IsSafeUserRegex('(a|aa)'.repeat(12) + '$')).toBe(false);

        // SafeRegexTest must NEVER slice windows and corrupt ^ / $ anchors!
        const digitsOnlyRx = CompileSafeUserRegex('^\\d+$');
        expect(digitsOnlyRx).not.toBeNull();
        expect(SafeRegexTest(digitsOnlyRx!, '1'.repeat(2000) + 'x' + '1'.repeat(2000))).toBe(false);
        expect(SafeRegexTest(digitsOnlyRx!, '1'.repeat(4000))).toBe(true);

        // =SEARCH linear DP wildcard matcher handles * / ? / ~ escapes and runs in < 20ms on adversarial inputs
        const wb = engine.CreateEmptyWorkbook('SearchDP', ['Sheet1'], 5, 3);
        const s = wb.Worksheets[0];
        engine.SetCell(wb, s.SheetID, 'A1', { Value: 'a'.repeat(4000) }, false);
        engine.SetCell(wb, s.SheetID, 'A2', { Value: 'a'.repeat(1000) }, true);

        const t0 = performance.now();
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SEARCH("*?*x", A1)')).toBe('#VALUE!');
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SEARCH("*?*?*x", A2)')).toBe('#VALUE!');
        expect(performance.now() - t0).toBeLessThan(20);

        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SEARCH("a*b?c", "zzaxxxbyczz")')).toBe(3);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SEARCH("~*a~?", "foo*A?bar")')).toBe(4);
    });

    it('R5 Sparse Whole-Row, ValidateExtraFilter & ZIP DOS Date: =SUM(1:1048576) runs in < 20ms with compact JSON, identifier columns pass, and ZIP modDate is 0x0021', () => {
        const wb = engine.CreateEmptyWorkbook('SparseWholeRow', ['Sheet1'], 25, 10);
        const s = wb.Worksheets[0];
        engine.SetCell(wb, s.SheetID, 'B2', { Value: 125 }, false);
        engine.SetCell(wb, s.SheetID, 'F15', { Value: 375 }, false);

        const t0 = performance.now();
        engine.SetCell(wb, s.SheetID, 'A1', { Formula: '=SUM(2:1048576)' }, true);
        expect(s.Cells['A1']?.ComputedValue).toBe(500);
        expect(engine.EvaluateFormulaExpression(wb, s.SheetID, '=SUM(1:1048576)')).toBe(1000);
        expect(performance.now() - t0).toBeLessThan(20);

        // Dense sheet.Rows must NOT balloon to 1,048,576!
        expect(s.Rows.length).toBeLessThanOrEqual(25);
        const serialized = engine.SerializeWorkbook(wb);
        expect(serialized.length).toBeLessThan(100_000);

        // ValidateExtraFilter allows identifier column names APP_NAME / USER_NAME while blocking SQL functions & niladic tokens
        expect(ValidateExtraFilter("APP_NAME = 'Portal'")).toEqual({
            Valid: true,
            NormalizedFilter: "APP_NAME = 'Portal'"
        });
        expect(ValidateExtraFilter("USER_NAME = 'alice' AND APP_NAME = 'Admin'")).toEqual({
            Valid: true,
            NormalizedFilter: "USER_NAME = 'alice' AND APP_NAME = 'Admin'"
        });
        expect(ValidateExtraFilter("USER_NAME() = 'dbo'").Valid).toBe(false);
        expect(ValidateExtraFilter("USER_NAME() = 'dbo'").AccessDenied).toBe(true);
        expect(ValidateExtraFilter('APP_NAME()').Valid).toBe(false);
        expect(ValidateExtraFilter("@@VERSION = '1'").Valid).toBe(false);
        expect(ValidateExtraFilter('Name = SYSTEM_USER').Valid).toBe(false);
        expect(ValidateExtraFilter('SYSTEM_USER').Valid).toBe(false);

        // ZIP local file header MS-DOS modDate at byte offset 12 must be valid 0x0021 (1980-01-01), NOT 0x2100
        const xlsxBytes = engine.ExportToXlsxBytes(wb, false);
        const dv = new DataView(xlsxBytes.buffer, xlsxBytes.byteOffset, xlsxBytes.byteLength);
        expect(dv.getUint32(0, true)).toBe(0x04034b50);
        expect(dv.getUint16(12, true)).toBe(0x0021);
    });

    it('R6-5: preserves all rows > 10,000 and columns > 512 across InsertRows/InsertColumns and SerializeWorkbook -> ParseWorkbook without #REF!', () => {
        // 1. Exact AN-BC reproduction: Fill A1:A10000, B1=A10000, C1=SUM(A9998:A10000), InsertRows(5, 3), SerializeWorkbook -> ParseWorkbook
        const wb = engine.CreateEmptyWorkbook('LargeRowsRepro', ['Sheet1'], 10_000, 5);
        const s = wb.Worksheets[0];
        for (let r = 1; r <= 10_000; r++) {
            const rSpec = s.Rows[r - 1];
            const cSpec = s.Columns[0];
            const addr = `A${r}`;
            s.Cells[addr] = {
                RowID: rSpec.RowID,
                ColumnID: cSpec.ColumnID,
                Address: addr,
                RawValue: r,
                Formula: null,
                FormulaStable: null,
                ComputedValue: r,
                DisplayValue: String(r)
            };
        }
        engine.SetCell(wb, s.SheetID, 'B1', { Formula: '=A10000' }, false);
        engine.SetCell(wb, s.SheetID, 'C1', { Formula: '=SUM(A9998:A10000)' }, true);
        expect(s.Cells['B1']?.ComputedValue).toBe(10_000);
        expect(s.Cells['C1']?.ComputedValue).toBe(29_997);

        engine.InsertRows(wb, s.SheetID, 5, 3);
        expect(s.Rows.length).toBe(10_003);
        expect(s.Cells['B1']?.Formula).toBe('=A10003');
        expect(s.Cells['C1']?.Formula).toBe('=SUM(A10001:A10003)');

        const json = engine.SerializeWorkbook(wb);
        const reloaded = engine.ParseWorkbook(json);
        const rs = reloaded.Worksheets[0];
        expect(rs.Rows.length).toBe(10_003);
        expect(rs.Cells['B1']?.Formula).toBe('=A10003');
        expect(rs.Cells['B1']?.ComputedValue).toBe(10_000);
        expect(rs.Cells['C1']?.Formula).toBe('=SUM(A10001:A10003)');
        expect(rs.Cells['C1']?.ComputedValue).toBe(29_997);

        // 2. Workbook with 15,000 rows and 600 columns + InsertRows + InsertColumns + SerializeWorkbook -> ParseWorkbook
        const wbLarge = engine.CreateEmptyWorkbook('Sheet15k600', ['Data'], 15_000, 600);
        const wsLarge = wbLarge.Worksheets[0];
        const col600Letter = ColumnIndexToLetter(600); // WB
        engine.SetCell(wbLarge, wsLarge.SheetID, 'A14999', { Value: 111 }, false);
        engine.SetCell(wbLarge, wsLarge.SheetID, 'A15000', { Value: 222 }, false);
        engine.SetCell(wbLarge, wsLarge.SheetID, `${col600Letter}15000`, { Value: 777 }, false);
        engine.SetCell(wbLarge, wsLarge.SheetID, 'B1', { Formula: '=A15000' }, false);
        engine.SetCell(wbLarge, wsLarge.SheetID, 'C1', { Formula: `=${col600Letter}15000` }, false);
        engine.SetCell(wbLarge, wsLarge.SheetID, 'D1', { Formula: '=SUM(A14999:A15000)' }, true);

        engine.InsertRows(wbLarge, wsLarge.SheetID, 10, 4);
        engine.InsertColumns(wbLarge, wsLarge.SheetID, 5, 2);
        const col602Letter = ColumnIndexToLetter(602); // WD

        const reloadedLarge = engine.ParseWorkbook(engine.SerializeWorkbook(wbLarge));
        const rwsLarge = reloadedLarge.Worksheets[0];
        expect(rwsLarge.Rows.length).toBe(15_004);
        expect(rwsLarge.Columns.length).toBe(602);
        // Note: B1..D1 shifted right by 2 columns when 2 columns were inserted at column 5 (E)? No, B..D are cols 2..4 < 5, so they stay at B1..D1!
        expect(rwsLarge.Cells['B1']?.Formula).toBe('=A15004');
        expect(rwsLarge.Cells['B1']?.ComputedValue).toBe(222);
        expect(rwsLarge.Cells['C1']?.Formula).toBe(`=${col602Letter}15004`);
        expect(rwsLarge.Cells['C1']?.ComputedValue).toBe(777);
        expect(rwsLarge.Cells['D1']?.Formula).toBe('=SUM(A15003:A15004)');
        expect(rwsLarge.Cells['D1']?.ComputedValue).toBe(333);
    });

    it('R6-10: deleting a row or column that started out virtual (and stayed virtual or materialized later) emits #REF! and clamps partial ranges', () => {
        // Repro 1 (AN-BC): 25-row sheet -> B1="=A50" -> fill rows 26..60 (A50=5000, A51=5100) -> DeleteRows(50, 1) -> #REF!
        const wb1 = engine.CreateEmptyWorkbook('VirtRowMat', ['Sheet1'], 25, 5);
        const s1 = wb1.Worksheets[0];
        engine.SetCell(wb1, s1.SheetID, 'B1', { Formula: '=A50' }, false);
        for (let r = 26; r <= 60; r++) {
            engine.SetCell(wb1, s1.SheetID, `A${r}`, { Value: r * 100 }, false);
        }
        engine.EvaluateWorkbook(wb1);
        expect(s1.Cells['B1']?.ComputedValue).toBe(5000);

        engine.DeleteRows(wb1, s1.SheetID, 50, 1);
        expect(s1.Cells['B1']?.Formula).toBe('=#REF!');
        expect(s1.Cells['B1']?.ComputedValue).toBe('#REF!');

        // Repro 2 (AN-BC): 25-row sheet -> B1="=A25" -> DeleteRows(20, 11) -> #REF!, plus pure virtual DeleteRows & range clamping
        const wb2 = engine.CreateEmptyWorkbook('VirtRowSpan', ['Sheet1'], 25, 5);
        const s2 = wb2.Worksheets[0];
        engine.SetCell(wb2, s2.SheetID, 'A24', { Value: 10 }, false);
        engine.SetCell(wb2, s2.SheetID, 'A25', { Value: 25 }, false);
        engine.SetCell(wb2, s2.SheetID, 'B1', { Formula: '=A25' }, false);
        engine.SetCell(wb2, s2.SheetID, 'C1', { Formula: '=A50' }, false);
        engine.SetCell(wb2, s2.SheetID, 'D1', { Formula: '=A55' }, false);
        engine.SetCell(wb2, s2.SheetID, 'E1', { Formula: '=SUM(A20:A50)' }, true);

        engine.DeleteRows(wb2, s2.SheetID, 50, 2);
        expect(s2.Cells['C1']?.Formula).toBe('=#REF!');
        expect(s2.Cells['C1']?.ComputedValue).toBe('#REF!');
        expect(s2.Cells['D1']?.Formula).toBe('=A53');
        expect(s2.Cells['E1']?.Formula).toBe('=SUM(A20:A49)');

        engine.DeleteRows(wb2, s2.SheetID, 20, 11);
        expect(s2.Cells['B1']?.Formula).toBe('=#REF!');
        expect(s2.Cells['B1']?.ComputedValue).toBe('#REF!');

        // Column equivalent: 12-col sheet -> B1="=Z1" -> fill cols 13..30 (Z1=900, AA1=901) -> DeleteColumns(26, 1) -> #REF!
        const wbCol = engine.CreateEmptyWorkbook('VirtColMat', ['Sheet1'], 10, 12);
        const sCol = wbCol.Worksheets[0];
        engine.SetCell(wbCol, sCol.SheetID, 'B1', { Formula: '=Z1' }, false);
        engine.SetCell(wbCol, sCol.SheetID, 'B2', { Formula: '=AF1' }, false);
        engine.SetCell(wbCol, sCol.SheetID, 'B3', { Formula: '=SUM(M1:AF1)' }, false);
        for (let c = 13; c <= 30; c++) {
            engine.SetCell(wbCol, sCol.SheetID, `${ColumnIndexToLetter(c)}1`, { Value: c * 10 }, false);
        }
        engine.EvaluateWorkbook(wbCol);
        expect(sCol.Cells['B1']?.ComputedValue).toBe(260);

        engine.DeleteColumns(wbCol, sCol.SheetID, 26, 1); // Delete Z (promoted to real ColumnSpec)
        expect(sCol.Cells['B1']?.Formula).toBe('=#REF!');
        expect(sCol.Cells['B1']?.ComputedValue).toBe('#REF!');
        // AF was col 32 -> shifted to AE (col 31, still virtual since cols grew to 30 -> 29)
        expect(sCol.Cells['B2']?.Formula).toBe('=AE1');
        expect(sCol.Cells['B3']?.Formula).toBe('=SUM(M1:AE1)');

        // Now delete pure-virtual col 31 (AE)
        engine.DeleteColumns(wbCol, sCol.SheetID, 31, 1);
        expect(sCol.Cells['B2']?.Formula).toBe('=#REF!');
        expect(sCol.Cells['B2']?.ComputedValue).toBe('#REF!');
        expect(sCol.Cells['B3']?.Formula).toBe('=SUM(M1:AD1)');
    });

    it('R6-6: SafeRegexSearchDetailed enforces time bound (< 50ms) on 64 KB adversarial inputs, preserves ^/$ anchors, and flags > 64 KB inputs', () => {
        expect(IsSafeUserRegex('(a|b)*c')).toBe(true);
        expect(IsSafeUserRegex('\\d+y')).toBe(true);
        expect(IsSafeUserRegex('\\s*\\w+\\s*$')).toBe(true);

        const rxDigitsY = CompileSafeUserRegex('\\d+y')!;
        const rxDisjointPlus = CompileSafeUserRegex('(a|b)+c')!;
        const rxAdjSpaces = CompileSafeUserRegex('\\s*\\w+\\s*$')!;

        const input64kOnes = '1'.repeat(65_536);
        const t1 = performance.now();
        const res1 = SafeRegexSearchDetailed(rxDigitsY, input64kOnes, 20, 65_536);
        const dt1 = performance.now() - t1;
        expect(res1.Matched).toBe(false);
        expect(dt1).toBeLessThan(50);

        const input64kAs = 'a'.repeat(65_536);
        const t2 = performance.now();
        const res2 = SafeRegexSearchDetailed(rxDisjointPlus, input64kAs, 20, 65_536);
        const dt2 = performance.now() - t2;
        expect(res2.Matched).toBe(false);
        expect(dt2).toBeLessThan(50);

        const inputSpacesAExcl = ' '.repeat(32_768) + 'a'.repeat(32_767) + '!';
        const t3 = performance.now();
        const res3 = SafeRegexSearchDetailed(rxAdjSpaces, inputSpacesAExcl, 20, 65_536);
        const dt3 = performance.now() - t3;
        expect(res3.Matched).toBe(false);
        expect(dt3).toBeLessThan(50);

        const inputAsExcl = 'a'.repeat(65_535) + '!';
        const t4 = performance.now();
        const res4 = SafeRegexSearchDetailed(rxAdjSpaces, inputAsExcl, 20, 65_536);
        const dt4 = performance.now() - t4;
        expect(res4.Matched).toBe(false);
        expect(dt4).toBeLessThan(50);

        // Anchor accuracy across window boundaries
        const rxEnd = CompileSafeUserRegex('end$')!;
        expect(SafeRegexSearchDetailed(rxEnd, 'end of first window ' + 'x'.repeat(600) + ' more text').Matched).toBe(false);
        expect(SafeRegexSearchDetailed(rxEnd, 'x'.repeat(600) + ' at the end').Matched).toBe(true);

        const rxStart = CompileSafeUserRegex('^begin')!;
        expect(SafeRegexSearchDetailed(rxStart, 'begin ' + 'x'.repeat(600)).Matched).toBe(true);
        expect(SafeRegexSearchDetailed(rxStart, 'x'.repeat(600) + ' begin').Matched).toBe(false);

        const rxMulti = new RegExp('^target$', 'm');
        expect(SafeRegexSearchDetailed(rxMulti, 'alpha\n' + 'x'.repeat(600) + '\ntarget\nomega').Matched).toBe(true);
        expect(SafeRegexSearchDetailed(rxMulti, 'alpha\n' + 'x'.repeat(600) + ' target here\nomega').Matched).toBe(false);

        // > 64 KB input reports InputTooLong: true
        const over64k = SafeRegexSearchDetailed(rxEnd, 'a'.repeat(70_000), 20, 65_536);
        expect(over64k).toEqual({ Matched: false, TimedOut: false, InputTooLong: true });
    });

    it('R6-9: wrappers around unimplemented dynamic arrays evaluate to #NAME? and omit <v> on export/patch; ROWS/COLUMNS propagate scalar errors', () => {
        const wb = engine.CreateEmptyWorkbook('DynWrappers', ['Sheet1'], 10, 6);
        const s = wb.Worksheets[0];
        for (let r = 1; r <= 5; r++) {
            engine.SetCell(wb, s.SheetID, `A${r}`, { Value: r * 10 }, false);
        }
        engine.SetCell(wb, s.SheetID, 'B1', { Formula: '=ROWS(UNIQUE(A1:A5))' }, false);
        engine.SetCell(wb, s.SheetID, 'B2', { Formula: '=COLUMNS(UNIQUE(A1:A5))' }, false);
        engine.SetCell(wb, s.SheetID, 'B3', { Formula: '=COUNTA(UNIQUE(A1:A5))' }, false);
        engine.SetCell(wb, s.SheetID, 'B4', { Formula: '=IFERROR(SORT(A1:A5), 0)' }, false);
        engine.SetCell(wb, s.SheetID, 'B5', { Formula: '=ROWS(1/0)' }, false);
        engine.SetCell(wb, s.SheetID, 'B6', { Formula: '=COLUMNS(1/0)' }, true);

        expect(s.Cells['B1']?.ComputedValue).toBe('#NAME?');
        expect(s.Cells['B2']?.ComputedValue).toBe('#NAME?');
        expect(s.Cells['B3']?.ComputedValue).toBe('#NAME?');
        expect(s.Cells['B4']?.ComputedValue).toBe('#NAME?');
        expect(s.Cells['B5']?.ComputedValue).toBe('#DIV/0!');
        expect(s.Cells['B6']?.ComputedValue).toBe('#DIV/0!');

        const decoder = new TextDecoder();
        const exportedBytes = engine.ExportToXlsxBytes(wb, false);
        const exportedXml = decoder.decode(engine.ExtractZipArchive(exportedBytes).get('xl/worksheets/sheet1.xml')!);
        for (const addr of ['B1', 'B2', 'B3', 'B4']) {
            const cellTagMatch = new RegExp(`<c r="${addr}"[^>]*>[\\s\\S]*?<\\/c>`).exec(exportedXml);
            expect(cellTagMatch).not.toBeNull();
            expect(cellTagMatch![0]).not.toContain('<v>');
        }

        // Also verify PatchXlsxBytes omits <v> when patching a wrapper over an unimplemented dynamic-array function
        const baseWb = engine.CreateEmptyWorkbook('PatchDynBase', ['Sheet1'], 10, 6);
        engine.SetCell(baseWb, 'Sheet1', 'A1', { Value: 10 }, true);
        const seedBytes = engine.ExportToXlsxBytes(baseWb, false);
        const imported = engine.ImportFromXlsxBytes(seedBytes);
        engine.SetCell(imported, 'Sheet1', 'C1', { Formula: '=ROWS(UNIQUE(A1:A5))' }, false);
        engine.SetCell(imported, 'Sheet1', 'C2', { Formula: '=IFERROR(SORT(A1:A5), 0)' }, true);
        const patchedBytes = engine.PatchXlsxBytes(seedBytes, imported);
        const patchedXml = decoder.decode(engine.ExtractZipArchive(patchedBytes).get('xl/worksheets/sheet1.xml')!);
        for (const addr of ['C1', 'C2']) {
            const cellTagMatch = new RegExp(`<c r="${addr}"[^>]*>[\\s\\S]*?<\\/c>`).exec(patchedXml);
            expect(cellTagMatch).not.toBeNull();
            expect(cellTagMatch![0]).not.toContain('<v>');
        }
    });

    it('R6 OOXML E7, Sparse COUNTIF/SUMIF (< 50ms), & ValidateExtraFilter RHS: injects XLDAPR into valueMetadata-only metadata.xml, prefixes _xlpm. in LET, and runs sparse A:A COUNTIF/SUMIF fast', () => {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // 1. E7.2 & E7.3: Existing xl/metadata.xml with ONLY valueMetadata AND existing non-XLDAPR cellMetadata + LET _xlpm. prefixing
        const seedWb = engine.CreateEmptyWorkbook('MetaAndLet', ['Sheet1'], 6, 4);
        engine.SetCell(seedWb, 'Sheet1', 'A1', { Value: 10 }, false);
        engine.SetCell(seedWb, 'Sheet1', 'A2', { Value: 20 }, true);
        const baseXlsx = engine.ExportToXlsxBytes(seedWb, false);
        const filesValueOnly = engine.ExtractZipArchive(baseXlsx);
        filesValueOnly.set(
            'xl/metadata.xml',
            encoder.encode(
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                    '<metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" valueMeta="1"/></metadataTypes>' +
                    '<valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata>' +
                    '</metadata>'
            )
        );
        const seedValueOnlyBytes = engine.BuildZipArchive(
            Array.from(filesValueOnly.entries()).map(([Name, Data]) => ({ Name, Data }))
        );

        const editWb1 = engine.ImportFromXlsxBytes(seedValueOnlyBytes);
        engine.SetCell(editWb1, 'Sheet1', 'B1', { Formula: '=UNIQUE(A1:A2)' }, false);
        engine.SetCell(editWb1, 'Sheet1', 'B2', { Formula: '=LET(x, 1, y, 2, x+y)' }, false);
        engine.SetCell(
            editWb1,
            'Sheet1',
            'B3',
            { Formula: '=LET(rate, 5, IF(rate>0, "rate", Sheet1!A1 + SUM(rate)))' },
            true
        );

        const patched1 = engine.PatchXlsxBytes(seedValueOnlyBytes, editWb1);
        const patchedFiles1 = engine.ExtractZipArchive(patched1);
        const metaXml1 = decoder.decode(patchedFiles1.get('xl/metadata.xml')!);
        const sheetXml1 = decoder.decode(patchedFiles1.get('xl/worksheets/sheet1.xml')!);

        expect(metaXml1).toContain('name="XLDAPR"');
        expect(metaXml1).toContain('<futureMetadata name="XLDAPR"');
        expect(metaXml1).toContain('<cellMetadata count="1"><bk><rc t="2" v="0"/></bk></cellMetadata>');
        expect(sheetXml1).toContain('<c r="B1" cm="1"><f t="array" ref="B1">_xlfn.UNIQUE(A1:A2)</f></c>');
        expect(sheetXml1).toContain('<f>_xlfn.LET(_xlpm.x, 1, _xlpm.y, 2, _xlpm.x+_xlpm.y)</f>');
        expect(sheetXml1).toContain(
            '<f>_xlfn.LET(_xlpm.rate, 5, IF(_xlpm.rate&gt;0, &quot;rate&quot;, Sheet1!A1 + SUM(_xlpm.rate)))</f>'
        );

        // Round-trip re-import strips _xlpm. cleanly
        const reimported1 = engine.ImportFromXlsxBytes(patched1);
        expect(reimported1.Worksheets[0].Cells['B2']?.Formula).toBe('=LET(x, 1, y, 2, x+y)');

        // Case with an existing non-XLDAPR <cellMetadata> entry -> XLDAPR gets cm="2"!
        const filesExistingCellMeta = engine.ExtractZipArchive(baseXlsx);
        filesExistingCellMeta.set(
            'xl/metadata.xml',
            encoder.encode(
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                    '<metadataTypes count="1"><metadataType name="OTHERMETA" minSupportedVersion="120000" cellMeta="1"/></metadataTypes>' +
                    '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata>' +
                    '</metadata>'
            )
        );
        const seedCellMetaBytes = engine.BuildZipArchive(
            Array.from(filesExistingCellMeta.entries()).map(([Name, Data]) => ({ Name, Data }))
        );
        const editWb2 = engine.ImportFromXlsxBytes(seedCellMetaBytes);
        engine.SetCell(editWb2, 'Sheet1', 'B1', { Formula: '=UNIQUE(A1:A2)' }, true);
        const patched2 = engine.PatchXlsxBytes(seedCellMetaBytes, editWb2);
        const patchedFiles2 = engine.ExtractZipArchive(patched2);
        expect(decoder.decode(patchedFiles2.get('xl/metadata.xml')!)).toContain(
            '<cellMetadata count="2"><bk><rc t="1" v="0"/></bk><bk><rc t="2" v="0"/></bk></cellMetadata>'
        );
        expect(decoder.decode(patchedFiles2.get('xl/worksheets/sheet1.xml')!)).toContain(
            '<c r="B1" cm="2"><f t="array" ref="B1">_xlfn.UNIQUE(A1:A2)</f></c>'
        );

        // 2. Item 5.2: Sparse COUNTIF / SUMIF on A:A with A1000000 = 42 runs in < 50ms
        const sparseWb = engine.CreateEmptyWorkbook('SparseCountIf', ['Sheet1'], 25, 6);
        const ss = sparseWb.Worksheets[0];
        const t0 = performance.now();
        engine.SetCell(sparseWb, ss.SheetID, 'A1000000', { Value: 42 }, false);
        engine.SetCell(sparseWb, ss.SheetID, 'B1', { Formula: '=COUNTIF(A:A, ">0")' }, false);
        engine.SetCell(sparseWb, ss.SheetID, 'C1', { Formula: '=SUMIF(A:A, ">0")' }, false);
        engine.SetCell(sparseWb, ss.SheetID, 'D1', { Formula: '=COUNTIF(A:A, "")' }, true);
        const elapsedSparse = performance.now() - t0;

        expect(ss.Cells['B1']?.ComputedValue).toBe(1);
        expect(ss.Cells['C1']?.ComputedValue).toBe(42);
        expect(ss.Cells['D1']?.ComputedValue).toBe(1_048_575);
        expect(elapsedSparse).toBeLessThan(50);

        // 3. ValidateExtraFilter RHS checks
        expect(ValidateExtraFilter("'sa' = SYSTEM_USER")).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter("'M' < @@VERSION")).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter("'dbo' = USER_NAME")).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter("'x' = SUSER_SNAME")).toMatchObject({ Valid: false, AccessDenied: true });
    });

    it('R7-3: SafeRegexSearchDetailed evaluates whole strings without windowing or anchor rewrites (< 25ms on 64 KB adversarial inputs and 100% accurate across >256-char spans & boundaries)', () => {
        // 1. All 7 AN-BC accuracy cases (false-negative spans >256 chars + false-positive window boundaries)
        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('"[^"]*"')!, `prefix "${'q'.repeat(400)}" suffix`).Matched).toBe(true);
        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('start\\d+end')!, `start${'7'.repeat(350)}end`).Matched).toBe(true);
        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('<b>[^<]*</b>')!, `<b>${'x'.repeat(350)}</b>`).Matched).toBe(true);
        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('total:\\s*\\d+')!, `total:${' '.repeat(300)}42`).Matched).toBe(true);

        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('\\bzz')!, `${'y'.repeat(128)}zz${'y'.repeat(200)}`).Matched).toBe(false);
        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('(\\d+$)')!, `${'9'.repeat(300)}x`).Matched).toBe(false);
        expect(SafeRegexSearchDetailed(CompileSafeUserRegex('foo$|bar')!, `${'a'.repeat(253)}foo${'z'.repeat(100)}`).Matched).toBe(false);

        // 2. 64 KB adversarial inputs finish in < 25ms without windowing
        const t0 = performance.now();
        const adv1 = SafeRegexSearchDetailed(CompileSafeUserRegex('\\d+y')!, '1'.repeat(65_536), 20, 65_536);
        const adv2 = SafeRegexSearchDetailed(CompileSafeUserRegex('(a|b)+c')!, 'a'.repeat(65_536), 20, 65_536);
        const adv3 = SafeRegexSearchDetailed(CompileSafeUserRegex('\\s*\\w+\\s*$')!, `${' '.repeat(32_768)}${'a'.repeat(32_767)}!`, 20, 65_536);
        const elapsedAdv = performance.now() - t0;
        expect(elapsedAdv).toBeLessThan(25);
        expect(adv1.Matched).toBe(false);
        expect(adv1.InputTooLong || adv1.TimedOut).toBe(true);
        expect(adv2.Matched).toBe(false);
        expect(adv2.InputTooLong || adv2.TimedOut).toBe(true);
        expect(adv3.Matched).toBe(false);
        expect(adv3.InputTooLong || adv3.TimedOut).toBe(true);

        // 3. Registered SafeRegexSandboxExecutor runs whole strings > 4 KB cleanly
        RegisterSafeRegexSandboxExecutor((rx, s) => ({ Matched: rx.test(s), TimedOut: false }));
        try {
            const longQuote = `head "${'z'.repeat(16_000)}" tail`;
            const sandboxRes = SafeRegexSearchDetailed(CompileSafeUserRegex('"[^"]*"')!, longQuote, 20, 65_536);
            expect(sandboxRes).toEqual({ Matched: true, TimedOut: false, InputTooLong: false });
        } finally {
            RegisterSafeRegexSandboxExecutor(null);
        }
    });

    it('R7-4: filling 4,000 rows one by one and 200 columns avoids quadratic grow scans (< 500ms)', () => {
        const wb = engine.CreateEmptyWorkbook('LinearGrowPerf', ['Sheet1'], 25, 10);
        const s = wb.Worksheets[0];
        const t0 = performance.now();
        for (let r = 1; r <= 4_000; r++) {
            engine.SetCell(wb, s.SheetID, `A${r}`, { Value: r }, false);
        }
        for (let c = 1; c <= 200; c++) {
            engine.SetCell(wb, s.SheetID, `${ColumnIndexToLetter(c)}1`, { Value: c * 10 }, false);
        }
        engine.EvaluateWorkbook(wb);
        const elapsed = performance.now() - t0;

        expect(s.Rows.length).toBe(4_000);
        expect(s.Columns.length).toBe(200);
        expect(s.Cells['A4000']?.ComputedValue).toBe(4_000);
        expect(s.Cells[`${ColumnIndexToLetter(200)}1`]?.ComputedValue).toBe(2_000);
        expect(elapsed).toBeLessThan(500);
    });

    it('R7-7: unimplemented dynamic and scalar Excel functions propagate sentinel across ALL wrappers and dependent cells (#NAME? and omit <v> on export/patch)', () => {
        const wb = engine.CreateEmptyWorkbook('UnimplAllFunctions', ['Sheet1'], 10, 8);
        const s = wb.Worksheets[0];
        for (let r = 1; r <= 5; r++) {
            engine.SetCell(wb, s.SheetID, `A${r}`, { Value: r }, false);
            engine.SetCell(wb, s.SheetID, `B${r}`, { Value: r * 10 }, false);
        }
        engine.SetCell(wb, s.SheetID, 'C1', { Formula: '=IFERROR(MATCH(1, SORT(A1:A5), 0), 0)' }, false);
        engine.SetCell(wb, s.SheetID, 'C2', { Formula: '=COUNTIFS(UNIQUE(A1:A5), ">1")' }, false);
        engine.SetCell(wb, s.SheetID, 'C3', { Formula: '=XLOOKUP(1, SORT(A1:A5), SORT(A1:A5), "none")' }, false);
        engine.SetCell(wb, s.SheetID, 'C4', { Formula: '=IFERROR(LARGE(B1:B5, 2), 0)' }, false);
        engine.SetCell(wb, s.SheetID, 'C5', { Formula: '=LARGE(B1:B5, 2)' }, false);
        engine.SetCell(wb, s.SheetID, 'D5', { Formula: '=IFERROR(C5, 99)' }, true);

        for (const addr of ['C1', 'C2', 'C3', 'C4', 'C5', 'D5']) {
            expect(s.Cells[addr]?.ComputedValue).toBe('#NAME?');
        }

        const decoder = new TextDecoder();
        const exportedBytes = engine.ExportToXlsxBytes(wb, false);
        const exportedXml = decoder.decode(engine.ExtractZipArchive(exportedBytes).get('xl/worksheets/sheet1.xml')!);
        for (const addr of ['C1', 'C2', 'C3', 'C4', 'C5', 'D5']) {
            const m = new RegExp(`<c r="${addr}"[^>]*>[\\s\\S]*?<\\/c>`).exec(exportedXml);
            expect(m).not.toBeNull();
            expect(m![0]).not.toContain('<v>');
        }

        // Verify PatchXlsxBytes also omits <v> for all 6 cells
        const seedWb = engine.CreateEmptyWorkbook('PatchSeedR77', ['Sheet1'], 10, 8);
        engine.SetCell(seedWb, 'Sheet1', 'A1', { Value: 1 }, true);
        const seedBytes = engine.ExportToXlsxBytes(seedWb, false);
        const imported = engine.ImportFromXlsxBytes(seedBytes);
        for (let r = 1; r <= 5; r++) {
            engine.SetCell(imported, 'Sheet1', `A${r}`, { Value: r }, false);
            engine.SetCell(imported, 'Sheet1', `B${r}`, { Value: r * 10 }, false);
        }
        engine.SetCell(imported, 'Sheet1', 'C1', { Formula: '=IFERROR(MATCH(1, SORT(A1:A5), 0), 0)' }, false);
        engine.SetCell(imported, 'Sheet1', 'C2', { Formula: '=COUNTIFS(UNIQUE(A1:A5), ">1")' }, false);
        engine.SetCell(imported, 'Sheet1', 'C3', { Formula: '=XLOOKUP(1, SORT(A1:A5), SORT(A1:A5), "none")' }, false);
        engine.SetCell(imported, 'Sheet1', 'C4', { Formula: '=IFERROR(LARGE(B1:B5, 2), 0)' }, false);
        engine.SetCell(imported, 'Sheet1', 'C5', { Formula: '=LARGE(B1:B5, 2)' }, false);
        engine.SetCell(imported, 'Sheet1', 'D5', { Formula: '=IFERROR(C5, 99)' }, true);

        const patchedBytes = engine.PatchXlsxBytes(seedBytes, imported);
        const patchedXml = decoder.decode(engine.ExtractZipArchive(patchedBytes).get('xl/worksheets/sheet1.xml')!);
        for (const addr of ['C1', 'C2', 'C3', 'C4', 'C5', 'D5']) {
            const m = new RegExp(`<c r="${addr}"[^>]*>[\\s\\S]*?<\\/c>`).exec(patchedXml);
            expect(m).not.toBeNull();
            expect(m![0]).not.toContain('<v>');
        }
    });

    it('R7-8: PatchXlsxBytes clears stale dynamic-array spill children (I7=2, I8=3) when spill anchor I6 is edited from SEQUENCE(3) to SEQUENCE(5)', () => {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const baseWb = engine.CreateEmptyWorkbook('SpillClearTest', ['Sheet1'], 12, 10);
        engine.SetCell(baseWb, 'Sheet1', 'A1', { Value: 100 }, true);
        const baseZip = engine.ExtractZipArchive(engine.ExportToXlsxBytes(baseWb, false));

        // Craft an Excel-saved dynamic-array spill block I6:I8 (cm="1", ref="I6:I8", I6=1, I7=2, I8=3)
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
        const origSheetXml = decoder.decode(baseZip.get('xl/worksheets/sheet1.xml')!);
        const withSpillXml = origSheetXml.replace(
            /<\/sheetData>/,
            () =>
                '<row r="6"><c r="I6" cm="1" t="n"><f t="array" ref="I6:I8">_xlfn.SEQUENCE(3)</f><v>1</v></c></row>' +
                '<row r="7"><c r="I7" t="n"><v>2</v></c></row>' +
                '<row r="8"><c r="I8" t="n"><v>3</v></c></row>' +
                '</sheetData>'
        );
        baseZip.set('xl/worksheets/sheet1.xml', encoder.encode(withSpillXml));
        const seedXlsx = engine.BuildZipArchive(
            Array.from(baseZip.entries()).map(([Name, Data]) => ({ Name, Data }))
        );

        const imported = engine.ImportFromXlsxBytes(seedXlsx);
        engine.SetCell(imported, 'Sheet1', 'I6', { Formula: '=SEQUENCE(5)' }, true);
        const patchedBytes = engine.PatchXlsxBytes(seedXlsx, imported);
        const patchedSheetXml = decoder.decode(engine.ExtractZipArchive(patchedBytes).get('xl/worksheets/sheet1.xml')!);

        expect(patchedSheetXml).toContain('<c r="I6" cm="1"><f t="array" ref="I6">_xlfn.SEQUENCE(5)</f></c>');
        expect(patchedSheetXml).not.toContain('<v>2</v>');
        expect(patchedSheetXml).not.toContain('<v>3</v>');
    });

    it('R7-9 & R8-5: ValidateExtraFilter & =MJ.VIEW require bracketed [User] while allowing APP_NAME, DB_NAME, [First Name], and N\'...\' Unicode literals and blocking unbracketed USER/SYSTEM_USER, APP_NAME(), and @@VERSION', async () => {
        expect(ValidateExtraFilter("User = 'bob'")).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter('Name = User')).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter("[User] = 'bob'")).toEqual({
            Valid: true,
            NormalizedFilter: "[User] = 'bob'"
        });
        expect(ValidateExtraFilter("APP_NAME = 'CRM'")).toEqual({
            Valid: true,
            NormalizedFilter: "APP_NAME = 'CRM'"
        });
        expect(ValidateExtraFilter("DB_NAME = 'Prod'")).toEqual({
            Valid: true,
            NormalizedFilter: "DB_NAME = 'Prod'"
        });
        expect(ValidateExtraFilter("Name = N'Renée'")).toEqual({
            Valid: true,
            NormalizedFilter: "Name = N'Renée'"
        });
        expect(ValidateExtraFilter("[First Name] = N'Ada'")).toEqual({
            Valid: true,
            NormalizedFilter: "[First Name] = N'Ada'"
        });

        expect(ValidateExtraFilter("'sa' = SYSTEM_USER")).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter("APP_NAME() = 'x'")).toMatchObject({ Valid: false, AccessDenied: true });
        expect(ValidateExtraFilter("Name = @@VERSION")).toMatchObject({ Valid: false, AccessDenied: true });

        // End-to-end =MJ.VIEW("AppDeployments", "(default)", "APP_NAME='CRM'")
        const viewer = createMockUser('u-r79', 'Viewer R79');
        const deployEntity = new EntityInfo({
            ID: 'ent-dep',
            Name: 'AppDeployments',
            BaseView: 'vwAppDeployments',
            AllowUserSearchAPI: true,
            IncludeInAPI: true,
            Fields: [
                new EntityFieldInfo({ ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', TSType: EntityFieldTSType.String, DefaultInView: false }),
                new EntityFieldInfo({ ID: 'f2', Name: 'APP_NAME', Type: 'nvarchar', TSType: EntityFieldTSType.String, DefaultInView: true }),
                new EntityFieldInfo({ ID: 'f3', Name: 'User', Type: 'nvarchar', TSType: EntityFieldTSType.String, DefaultInView: true }),
                new EntityFieldInfo({ ID: 'f4', Name: 'First Name', Type: 'nvarchar', TSType: EntityFieldTSType.String, DefaultInView: true })
            ]
        });
        const baseUserPerm = deployEntity.GetUserPermisions(viewer);
        baseUserPerm.CanRead = true;
        vi.spyOn(deployEntity, 'GetUserPermisions').mockReturnValue(baseUserPerm);
        const mockProvider: IMetadataProvider = Object.assign({}, Metadata.Provider, {
            Entities: [deployEntity],
            Queries: [],
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ APP_NAME: 'CRM', User: 'bob', 'First Name': 'Ada' }],
                TotalRowCount: 1
            })
        });

        const wb = engine.CreateEmptyWorkbook('MjViewR79', ['Sheet1'], 10, 5);
        engine.SetCell(wb, 'Sheet1', 'A1', { Formula: '=MJ.VIEW("AppDeployments", "(default)", "APP_NAME=\'CRM\'")' }, false);
        engine.SetCell(wb, 'Sheet1', 'A2', { Formula: '=MJ.VIEW("AppDeployments", "(default)", "[First Name]=N\'Ada\'")' }, false);
        engine.SetCell(wb, 'Sheet1', 'A3', { Formula: '=MJ.VIEW("AppDeployments", "(default)", "[User]=\'bob\'")' }, false);
        engine.SetCell(wb, 'Sheet1', 'A4', { Formula: '=MJ.VIEW("AppDeployments", "(default)", "User=\'bob\'")' }, false);
        await engine.EvaluateMjCustomFunctions(wb, viewer, mockProvider, { BypassCache: true });
        expect(wb.Worksheets[0].Cells['A1']?.AccessDenied).toBeFalsy();
        expect(wb.Worksheets[0].Cells['A1']?.ComputedValue).toBe('CRM');
        expect(wb.Worksheets[0].Cells['A2']?.AccessDenied).toBeFalsy();
        expect(wb.Worksheets[0].Cells['A2']?.ComputedValue).toBe('CRM');
        expect(wb.Worksheets[0].Cells['A3']?.AccessDenied).toBeFalsy();
        expect(wb.Worksheets[0].Cells['A3']?.ComputedValue).toBe('CRM');
        expect(wb.Worksheets[0].Cells['A4']?.AccessDenied).toBe(true);
    });

    it('Item 7: sparse whole-row & whole-column COUNTIFS, MATCH, and VLOOKUP complete in < 50ms total', () => {
        const wb = engine.CreateEmptyWorkbook('SparseWholeRangeLookups', ['Sheet1'], 25, 10);
        const s = wb.Worksheets[0];
        engine.SetCell(wb, s.SheetID, 'C1', { Value: 15 }, false);
        engine.SetCell(wb, s.SheetID, 'C2', { Value: 'ok' }, false);
        engine.SetCell(wb, s.SheetID, 'A10', { Value: 25 }, false);
        engine.SetCell(wb, s.SheetID, 'B10', { Value: 'ok' }, false);
        engine.SetCell(wb, s.SheetID, 'A500000', { Value: 'needle' }, false);
        engine.SetCell(wb, s.SheetID, 'B500000', { Value: 42 }, false);

        const t0 = performance.now();
        const rRowCountIfs = engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIFS(1:1, ">0", 2:2, "ok")');
        const rColCountIfs = engine.EvaluateFormulaExpression(wb, s.SheetID, '=COUNTIFS(A:A, ">0", B:B, "ok")');
        const rMatch = engine.EvaluateFormulaExpression(wb, s.SheetID, '=MATCH("needle", A:A, 0)');
        const rVlookup = engine.EvaluateFormulaExpression(wb, s.SheetID, '=VLOOKUP("needle", A:B, 2, FALSE)');
        const elapsed = performance.now() - t0;

        expect(rRowCountIfs).toBe(1);
        expect(rColCountIfs).toBe(1);
        expect(rMatch).toBe(500_000);
        expect(rVlookup).toBe(42);
        expect(elapsed).toBeLessThan(50);
    });

    it('VM sandbox safety: SafeRegexSearchDetailed and ExportToXlsxBytes work when TextEncoder, TextDecoder, and Buffer are undefined', async () => {
        const savedBuffer = globalThis.Buffer;
        const savedTextEncoder = globalThis.TextEncoder;
        const savedTextDecoder = globalThis.TextDecoder;
        try {
            Reflect.set(globalThis, 'Buffer', undefined);
            Reflect.set(globalThis, 'TextEncoder', undefined);
            Reflect.set(globalThis, 'TextDecoder', undefined);

            // 23,000 3-byte Euro symbols = 69,000 UTF-8 bytes (> 65,536 maxInputBytes)
            const overLimitUtf8 = '€'.repeat(23_000);
            const rx = CompileSafeUserRegex('^€+$');
            expect(rx).not.toBeNull();
            const overRes = SafeRegexSearchDetailed(rx!, overLimitUtf8, 20, 65536);
            expect(overRes).toEqual({ Matched: false, TimedOut: false, InputTooLong: true });

            const underLimitUtf8 = `Renée — ${'€'.repeat(30)}`;
            const matchRx = CompileSafeUserRegex('Renée');
            expect(matchRx).not.toBeNull();
            expect(SafeRegexSearchDetailed(matchRx!, underLimitUtf8, 20, 65536).Matched).toBe(true);

            const wb = engine.CreateEmptyWorkbook('BareVmUtf8', ['Sheet1'], 5, 5);
            engine.SetCell(wb, 'Sheet1', 'A1', { Value: 'Hello 🌍 Renée' }, true);
            const xlsxBytes = await engine.ExportToXlsxBytes(wb);
            const reimported = await engine.ImportFromXlsxBytes(xlsxBytes, 'BareVmUtf8');
            expect(reimported.Worksheets[0].Cells['A1']?.RawValue).toBe('Hello 🌍 Renée');
        } finally {
            Reflect.set(globalThis, 'Buffer', savedBuffer);
            Reflect.set(globalThis, 'TextEncoder', savedTextEncoder);
            Reflect.set(globalThis, 'TextDecoder', savedTextDecoder);
        }
    });

    it('R8-3: O(1) incremental virtual-ID promotion & fast large-sheet import/re-import (< 400ms 4k forward-ref fill, < 2000ms 7.5k x 4 round-trip, < 2500ms 15k x 600 import, and 10k x 6 metadata round-trip)', () => {
        // 1. B1=SUM(A2:A4000) followed by filling A2..A4000 one-by-one completes in < 400ms and evaluates to exact sum
        const wbFill = engine.CreateEmptyWorkbook('ForwardRefFill4k', ['Sheet1'], 20, 6);
        const sFill = wbFill.Worksheets[0];
        const tFill0 = performance.now();
        engine.SetCell(wbFill, sFill.SheetID, 'B1', { Formula: '=SUM(A2:A4000)' }, true);
        expect(sFill.Cells['B1']?.ComputedValue).toBe(0);
        for (let r = 2; r <= 4_000; r++) {
            engine.SetCell(wbFill, sFill.SheetID, `A${r}`, { Value: r }, false);
        }
        engine.EvaluateWorkbook(wbFill);
        const fillElapsed = performance.now() - tFill0;

        const expectedSum = (4_000 * 4_001) / 2 - 1;
        expect(sFill.Cells['B1']?.ComputedValue).toBe(expectedSum);
        expect(sFill.Cells['B1']?.FormulaStable).toContain(`${sFill.SheetID}-row-4000`);
        expect(fillElapsed).toBeLessThan(400);

        // 2. Importing & re-importing a 7,500-row x 4-col exported workbook with F2=SUM(A1:A7500) completes in < 2,000ms
        const wb7500 = engine.CreateEmptyWorkbook('Export7500x4', ['Data'], 7_500, 6);
        const s7500 = wb7500.Worksheets[0];
        for (let r = 1; r <= 7_500; r++) {
            engine.SetCell(wb7500, s7500.SheetID, `A${r}`, { Value: r }, false);
            engine.SetCell(wb7500, s7500.SheetID, `B${r}`, { Value: r * 2 }, false);
            engine.SetCell(wb7500, s7500.SheetID, `C${r}`, { Value: `k-${r}` }, false);
            engine.SetCell(wb7500, s7500.SheetID, `D${r}`, { Value: r % 2 === 0 }, false);
        }
        engine.SetCell(wb7500, s7500.SheetID, 'F2', { Formula: '=SUM(A1:A7500)' }, true);
        const expected7500Sum = (7_500 * 7_501) / 2;
        expect(s7500.Cells['F2']?.ComputedValue).toBe(expected7500Sum);

        const exported7500Bytes = engine.ExportToXlsxBytes(wb7500, true);
        const tImp0 = performance.now();
        const imported1 = engine.ImportFromXlsxBytes(exported7500Bytes);
        const reExportedBytes = engine.ExportToXlsxBytes(imported1, true);
        const imported2 = engine.ImportFromXlsxBytes(reExportedBytes);
        const impElapsed = performance.now() - tImp0;

        expect(imported1.Worksheets[0].Cells['F2']?.ComputedValue).toBe(expected7500Sum);
        expect(imported2.Worksheets[0].Cells['F2']?.ComputedValue).toBe(expected7500Sum);
        expect(imported2.Worksheets[0].Cells['C7500']?.ComputedValue).toBe('k-7500');
        expect(impElapsed).toBeLessThan(2_000);

        // 3. Importing a 15,000 x 600 sparse/sized sheet completes in < 2,500ms
        const wb15k = engine.CreateEmptyWorkbook('Sized15kx600', ['Grid'], 20, 12);
        const col600 = ColumnIndexToLetter(600);
        engine.SetCell(wb15k, 'Grid', 'A1', { Value: 'Origin' }, false);
        engine.SetCell(wb15k, 'Grid', 'Z5000', { Value: 5000 }, false);
        engine.SetCell(wb15k, 'Grid', `${col600}15000`, { Value: 15_600 }, true);
        const base15kZip = engine.ExtractZipArchive(engine.ExportToXlsxBytes(wb15k, false));
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        // Inject 15,000 sized <row> tags + <col min="1" max="600"> + <dimension ref="A1:WC15000"/> to simulate openpyxl sized sheet
        const emptySizedRows: string[] = [
            '<row r="1"><c r="A1" t="inlineStr"><is><t>Origin</t></is></c></row>'
        ];
        for (let r = 2; r <= 14_999; r++) {
            if (r === 5000) {
                emptySizedRows.push('<row r="5000"><c r="Z5000" t="n"><v>5000</v></c></row>');
            } else {
                emptySizedRows.push(`<row r="${r}"/>`);
            }
        }
        emptySizedRows.push(`<row r="15000"><c r="${col600}15000" t="n"><v>15600</v></c></row>`);
        const sizedSheetXml = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            `<dimension ref="A1:${col600}15000"/>`,
            '<cols><col min="1" max="600" width="14" customWidth="1"/></cols>',
            `<sheetData>${emptySizedRows.join('')}</sheetData>`,
            '</worksheet>'
        ].join('');
        base15kZip.set('xl/worksheets/sheet1.xml', enc.encode(sizedSheetXml));
        const sized15kBytes = engine.BuildZipArchive(
            Array.from(base15kZip.entries()).map(([Name, Data]) => ({ Name, Data }))
        );

        const t15k = performance.now();
        const imp15k = engine.ImportFromXlsxBytes(sized15kBytes);
        const elapsed15k = performance.now() - t15k;

        expect(imp15k.Worksheets[0].Cells[`${col600}15000`]?.ComputedValue).toBe(15_600);
        expect(imp15k.Worksheets[0].Cells['Z5000']?.ComputedValue).toBe(5000);
        expect(elapsed15k).toBeLessThan(2_500);
        expect(dec.decode(base15kZip.get('xl/worksheets/sheet1.xml')!)).toContain(`A1:${col600}15000`);

        // 4. 10,000-row x 6-col round-trip ExportToXlsxBytes -> ImportFromXlsxBytes with _mj_sheets_meta succeeds cleanly
        const wb10k6 = engine.CreateEmptyWorkbook('RoundTrip10kx6', ['Ledger'], 10_000, 6);
        const s10k6 = wb10k6.Worksheets[0];
        for (let r = 1; r <= 10_000; r++) {
            const rStr = String(r);
            s10k6.Cells[`A${rStr}`] = {
                RowID: s10k6.Rows[r - 1].RowID,
                ColumnID: s10k6.Columns[0].ColumnID,
                Address: `A${rStr}`,
                RawValue: r,
                Formula: null,
                FormulaStable: null,
                ComputedValue: r,
                DisplayValue: rStr
            };
            for (let c = 2; c <= 6; c++) {
                const colLet = ColumnIndexToLetter(c);
                const val = r * c;
                s10k6.Cells[`${colLet}${rStr}`] = {
                    RowID: s10k6.Rows[r - 1].RowID,
                    ColumnID: s10k6.Columns[c - 1].ColumnID,
                    Address: `${colLet}${rStr}`,
                    RawValue: val,
                    Formula: null,
                    FormulaStable: null,
                    ComputedValue: val,
                    DisplayValue: String(val)
                };
            }
        }
        const xlsx10k6 = engine.ExportToXlsxBytes(wb10k6, true);
        const reimp10k6 = engine.ImportFromXlsxBytes(xlsx10k6);
        expect(reimp10k6.Title).toBe('RoundTrip10kx6');
        expect(reimp10k6.Worksheets[0].Cells['F10000']?.ComputedValue).toBe(60_000);
    });

    it('R8-4: implements NA() and scopes unimplemented-function sentinel taint ONLY to selected/aggregated cells across dense (20 rows) and sparse (3,000 rows) ranges', () => {
        const wbSmall = engine.CreateEmptyWorkbook('TaintScope20', ['Sheet1'], 30, 6);
        const sSmall = wbSmall.Worksheets[0];
        engine.SetCell(wbSmall, sSmall.SheetID, 'C1', { Value: 1 }, false);
        engine.SetCell(wbSmall, sSmall.SheetID, 'C2', { Value: 2 }, false);
        engine.SetCell(wbSmall, sSmall.SheetID, 'C3', { Value: 3 }, false);
        expect(engine.EvaluateFormulaExpression(wbSmall, sSmall.SheetID, '=NA()')).toBe('#N/A');
        expect(engine.EvaluateFormulaExpression(wbSmall, sSmall.SheetID, '=NA(1)')).toBe('#VALUE!');
        expect(engine.EvaluateFormulaExpression(wbSmall, sSmall.SheetID, '=ISNA(NA())')).toBe(true);
        expect(engine.EvaluateFormulaExpression(wbSmall, sSmall.SheetID, '=ISNA(42)')).toBe(false);

        const verifyRangeBehavior = (rowCount: number): void => {
            const wb = engine.CreateEmptyWorkbook(`TaintScope_${rowCount}`, ['Sheet1'], rowCount + 5, 8);
            const s = wb.Worksheets[0];
            engine.SetCell(wb, s.SheetID, 'C1', { Value: 10 }, false);
            engine.SetCell(wb, s.SheetID, 'C2', { Value: 20 }, false);
            engine.SetCell(wb, s.SheetID, 'C3', { Value: 30 }, false);
            for (let r = 1; r <= rowCount; r++) {
                engine.SetCell(wb, s.SheetID, `A${r}`, { Value: `k${r}` }, false);
                if (r === 4) {
                    engine.SetCell(wb, s.SheetID, 'B4', { Formula: '=NA()' }, false);
                } else if (r === 5) {
                    engine.SetCell(wb, s.SheetID, 'B5', { Formula: '=LARGE(C1:C3, 1)' }, false);
                } else {
                    engine.SetCell(wb, s.SheetID, `B${r}`, { Value: r }, false);
                }
            }
            engine.SetCell(wb, s.SheetID, 'D1', { Formula: `=VLOOKUP("k10", A1:B${rowCount}, 2, FALSE)` }, false);
            engine.SetCell(wb, s.SheetID, 'D2', { Formula: `=VLOOKUP("k4", A1:B${rowCount}, 2, FALSE)` }, false);
            engine.SetCell(wb, s.SheetID, 'D3', { Formula: `=IFNA(VLOOKUP("k4", A1:B${rowCount}, 2, FALSE), "missing")` }, false);
            engine.SetCell(wb, s.SheetID, 'D4', { Formula: `=VLOOKUP("k5", A1:B${rowCount}, 2, FALSE)` }, false);
            engine.SetCell(wb, s.SheetID, 'D5', { Formula: `=IFERROR(VLOOKUP("k5", A1:B${rowCount}, 2, FALSE), "fallback")` }, false);
            engine.SetCell(wb, s.SheetID, 'E1', { Formula: `=MATCH("k10", A1:A${rowCount}, 0)` }, false);
            engine.SetCell(wb, s.SheetID, 'E2', { Formula: `=IFERROR(MATCH("k10", A1:A${rowCount}, 0), "none")` }, false);
            engine.SetCell(wb, s.SheetID, 'E3', { Formula: `=XLOOKUP("k10", A1:A${rowCount}, B1:B${rowCount}, "nf")` }, false);
            engine.SetCell(wb, s.SheetID, 'E4', { Formula: `=INDEX(A1:B${rowCount}, 10, 2)` }, false);
            engine.SetCell(wb, s.SheetID, 'E5', { Formula: `=SUMIF(A1:A${rowCount}, "k10", B1:B${rowCount})` }, false);
            engine.SetCell(wb, s.SheetID, 'E6', { Formula: `=SUMIFS(B1:B${rowCount}, A1:A${rowCount}, "k10")` }, false);
            engine.SetCell(wb, s.SheetID, 'E7', { Formula: `=COUNTIF(A1:A${rowCount}, "k10")` }, false);
            engine.SetCell(wb, s.SheetID, 'E8', { Formula: `=COUNTIFS(A1:A${rowCount}, "k10")` }, true);

            expect(s.Cells['B4']?.ComputedValue).toBe('#N/A');
            expect(s.Cells['B5']?.ComputedValue).toBe('#NAME?');
            expect(s.Cells['D1']?.ComputedValue).toBe(10);
            expect(s.Cells['D2']?.ComputedValue).toBe('#N/A');
            expect(s.Cells['D3']?.ComputedValue).toBe('missing');
            expect(s.Cells['D4']?.ComputedValue).toBe('#NAME?');
            expect(s.Cells['D5']?.ComputedValue).toBe('#NAME?');
            expect(s.Cells['E1']?.ComputedValue).toBe(10);
            expect(s.Cells['E2']?.ComputedValue).toBe(10);
            expect(s.Cells['E3']?.ComputedValue).toBe(10);
            expect(s.Cells['E4']?.ComputedValue).toBe(10);
            expect(s.Cells['E5']?.ComputedValue).toBe(10);
            expect(s.Cells['E6']?.ComputedValue).toBe(10);
            expect(s.Cells['E7']?.ComputedValue).toBe(1);
            expect(s.Cells['E8']?.ComputedValue).toBe(1);

            if (rowCount === 20) {
                const expXml = new TextDecoder().decode(
                    engine.ExtractZipArchive(engine.ExportToXlsxBytes(wb, false)).get('xl/worksheets/sheet1.xml')!
                );
                // D2 (=NA() via VLOOKUP("k4",...)) writes standard Excel error <v>#N/A</v>, while D4/D5 (unimplemented B5) omit <v>!
                expect(expXml).toMatch(/<c r="D2"[^>]*t="e"><f>[^<]*<\/f><v>#N\/A<\/v><\/c>/);
                for (const unimplAddr of ['B5', 'D4', 'D5']) {
                    const m = new RegExp(`<c r="${unimplAddr}"[^>]*>[\\s\\S]*?<\\/c>`).exec(expXml);
                    expect(m).not.toBeNull();
                    expect(m![0]).not.toContain('<v>');
                }
            }
        };

        verifyRangeBehavior(20);
        verifyRangeBehavior(3_000);
    });

    it('R8-8: clears stale modern spill (with cm) and legacy CSE array (without cm) child cells in memory, on ExportToXlsxBytes, and across repeated PatchXlsxBytes', () => {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const buildSeedArrayXlsx = (includeCm: boolean): Uint8Array => {
            const baseWb = engine.CreateEmptyWorkbook('ArrayCleanupSeed', ['Sheet1'], 12, 12);
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
            return engine.BuildZipArchive(
                Array.from(baseZip.entries()).map(([Name, Data]) => ({ Name, Data }))
            );
        };

        for (const includeCm of [true, false]) {
            const seedBytes = buildSeedArrayXlsx(includeCm);
            const wb = engine.ImportFromXlsxBytes(seedBytes);
            const ws = wb.Worksheets[0];
            expect(ws.Cells['K1']?.ComputedValue).toBe(2);

            // Edit anchor I6 -> I7 and I8 are immediately cleared in memory so K1=I7 evaluates to 0!
            engine.SetCell(wb, 'Sheet1', 'I6', { Value: 99 }, true);
            expect(ws.Cells['I7']).toBeUndefined();
            expect(ws.Cells['I8']).toBeUndefined();
            expect(ws.Cells['K1']?.ComputedValue).toBe(0);

            // ExportToXlsxBytes writes NO I7 or I8 constants
            const expXml = decoder.decode(
                engine.ExtractZipArchive(engine.ExportToXlsxBytes(wb, false)).get('xl/worksheets/sheet1.xml')!
            );
            expect(expXml).not.toContain('r="I7"');
            expect(expXml).not.toContain('r="I8"');

            // Repeated PatchXlsxBytes -> PatchXlsxBytes writes NO I7 or I8 constants
            const patched1 = engine.PatchXlsxBytes(seedBytes, wb);
            const patched2 = engine.PatchXlsxBytes(patched1, wb);
            const xml1 = decoder.decode(engine.ExtractZipArchive(patched1).get('xl/worksheets/sheet1.xml')!);
            const xml2 = decoder.decode(engine.ExtractZipArchive(patched2).get('xl/worksheets/sheet1.xml')!);
            expect(xml1).not.toContain('r="I7"');
            expect(xml1).not.toContain('r="I8"');
            expect(xml2).not.toContain('r="I7"');
            expect(xml2).not.toContain('r="I8"');

            // Also verify ClearRange on I6 clears I7 and I8
            const wbClear = engine.ImportFromXlsxBytes(seedBytes);
            engine.ClearRange(wbClear, 'Sheet1', 'I6', true);
            expect(wbClear.Worksheets[0].Cells['I6']).toBeUndefined();
            expect(wbClear.Worksheets[0].Cells['I7']).toBeUndefined();
            expect(wbClear.Worksheets[0].Cells['I8']).toBeUndefined();
            expect(wbClear.Worksheets[0].Cells['K1']?.ComputedValue).toBe(0);
        }
    });

    it('WHATWG UTF-8 fallback & SafeRegexSearchBatchDetailed match native TextEncoder/TextDecoder and batch sandbox contracts', () => {
        const nativeEnc = new TextEncoder();
        const nativeDec = new TextDecoder('utf-8', { fatal: false });

        const encodeCases = [
            '',
            'Plain ASCII 0123456789',
            'Zoë — €1,250.00',
            'Ship 🚀🌟🎉 now',
            '\uD800',
            '\uDBFF',
            '\uDC00',
            '\uDFFF',
            'lead\uD83Dtail',
            '\uDC00\uD800'
        ];
        for (const str of encodeCases) {
            expect(Array.from(EncodeUtf8Fallback(str))).toEqual(Array.from(nativeEnc.encode(str)));
        }

        const decodeCases: number[][] = [
            [],
            [0x41, 0x42, 0x43],
            [0xc3, 0x41], // invalid 2-byte followed by ASCII 'A' -> "\uFFFDA"
            [0xc0, 0xaf], // overlong 2-byte '/' -> "\uFFFD\uFFFD"
            [0xe0, 0x80, 0xaf], // overlong 3-byte -> "\uFFFD\uFFFD\uFFFD"
            [0xed, 0xa0, 0x80], // UTF-16 surrogate -> "\uFFFD\uFFFD\uFFFD"
            [0xf4, 0x90, 0x80, 0x80], // > U+10FFFF -> "\uFFFD\uFFFD\uFFFD\uFFFD"
            [0xf0, 0x80, 0x80, 0xaf], // overlong 4-byte -> "\uFFFD\uFFFD\uFFFD\uFFFD"
            [0xe2, 0x82], // truncated 3-byte
            [0xf0, 0x9f, 0x9a], // truncated 4-byte
            Array.from(nativeEnc.encode('Zoë 🚀'))
        ];
        for (const bytes of decodeCases) {
            const u8 = new Uint8Array(bytes);
            expect(DecodeUtf8Fallback(u8)).toBe(nativeDec.decode(u8));
        }

        expect(DecodeUtf8Fallback(new Uint8Array([0xc3, 0x41]))).toBe('\uFFFDA');
        expect(DecodeUtf8Fallback(new Uint8Array([0xc0, 0xaf]))).toBe('\uFFFD\uFFFD');

        // Verify SafeRegexSearchBatchDetailed with registered batch executor
        RegisterSafeRegexBatchSandboxExecutor((rx, items) => ({
            Matches: items.map((s) => rx.test(s)),
            TimedOut: false
        }));
        try {
            const rx = CompileSafeUserRegex('refund.*approved', 'i')!;
            const batchOut = SafeRegexSearchBatchDetailed(rx, ['no match', 'Refund #42 approved today', '€'.repeat(23_000)], 40, 65_536);
            expect(batchOut).toEqual({
                Matches: [false, true, false],
                InputTooLong: [false, false, true],
                TimedOut: false
            });
        } finally {
            RegisterSafeRegexBatchSandboxExecutor(null);
        }
    });
});
