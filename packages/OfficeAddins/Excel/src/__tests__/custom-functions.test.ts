import { describe, expect, it } from 'vitest';
import {
    BuildExcelCustomFunctionsMetadata,
    EXCEL_CUSTOM_FUNCTION_ACCESS_DENIED,
    EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED,
    ExcelAddinEvaluateCustomFunctionInput,
    ExcelAddinEvaluateCustomFunctionOutput,
    ExcelCustomFunctionCoordinator,
    FormatRowsForExcelCustomFunction,
    ParseExcelQueryFunctionArguments,
} from '../custom-functions';

describe('Excel Custom Functions (=MJ.QUERY & =MJ.VIEW, § 7.1/7.2 & O8)', () => {
    it('builds Office functions.json metadata for QUERY and VIEW', () => {
        const meta = BuildExcelCustomFunctionsMetadata();
        expect(meta.functions.map(f => f.id)).toEqual(['QUERY', 'VIEW']);
        expect(meta.functions[0].result.dimensionality).toBe('matrix');
        expect(meta.functions[1].result.dimensionality).toBe('matrix');
    });

    it('parses key=value and positional arguments for =MJ.QUERY', () => {
        const parsed = ParseExcelQueryFunctionArguments('Renewals by Month', [
            'Year=2026',
            'Active=TRUE',
            [['Region=West', 500]],
        ]);
        expect(parsed).toEqual({
            Kind: 'Query',
            Target: 'Renewals by Month',
            Parameters: {
                Year: 2026,
                Active: true,
                Region: 'West',
            },
            PositionalArguments: [500],
        });
    });

    it('formats scalar and multi-row spill matrices cleanly', () => {
        const scalar = FormatRowsForExcelCustomFunction(
            [{ Name: 'Total', Header: 'Total', DataType: 'Number' }],
            [{ Total: 42500 }],
            false,
        );
        expect(scalar.ScalarValue).toBe(42500);
        expect(scalar.Matrix).toEqual([[42500]]);

        const table = FormatRowsForExcelCustomFunction(
            [
                { Name: 'Month', Header: 'Month', DataType: 'Text' },
                { Name: 'Revenue', Header: 'Revenue', DataType: 'Number' },
            ],
            [
                { Month: 'Jan', Revenue: 1200 },
                { Month: 'Feb', Revenue: 1800 },
            ],
            true,
        );
        expect(table.Matrix).toEqual([
            ['Month', 'Revenue'],
            ['Jan', 1200],
            ['Feb', 1800],
        ]);
    });

    it('batches, deduplicates, caches per-viewer for 60s, caps concurrency at 5, and maps access-denied errors', async () => {
        let currentViewer = 'user-alice';
        let callCount = 0;
        let activeInFlight = 0;
        let maxObservedInFlight = 0;

        const coordinator = new ExcelCustomFunctionCoordinator(
            async (input: ExcelAddinEvaluateCustomFunctionInput): Promise<ExcelAddinEvaluateCustomFunctionOutput> => {
                callCount++;
                activeInFlight++;
                if (activeInFlight > maxObservedInFlight) {
                    maxObservedInFlight = activeInFlight;
                }
                await new Promise(resolve => setTimeout(resolve, 10));
                activeInFlight--;

                if (currentViewer === 'user-denied') {
                    throw new Error('You do not have permission to run this query.');
                }
                if (input.Parameters?.['TenantID']) {
                    throw new Error('The parameter "TenantID" is server-set and cannot be supplied.');
                }
                return {
                    Columns: [{ Name: 'Count', Header: 'Count', DataType: 'Number' }],
                    Matrix: [[100]],
                    ScalarValue: 100,
                    TotalRowCount: 1,
                };
            },
            {
                ViewerScopeKey: () => currentViewer,
                CacheTtlMs: 60_000,
                MaxConcurrency: 5,
            },
        );

        // 1. Deduplicates identical simultaneous calls and caches for 60s
        const [r1, r2] = await Promise.all([
            coordinator.EvaluateQuery('Renewals', 'Year=2026'),
            coordinator.EvaluateQuery('Renewals', 'Year=2026'),
        ]);
        expect(r1).toEqual([[100]]);
        expect(r2).toEqual([[100]]);
        expect(callCount).toBe(1);

        // 2. Enforces concurrency cap of 5 across 12 distinct queries
        await Promise.all(
            Array.from({ length: 12 }, (_, idx) => coordinator.EvaluateQuery(`Query_${idx}`, idx)),
        );
        expect(maxObservedInFlight).toBeLessThanOrEqual(5);

        // 3. Server-set parameter refusal maps to #MJ_ACCESS_DENIED!
        const serverSetRes = await coordinator.EvaluateQuery('Renewals', 'TenantID=evil');
        expect(serverSetRes).toEqual([[EXCEL_CUSTOM_FUNCTION_ACCESS_DENIED]]);

        // 4. Switching viewer to denied user does not hit Alice's cache and returns #MJ_ACCESS_DENIED!
        currentViewer = 'user-denied';
        const deniedRes = await coordinator.EvaluateQuery('Renewals', 'Year=2026');
        expect(deniedRes).toEqual([[EXCEL_CUSTOM_FUNCTION_ACCESS_DENIED]]);

        // 5. Unauthenticated state returns #MJ_SIGN_IN_REQUIRED!
        currentViewer = '';
        const unauthRes = await coordinator.EvaluateView('Members');
        expect(unauthRes).toEqual([[EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED]]);
    });
});
