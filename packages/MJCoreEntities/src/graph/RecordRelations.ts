/**
 * @fileoverview What a record (typically a document) is connected to in the semantic graph, as one
 * viewer may see it: the records it links to, the records that link to it, and the records related to
 * it through shared concepts. Pure data over {@link GraphEngine}; no UI, no navigation. The Docs
 * "Related" panel renders it and agent tools can return it.
 *
 * Which graphs are consulted is metadata: every active graph with an active edge provider that projects
 * `LinksTo` or `SharesConceptWith` edges. Every edge and label comes through the engine's per-viewer
 * checks, so a related record the viewer cannot read never appears, and neither does the edge to it.
 *
 * @module @memberjunction/core-entities
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDSet } from '@memberjunction/global';
import type { GraphEdgeView, GraphNodeRef, GraphNodeView } from './BaseGraphEdgeProvider';
import type { GraphEngine } from './GraphEngine';

/** Edge type for a `[[Name]]` link from one document to another record. */
export const GRAPH_LINKS_TO_EDGE_TYPE = 'LinksTo';
/** Edge type relating two records that were sources of the same synthesized concept. */
export const GRAPH_SHARES_CONCEPT_EDGE_TYPE = 'SharesConceptWith';

/** Edge provider driver classes that can project the relation edge types. */
const RELATION_PROVIDER_CLASSES = new Set(['recordlinkedgeprovider', 'sharedconceptedgeprovider']);

/** One related record, with the label the viewer may see. */
export interface RelatedRecord {
    Node: GraphNodeView;
    /** Graph the relation came from. */
    GraphName: string;
    /** For a concept relation, how many concepts the two records share; otherwise 0. */
    SharedConceptCount: number;
}

/** A record's relations, each list de-duplicated across graphs. */
export interface RecordRelations {
    /** Records this record links to. */
    Links: RelatedRecord[];
    /** Records that link to this record. */
    Backlinks: RelatedRecord[];
    /** Records related through shared concepts, strongest first. */
    Related: RelatedRecord[];
}

/** Options for {@link LoadRecordRelations}. */
export interface RecordRelationsOptions {
    /** Limit to these graphs (names); default every graph that projects relation edges. */
    GraphNames?: string[];
    /** Provider for every read made for the viewer; default the engine's. */
    Provider?: IMetadataProvider;
}

/**
 * Load `record`'s links, backlinks and concept relations for `user`. `engine` must be configured
 * (`await GraphEngine.Instance.Config(...)`). Never throws for a graph with no relations; returns
 * empty lists when no graph projects relation edges.
 */
export async function LoadRecordRelations(
    engine: GraphEngine,
    record: GraphNodeRef,
    user: UserInfo,
    options: RecordRelationsOptions = {},
): Promise<RecordRelations> {
    const graphNames = options.GraphNames ?? RelationGraphNames(engine);
    const selfKey = engine.GetNodeKey(record);
    const edgeLists = await Promise.all(
        graphNames.map((name) =>
            engine.GetEdges(name, record, { Direction: 'Both', EdgeTypes: [GRAPH_LINKS_TO_EDGE_TYPE, GRAPH_SHARES_CONCEPT_EDGE_TYPE] }, user, options.Provider),
        ),
    );
    const edges = edgeLists.flat();
    const neighbors = edges.map((e) => otherEnd(engine, e, selfKey)).filter((n): n is GraphNodeRef => n !== null);
    const labels = neighbors.length > 0 ? await engine.FilterNodesForUser(neighbors, user, undefined, { Provider: options.Provider }) : new Map<string, GraphNodeView>();
    return classify(engine, edges, selfKey, labels);
}

/** Names of the active graphs that have an active provider able to project relation edges. */
export function RelationGraphNames(engine: GraphEngine): string[] {
    const graphIDs = new UUIDSet(
        engine.EdgeProviders.filter((p) => p.IsActive && RELATION_PROVIDER_CLASSES.has((p.DriverClass ?? '').trim().toLowerCase())).map((p) => p.GraphID),
    );
    return engine.Graphs.filter((g) => g.Status === 'Active' && graphIDs.Has(g.ID)).map((g) => g.Name);
}

function otherEnd(engine: GraphEngine, edge: GraphEdgeView, selfKey: string): GraphNodeRef | null {
    if (engine.GetNodeKey(edge.Source) === selfKey) {
        return edge.Target;
    }
    if (engine.GetNodeKey(edge.Target) === selfKey) {
        return edge.Source;
    }
    return null;
}

function classify(engine: GraphEngine, edges: GraphEdgeView[], selfKey: string, labels: Map<string, GraphNodeView>): RecordRelations {
    const links = new Map<string, RelatedRecord>();
    const backlinks = new Map<string, RelatedRecord>();
    const related = new Map<string, RelatedRecord>();
    for (const edge of edges) {
        const outgoing = engine.GetNodeKey(edge.Source) === selfKey;
        const other = outgoing ? edge.Target : edge.Source;
        const node = labels.get(engine.GetNodeKey(other));
        if (!node) {
            continue; // the viewer may not see it
        }
        if (edge.TypeName === GRAPH_SHARES_CONCEPT_EDGE_TYPE) {
            keepStrongest(related, node.Key, { Node: node, GraphName: edge.GraphName, SharedConceptCount: sharedConceptCount(edge) });
        } else if (edge.TypeName === GRAPH_LINKS_TO_EDGE_TYPE) {
            const target = outgoing ? links : backlinks;
            if (!target.has(node.Key)) {
                target.set(node.Key, { Node: node, GraphName: edge.GraphName, SharedConceptCount: 0 });
            }
        }
    }
    return {
        Links: byLabel(links),
        Backlinks: byLabel(backlinks),
        Related: Array.from(related.values()).sort((a, b) => b.SharedConceptCount - a.SharedConceptCount || a.Node.Label.localeCompare(b.Node.Label)),
    };
}

function keepStrongest(map: Map<string, RelatedRecord>, key: string, candidate: RelatedRecord): void {
    const existing = map.get(key);
    if (!existing || candidate.SharedConceptCount > existing.SharedConceptCount) {
        map.set(key, candidate);
    }
}

function sharedConceptCount(edge: GraphEdgeView): number {
    const ids = edge.Attributes?.['SharedConceptIDs'];
    return Array.isArray(ids) ? ids.length : 1;
}

function byLabel(map: Map<string, RelatedRecord>): RelatedRecord[] {
    return Array.from(map.values()).sort((a, b) => a.Node.Label.localeCompare(b.Node.Label));
}
