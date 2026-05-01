/**
 * Tests for TagGovernanceResourceComponent — focused on pure logic:
 *   - computeTagPath builds the breadcrumb up to root
 *   - ReasonClass maps every conventional Reason to a CSS class
 *   - applySuggestionFilters honors reason / search / minScore
 *   - Disposition routes through GraphQLAIClient correctly
 *
 * The Angular decorators / inject() / NavigationService are stubbed; we
 * instantiate the class directly and exercise the methods.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Angular shims ---------------------------------------------------------

vi.mock('@angular/core', () => ({
    Component: () => (target: Function) => target,
    inject: (_t: unknown) => ({ detectChanges: vi.fn(), markForCheck: vi.fn() }),
    ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
    AfterViewInit: class {},
    OnDestroy: class {},
}));

// ---- MJ runtime shims ------------------------------------------------------

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (t: unknown) => t,
    NormalizeUUID: (id: string) => (id ?? '').toLowerCase(),
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.trim().toLowerCase() === b.trim().toLowerCase();
    },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class { GetEntityObject = vi.fn(); },
    RunView: class {
        RunView = vi.fn().mockResolvedValue({ Success: true, Results: [], TotalRowCount: 0 });
        RunViews = vi.fn().mockResolvedValue([{ Success: true, Results: [] }]);
    },
}));

vi.mock('@memberjunction/ng-shared', () => ({
    BaseResourceComponent: class {
        public ProviderToUse: unknown = null;
        protected NotifyLoadComplete() {}
        protected GetQueryParams(): Record<string, string> { return {}; }
        protected UpdateQueryParams(_p: Record<string, string | null>): void {}
        protected OnQueryParamsChanged(_p: Record<string, string>, _src: 'popstate' | 'deeplink'): void {}
        public ngOnDestroy(): void {}
        protected navigationService = { SetAgentContext: vi.fn(), SetAgentClientTools: vi.fn() };
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTagSuggestionEntity: class {},
    MJTagEntity: class {},
    MJTagScopeEntity: class {},
    MJTagSynonymEntity: class {},
    MJTagAuditLogEntity: class {},
    ResourceData: class {},
}));

const { notifyMock, aiClientMock } = vi.hoisted(() => ({
    notifyMock: { CreateSimpleNotification: vi.fn() },
    aiClientMock: {
        PromoteTagSuggestion: vi.fn().mockResolvedValue({ Success: true, ResolvedTagID: 'r1', ResolvedTagName: 'Resolved' }),
        RejectTagSuggestion: vi.fn().mockResolvedValue({ Success: true }),
        RebuildTagEmbeddings: vi.fn().mockResolvedValue({ Success: true, Refreshed: 5, Total: 10 }),
        RunTagHealth: vi.fn().mockResolvedValue({ Success: true, MergeCount: 3, LowUsageCount: 1, WideNodeCount: 0, DurationMs: 50 }),
    },
}));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: { Instance: notifyMock } }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLAIClient: class { constructor(_p: unknown) { return aiClientMock as never; } },
    GraphQLDataProvider: class {},
}));

import { TagGovernanceResourceComponent } from '../AI/components/tag-governance/tag-governance-resource.component';

interface FakeTag {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string | null;
    ParentID: string | null;
    Status: string;
    IsGlobal: boolean;
    AllowAutoGrow: boolean;
    IsFrozen: boolean;
    MaxChildren: number | null;
    MaxDescendantDepth: number | null;
    MinWeight: number | null;
    RequiresReview: boolean;
    EmbeddingVector: string | null;
    EmbeddingModelID: string | null;
}

function tag(partial: Partial<FakeTag> & { ID: string; Name: string }): FakeTag {
    return {
        DisplayName: partial.Name,
        Description: null,
        ParentID: null,
        Status: 'Active',
        IsGlobal: true,
        AllowAutoGrow: true,
        IsFrozen: false,
        MaxChildren: null,
        MaxDescendantDepth: null,
        MinWeight: null,
        RequiresReview: false,
        EmbeddingVector: null,
        EmbeddingModelID: null,
        ...partial,
    };
}

function newComponent(): TagGovernanceResourceComponent {
    return new TagGovernanceResourceComponent();
}

describe('TagGovernanceResourceComponent', () => {
    beforeEach(() => {
        notifyMock.CreateSimpleNotification.mockClear();
        aiClientMock.PromoteTagSuggestion.mockClear();
        aiClientMock.RejectTagSuggestion.mockClear();
    });

    describe('computeTagPath', () => {
        it('returns just the name when the tag is a root', () => {
            const c = newComponent();
            const root = tag({ ID: 'r', Name: 'Root' });
            c.TagsByID.set('r', root as never);
            expect(c.computeTagPath(root as never)).toBe('Root');
        });

        it('walks the parent chain to build a breadcrumb', () => {
            const c = newComponent();
            const root = tag({ ID: 'r', Name: 'Tech' });
            const child = tag({ ID: 'c', Name: 'AI', ParentID: 'r' });
            const leaf = tag({ ID: 'l', Name: 'GenAI', ParentID: 'c' });
            c.TagsByID.set('r', root as never);
            c.TagsByID.set('c', child as never);
            c.TagsByID.set('l', leaf as never);
            expect(c.computeTagPath(leaf as never)).toBe('Tech › AI › GenAI');
        });

        it('defends against parent-chain cycles', () => {
            const c = newComponent();
            const a = tag({ ID: 'a', Name: 'A', ParentID: 'b' });
            const b = tag({ ID: 'b', Name: 'B', ParentID: 'a' });
            c.TagsByID.set('a', a as never);
            c.TagsByID.set('b', b as never);
            // Should not loop forever and should produce a finite string
            const path = c.computeTagPath(a as never);
            expect(path.split(' › ').length).toBeLessThanOrEqual(8);
        });
    });

    describe('ReasonClass', () => {
        it('maps every conventional Reason to a known class', () => {
            const c = newComponent();
            const cases: Array<[string, string]> = [
                ['MergeCandidate', 'merge'],
                ['BelowThreshold', 'below'],
                ['ConstrainedMode', 'constrained'],
                ['AmbiguousMatch', 'constrained'],
                ['ParentFrozen', 'frozen'],
                ['MaxChildrenExceeded', 'frozen'],
                ['MaxDepthExceeded', 'frozen'],
                ['BelowMinWeight', 'frozen'],
                ['RequiresReview', 'review'],
                ['LowUsage', 'lowusage'],
                ['WideNode', 'widenode'],
                ['AutoGrowDisabled', 'autogrow'],
                ['MaxItemTagsExceeded', 'autogrow'],
            ];
            for (const [reason, expected] of cases) {
                expect(c.ReasonClass(reason)).toBe(expected);
            }
            // Unknown reason → empty string (no class)
            expect(c.ReasonClass('something-novel')).toBe('');
        });
    });

    describe('applySuggestionFilters', () => {
        it('filters by reason', () => {
            const c = newComponent();
            c.SuggestionRows = [
                { ID: '1', ProposedName: 'A', Reason: 'MergeCandidate' } as never,
                { ID: '2', ProposedName: 'B', Reason: 'LowUsage' } as never,
            ];
            c.SuggestionFilterReason = 'LowUsage';
            c.applySuggestionFilters();
            expect(c.SuggestionRowsFiltered.map(r => r.ID)).toEqual(['2']);
        });

        it('filters by min score (rows with null score are excluded when minScore set)', () => {
            const c = newComponent();
            c.SuggestionRows = [
                { ID: '1', ProposedName: 'A', BestMatchScore: 0.9, Reason: 'MergeCandidate' } as never,
                { ID: '2', ProposedName: 'B', BestMatchScore: 0.5, Reason: 'MergeCandidate' } as never,
                { ID: '3', ProposedName: 'C', BestMatchScore: null, Reason: 'MergeCandidate' } as never,
            ];
            c.SuggestionFilterMinScore = 0.7;
            c.applySuggestionFilters();
            expect(c.SuggestionRowsFiltered.map(r => r.ID)).toEqual(['1']);
        });

        it('filters by search across proposed name + best match + source text', () => {
            const c = newComponent();
            c.SuggestionRows = [
                { ID: '1', ProposedName: 'GenAI',  BestMatchName: 'Generative AI', SourceText: null, Reason: 'MergeCandidate' } as never,
                { ID: '2', ProposedName: 'Spark',  BestMatchName: 'Apache Spark',  SourceText: 'big-data ETL pipelines', Reason: 'MergeCandidate' } as never,
                { ID: '3', ProposedName: 'Other',  BestMatchName: 'Whatever',      SourceText: null, Reason: 'MergeCandidate' } as never,
            ];
            c.SuggestionSearch = 'pipelines';
            c.applySuggestionFilters();
            expect(c.SuggestionRowsFiltered.map(r => r.ID)).toEqual(['2']);
        });

        it('combines filters as conjunction', () => {
            const c = newComponent();
            c.SuggestionRows = [
                { ID: '1', ProposedName: 'A', BestMatchScore: 0.9, Reason: 'MergeCandidate' } as never,
                { ID: '2', ProposedName: 'A', BestMatchScore: 0.9, Reason: 'LowUsage' } as never,
                { ID: '3', ProposedName: 'A', BestMatchScore: 0.5, Reason: 'MergeCandidate' } as never,
            ];
            c.SuggestionFilterReason = 'MergeCandidate';
            c.SuggestionFilterMinScore = 0.8;
            c.applySuggestionFilters();
            expect(c.SuggestionRowsFiltered.map(r => r.ID)).toEqual(['1']);
        });
    });

    describe('SelectedSuggestionCount + ToggleAllSuggestions', () => {
        it('counts selected rows in the filtered set only', () => {
            const c = newComponent();
            c.SuggestionRowsFiltered = [
                { ID: '1', selected: true } as never,
                { ID: '2', selected: false } as never,
                { ID: '3', selected: true } as never,
            ];
            expect(c.SelectedSuggestionCount()).toBe(2);
        });

        it('toggleAll flips every visible row', () => {
            const c = newComponent();
            c.SuggestionRowsFiltered = [
                { ID: '1', selected: false } as never,
                { ID: '2', selected: false } as never,
            ];
            c.ToggleAllSuggestions(true);
            expect(c.SuggestionRowsFiltered.every(r => r.selected)).toBe(true);
            c.ToggleAllSuggestions(false);
            expect(c.SuggestionRowsFiltered.every(r => r.selected === false)).toBe(true);
        });
    });

    describe('IsGlobalLocked', () => {
        it('is locked when at least one scope row exists', () => {
            const c = newComponent();
            c.SelectedTag = tag({ ID: 't1', Name: 'T' }) as never;
            c.SelectedTagScopes = [{ ID: 's', ScopeEntityID: 'e', ScopeRecordID: 'r', EntityName: '', DisplayName: '', CreatedAt: null }];
            expect(c.IsGlobalLocked()).toBe(true);
        });
        it('is unlocked when no scope rows', () => {
            const c = newComponent();
            c.SelectedTag = tag({ ID: 't1', Name: 'T' }) as never;
            c.SelectedTagScopes = [];
            expect(c.IsGlobalLocked()).toBe(false);
        });
        it('is unlocked when no tag selected', () => {
            const c = newComponent();
            c.SelectedTag = null;
            expect(c.IsGlobalLocked()).toBe(false);
        });
    });

    describe('DispositionSuggestion', () => {
        it('routes "reject" through RejectTagSuggestion', async () => {
            const c = newComponent();
            (c as unknown as { ProviderToUse: unknown }).ProviderToUse = {};
            const row = { ID: 's-1', ProposedName: 'X', BestMatchTagID: null, dispositionInProgress: null } as never;
            c.SuggestionRows = [row];
            c.SuggestionRowsFiltered = [row];
            await c.DispositionSuggestion(row, 'reject');
            expect(aiClientMock.RejectTagSuggestion).toHaveBeenCalledWith({ suggestionID: 's-1' });
            expect(c.SuggestionRows.length).toBe(0); // optimistically dropped
        });

        it('routes "merge" with the best match TagID', async () => {
            const c = newComponent();
            (c as unknown as { ProviderToUse: unknown }).ProviderToUse = {};
            const row = { ID: 's-2', ProposedName: 'X', BestMatchTagID: 'target', BestMatchName: 'Target', dispositionInProgress: null } as never;
            c.SuggestionRows = [row];
            c.SuggestionRowsFiltered = [row];
            await c.DispositionSuggestion(row, 'merge');
            expect(aiClientMock.PromoteTagSuggestion).toHaveBeenCalledWith({
                suggestionID: 's-2',
                strategy: 'merge-into-existing',
                targetTagID: 'target',
            });
        });

        it('routes "create-new" without a target', async () => {
            const c = newComponent();
            (c as unknown as { ProviderToUse: unknown }).ProviderToUse = {};
            const row = { ID: 's-3', ProposedName: 'NewOne', BestMatchTagID: null, dispositionInProgress: null } as never;
            c.SuggestionRows = [row];
            c.SuggestionRowsFiltered = [row];
            await c.DispositionSuggestion(row, 'create-new');
            expect(aiClientMock.PromoteTagSuggestion).toHaveBeenCalledWith({
                suggestionID: 's-3',
                strategy: 'create-new',
                targetTagID: undefined,
            });
        });

        it('shows an error notification and leaves the row in place when the server fails', async () => {
            aiClientMock.RejectTagSuggestion.mockResolvedValueOnce({ Success: false, ErrorMessage: 'boom' });
            const c = newComponent();
            (c as unknown as { ProviderToUse: unknown }).ProviderToUse = {};
            const row = { ID: 's-4', ProposedName: 'X', BestMatchTagID: null, dispositionInProgress: null } as never;
            c.SuggestionRows = [row];
            await c.DispositionSuggestion(row, 'reject');
            expect(c.SuggestionRows.length).toBe(1); // not dropped
            expect(notifyMock.CreateSimpleNotification).toHaveBeenCalledWith(
                expect.stringContaining('boom'),
                'error',
                expect.any(Number)
            );
        });
    });

    describe('NormalizeUUID public alias', () => {
        it('lowercases uuids and treats null as empty string', () => {
            const c = newComponent();
            expect(c.NormalizeUUID('AB-CD')).toBe('ab-cd');
            expect(c.NormalizeUUID(null)).toBe('');
            expect(c.NormalizeUUID(undefined)).toBe('');
        });
    });
});
