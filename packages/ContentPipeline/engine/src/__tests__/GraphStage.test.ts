import { beforeEach, describe, expect, it } from 'vitest';
import {
    BasePipelineStage,
    ClassifiedTag,
    ContentChunkSeedInput,
    ExistingGraphConceptSeed,
    SchemaGroundingTarget,
    StageContext,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import {
    GRAPH_STAGE,
    GraphStage,
    GraphStageExecutionSummary,
    IGraphOverlayStore,
} from '../stages/GraphStage.js';
import { TAG_STAGE } from '../stages/TagStage.js';

class InMemoryGraphOverlayStore implements IGraphOverlayStore {
    public ExistingConcepts: ExistingGraphConceptSeed[] = [];
    public GroundingTargets: SchemaGroundingTarget[] = [];
    public CustomChunks?: ContentChunkSeedInput[];
    public SavedConcepts: Array<{
        ID: string;
        GraphID: string;
        Status: 'Proposed' | 'Approved';
        Concept: SynthesizedGraphConcept;
    }> = [];
    public SavedEdges: Array<{
        GraphID: string;
        ConceptID: string;
        Status: 'Proposed' | 'Approved';
        Edge: SynthesizedGraphEdge;
    }> = [];

    public async LoadExistingConcepts(): Promise<ExistingGraphConceptSeed[]> {
        return this.ExistingConcepts;
    }

    public async LoadGroundingTargets(): Promise<SchemaGroundingTarget[]> {
        return this.GroundingTargets;
    }

    public async LoadItemChunks(
        contentItemID: string,
        contentSourceID: string,
        contentItemTitle: string | null,
        tags: readonly string[],
        authorityTier: ContentChunkSeedInput['AuthorityTier'],
    ): Promise<ContentChunkSeedInput[]> {
        if (this.CustomChunks) {
            return this.CustomChunks;
        }
        return [
            {
                ChunkID: `${contentItemID}#chunk-0`,
                ContentItemID: contentItemID,
                ContentSourceID: contentSourceID,
                ContentItemTitle: contentItemTitle,
                Text: 'Default chunk text',
                Tags: tags,
                AuthorityTier: authorityTier,
            },
        ];
    }

    public async UpsertConcept(
        graphID: string,
        concept: SynthesizedGraphConcept,
        status: 'Proposed' | 'Approved',
    ): Promise<string> {
        const id =
            concept.ExistingConceptID ??
            `concept-${this.SavedConcepts.length + 1}-${concept.Name.toLowerCase().replace(/\s+/g, '-')}`;
        this.SavedConcepts.push({ ID: id, GraphID: graphID, Status: status, Concept: concept });
        return id;
    }

    public async UpsertEdges(
        graphID: string,
        conceptID: string,
        edges: readonly SynthesizedGraphEdge[],
        status: 'Proposed' | 'Approved',
    ): Promise<number> {
        for (const edge of edges) {
            this.SavedEdges.push({ GraphID: graphID, ConceptID: conceptID, Status: status, Edge: edge });
        }
        return edges.length;
    }
}

function buildStageContext(
    configuration: Record<string, unknown> = {},
    isTest = false,
): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {
            RunView: async () => ({ Success: true, Results: [] }),
        } as never,
        Configuration: configuration,
        IsTest: isTest,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

function buildWorkingItemWithChunks(
    chunks: Array<{ text: string; decorator?: string; recordId?: string }>,
    tags: ClassifiedTag[] = [],
): WorkingRecord {
    const item = new WorkingRecord(
        new WorkingRecordIdentity('Content Item', 'https://canon.test/manual.pdf', 'ITEM-MANUAL-1'),
    );
    item.Propose('Title', 'Governance & Membership Manual', 0.9, 'Extract');
    item.Propose('Text', chunks.map((c) => c.text).join('\n\n'), 0.9, 'Extract');

    chunks.forEach((c, idx) => {
        const child = new WorkingRecord(
            new WorkingRecordIdentity(
                'Content Item Chunk',
                `https://canon.test/manual.pdf#segment-${idx}`,
                c.recordId ?? `CHUNK-${idx + 1}`,
            ),
        );
        child.SetExtension('Pipeline', 'columns', { Sequence: idx });
        child.Propose('Text', c.text, 0.9, 'Segment');
        if (c.decorator) {
            child.Propose('Decorator', c.decorator, 0.9, 'Segment');
        }
        item.AddChild(child);
    });

    if (tags.length > 0) {
        item.SetExtension(TAG_STAGE, 'tags', tags);
    }

    return item;
}

describe('GraphStage (@memberjunction/content-pipeline)', () => {
    let store: InMemoryGraphOverlayStore;

    beforeEach(() => {
        store = new InMemoryGraphOverlayStore();
        GraphStage.SetDefaultStore(null);
    });

    it('resolves via BasePipelineStage.Resolve("Graph")', () => {
        const resolved = BasePipelineStage.Resolve(GRAPH_STAGE);
        expect(resolved).toBeInstanceOf(GraphStage);
        expect(resolved?.Name).toBe('Graph');
    });

    it('skips when EnableGraphOverlay is false or GraphID is unset', async () => {
        const stage = new GraphStage();
        const record = buildWorkingItemWithChunks([
            { text: 'Members must renew within 30 days.', decorator: 'Section 1 > Grace Period' },
        ]);

        const disabledOutcome = await stage.Run(record, buildStageContext({}));
        expect(disabledOutcome.Status).toBe('Skipped');

        const missingGraphIdOutcome = await stage.Run(
            record,
            buildStageContext({
                GraphOverlay: {
                    EnableGraphOverlay: true,
                },
            }),
        );
        expect(missingGraphIdOutcome.Status).toBe('Skipped');
    });

    it('synthesizes Proposed Canon GraphConcepts, schema grounding edges, and Contradicts edges in Canon mode', async () => {
        store.GroundingTargets = [
            {
                EntityName: 'MJ: Entities',
                RecordID: 'ENTITY-MEMBERSHIP',
                Name: 'Membership Grace Period',
                Description: 'Tracks member renewal grace window and expiration dates',
            },
            {
                EntityName: 'MJ: Queries',
                RecordID: 'QUERY-GRACE-PERIOD',
                Name: 'Membership Grace Period Metrics',
                Description: 'Calculates active members inside the grace period',
            },
        ];

        store.CustomChunks = [
            {
                ChunkID: 'CHUNK-BYLAWS-1',
                ContentItemID: 'ITEM-MANUAL-1',
                ContentSourceID: 'SOURCE-BYLAWS',
                ContentItemTitle: 'Association Bylaws',
                HeadingPath: 'Article IV > Membership Grace Period',
                Text: 'Under the Bylaws, the Membership Grace Period is 60 days after invoice due date before suspension.',
                Tags: ['Membership Grace Period'],
                AuthorityTier: 'Bylaws',
            },
            {
                ChunkID: 'CHUNK-SOP-2',
                ContentItemID: 'ITEM-MANUAL-1',
                ContentSourceID: 'SOURCE-SOP',
                ContentItemTitle: 'Billing Practice Guide',
                HeadingPath: 'Billing Guide > Membership Grace Period',
                Text: 'In billing practice, the Membership Grace Period is 30 days after invoice due date before suspension.',
                Tags: ['Membership Grace Period'],
                AuthorityTier: 'DepartmentPractice',
            },
        ];

        const stage = new GraphStage();
        const record = new WorkingRecord(
            new WorkingRecordIdentity('Content Item', 'https://canon.test/manual.pdf', 'ITEM-MANUAL-1'),
        );
        record.Propose('Title', 'Governance & Membership Manual', 0.9, 'Extract');
        record.SetExtension(TAG_STAGE, 'tags', [{ Name: 'Membership Grace Period', Score: 0.95 }]);

        const outcome = await stage.Run(
            record,
            buildStageContext({
                GraphOverlay: {
                    EnableGraphOverlay: true,
                    GraphID: 'GRAPH-CANON-1',
                    TargetGraphType: 'Canon',
                    AuthorityTier: 'Bylaws',
                    GroundingMode: 'full-canon',
                },
                GraphOverlayStore: store,
            }),
        );

        expect(outcome.Status).toBe('Complete');
        expect(store.SavedConcepts.length).toBeGreaterThanOrEqual(1);

        const graceConcept = store.SavedConcepts.find((c) =>
            c.Concept.Name.toLowerCase().includes('grace period'),
        );
        expect(graceConcept).toBeDefined();
        // Canon graphs default to 'propose-only' -> Status = 'Proposed'
        expect(graceConcept!.Status).toBe('Proposed');
        expect(graceConcept!.Concept.AuthorityTier).toBe('Bylaws');
        expect(graceConcept!.Concept.Citations.length).toBe(2);

        const edgeTypes = store.SavedEdges.map((e) => e.Edge.EdgeTypeName);
        expect(edgeTypes).toContain('SourcedFrom');
        expect(edgeTypes).toContain('Mentions');
        expect(edgeTypes).toContain('Describes');
        expect(edgeTypes).toContain('Contradicts');

        const summary = record.GetExtension<GraphStageExecutionSummary>(GRAPH_STAGE, 'summary');
        expect(summary).toBeDefined();
        expect(summary!.PersistedConceptCount).toBe(store.SavedConcepts.length);
    });

    it('auto-approves concepts in Knowledge Graph mode and honors constrained taxonomy mode', async () => {
        store.ExistingConcepts = [
            {
                ConceptID: 'EXISTING-CONCEPT-ARR',
                Name: 'Net Retention Rate',
                ConceptType: 'Metric',
                Synonyms: ['NRR'],
                AuthorityTier: 'ExecutiveSOP',
            },
        ];

        const stage = new GraphStage();
        const record = buildWorkingItemWithChunks(
            [
                {
                    recordId: 'CHUNK-NRR-1',
                    decorator: 'Metrics > Net Retention Rate',
                    text: 'Net Retention Rate (NRR) measures recurring revenue retained from existing cohorts over 12 months.',
                },
                {
                    recordId: 'CHUNK-NEW-TOPIC',
                    decorator: 'Appendix > Unlisted Experimental Topic',
                    text: 'Unlisted Experimental Topic covers ad-hoc sandbox trials.',
                },
            ],
            [],
        );

        const constrainedOutcome = await stage.Run(
            record,
            buildStageContext({
                GraphOverlay: {
                    EnableGraphOverlay: true,
                    GraphID: 'GRAPH-KNOWLEDGE-1',
                    TargetGraphType: 'Knowledge',
                    ConceptTaxonomyMode: 'constrained',
                },
                GraphOverlayStore: store,
            }),
        );

        expect(constrainedOutcome.Status).toBe('Complete');
        const summary = record.GetExtension<GraphStageExecutionSummary>(GRAPH_STAGE, 'summary');
        expect(summary).toBeDefined();
        // Only the matched existing concept should be persisted; the unmatched chunk is recorded in UnmatchedChunkIDs
        expect(store.SavedConcepts.length).toBe(1);
        expect(store.SavedConcepts[0].ID).toBe('EXISTING-CONCEPT-ARR');
        expect(summary!.ClusteringResult.UnmatchedChunkIDs).toContain('CHUNK-NEW-TOPIC');
    });
});
