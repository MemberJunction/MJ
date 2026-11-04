import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunView, RunViewParams, RunViewResult, IRunViewProvider, UserInfo } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { RunViewFeatureChecks } from '../checks/runview-features.checks';

interface MockFieldRow {
    ID: string;
    EntityID: string;
    Sequence: number;
    IsVirtual: boolean;
}

const ENTITY_A = '11111111-1111-4111-8111-111111111111';
const ENTITY_B = '22222222-2222-4222-8222-222222222222';

const FIELD_ROWS: MockFieldRow[] = [
    { ID: 'f-01', EntityID: ENTITY_A, Sequence: 1, IsVirtual: false },
    { ID: 'f-02', EntityID: ENTITY_A, Sequence: 2, IsVirtual: false },
    { ID: 'f-03', EntityID: ENTITY_A, Sequence: 3, IsVirtual: false },
    { ID: 'f-04', EntityID: ENTITY_B, Sequence: 1, IsVirtual: false },
    { ID: 'f-05', EntityID: ENTITY_B, Sequence: 4, IsVirtual: false },
];

function createParameterizedMockProvider(): IRunViewProvider {
    const handleRunView = async (params: RunViewParams): Promise<RunViewResult> => {
        if (params.Parameters) {
            for (const key of Object.keys(params.Parameters)) {
                const cleanKey = key.startsWith('@') ? key.slice(1) : key;
                if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanKey)) {
                    return {
                        Success: false,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: `Invalid parameter name: ${key}`,
                    };
                }
                const filterStr = String(params.ExtraFilter ?? '');
                if (!new RegExp(`@${cleanKey}\\b`).test(filterStr)) {
                    return {
                        Success: false,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: `Unused parameter: ${cleanKey}`,
                    };
                }
            }
        }

        const filterStr = String(params.ExtraFilter ?? '');
        const referencedTokens = [...filterStr.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(m => m[1]);
        for (const token of referencedTokens) {
            const pMap = params.Parameters ?? {};
            if (!(token in pMap) && !(`@${token}` in pMap)) {
                return {
                    Success: false,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: `Missing parameter @${token}`,
                };
            }
        }

        if (params.EntityName === 'MJ: Entities') {
            if (filterStr === 'Name = @targetName') {
                const targetName = params.Parameters?.targetName;
                const matched = targetName === 'MJ: Entities' ? [{ ID: ENTITY_A }] : [];
                return {
                    Success: true,
                    Results: matched,
                    RowCount: matched.length,
                    TotalRowCount: matched.length,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            return {
                Success: true,
                Results: [{ ID: ENTITY_A }, { ID: ENTITY_B }],
                RowCount: 2,
                TotalRowCount: 2,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        }

        if (params.EntityName === 'MJ: Entity Fields') {
            let matching = [...FIELD_ROWS];
            const singleEntity = params.Parameters?.entityId;
            if (typeof singleEntity === 'string') {
                matching = matching.filter(r => r.EntityID === singleEntity);
            }
            const sumSeq = matching.reduce((acc, r) => acc + r.Sequence, 0);
            const totalCount = matching.length;
            const capped = params.MaxRows ? matching.slice(0, params.MaxRows) : matching;
            const results = params.ResultType === 'count_only' ? [] : capped.map(r => ({ ID: r.ID, Sequence: r.Sequence }));

            return {
                Success: true,
                Results: results,
                RowCount: results.length,
                TotalRowCount: params.SkipTotalRowCount && params.ResultType !== 'count_only' ? (undefined as never) : totalCount,
                ExecutionTime: 1,
                ErrorMessage: '',
                AggregateResults: params.Aggregates?.map(agg => ({
                    expression: agg.expression,
                    alias: agg.alias ?? agg.expression,
                    value: agg.expression.startsWith('SUM') ? sumSeq : totalCount,
                })),
            };
        }

        return {
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: '',
        };
    };

    return {
        RunView: handleRunView,
        RunViews: async (paramsList: RunViewParams[]) => Promise.all(paramsList.map(handleRunView)),
    } as IRunViewProvider;
}

describe('RunViewFeatureChecks parameterized legs (RVF8–RVF12)', () => {
    let previousProvider: IRunViewProvider | null = null;

    beforeEach(() => {
        try {
            previousProvider = RunView.Provider;
        } catch {
            previousProvider = null;
        }
        RunView.Provider = createParameterizedMockProvider();
    });

    afterEach(() => {
        if (previousProvider) {
            RunView.Provider = previousProvider;
        }
    });

    const mockCtx = {
        User: { ID: 'it-user-001', Email: 'rvf-tester@example.com' } as UserInfo,
    } as IntegrationCheckContext;

    const parameterizedChecks = RunViewFeatureChecks.filter(c =>
        ['runview-features.RVF8', 'runview-features.RVF9', 'runview-features.RVF10', 'runview-features.RVF11', 'runview-features.RVF12'].includes(c.Id),
    );

    it('registers all 5 parameterized checks (RVF8–RVF12)', () => {
        expect(parameterizedChecks.map(c => c.Id)).toEqual([
            'runview-features.RVF8',
            'runview-features.RVF9',
            'runview-features.RVF10',
            'runview-features.RVF11',
            'runview-features.RVF12',
        ]);
    });

    for (const check of parameterizedChecks) {
        it(`${check.Id} — ${check.Name}`, async () => {
            await expect(check.Fn(mockCtx)).resolves.toBeUndefined();
        });
    }
});
