import type { EntityInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';

/**
 * Deterministic domain discovery for the semantic graph (`plans/canon-semantic-graph.md`, Phase G5).
 *
 * Entities that reference each other through foreign keys and IS-A links more than they reference
 * the rest of the schema usually belong to one business domain ("Sales", "AI agents", "Billing").
 * This module finds those groups with Louvain community detection over the entity metadata graph,
 * so a curator gets reviewable `Domain` concept proposals with no AI call and the same answer on
 * every run. Naming and approval stay with a person: proposals are written as `Proposed`.
 *
 * Everything here is pure: it reads only the `EntityInfo` objects it is given.
 */

/** An undirected weighted edge between two node IDs. */
export interface DomainGraphEdge {
    A: string;
    B: string;
    Weight: number;
}

/** Options for {@link BuildEntityDomainGraph}. */
export interface EntityDomainGraphOptions {
    /** Only entities in these schemas take part (case-insensitive). All schemas when omitted. */
    SchemaNames?: readonly string[];
    /**
     * An entity referenced by foreign keys from more than this many other in-scope entities is an
     * infrastructure hub (users, entities, applications) that links everything and says nothing
     * about domains, so its links are left out. Default: the larger of 8 and 5% of the scope.
     */
    HubThreshold?: number;
    /** Weight of one foreign-key link. Default 0.6, the `References` edge type's default weight. */
    ForeignKeyWeight?: number;
    /** Weight of one IS-A link. Default 1.0, the `Is A` edge type's default weight. */
    IsAWeight?: number;
}

/** The weighted entity graph {@link BuildEntityDomainGraph} produces. */
export interface EntityDomainGraph {
    /** In-scope entity IDs (normalized), sorted. */
    NodeIDs: string[];
    /** One edge per linked pair, weights summed, sorted. */
    Edges: DomainGraphEdge[];
    /** Entity IDs left out as infrastructure hubs, sorted. */
    HubIDs: string[];
}

/** Options for {@link ProposeEntityDomains}. */
export interface ProposeEntityDomainsOptions extends EntityDomainGraphOptions {
    /** Smallest group worth proposing. Default 3. */
    MinClusterSize?: number;
    /** Most domains proposed, largest first. Default 25. */
    MaxDomains?: number;
    /** Louvain resolution; above 1 gives more, smaller domains. Default 1. */
    Resolution?: number;
}

/** One entity in a proposed domain. */
export interface DomainProposalMember {
    EntityID: string;
    EntityName: string;
    /** Share of the entity's link weight that stays inside the domain, in `[0, 1]`. */
    Confidence: number;
}

/** A proposed `Domain` concept and the entities that would `Describe` it. */
export interface DomainProposal {
    Name: string;
    Description: string;
    /** Members, most connected inside the domain first. */
    Members: DomainProposalMember[];
    /** Internal link weight over all link weight touching the members, in `[0, 1]`. */
    Cohesion: number;
}

const DEFAULT_FOREIGN_KEY_WEIGHT = 0.6;
const DEFAULT_IS_A_WEIGHT = 1.0;
const DEFAULT_MIN_CLUSTER_SIZE = 3;
const DEFAULT_MAX_DOMAINS = 25;
const MIN_HUB_THRESHOLD = 8;
const HUB_SCOPE_SHARE = 0.05;
/** Louvain passes per level and levels overall; both converge long before these on real schemas. */
const MAX_LOUVAIN_PASSES = 100;
const MAX_LOUVAIN_LEVELS = 20;
const GAIN_EPSILON = 1e-12;
const NAMED_MEMBERS_IN_DESCRIPTION = 6;

/**
 * The entity link graph used for domain discovery: one node per in-scope entity, one weighted
 * undirected edge per pair of entities joined by foreign keys or an IS-A link, with infrastructure
 * hubs (see {@link EntityDomainGraphOptions.HubThreshold}) removed.
 */
export function BuildEntityDomainGraph(entities: readonly EntityInfo[], options: EntityDomainGraphOptions = {}): EntityDomainGraph {
    const scope = scopeEntities(entities, options.SchemaNames);
    const inScope = new Set(scope.map((e) => NormalizeUUID(e.ID)));
    const links = collectLinks(scope, inScope, options);
    const hubs = findHubs(links.ReferencedBy, options.HubThreshold ?? Math.max(MIN_HUB_THRESHOLD, Math.ceil(scope.length * HUB_SCOPE_SHARE)));
    const edges: DomainGraphEdge[] = [];
    for (const [pairKey, weight] of links.Weights) {
        const [a, b] = pairKey.split('|');
        if (!hubs.has(a) && !hubs.has(b)) {
            edges.push({ A: a, B: b, Weight: weight });
        }
    }
    edges.sort((x, y) => compareText(x.A, y.A) || compareText(x.B, y.B));
    return {
        NodeIDs: Array.from(inScope).filter((id) => !hubs.has(id)).sort(compareText),
        Edges: edges,
        HubIDs: Array.from(hubs).sort(compareText),
    };
}

/**
 * Proposed `Domain` concepts for `entities`: Louvain communities of {@link BuildEntityDomainGraph}
 * with at least `MinClusterSize` members, largest first, each named after its most connected member.
 * Deterministic: the same metadata always gives the same proposals in the same order.
 */
export function ProposeEntityDomains(entities: readonly EntityInfo[], options: ProposeEntityDomainsOptions = {}): DomainProposal[] {
    const graph = BuildEntityDomainGraph(entities, options);
    const communities = DetectCommunities(graph.NodeIDs, graph.Edges, options.Resolution ?? 1);
    const byId = new Map(entities.map((e) => [NormalizeUUID(e.ID), e]));
    const groups = groupByCommunity(communities);
    const minSize = Math.max(2, options.MinClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE);
    const proposals: DomainProposal[] = [];
    for (const memberIds of groups) {
        if (memberIds.length >= minSize) {
            proposals.push(buildProposal(memberIds, graph.Edges, byId));
        }
    }
    proposals.sort((a, b) => b.Members.length - a.Members.length || b.Cohesion - a.Cohesion || compareText(a.Name, b.Name));
    return proposals.slice(0, Math.max(0, options.MaxDomains ?? DEFAULT_MAX_DOMAINS));
}

/**
 * Louvain community detection (Blondel et al., 2008) over an undirected weighted graph. Nodes are
 * visited in sorted order and ties go to the lowest community, so the result is deterministic.
 * Returns the community index of every node; isolated nodes get a community of their own.
 */
export function DetectCommunities(nodeIds: readonly string[], edges: readonly DomainGraphEdge[], resolution = 1): Map<string, number> {
    const ids = Array.from(new Set(nodeIds)).sort(compareText);
    const index = new Map(ids.map((id, i) => [id, i]));
    let level = levelFromEdges(ids.length, edges, index);
    let membership = ids.map((_, i) => i);
    for (let pass = 0; pass < MAX_LOUVAIN_LEVELS; pass++) {
        const communities = optimizeLevel(level, resolution);
        const count = Math.max(-1, ...communities) + 1;
        if (count === level.Size) {
            break; // no node moved: this level is final
        }
        membership = membership.map((c) => communities[c]);
        level = aggregateLevel(level, communities, count);
    }
    return new Map(ids.map((id, i) => [id, membership[i]]));
}

// ----- Entity graph helpers ----------------------------------------------------

function scopeEntities(entities: readonly EntityInfo[], schemaNames: readonly string[] | undefined): EntityInfo[] {
    if (!schemaNames || schemaNames.length === 0) {
        return [...entities];
    }
    const wanted = new Set(schemaNames.map((s) => s.trim().toLowerCase()));
    return entities.filter((e) => wanted.has((e.SchemaName ?? '').trim().toLowerCase()));
}

interface CollectedLinks {
    /** Summed weight per `a|b` pair (a < b). */
    Weights: Map<string, number>;
    /** Distinct in-scope entities referencing each target through a foreign key. */
    ReferencedBy: Map<string, Set<string>>;
}

function collectLinks(scope: readonly EntityInfo[], inScope: ReadonlySet<string>, options: EntityDomainGraphOptions): CollectedLinks {
    const fkWeight = options.ForeignKeyWeight ?? DEFAULT_FOREIGN_KEY_WEIGHT;
    const isAWeight = options.IsAWeight ?? DEFAULT_IS_A_WEIGHT;
    const weights = new Map<string, number>();
    const referencedBy = new Map<string, Set<string>>();
    const add = (a: string, b: string, w: number): void => {
        if (a === b || !inScope.has(b)) {
            return;
        }
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        weights.set(key, (weights.get(key) ?? 0) + w);
    };
    for (const entity of scope) {
        const id = NormalizeUUID(entity.ID);
        for (const field of entity.Fields ?? []) {
            if (!field.RelatedEntityID) {
                continue;
            }
            const target = NormalizeUUID(field.RelatedEntityID);
            add(id, target, fkWeight);
            if (target !== id && inScope.has(target)) {
                const refs = referencedBy.get(target) ?? new Set<string>();
                refs.add(id);
                referencedBy.set(target, refs);
            }
        }
        if (entity.ParentID) {
            add(id, NormalizeUUID(entity.ParentID), isAWeight);
        }
    }
    return { Weights: weights, ReferencedBy: referencedBy };
}

function findHubs(referencedBy: ReadonlyMap<string, ReadonlySet<string>>, threshold: number): Set<string> {
    const hubs = new Set<string>();
    for (const [target, refs] of referencedBy) {
        if (refs.size > threshold) {
            hubs.add(target);
        }
    }
    return hubs;
}

function groupByCommunity(communities: ReadonlyMap<string, number>): string[][] {
    const groups = new Map<number, string[]>();
    for (const [id, c] of communities) {
        const list = groups.get(c) ?? [];
        list.push(id);
        groups.set(c, list);
    }
    return Array.from(groups.values()).map((g) => g.sort(compareText));
}

function buildProposal(memberIds: readonly string[], edges: readonly DomainGraphEdge[], byId: ReadonlyMap<string, EntityInfo>): DomainProposal {
    const members = new Set(memberIds);
    const internal = new Map<string, number>();
    const total = new Map<string, number>();
    let internalWeight = 0;
    let cutWeight = 0;
    for (const e of edges) {
        const aIn = members.has(e.A);
        const bIn = members.has(e.B);
        if (!aIn && !bIn) {
            continue;
        }
        for (const [node, isIn] of [[e.A, aIn], [e.B, bIn]] as const) {
            if (isIn) {
                total.set(node, (total.get(node) ?? 0) + e.Weight);
                if (aIn && bIn) {
                    internal.set(node, (internal.get(node) ?? 0) + e.Weight);
                }
            }
        }
        if (aIn && bIn) {
            internalWeight += e.Weight;
        } else {
            cutWeight += e.Weight;
        }
    }
    const rows: DomainProposalMember[] = memberIds.map((id) => ({
        EntityID: byId.get(id)?.ID ?? id,
        EntityName: byId.get(id)?.Name ?? id,
        Confidence: roundTo4((internal.get(id) ?? 0) / Math.max(total.get(id) ?? 0, GAIN_EPSILON)),
    }));
    rows.sort((a, b) => (internal.get(NormalizeUUID(b.EntityID)) ?? 0) - (internal.get(NormalizeUUID(a.EntityID)) ?? 0) || compareText(a.EntityName, b.EntityName));
    const cohesion = roundTo4(internalWeight / Math.max(internalWeight + cutWeight, GAIN_EPSILON));
    return { Name: `${DisplayEntityLabel(rows[0].EntityName)} domain`, Description: describeProposal(rows, cohesion), Members: rows, Cohesion: cohesion };
}

function describeProposal(members: readonly DomainProposalMember[], cohesion: number): string {
    const named = members.slice(0, NAMED_MEMBERS_IN_DESCRIPTION).map((m) => DisplayEntityLabel(m.EntityName));
    const more = members.length > named.length ? ` and ${members.length - named.length} more` : '';
    return (
        `Proposed by community detection over foreign-key and IS-A links: ${members.length} entities that link to each other ` +
        `more than to the rest of the schema (${named.join(', ')}${more}). ${Math.round(cohesion * 100)}% of their link weight stays inside the group. ` +
        `Rename, edit and approve this concept, or reject it.`
    );
}

/** An entity name without its schema prefix: `"MJ: AI Agents"` → `"AI Agents"`. */
export function DisplayEntityLabel(entityName: string): string {
    const colon = entityName.indexOf(': ');
    return colon >= 0 ? entityName.slice(colon + 2).trim() : entityName.trim();
}

// ----- Louvain ---------------------------------------------------------------------

/** One level of the Louvain hierarchy: symmetric adjacency plus self-loop weight per node. */
interface LouvainLevel {
    Size: number;
    Adjacency: Array<Map<number, number>>;
    SelfLoops: number[];
}

function levelFromEdges(size: number, edges: readonly DomainGraphEdge[], index: ReadonlyMap<string, number>): LouvainLevel {
    const level: LouvainLevel = { Size: size, Adjacency: Array.from({ length: size }, () => new Map<number, number>()), SelfLoops: new Array<number>(size).fill(0) };
    for (const e of edges) {
        const a = index.get(e.A);
        const b = index.get(e.B);
        if (a === undefined || b === undefined || e.Weight <= 0) {
            continue;
        }
        if (a === b) {
            level.SelfLoops[a] += e.Weight;
        } else {
            level.Adjacency[a].set(b, (level.Adjacency[a].get(b) ?? 0) + e.Weight);
            level.Adjacency[b].set(a, (level.Adjacency[b].get(a) ?? 0) + e.Weight);
        }
    }
    return level;
}

/** Local moving phase. Returns each node's community, renumbered 0.. in order of first appearance. */
function optimizeLevel(level: LouvainLevel, resolution: number): number[] {
    const degree = level.Adjacency.map((adj, i) => sumValues(adj) + 2 * level.SelfLoops[i]);
    const twoM = degree.reduce((s, d) => s + d, 0);
    const community = degree.map((_, i) => i);
    if (twoM <= 0) {
        return community;
    }
    const totals = [...degree];
    for (let pass = 0; pass < MAX_LOUVAIN_PASSES; pass++) {
        let moved = false;
        for (let i = 0; i < level.Size; i++) {
            const best = bestCommunityFor(i, level, community, totals, degree[i], twoM, resolution);
            if (best !== community[i]) {
                totals[community[i]] -= degree[i];
                totals[best] += degree[i];
                community[i] = best;
                moved = true;
            }
        }
        if (!moved) {
            break;
        }
    }
    return renumber(community);
}

function bestCommunityFor(
    node: number,
    level: LouvainLevel,
    community: readonly number[],
    totals: readonly number[],
    nodeDegree: number,
    twoM: number,
    resolution: number,
): number {
    const own = community[node];
    const linkWeight = new Map<number, number>([[own, 0]]);
    for (const [neighbor, w] of level.Adjacency[node]) {
        const c = community[neighbor];
        linkWeight.set(c, (linkWeight.get(c) ?? 0) + w);
    }
    // Gain of joining c, with the node itself taken out of its own community first.
    const gain = (c: number): number => (linkWeight.get(c) ?? 0) - (resolution * (totals[c] - (c === own ? nodeDegree : 0)) * nodeDegree) / twoM;
    let best = own;
    let bestGain = gain(own);
    for (const c of Array.from(linkWeight.keys()).sort((a, b) => a - b)) {
        const g = gain(c);
        if (g > bestGain + GAIN_EPSILON) {
            best = c;
            bestGain = g;
        }
    }
    return best;
}

/** Collapse each community into one node of the next level. */
function aggregateLevel(level: LouvainLevel, communities: readonly number[], count: number): LouvainLevel {
    const next: LouvainLevel = { Size: count, Adjacency: Array.from({ length: count }, () => new Map<number, number>()), SelfLoops: new Array<number>(count).fill(0) };
    for (let i = 0; i < level.Size; i++) {
        const ci = communities[i];
        next.SelfLoops[ci] += level.SelfLoops[i];
        for (const [j, w] of level.Adjacency[i]) {
            const cj = communities[j];
            if (ci === cj) {
                if (i < j) {
                    next.SelfLoops[ci] += w; // each internal edge once
                }
            } else {
                next.Adjacency[ci].set(cj, (next.Adjacency[ci].get(cj) ?? 0) + w);
            }
        }
    }
    return next;
}

function renumber(community: readonly number[]): number[] {
    const map = new Map<number, number>();
    return community.map((c) => {
        let renumbered = map.get(c);
        if (renumbered === undefined) {
            renumbered = map.size;
            map.set(c, renumbered);
        }
        return renumbered;
    });
}

function sumValues(map: ReadonlyMap<number, number>): number {
    let total = 0;
    for (const v of map.values()) {
        total += v;
    }
    return total;
}

function roundTo4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
