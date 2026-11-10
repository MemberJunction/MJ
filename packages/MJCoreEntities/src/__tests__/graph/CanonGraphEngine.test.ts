/**
 * CanonGraphEngine: concept lookup and explanations checked as the caller (row-level security via a
 * user-aware fake), ExplainEntity labels by edge type, and the engine-backed expansion service with
 * the audience applied during traversal.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CanonGraphEngine } from '../../engines/CanonGraphEngine';
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
});
