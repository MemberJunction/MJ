/**
 * Tests for CanonGraphEngine.RenderCanonDocument:
 * - Full Canon document collapse (Precedence, Concepts, Alternate Base Views, Governed Queries)
 * - Artifact → concept edge direction (Defines, Measures, Describes, Implements per MJ #6842)
 * - Seeded precedence/equivalence edge types (Preferred Over, Supersedes, Same As)
 * - Question-sliced and pre-expanded Subgraph collapse
 * - ConceptTypes, EntityNames, IncludeSpecifications, IncludeProposed, and MaxChars options
 * - Row-level security, field-level security, and AudienceReaders enforcement
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CanonGraphEngine } from '../../engines/CanonGraphEngine';
import { GraphEngine } from '../../graph/GraphEngine';
import { LoadGraphEdgeProviders } from '../../graph';
import { QueryEngine } from '../../engines/QueryEngine';
import type { MJQueryEntityExtended } from '../../custom/MJQueryEntityExtended';
import {
    CanonMetadataRows,
    FakeGraphProvider,
    IDS,
    MakeUser,
    NODE,
    StandardEntitySpecs,
    StoredEdge,
    type FakeRow,
} from './graphTestFixtures';

const EDGE_TYPE_PREFERRED_OVER = '88888888-8888-4888-8888-888888888810';
const EDGE_TYPE_DEFINES = '88888888-8888-4888-8888-888888888811';
const EDGE_TYPE_SAME_AS = '88888888-8888-4888-8888-888888888812';
const CONCEPT_PROPOSED_ID = '77777777-7777-4777-8777-777777777799';

const analyst = MakeUser('u-analyst', ['Analyst']);
const provider = new FakeGraphProvider();

async function setup(
    extra: Record<string, FakeRow[]> = {},
    entityRules?: Parameters<typeof StandardEntitySpecs>[0],
    user: UserInfo = analyst,
): Promise<void> {
    const base = CanonMetadataRows();
    const extraEdgeTypes: FakeRow[] = [
        { ID: EDGE_TYPE_PREFERRED_OVER, Name: 'Preferred Over', IsDirected: true, DefaultWeight: 1.0, Status: 'Active' },
        { ID: EDGE_TYPE_DEFINES, Name: 'Defines', IsDirected: true, DefaultWeight: 1.0, Status: 'Active' },
        { ID: EDGE_TYPE_SAME_AS, Name: 'Same As', IsDirected: false, DefaultWeight: 1.0, Status: 'Active' },
    ];
    const rows: Record<string, FakeRow[]> = {
        ...base,
        ...extra,
        'MJ: Graph Edge Types': [...base['MJ: Graph Edge Types'], ...extraEdgeTypes, ...(extra['MJ: Graph Edge Types'] ?? [])],
        'MJ: Graph Concepts': [...base['MJ: Graph Concepts'], ...(extra['MJ: Graph Concepts'] ?? [])],
        'MJ: Graph Edges': [...base['MJ: Graph Edges'], ...(extra['MJ: Graph Edges'] ?? [])],
    };
    provider.Reset(rows, entityRules ? StandardEntitySpecs(entityRules) : StandardEntitySpecs());
    await GraphEngine.Instance.Config(true, user, provider as unknown as IMetadataProvider);
}

function stubQueries(): void {
    const makeQuery = (
        id: string,
        name: string,
        categoryPath: string,
        status: string,
        canRunFor: (u: UserInfo) => boolean,
    ): MJQueryEntityExtended =>
        ({
            ID: id,
            Name: name,
            CategoryPath: categoryPath,
            Description: `Governed query ${name}`,
            Status: status,
            UserCanRun: (u: UserInfo) => ({ canRun: canRunFor(u), deniedEntities: [] }),
        }) as unknown as MJQueryEntityExtended;

    const all = [
        makeQuery(IDS.QueryArAging, 'AR Aging', 'Finance/AR', 'Approved', () => true),
        makeQuery(IDS.QueryBaseInvoices, 'Base Invoices', 'Finance', 'Approved', () => true),
        makeQuery(IDS.QueryRestricted, 'Executive Revenue', 'Executive', 'Approved', (u) => u.ID !== 'u-intern'),
    ];
    vi.spyOn(QueryEngine.Instance, 'Queries', 'get').mockReturnValue(all);
    vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockImplementation((id: string) => all.find((x) => x.ID === id));
    vi.spyOn(QueryEngine.Instance, 'QueryEntities', 'get').mockReturnValue([
        { QueryID: IDS.QueryArAging, EntityID: IDS.Invoices, Entity: 'Invoices', AlternateBaseView: 'Open Invoices' },
        { QueryID: IDS.QueryBaseInvoices, EntityID: IDS.Invoices, Entity: 'Invoices', AlternateBaseView: null },
        { QueryID: IDS.QueryRestricted, EntityID: IDS.Accounts, Entity: 'Accounts', AlternateBaseView: null },
    ] as unknown as typeof QueryEngine.Instance.QueryEntities);
    vi.spyOn(QueryEngine.Instance, 'QueryDependencies', 'get').mockReturnValue([
        { QueryID: IDS.QueryArAging, DependsOnQueryID: IDS.QueryBaseInvoices, DependsOnQuery: 'Base Invoices', ReferencePath: 'Finance/Base Invoices' },
    ] as unknown as typeof QueryEngine.Instance.QueryDependencies);
}

describe('CanonGraphEngine.RenderCanonDocument', () => {
    beforeEach(() => {
        LoadGraphEdgeProviders();
        stubQueries();
    });

    it('renders full Canon Markdown with precedence rules, artifact → concept grounding, ABVs, and governed queries', async () => {
        await setup({
            'MJ: Graph Edges': [
                // Artifact → Concept edges (per MJ #6842 direction)
                StoredEdge(IDS.GraphCanon, EDGE_TYPE_DEFINES, 'Defines', NODE.Abv(IDS.InvoicesOpenAbv), NODE.Concept(IDS.ConceptOpenAr), 1.0),
                StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryArAging), NODE.Concept(IDS.ConceptOpenAr), 1.0),
                StoredEdge(IDS.GraphCanon, IDS.EdgeTypeDescribes, 'Describes', NODE.Entity(IDS.Invoices), NODE.Concept(IDS.ConceptOpenAr), 1.0),
                // Precedence edge: Preferred Over
                {
                    ...StoredEdge(IDS.GraphCanon, EDGE_TYPE_PREFERRED_OVER, 'Preferred Over', NODE.Abv(IDS.InvoicesOpenAbv), NODE.Entity(IDS.Invoices), 1.0),
                    Description: 'Use Open Invoices view for unpaid AR reporting',
                },
                // Same As edge between concepts
                StoredEdge(IDS.GraphCanon, EDGE_TYPE_SAME_AS, 'Same As', NODE.Concept(IDS.ConceptOpenAr), NODE.Concept(IDS.ConceptRevenue), 1.0),
            ],
        });

        const doc = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            Provider: provider as unknown as IMetadataProvider,
        });

        expect(doc).toContain('# Organizational Canon & Domain Knowledge (MJ Canon)');
        expect(doc).toContain('## 1. Precedence & Deprecation Rules');
        expect(doc).toContain('**Invoices.vwInvoicesOpen** is PREFERRED OVER **Invoices** — Use Open Invoices view for unpaid AR reporting');
        expect(doc).toContain('**Open AR** is SAME AS **Net Revenue**');

        expect(doc).toContain('## 2. Domain Concepts & Definitions');
        expect(doc).toContain('### Open AR (Metric) — Authority: BoardPolicy');
        expect(doc).toContain('- **Synonyms:** Unpaid Invoices, Receivables');
        expect(doc).toContain('- **Grounded By:** Invoices.vwInvoicesOpen (Defines); Invoices (Describes); AR Aging (Measures)');

        expect(doc).toContain('## 3. Canonical Alternate Base Views');
        expect(doc).toContain('**Invoices → vwInvoicesOpen**');
        expect(doc).toContain('**Canon Role:** Defines: Open AR');

        expect(doc).toContain('## 4. Governed Ground-Truth Queries');
        expect(doc).toContain('`Finance/AR/AR Aging`');
        expect(doc).toContain('**Canon Role:** Measures: Open AR');
        expect(doc).toContain('**Reads:** `Invoices.Open Invoices`');
        expect(doc).toContain('**Composes:** `Base Invoices`');
    });

    it('slices the document by Question and by pre-expanded Subgraph', async () => {
        await setup({
            'MJ: Graph Edges': [
                StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryArAging), NODE.Concept(IDS.ConceptOpenAr), 1.0),
            ],
        });

        const questionDoc = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            Question: 'What is our Open AR?',
            Provider: provider as unknown as IMetadataProvider,
        });
        expect(questionDoc).toContain('### Open AR (Metric)');
        expect(questionDoc).not.toContain('### Recognized Revenue');
        expect(questionDoc).toContain('`Finance/AR/AR Aging`');

        const subgraph = await GraphEngine.Instance.Subgraph(
            'MJ Canon',
            [NODE.Concept(IDS.ConceptOpenAr)],
            { Depth: 1, MaxNodes: 20 },
            analyst,
            provider as unknown as IMetadataProvider,
        );
        const subgraphDoc = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            Subgraph: subgraph,
            Provider: provider as unknown as IMetadataProvider,
        });
        expect(subgraphDoc).toContain('### Open AR (Metric)');
        expect(subgraphDoc).not.toContain('### Recognized Revenue');
    });

    it('supports ConceptTypes, IncludeSpecifications, IncludeProposed, and MaxChars options', async () => {
        const baseConcept = CanonMetadataRows()['MJ: Graph Concepts'][0];
        await setup({
            'MJ: Graph Concepts': [
                {
                    ...baseConcept,
                    ID: CONCEPT_PROPOSED_ID,
                    Name: 'Proposed Churn',
                    ConceptType: 'Policy',
                    Status: 'Proposed',
                    Specification: 'Draft policy spec',
                },
            ],
        });

        // Default excludes Proposed concepts
        const defaultDoc = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            Provider: provider as unknown as IMetadataProvider,
        });
        expect(defaultDoc).not.toContain('Proposed Churn');

        // IncludeProposed includes them with [Proposed] badge; ConceptTypes filters to Policy
        const proposedPolicyDoc = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            IncludeProposed: true,
            ConceptTypes: ['Policy'],
            IncludeSpecifications: false,
            Provider: provider as unknown as IMetadataProvider,
        });
        expect(proposedPolicyDoc).toContain('### Proposed Churn (Policy)');
        expect(proposedPolicyDoc).toContain('[Proposed]');
        expect(proposedPolicyDoc).not.toContain('Draft policy spec');
        expect(proposedPolicyDoc).not.toContain('### Open AR');

        // MaxChars truncates deterministically
        const truncated = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            MaxChars: 80,
            Provider: provider as unknown as IMetadataProvider,
        });
        expect(truncated).toContain('...[truncated to 80 chars]');
    });

    it('enforces row-level security, field-level security, and AudienceReaders', async () => {
        const intern = MakeUser('u-intern', ['Intern']);
        await setup(
            {},
            {
                'MJ: Graph Concepts': {
                    ReadRoles: 'all',
                    DeniedReadFieldsByRole: { Intern: ['Specification', 'Synonyms'] },
                },
            },
            analyst,
        );

        // Hide ConceptHidden from intern
        provider.HiddenFor[intern.ID] = [`MJ: Graph Concepts|${IDS.ConceptHidden}`];

        // When rendering for analyst with intern in AudienceReaders:
        // - ConceptHidden is excluded
        // - Synonyms and Specification are omitted (denied to Intern)
        // - QueryRestricted is omitted (Intern cannot run it)
        const sharedDoc = await CanonGraphEngine.Instance.RenderCanonDocument(analyst, {
            AudienceReaders: [intern],
            Provider: provider as unknown as IMetadataProvider,
        });
        expect(sharedDoc).toContain('### Open AR');
        expect(sharedDoc).not.toContain('Executive Bonus Pool');
        expect(sharedDoc).not.toContain('Unpaid Invoices');
        expect(sharedDoc).not.toContain('Executive Revenue');
    });
});
