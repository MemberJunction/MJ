import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import type { SearchParams } from '@memberjunction/search-engine';
import { NormalizeScopedSearchQuery } from '../custom/search/search-query.util';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => <T>(target: T): T => target,
        UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    };
});

const searchSpy = vi.fn();
const streamSearchSpy = vi.fn();
const permissionResolveSpy = vi.fn();
const logForbiddenSpy = vi.fn();

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Search: (params: SearchParams, user: UserInfo) => searchSpy(params, user),
            streamSearch: (params: SearchParams, user: UserInfo) => streamSearchSpy(params, user),
            LogForbiddenSearch: (params: object) => logForbiddenSpy(params),
        },
    },
    GetSearchScopePermissionResolver: () => ({
        ResolveEffectivePermission: (scopeID: string, user: UserInfo) => permissionResolveSpy(scopeID, user),
    }),
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core-entities')>()),
    SearchEngineBase: {
        Instance: {
            Config: vi.fn(async () => {}),
            GetAgentScopes: () => [],
            GetActiveScopeByID: (id: string) => ({ ID: id, Name: 'Policy Scope', IsGlobal: false }),
            get GlobalScope() {
                return { ID: 'global-id', Name: 'Global', IsGlobal: true };
            },
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: () => false,
    Metadata: class {
        GetEntityObject = async () => ({
            ID: 'agent-1',
            Name: 'Test Agent',
            SearchScopeAccess: 'All',
            Load: async () => true,
        });
    },
    UserInfo: class {},
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => {}),
            get Agents() {
                return [];
            },
            get Skills() {
                return [];
            },
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: RunActionParams): Promise<ActionResultSimple> {
            return { Success: true, ResultCode: 'SUCCESS' };
        }
    },
}));

import { ScopedSearchAction } from '../custom/search/scoped-search.action';

/**
 * Wall-clock ceiling for the pathological-input check. It guards against catastrophic or polynomial
 * backtracking (seconds), not machine speed: tight millisecond bounds fail on shared CI runners
 * (v6.3.0-edge.0's publish gate failed one at 211 ms vs 200 ms).
 */
const PATHOLOGICAL_INPUT_CEILING_MS = 2000;

class TestableScopedSearchAction extends ScopedSearchAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function makeRunParams(query: string): RunActionParams {
    return {
        Action: { Name: 'Scoped Search' },
        ContextUser: { ID: 'user-1', Name: 'User' },
        Params: [
            { Name: 'Query', Value: query, Type: 'Input' },
            { Name: 'AgentID', Value: 'agent-1', Type: 'Input' },
            { Name: 'ScopeID', Value: 'scope-policy', Type: 'Input' },
        ],
        Filters: [],
    } as RunActionParams;
}

async function runScopedSearch(action: TestableScopedSearchAction, query: string): Promise<ActionResultSimple> {
    return action.RunForTest(makeRunParams(query));
}

describe('NormalizeScopedSearchQuery', () => {
    it('returns plain queries unchanged aside from whitespace trimming/collapsing', () => {
        expect(NormalizeScopedSearchQuery('refund policy')).toBe('refund policy');
        expect(NormalizeScopedSearchQuery('  quarterly   budget   review  ')).toBe('quarterly budget review');
    });

    it('unwraps surrounding straight and curly double quotes, including nested wraps', () => {
        expect(NormalizeScopedSearchQuery('"Executive Steering Review"')).toBe('Executive Steering Review');
        expect(NormalizeScopedSearchQuery('  “Executive Steering Review”  ')).toBe('Executive Steering Review');
        expect(NormalizeScopedSearchQuery('""double wrapped""')).toBe('double wrapped');
        expect(NormalizeScopedSearchQuery('"  refund   policy  "')).toBe('refund policy');
    });

    it('unwraps surrounding straight and curly single quotes', () => {
        expect(NormalizeScopedSearchQuery("'Executive Steering Review'")).toBe('Executive Steering Review');
        expect(NormalizeScopedSearchQuery('‘Executive Steering Review’')).toBe('Executive Steering Review');
        expect(NormalizeScopedSearchQuery("''nested single''")).toBe('nested single');
    });

    it('strips embedded quoted phrases cleanly without concatenating adjacent tokens', () => {
        expect(NormalizeScopedSearchQuery('budget "Q3 review" plan')).toBe('budget Q3 review plan');
        expect(NormalizeScopedSearchQuery('"Q1" "Q2" summary')).toBe('Q1 Q2 summary');
        expect(NormalizeScopedSearchQuery("find 'Executive Steering Review' docs")).toBe('find Executive Steering Review docs');
        expect(NormalizeScopedSearchQuery("'alpha' and 'beta'")).toBe('alpha and beta');
        expect(NormalizeScopedSearchQuery('prefix"inner phrase"suffix')).toBe('prefix inner phrase suffix');
        expect(NormalizeScopedSearchQuery('“alpha” and “beta”')).toBe('alpha and beta');
    });

    it('preserves internal apostrophes and trailing s-possessives across quoted and unquoted forms', () => {
        expect(NormalizeScopedSearchQuery("O'Brien's report")).toBe("O'Brien's report");
        expect(NormalizeScopedSearchQuery("don't fail")).toBe("don't fail");
        expect(NormalizeScopedSearchQuery("it's 2025's forecast")).toBe("it's 2025's forecast");
        expect(NormalizeScopedSearchQuery("James' report")).toBe("James' report");
        expect(NormalizeScopedSearchQuery("users' and admins' roles")).toBe("users' and admins' roles");
        expect(NormalizeScopedSearchQuery("'O'Brien's report'")).toBe("O'Brien's report");
        expect(NormalizeScopedSearchQuery('"O\'Brien\'s report"')).toBe("O'Brien's report");
        expect(NormalizeScopedSearchQuery("'James' report'")).toBe("James' report");
        expect(NormalizeScopedSearchQuery(`find "O'Brien's report" in legal`)).toBe("find O'Brien's report in legal");
    });

    it('handles escaped quotes cleanly without corrupting non-quote backslashes', () => {
        expect(NormalizeScopedSearchQuery('\\"refund policy\\"')).toBe('refund policy');
        expect(NormalizeScopedSearchQuery("\\'refund policy\\'")).toBe('refund policy');
        expect(NormalizeScopedSearchQuery('search for \\"exact match\\" today')).toBe('search for exact match today');
        expect(NormalizeScopedSearchQuery("O\\'Brien\\'s report")).toBe("O'Brien's report");
        expect(NormalizeScopedSearchQuery('"say \\"hello\\" now"')).toBe('say hello now');
        expect(NormalizeScopedSearchQuery('C:\\Docs\\Q3')).toBe('C:\\Docs\\Q3');
    });

    it('processes long repeated-backslash inputs in linear time without polynomial backtracking', () => {
        const backslashes = '\\'.repeat(50_000);
        const start = performance.now();
        expect(NormalizeScopedSearchQuery(`${backslashes}alpha`)).toBe(`${backslashes}alpha`);
        expect(NormalizeScopedSearchQuery(`${backslashes}"quoted"`)).toBe('quoted');
        expect(NormalizeScopedSearchQuery(`${backslashes}'single quoted'`)).toBe('single quoted');
        expect(NormalizeScopedSearchQuery(`${backslashes}`)).toBe(backslashes);
        const elapsedMs = performance.now() - start;
        expect(elapsedMs).toBeLessThan(PATHOLOGICAL_INPUT_CEILING_MS);
    });

    it('reduces empty or whitespace-only quotes to empty string', () => {
        expect(NormalizeScopedSearchQuery('')).toBe('');
        expect(NormalizeScopedSearchQuery('   ')).toBe('');
        expect(NormalizeScopedSearchQuery('""')).toBe('');
        expect(NormalizeScopedSearchQuery("''")).toBe('');
        expect(NormalizeScopedSearchQuery('“”')).toBe('');
        expect(NormalizeScopedSearchQuery('‘’')).toBe('');
        expect(NormalizeScopedSearchQuery('  "   "  ')).toBe('');
        expect(NormalizeScopedSearchQuery('""""')).toBe('');
        expect(NormalizeScopedSearchQuery('\\"\\"')).toBe('');
        expect(NormalizeScopedSearchQuery('find "" in policy')).toBe('find in policy');
    });

    it('strips unbalanced quotes without syntax errors or mangled tokens', () => {
        expect(NormalizeScopedSearchQuery('"unclosed phrase')).toBe('unclosed phrase');
        expect(NormalizeScopedSearchQuery('unclosed phrase"')).toBe('unclosed phrase');
        expect(NormalizeScopedSearchQuery('"foo "bar')).toBe('foo bar');
        expect(NormalizeScopedSearchQuery("'unclosed single")).toBe('unclosed single');
        expect(NormalizeScopedSearchQuery("unclosed single'")).toBe('unclosed single');
        expect(NormalizeScopedSearchQuery("'foo 'bar")).toBe('foo bar');
        expect(NormalizeScopedSearchQuery('"')).toBe('');
        expect(NormalizeScopedSearchQuery("'")).toBe('');
        expect(NormalizeScopedSearchQuery('"""')).toBe('');
        expect(NormalizeScopedSearchQuery('6" pipe')).toBe('6 pipe');
    });
});

describe('ScopedSearchAction query unquoting and receipt forwarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        permissionResolveSpy.mockResolvedValue({
            Allowed: true,
            Level: 'Search',
            Source: 'DirectGrant',
            Reason: 'ok',
            toSqlPredicate: () => '1=1',
        });
        searchSpy.mockResolvedValue({
            Success: true,
            Results: [],
            TotalCount: 0,
            ElapsedMs: 2,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            Providers: [],
        });
    });

    it.each<[string, string]>([
        ['"refund policy"', 'refund policy'],
        ["'refund policy'", 'refund policy'],
        ["O'Brien's report", "O'Brien's report"],
        ["'don't lose \"Q3 review\" notes'", "don't lose Q3 review notes"],
        ['\\"escaped phrase\\"', 'escaped phrase'],
        ['"unbalanced query', 'unbalanced query'],
    ])('normalizes Query=%s to %s before calling SearchEngine.Search', async (raw, expected) => {
        const action = new TestableScopedSearchAction();
        const res = await runScopedSearch(action, raw);

        expect(res.Success).toBe(true);
        expect(searchSpy).toHaveBeenCalledOnce();
        expect(searchSpy.mock.calls[0][0].Query).toBe(expected);
    });

    it.each<string>(['""', "''", '  "   "  ', '\\"\\"'])('rejects empty-quoted Query=%s with MISSING_QUERY', async (raw) => {
        const action = new TestableScopedSearchAction();
        const res = await runScopedSearch(action, raw);

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('MISSING_QUERY');
        expect(searchSpy).not.toHaveBeenCalled();
    });

    it('preserves OriginatingScopeID, OriginatingScopeName, and OriginatingScopes on FormattedSearchResult', async () => {
        searchSpy.mockResolvedValueOnce({
            Success: true,
            Results: [
                {
                    ID: 'rec-1',
                    EntityName: 'Docs',
                    RecordID: 'rec-1',
                    SourceType: 'vector',
                    ResultType: 'entity-record',
                    Title: 'Q3 Policy',
                    Snippet: 'Policy text',
                    Score: 0.95,
                    ScoreBreakdown: { Vector: 0.95 },
                    Tags: ['policy'],
                    MatchedAt: new Date('2026-01-01T00:00:00Z'),
                    OriginatingScopeID: 'scope-legal',
                    OriginatingScopeName: 'Legal',
                    OriginatingScopes: [
                        { ScopeID: 'scope-legal', ScopeName: 'Legal' },
                        { ScopeID: 'scope-hr', ScopeName: 'HR' },
                    ],
                },
            ],
            TotalCount: 1,
            ElapsedMs: 3,
            SourceCounts: { Vector: 1, FullText: 0, Entity: 0, Storage: 0 },
            Providers: [],
        });

        const action = new TestableScopedSearchAction();
        const res = await runScopedSearch(action, '"Q3 Policy"');

        expect(res.Success).toBe(true);
        const resultsParam = res.Params?.find(p => p.Name === 'Results');
        const rows = resultsParam?.Value as Array<{
            OriginatingScopeID?: string;
            OriginatingScopeName?: string;
            OriginatingScopes?: Array<{ ScopeID: string; ScopeName?: string }>;
        }>;
        expect(rows).toHaveLength(1);
        expect(rows[0].OriginatingScopeID).toBe('scope-legal');
        expect(rows[0].OriginatingScopeName).toBe('Legal');
        expect(rows[0].OriginatingScopes).toEqual([
            { ScopeID: 'scope-legal', ScopeName: 'Legal' },
            { ScopeID: 'scope-hr', ScopeName: 'HR' },
        ]);
    });
});
