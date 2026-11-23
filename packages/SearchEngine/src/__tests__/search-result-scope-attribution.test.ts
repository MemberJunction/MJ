import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolvePermissionSpy } = vi.hoisted(() => ({
    resolvePermissionSpy: vi.fn(async () => ({
        Allowed: true,
        Level: 'Search',
        Source: 'DirectGrant',
        Reason: 'ok',
        toSqlPredicate: () => '1=1',
    })),
}));

vi.mock('../permissions/SearchScopePermissionResolver', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../permissions/SearchScopePermissionResolver')>()),
    GetSearchScopePermissionResolver: () => ({ ResolveEffectivePermission: resolvePermissionSpy }),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        public static Provider = {
            EntityByName: (name: string) =>
                name === DOCS_ENTITY.Name ? DOCS_ENTITY : null,
            Entities: [] as Array<typeof DOCS_ENTITY>,
            GetEntityRecordNames: async () => [],
        };
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class {
            public static FromMetadataProvider() {
                return {
                    RunView: async () => ({ Success: true, Results: [] }),
                };
            }
            public async RunView() {
                return { Success: true, Results: [] };
            }
        },
    };
});

import { UserInfo, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJSearchScopeEntity, ScopeBundle, SearchEngineBase } from '@memberjunction/core-entities';
import {
    SearchFusion,
    StampOriginatingScope,
    MergeScopeAttributions,
    CollectScopeAttributions,
    type LabeledResultList,
} from '../generic/SearchFusion';
import { SearchEngine } from '../generic/SearchEngine';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import type { LaneKind } from '../generic/ScopeExplanation';
import type {
    ScopeConstraints,
    SearchFilters,
    SearchResultItem,
    SearchSource,
    SearchStreamEvent,
} from '../generic/search.types';

const SCOPE_LEGAL_ID = 'A1111111-1111-4111-8111-111111111111';
const SCOPE_FINANCE_ID = 'B2222222-2222-4222-8222-222222222222';
const SCOPE_HR_ID = 'C3333333-3333-4333-8333-333333333333';
const DOCS_ENTITY_ID = 'E0000000-0000-4000-8000-0000000000d1';

const DOCS_ENTITY = {
    ID: DOCS_ENTITY_ID,
    Name: 'Docs',
    DisplayName: 'Documents',
    Icon: 'fa-solid fa-file',
    FirstPrimaryKey: { Name: 'ID', IsUnique: true, NeedsQuotes: true },
    PrimaryKeys: [{ Name: 'ID', IsUnique: true, NeedsQuotes: true }],
    Fields: [{ Name: 'ID', IsPrimaryKey: true }],
    GetDeniedReadFields: () => new Set<string>(),
};

function makeItem(
    overrides: Partial<SearchResultItem> & { RecordID: string; EntityName?: string },
): SearchResultItem {
    const entityName = overrides.EntityName ?? 'Docs';
    return {
        ID: overrides.ID ?? overrides.RecordID,
        EntityName: entityName,
        RecordID: overrides.RecordID,
        SourceType: overrides.SourceType ?? 'vector',
        ResultType: overrides.ResultType ?? 'entity-record',
        Title: overrides.Title ?? `Doc ${overrides.RecordID}`,
        Snippet: overrides.Snippet ?? `Snippet for ${overrides.RecordID}`,
        Score: overrides.Score ?? 0.8,
        ScoreBreakdown: overrides.ScoreBreakdown ?? { Vector: overrides.Score ?? 0.8 },
        Tags: overrides.Tags ?? [],
        MatchedAt: overrides.MatchedAt ?? new Date('2026-01-01T00:00:00Z'),
        ...(overrides.OriginatingScopeID !== undefined ? { OriginatingScopeID: overrides.OriginatingScopeID } : {}),
        ...(overrides.OriginatingScopeName !== undefined ? { OriginatingScopeName: overrides.OriginatingScopeName } : {}),
        ...(overrides.OriginatingScopes !== undefined ? { OriginatingScopes: overrides.OriginatingScopes } : {}),
    };
}

describe('MJ-2 SearchResultItem Originating Scope Attribution', () => {
    let fusion: SearchFusion;

    beforeEach(() => {
        fusion = new SearchFusion();
        resolvePermissionSpy.mockClear();
    });

    describe('StampOriginatingScope & MergeScopeAttributions helpers', () => {
        it('stamps single originating scope metadata cleanly without mutating the source item', () => {
            const raw = makeItem({ RecordID: 'doc-1' });
            const stamped = StampOriginatingScope(raw, SCOPE_LEGAL_ID, 'Legal Repository');

            expect(raw.OriginatingScopeID).toBeUndefined();
            expect(stamped.OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(stamped.OriginatingScopeName).toBe('Legal Repository');
            expect(stamped.OriginatingScopes).toEqual([
                { ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal Repository' },
            ]);
        });

        it('deduplicates UUIDs case-insensitively and fills missing ScopeName', () => {
            const existing = makeItem({
                RecordID: 'doc-1',
                OriginatingScopeID: SCOPE_LEGAL_ID.toLowerCase(),
                OriginatingScopes: [{ ScopeID: SCOPE_LEGAL_ID.toLowerCase() }],
            });
            const stamped = StampOriginatingScope(existing, SCOPE_LEGAL_ID.toUpperCase(), 'Legal Repository');

            expect(stamped.OriginatingScopeID).toBe(SCOPE_LEGAL_ID.toLowerCase());
            expect(stamped.OriginatingScopeName).toBe('Legal Repository');
            expect(stamped.OriginatingScopes).toEqual([
                { ScopeID: SCOPE_LEGAL_ID.toLowerCase(), ScopeName: 'Legal Repository' },
            ]);
        });

        it('returns empty object from MergeScopeAttributions when neither item is scoped', () => {
            const a = makeItem({ RecordID: 'doc-1' });
            const b = makeItem({ RecordID: 'doc-1', SourceType: 'entity' });

            expect(MergeScopeAttributions(a, b)).toEqual({});
            expect(CollectScopeAttributions(a)).toEqual([]);
        });
    });

    describe('SearchFusion.Fuse', () => {
        it('preserves originating scope attribution across single-source and multi-source RRF fusion', () => {
            const vectorList: SearchResultItem[] = [
                StampOriginatingScope(
                    makeItem({ RecordID: 'doc-1', SourceType: 'vector', Score: 0.9, ScoreBreakdown: { Vector: 0.9 } }),
                    SCOPE_LEGAL_ID,
                    'Legal',
                ),
                StampOriginatingScope(
                    makeItem({ RecordID: 'doc-2', SourceType: 'vector', Score: 0.7, ScoreBreakdown: { Vector: 0.7 } }),
                    SCOPE_LEGAL_ID,
                    'Legal',
                ),
            ];
            const entityList: SearchResultItem[] = [
                StampOriginatingScope(
                    makeItem({ RecordID: 'doc-1', SourceType: 'entity', Score: 0.6, ScoreBreakdown: { Entity: 0.6 } }),
                    SCOPE_LEGAL_ID,
                    'Legal',
                ),
            ];

            const singleFused = fusion.Fuse([{ Source: 'vector', Results: vectorList }], 10);
            expect(singleFused[0].OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(singleFused[0].OriginatingScopeName).toBe('Legal');
            expect(singleFused[0].OriginatingScopes).toEqual([{ ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal' }]);

            const multiFused = fusion.Fuse(
                [
                    { Source: 'vector', Results: vectorList },
                    { Source: 'entity', Results: entityList },
                ],
                10,
            );
            expect(multiFused[0].RecordID).toBe('doc-1');
            expect(multiFused[0].OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(multiFused[0].OriginatingScopeName).toBe('Legal');
            expect(multiFused[0].OriginatingScopes).toEqual([{ ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal' }]);
        });

        it('keeps OriginatingScope fields undefined for unscoped Fuse calls (backwards compatibility)', () => {
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: [makeItem({ RecordID: 'doc-1', Score: 0.8 })] },
                { Source: 'entity', Results: [makeItem({ RecordID: 'doc-1', SourceType: 'entity', Score: 0.6 })] },
            ];
            const fused = fusion.Fuse(lists, 10);
            expect(fused[0].OriginatingScopeID).toBeUndefined();
            expect(fused[0].OriginatingScopeName).toBeUndefined();
            expect(fused[0].OriginatingScopes).toBeUndefined();
            expect('OriginatingScopeID' in fused[0]).toBe(false);
        });
    });

    describe('SearchFusion.CrossScopeFusion', () => {
        it('retains single-scope attribution including ScopeName when only one scope has hits', () => {
            const scopeMap = new Map<string, SearchResultItem[]>([
                [
                    SCOPE_LEGAL_ID,
                    [
                        StampOriginatingScope(makeItem({ RecordID: 'doc-1', Score: 0.9 }), SCOPE_LEGAL_ID, 'Legal'),
                    ],
                ],
                [SCOPE_FINANCE_ID, []],
            ]);

            const fused = fusion.CrossScopeFusion(scopeMap, 10);
            expect(fused).toHaveLength(1);
            expect(fused[0].OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(fused[0].OriginatingScopeName).toBe('Legal');
            expect(fused[0].OriginatingScopes).toEqual([{ ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal' }]);
        });

        it('falls back to map key scopeID when caller passes un-stamped items directly to CrossScopeFusion', () => {
            const scopeMap = new Map<string, SearchResultItem[]>([
                [SCOPE_LEGAL_ID, [makeItem({ RecordID: 'doc-1', Score: 0.9 })]],
                [SCOPE_FINANCE_ID, [makeItem({ RecordID: 'doc-1', Score: 0.7 }), makeItem({ RecordID: 'doc-2', Score: 0.8 })]],
            ]);

            const fused = fusion.CrossScopeFusion(scopeMap, 10);
            const shared = fused.find(r => r.RecordID === 'doc-1');
            const financeOnly = fused.find(r => r.RecordID === 'doc-2');

            expect(shared?.OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(shared?.OriginatingScopes?.map(s => s.ScopeID)).toEqual([SCOPE_LEGAL_ID, SCOPE_FINANCE_ID]);
            expect(financeOnly?.OriginatingScopeID).toBe(SCOPE_FINANCE_ID);
            expect(financeOnly?.OriginatingScopes?.map(s => s.ScopeID)).toEqual([SCOPE_FINANCE_ID]);
        });

        it('selects the winning scope by weighted RRF contribution and combines all contributing scopes', () => {
            const legalShared = StampOriginatingScope(
                makeItem({ RecordID: 'shared', Score: 0.95, ScoreBreakdown: { Vector: 0.95 } }),
                SCOPE_LEGAL_ID,
                'Legal',
            );
            const financeShared = StampOriginatingScope(
                makeItem({ RecordID: 'shared', Score: 0.75, ScoreBreakdown: { FullText: 0.75 } }),
                SCOPE_FINANCE_ID,
                'Finance',
            );
            const hrShared = StampOriginatingScope(
                makeItem({ RecordID: 'shared', Score: 0.60, ScoreBreakdown: { Entity: 0.60 } }),
                SCOPE_HR_ID,
                'Human Resources',
            );

            const scopeMap = new Map<string, SearchResultItem[]>([
                [SCOPE_LEGAL_ID, [legalShared]],
                [SCOPE_FINANCE_ID, [financeShared]],
                [SCOPE_HR_ID, [hrShared]],
            ]);

            const weighted = fusion.CrossScopeFusion(scopeMap, 10, {
                [SCOPE_LEGAL_ID]: 0.5,
                [SCOPE_FINANCE_ID]: 5.0,
                [SCOPE_HR_ID]: 1.0,
            });

            expect(weighted).toHaveLength(1);
            expect(weighted[0].OriginatingScopeID).toBe(SCOPE_FINANCE_ID);
            expect(weighted[0].OriginatingScopeName).toBe('Finance');
            expect(weighted[0].OriginatingScopes).toEqual([
                { ScopeID: SCOPE_FINANCE_ID, ScopeName: 'Finance' },
                { ScopeID: SCOPE_HR_ID, ScopeName: 'Human Resources' },
                { ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal' },
            ]);
            expect(weighted[0].ScoreBreakdown).toEqual({
                Vector: 0.95,
                FullText: 0.75,
                Entity: 0.60,
            });
        });
    });

    describe('SearchFusion.Deduplicate', () => {
        it('combines multi-scope receipts when entity and vector hits deduplicate while keeping higher-scored scope primary', () => {
            const vectorHit = StampOriginatingScope(
                makeItem({
                    RecordID: 'doc-1',
                    SourceType: 'vector',
                    Score: 0.92,
                    ScoreBreakdown: { Vector: 0.92 },
                    Tags: ['policy'],
                }),
                SCOPE_LEGAL_ID,
                'Legal',
            );
            const entityHit = StampOriginatingScope(
                makeItem({
                    RecordID: 'doc-1',
                    SourceType: 'entity',
                    Score: 0.65,
                    ScoreBreakdown: { Entity: 0.65 },
                    Snippet: 'Full entity snippet',
                    Tags: ['compliance'],
                }),
                SCOPE_HR_ID,
                'Human Resources',
            );

            const deduped = fusion.Deduplicate([vectorHit, entityHit]);
            expect(deduped).toHaveLength(1);
            // Richer entity metadata wins SourceType/Snippet, while higher-scoring Legal scope remains primary
            expect(deduped[0].SourceType).toBe('entity');
            expect(deduped[0].Snippet).toBe('Full entity snippet');
            expect(deduped[0].Score).toBe(0.92);
            expect(deduped[0].OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(deduped[0].OriginatingScopeName).toBe('Legal');
            expect(deduped[0].OriginatingScopes).toEqual([
                { ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal' },
                { ScopeID: SCOPE_HR_ID, ScopeName: 'Human Resources' },
            ]);
            expect(deduped[0].Tags).toEqual(['policy', 'compliance']);
        });

        it('keeps Deduplicate unscoped when inputs have no scope attribution', () => {
            const a = makeItem({ RecordID: 'doc-1', SourceType: 'vector', Score: 0.9 });
            const b = makeItem({ RecordID: 'doc-1', SourceType: 'entity', Score: 0.6 });
            const deduped = fusion.Deduplicate([a, b]);
            expect(deduped[0].OriginatingScopeID).toBeUndefined();
            expect(deduped[0].OriginatingScopes).toBeUndefined();
            expect('OriginatingScopeID' in deduped[0]).toBe(false);
        });
    });

    describe('SearchEngine multi-scope Search & streamSearch integration', () => {
        class ScopedMockProvider extends BaseSearchProvider {
            public readonly SourceType: SearchSource = 'vector';
            public override readonly ConsumesLaneKinds: readonly LaneKind[] = ['Entity'];
            public override readonly ResultsAreRowsOfLabelledEntity = true;
            public override readonly AppliesLaneExtraFilter = true;

            private readonly hitsByEntityFilter: Map<string, SearchResultItem[]>;

            public constructor(hitsByEntityFilter: Map<string, SearchResultItem[]>) {
                super();
                this.hitsByEntityFilter = hitsByEntityFilter;
            }

            public async Search(
                _query: string,
                _topK: number,
                _filters: SearchFilters | undefined,
                _contextUser: UserInfo,
                scopeConstraints?: ScopeConstraints,
            ): Promise<SearchResultItem[]> {
                const key = scopeConstraints?.Entities?.[0]?.ExtraFilter ?? '';
                return (this.hitsByEntityFilter.get(key) ?? []).map(item => ({ ...item }));
            }
        }

        interface TestEngineInternalState {
            _providerEntries: Array<{
                Provider: BaseSearchProvider;
                ID: string;
                DisplayName: string;
                Icon: string;
                Priority: number;
                SupportsPreview: boolean;
                MaxResultsOverride: number | null;
                Record: Record<string, never>;
            }>;
            _configured: boolean;
        }

        class AttributionTestSearchEngine extends SearchEngine {
            private readonly bundles = new Map<string, ScopeBundle>();

            public RegisterScope(id: string, name: string, extraFilter: string): void {
                const scope: Partial<MJSearchScopeEntity> = {
                    ID: id,
                    Name: name,
                    IsGlobal: false,
                    ScopeConfig: null,
                    SearchContextConfig: null,
                };
                const providerRow = {
                    ID: `${id}-prov`,
                    SearchScopeID: id,
                    SearchProviderID: 'prov-vector',
                    Enabled: true,
                    MaxResultsOverride: null,
                };
                const entityLane = {
                    ID: `${id}-lane`,
                    SearchScopeID: id,
                    EntityID: DOCS_ENTITY_ID,
                    Entity: DOCS_ENTITY.Name,
                    ExtraFilter: extraFilter,
                };
                const bundle: ScopeBundle = {
                    Scope: scope as MJSearchScopeEntity,
                    Providers: [providerRow] as ScopeBundle['Providers'],
                    ExternalIndexes: [],
                    Entities: [entityLane] as ScopeBundle['Entities'],
                    StorageAccounts: [],
                };
                this.bundles.set(id.toLowerCase(), bundle);
            }

            public InjectProvider(provider: BaseSearchProvider): void {
                const state = (this as object) as TestEngineInternalState;
                state._providerEntries = [
                    {
                        Provider: provider,
                        ID: 'prov-vector',
                        DisplayName: 'Vector Search',
                        Icon: 'fa-solid fa-brain',
                        Priority: 0,
                        SupportsPreview: false,
                        MaxResultsOverride: null,
                        Record: {},
                    },
                ];
                state._configured = true;
            }

            protected override get ProviderToUse(): IMetadataProvider {
                const entityInfo = (DOCS_ENTITY as object) as EntityInfo;
                const provider: Partial<IMetadataProvider> = {
                    EntityByName: (name: string) =>
                        name === DOCS_ENTITY.Name ? entityInfo : undefined,
                    Entities: [entityInfo],
                    GetEntityRecordNames: async () => [],
                };
                return provider as IMetadataProvider;
            }

            protected override get Base(): SearchEngineBase {
                const bundles = this.bundles;
                const base: Partial<SearchEngineBase> = {
                    GetScopeByID: (id: string) => bundles.get(id.toLowerCase())?.Scope,
                    GetActiveScopeByID: (id: string) => bundles.get(id.toLowerCase())?.Scope,
                    GetScopeBundle: (id: string) => bundles.get(id.toLowerCase()),
                    Scopes: Array.from(bundles.values()).map(b => b.Scope),
                };
                return base as SearchEngineBase;
            }

            protected override logSearchExecution(): void {
                // No-op in unit tests
            }

            protected override async filterByPermissions(results: SearchResultItem[]): Promise<SearchResultItem[]> {
                return results;
            }
        }

        const testUser = new UserInfo(undefined, { ID: 'user-1', Name: 'Reader', Email: 'reader@example.com', UserRoles: [] });

        it('attributes single-scope and multi-scope fused results with OriginatingScopeID, OriginatingScopeName, and OriginatingScopes', async () => {
            const engine = new AttributionTestSearchEngine();
            engine.RegisterScope(SCOPE_LEGAL_ID, 'Legal Policies', "Category='Legal'");
            engine.RegisterScope(SCOPE_FINANCE_ID, 'Finance Handbook', "Category='Finance'");

            const provider = new ScopedMockProvider(
                new Map<string, SearchResultItem[]>([
                    [
                        "Category='Legal'",
                        [
                            makeItem({ RecordID: 'shared-doc', Score: 0.9, Title: 'Shared Compliance Policy' }),
                            makeItem({ RecordID: 'legal-only', Score: 0.85, Title: 'NDA Template' }),
                        ],
                    ],
                    [
                        "Category='Finance'",
                        [
                            makeItem({ RecordID: 'finance-only', Score: 0.92, Title: 'Expense Limits' }),
                            makeItem({ RecordID: 'shared-doc', Score: 0.78, Title: 'Shared Compliance Policy' }),
                        ],
                    ],
                ]),
            );
            engine.InjectProvider(provider);

            const singleResult = await engine.Search(
                { Query: 'compliance single', ScopeIDs: [SCOPE_LEGAL_ID], MaxResults: 10, SkipNameEnrichment: true },
                testUser,
            );
            expect(singleResult.Success).toBe(true);
            expect(singleResult.Results).toHaveLength(2);
            for (const item of singleResult.Results) {
                expect(item.OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
                expect(item.OriginatingScopeName).toBe('Legal Policies');
                expect(item.OriginatingScopes).toEqual([
                    { ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal Policies' },
                ]);
            }

            const multiResult = await engine.Search(
                {
                    Query: 'compliance multi',
                    ScopeIDs: [SCOPE_LEGAL_ID, SCOPE_FINANCE_ID],
                    MaxResults: 10,
                    SkipNameEnrichment: true,
                },
                testUser,
            );
            expect(multiResult.Success).toBe(true);
            const shared = multiResult.Results.find(r => r.RecordID === 'shared-doc');
            const legalOnly = multiResult.Results.find(r => r.RecordID === 'legal-only');
            const financeOnly = multiResult.Results.find(r => r.RecordID === 'finance-only');

            expect(shared?.OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(shared?.OriginatingScopeName).toBe('Legal Policies');
            expect(shared?.OriginatingScopes).toEqual([
                { ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal Policies' },
                { ScopeID: SCOPE_FINANCE_ID, ScopeName: 'Finance Handbook' },
            ]);
            expect(legalOnly?.OriginatingScopeID).toBe(SCOPE_LEGAL_ID);
            expect(legalOnly?.OriginatingScopeName).toBe('Legal Policies');
            expect(financeOnly?.OriginatingScopeID).toBe(SCOPE_FINANCE_ID);
            expect(financeOnly?.OriginatingScopeName).toBe('Finance Handbook');

            // Verify streamSearch final event carries identical originating scope receipts
            const streamEvents: SearchStreamEvent[] = [];
            for await (const ev of engine.streamSearch(
                {
                    Query: 'compliance stream',
                    ScopeIDs: [SCOPE_LEGAL_ID, SCOPE_FINANCE_ID],
                    MaxResults: 10,
                    SkipNameEnrichment: true,
                },
                testUser,
            )) {
                streamEvents.push(ev);
            }
            const finalEv = streamEvents.find(
                (ev): ev is Extract<SearchStreamEvent, { phase: 'final' }> => ev.phase === 'final',
            );
            const streamedShared = finalEv?.results.find(r => r.RecordID === 'shared-doc');
            expect(streamedShared?.OriginatingScopes).toEqual([
                { ScopeID: SCOPE_LEGAL_ID, ScopeName: 'Legal Policies' },
                { ScopeID: SCOPE_FINANCE_ID, ScopeName: 'Finance Handbook' },
            ]);
        });
    });
});
