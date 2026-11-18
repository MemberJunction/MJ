import { LogError, RunView, RunViewResult } from '@memberjunction/core';
import { EscapeSQLString, GroupByUUID, NormalizeUUID, RegisterClass, UUIDMap, UUIDSet } from '@memberjunction/global';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    MatchesEdgeTypeFilter,
    ResolveMaxRowsPerStep,
    type GraphEdgeRequest,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphProviderContext,
} from '../BaseGraphEdgeProvider';

/** Configuration for {@link SharedConceptEdgeProvider}. */
export interface SharedConceptEdgeProviderConfig {
    /** Edge type name to emit. Default `SharesConceptWith`. */
    EdgeType?: string;
    /** Only connect records of these entities (by name). Default: any entity indexed by the pipeline. */
    EntityNames?: string[];
    /** Minimum number of shared concepts before two records are connected. Default 1. */
    MinSharedConcepts?: number;
    /** Per-read row cap, clamped like every provider's. */
    MaxRowsPerStep?: number;
}

const DEFAULT_EDGE_TYPE = 'SharesConceptWith';
const SOURCED_FROM = 'SourcedFrom';

type RecordDocRow = { ID: string; EntityID: string; RecordID: string };
type ItemRow = { ID: string; EntityRecordDocumentID: string };
type ChunkRow = { ID: string; ContentItemID: string };
type SourcedFromRow = { ID: string; SourceRecordID: string; TargetRecordID: string };

/** IDs of the pipeline entities the walk filters on, resolved once per step. */
interface PipelineEntityIDs {
    Concepts: string;
    Chunks: string;
}

/** The pipeline entity IDs from the step's provider, or `null` (no edges) when one is missing. */
function resolveEntityIDs(ctx: GraphProviderContext<SharedConceptEdgeProviderConfig>): PipelineEntityIDs | null {
    const concepts = ctx.Provider.EntityByName('MJ: Graph Concepts');
    const chunks = ctx.Provider.EntityByName('MJ: Content Item Chunks');
    return concepts && chunks ? { Concepts: concepts.ID, Chunks: chunks.ID } : null;
}

/** A frontier record, keyed the way the engine keys nodes. */
interface IndexedRecord {
    Key: string;
    Ref: GraphNodeRef;
}

/**
 * Connects two records the Content Pipeline indexed (documents, entity rows) when the Graph stage
 * synthesized at least one concept from both. The edge is derived on read, never stored, so it
 * follows re-indexing and deletion with no clean-up.
 *
 * Path walked per expansion step, each hop one batched read as `ctx.User`:
 *
 *   record → Entity Record Document → Content Item → Chunks
 *          → SourcedFrom (concept → chunk) → concepts → their other chunks
 *          → Content Items → Entity Record Documents → other records
 *
 * Every read runs under the viewer's permissions and row-level security, and the engine then
 * filters both endpoints through the node access policies, so the edge exists only between
 * records the viewer can see. A read that fails or hits its cap ends the walk with what was found
 * (logged), never with a guess.
 */
@RegisterClass(BaseGraphEdgeProvider, 'SharedConceptEdgeProvider')
export class SharedConceptEdgeProvider extends BaseGraphEdgeProvider<SharedConceptEdgeProviderConfig> {
    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<SharedConceptEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config ?? {};
        const edgeType = config.EdgeType?.trim() || DEFAULT_EDGE_TYPE;
        if (request.Nodes.length === 0 || !MatchesEdgeTypeFilter(edgeType, request.EdgeTypes)) {
            return [];
        }
        const ids = resolveEntityIDs(ctx);
        if (!ids) {
            return [];
        }
        const reader = new StepReader(ctx, ResolveMaxRowsPerStep(config.MaxRowsPerStep), this);
        const frontier = this.frontierRecords(request.Nodes, ctx, config.EntityNames);
        if (frontier.length === 0) {
            return [];
        }
        const conceptsByFrontierKey = await this.conceptsOfRecords(frontier, reader, ids);
        const allConcepts = new UUIDSet(Array.from(conceptsByFrontierKey.values()).flatMap((s) => Array.from(s)));
        if (allConcepts.Size === 0) {
            return [];
        }
        const recordsByConcept = await this.recordsOfConcepts(allConcepts, reader, ids);
        return this.buildEdges(frontier, conceptsByFrontierKey, recordsByConcept, edgeType, config, ctx);
    }

    /** Logs a capped read on behalf of the step reader (`LogTruncation` is protected). */
    public ReportTruncation(entityName: string, maxRows: number, graphName: string): void {
        this.LogTruncation('SharedConceptEdgeProvider', entityName, maxRows, graphName);
    }

    /** Frontier nodes whose entity resolves and, when configured, is one of `entityNames`. */
    private frontierRecords(nodes: readonly GraphNodeRef[], ctx: GraphProviderContext<SharedConceptEdgeProviderConfig>, entityNames?: string[]): IndexedRecord[] {
        const allowed = entityNames && entityNames.length > 0 ? new Set(entityNames.map((n) => n.trim().toLowerCase())) : null;
        const records: IndexedRecord[] = [];
        for (const node of nodes) {
            const entity = node.EntityID ? ctx.Provider.EntityByID(node.EntityID) : ctx.Provider.EntityByName(node.EntityName);
            if (!entity || (allowed && !allowed.has(entity.Name.toLowerCase())) || !node.RecordID.trim()) {
                continue;
            }
            const ref: GraphNodeRef = { EntityName: entity.Name, EntityID: entity.ID, RecordID: node.RecordID.trim() };
            records.push({ Key: FormatGraphNodeKey(entity.ID, ref.RecordID), Ref: ref });
        }
        return records;
    }

    /** Concept IDs synthesized from each frontier record's chunks, keyed by the record's node key. */
    private async conceptsOfRecords(frontier: IndexedRecord[], reader: StepReader, ids: PipelineEntityIDs): Promise<Map<string, UUIDSet>> {
        const result = new Map<string, UUIDSet>();
        const docs = await reader.Read<RecordDocRow>('MJ: Entity Record Documents', ['ID', 'EntityID', 'RecordID'], recordDocFilter(frontier.map((f) => f.Ref)));
        const chunks = await this.chunksOfDocs(docs.map((d) => d.ID), reader);
        const sourced = chunks.Rows.length === 0
            ? []
            : await reader.Read<SourcedFromRow>('MJ: Graph Edges', ['ID', 'SourceRecordID', 'TargetRecordID'],
                  `[EdgeType] = '${SOURCED_FROM}' AND [SourceEntityID] = '${EscapeSQLString(ids.Concepts)}' AND [TargetEntityID] = '${EscapeSQLString(ids.Chunks)}' AND ${inFilter('TargetRecordID', chunks.Rows.map((c) => c.ID))}`);
        const docKeyByID = new UUIDMap<string>(docs.map((d) => [d.ID, FormatGraphNodeKey(d.EntityID, d.RecordID)]));
        for (const edge of sourced) {
            const docID = chunks.DocByChunk.Get(edge.TargetRecordID);
            const key = docID ? docKeyByID.Get(docID) : undefined;
            if (!key) {
                continue;
            }
            const set = result.get(key) ?? new UUIDSet();
            set.Add(edge.SourceRecordID);
            result.set(key, set);
        }
        return result;
    }

    /** Every record each concept was synthesized from. */
    private async recordsOfConcepts(concepts: UUIDSet, reader: StepReader, ids: PipelineEntityIDs): Promise<UUIDMap<GraphNodeRef[]>> {
        const sourced = await reader.Read<SourcedFromRow>('MJ: Graph Edges', ['ID', 'SourceRecordID', 'TargetRecordID'],
            `[EdgeType] = '${SOURCED_FROM}' AND [SourceEntityID] = '${EscapeSQLString(ids.Concepts)}' AND [TargetEntityID] = '${EscapeSQLString(ids.Chunks)}' AND ${inFilter('SourceRecordID', Array.from(concepts))}`);
        const chunks = await reader.Read<ChunkRow>('MJ: Content Item Chunks', ['ID', 'ContentItemID'], inFilter('ID', sourced.map((e) => e.TargetRecordID)));
        const items = await reader.Read<ItemRow>('MJ: Content Items', ['ID', 'EntityRecordDocumentID'],
            `${inFilter('ID', chunks.map((c) => c.ContentItemID))} AND [EntityRecordDocumentID] IS NOT NULL AND [DeleteStatus] IS NULL`);
        const docs = await reader.Read<RecordDocRow>('MJ: Entity Record Documents', ['ID', 'EntityID', 'RecordID'], inFilter('ID', items.map((i) => i.EntityRecordDocumentID)));
        const itemByChunk = new UUIDMap<string>(chunks.map((c) => [c.ID, c.ContentItemID]));
        const docByItem = new UUIDMap<string>(items.map((i) => [i.ID, i.EntityRecordDocumentID]));
        const recordByDoc = new UUIDMap<RecordDocRow>(docs.map((d) => [d.ID, d]));
        const byConcept = new UUIDMap<GraphNodeRef[]>();
        for (const edge of sourced) {
            const itemID = itemByChunk.Get(edge.TargetRecordID);
            const docID = itemID ? docByItem.Get(itemID) : undefined;
            const doc = docID ? recordByDoc.Get(docID) : undefined;
            if (!doc) {
                continue;
            }
            const list = byConcept.Get(edge.SourceRecordID) ?? [];
            list.push({ EntityName: '', EntityID: doc.EntityID, RecordID: doc.RecordID });
            byConcept.Set(edge.SourceRecordID, list);
        }
        return byConcept;
    }

    /** Chunks of the content items linked to these record documents, with each chunk's document. */
    private async chunksOfDocs(docIDs: string[], reader: StepReader): Promise<{ Rows: ChunkRow[]; DocByChunk: UUIDMap<string> }> {
        const items = await reader.Read<ItemRow>('MJ: Content Items', ['ID', 'EntityRecordDocumentID'], `${inFilter('EntityRecordDocumentID', docIDs)} AND [DeleteStatus] IS NULL`);
        const rows = await reader.Read<ChunkRow>('MJ: Content Item Chunks', ['ID', 'ContentItemID'], inFilter('ContentItemID', items.map((i) => i.ID)));
        const docByItem = new UUIDMap<string>(items.map((i) => [i.ID, i.EntityRecordDocumentID]));
        const docByChunk = new UUIDMap<string>();
        for (const chunk of rows) {
            const docID = docByItem.Get(chunk.ContentItemID);
            if (docID) {
                docByChunk.Set(chunk.ID, docID);
            }
        }
        return { Rows: rows, DocByChunk: docByChunk };
    }

    private buildEdges(
        frontier: IndexedRecord[],
        conceptsByFrontierKey: Map<string, UUIDSet>,
        recordsByConcept: UUIDMap<GraphNodeRef[]>,
        edgeType: string,
        config: SharedConceptEdgeProviderConfig,
        ctx: GraphProviderContext<SharedConceptEdgeProviderConfig>,
    ): GraphEdgeView[] {
        const minShared = Math.max(1, Math.floor(config.MinSharedConcepts ?? 1));
        const allowed = config.EntityNames && config.EntityNames.length > 0 ? new Set(config.EntityNames.map((n) => n.trim().toLowerCase())) : null;
        const edges = new Map<string, GraphEdgeView>();
        for (const record of frontier) {
            const shared = sharedConceptsByNeighbor(record, conceptsByFrontierKey.get(record.Key), recordsByConcept);
            for (const [neighborKey, entry] of shared) {
                const entity = entry.Ref.EntityID ? ctx.Provider.EntityByID(entry.Ref.EntityID) : undefined;
                if (!entity || entry.Concepts.length < minShared || (allowed && !allowed.has(entity.Name.toLowerCase()))) {
                    continue;
                }
                const neighbor: GraphNodeRef = { EntityName: entity.Name, EntityID: entity.ID, RecordID: entry.Ref.RecordID };
                const [a, b] = record.Key < neighborKey ? [record.Key, neighborKey] : [neighborKey, record.Key];
                const id = `derived:SharedConceptEdgeProvider:${edgeType}:${a}:${b}`;
                if (!edges.has(id)) {
                    edges.set(id, sharedEdge(id, record.Ref, neighbor, edgeType, entry.Concepts, ctx.Graph.Name));
                }
            }
        }
        return Array.from(edges.values());
    }
}

/** For one frontier record, every other record sharing a concept with it and the concepts shared. */
function sharedConceptsByNeighbor(
    record: IndexedRecord,
    concepts: UUIDSet | undefined,
    recordsByConcept: UUIDMap<GraphNodeRef[]>,
): Map<string, { Ref: GraphNodeRef; Concepts: string[] }> {
    const neighbors = new Map<string, { Ref: GraphNodeRef; Concepts: string[] }>();
    for (const conceptID of concepts ?? []) {
        for (const other of recordsByConcept.Get(conceptID) ?? []) {
            const otherKey = FormatGraphNodeKey(other.EntityID ?? '', other.RecordID);
            if (otherKey === record.Key) {
                continue;
            }
            const entry = neighbors.get(otherKey) ?? { Ref: other, Concepts: [] };
            if (!entry.Concepts.includes(NormalizeUUID(conceptID))) {
                entry.Concepts.push(NormalizeUUID(conceptID));
            }
            neighbors.set(otherKey, entry);
        }
    }
    return neighbors;
}

function sharedEdge(id: string, source: GraphNodeRef, target: GraphNodeRef, edgeType: string, concepts: string[], graphName: string): GraphEdgeView {
    return {
        ID: id,
        GraphName: graphName,
        TypeName: edgeType,
        Source: source,
        Target: target,
        IsDirected: false,
        // One shared concept is a weak signal; each further one strengthens it, up to 1.
        Weight: Math.min(1, 0.45 + 0.15 * concepts.length),
        Description: `Shares ${concepts.length} concept${concepts.length === 1 ? '' : 's'}`,
        Attributes: { SharedConceptIDs: [...concepts].sort() },
        Origin: 'Derived',
        Status: 'Approved',
        Confidence: null,
        InverseTypeName: edgeType,
    };
}

/** `([EntityID] = 'e' AND [RecordID] IN (...)) OR ...`, one group per entity. */
function recordDocFilter(refs: readonly GraphNodeRef[]): string {
    const byEntity = GroupByUUID(refs.filter((r) => !!r.EntityID), (r) => r.EntityID ?? '');
    const groups: string[] = [];
    for (const [entityID, list] of byEntity) {
        groups.push(`([EntityID] = '${EscapeSQLString(entityID)}' AND ${inFilter('RecordID', list.map((r) => r.RecordID))})`);
    }
    return groups.length === 0 ? '1 = 0' : `(${groups.join(' OR ')})`;
}

/** `[field] IN ('a', ...)` over escaped, deduplicated values; matches nothing when empty. */
function inFilter(field: string, values: readonly string[]): string {
    const unique = Array.from(new Set(values.filter((v) => !!v))).sort();
    return unique.length === 0 ? '1 = 0' : `[${field}] IN (${unique.map((v) => `'${EscapeSQLString(v)}'`).join(', ')})`;
}

/**
 * Bounded reads for one expansion step, all as the viewer. A failed read logs and yields nothing,
 * so the walk stops short instead of inventing an edge; a read at the cap logs truncation.
 */
class StepReader {
    constructor(
        private readonly ctx: GraphProviderContext<SharedConceptEdgeProviderConfig>,
        private readonly maxRows: number,
        private readonly owner: SharedConceptEdgeProvider,
    ) {}

    public async Read<T>(entityName: string, fields: string[], filter: string): Promise<T[]> {
        // Every filter here is an AND of clauses (or one OR group per entity, never empty), so an
        // empty IN list anywhere means nothing can match: skip the round trip.
        if (/\b1 = 0\b/.test(filter)) {
            return [];
        }
        const rv = RunView.FromMetadataProvider(this.ctx.Provider);
        const result: RunViewResult<T> = await rv.RunView<T>(
            { EntityName: entityName, Fields: fields, ExtraFilter: filter, OrderBy: '[ID]', MaxRows: this.maxRows, ResultType: 'simple' },
            this.ctx.User,
        );
        if (!result.Success) {
            LogError(`SharedConceptEdgeProvider: reading ${entityName} failed in graph "${this.ctx.Graph.Name}": ${result.ErrorMessage}`);
            return [];
        }
        const rows = result.Results ?? [];
        if (rows.length >= this.maxRows) {
            this.owner.ReportTruncation(entityName, this.maxRows, this.ctx.Graph.Name);
        }
        return rows;
    }
}

/** Tree-shaking anchor for {@link SharedConceptEdgeProvider}. */
export function LoadSharedConceptEdgeProvider(): void {
    // Importing this module registers the provider.
}
