import { NormalizeUUID } from "@memberjunction/global";

/** A query to order, by ID, with a name for reporting. */
export interface OrderableQuery {
    readonly ID: string;
    readonly Name: string;
}

/** A composition edge: `QueryID` composes `DependsOnQueryID`. */
export interface CompositionEdge {
    readonly QueryID: string;
    readonly DependsOnQueryID: string;
}

/** The order to refresh in, and the composition cycles found. */
export interface RefreshOrder {
    readonly Order: readonly OrderableQuery[];
    /** Each cycle's members, by name. */
    readonly Cycles: readonly (readonly string[])[];
}

/**
 * Orders `queries` so each comes after every selected query it composes (dependencies first),
 * keeping the given order among queries that do not depend on each other. Queries in a
 * composition cycle (stored by an older version that allowed one), and those that depend on
 * them, come last in their given order; each is listed once, so a cycle is never followed round.
 * Edges to queries outside the selection are ignored.
 */
export function OrderForRefresh(queries: readonly OrderableQuery[], edges: readonly CompositionEdge[]): RefreshOrder {
    const ids = queries.map(q => NormalizeUUID(q.ID));
    const selected = new Set(ids);
    const dependsOn = new Map<string, Set<string>>(ids.map(id => [id, new Set<string>()]));
    for (const edge of edges) {
        const from = NormalizeUUID(edge.QueryID);
        const to = NormalizeUUID(edge.DependsOnQueryID);
        if (selected.has(from) && selected.has(to) && from !== to) dependsOn.get(from)?.add(to);
        if (from === to && selected.has(from)) dependsOn.get(from)?.add(to);
    }
    const ordered = topologicalOrder(ids, dependsOn);
    const placed = new Set(ordered);
    const rest = ids.filter(id => !placed.has(id));
    const byID = new Map(queries.map(q => [NormalizeUUID(q.ID), q]));
    const nameOf = (id: string) => byID.get(id)?.Name ?? id;
    return {
        Order: [...ordered, ...rest].map(id => byID.get(id)).filter((q): q is OrderableQuery => q !== undefined),
        Cycles: findCycles(rest, dependsOn).map(cycle => cycle.map(nameOf)),
    };
}

/** Kahn's algorithm, stable in the given order; nodes on or behind a cycle are left out. */
function topologicalOrder(ids: readonly string[], dependsOn: ReadonlyMap<string, ReadonlySet<string>>): string[] {
    const done = new Set<string>();
    const ordered: string[] = [];
    let progressed = true;
    while (progressed) {
        progressed = false;
        for (const id of ids) {
            if (done.has(id)) continue;
            const deps = dependsOn.get(id) ?? new Set<string>();
            if ([...deps].every(d => done.has(d))) {
                done.add(id);
                ordered.push(id);
                progressed = true;
            }
        }
    }
    return ordered;
}

/** The strongly connected components among `ids` that are cycles (more than one member, or a self-reference). */
function findCycles(ids: readonly string[], dependsOn: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
    const within = new Set(ids);
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const cycles: string[][] = [];
    let counter = 0;
    const visit = (id: string): void => {
        index.set(id, counter);
        low.set(id, counter++);
        stack.push(id);
        onStack.add(id);
        for (const dep of dependsOn.get(id) ?? []) {
            if (!within.has(dep)) continue;
            if (!index.has(dep)) {
                visit(dep);
                low.set(id, Math.min(low.get(id) ?? 0, low.get(dep) ?? 0));
            } else if (onStack.has(dep)) {
                low.set(id, Math.min(low.get(id) ?? 0, index.get(dep) ?? 0));
            }
        }
        if (low.get(id) !== index.get(id)) return;
        const component: string[] = [];
        let member: string | undefined;
        do {
            member = stack.pop();
            if (member === undefined) break;
            onStack.delete(member);
            component.push(member);
        } while (member !== id);
        if (component.length > 1 || dependsOn.get(id)?.has(id)) cycles.push(component.reverse());
    };
    for (const id of ids) if (!index.has(id)) visit(id);
    return cycles;
}
