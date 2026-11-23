/**
 * @fileoverview {@link GraphEvidenceRetractor} — removing what the Graph stage inferred from content
 * items and chunks that are being deleted.
 *
 * The Graph stage writes `Inferred` edges with pipeline records as endpoints: `SourcedFrom` from a
 * concept to a chunk, `Mentions` from a content item to a concept, `Contradicts` between chunks. When a
 * document is deleted or re-indexed, its item and chunks are deleted and those edges lose their
 * evidence. Left in place they point at records that no longer exist, and the concepts they supported
 * keep claiming a source they no longer have.
 *
 * Retraction removes only what the pipeline itself inferred:
 * - `Inferred` edges touching a retracted item or chunk. A `Declared` edge was placed by a person and stays.
 * - a concept left with no `SourcedFrom` edge, when it is `Inferred`, has no child concepts and no
 *   `Declared` edge, and is not `Approved` in a Canon graph. A steward approving a Canon concept
 *   publishes it, so that one stays (the provenance policy keeps it visible). In any other graph,
 *   `Approved` is the source's `GraphOverlay` policy (`auto-grow`), not a person's decision, and a
 *   concept with no source left says nothing anyone can check, so it goes.
 *
 * Deleting an `Approved` edge is otherwise a review decision (`Graph: Approve Edges`). The edges are
 * deleted inside {@link GRAPH_PIPELINE_EVIDENCE_RETRACTION_OPERATION}, which `MJGraphEdgeEntityServer`
 * honours for `Inferred` edges only.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, RunView, ServerOperationScopeManager, UserInfo } from '@memberjunction/core';
import {
    GRAPH_PIPELINE_EVIDENCE_RETRACTION_OPERATION,
    type MJGraphConceptEntity,
    type MJGraphEdgeEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';

const CHUNKS_ENTITY = 'MJ: Content Item Chunks';
const ITEMS_ENTITY = 'MJ: Content Items';
const CONCEPTS_ENTITY = 'MJ: Graph Concepts';
const EDGES_ENTITY = 'MJ: Graph Edges';
const SOURCED_FROM = 'SourcedFrom';

/** What one retraction removed. */
export interface GraphEvidenceRetractionResult {
    /** `Inferred` edges deleted: the retracted records' edges and the edges of removed concepts together. */
    EdgesRemoved: number;
    /** Synthesized concepts deleted because no source was left. */
    ConceptsRemoved: number;
}

/** Retracts graph evidence derived from content items and chunks. Holds no state between calls. */
export class GraphEvidenceRetractor {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /**
     * Remove the `Inferred` edges touching these chunks, then any concept that lost its last source
     * and is safe to remove. Idempotent: a second call finds nothing. Throws when a read or delete
     * fails, so the caller can leave the chunk pending and try again.
     */
    public async RetractChunks(chunkIDs: readonly string[]): Promise<GraphEvidenceRetractionResult> {
        return this.retract(CHUNKS_ENTITY, chunkIDs);
    }

    /** {@link RetractChunks} for content items (the `Mentions` edges an item carries). */
    public async RetractContentItems(itemIDs: readonly string[]): Promise<GraphEvidenceRetractionResult> {
        return this.retract(ITEMS_ENTITY, itemIDs);
    }

    private async retract(entityName: string, recordIDs: readonly string[]): Promise<GraphEvidenceRetractionResult> {
        const entityID = this.provider.EntityByName(entityName)?.ID;
        const conceptEntityID = this.provider.EntityByName(CONCEPTS_ENTITY)?.ID;
        if (recordIDs.length === 0 || !entityID || !conceptEntityID) {
            // A provider without the graph entities holds no graph evidence to retract.
            return { EdgesRemoved: 0, ConceptsRemoved: 0 };
        }
        const edges = await this.loadEdgesTouching(entityID, recordIDs, true);
        const affectedConcepts = this.conceptEndpoints(edges, conceptEntityID);
        let edgesRemoved = await this.deleteEdges(edges);

        const orphans = await this.findOrphanedConcepts(affectedConcepts, conceptEntityID);
        let conceptsRemoved = 0;
        for (const concept of orphans) {
            const removed = await this.removeConcept(concept, conceptEntityID);
            if (removed !== null) {
                edgesRemoved += removed;
                conceptsRemoved++;
            }
        }
        return { EdgesRemoved: edgesRemoved, ConceptsRemoved: conceptsRemoved };
    }

    /** Edges with any of `recordIDs` (of the entity `entityID`) as an endpoint; `inferredOnly` limits them to `Inferred`. */
    private async loadEdgesTouching(entityID: string, recordIDs: readonly string[], inferredOnly: boolean): Promise<MJGraphEdgeEntity[]> {
        const entity = `'${EscapeSQLString(entityID)}'`;
        const ids = inList(recordIDs);
        const filter =
            `(([SourceEntityID] = ${entity} AND [SourceRecordID] IN (${ids})) OR ([TargetEntityID] = ${entity} AND [TargetRecordID] IN (${ids})))` +
            (inferredOnly ? ` AND [Origin] = 'Inferred'` : '');
        const result = await RunView.FromMetadataProvider(this.provider).RunView<MJGraphEdgeEntity>(
            { EntityName: EDGES_ENTITY, ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true },
            this.contextUser,
        );
        if (!result.Success) {
            throw new Error(`GraphEvidenceRetractor: reading graph edges failed: ${result.ErrorMessage}`);
        }
        return result.Results ?? [];
    }

    /** Concepts at either end of these edges. */
    private conceptEndpoints(edges: readonly MJGraphEdgeEntity[], conceptEntityID: string): UUIDSet {
        const concepts = new UUIDSet();
        for (const edge of edges) {
            if (UUIDsEqual(edge.SourceEntityID, conceptEntityID)) {
                concepts.Add(edge.SourceRecordID);
            }
            if (UUIDsEqual(edge.TargetEntityID, conceptEntityID)) {
                concepts.Add(edge.TargetRecordID);
            }
        }
        return concepts;
    }

    /** Delete edges inside the retraction scope; throws on the first refusal. */
    private async deleteEdges(edges: readonly MJGraphEdgeEntity[]): Promise<number> {
        let removed = 0;
        for (const edge of edges) {
            const deleted = await ServerOperationScopeManager.Instance.RunWithAuthority(
                {
                    operationKey: GRAPH_PIPELINE_EVIDENCE_RETRACTION_OPERATION,
                    source: 'ServerEngine',
                    allowedEntities: [EDGES_ENTITY],
                    userId: this.contextUser.ID,
                },
                () => edge.Delete(),
            );
            if (!deleted) {
                throw new Error(`GraphEvidenceRetractor: could not delete graph edge '${edge.ID}': ${edge.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            removed++;
        }
        return removed;
    }

    /**
     * Of `conceptIDs`, the `Inferred` concepts with no `SourcedFrom` edge left and no child concept,
     * except one `Approved` in a Canon graph.
     */
    private async findOrphanedConcepts(conceptIDs: UUIDSet, conceptEntityID: string): Promise<MJGraphConceptEntity[]> {
        const ids = Array.from(conceptIDs);
        if (ids.length === 0) {
            return [];
        }
        const list = inList(ids);
        const rv = RunView.FromMetadataProvider(this.provider);
        const [sources, children, candidates] = await rv.RunViews(
            [
                {
                    EntityName: EDGES_ENTITY,
                    Fields: ['ID', 'SourceRecordID'],
                    ExtraFilter: `[SourceEntityID] = '${EscapeSQLString(conceptEntityID)}' AND [EdgeType] = '${SOURCED_FROM}' AND [SourceRecordID] IN (${list})`,
                    ResultType: 'simple',
                    IgnoreMaxRows: true,
                    BypassCache: true,
                },
                { EntityName: CONCEPTS_ENTITY, Fields: ['ID', 'ParentID'], ExtraFilter: `[ParentID] IN (${list})`, ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
                {
                    EntityName: CONCEPTS_ENTITY,
                    ExtraFilter: `[ID] IN (${list}) AND [Origin] = 'Inferred'`,
                    ResultType: 'entity_object',
                    IgnoreMaxRows: true,
                    BypassCache: true,
                },
            ],
            this.contextUser,
        );
        for (const [label, result] of [['sources', sources], ['children', children], ['candidates', candidates]] as const) {
            if (!result.Success) {
                throw new Error(`GraphEvidenceRetractor: reading concept ${label} failed: ${result.ErrorMessage}`);
            }
        }
        const stillSourced = new UUIDSet((sources.Results as Array<{ SourceRecordID: string }>).map((r) => r.SourceRecordID));
        const parents = new UUIDSet((children.Results as Array<{ ParentID: string }>).map((r) => r.ParentID));
        const orphans = (candidates.Results as MJGraphConceptEntity[]).filter((c) => !stillSourced.Has(c.ID) && !parents.Has(c.ID));
        const canonGraphs = await this.canonGraphIDs(orphans.filter((c) => c.Status === 'Approved').map((c) => c.GraphID));
        return orphans.filter((c) => !(c.Status === 'Approved' && canonGraphs.Has(c.GraphID)));
    }

    /** Of `graphIDs`, the graphs whose type is a Canon type. */
    private async canonGraphIDs(graphIDs: string[]): Promise<UUIDSet> {
        const canon = new UUIDSet();
        if (graphIDs.length === 0) {
            return canon;
        }
        const rv = RunView.FromMetadataProvider(this.provider);
        const graphs = await rv.RunView<{ ID: string; GraphTypeID: string }>(
            { EntityName: 'MJ: Graphs', Fields: ['ID', 'GraphTypeID'], ExtraFilter: `[ID] IN (${inList(graphIDs)})`, ResultType: 'simple', IgnoreMaxRows: true },
            this.contextUser,
        );
        if (!graphs.Success) {
            throw new Error(`GraphEvidenceRetractor: reading graphs failed: ${graphs.ErrorMessage}`);
        }
        const typeIDs = graphs.Results.map((g) => g.GraphTypeID).filter((id): id is string => !!id);
        if (typeIDs.length === 0) {
            return canon; // The graphs are gone or untyped; `IN ()` is not valid SQL.
        }
        const types = await rv.RunView<{ ID: string; IsCanon: boolean }>(
            { EntityName: 'MJ: Graph Types', Fields: ['ID', 'IsCanon'], ExtraFilter: `[ID] IN (${inList(typeIDs)})`, ResultType: 'simple', IgnoreMaxRows: true },
            this.contextUser,
        );
        if (!types.Success) {
            throw new Error(`GraphEvidenceRetractor: reading graph types failed: ${types.ErrorMessage}`);
        }
        const canonTypes = new UUIDSet(types.Results.filter((t) => t.IsCanon).map((t) => t.ID));
        for (const graph of graphs.Results) {
            if (canonTypes.Has(graph.GraphTypeID)) {
                canon.Add(graph.ID);
            }
        }
        return canon;
    }

    /**
     * Delete one orphaned concept and its remaining `Inferred` edges. Returns the number of edges
     * removed, or `null` when the concept is kept because a person connected it (a `Declared` edge).
     */
    private async removeConcept(concept: MJGraphConceptEntity, conceptEntityID: string): Promise<number | null> {
        const edges = await this.loadEdgesTouching(conceptEntityID, [concept.ID], false);
        if (edges.some((e) => e.Origin !== 'Inferred')) {
            return null;
        }
        const removed = await this.deleteEdges(edges);
        if (!(await concept.Delete())) {
            LogError(`GraphEvidenceRetractor: could not delete orphaned concept '${concept.Name}' (${concept.ID}): ${concept.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }
        return removed;
    }
}

/** `'a', 'b', ...` over escaped IDs, sorted and deduplicated. */
function inList(ids: readonly string[]): string {
    return Array.from(new Set(ids.map((id) => NormalizeUUID(id))))
        .sort()
        .map((id) => `'${EscapeSQLString(id)}'`)
        .join(', ');
}
