import { describe, expect, it, beforeEach } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ColumnIndexToLetter,
    ColumnLetterToIndex,
    FormatCellAddress,
    ParseCellAddress,
    ParseRangeAddress,
    SpreadsheetEngine
} from '../custom/SpreadsheetEngine';
import { SlideDeckEngine } from '../custom/SlideDeckEngine';

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

    it('§ 6.1 & O7: initializes and evaluates a 100,000-cell grid in under 500ms', () => {
        const start = performance.now();
        // Create a 5,000 row x 20 column (100,000 cell coordinates) worksheet with sample populated cells & formulas
        const wb = engine.CreateEmptyWorkbook('100k Stress Test', ['BigGrid'], 5000, 20);
        const ws = wb.Worksheets[0];
        for (let r = 1; r <= 200; r++) {
            const addrA = `A${r}`;
            ws.Cells[addrA] = {
                RowID: ws.Rows[r - 1].RowID,
                ColumnID: ws.Columns[0].ColumnID,
                Address: addrA,
                RawValue: r * 10
            };
        }
        engine.SetCell(wb, ws.SheetID, 'B1', { Formula: '=SUM(A1:A200)' }, true);
        const elapsedMs = performance.now() - start;

        expect(ws.Rows.length * ws.Columns.length).toBe(100_000);
        expect(ws.Cells['B1'].ComputedValue).toBe(201000);
        expect(elapsedMs).toBeLessThan(500);
    });
});
