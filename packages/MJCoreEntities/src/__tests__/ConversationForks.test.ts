import { describe, it, expect, vi, beforeEach } from 'vitest';

/** What the mocked RunViews returns per call (FIFO), and the params of every call. */
const runViewsFixture = vi.hoisted(() => ({
    results: [] as Array<Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }>>,
    params: [] as Array<Array<Record<string, unknown>>>,
}));

// Only the core exports the engine module needs while it loads, plus RunView for the summary
// reads. @memberjunction/global stays real so ids are escaped and normalised for real.
vi.mock('@memberjunction/core', () => {
    class MockRunView {
        static FromMetadataProvider(): MockRunView {
            return new MockRunView();
        }
        async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: true, Results: [] };
        }
        async RunViews(params: Array<Record<string, unknown>>): Promise<Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }>> {
            runViewsFixture.params.push(params);
            return runViewsFixture.results.shift() ?? params.map(() => ({ Success: true, Results: [] }));
        }
    }
    return { BaseEngine: class {}, RegisterForStartup: () => () => {}, RunView: MockRunView };
});

import { ConversationEngine, ForkSummaryRowFields, type ConversationBranchRow, type ForkSummaryRow } from '../engines/conversations';

const C = 'conv-1';
const MAYA = 'u-maya';
const JORDAN = 'u-jordan';
const PRIYA = 'u-priya';
const SAGE = 'a-sage';
const user = { ID: 'user-1' } as never;

type Who = { UserID?: string; User?: string; AgentID?: string; Agent?: string };
const maya: Who = { UserID: MAYA, User: 'Maya Chen' };
const jordan: Who = { UserID: JORDAN, User: 'Jordan Ellis' };
const priya: Who = { UserID: PRIYA, User: 'Priya Natarajan' };
/** Agent rows also carry the sender's UserID; the agent is the participant. */
const sage: Who = { AgentID: SAGE, Agent: 'Sage', UserID: MAYA, User: 'Maya Chen' };

function row(id: string, branchId: string | null, sequence: number, role: NonNullable<ForkSummaryRow['Role']>, who: Who, message: string | null, extra: Partial<ForkSummaryRow> = {}): ForkSummaryRow {
    return {
        ID: id, BranchID: branchId, Sequence: sequence, Role: role, Message: message,
        UserID: who.UserID ?? null, AgentID: who.AgentID ?? null, User: who.User ?? null, Agent: who.Agent ?? null,
        HiddenToUser: false,
        __mj_CreatedAt: new Date(Date.UTC(2026, 9, 6, 14, sequence)).toISOString(),
        ...extra,
    };
}

const T1: ConversationBranchRow = { ID: 'T1', ConversationID: C, ParentBranchID: null, ForkFromSequence: 2, Name: null, Kind: 'Fork', SourceDetailID: null, UserID: JORDAN, User: 'Jordan Ellis', __mj_CreatedAt: '2026-10-06T14:20:00.000Z' };
const F1: ConversationBranchRow = { ID: 'F1', ConversationID: C, ParentBranchID: 'T1', ForkFromSequence: 11, Name: '  Annual plans only ', Kind: 'Fork', SourceDetailID: null, UserID: PRIYA, User: 'Priya Natarajan', __mj_CreatedAt: '2026-10-06T14:30:00.000Z' };
const E1: ConversationBranchRow = { ID: 'E1', ConversationID: C, ParentBranchID: null, ForkFromSequence: 4, Name: null, Kind: 'Edit', SourceDetailID: 'd-5', UserID: MAYA, User: 'Maya Chen', __mj_CreatedAt: '2026-10-06T14:40:00.000Z' };
const R1: ConversationBranchRow = { ID: 'R1', ConversationID: C, ParentBranchID: null, ForkFromSequence: 5, Name: null, Kind: 'Regenerate', SourceDetailID: 'd-6', UserID: JORDAN, User: 'Jordan Ellis', __mj_CreatedAt: '2026-10-06T14:50:00.000Z' };
/** An edit of the first message: no predecessor, so no anchor. */
const EF: ConversationBranchRow = { ID: 'EF', ConversationID: C, ParentBranchID: null, ForkFromSequence: null, Name: null, Kind: 'Edit', SourceDetailID: 'd-1', UserID: MAYA, User: 'Maya Chen', __mj_CreatedAt: '2026-10-06T15:00:00.000Z' };
/** A row from before Kind existed, with no messages yet. */
const BARE: ConversationBranchRow = { ID: 'X1', ConversationID: C, ParentBranchID: null, ForkFromSequence: 2, Name: null, UserID: MAYA, User: 'Maya Chen', __mj_CreatedAt: '2026-10-06T15:10:00.000Z' };

const OWN: ForkSummaryRow[] = [
    row('t1-a', 'T1', 10, 'User', jordan, 'What if we skip the free tier at launch? @{"type":"agent","id":"a-sage","name":"Sage"} how does that change the plan?'),
    row('t1-b', 'T1', 11, 'AI', sage, 'Fewer people start a trial, but paid sign-ups start in week 1.'),
    row('t1-c', 'T1', 12, 'User', maya, 'Can we compare both options?'),
    row('t1-h', 'T1', 13, 'AI', sage, 'system anchor', { HiddenToUser: true }),
    row('f1-a', 'F1', 14, 'User', priya, 'Annual only then.'),
    row('e1-a', 'E1', 15, 'User', maya, 'The email goes out in week 3.'),
    row('r1-a', 'R1', 16, 'AI', sage, 'The email can go out in week 2 if the pricing page is ready.'),
];
const ANCHORS: ForkSummaryRow[] = [
    row('d-2', null, 2, 'AI', sage, 'Here is a one-page launch plan.'),
    row('t1-b', 'T1', 11, 'AI', sage, 'Fewer people start a trial, but paid sign-ups start in week 1.'),
    row('d-4', null, 4, 'User', maya, 'Thanks.'),
    row('d-5', null, 5, 'User', maya, 'Update the plan.'),
];
/** The source messages of E1 (d-5) and R1 (d-6); EF's source d-1 is not read. */
const SOURCES: ForkSummaryRow[] = [
    row('D-5', null, 5, 'User', maya, 'Update the plan.'),
    row('d-6', null, 6, 'AI', sage, 'The email goes out in week 4.'),
];

describe('fork text helpers', () => {
    it('NormalizeForkKind keeps the three kinds and treats anything else as Fork', () => {
        expect(ConversationEngine.NormalizeForkKind('Regenerate')).toBe('Regenerate');
        expect(ConversationEngine.NormalizeForkKind('Edit')).toBe('Edit');
        expect(ConversationEngine.NormalizeForkKind(undefined)).toBe('Fork');
        expect(ConversationEngine.NormalizeForkKind('bogus')).toBe('Fork');
        expect(ConversationEngine.NormalizeForkKind('Thread')).toBe('Fork');
    });

    it('ForkFirstWords takes six words or 40 characters and marks a cut', () => {
        expect(ConversationEngine.ForkFirstWords('Can we move the customer email to week 2?')).toBe('Can we move the customer email…');
        expect(ConversationEngine.ForkFirstWords('Pricing')).toBe('Pricing');
        expect(ConversationEngine.ForkFirstWords('a'.repeat(50))).toBe(`${'a'.repeat(40)}…`);
        expect(ConversationEngine.ForkFirstWords('   ')).toBeNull();
        expect(ConversationEngine.ForkFirstWords(null)).toBeNull();
    });

    it('ForkPlainText turns stored mentions into @names and drops nameless ones', () => {
        expect(ConversationEngine.ForkPlainText('@{"type":"agent","id":"a1","name":"Sage"}  draft it')).toBe('@Sage draft it');
        expect(ConversationEngine.ForkPlainText('@{"type":"skill","id":"s1"} go')).toBe('go');
    });

    it('ForkPreviewText keeps 120 characters and marks a cut', () => {
        expect(ConversationEngine.ForkPreviewText('short')).toBe('short');
        expect(ConversationEngine.ForkPreviewText('b'.repeat(130))).toBe(`${'b'.repeat(120)}…`);
    });

    it('ForkDisplayName uses the name, else the default of the kind', () => {
        expect(ConversationEngine.ForkDisplayName({ Name: ' Pricing ', Kind: 'Fork' }, null)).toBe('Pricing');
        expect(ConversationEngine.ForkDisplayName({ Kind: 'Fork' }, 'Can we move the customer email to week 2?')).toBe('Can we move the customer email…');
        expect(ConversationEngine.ForkDisplayName({ Kind: 'Fork' }, null)).toBe('Fork');
        expect(ConversationEngine.ForkDisplayName({}, 'Annual only then.')).toBe('Annual only then.');
        expect(ConversationEngine.ForkDisplayName({}, null)).toBe('Fork');
        expect(ConversationEngine.ForkDisplayName({ Kind: 'Edit' }, 'ignored')).toBe('Edited version');
        expect(ConversationEngine.ForkDisplayName({ Kind: 'Regenerate' }, 'ignored')).toBe('Other answer');
    });
});

describe('fork points', () => {
    const path = [
        { ID: 't1-a', Sequence: 10, BranchID: 'T1' },
        { ID: 'd-1', Sequence: 1, BranchID: null },
        { ID: 'd-2', Sequence: 2, BranchID: null },
    ];

    it('ForkPointFrom forks at the message itself, on its branch', () => {
        expect(ConversationEngine.ForkPointFrom({ BranchID: 'T1', Sequence: 11 })).toEqual({ ParentBranchID: 'T1', ForkFromSequence: 11 });
        expect(ConversationEngine.ForkPointFrom({ Sequence: 3 })).toEqual({ ParentBranchID: null, ForkFromSequence: 3 });
    });

    it('EditForkPoint forks at the row before the message on its path', () => {
        expect(ConversationEngine.EditForkPoint({ ID: 't1-a', Sequence: 10 }, path)).toEqual({ ParentBranchID: null, ForkFromSequence: 2 });
    });

    it('EditForkPoint forks before the first message when nothing precedes it', () => {
        expect(ConversationEngine.EditForkPoint({ ID: 'd-1', Sequence: 1 }, path)).toEqual({ ParentBranchID: null, ForkFromSequence: null });
    });

    it('EditForkPoint is unknown when older rows are not loaded or the message is not on the path', () => {
        expect(ConversationEngine.EditForkPoint({ ID: 'd-1', Sequence: 1 }, path, true)).toBeUndefined();
        expect(ConversationEngine.EditForkPoint({ ID: 'nope', Sequence: 7 }, path)).toBeUndefined();
    });

    it('RegenerateForkPoint forks at the user message the answer replied to', () => {
        expect(ConversationEngine.RegenerateForkPoint({ BranchID: null, Sequence: 5 })).toEqual({ ParentBranchID: null, ForkFromSequence: 5 });
    });
});

describe('AnchorRowsFilter', () => {
    it('names each fork point once, Main and forks alike', () => {
        expect(ConversationEngine.AnchorRowsFilter(C, [T1, F1, EF, BARE])).toBe(
            `[ConversationID]='conv-1' AND (([BranchID] IS NULL AND [Sequence]=2) OR ([BranchID]='T1' AND [Sequence]=11))`
        );
    });

    it('is null when no fork has a fork point', () => {
        expect(ConversationEngine.AnchorRowsFilter(C, [EF])).toBeNull();
    });

    it('escapes the conversation and branch ids', () => {
        const odd: ConversationBranchRow = { ...F1, ParentBranchID: "T'1" };
        expect(ConversationEngine.AnchorRowsFilter("c'1", [odd])).toBe(`[ConversationID]='c''1' AND (([BranchID]='T''1' AND [Sequence]=11))`);
    });
});

describe('SourceRowsFilter', () => {
    it('names each source message once, without regard to case', () => {
        const again: ConversationBranchRow = { ...E1, ID: 'E2', SourceDetailID: 'D-5' };
        expect(ConversationEngine.SourceRowsFilter(C, [T1, E1, again, R1])).toBe(`[ConversationID]='conv-1' AND [ID] IN ('d-5', 'd-6')`);
    });

    it('is null when no fork has a source message', () => {
        expect(ConversationEngine.SourceRowsFilter(C, [T1, F1, BARE])).toBeNull();
    });

    it('escapes the conversation and message ids', () => {
        expect(ConversationEngine.SourceRowsFilter("c'1", [{ ...E1, SourceDetailID: "d'5" }])).toBe(`[ConversationID]='c''1' AND [ID] IN ('d''5')`);
    });
});

describe('BuildForkSummaries', () => {
    const summaries = ConversationEngine.BuildForkSummaries([T1, F1, E1, R1, EF, BARE], OWN, ANCHORS, SOURCES);
    const byId = new Map(summaries.map(s => [s.Branch.ID, s]));

    it('keeps the branch order', () => {
        expect(summaries.map(s => s.Branch.ID)).toEqual(['T1', 'F1', 'E1', 'R1', 'EF', 'X1']);
    });

    it('summarises a fork: name, count, participants, activity and placement', () => {
        const t1 = byId.get('T1')!;
        expect(t1.Kind).toBe('Fork');
        expect(t1.DisplayName).toBe('What if we skip the free…');
        expect(t1.MessageCount).toBe(3);
        expect(t1.Participants).toEqual([
            { Kind: 'User', ID: JORDAN, Name: 'Jordan Ellis' },
            { Kind: 'Agent', ID: SAGE, Name: 'Sage' },
            { Kind: 'User', ID: MAYA, Name: 'Maya Chen' },
        ]);
        expect(t1.AuthorUserIDs).toEqual([JORDAN, MAYA]);
        expect(t1.LastActivityAt.toISOString()).toBe(new Date(Date.UTC(2026, 9, 6, 14, 12)).toISOString());
        expect(t1.LastMessagePreview).toBe('Can we compare both options?');
        expect(t1.LastMessageAuthorName).toBe('Maya Chen');
        expect(t1.PlacementDetailID).toBe('d-2');
        expect(t1.AnchorDetailID).toBe('d-2');
        expect(t1.AnchorAuthorName).toBe('Sage');
        expect(t1.AnchorAt?.toISOString()).toBe(new Date(Date.UTC(2026, 9, 6, 14, 2)).toISOString());
        expect(t1.StartedByUserID).toBe(JORDAN);
        expect(t1.StartedByName).toBe('Jordan Ellis');
        expect(t1.ParentBranchID).toBeNull();
    });

    it('places a nested fork under its anchor in the parent fork, with its name', () => {
        const f1 = byId.get('F1')!;
        expect(f1.DisplayName).toBe('Annual plans only');
        expect(f1.PlacementDetailID).toBe('t1-b');
        expect(f1.ParentBranchID).toBe('T1');
        expect(f1.MessageCount).toBe(1);
        expect(f1.Participants).toEqual([{ Kind: 'User', ID: PRIYA, Name: 'Priya Natarajan' }]);
    });

    it('places an edit under the edited message and a regenerate under the replaced answer', () => {
        expect(byId.get('E1')).toMatchObject({ DisplayName: 'Edited version', PlacementDetailID: 'd-5', AnchorDetailID: 'd-4' });
        expect(byId.get('R1')).toMatchObject({ DisplayName: 'Other answer', PlacementDetailID: 'd-6', AnchorDetailID: 'd-5' });
        expect(byId.get('R1')!.Participants).toEqual([{ Kind: 'Agent', ID: SAGE, Name: 'Sage' }]);
    });

    it('places a fork that replaces a message (Fork from here) under that message, with the row before it as its anchor', () => {
        const replaces: ConversationBranchRow = { ...T1, ID: 'FR', ForkFromSequence: 4, SourceDetailID: 'd-5', UserID: MAYA, User: 'Maya Chen' };
        const [fr] = ConversationEngine.BuildForkSummaries([replaces], [], ANCHORS, SOURCES);
        expect(fr).toMatchObject({ Kind: 'Fork', PlacementDetailID: 'd-5', AnchorDetailID: 'd-4', SourceAuthorName: 'Maya Chen' });
    });

    it('has no anchor for an edit of the first message, and falls back to the creation time', () => {
        const ef = byId.get('EF')!;
        expect(ef.PlacementDetailID).toBe('d-1');
        expect(ef.AnchorDetailID).toBeNull();
        expect(ef.AnchorAt).toBeNull();
        expect(ef.AnchorAuthorName).toBeNull();
        expect(ef.MessageCount).toBe(0);
        expect(ef.LastActivityAt.toISOString()).toBe('2026-10-06T15:00:00.000Z');
        expect(ef.LastMessagePreview).toBeNull();
    });

    it("names the author of the source message: the person of a user row, the agent of an agent row", () => {
        expect(byId.get('E1')!.SourceAuthorName).toBe('Maya Chen');
        expect(byId.get('R1')!.SourceAuthorName).toBe('Sage');
    });

    it('has no source author with no source message or when its row is not read', () => {
        expect(byId.get('T1')!.SourceAuthorName).toBeNull();
        expect(byId.get('EF')!.SourceAuthorName).toBeNull();
        expect(ConversationEngine.BuildForkSummaries([E1], [], [])[0].SourceAuthorName).toBeNull();
    });

    it('treats a row without Kind as a Fork with the default name', () => {
        expect(byId.get('X1')).toMatchObject({ Kind: 'Fork', DisplayName: 'Fork', MessageCount: 0, PlacementDetailID: 'd-2' });
    });

    it('matches fork ids without regard to case', () => {
        const [only] = ConversationEngine.BuildForkSummaries([T1], [row('lower', 't1', 20, 'User', maya, 'hello')], []);
        expect(only.MessageCount).toBe(1);
    });

    it('has no anchor or anchor placement when the anchor row is not among the anchor rows', () => {
        const [t1, e1] = ConversationEngine.BuildForkSummaries([T1, E1], [], []);
        expect(t1).toMatchObject({ PlacementDetailID: null, AnchorDetailID: null, AnchorAuthorName: null, AnchorAt: null });
        expect(e1).toMatchObject({ PlacementDetailID: 'd-5', AnchorDetailID: null });
    });

    it('counts only User rows as authors, not the sender of an agent row', () => {
        expect(byId.get('R1')!.AuthorUserIDs).toEqual([]);
    });

    it('matches the anchor branch id without regard to case', () => {
        const [f1] = ConversationEngine.BuildForkSummaries([F1], [], [row('t1-b', 't1', 11, 'AI', sage, 'Fewer people start a trial.')]);
        expect(f1).toMatchObject({ AnchorDetailID: 't1-b', PlacementDetailID: 't1-b' });
    });

    it('lists at most three participants', () => {
        const many = ['u1', 'u2', 'u3', 'u4'].map((id, i) => row(`m${i}`, 'T1', 30 + i, 'User', { UserID: id, User: id }, 'hi'));
        const [only] = ConversationEngine.BuildForkSummaries([T1], many, []);
        expect(only.Participants.map(p => p.ID)).toEqual(['u1', 'u2', 'u3']);
        expect(only.AuthorUserIDs).toEqual(['u1', 'u2', 'u3', 'u4']);
    });
});

describe('LoadForkSummaries', () => {
    beforeEach(() => {
        runViewsFixture.results = [];
        runViewsFixture.params = [];
        vi.restoreAllMocks();
    });

    it('returns no summaries and reads nothing for a conversation without forks', async () => {
        expect(await ConversationEngine.LoadForkSummaries(C, user, undefined, [])).toEqual([]);
        expect(runViewsFixture.params).toHaveLength(0);
    });

    it('loads the fork rows when none are given', async () => {
        const spy = vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockResolvedValue([]);
        expect(await ConversationEngine.LoadForkSummaries(C, user)).toEqual([]);
        expect(spy).toHaveBeenCalledWith(C, user, undefined);
    });

    it('reads own rows and anchor rows in one batch and builds the summaries', async () => {
        runViewsFixture.results.push([{ Success: true, Results: OWN }, { Success: true, Results: ANCHORS }]);

        const summaries = await ConversationEngine.LoadForkSummaries(C, user, undefined, [T1, F1]);

        const [own, anchors] = runViewsFixture.params[0];
        expect(own).toMatchObject({
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `[ConversationID]='conv-1' AND [BranchID] IS NOT NULL`,
            OrderBy: 'Sequence ASC',
            ResultType: 'simple',
        });
        expect(own.Fields).toEqual([...ForkSummaryRowFields]);
        expect(anchors).toMatchObject({
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: ConversationEngine.AnchorRowsFilter(C, [T1, F1]),
            ResultType: 'simple',
        });
        expect(summaries.map(s => [s.Branch.ID, s.MessageCount, s.PlacementDetailID])).toEqual([['T1', 3, 'd-2'], ['F1', 1, 't1-b']]);
    });

    it('skips the anchor read when no fork has a fork point', async () => {
        runViewsFixture.results.push([{ Success: true, Results: [] }]);
        await ConversationEngine.LoadForkSummaries(C, user, undefined, [{ ...EF, SourceDetailID: null }]);
        expect(runViewsFixture.params[0]).toHaveLength(1);
    });

    it('reads the source rows in the same batch and names their authors', async () => {
        runViewsFixture.results.push([{ Success: true, Results: OWN }, { Success: true, Results: ANCHORS }, { Success: true, Results: SOURCES }]);

        const summaries = await ConversationEngine.LoadForkSummaries(C, user, undefined, [T1, E1]);

        const [, anchors, sources] = runViewsFixture.params[0];
        expect(anchors.ExtraFilter).toBe(ConversationEngine.AnchorRowsFilter(C, [T1, E1]));
        expect(sources).toMatchObject({ EntityName: 'MJ: Conversation Details', ExtraFilter: ConversationEngine.SourceRowsFilter(C, [T1, E1]), ResultType: 'simple' });
        expect(sources.Fields).toEqual([...ForkSummaryRowFields]);
        expect(summaries.map(s => s.SourceAuthorName)).toEqual([null, 'Maya Chen']);
    });

    it('reads the source rows without an anchor read when no fork has a fork point', async () => {
        runViewsFixture.results.push([{ Success: true, Results: [] }, { Success: true, Results: [row('d-1', null, 1, 'User', maya, 'Plan a launch.')] }]);
        const [ef] = await ConversationEngine.LoadForkSummaries(C, user, undefined, [EF]);
        expect(runViewsFixture.params[0].map(p => p.ExtraFilter)).toEqual([
            `[ConversationID]='conv-1' AND [BranchID] IS NOT NULL`,
            ConversationEngine.SourceRowsFilter(C, [EF]),
        ]);
        expect(ef.SourceAuthorName).toBe('Maya Chen');
    });

    it('throws when any read fails', async () => {
        runViewsFixture.results.push([{ Success: false, Results: [], ErrorMessage: 'own boom' }, { Success: true, Results: [] }]);
        await expect(ConversationEngine.LoadForkSummaries(C, user, undefined, [T1])).rejects.toThrow(/own boom/);
        runViewsFixture.results.push([{ Success: true, Results: [] }, { Success: false, Results: [], ErrorMessage: 'anchor boom' }]);
        await expect(ConversationEngine.LoadForkSummaries(C, user, undefined, [T1])).rejects.toThrow(/anchor boom/);
        runViewsFixture.results.push([{ Success: true, Results: [] }, { Success: true, Results: [] }, { Success: false, Results: [], ErrorMessage: 'source boom' }]);
        await expect(ConversationEngine.LoadForkSummaries(C, user, undefined, [E1])).rejects.toThrow(/source boom/);
    });
});
