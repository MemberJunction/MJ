import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogWarning, type IMetadataProvider, type IRunQueryProvider, type RunQueryParams, type RunQueryResult } from '@memberjunction/core';
import { QueryEngine } from '../engines/QueryEngine';
import type { MJQueryEntityExtended } from '../custom/MJQueryEntityExtended';
import {
    ComputeTypedQuerySignature,
    DefineTypedQuery,
    GetTypedQueryDriftMode,
    ResetTypedQueryDriftWarnings,
    SetTypedQueryDriftMode,
    SetTypedQueryRowValidation,
    TypedQueryDriftError,
    TypedQuerySignatureSourceFor,
    type TypedQuerySignatureFieldInput,
    type TypedQuerySignatureParamInput,
} from '../custom/typedQuery';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogWarning: vi.fn() };
});

function makeMockQueryProvider(rows: Record<string, unknown>[]): {
    provider: IRunQueryProvider;
    calls: Array<{ params: RunQueryParams; contextUser?: unknown }>;
} {
    const calls: Array<{ params: RunQueryParams; contextUser?: unknown }> = [];
    // Only the two members TypedQuery.Run reaches.
    const provider = {
        RunQuery: async (params: RunQueryParams, contextUser?: unknown): Promise<RunQueryResult> => {
            calls.push({ params, contextUser });
            return {
                QueryID: params.QueryID ?? '',
                QueryName: params.QueryName ?? 'Test Query',
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: rows.length,
                ExecutionTime: 4,
                ErrorMessage: '',
            };
        },
        RunQueries: async () => [],
    } as unknown as IRunQueryProvider;
    return { provider, calls };
}

/** A saved query as QueryEngine holds it, with only the members the drift check reads. */
function makeLiveQuery(
    id: string,
    parameters: TypedQuerySignatureParamInput[],
    fields: TypedQuerySignatureFieldInput[],
): MJQueryEntityExtended {
    return { ID: id, QueryParameters: parameters, QueryFields: fields } as unknown as MJQueryEntityExtended;
}

/** A metadata provider whose deprecated query getters are empty, as they are unless LoadQueryMetadata is set. */
function makeProviderWithoutQueryMetadata(): IMetadataProvider {
    return { Queries: [], QueryFields: [], QueryParameters: [], InstanceConnectionString: 'test://typed-query' } as unknown as IMetadataProvider;
}

describe('ComputeTypedQuerySignature & TypedQuery', () => {
    beforeEach(() => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(null);
        ResetTypedQueryDriftWarnings();
    });

    afterEach(() => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(null);
        ResetTypedQueryDriftWarnings();
        vi.restoreAllMocks();
        vi.mocked(LogWarning).mockClear();
    });

    it('computes a deterministic sha256 signature independent of parameter/field ordering and ignores IsServerSet params', () => {
        const sigA = ComputeTypedQuerySignature({
            Parameters: [
                { Name: 'region', Type: 'string', IsRequired: true },
                { Name: 'minTotal', Type: 'number', IsRequired: false, DefaultValue: '100' },
                { Name: 'tenantId', Type: 'string', IsRequired: true, IsServerSet: true },
            ],
            Fields: [
                { Name: 'OrderCount', SQLBaseType: 'int', InAllBranchVariants: true },
                { Name: 'Region', SQLBaseType: 'nvarchar(100)', InAllBranchVariants: true },
                { Name: 'Notes', SQLBaseType: 'nvarchar', InAllBranchVariants: false },
            ],
        });

        const sigB = ComputeTypedQuerySignature({
            Parameters: [
                { Name: 'minTotal', Type: 'NUMBER', IsRequired: true, DefaultValue: '100' }, // has default -> optional
                { Name: 'region', Type: 'String', IsRequired: true },
            ],
            Fields: [
                { Name: 'Notes', SQLBaseType: 'NVARCHAR(MAX)', InAllBranchVariants: false },
                { Name: 'Region', SQLBaseType: 'nvarchar', InAllBranchVariants: true },
                { Name: 'OrderCount', SQLBaseType: 'INT', InAllBranchVariants: true },
            ],
        });

        expect(sigA).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(sigA).toBe(sigB);

        // Changing InAllBranchVariants or parameter requiredness changes the signature
        const sigChangedBranch = ComputeTypedQuerySignature({
            Parameters: [
                { Name: 'region', Type: 'string', IsRequired: true },
                { Name: 'minTotal', Type: 'number', IsRequired: false, DefaultValue: '100' },
            ],
            Fields: [
                { Name: 'OrderCount', SQLBaseType: 'int', InAllBranchVariants: true },
                { Name: 'Region', SQLBaseType: 'nvarchar', InAllBranchVariants: true },
                { Name: 'Notes', SQLBaseType: 'nvarchar', InAllBranchVariants: true }, // flipped from false -> true
            ],
        });
        expect(sigChangedBranch).not.toBe(sigA);
    });

    it('executes parameterless and parameterized queries through RunQuery with typed results', async () => {
        interface ActiveUserRow {
            ID: string;
            Name: string;
        }
        const signature = ComputeTypedQuerySignature({
            Parameters: [],
            Fields: [
                { Name: 'ID', SQLBaseType: 'uniqueidentifier', InAllBranchVariants: true },
                { Name: 'Name', SQLBaseType: 'nvarchar', InAllBranchVariants: true },
            ],
        });

        const ActiveUsersQuery = DefineTypedQuery<Record<string, never>, ActiveUserRow>({
            QueryID: '11111111-2222-3333-4444-555555555555',
            Path: 'MJ/Demos/Active Users',
            Signature: signature,
        });

        const { provider, calls } = makeMockQueryProvider([{ ID: 'u-1', Name: 'Ada Lovelace' }]);
        const result = await ActiveUsersQuery.Run(undefined, {
            provider,
            MaxRows: 25,
            CacheLocal: true,
        });

        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([{ ID: 'u-1', Name: 'Ada Lovelace' }]);
        expect(calls).toHaveLength(1);
        expect(calls[0].params).toMatchObject({
            QueryID: '11111111-2222-3333-4444-555555555555',
            Parameters: {},
            MaxRows: 25,
            CacheLocal: true,
        });
    });

    it('detects signature drift from QueryEngine metadata: logs once per query in warn mode and throws TypedQueryDriftError in throw mode', async () => {
        const queryId = '99999999-8888-7777-6666-555555555555';
        const expectedSig = ComputeTypedQuerySignature({
            Parameters: [{ Name: 'lookbackDays', Type: 'number', IsRequired: false, DefaultValue: '30' }],
            Fields: [{ Name: 'EntityName', SQLBaseType: 'nvarchar', InAllBranchVariants: true }],
        });

        // Live metadata added a required parameter 'tenantFilter'. It is in QueryEngine only: the
        // provider's deprecated query getters are empty.
        const live = makeLiveQuery(
            queryId,
            [
                { Name: 'lookbackDays', Type: 'number', IsRequired: false, DefaultValue: '30' },
                { Name: 'tenantFilter', Type: 'string', IsRequired: true, DefaultValue: null },
            ],
            [{ Name: 'EntityName', SQLBaseType: 'nvarchar', InAllBranchVariants: true }],
        );
        vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockImplementation((id: string) => (id === queryId ? live : undefined));

        const warnSpy = vi.mocked(LogWarning);
        const query = DefineTypedQuery<{ lookbackDays?: number }, { EntityName: string }>({
            QueryID: queryId,
            Path: 'MJ/Demos/Recent Entity Changes',
            Signature: expectedSig,
        });

        const { provider } = makeMockQueryProvider([{ EntityName: 'Users' }]);

        // First call in 'warn' mode logs a warning and still runs
        expect(GetTypedQueryDriftMode()).toBe('warn');
        const firstRun = await query.Run({ lookbackDays: 7 }, { provider });
        expect(firstRun.Success).toBe(true);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('TypedQuery signature drift detected');

        // Second call for the same query ID does not spam a duplicate warning
        await query.Run({ lookbackDays: 14 }, { provider });
        expect(warnSpy).toHaveBeenCalledTimes(1);

        // Switching to 'throw' mode throws TypedQueryDriftError before executing
        SetTypedQueryDriftMode('throw');
        await expect(query.Run({ lookbackDays: 30 }, { provider })).rejects.toBeInstanceOf(TypedQueryDriftError);
    });

    it('checks drift against the QueryEngine of the metadataProvider option, not the provider getters', async () => {
        const queryId = '12121212-3434-5656-7878-909090909090';
        const live = makeLiveQuery(queryId, [], [{ Name: 'Total', SQLBaseType: 'int', InAllBranchVariants: true }]);
        const perConnectionEngine = { FindQueryByID: (id: string) => (id === queryId ? live : undefined) } as unknown as QueryEngine;
        const lookup = vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(perConnectionEngine);
        const metadataProvider = makeProviderWithoutQueryMetadata();

        const query = DefineTypedQuery<Record<string, never>, { Total: number }>({
            QueryID: queryId,
            Path: 'Sales/Totals',
            Signature: ComputeTypedQuerySignature({ Parameters: [], Fields: [{ Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true }] }),
        });
        SetTypedQueryDriftMode('throw');

        const { provider } = makeMockQueryProvider([{ Total: 1 }]);
        await expect(query.Run(undefined, { provider, metadataProvider })).rejects.toBeInstanceOf(TypedQueryDriftError);
        expect(lookup).toHaveBeenCalledWith(metadataProvider, QueryEngine);
    });

    it('skips the drift check when QueryEngine does not hold the query', async () => {
        vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockReturnValue(undefined);
        SetTypedQueryDriftMode('throw');
        const query = DefineTypedQuery<Record<string, never>, { X: number }>({
            QueryID: '34343434-0000-0000-0000-000000000034',
            Path: 'Unknown/Query',
            Signature: 'sha256:does-not-match',
        });

        const { provider, calls } = makeMockQueryProvider([{ X: 1 }]);
        const res = await query.Run(undefined, { provider });
        expect(res.Success).toBe(true);
        expect(calls).toHaveLength(1);
    });

    it('hashes a QueryEngine query the way CodeGen does: its QueryParameters and QueryFields', () => {
        const parameters: TypedQuerySignatureParamInput[] = [{ Name: 'region', Type: 'string', IsRequired: true }];
        const fields: TypedQuerySignatureFieldInput[] = [{ Name: 'Total', SQLBaseType: 'int', InAllBranchVariants: true }];
        const source = TypedQuerySignatureSourceFor(makeLiveQuery('56565656-0000-0000-0000-000000000056', parameters, fields));
        expect(ComputeTypedQuerySignature(source)).toBe(ComputeTypedQuerySignature({ Parameters: parameters, Fields: fields }));
    });

    it('validates returned rows against RowSchema when row validation is enabled', async () => {
        const warnSpy = vi.mocked(LogWarning);
        SetTypedQueryRowValidation(true);

        const query = DefineTypedQuery<Record<string, never>, { Total: number }>({
            QueryID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            Path: 'Sales/Summary',
            Signature: '',
            RowSchema: {
                safeParse(data: unknown) {
                    const row = data as { Total?: unknown };
                    if (typeof row?.Total === 'number') {
                        return { success: true, data: { Total: row.Total } };
                    }
                    return { success: false, error: { message: 'Expected Total to be a number' } };
                },
            },
        });

        const { provider } = makeMockQueryProvider([{ Total: 'not-a-number' }]);
        const res = await query.Run(undefined, { provider });
        expect(res.Success).toBe(true);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain("TypedQuery row validation warning for 'Sales/Summary'");
    });
});

describe('TypedQuery — an orders-by-region wrapper end to end', () => {
    const queryId = '11111111-2222-3333-4444-555555555555';
    const baseSpec = {
        Parameters: [
            { Name: 'region', Type: 'string', IsRequired: true, DefaultValue: null },
            { Name: 'minTotal', Type: 'number', IsRequired: false, DefaultValue: '100' },
        ],
        Fields: [
            { Name: 'OrderID', SQLBaseType: 'uniqueidentifier', InAllBranchVariants: true },
            { Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true },
            { Name: 'DiscountCode', SQLBaseType: 'nvarchar', InAllBranchVariants: false },
        ],
    };

    beforeEach(() => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(false);
        ResetTypedQueryDriftWarnings();
    });

    afterEach(() => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(false);
        ResetTypedQueryDriftWarnings();
        vi.restoreAllMocks();
        vi.mocked(LogWarning).mockClear();
    });

    it('computes a deterministic sha256 signature that is insensitive to order and sensitive to structural changes', () => {
        const sig1 = ComputeTypedQuerySignature(baseSpec);
        const sig2 = ComputeTypedQuerySignature({
            Parameters: [...baseSpec.Parameters].reverse(),
            Fields: [...baseSpec.Fields].reverse(),
        });
        expect(sig1).toBe(sig2);
        expect(sig1).toMatch(/^sha256:[0-9a-f]{64}$/);

        const sigChanged = ComputeTypedQuerySignature({
            ...baseSpec,
            Fields: [
                ...baseSpec.Fields.slice(0, 2),
                { Name: 'DiscountCode', SQLBaseType: 'nvarchar', InAllBranchVariants: true },
            ],
        });
        expect(sigChanged).not.toBe(sig1);
    });

    it('executes TypedQuery.Run(), detects signature drift in warn/throw modes, and validates rows when enabled', async () => {
        const signature = ComputeTypedQuerySignature(baseSpec);

        interface OrdersByRegionParams {
            region: string;
            minTotal?: number;
        }
        interface OrdersByRegionRow {
            OrderID: string;
            Total: number;
            DiscountCode?: string | null;
        }

        const OrdersByRegion = DefineTypedQuery<OrdersByRegionParams, OrdersByRegionRow>({
            QueryID: queryId,
            Path: 'Sales/Reports/Orders By Region',
            Signature: signature,
            RowSchema: {
                safeParse(row: unknown) {
                    const r = row as Record<string, unknown>;
                    if (typeof r?.OrderID === 'string' && typeof r?.Total === 'number') {
                        return { success: true, data: r as unknown as OrdersByRegionRow };
                    }
                    return { success: false, error: { message: 'Invalid Total' } };
                },
            },
        });

        let liveQuery = makeLiveQuery(queryId, baseSpec.Parameters, baseSpec.Fields);
        vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockImplementation((id: string) => (id === queryId ? liveQuery : undefined));

        const runQuerySpy = vi.fn(async (): Promise<RunQueryResult> => ({
            QueryID: queryId,
            QueryName: 'Orders By Region',
            Success: true,
            Results: [{ OrderID: 'ord-1', Total: 250 }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 5,
            ErrorMessage: '',
        }));

        const fakeProvider = { RunQuery: runQuerySpy } as unknown as IRunQueryProvider;

        const res = await OrdersByRegion.Run({ region: 'EMEA' }, { provider: fakeProvider });
        expect(res.Success).toBe(true);
        expect(res.Results[0].OrderID).toBe('ord-1');
        expect(runQuerySpy).toHaveBeenCalledWith(
            expect.objectContaining({
                QueryID: queryId,
                Parameters: { region: 'EMEA' },
            }),
            undefined,
        );

        // The live query gains a required parameter: drift
        liveQuery = makeLiveQuery(
            queryId,
            [...baseSpec.Parameters, { Name: 'newRequiredParam', Type: 'string', IsRequired: true, DefaultValue: null }],
            baseSpec.Fields,
        );

        // In 'throw' mode, drift throws TypedQueryDriftError before executing RunQuery
        SetTypedQueryDriftMode('throw');
        expect(GetTypedQueryDriftMode()).toBe('throw');
        await expect(
            OrdersByRegion.Run({ region: 'EMEA' }, { provider: fakeProvider }),
        ).rejects.toThrow(TypedQueryDriftError);

        // Row validation when enabled logs a warning on schema mismatch
        liveQuery = makeLiveQuery(queryId, baseSpec.Parameters, baseSpec.Fields);
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(true);
        const warnSpy = vi.mocked(LogWarning);
        const badRowProvider = {
            RunQuery: vi.fn(async (): Promise<RunQueryResult> => ({
                QueryID: queryId,
                QueryName: 'Orders By Region',
                Success: true,
                Results: [{ OrderID: 'ord-1', Total: 'not-a-number' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 3,
                ErrorMessage: '',
            })),
        } as unknown as IRunQueryProvider;

        await OrdersByRegion.Run({ region: 'EMEA' }, { provider: badRowProvider });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("TypedQuery row validation warning for 'Sales/Reports/Orders By Region'"),
        );
    });
});
