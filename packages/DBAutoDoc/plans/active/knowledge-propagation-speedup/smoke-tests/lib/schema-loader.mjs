// Load Chinook (or other) state.json, normalize the bits we care about.
// Output: a Map of tableName -> simplified table record, plus a graph derivation.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function existsOr(a, b) { return existsSync(a) ? a : b; }

export function loadSchema(statePath) {
    const path = statePath
        ?? process.env.CHINOOK_STATE
        ?? (existsOr('/app/chinook-state.json', './chinook-state.json'));
    const s = JSON.parse(readFileSync(resolve(path), 'utf8'));
    const tables = new Map();
    for (const sch of s.schemas) {
        for (const t of sch.tables) {
            tables.set(t.name, {
                name: t.name,
                schema: sch.name,
                rowCount: t.rowCount,
                description: t.description || '',
                columns: t.columns.map(c => ({
                    name: c.name,
                    dataType: c.dataType,
                    isNullable: c.isNullable,
                    isPrimaryKey: !!c.isPrimaryKey,
                    isForeignKey: !!c.isForeignKey,
                    fkRef: c.foreignKeyReferences ?? null,
                    distinctCount: (c.statistics ?? {}).distinctCount ?? null,
                    uniquenessRatio: (c.statistics ?? {}).uniquenessRatio ?? null,
                    nullPercentage: (c.statistics ?? {}).nullPercentage ?? null,
                    sampleValues: ((c.statistics ?? {}).sampleValues ?? []).slice(0, 5),
                })),
                dependsOn: (t.dependsOn || []).map(d => ({
                    schema: d.schema, table: d.table, column: d.column, referencedColumn: d.referencedColumn,
                })),
                dependents: (t.dependents || []).map(d => ({
                    schema: d.schema, table: d.table,
                })),
            });
        }
    }
    return tables;
}

/** Build a simple adjacency structure keyed by table name (no schema prefix within Chinook). */
export function buildGraph(tables) {
    const outgoing = new Map();   // table -> [targets] (tables this table FKs into = dependencies)
    const incoming = new Map();   // table -> [sources] (tables that FK into this table = dependents)
    for (const [name, t] of tables) {
        outgoing.set(name, []);
        incoming.set(name, []);
    }
    for (const [name, t] of tables) {
        for (const d of t.dependsOn) {
            if (tables.has(d.table) && d.table !== name) {
                outgoing.get(name).push(d.table);
                incoming.get(d.table).push(name);
            }
        }
    }
    return { outgoing, incoming };
}

/** Transitive-descendant set for a root table (who does it unblock?). */
export function reachableDescendants(graph, start) {
    const visited = new Set();
    const queue = [start];
    while (queue.length) {
        const cur = queue.shift();
        for (const child of (graph.incoming.get(cur) ?? [])) {
            if (!visited.has(child)) {
                visited.add(child);
                queue.push(child);
            }
        }
    }
    return visited;
}

/** VIF proxy: number of outgoing FKs (tables this table depends on). */
export function vif(graph, table) {
    return (graph.outgoing.get(table) ?? []).length;
}

/** DFS depth from the set of roots (tables with no dependencies). */
export function depthFromRoots(graph) {
    const depth = new Map();
    const roots = [];
    for (const [name, outs] of graph.outgoing) {
        if (outs.length === 0) roots.push(name);
    }
    for (const r of roots) depth.set(r, 0);
    let changed = true;
    while (changed) {
        changed = false;
        for (const [name, outs] of graph.outgoing) {
            if (depth.has(name)) continue;
            // depth = 1 + max(depth of deps)
            let allHaveDepth = true;
            let maxDep = -1;
            for (const d of outs) {
                const dd = depth.get(d);
                if (dd === undefined) { allHaveDepth = false; break; }
                maxDep = Math.max(maxDep, dd);
            }
            if (allHaveDepth) {
                depth.set(name, maxDep + 1);
                changed = true;
            }
        }
    }
    return depth;
}
