import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * What the mocked RunView returns, in call order, and the params of every call.
 * `vi.hoisted` because `vi.mock` factories are lifted above ordinary declarations.
 */
const runViewFixture = vi.hoisted(() => ({
    results: [] as Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }>,
    params: [] as Array<Record<string, unknown>>,
}));

/**
 * What the mocked RunQuery (the GetConversationComplete loader) returns, in call order, and the
 * params of every call.
 */
const runQueryFixture = vi.hoisted(() => ({
    results: [] as Array<{ Success: boolean; Results: unknown[] }>,
    params: [] as Array<Record<string, unknown>>,
}));

// Only the core exports the engine module needs while it loads, plus RunView for the fresh
// reads, RunQuery and an engine base for the detail cache, and UserInfo for the context user.
// @memberjunction/global stays real so ids are escaped and normalised for real.
vi.mock('@memberjunction/core', () => {
    class MockRunView {
        static FromMetadataProvider() {
            return new MockRunView();
        }
        async RunView(params: Record<string, unknown>) {
            runViewFixture.params.push(params);
            return runViewFixture.results.shift() ?? { Success: true, Results: [] };
        }
    }
    /** A row with the entity method the cache refresh calls. */
    function entityLike(data: object): object {
        return { ...data, LoadFromData(this: object, next: object) { Object.assign(this, next); return true; } };
    }
    return {
        BaseEngine: class MockBaseEngine {
            private static instance: unknown;
            static getInstance<T>(): T {
                const ctor = this as unknown as { instance?: T; new (): T };
                ctor.instance ??= new ctor();
                return ctor.instance;
            }
            async Load(): Promise<void> {}
            get ProviderToUse() {
                return { GetEntityObject: async () => entityLike({}) };
            }
        },
        RegisterForStartup: () => () => {},
        RunView: MockRunView,
        RunQuery: class MockRunQuery {
            async RunQuery(params: Record<string, unknown>) {
                runQueryFixture.params.push(params);
                return runQueryFixture.results.shift() ?? { Success: true, Results: [] };
            }
        },
        TransformSimpleObjectToEntityObject: async (_provider: unknown, _entityName: string, rows: object[]) => rows.map(entityLike),
        UserInfo: class MockUserInfo {
            ID = 'user-1';
        },
    };
});

vi.mock('../engines/artifacts', () => ({
    ArtifactMetadataEngine: { Instance: { Config: async () => {} } },
}));

import { UserInfo } from '@memberjunction/core';
import { ConversationEngine, ConversationScope, ConversationBranchRow } from '../engines/conversations';

const C = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C2 = '33333333-3333-3333-3333-333333333333';
const branches: ConversationBranchRow[] = [
    { ID: B, ConversationID: C, ParentBranchID: null, ForkFromSequence: 2, Name: null },
    { ID: C2, ConversationID: C, ParentBranchID: B, ForkFromSequence: 8, Name: null },
];

describe('ConversationScope', () => {
    let user: UserInfo;

    beforeEach(() => {
        runViewFixture.results = [];
        runViewFixture.params = [];
        user = new UserInfo();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('TrunkScope has no branch and no branch rows', () => {
        const s = ConversationEngine.TrunkScope(C);
        expect(s).toEqual({ ConversationID: C, BranchID: null, Branches: [] });
    });

    it('ScopeFilter on the trunk is the exact trunk predicate', () => {
        expect(ConversationEngine.ScopeFilter(ConversationEngine.TrunkScope(C)))
            .toBe(`[ConversationID]='${C}' AND [BranchID] IS NULL`);
    });

    it('ScopeFilter on a nested branch equals BuildBranchPathFilter', () => {
        const s: ConversationScope = { ConversationID: C, BranchID: C2, Branches: branches };
        expect(ConversationEngine.ScopeFilter(s)).toBe(ConversationEngine.BuildBranchPathFilter(C, C2, branches));
        expect(ConversationEngine.ScopeFilter(s)).toContain(`([BranchID]='${B}' AND [Sequence] <= 8)`);
        expect(ConversationEngine.ScopeFilter(s)).toContain(`([BranchID] IS NULL AND [Sequence] <= 2)`);
    });

    it('ScopeFilter escapes apostrophes in ids', () => {
        const s = ConversationEngine.TrunkScope("x'y");
        expect(ConversationEngine.ScopeFilter(s)).toBe(`[ConversationID]='x''y' AND [BranchID] IS NULL`);
    });

    it('BuildBranchPathFilter escapes apostrophes in branch ids', () => {
        const odd: ConversationBranchRow[] = [{ ID: "b'1", ConversationID: C, ParentBranchID: null, ForkFromSequence: 2, Name: null }];
        expect(ConversationEngine.BuildBranchPathFilter(C, "b'1", odd)).toBe(
            `[ConversationID]='${C}' AND ([BranchID]='b''1' OR ([BranchID] IS NULL AND [Sequence] <= 2))`);
    });

    it('ScopeSubquery wraps the filter for a detail-id column', () => {
        const s = ConversationEngine.TrunkScope(C);
        expect(ConversationEngine.ScopeSubquery(s)).toBe(
            `[ConversationDetailID] IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE [ConversationID]='${C}' AND [BranchID] IS NULL)`);
        expect(ConversationEngine.ScopeSubquery(s, 'DetailID')).toMatch(/^\[DetailID\] IN \(/);
    });

    it('IsInScope and FilterToScope follow the path', () => {
        const s: ConversationScope = { ConversationID: C, BranchID: C2, Branches: branches };
        const rows = [
            { ID: 'a', BranchID: null, Sequence: 1 },
            { ID: 'b', BranchID: null, Sequence: 3 },
            { ID: 'c', BranchID: B, Sequence: 7 },
            { ID: 'd', BranchID: B, Sequence: 9 },
            { ID: 'e', BranchID: C2, Sequence: 11 },
        ];
        expect(ConversationEngine.FilterToScope(s, rows).map(r => r.ID)).toEqual(['a', 'c', 'e']);
        expect(ConversationEngine.IsInScope(s, rows[1])).toBe(false);
        expect(ConversationEngine.IsInScope(s, rows[4])).toBe(true);
    });

    it('IsInScope on the trunk keeps only trunk rows', () => {
        const s = ConversationEngine.TrunkScope(C);
        expect(ConversationEngine.IsInScope(s, { BranchID: null, Sequence: 40 })).toBe(true);
        expect(ConversationEngine.IsInScope(s, { BranchID: B, Sequence: 3 })).toBe(false);
    });

    it('ArtifactVersionScopeFilter keeps path-linked and unlinked versions', () => {
        const s = ConversationEngine.TrunkScope(C);
        const f = ConversationEngine.ArtifactVersionScopeFilter(s, 'A1');
        const path = `[ConversationID]='${C}' AND [BranchID] IS NULL`;
        expect(f).toBe(
            `[ArtifactID]='A1' AND (` +
            `[ID] IN (SELECT ArtifactVersionID FROM [__mj].[vwConversationDetailArtifacts] WHERE ConversationDetailID IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE ${path}))` +
            ` OR [ID] NOT IN (SELECT ArtifactVersionID FROM [__mj].[vwConversationDetailArtifacts] WHERE ArtifactVersionID IS NOT NULL)` +
            `)`);
    });

    it('ArtifactVersionScopeFilter counts a link in any direction from a message on the path', () => {
        // Attachments and analyze snapshots are linked to their message with Direction='Input' only.
        // The path clause has no Direction condition, so an Input-only link makes the version visible.
        const f = ConversationEngine.ArtifactVersionScopeFilter(ConversationEngine.TrunkScope(C), 'A1');
        const pathClause = f.slice(0, f.indexOf(' OR [ID] NOT IN'));
        expect(pathClause).toContain('[ID] IN (SELECT ArtifactVersionID FROM [__mj].[vwConversationDetailArtifacts] WHERE ConversationDetailID IN (');
        expect(pathClause).not.toContain('Direction');
    });

    it('ArtifactVersionScopeFilter escapes the artifact id', () => {
        const f = ConversationEngine.ArtifactVersionScopeFilter(ConversationEngine.TrunkScope(C), "a'1");
        expect(f.startsWith(`[ArtifactID]='a''1' AND (`)).toBe(true);
    });

    it('LoadScope normalises an empty branch id to the trunk without loading branches', async () => {
        const spy = vi.spyOn(ConversationEngine, 'LoadBranchesFresh');
        const s = await ConversationEngine.LoadScope(C, '', user);
        expect(s).toEqual({ ConversationID: C, BranchID: null, Branches: [] });
        expect(await ConversationEngine.LoadScope(C, null, user)).toEqual(ConversationEngine.TrunkScope(C));
        expect(await ConversationEngine.LoadScope(C, undefined, user)).toEqual(ConversationEngine.TrunkScope(C));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('LoadScope loads branch rows for a branch and rejects an unknown branch', async () => {
        const spy = vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockResolvedValue(branches);
        const s = await ConversationEngine.LoadScope(C, B, user);
        expect(s.BranchID).toBe(B);
        expect(s.Branches).toEqual(branches);
        await expect(ConversationEngine.LoadScope(C, '99999999-9999-9999-9999-999999999999', user)).rejects.toThrow(/is not a branch of/);
        spy.mockRestore();
    });

    it('LoadScope matches the branch id without regard to case', async () => {
        const upper = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
        const rows: ConversationBranchRow[] = [{ ID: upper, ConversationID: C, ParentBranchID: null, ForkFromSequence: 2, Name: null }];
        vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockResolvedValue(rows);
        const s = await ConversationEngine.LoadScope(C, upper.toLowerCase(), user);
        expect(ConversationEngine.ScopeFilter(s)).toContain(`[BranchID]='${upper}'`);
        expect(s.BranchID).toBe(upper);
    });

    it('LoadScope and BranchPathFilterFresh treat a whitespace-only branch id as the trunk', async () => {
        const spy = vi.spyOn(ConversationEngine, 'LoadBranchesFresh');
        expect(await ConversationEngine.LoadScope(C, '   ', user)).toEqual(ConversationEngine.TrunkScope(C));
        expect(await ConversationEngine.BranchPathFilterFresh(C, ' \t ', user)).toBe(`[ConversationID]='${C}' AND [BranchID] IS NULL`);
        expect(spy).not.toHaveBeenCalled();
    });

    it('ScopeFilter throws when the scope branch is not in its branch rows', () => {
        const s: ConversationScope = { ConversationID: C, BranchID: B, Branches: [] };
        expect(() => ConversationEngine.ScopeFilter(s)).toThrow(/not found/);
    });

    it('LoadScope rejects when the branch rows cannot be read', async () => {
        runViewFixture.results.push({ Success: false, Results: [], ErrorMessage: 'boom' });
        await expect(ConversationEngine.LoadScope(C, B, user)).rejects.toThrow(/boom/);
    });

    it('LoadBranchesFresh escapes the conversation id', async () => {
        await ConversationEngine.LoadBranchesFresh("x'y", user);
        expect(runViewFixture.params[0].ExtraFilter).toBe(`ConversationID='x''y'`);
    });

    it('BranchPathFilterFresh is the scope filter of the loaded scope', async () => {
        runViewFixture.results.push({ Success: true, Results: branches });
        expect(await ConversationEngine.BranchPathFilterFresh(C, C2, user))
            .toBe(ConversationEngine.BuildBranchPathFilter(C, C2, branches));
        expect(await ConversationEngine.BranchPathFilterFresh(C, '', user)).toBe(`[ConversationID]='${C}' AND [BranchID] IS NULL`);
        expect(runViewFixture.params).toHaveLength(1);
    });
});

describe('Engine cache consumers and scope', () => {
    let user: UserInfo;
    let engine: ConversationEngine;
    const branchScope: ConversationScope = { ConversationID: C, BranchID: B, Branches: branches };

    /** One GetConversationComplete row. */
    function row(id: string, branchId: string | null, sequence: number, role: string) {
        return {
            ID: id, ConversationID: C, BranchID: branchId, Sequence: sequence, Role: role, Message: `message ${id}`,
            SummaryOfEarlierConversation: null, AgentRunsJSON: null, ArtifactsJSON: null, RatingsJSON: null,
        };
    }

    /** Rows on the trunk and on branch B, which forks the trunk after Sequence 2. */
    const bothPaths = [
        row('t1', null, 1, 'User'),
        row('t2', null, 2, 'AI'),
        row('t3', null, 3, 'User'),
        row('t4', null, 4, 'AI'),
        row('b3', B, 3, 'User'),
        row('b4', B, 4, 'AI'),
    ];

    beforeEach(() => {
        runViewFixture.results = [];
        runViewFixture.params = [];
        runQueryFixture.results = [];
        runQueryFixture.params = [];
        user = new UserInfo();
        engine = ConversationEngine.Instance;
        engine.ClearCache();
    });

    it('GetAgentContextWindow with a branch scope returns only the path rows of a cache seeded with both paths', async () => {
        runQueryFixture.results.push({ Success: true, Results: bothPaths });
        await engine.LoadConversationDetails(C, user);
        expect(engine.GetCachedDetails(C)).toHaveLength(6);

        const window = await engine.GetAgentContextWindow(C, user, undefined, branchScope);

        expect(window.map(m => m.metadata?.conversationDetailId)).toEqual(['t1', 't2', 'b3', 'b4']);
        expect(runQueryFixture.params).toHaveLength(1);
    });

    it('GetAgentContextWindow with the trunk scope returns the trunk rows, and without a scope every cached row', async () => {
        runQueryFixture.results.push({ Success: true, Results: bothPaths });

        const trunk = await engine.GetAgentContextWindow(C, user, undefined, ConversationEngine.TrunkScope(C));
        const all = await engine.GetAgentContextWindow(C, user);

        expect(trunk.map(m => m.metadata?.conversationDetailId)).toEqual(['t1', 't2', 't3', 't4']);
        expect(all).toHaveLength(6);
    });

    it('LoadConversationDetails with a scope returns the path rows and caches the whole conversation', async () => {
        runQueryFixture.results.push({ Success: true, Results: bothPaths });

        const entry = await engine.LoadConversationDetails(C, user, false, branchScope);

        expect(entry.Details.map(d => d.ID)).toEqual(['t1', 't2', 'b3', 'b4']);
        expect(entry.RawData.map(r => r.ID)).toEqual(['t1', 't2', 'b3', 'b4']);
        expect(engine.GetCachedDetails(C)).toHaveLength(6);
        expect(engine.GetCachedDetailEntry(C)?.RawData).toHaveLength(6);
        expect(runQueryFixture.params[0]).toMatchObject({ QueryName: 'GetConversationComplete', Parameters: { ConversationID: C } });
    });

    it('LoadConversationDetails rejects a scope of another conversation', async () => {
        runQueryFixture.results.push({ Success: true, Results: bothPaths });

        await expect(engine.LoadConversationDetails(C, user, false, ConversationEngine.TrunkScope(C2)))
            .rejects.toThrow(/is not the scope's conversation/);
    });

    it('LoadConversationDetails rejects a scope of another conversation before it reads', async () => {
        runQueryFixture.results.push({ Success: true, Results: bothPaths });

        await expect(engine.LoadConversationDetails(C, user, true, ConversationEngine.TrunkScope(C2)))
            .rejects.toThrow(/is not the scope's conversation/);

        expect(runQueryFixture.params).toHaveLength(0);
        expect(engine.GetCachedDetails(C)).toBeUndefined();
    });

    it('RefreshConversationDetails rejects a scope of another conversation before it reads, cold and warm', async () => {
        await expect(engine.RefreshConversationDetails(C, user, ConversationEngine.TrunkScope(C2)))
            .rejects.toThrow(/is not the scope's conversation/);
        expect(runQueryFixture.params).toHaveLength(0);

        runQueryFixture.results.push({ Success: true, Results: bothPaths });
        await engine.LoadConversationDetails(C, user);
        runQueryFixture.results.push({ Success: true, Results: [...bothPaths, row('b5', B, 5, 'User')] });

        await expect(engine.RefreshConversationDetails(C, user, ConversationEngine.TrunkScope(C2)))
            .rejects.toThrow(/is not the scope's conversation/);

        expect(runQueryFixture.params).toHaveLength(1);
        expect(engine.GetCachedDetails(C)).toHaveLength(6);
    });

    it('RefreshConversationDetails with a scope returns the path rows, cold and warm', async () => {
        runQueryFixture.results.push({ Success: true, Results: bothPaths });
        const cold = await engine.RefreshConversationDetails(C, user, branchScope);
        expect(cold.Details.map(d => d.ID)).toEqual(['t1', 't2', 'b3', 'b4']);

        runQueryFixture.results.push({ Success: true, Results: [...bothPaths, row('b5', B, 5, 'User')] });
        const warm = await engine.RefreshConversationDetails(C, user, branchScope);

        expect(warm.Details.map(d => d.ID)).toEqual(['t1', 't2', 'b3', 'b4', 'b5']);
        expect(engine.GetCachedDetails(C)).toHaveLength(7);
        expect((await engine.RefreshConversationDetails(C, user)).Details).toHaveLength(7);
    });
});
