/**
 * @fileoverview Provenance access policies: a node derived from a record is visible only to someone
 * who can see that record.
 *
 * The Content Pipeline turns a source record (a document, an entity row) into a content item, the
 * item into chunks, and chunks into graph concepts. Those are separate entities with their own
 * permissions, which know nothing about who may read the source. Without these policies a concept
 * synthesized from a private document would show what that document says to anyone who can read
 * concepts. The chain each policy follows:
 *
 *   concept --SourcedFrom--> chunk --ContentItemID--> content item --EntityRecordDocument--> source record
 *
 * Every link is checked through the full graph check (`ResolveVisibleKeys`), so the source record's
 * own rules decide, whatever they are: row-level security, or the read hooks a server registers for
 * entities such as `MJ: Artifacts`. No second copy of any entity's access rules lives here.
 *
 * @module @memberjunction/core-entities
 */

import { LogError, RunView, RunViewResult } from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID, RegisterClass, UUIDMap } from '@memberjunction/global';
import type {
    MJContentItemChunkEntityType,
    MJContentItemEntityType,
    MJEntityRecordDocumentEntityType,
    MJGraphConceptEntityType,
    MJGraphEdgeEntityType,
} from '../../generated/entities/__mj';
import type { GraphNodeRef } from '../BaseGraphEdgeProvider';
import {
    BaseGraphNodeAccessPolicy,
    type GraphAccessPolicyContext,
    type GraphNodeAccessDecision,
    type GraphPolicyNode,
} from '../GraphAccessPolicy';

const CONTENT_ITEMS_ENTITY = 'MJ: Content Items';
const CONTENT_CHUNKS_ENTITY = 'MJ: Content Item Chunks';
const GRAPH_CONCEPTS_ENTITY = 'MJ: Graph Concepts';
const SOURCED_FROM_EDGE_TYPE = 'SourcedFrom';
/** Upper bound on provenance rows one policy call reads; past it the call fails closed. */
const MAX_PROVENANCE_ROWS = 5000;

/** Rows are read with `ResultType: 'simple'`, where the primary key is always present. */
type WithID = { ID: string };
type ChunkRow = WithID & Pick<MJContentItemChunkEntityType, 'ContentItemID'>;
type ItemRow = WithID & Pick<MJContentItemEntityType, 'EntityRecordDocumentID'>;
type RecordDocRow = WithID & Pick<MJEntityRecordDocumentEntityType, 'EntityID' | 'RecordID'>;
type ConceptRow = WithID & Pick<MJGraphConceptEntityType, 'GraphID' | 'Status' | 'Origin'>;
type SourcedFromRow = WithID & Pick<MJGraphEdgeEntityType, 'SourceRecordID' | 'TargetEntityID' | 'TargetRecordID'>;

/**
 * A content item linked to a source record is visible only if that record is. An item with no
 * source record (a file uploaded straight into a content source, a crawled web page) keeps the
 * default decision.
 */
@RegisterClass(BaseGraphNodeAccessPolicy, CONTENT_ITEMS_ENTITY)
export class ContentItemProvenancePolicy extends BaseGraphNodeAccessPolicy {
    public async FilterNodes(
        nodes: readonly GraphPolicyNode[],
        ctx: GraphAccessPolicyContext,
    ): Promise<Map<string, GraphNodeAccessDecision>> {
        const items = await readRows<ItemRow>(ctx, CONTENT_ITEMS_ENTITY, ['ID', 'EntityRecordDocumentID'], idFilter(nodes.map((n) => n.Ref.RecordID)));
        if (!items) {
            return new Map();
        }
        const docIds = items.map((i) => i.EntityRecordDocumentID).filter((id): id is string => !!id);
        const sources = await this.readSourceRecords(docIds, ctx);
        if (!sources) {
            return new Map();
        }
        const visibleSources = await ctx.ResolveVisibleKeys(Array.from(sources.Values()));
        const itemsById = IndexByUUID(items);
        const decisions = new Map<string, GraphNodeAccessDecision>();
        for (const node of nodes) {
            const item = itemsById.Get(node.Ref.RecordID);
            if (!item) {
                continue; // not readable as this principal
            }
            if (!item.EntityRecordDocumentID) {
                decisions.set(node.Key, 'Visible');
                continue;
            }
            const source = sources.Get(item.EntityRecordDocumentID);
            decisions.set(node.Key, source && visibleSources.has(ctx.NodeKey(source)) ? 'Visible' : 'Hidden');
        }
        return decisions;
    }

    /** Source record for each record document, keyed by record document ID; `null` on a failed read. */
    private async readSourceRecords(docIds: string[], ctx: GraphAccessPolicyContext): Promise<UUIDMap<GraphNodeRef> | null> {
        const sources = new UUIDMap<GraphNodeRef>();
        if (docIds.length === 0) {
            return sources;
        }
        const docs = await readRows<RecordDocRow>(ctx, 'MJ: Entity Record Documents', ['ID', 'EntityID', 'RecordID'], idFilter(docIds));
        if (!docs) {
            return null;
        }
        for (const doc of docs) {
            const entity = ctx.Provider.EntityByID(doc.EntityID);
            if (entity) {
                sources.Set(doc.ID, { EntityName: entity.Name, EntityID: entity.ID, RecordID: doc.RecordID });
            }
        }
        return sources;
    }
}

/** A chunk is visible only if its content item is. */
@RegisterClass(BaseGraphNodeAccessPolicy, CONTENT_CHUNKS_ENTITY)
export class ContentChunkProvenancePolicy extends BaseGraphNodeAccessPolicy {
    public async FilterNodes(
        nodes: readonly GraphPolicyNode[],
        ctx: GraphAccessPolicyContext,
    ): Promise<Map<string, GraphNodeAccessDecision>> {
        const chunks = await readRows<ChunkRow>(ctx, CONTENT_CHUNKS_ENTITY, ['ID', 'ContentItemID'], idFilter(nodes.map((n) => n.Ref.RecordID)));
        if (!chunks) {
            return new Map();
        }
        const itemRefs = chunks.map((c): GraphNodeRef => ({ EntityName: CONTENT_ITEMS_ENTITY, RecordID: c.ContentItemID }));
        const visibleItems = await ctx.ResolveVisibleKeys(itemRefs);
        const chunksById = IndexByUUID(chunks);
        const decisions = new Map<string, GraphNodeAccessDecision>();
        for (const node of nodes) {
            const chunk = chunksById.Get(node.Ref.RecordID);
            if (!chunk) {
                continue;
            }
            const itemKey = ctx.NodeKey({ EntityName: CONTENT_ITEMS_ENTITY, RecordID: chunk.ContentItemID });
            decisions.set(node.Key, visibleItems.has(itemKey) ? 'Visible' : 'Hidden');
        }
        return decisions;
    }
}

/**
 * A concept synthesized from documents can quote any of them: its name, description and
 * specification are built from their chunks. So:
 * - `Approved` in a Canon graph: visible (a steward approving it publishes it);
 * - `Declared` (authored, not synthesized) with no recorded sources: visible;
 * - `Inferred` with no recorded sources left (its documents were removed or re-indexed): hidden,
 *   because what it says came from documents this viewer can no longer be checked against;
 * - every source chunk visible to the viewer: visible;
 * - some visible: redacted (the node stays, with a neutral label and no text);
 * - none visible: hidden.
 */
@RegisterClass(BaseGraphNodeAccessPolicy, GRAPH_CONCEPTS_ENTITY)
export class GraphConceptProvenancePolicy extends BaseGraphNodeAccessPolicy {
    public async FilterNodes(
        nodes: readonly GraphPolicyNode[],
        ctx: GraphAccessPolicyContext,
    ): Promise<Map<string, GraphNodeAccessDecision>> {
        const ids = nodes.map((n) => n.Ref.RecordID);
        const [concepts, sources] = await Promise.all([
            readRows<ConceptRow>(ctx, GRAPH_CONCEPTS_ENTITY, ['ID', 'GraphID', 'Status', 'Origin'], idFilter(ids)),
            this.readSourceChunks(ids, ctx),
        ]);
        if (!concepts || !sources) {
            return new Map();
        }
        const allChunkRefs = Array.from(sources.Values()).flat();
        const visibleChunks = await ctx.ResolveVisibleKeys(allChunkRefs);
        const conceptsById = IndexByUUID(concepts);
        const decisions = new Map<string, GraphNodeAccessDecision>();
        for (const node of nodes) {
            const concept = conceptsById.Get(node.Ref.RecordID);
            if (concept) {
                const chunkRefs = sources.Get(concept.ID) ?? [];
                decisions.set(node.Key, this.decide(concept, chunkRefs, visibleChunks, ctx));
            }
        }
        return decisions;
    }

    private decide(
        concept: ConceptRow,
        chunkRefs: GraphNodeRef[],
        visibleChunks: Set<string>,
        ctx: GraphAccessPolicyContext,
    ): GraphNodeAccessDecision {
        if (concept.Status === 'Approved' && ctx.IsCanonGraph(concept.GraphID)) {
            return 'Visible';
        }
        if (chunkRefs.length === 0) {
            return concept.Origin === 'Inferred' ? 'Hidden' : 'Visible';
        }
        const seen = chunkRefs.filter((ref) => visibleChunks.has(ctx.NodeKey(ref))).length;
        if (seen === chunkRefs.length) {
            return 'Visible';
        }
        return seen > 0 ? 'Redacted' : 'Hidden';
    }

    /** Chunks each concept was synthesized from, keyed by concept ID; `null` on a failed read. */
    private async readSourceChunks(conceptIds: string[], ctx: GraphAccessPolicyContext): Promise<UUIDMap<GraphNodeRef[]> | null> {
        const conceptsEntity = ctx.Provider.EntityByName(GRAPH_CONCEPTS_ENTITY);
        if (!conceptsEntity) {
            return null;
        }
        const filter =
            `[SourceEntityID] = '${EscapeSQLString(conceptsEntity.ID)}' AND [EdgeType] = '${SOURCED_FROM_EDGE_TYPE}' AND ` +
            idFilter(conceptIds, 'SourceRecordID');
        const rows = await readRows<SourcedFromRow>(ctx, 'MJ: Graph Edges', ['ID', 'SourceRecordID', 'TargetEntityID', 'TargetRecordID'], filter);
        if (!rows) {
            return null;
        }
        const byConcept = new UUIDMap<GraphNodeRef[]>();
        for (const row of rows) {
            const entity = ctx.Provider.EntityByID(row.TargetEntityID);
            if (!entity) {
                continue;
            }
            const list = byConcept.Get(row.SourceRecordID) ?? [];
            list.push({ EntityName: entity.Name, EntityID: entity.ID, RecordID: row.TargetRecordID });
            byConcept.Set(row.SourceRecordID, list);
        }
        return byConcept;
    }
}

/** `[field] IN ('a', 'b', ...)` over escaped IDs, in the same form the engine's own reads use; matches nothing when empty. */
function idFilter(ids: readonly string[], field = 'ID'): string {
    if (ids.length === 0) {
        return '1 = 0';
    }
    const unique = Array.from(new Set(ids)).sort();
    return `[${field}] IN (${unique.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`;
}

/**
 * One bounded read as the policy's principal. Returns `null` when the read fails or hits the row
 * cap, so the caller fails closed instead of deciding on partial provenance.
 */
async function readRows<T>(ctx: GraphAccessPolicyContext, entityName: string, fields: string[], filter: string): Promise<T[] | null> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const result: RunViewResult<T> = await rv.RunView<T>(
        { EntityName: entityName, Fields: fields, ExtraFilter: filter, MaxRows: MAX_PROVENANCE_ROWS + 1, ResultType: 'simple' },
        ctx.Principal,
    );
    if (!result.Success) {
        LogError(`Graph provenance policy: reading ${entityName} failed: ${result.ErrorMessage}`);
        return null;
    }
    const rows = result.Results ?? [];
    if (rows.length > MAX_PROVENANCE_ROWS) {
        LogError(`Graph provenance policy: ${entityName} returned more than ${MAX_PROVENANCE_ROWS} rows; hiding the affected nodes.`);
        return null;
    }
    return rows;
}

/** Tree-shaking anchor for the provenance access policies. */
export function LoadProvenanceAccessPolicies(): void {
    // Importing this module registers the policies.
}
