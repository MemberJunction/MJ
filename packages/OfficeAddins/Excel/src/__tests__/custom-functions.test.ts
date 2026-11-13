import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { EXCEL_HANDOFF_VERSION } from '../handoff';
import { EXCEL_WORKBOOK_CONTRACT_VERSION } from '../contract';
import * as connectionStore from '../web/connection-store';
import { SaveServerUrl } from '../web/pane-config';
import {
    ClearCustomFunctionCache,
    GetOrCreateCustomFunctionCoordinator,
    InvalidateCustomFunctionContext,
    RegisterMjExcelCustomFunctions,
    ResolveCustomFunctionContext,
    ValidateExtraFilter,
} from '../web/functions';

describe('Excel Custom Functions (=MJ.QUERY & =MJ.VIEW, § 7.1/7.2 & O8)', () => {
    it('builds Office functions.json metadata for QUERY and VIEW', () => {
        const meta = BuildExcelCustomFunctionsMetadata();
        expect(meta.functions.map(f => f.id)).toEqual(['QUERY', 'VIEW']);
        expect(meta.functions[0].result.dimensionality).toBe('matrix');
        expect(meta.functions[1].result.dimensionality).toBe('matrix');
    });

    it('parses key=value and positional arguments for =MJ.QUERY and preserves leading-zero strings', () => {
        const parsed = ParseExcelQueryFunctionArguments('Renewals by Month', [
            'Year=2026',
            'Zip=01234',
            'Zero=0',
            'Active=TRUE',
            [['Region=West', 500]],
        ]);
        expect(parsed).toEqual({
            Kind: 'Query',
            Target: 'Renewals by Month',
            Parameters: {
                Year: 2026,
                Zip: '01234',
                Zero: 0,
                Active: true,
                Region: 'West',
            },
            PositionalArguments: [500],
        });
    });

    it('formats scalar, empty, and multi-row spill matrices cleanly without coercing empty results to 0', () => {
        const emptyNoHeaders = FormatRowsForExcelCustomFunction(
            [{ Name: 'Total', Header: 'Total', DataType: 'Number' }],
            [],
            false,
        );
        expect(emptyNoHeaders.ScalarValue).toBe('');
        expect(emptyNoHeaders.Matrix).toEqual([['']]);

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

        // 6. Optional 3rd filter argument in =MJ.VIEW forwards Filter and IncludeHeaders cleanly (A5)
        currentViewer = 'user-alice';
        let capturedViewInput: ExcelAddinEvaluateCustomFunctionInput | null = null;
        const viewCoordinator = new ExcelCustomFunctionCoordinator(async (inp) => {
            capturedViewInput = inp;
            return {
                Columns: [{ Name: 'Name', Header: 'Name', DataType: 'Text' }],
                Matrix: [['Name'], ['Alice']],
                ScalarValue: null,
                TotalRowCount: 1,
            };
        });
        const viewMatrix = await viewCoordinator.EvaluateView('Members', 'Active Members', "Status='Active'", false);
        expect(viewMatrix).toEqual([['Name'], ['Alice']]);
        expect(capturedViewInput).toEqual({
            Kind: 'View',
            Target: 'Members',
            ViewNameOrId: 'Active Members',
            Filter: "Status='Active'",
            IncludeHeaders: false,
        });
        expect(BuildExcelCustomFunctionsMetadata().functions[1].parameters.map(p => p.name)).toEqual([
            'entityNameOrId',
            'viewNameOrId',
            'filter',
            'includeHeaders',
        ]);

        // 7. Rejects invalid or unsafe filter expressions in =MJ.VIEW with #VALUE! instead of silently ignoring them, while preserving quoted ' AND ' values
        const badFilterRes = await viewCoordinator.EvaluateView('Members', 'Active Members', "Status LIKE '%Active%'");
        expect(String(badFilterRes[0][0])).toContain('#VALUE!');
        expect(String(badFilterRes[0][0])).not.toContain(EXCEL_CUSTOM_FUNCTION_ACCESS_DENIED);
        const sqlInjFilterRes = await viewCoordinator.EvaluateView('Members', 'Active Members', "Status='Active'; DROP TABLE Users");
        expect(String(sqlInjFilterRes[0][0])).toContain('#VALUE!');

        const quotedAndMatrix = await viewCoordinator.EvaluateView(
            'Members',
            'Active Members',
            "Name='Acme AND Sons' AND Status='Active'",
            false,
        );
        expect(quotedAndMatrix).toEqual([['Name'], ['Alice']]);
        expect(capturedViewInput?.Filter).toBe("Name='Acme AND Sons' AND Status='Active'");
    });

    it('resolves connection once via ResolveContext and refuses cross-server fallback (Round 3 Item 17)', async () => {
        let resolveCount = 0;
        let activeServerHasConnection = false;
        const coord = new ExcelCustomFunctionCoordinator<{ AddinUrl: string; APIKey: string }>(
            async (_inp, opts) => {
                expect(opts?.connection?.AddinUrl).toBe('https://prod.example.org/office/excel');
                return {
                    Columns: [{ Name: 'Revenue', Header: 'Revenue', DataType: 'Number' }],
                    Matrix: [[999]],
                    ScalarValue: 999,
                    TotalRowCount: 1,
                };
            },
            {
                ResolveContext: async () => {
                    resolveCount++;
                    if (!activeServerHasConnection) {
                        throw new Error(EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED);
                    }
                    return {
                        ScopeKey: 'https://prod.example.org/office/excel::alice::fp1',
                        Connection: { AddinUrl: 'https://prod.example.org/office/excel', APIKey: 'mj_sk_prod' },
                    };
                },
            },
        );

        // Unconnected prod workbook returns #MJ_SIGN_IN_REQUIRED! and never caches dev data
        const unconn = await coord.EvaluateQuery('ProdRevenue');
        expect(unconn).toEqual([[EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED]]);
        expect(coord.CacheSize).toBe(0);

        // Connected prod workbook resolves connection ONCE and caches under that connection's scope
        activeServerHasConnection = true;
        resolveCount = 0;
        const connRes = await coord.EvaluateQuery('ProdRevenue');
        expect(connRes).toEqual([[999]]);
        expect(resolveCount).toBe(1);
    });

    it('enforces bounded cache size (MaxCacheEntries) and propagates invocation.onCanceled to AbortSignal', async () => {
        let observedSignal: AbortSignal | undefined;
        const coord = new ExcelCustomFunctionCoordinator(
            async (inp, opts) => {
                observedSignal = opts?.signal;
                return {
                    Columns: [{ Name: 'Val', Header: 'Val', DataType: 'Number' }],
                    Matrix: [[Number(inp.Target.replace('Q', '')) || 1]],
                    ScalarValue: 1,
                    TotalRowCount: 1,
                };
            },
            {
                ViewerScopeKey: () => 'viewer-1',
                MaxCacheEntries: 3,
            },
        );

        await coord.EvaluateQuery('Q1');
        await coord.EvaluateQuery('Q2');
        await coord.EvaluateQuery('Q3');
        await coord.EvaluateQuery('Q4');
        expect(coord.CacheSize).toBe(3);

        const invocation: { onCanceled?: () => void } = {};
        await coord.EvaluateQuery('Q5', 'Year=2026', invocation);
        expect(typeof invocation.onCanceled).toBe('function');
        expect(observedSignal?.aborted).toBe(false);
        invocation.onCanceled?.();
        expect(observedSignal?.aborted).toBe(true);
    });

    it('associates QUERY and VIEW callbacks via RegisterMjExcelCustomFunctions (A5)', () => {
        const associated = new Map<string, (...args: readonly unknown[]) => Promise<unknown>>();
        const ok = RegisterMjExcelCustomFunctions({
            associate: (id, cb) => {
                associated.set(id, cb);
            },
        });
        expect(ok).toBe(true);
        expect([...associated.keys()]).toEqual(['QUERY', 'VIEW']);
        expect(RegisterMjExcelCustomFunctions(undefined)).toBe(false);
    });

    describe('Round 4 Low items: memoized ResolveContext & ValidateExtraFilter SQL metadata guard', () => {
        afterEach(() => {
            InvalidateCustomFunctionContext();
            ClearCustomFunctionCache();
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
        });

        it('memoizes ResolveCustomFunctionContext across evaluations and clears on OnConnectionChanged', async () => {
            const storeMap = new Map<string, string>();
            const mockStorage: Storage = {
                get length(): number {
                    return storeMap.size;
                },
                clear(): void {
                    storeMap.clear();
                },
                getItem(key: string): string | null {
                    return storeMap.get(key) ?? null;
                },
                key(index: number): string | null {
                    return Array.from(storeMap.keys())[index] ?? null;
                },
                removeItem(key: string): void {
                    storeMap.delete(key);
                },
                setItem(key: string, value: string): void {
                    storeMap.set(key, value);
                },
            };
            vi.stubGlobal('window', { localStorage: mockStorage });

            const hostUrl = 'https://prod.example.org/office/excel';
            vi.stubGlobal(
                'fetch',
                vi.fn(async (url: string) => {
                    if (String(url).includes('config.json')) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({
                                ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
                                ServerName: 'Prod MJ',
                                AddinUrl: hostUrl,
                                ExplorerConnectUrl: 'https://explorer.example.org/office/connect',
                                MaxRows: 1000,
                            }),
                        };
                    }
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            data: {
                                ExecuteRemoteOperation: {
                                    success: true,
                                    outputJSON: JSON.stringify({
                                        Columns: [{ Name: 'Val', Header: 'Val', DataType: 'Number' }],
                                        Matrix: [[42]],
                                        ScalarValue: 42,
                                        TotalRowCount: 1,
                                    }),
                                },
                            },
                        }),
                    };
                }),
            );

            SaveServerUrl(hostUrl);

            // Disconnected rejection is NOT sticky — subsequent sign-in retries cleanly
            await expect(ResolveCustomFunctionContext()).rejects.toThrow(EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED);

            connectionStore.SaveConnection(
                {
                    Version: EXCEL_HANDOFF_VERSION,
                    State: 's1',
                    APIKey: 'mj_sk_alice',
                    GraphQLUrl: 'https://prod.example.org/',
                    UserName: 'Alice',
                    UserEmail: 'alice@example.org',
                    ExpiresAt: '2030-01-01T00:00:00.000Z',
                },
                hostUrl,
            );

            const loadSpy = vi.spyOn(connectionStore, 'LoadConnection');
            const coordinator = GetOrCreateCustomFunctionCoordinator();

            // Evaluate 3 distinct uncached queries: LoadConnection should execute only ONCE thanks to memoized ResolveContext!
            await coordinator.EvaluateQuery('Q_One');
            await coordinator.EvaluateQuery('Q_Two');
            await coordinator.EvaluateQuery('Q_Three');
            expect(loadSpy).toHaveBeenCalledTimes(1);

            const firstCtx = await ResolveCustomFunctionContext();
            expect(firstCtx.Connection.UserEmail).toBe('alice@example.org');
            expect(loadSpy).toHaveBeenCalledTimes(1);

            // Switching accounts triggers OnConnectionChanged -> clears memoized context & cache automatically
            connectionStore.SaveConnection(
                {
                    Version: EXCEL_HANDOFF_VERSION,
                    State: 's2',
                    APIKey: 'mj_sk_bob',
                    GraphQLUrl: 'https://prod.example.org/',
                    UserName: 'Bob',
                    UserEmail: 'bob@example.org',
                    ExpiresAt: '2030-01-01T00:00:00.000Z',
                },
                hostUrl,
            );

            const secondCtx = await ResolveCustomFunctionContext();
            expect(secondCtx.Connection.UserEmail).toBe('bob@example.org');
            expect(secondCtx.ScopeKey).not.toBe(firstCtx.ScopeKey);
            expect(loadSpy).toHaveBeenCalledTimes(2);
        });

        it('ValidateExtraFilter blocks SQL Server system/metadata functions & @@ variables outside single-quoted literals with #VALUE!', async () => {
            const blockedVariables = ['@@VERSION', '@@SERVERNAME', '@@SERVICENAME', '@@SPID', '@@LANGUAGE'];
            const blockedFunctions = [
                'SYSTEM_USER',
                'CURRENT_USER',
                'SESSION_USER',
                'USER_NAME',
                'SUSER_NAME',
                'SUSER_SNAME',
                'ORIGINAL_LOGIN',
                'DB_NAME',
                'HOST_NAME',
                'APP_NAME',
                'SCHEMA_NAME',
                'OBJECT_NAME',
                'OBJECT_DEFINITION',
                'HAS_PERMS_BY_NAME',
            ];

            for (const v of blockedVariables) {
                expect(() => ValidateExtraFilter(`Version = ${v}`)).toThrow(/^#VALUE!/);
                expect(() => ValidateExtraFilter(`Version = "${v}"`)).toThrow(/^#VALUE!/);
                expect(() => ValidateExtraFilter(`${v} = 'x'`)).toThrow(/^#VALUE!/);
            }

            for (const fn of blockedFunctions) {
                expect(() => ValidateExtraFilter(`Actor = ${fn}`)).toThrow(/^#VALUE!/);
                expect(() => ValidateExtraFilter(`Actor = ${fn}()`)).toThrow(/^#VALUE!/);
                expect(() => ValidateExtraFilter(`Actor = "${fn}"`)).toThrow(/^#VALUE!/);
                expect(() => ValidateExtraFilter(`${fn} = 'dbo'`)).toThrow(/^#VALUE!/);
            }

            // Single-quoted literal strings containing those exact keywords remain permitted
            expect(ValidateExtraFilter("Notes = 'SYSTEM_USER'")).toBe("Notes = 'SYSTEM_USER'");
            expect(ValidateExtraFilter("Notes = 'Checked @@VERSION and CURRENT_USER'")).toBe(
                "Notes = 'Checked @@VERSION and CURRENT_USER'",
            );

            // End-to-end through GetOrCreateCustomFunctionCoordinator().EvaluateView maps double-quoted bypass attempt to #VALUE!
            const coordinator = GetOrCreateCustomFunctionCoordinator();
            const oracleAttempt = await coordinator.EvaluateView('Members', 'Active Members', 'Name = "SYSTEM_USER"', false);
            expect(String(oracleAttempt[0][0])).toContain('#VALUE!');
        });
    });
});
