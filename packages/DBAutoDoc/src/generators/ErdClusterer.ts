/**
 * Splits a database's foreign-key graph into hub-centred clusters ("subject areas") small enough
 * to draw one at a time. Pure computation over the analysis state; rendering lives in
 * ErdClusterGenerator.
 *
 * Method:
 *  1. Reference (lookup) tables — tables that reference nothing and hold few rows — are set aside.
 *     Left in, a table such as a yes/no flag referenced by sixty others links every subject area to
 *     every other and the clusters collapse into one.
 *  2. Hubs are the tables referenced by at least `hubMinInbound` non-reference tables, plus any
 *     names in `hubs`.
 *  3. Every other connected table is assigned to its nearest hub (multi-source breadth-first search
 *     over the undirected FK graph).
 *  4. A hub whose cluster is smaller than `minClusterSize` is folded into the neighbouring cluster
 *     its members link to most, so the index is not littered with two-table "areas".
 *  5. A cluster larger than `pageSize` is paginated; the hub appears on every page.
 */

import { DatabaseDocumentation, TableDefinition } from '../types/state.js';

export interface ErdClustererOptions {
  hubMinInbound?: number;
  lookupMaxRows?: number;
  pageSize?: number;
  minClusterSize?: number;
  hubs?: string[];
  excludeTables?: string[];
  lookupTables?: string[];
}

/** One foreign key edge: `From.FromColumn` references `To.ToColumn`. Keys are `schema.table`, case preserved. */
export interface ErdEdge {
  From: string;
  To: string;
  FromColumn: string;
  ToColumn: string;
}

export interface ErdClusterPage {
  /** 1-based page number within the cluster. */
  Number: number;
  /** `schema.table` keys on this page; the hub is always first. */
  Tables: string[];
}

export interface ErdCluster {
  /** `schema.table` key of the hub table. */
  Hub: string;
  /** Display name of the hub table. */
  HubName: string;
  /** `schema.table` keys of every table in the cluster, hub first. */
  Tables: string[];
  Pages: ErdClusterPage[];
  /** FK edges with both ends inside the cluster. */
  InternalEdges: ErdEdge[];
  /** FK edges leaving the cluster (From inside, To in another cluster). */
  OutboundEdges: ErdEdge[];
  /** FK edges entering the cluster (To inside, From in another cluster). */
  InboundEdges: ErdEdge[];
  /** Reference tables used by members of this cluster, with how many members use each. */
  ReferenceTables: Array<{ Table: string; UsedBy: number }>;
}

export interface ErdClusterPlan {
  Clusters: ErdCluster[];
  /** Settings that named tables the plan could not use (an unknown or edge-less hub, an unknown exclusion). */
  Warnings: string[];
  /** Reference tables set aside before clustering, with how many tables reference each. */
  ReferenceTables: Array<{ Table: string; ReferencedBy: number }>;
  /** Tables with no foreign keys in either direction. */
  IsolatedTables: string[];
  /** Connected tables that reached no hub (small chains with no hub of their own). */
  UnassignedTables: string[];
  /** Tables removed by `excludeTables`. */
  ExcludedTables: string[];
  TotalTables: number;
  TotalEdges: number;
  Options: Required<Pick<ErdClustererOptions, 'hubMinInbound' | 'lookupMaxRows' | 'pageSize' | 'minClusterSize'>>;
  /** Display name for a table key: the bare table name, or `schema.table` when another schema has a table of that name. */
  NameOf(key: string): string;
  /** The table definition for a key. */
  TableOf(key: string): TableDefinition;
}

const DEFAULTS = { hubMinInbound: 8, lookupMaxRows: 5000, pageSize: 50, minClusterSize: 4 };

export class ErdClusterer {
  public Plan(state: DatabaseDocumentation, options: ErdClustererOptions = {}): ErdClusterPlan {
    const opts = {
      hubMinInbound: options.hubMinInbound ?? DEFAULTS.hubMinInbound,
      lookupMaxRows: options.lookupMaxRows ?? DEFAULTS.lookupMaxRows,
      pageSize: options.pageSize ?? DEFAULTS.pageSize,
      minClusterSize: options.minClusterSize ?? DEFAULTS.minClusterSize,
    };
    const warnings: string[] = [];

    // Tables are keyed `schema.table` with case preserved: same-named tables in different schemas
    // are different tables, and so are `Customer` and `customer` on PostgreSQL.
    const tables = new Map<string, TableDefinition>();
    const schemaOf = new Map<string, string>();
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        tables.set(`${schema.name}.${table.name}`, table);
        schemaOf.set(`${schema.name}.${table.name}`, schema.name);
      }
    }
    // A table is shown with its schema only when another schema has a table of the same name.
    const nameCounts = new Map<string, number>();
    for (const t of tables.values()) nameCounts.set(t.name, (nameCounts.get(t.name) ?? 0) + 1);
    const nameOf = (key: string): string => {
      const table = tables.get(key);
      if (!table) return key;
      return (nameCounts.get(table.name) ?? 0) > 1 ? `${schemaOf.get(key)}.${table.name}` : table.name;
    };

    // A configured table name may be given as `schema.table` or as a bare name (any schema, case-insensitive).
    const resolveNamed = (names: string[] | undefined, setting: string): Set<string> => {
      const keys = new Set<string>();
      for (const name of names ?? []) {
        const exact = tables.has(name) ? [name] : [];
        const matches = exact.length > 0 ? exact
          : [...tables.keys()].filter(k => k.toLowerCase() === name.toLowerCase() || tables.get(k)!.name.toLowerCase() === name.toLowerCase());
        if (matches.length === 0) warnings.push(`${setting}: no table named '${name}'`);
        for (const k of matches) keys.add(k);
      }
      return keys;
    };
    const excluded = resolveNamed(options.excludeTables, 'excludeTables');
    const excludedNames = [...excluded].map(nameOf).sort();
    for (const k of excluded) tables.delete(k);
    const forcedHubs = resolveNamed(options.hubs, 'hubs');
    const forcedLookups = resolveNamed(options.lookupTables, 'lookupTables');

    // Resolve an FK target to a key. `dep.table` is usually the bare name in `dep.schema`; the LLM
    // sometimes writes `schema.table`, and a table name may itself contain a dot (`Customer.bak`).
    const resolveTarget = (schema: string, name: string): string | undefined => {
      const direct = `${schema}.${name}`;
      if (tables.has(direct)) return direct;
      if (tables.has(name)) return name;
      const dot = name.indexOf('.');
      if (dot > 0) {
        const qualified = `${name.slice(0, dot)}.${name.slice(dot + 1)}`;
        if (tables.has(qualified)) return qualified;
      }
      return undefined;
    };

    // Distinct FK edges between known tables (a table may reference another through several columns).
    const edges = new Map<string, ErdEdge>();
    for (const [from, table] of tables) {
      for (const dep of table.dependsOn ?? []) {
        const to = resolveTarget(dep.schema ?? schemaOf.get(from)!, dep.table ?? '');
        if (!to || to === from) continue;
        const id = `${from}->${to}`;
        if (!edges.has(id)) {
          edges.set(id, { From: from, To: to, FromColumn: dep.column, ToColumn: dep.referencedColumn });
        }
      }
    }
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    for (const e of edges.values()) {
      outbound.set(e.From, (outbound.get(e.From) ?? 0) + 1);
      inbound.set(e.To, (inbound.get(e.To) ?? 0) + 1);
    }

    const isReference = (key: string): boolean => {
      if (forcedHubs.has(key)) return false;
      if (forcedLookups.has(key)) return true;
      return (outbound.get(key) ?? 0) === 0
        && (inbound.get(key) ?? 0) >= 1
        && (tables.get(key)!.rowCount ?? 0) < opts.lookupMaxRows;
    };
    const references = new Set([...tables.keys()].filter(isReference));

    // Undirected adjacency over non-reference tables.
    const adjacency = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a)!.add(b);
    };
    for (const e of edges.values()) {
      if (!references.has(e.From) && !references.has(e.To)) {
        link(e.From, e.To);
        link(e.To, e.From);
      }
    }
    const neighbours = (key: string): Set<string> => adjacency.get(key) ?? new Set();
    const inboundFromNonReference = (key: string): number =>
      [...neighbours(key)].filter(n => edges.has(`${n}->${key}`)).length;

    const connected = [...tables.keys()].filter(k => !references.has(k) && neighbours(k).size > 0);
    const isolated = [...tables.keys()].filter(k => !references.has(k) && neighbours(k).size === 0);

    for (const hub of forcedHubs) {
      if (!connected.includes(hub)) {
        warnings.push(`hubs: '${nameOf(hub)}' has no foreign-key relationships to other drawn tables and cannot anchor a subject area`);
      }
    }

    let hubs = connected
      .filter(k => forcedHubs.has(k) || inboundFromNonReference(k) >= opts.hubMinInbound)
      .sort((a, b) => inboundFromNonReference(b) - inboundFromNonReference(a));

    let owner = this.assignToNearestHub(hubs, neighbours);

    // Fold undersized clusters into the neighbouring cluster their members link to most.
    for (let pass = 0; pass < 5; pass++) {
      const sizes = new Map<string, number>();
      for (const hub of owner.values()) sizes.set(hub, (sizes.get(hub) ?? 0) + 1);
      const tiny = new Set([...sizes].filter(([hub, n]) => n < opts.minClusterSize && !forcedHubs.has(hub)).map(([hub]) => hub));
      if (tiny.size === 0) break;
      for (const hub of tiny) {
        const votes = new Map<string, number>();
        for (const [table, o] of owner) {
          if (o !== hub) continue;
          for (const n of neighbours(table)) {
            const target = owner.get(n);
            if (target && target !== hub && !tiny.has(target)) {
              votes.set(target, (votes.get(target) ?? 0) + 1);
            }
          }
        }
        const best = [...votes].sort((a, b) => b[1] - a[1])[0];
        if (best) {
          for (const [table, o] of owner) if (o === hub) owner.set(table, best[0]);
        }
      }
      hubs = [...new Set(owner.values())];
    }

    const unassigned = connected.filter(k => !owner.has(k));
    const members = new Map<string, string[]>();
    for (const [table, hub] of owner) {
      if (!members.has(hub)) members.set(hub, []);
      members.get(hub)!.push(table);
    }

    const clusters: ErdCluster[] = [];
    for (const [hub, list] of members) {
      const rest = list
        .filter(k => k !== hub)
        .sort((a, b) => (inboundFromNonReference(b) - inboundFromNonReference(a)) || a.localeCompare(b));
      const ordered = [hub, ...rest];
      const inside = new Set(ordered);
      const pages: ErdClusterPage[] = [];
      for (let i = 0, n = 1; i < Math.max(1, rest.length); i += opts.pageSize, n++) {
        pages.push({ Number: n, Tables: [hub, ...rest.slice(i, i + opts.pageSize)] });
      }
      const internal: ErdEdge[] = [], outboundEdges: ErdEdge[] = [], inboundEdges: ErdEdge[] = [];
      const refUse = new Map<string, number>();
      for (const e of edges.values()) {
        if (inside.has(e.From) && inside.has(e.To)) internal.push(e);
        else if (inside.has(e.From) && references.has(e.To)) refUse.set(e.To, (refUse.get(e.To) ?? 0) + 1);
        else if (inside.has(e.From) && owner.has(e.To)) outboundEdges.push(e);
        else if (inside.has(e.To) && owner.has(e.From)) inboundEdges.push(e);
      }
      clusters.push({
        Hub: hub,
        HubName: nameOf(hub),
        Tables: ordered,
        Pages: pages,
        InternalEdges: internal,
        OutboundEdges: outboundEdges,
        InboundEdges: inboundEdges,
        ReferenceTables: [...refUse].map(([t, n]) => ({ Table: nameOf(t), UsedBy: n })).sort((a, b) => b.UsedBy - a.UsedBy || a.Table.localeCompare(b.Table)),
      });
    }
    clusters.sort((a, b) => b.Tables.length - a.Tables.length || a.HubName.localeCompare(b.HubName));

    return {
      Clusters: clusters,
      ReferenceTables: [...references].map(k => ({ Table: nameOf(k), ReferencedBy: inbound.get(k) ?? 0 })).sort((a, b) => b.ReferencedBy - a.ReferencedBy || a.Table.localeCompare(b.Table)),
      IsolatedTables: isolated.map(nameOf).sort(),
      UnassignedTables: unassigned.map(nameOf).sort(),
      ExcludedTables: excludedNames,
      Warnings: warnings,
      TotalTables: tables.size,
      TotalEdges: edges.size,
      Options: opts,
      NameOf: nameOf,
      TableOf: (key: string) => tables.get(key)!,
    };
  }

  /** Multi-source breadth-first search: every reachable table belongs to the hub nearest to it. */
  private assignToNearestHub(hubs: string[], neighbours: (key: string) => Set<string>): Map<string, string> {
    const owner = new Map<string, string>();
    const queue: string[] = [];
    for (const hub of hubs) {
      owner.set(hub, hub);
      queue.push(hub);
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of neighbours(current)) {
        if (!owner.has(next)) {
          owner.set(next, owner.get(current)!);
          queue.push(next);
        }
      }
    }
    return owner;
  }
}
