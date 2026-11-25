/**
 * CanonGraphEngine: concept lookup and explanations checked as the caller (row-level security via a
 * user-aware fake), ExplainEntity labels by edge type, and the engine-backed expansion service with
 * the audience applied during traversal.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CanonGraphEngine, ClassifyConceptMatches, type ConceptMatch } from '../../engines/CanonGraphEngine';
import type { EntityInfo } from '@memberjunction/core';
import { GraphEngine } from '../../graph/GraphEngine';
import { LoadGraphEdgeProviders } from '../../graph';
import { QueryEngine } from '../../engines/QueryEngine';
import type { MJQueryEntityExtended } from '../../custom/MJQueryEntityExtended';
import { CanonMetadataRows, FakeGraphProvider, IDS, MakeUser, NODE, StandardEntitySpecs, StoredEdge, type FakeRow } from './graphTestFixtures';

const analyst = MakeUser('u-analyst', ['Analyst']);
const provider = new FakeGraphProvider();

async function setup(extra: Record<string, FakeRow[]> = {}, user: UserInfo = analyst): Promise<void> {
    const rows = CanonMetadataRows();
    provider.Reset({ ...rows, ...extra, 'MJ: Graph Concepts': [...rows['MJ: Graph Concepts'], ...(extra['MJ: Graph Concepts'] ?? [])] });
    await GraphEngine.Instance.Config(true, user, provider as unknown as IMetadataProvider);
}

function stubQueries(): void {
    const q = (id: string, name: string): MJQueryEntityExtended =>
        ({ ID: id, Name: name, Description: null, UserCanRun: () => ({ canRun: true, deniedEntities: [] }) }) as unknown as MJQueryEntityExtended;
    const all = [q(IDS.QueryArAging, 'AR Aging'), q(IDS.QueryBaseInvoices, 'Base Invoices')];
    vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockImplementation((id: string) => all.find((x) => x.ID === id));
}

describe('CanonGraphEngine', () => {
    beforeEach(() => {
        LoadGraphEdgeProviders();
        stubQueries();
    });

    describe('ResolveGraphIDs', () => {
        it('returns active canon graph IDs when graphNames is undefined and excludes disabled graphs', async () => {
            await setup();
            const ids = CanonGraphEngine.Instance.ResolveGraphIDs(undefined);
            expect(ids.Size).toBe(2);
            expect(ids.Has(IDS.GraphCanon)).toBe(true);
            expect(ids.Has(IDS.GraphNetwork)).toBe(true);
            expect(ids.Has(IDS.GraphDisabled)).toBe(false);
        });

        it('resolves named active graphs and ignores disabled or unknown graph names', async () => {
            await setup();
            const ids = CanonGraphEngine.Instance.ResolveGraphIDs(['MJ Canon', 'Old Graph', 'No Such Graph']);
            expect(ids.Size).toBe(1);
            expect(ids.Has(IDS.GraphCanon)).toBe(true);
        });

        it('returns an empty UUIDSet when all canon graphs are inactive', async () => {
            await setup({
                'MJ: Graphs': CanonMetadataRows()['MJ: Graphs'].map((g) => ({ ...g, Status: 'Inactive' })),
            });
            expect(CanonGraphEngine.Instance.ResolveGraphIDs(undefined).Size).toBe(0);
        });
    });

    describe('FindConcepts', () => {
        it('matches by name and synonym and returns only concepts the caller can read', async () => {
            await setup();
            expect((await CanonGraphEngine.Instance.FindConcepts('Unpaid Invoices', analyst)).map((c) => c.Label)).toEqual(['Open AR']);
            expect((await CanonGraphEngine.Instance.FindConcepts('Executive Bonus Pool', analyst)).map((c) => c.Label)).toEqual(['Executive Bonus Pool']);
            provider.HiddenFor[analyst.ID] = [`MJ: Graph Concepts|${IDS.ConceptHidden}`];
            expect(await CanonGraphEngine.Instance.FindConcepts('Executive Bonus Pool', analyst)).toEqual([]);
            expect(provider.ReadsOf('MJ: Graph Concepts', analyst.ID).length).toBeGreaterThan(0);
        });

        it('matches only Approved concepts unless proposed content is asked for, and never a Draft one', async () => {
            const rows = CanonMetadataRows()['MJ: Graph Concepts'];
            await setup({
                'MJ: Graph Concepts': [
                    { ...rows[0], ID: '77777777-7777-4777-8777-777777777781', Name: 'Open AR Draft', Status: 'Draft' },
                    { ...rows[0], ID: '77777777-7777-4777-8777-777777777782', Name: 'Open AR Proposed', Status: 'Proposed' },
                ],
            });
            expect((await CanonGraphEngine.Instance.FindConcepts('Open AR', analyst)).map((c) => c.Label)).toEqual(['Open AR']);
            expect((await CanonGraphEngine.Instance.FindConcepts('Open AR', analyst, { IncludeProposed: true })).map((c) => c.Label).sort()).toEqual(['Open AR', 'Open AR Proposed']);
        });

        it('gives an unreviewed concept no seed: the expansion service resolves none (reviewer probe)', async () => {
            await setup();
            provider.Rows['MJ: Graph Concepts'] = provider.Rows['MJ: Graph Concepts'].map((c) => ({ ...c, Status: 'Proposed' }));
            await GraphEngine.Instance.Config(true, analyst, provider as unknown as IMetadataProvider);
            const service = CanonGraphEngine.Instance.AsExpansionService();
            expect(await service.ResolveSeeds('Open AR', ['MJ Canon'], analyst)).toEqual([]);
            expect(await CanonGraphEngine.Instance.ExplainConcept('Open AR', analyst)).toBeNull();
            expect((await CanonGraphEngine.Instance.ExplainConcept('Open AR', analyst, undefined, true))?.Concept.Label).toBe('Open AR');
        });

        it('matches only on fields the caller and every reader may read, so a denied synonym is no oracle', async () => {
            const rows = CanonMetadataRows();
            provider.Reset(rows, StandardEntitySpecs({ 'MJ: Graph Concepts': { ReadRoles: 'all', DeniedReadFieldsByRole: { Intern: ['Synonyms'] } } }));
            await GraphEngine.Instance.Config(true, analyst, provider as unknown as IMetadataProvider);
            const intern = MakeUser('u-intern', ['Intern']);
            expect((await CanonGraphEngine.Instance.FindConcepts('Unpaid Invoices', analyst)).map((c) => c.Label)).toEqual(['Open AR']);
            expect(await CanonGraphEngine.Instance.FindConcepts('Unpaid Invoices', intern)).toEqual([]);
            expect(await CanonGraphEngine.Instance.FindConcepts('Unpaid Invoices', analyst, { AudienceReaders: [intern] })).toEqual([]);
            expect((await CanonGraphEngine.Instance.FindConcepts('Open AR', intern)).map((c) => c.Label)).toEqual(['Open AR']);
        });

        it('applies audience readers too', async () => {
            await setup();
            const reader = MakeUser('u-reader');
            provider.HiddenFor[reader.ID] = [`MJ: Graph Concepts|${IDS.ConceptOpenAr}`];
            expect(await CanonGraphEngine.Instance.FindConcepts('Open AR', analyst, { AudienceReaders: [reader] })).toEqual([]);
        });
    });

    describe('ExplainConcept', () => {
        it('returns null for a concept the caller cannot read, though it is cached', async () => {
            await setup();
            provider.HiddenFor[analyst.ID] = [`MJ: Graph Concepts|${IDS.ConceptHidden}`];
            expect(await CanonGraphEngine.Instance.ExplainConcept('Executive Bonus Pool', analyst)).toBeNull();
        });

        it('takes the specification from the caller\'s own read, not the cache', async () => {
            await setup();
            const concepts = provider.Rows['MJ: Graph Concepts'];
            // What this caller's read returns (field-level security blanked the specification).
            provider.Rows['MJ: Graph Concepts'] = concepts.map((c) => (c['ID'] === IDS.ConceptOpenAr ? { ...c, Specification: null } : c));
            const explained = await CanonGraphEngine.Instance.ExplainConcept('Open AR', analyst);
            expect(explained?.Concept.Label).toBe('Open AR');
            expect(explained?.Specification).toBeNull();
            expect(explained?.Synonyms).toContain('Unpaid Invoices');
        });
    });

    describe('ExplainEntity', () => {
        it('labels concepts and queries by the edge that links them to the entity', async () => {
            await setup({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeDescribes, 'Describes', NODE.Entity(IDS.Invoices), NODE.Concept(IDS.ConceptOpenAr), 0.9),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeReads, 'Reads', NODE.Query(IDS.QueryArAging), NODE.Entity(IDS.Invoices), 0.8),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryArAging), NODE.Concept(IDS.ConceptRevenue), 0.9),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryBaseInvoices), NODE.Concept(IDS.ConceptOpenAr), 0.9),
                ],
                'MJ: Graph Edge Types': [
                    ...CanonMetadataRows()['MJ: Graph Edge Types'],
                    { ID: IDS.EdgeTypeReads, Name: 'Reads', InverseName: 'Read By', IsDirected: true, DefaultWeight: 0.8, AllowStored: false, GraphID: null },
                ],
            });
            const explained = await CanonGraphEngine.Instance.ExplainEntity('Invoices', analyst);
            // Net Revenue is two hops away through a query, not described by Invoices.
            expect(explained.DescribedConcepts.map((c) => c.Label)).toEqual(['Open AR']);
            // AR Aging reads Invoices (it also measures another concept — it is still a reading query).
            expect(explained.ReadingQueries.map((q) => q.Label)).toEqual(['AR Aging']);
            // Base Invoices measures a concept Invoices describes.
            expect(explained.MeasuringQueries.map((q) => q.Label)).toEqual(['Base Invoices']);
        });

        it('classifies a pipeline-trained metric concept: the query that Measures it is a MeasuringQuery (artifact -> concept)', async () => {
            // The shape the Content Pipeline's synthesizer now writes for a concept grounded to both an
            // entity and a query: Entity --Describes--> Concept and Query --Measures--> Concept, Inferred.
            const inferred = (row: ReturnType<typeof StoredEdge>) => ({ ...row, Origin: 'Inferred', Confidence: 0.8 });
            await setup({
                'MJ: Graph Edges': [
                    inferred(StoredEdge(IDS.GraphCanon, IDS.EdgeTypeDescribes, 'Describes', NODE.Entity(IDS.Invoices), NODE.Concept(IDS.ConceptRevenue), 0.9)),
                    inferred(StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryArAging), NODE.Concept(IDS.ConceptRevenue), 0.9)),
                    // Stored the old way (concept as source): the endpoint rows refuse it, so it is never classified.
                    inferred(StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Concept(IDS.ConceptRevenue), NODE.Query(IDS.QueryBaseInvoices), 0.9)),
                ],
                'MJ: Graph Edge Type Endpoints': [
                    { ID: 'ep-describes-source', EdgeTypeID: IDS.EdgeTypeDescribes, Side: 'Source', EntityID: IDS.EntityMeta },
                    { ID: 'ep-describes-target', EdgeTypeID: IDS.EdgeTypeDescribes, Side: 'Target', EntityID: IDS.ConceptMeta },
                    { ID: 'ep-measures-source', EdgeTypeID: IDS.EdgeTypeMeasures, Side: 'Source', EntityID: IDS.QueryMeta },
                    { ID: 'ep-measures-target', EdgeTypeID: IDS.EdgeTypeMeasures, Side: 'Target', EntityID: IDS.ConceptMeta },
                ],
            });
            const explained = await CanonGraphEngine.Instance.ExplainEntity('Invoices', analyst);
            expect(explained.DescribedConcepts.map((c) => c.Label)).toEqual(['Net Revenue']);
            expect(explained.MeasuringQueries.map((q) => q.Label)).toEqual(['AR Aging']);
            expect(explained.Edges.some((e) => e.Source.EntityName === 'MJ: Graph Concepts' && e.TypeName === 'Measures')).toBe(false);
        });

        it('reads through the provider it is given, for the entity explanation and the expansion service', async () => {
            await setup({
                'MJ: Graph Edges': [StoredEdge(IDS.GraphCanon, IDS.EdgeTypeDescribes, 'Describes', NODE.Entity(IDS.Invoices), NODE.Concept(IDS.ConceptOpenAr), 0.9)],
            });
            const requestProvider = new FakeGraphProvider().Reset({ ...provider.Rows });
            // The engine's own Preload-edge cache still loads through the engine's provider; every read
            // made for the caller (node visibility) must go through the one passed in.
            const callerReads = (fake: FakeGraphProvider) => fake.ReadLog.filter((r) => r.UserID === analyst.ID && r.EntityName !== 'MJ: Graph Edges');
            provider.ReadLog = [];
            const explained = await CanonGraphEngine.Instance.ExplainEntity('Invoices', analyst, requestProvider as unknown as IMetadataProvider);
            expect(explained.DescribedConcepts.map((c) => c.Label)).toEqual(['Open AR']);
            expect(requestProvider.ReadsOf('MJ: Graph Concepts', analyst.ID).length).toBeGreaterThan(0);
            expect(callerReads(provider)).toEqual([]);

            requestProvider.ReadLog = [];
            const service = CanonGraphEngine.Instance.AsExpansionService();
            await service.Expand({ Seeds: [{ EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptOpenAr }], GraphNames: ['MJ Canon'] }, analyst, requestProvider as unknown as IMetadataProvider);
            expect(requestProvider.ReadsOf('MJ: Graph Concepts', analyst.ID).length).toBeGreaterThan(0);
            expect(callerReads(provider)).toEqual([]);
        });

        it('returns an empty explanation for an entity the caller cannot read', async () => {
            await setup();
            const explained = await CanonGraphEngine.Instance.ExplainEntity('SecretDeals', analyst);
            expect(explained.DescribedConcepts).toEqual([]);
            expect(explained.Edges).toEqual([]);
        });

        it('returns an empty explanation without calling Subgraph when no active canon graphs exist', async () => {
            await setup({
                'MJ: Graphs': CanonMetadataRows()['MJ: Graphs'].map((g) => ({ ...g, Status: 'Inactive' })),
            });
            const subgraphSpy = vi.spyOn(GraphEngine.Instance, 'Subgraph');
            try {
                const explained = await CanonGraphEngine.Instance.ExplainEntity('Invoices', analyst);
                expect(explained).toEqual({
                    EntityName: 'Invoices',
                    DescribedConcepts: [],
                    AlternateBaseViews: [],
                    ReadingQueries: [],
                    MeasuringQueries: [],
                    Edges: [],
                });
                expect(subgraphSpy).not.toHaveBeenCalled();
            } finally {
                subgraphSpy.mockRestore();
            }
        });
    });

    describe('expansion service', () => {
        it('applies the audience during traversal and carries each node\'s path and seed rank', async () => {
            await setup({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('mid'), 0.9),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Account('mid'), NODE.Account('far'), 0.8),
                ],
                Accounts: [
                    { ID: 'mid', Name: 'Middle' },
                    { ID: 'far', Name: 'Far' },
                ],
            });
            const service = CanonGraphEngine.Instance.AsExpansionService();
            const seeds = await service.ResolveSeeds('Open AR', ['MJ Canon'], analyst);
            expect(seeds.map((s) => s.RecordID)).toEqual([IDS.ConceptOpenAr]);

            const open = await service.Expand({ Seeds: seeds, GraphNames: ['MJ Canon'], MaxDepth: 2 }, analyst);
            const far = open.Nodes.find((n) => n.RecordID === 'far');
            expect(far?.PathEdges?.map((e) => e.Weight)).toEqual([0.9, 0.8]);
            expect(far?.SeedRank).toBe(1);
            expect(far?.SeedTitle).toBe('Open AR');

            const reader = MakeUser('u-reader');
            provider.HiddenFor[reader.ID] = ['Accounts|mid'];
            const withReader = await service.Expand({ Seeds: seeds, GraphNames: ['MJ Canon'], MaxDepth: 2, AudienceReaders: [reader] }, analyst);
            expect(withReader.Nodes.map((n) => n.RecordID)).toEqual([IDS.ConceptOpenAr]);
        });

        it('checks seeds for the caller and every audience reader, and reports only the seeds it admitted', async () => {
            await setup();
            const reader = MakeUser('u-reader');
            provider.HiddenFor[reader.ID] = [`MJ: Graph Concepts|${IDS.ConceptOpenAr}`];
            const service = CanonGraphEngine.Instance.AsExpansionService();

            // Text seeds: the concept the reader cannot see is not a seed at all (no name, no ID).
            expect((await service.ResolveSeeds('Open AR', ['MJ Canon'], analyst)).map((s) => s.RecordID)).toEqual([IDS.ConceptOpenAr]);
            expect(await service.ResolveSeeds('Open AR', ['MJ Canon'], analyst, undefined, [reader])).toEqual([]);

            // Entity-name seeds: an entity a reader cannot read is not a seed either.
            const executive = MakeUser('u-exec', ['Analyst', 'Executive']);
            expect((await service.ResolveSeeds('SecretDeals by owner', ['MJ Canon'], executive)).map((s) => s.Title)).toEqual(['SecretDeals']);
            expect(await service.ResolveSeeds('SecretDeals by owner', ['MJ Canon'], executive, undefined, [analyst])).toEqual([]);

            // A seed handed in directly is reported only when admitted, with the checked label, never the requested title.
            const requested = [{ EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptOpenAr, Title: 'requested title' }];
            const hidden = await service.Expand({ Seeds: requested, GraphNames: ['MJ Canon'], AudienceReaders: [reader] }, analyst);
            expect(hidden.Seeds).toEqual([]);
            expect(hidden.Nodes).toEqual([]);
            const visible = await service.Expand({ Seeds: requested, GraphNames: ['MJ Canon'] }, analyst);
            expect(visible.Seeds?.map((s) => [s.RecordID, s.Title])).toEqual([[IDS.ConceptOpenAr, 'Open AR']]);
        });

        it('is a no-op for a graph that is not active, and says why', async () => {
            await setup();
            const service = CanonGraphEngine.Instance.AsExpansionService();
            expect(await service.ResolveSeeds('Open AR', ['Old Graph'], analyst)).toEqual([]);
            const result = await service.Expand({ Seeds: [{ EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptOpenAr }], GraphNames: ['No Such Graph'] }, analyst);
            expect(result.Nodes).toEqual([]);
            expect(result.Messages?.[0]).toContain('not found or is not active');
        });
    });
    describe('ResolveConcepts and ambiguity', () => {
        const rows = (): FakeRow[] => CanonMetadataRows()['MJ: Graph Concepts'];
        const openOrders = (): FakeRow => ({ ...rows()[1], ID: '77777777-7777-4777-8777-777777777791', Name: 'Open Orders', Synonyms: null });
        const openSecrets = (): FakeRow => ({ ...rows()[1], ID: '77777777-7777-4777-8777-777777777792', Name: 'Open Secrets', Synonyms: null });

        it('matches a whole name exactly, and a question naming two concepts as two matches, not an ambiguity', async () => {
            await setup({ 'MJ: Graph Concepts': [openOrders()] });
            const exact = await CanonGraphEngine.Instance.ResolveConcepts('Open AR', analyst);
            expect(exact.Status).toBe('Matched');
            expect(exact.Matches[0]).toMatchObject({ Kind: 'Exact', Score: 1 });
            const both = await CanonGraphEngine.Instance.ResolveConcepts('how does open ar relate to net revenue?', analyst);
            expect(both.Status).toBe('Matched');
            expect(both.Matches.slice(0, 2).map((m) => m.Node.Label).sort()).toEqual(['Net Revenue', 'Open AR']);
        });

        it('calls a fragment that fits several concepts equally well ambiguous, with the tied candidates', async () => {
            await setup({ 'MJ: Graph Concepts': [openOrders()] });
            const result = await CanonGraphEngine.Instance.ResolveConcepts('open', analyst);
            expect(result.Status).toBe('Ambiguous');
            expect(result.Candidates.map((c) => c.Node.Label).sort()).toEqual(['Open AR', 'Open Orders']);
            expect(await CanonGraphEngine.Instance.FindConcepts('open', analyst)).toHaveLength(2); // FindConcepts is unchanged
        });

        it('never lets a concept the caller cannot see make a visible one ambiguous', async () => {
            await setup({ 'MJ: Graph Concepts': [openSecrets()] });
            provider.HiddenFor[analyst.ID] = ['MJ: Graph Concepts|77777777-7777-4777-8777-777777777792'];
            const result = await CanonGraphEngine.Instance.ResolveConcepts('open', analyst);
            expect(result.Status).toBe('Matched');
            expect(result.Matches.map((m) => m.Node.Label)).toEqual(['Open AR']);
        });

        it('reports NoMatch when nothing matches', async () => {
            await setup();
            expect((await CanonGraphEngine.Instance.ResolveConcepts('zebra crossings', analyst)).Status).toBe('NoMatch');
        });

        it('matches concept names and short acronym synonyms only at word boundaries', async () => {
            const baseRows = CanonMetadataRows()['MJ: Graph Concepts'];
            provider.Reset({
                ...CanonMetadataRows(),
                'MJ: Graph Concepts': [
                    { ...baseRows[0], Synonyms: JSON.stringify(['AR', 'Unpaid Invoices']) },
                    baseRows[1],
                    baseRows[2],
                    { ...baseRows[1], ID: '77777777-7777-4777-8777-777777777795', Name: 'Series A', Synonyms: null },
                    { ...baseRows[1], ID: '77777777-7777-4777-8777-777777777797', Name: 'Series B', Synonyms: null },
                    { ...baseRows[1], ID: '77777777-7777-4777-8777-777777777796', Name: 'Reopen Rate', Synonyms: null },
                ],
            });
            await GraphEngine.Instance.Config(true, analyst, provider as unknown as IMetadataProvider);

            expect((await CanonGraphEngine.Instance.ResolveConcepts('what are our quarterly margin targets?', analyst)).Status).toBe('NoMatch');

            const seriesB = await CanonGraphEngine.Instance.ResolveConcepts('what is series b?', analyst);
            expect(seriesB.Status).toBe('Matched');
            expect(seriesB.Matches[0]).toMatchObject({ Kind: 'Mention', Score: 0.9 });
            expect(seriesB.Matches[0].Node.Label).toBe('Series B');
            expect(seriesB.Matches.find((m) => m.Node.Label === 'Series A')?.Kind).toBe('Token');

            const arMention = await CanonGraphEngine.Instance.ResolveConcepts('what is our ar balance?', analyst);
            expect(arMention.Status).toBe('Matched');
            expect(arMention.Matches[0]).toMatchObject({ Kind: 'Mention', Score: 0.85 });
            expect(arMention.Matches[0].Node.Label).toBe('Open AR');

            const seriesA = await CanonGraphEngine.Instance.ResolveConcepts('what is series a?', analyst);
            expect(seriesA.Status).toBe('Matched');
            expect(seriesA.Matches[0]).toMatchObject({ Kind: 'Mention', Score: 0.9 });
            expect(seriesA.Matches[0].Node.Label).toBe('Series A');
            expect(seriesA.Matches.find((m) => m.Node.Label === 'Series B')?.Kind).toBe('Token');

            const openPartial = await CanonGraphEngine.Instance.ResolveConcepts('open', analyst);
            expect(openPartial.Status).toBe('Matched');
            expect(openPartial.Matches.map((m) => m.Node.Label)).toEqual(['Open AR']);
        });

        it('ClassifyConceptMatches: two exact matches tie; partial matches tie only within the margin', () => {
            const m = (label: string, score: number, kind: ConceptMatch['Kind']): ConceptMatch => ({
                Node: { Key: label, EntityName: 'MJ: Graph Concepts', RecordID: label, Label: label, Icon: null, Description: null },
                Score: score,
                Kind: kind,
            });
            expect(ClassifyConceptMatches([m('A', 1, 'Exact'), m('B', 1, 'Exact')]).Status).toBe('Ambiguous');
            expect(ClassifyConceptMatches([m('A', 1, 'Exact'), m('B', 0.9, 'Partial')]).Status).toBe('Matched');
            expect(ClassifyConceptMatches([m('A', 0.5, 'Token'), m('B', 0.46, 'Token')]).Status).toBe('Ambiguous');
            expect(ClassifyConceptMatches([m('A', 0.5, 'Token'), m('B', 0.25, 'Token')]).Status).toBe('Matched');
            expect(ClassifyConceptMatches([m('A', 0.9, 'Mention'), m('B', 0.9, 'Mention')]).Status).toBe('Matched');
            expect(ClassifyConceptMatches([]).Status).toBe('NoMatch');
        });
    });

    describe('ResolveGraphEndpoint', () => {
        it('takes a record reference as given, a concept by ID or exact name, and reports ambiguous and unknown names', async () => {
            const rows = CanonMetadataRows()['MJ: Graph Concepts'];
            await setup({ 'MJ: Graph Concepts': [{ ...rows[1], ID: '77777777-7777-4777-8777-777777777791', Name: 'Open Orders', Synonyms: null }] });
            const canon = CanonGraphEngine.Instance;
            expect(await canon.ResolveGraphEndpoint({ EntityName: 'Accounts', RecordID: 'acc-1', Concept: 'ignored' }, 'MJ Canon', analyst)).toEqual({
                Status: 'Resolved',
                Node: { EntityName: 'Accounts', RecordID: 'acc-1' },
                Candidates: [],
            });
            const byId = await canon.ResolveGraphEndpoint({ Concept: IDS.ConceptRevenue.toLowerCase() }, 'MJ Canon', analyst);
            expect(byId.Node).toMatchObject({ EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptRevenue });
            const byName = await canon.ResolveGraphEndpoint({ Concept: 'Unpaid Invoices' }, 'MJ Canon', analyst);
            expect(byName.Node?.RecordID).toBe(IDS.ConceptOpenAr);
            const ambiguous = await canon.ResolveGraphEndpoint({ Concept: 'open' }, 'MJ Canon', analyst);
            expect(ambiguous.Status).toBe('Ambiguous');
            expect(ambiguous.Candidates).toHaveLength(2);
            expect((await canon.ResolveGraphEndpoint({ Concept: 'zebra' }, 'MJ Canon', analyst)).Status).toBe('NotFound');
            expect((await canon.ResolveGraphEndpoint({}, 'MJ Canon', analyst)).Status).toBe('NotFound');
        });

        it('reports NotFound for a concept ID that is hidden by RLS or in a non-visible status', async () => {
            const rows = CanonMetadataRows()['MJ: Graph Concepts'];
            const hiddenId = '77777777-7777-4777-8777-777777777792';
            const proposedId = '77777777-7777-4777-8777-777777777794';
            await setup({
                'MJ: Graph Concepts': [
                    { ...rows[1], ID: hiddenId, Name: 'Open Secrets', Synonyms: null },
                    { ...rows[1], ID: proposedId, Name: 'Draft Metric', Synonyms: null, Status: 'Proposed' },
                ],
            });
            provider.HiddenFor[analyst.ID] = [`MJ: Graph Concepts|${hiddenId}`];
            const canon = CanonGraphEngine.Instance;

            expect((await canon.ResolveGraphEndpoint({ Concept: hiddenId }, 'MJ Canon', analyst)).Status).toBe('NotFound');
            expect((await canon.ResolveGraphEndpoint({ Concept: proposedId }, 'MJ Canon', analyst)).Status).toBe('NotFound');
            expect(
                (await canon.ResolveGraphEndpoint({ Concept: proposedId }, 'MJ Canon', analyst, { IncludeProposed: true })).Node?.RecordID,
            ).toBe(proposedId);
        });
    });

    describe('ProposeDomainConcepts', () => {
        function fakeEntity(id: string, name: string, refs: string[], canRead = true): EntityInfo {
            return {
                ID: id,
                Name: name,
                SchemaName: 'sales',
                ParentID: null,
                Fields: refs.map((r) => ({ RelatedEntityID: r })),
                GetUserPermisions: () => ({ CanRead: canRead }),
            } as unknown as EntityInfo;
        }

        it('proposes domains only over entities the caller can read, and skips names already in the graph', async () => {
            const e = (n: number): string => `EEEEEEEE-0000-4000-8000-${String(n).padStart(12, '0')}`;
            await setup({ 'MJ: Graph Concepts': [{ ...CanonMetadataRows()['MJ: Graph Concepts'][1], ID: '77777777-7777-4777-8777-777777777793', Name: 'Quotes domain', Status: 'Proposed' }] });
            const entities = [
                fakeEntity(e(1), 'Sales: Deals', [e(2), e(3)]),
                fakeEntity(e(2), 'Sales: Deal Lines', [e(1), e(3)]),
                fakeEntity(e(3), 'Sales: Products', [e(1)]),
                fakeEntity(e(4), 'Sales: Quotes', [e(5), e(6)]),
                fakeEntity(e(5), 'Sales: Quote Lines', [e(4), e(6)]),
                fakeEntity(e(6), 'Sales: Quote Terms', [e(4)]),
                fakeEntity(e(7), 'Sales: Secret Margins', [e(1), e(2)], false),
            ];
            const stub = { Entities: entities } as unknown as IMetadataProvider;
            vi.spyOn(CanonGraphEngine.Instance, 'EnsureConfigured').mockResolvedValue(undefined);
            const proposals = await CanonGraphEngine.Instance.ProposeDomainConcepts('MJ Canon', analyst, {}, stub);
            expect(proposals.map((p) => p.Name)).toEqual(['Deals domain']); // 'Quotes domain' already exists
            expect(proposals[0].Members.map((m) => m.EntityName)).not.toContain('Sales: Secret Margins');
            expect(await CanonGraphEngine.Instance.ProposeDomainConcepts('No Such Graph', analyst, {}, stub)).toEqual([]);
        });
    });
});
