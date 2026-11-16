import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, IRunQueryProvider, RunQueryResult } from '../generic/interfaces';
import * as loggingModule from '../generic/logging';
import type { QueryInfo } from '../generic/queryInfo';
import type { RunQueryParams } from '../generic/runQuery';
import {
    ComputeTypedQuerySignature,
    DefineTypedQuery,
    GetTypedQueryDriftMode,
    ResetTypedQueryDriftWarnings,
    SetTypedQueryDriftMode,
    SetTypedQueryRowValidation,
    TypedQueryDriftError,
} from '../generic/typedQuery';

function makeMockQueryProvider(rows: Record<string, unknown>[]): {
    provider: IRunQueryProvider;
    calls: Array<{ params: RunQueryParams; contextUser?: unknown }>;
} {
    const calls: Array<{ params: RunQueryParams; contextUser?: unknown }> = [];
    const provider: IRunQueryProvider = {
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
    };
    return { provider, calls };
}

function makeMetadataProviderWithQueries(queries: Partial<QueryInfo>[]): IMetadataProvider {
    return {
        Queries: queries as QueryInfo[],
    } as unknown as IMetadataProvider;
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
            BypassCache: true,
        });

        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([{ ID: 'u-1', Name: 'Ada Lovelace' }]);
        expect(calls).toHaveLength(1);
        expect(calls[0].params).toMatchObject({
            QueryID: '11111111-2222-3333-4444-555555555555',
            Parameters: {},
            MaxRows: 25,
            BypassCache: true,
        });
    });

    it('detects signature drift: logs once per query in warn mode and throws TypedQueryDriftError in throw mode', async () => {
        const expectedSig = ComputeTypedQuerySignature({
            Parameters: [{ Name: 'lookbackDays', Type: 'number', IsRequired: false, DefaultValue: '30' }],
            Fields: [{ Name: 'EntityName', SQLBaseType: 'nvarchar', InAllBranchVariants: true }],
        });

        // Live metadata added a required parameter 'tenantFilter'
        const liveMetadata = makeMetadataProviderWithQueries([
            {
                ID: '99999999-8888-7777-6666-555555555555',
                Name: 'Recent Entity Changes',
                Parameters: [
                    { Name: 'lookbackDays', Type: 'number', IsRequired: false, DefaultValue: '30' },
                    { Name: 'tenantFilter', Type: 'string', IsRequired: true, DefaultValue: null },
                ] as QueryInfo['Parameters'],
                Fields: [
                    { Name: 'EntityName', SQLBaseType: 'nvarchar', InAllBranchVariants: true },
                ] as QueryInfo['Fields'],
            },
        ]);

        const warnSpy = vi.spyOn(loggingModule, 'LogWarning').mockImplementation(() => {});
        const query = DefineTypedQuery<{ lookbackDays?: number }, { EntityName: string }>({
            QueryID: '99999999-8888-7777-6666-555555555555',
            Path: 'MJ/Demos/Recent Entity Changes',
            Signature: expectedSig,
        });

        const { provider } = makeMockQueryProvider([{ EntityName: 'Users' }]);

        // First call in 'warn' mode logs a warning and still runs
        expect(GetTypedQueryDriftMode()).toBe('warn');
        const firstRun = await query.Run({ lookbackDays: 7 }, { provider, metadataProvider: liveMetadata });
        expect(firstRun.Success).toBe(true);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('TypedQuery signature drift detected');

        // Second call for the same query ID does not spam a duplicate warning
        await query.Run({ lookbackDays: 14 }, { provider, metadataProvider: liveMetadata });
        expect(warnSpy).toHaveBeenCalledTimes(1);

        // Switching to 'throw' mode throws TypedQueryDriftError before executing
        SetTypedQueryDriftMode('throw');
        await expect(
            query.Run({ lookbackDays: 30 }, { provider, metadataProvider: liveMetadata }),
        ).rejects.toBeInstanceOf(TypedQueryDriftError);
    });

    it('validates returned rows against RowSchema when row validation is enabled', async () => {
        const warnSpy = vi.spyOn(loggingModule, 'LogWarning').mockImplementation(() => {});
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
