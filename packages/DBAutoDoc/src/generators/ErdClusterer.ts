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
 *
 * Tables are keyed `schema.table` with case preserved: same-named tables in different schemas are
 * different tables, and so are `Customer` and `customer` on PostgreSQL.
 */

import { DatabaseDocumentation, TableDefinition } from '../types/state.js';
import { ERD_DEFAULTS } from '../types/config.js';

/** Mirrors the `output.erd` keys of config.json (camelCase) so a config object can be passed straight through. */
export interface ErdClustererOptions {
  hubMinInbound?: number;
  lookupMaxRows?: number;
  pageSize?: number;
  minClusterSize?: number;
  hubs?: string[];
  excludeTables?: string[];
  lookupTables?: string[];
}

/** One foreign key edge: `From.FromColumn` references `To.ToColumn`. Keys are `schema.table`. */
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
  /** File name (without extension) every renderer uses for this page, unique across the plan. */
  BaseName: string;
  /** Page title, e.g. `Customer (2 of 5)`. */
  Title: string;
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

export type ErdClustererSettings = Required<Pick<ErdClustererOptions, 'hubMinInbound' | 'lookupMaxRows' | 'pageSize' | 'minClusterSize'>>;

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
  Options: ErdClustererSettings;
  /** Display name for a table key: the bare table name, or `schema.table` when another schema has a table of that name. */
  NameOf(key: string): string;
  /** The table definition for a key. */
  TableOf(key: string): TableDefinition;
}

/** The fold pass converges in one or two rounds; this caps a pathological ping-pong between two tiny areas. */
const MAX_FOLD_PASSES = 5;

/** Everything the steps of `Plan` share. */
interface Graph {
  tables: Map<string, TableDefinition>;
  schemaOf: Map<string, string>;
  edges: Map<string, ErdEdge>;
  inbound: Map<string, number>;
  outbound: Map<string, number>;
  /** Undirected adjacency over non-reference tables. */
  adjacency: Map<string, Set<string>>;
  /** Inbound FK count from non-reference tables, the hub ranking key. */
  hubScore: Map<string, number>;
  references: Set<string>;
  /** Tables named by `hubs`, resolved once. */
  forcedHubs: Set<string>;
  /** Display names of the tables removed by `excludeTables`. */
  excludedNames: string[];
  warnings: string[];
  nameOf(key: string): string;
}

export class ErdClusterer {
  public Plan(state: DatabaseDocumentation, options: ErdClustererOptions = {}): ErdClusterPlan {
    const settings = this.resolveSettings(options);
    const graph = this.buildGraph(state, options, settings);
    const forcedHubs = graph.forcedHubs;

    const connected = [...graph.tables.keys()].filter(k => !graph.references.has(k) && this.neighbours(graph, k).size > 0);
    const isolated = [...graph.tables.keys()].filter(k => !graph.references.has(k) && this.neighbours(graph, k).size === 0);

    const hubs = this.selectHubs(graph, connected, forcedHubs, settings);
    let owner = this.assignToNearestHub(graph, hubs);
    owner = this.foldUndersizedClusters(graph, owner, forcedHubs, settings);

    const members = new Map<string, string[]>();
    for (const [table, hub] of owner) {
      if (!members.has(hub)) members.set(hub, []);
      members.get(hub)!.push(table);
    }
    const clusters = [...members].map(([hub, list]) => this.buildCluster(graph, owner, hub, list, settings));
    clusters.sort((a, b) => b.Tables.length - a.Tables.length || a.HubName.localeCompare(b.HubName));
    this.assignPageFileNames(clusters);

    return {
      Clusters: clusters,
      Warnings: graph.warnings,
      ReferenceTables: [...graph.references]
        .map(k => ({ Table: graph.nameOf(k), ReferencedBy: graph.inbound.get(k) ?? 0 }))
        .sort((a, b) => b.ReferencedBy - a.ReferencedBy || a.Table.localeCompare(b.Table)),
      IsolatedTables: isolated.map(graph.nameOf).sort(),
      UnassignedTables: connected.filter(k => !owner.has(k)).map(graph.nameOf).sort(),
      ExcludedTables: [...graph.excludedNames].sort(),
      TotalTables: graph.tables.size,
      TotalEdges: graph.edges.size,
      Options: settings,
      NameOf: graph.nameOf,
      TableOf: (key: string) => graph.tables.get(key)!,
    };
  }

  /** Defaults fill the gaps; every count must be at least 1 or the pagination and hub selection degenerate. */
  private resolveSettings(options: ErdClustererOptions): ErdClustererSettings {
    const atLeastOne = (name: keyof ErdClustererSettings, value: number | undefined): number => {
      const resolved = value ?? ERD_DEFAULTS[name];
      if (!Number.isInteger(resolved) || resolved < 1) {
        throw new Error(`ERD setting ${name} must be a whole number of at least 1 (got ${String(value)})`);
      }
      return resolved;
    };
    return {
      hubMinInbound: atLeastOne('hubMinInbound', options.hubMinInbound),
      lookupMaxRows: atLeastOne('lookupMaxRows', options.lookupMaxRows),
      pageSize: atLeastOne('pageSize', options.pageSize),
      minClusterSize: atLeastOne('minClusterSize', options.minClusterSize),
    };
  }

  /** Index the tables, resolve exclusions and reference tables, and collect the FK graph. */
  private buildGraph(state: DatabaseDocumentation, options: ErdClustererOptions, settings: ErdClustererSettings): Graph {
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

    const graph: Graph = {
      tables, schemaOf, nameOf, warnings: [], excludedNames: [], forcedHubs: new Set(),
      edges: new Map(), inbound: new Map(), outbound: new Map(), adjacency: new Map(), hubScore: new Map(), references: new Set(),
    };

    const excluded = this.resolveNamed(graph, options.excludeTables, 'excludeTables');
    for (const key of excluded) {
      graph.excludedNames.push(nameOf(key));
      tables.delete(key);
    }

    this.collectEdges(graph);

    graph.forcedHubs = this.resolveNamed(graph, options.hubs, 'hubs');
    const forcedLookups = this.resolveNamed(graph, options.lookupTables, 'lookupTables');
    for (const key of tables.keys()) {
      if (this.isReferenceTable(graph, key, graph.forcedHubs, forcedLookups, settings)) graph.references.add(key);
    }

    for (const edge of graph.edges.values()) {
      if (graph.references.has(edge.From) || graph.references.has(edge.To)) continue;
      this.link(graph, edge.From, edge.To);
      this.link(graph, edge.To, edge.From);
      graph.hubScore.set(edge.To, (graph.hubScore.get(edge.To) ?? 0) + 1);
    }
    return graph;
  }

  /** Distinct FK edges between known tables (a table may reference another through several columns). */
  private collectEdges(graph: Graph): void {
    for (const [from, table] of graph.tables) {
      for (const dep of table.dependsOn ?? []) {
        const to = this.resolveTarget(graph, dep.schema ?? graph.schemaOf.get(from)!, dep.table ?? '');
        if (!to || to === from) continue;
        const id = `${from}->${to}`;
        if (graph.edges.has(id)) continue;
        graph.edges.set(id, { From: from, To: to, FromColumn: dep.column, ToColumn: dep.referencedColumn });
        graph.outbound.set(from, (graph.outbound.get(from) ?? 0) + 1);
        graph.inbound.set(to, (graph.inbound.get(to) ?? 0) + 1);
      }
    }
  }

  /**
   * Resolve an FK target to a key. `dep.table` is usually the bare name within `dep.schema`, which also
   * covers a table name that contains a dot (`Customer.bak`); the LLM sometimes writes `schema.table`
   * instead, which the second lookup accepts.
   */
  private resolveTarget(graph: Graph, schema: string, name: string): string | undefined {
    const inSchema = `${schema}.${name}`;
    if (graph.tables.has(inSchema)) return inSchema;
    if (graph.tables.has(name)) return name;
    return undefined;
  }

  /** A configured table name may be given as `schema.table` or as a bare name (any schema, case-insensitive). */
  private resolveNamed(graph: Graph, names: string[] | undefined, setting: string): Set<string> {
    const keys = new Set<string>();
    for (const name of names ?? []) {
      const wanted = name.toLowerCase();
      const matches = graph.tables.has(name)
        ? [name]
        : [...graph.tables.keys()].filter(k => k.toLowerCase() === wanted || graph.tables.get(k)!.name.toLowerCase() === wanted);
      if (matches.length === 0) graph.warnings.push(`${setting}: no table named '${name}'`);
      for (const k of matches) keys.add(k);
    }
    return keys;
  }

  private isReferenceTable(graph: Graph, key: string, forcedHubs: Set<string>, forcedLookups: Set<string>, settings: ErdClustererSettings): boolean {
    if (forcedHubs.has(key)) return false;
    if (forcedLookups.has(key)) return true;
    return (graph.outbound.get(key) ?? 0) === 0
      && (graph.inbound.get(key) ?? 0) >= 1
      && (graph.tables.get(key)!.rowCount ?? 0) < settings.lookupMaxRows;
  }

  private link(graph: Graph, a: string, b: string): void {
    if (!graph.adjacency.has(a)) graph.adjacency.set(a, new Set());
    graph.adjacency.get(a)!.add(b);
  }

  private neighbours(graph: Graph, key: string): Set<string> {
    return graph.adjacency.get(key) ?? new Set();
  }

  private selectHubs(graph: Graph, connected: string[], forcedHubs: Set<string>, settings: ErdClustererSettings): string[] {
    for (const hub of forcedHubs) {
      if (!connected.includes(hub)) {
        graph.warnings.push(`hubs: '${graph.nameOf(hub)}' has no foreign-key relationships to other drawn tables and cannot anchor a subject area`);
      }
    }
    const score = (key: string) => graph.hubScore.get(key) ?? 0;
    return connected
      .filter(k => forcedHubs.has(k) || score(k) >= settings.hubMinInbound)
      .sort((a, b) => score(b) - score(a));
  }

  /** Multi-source breadth-first search: every reachable table belongs to the hub nearest to it. */
  private assignToNearestHub(graph: Graph, hubs: string[]): Map<string, string> {
    const owner = new Map<string, string>();
    const queue: string[] = [];
    for (const hub of hubs) {
      owner.set(hub, hub);
      queue.push(hub);
    }
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      for (const next of this.neighbours(graph, current)) {
        if (!owner.has(next)) {
          owner.set(next, owner.get(current)!);
          queue.push(next);
        }
      }
    }
    return owner;
  }

  /** Fold each cluster below the minimum size into the neighbouring cluster its members link to most. */
  private foldUndersizedClusters(graph: Graph, owner: Map<string, string>, forcedHubs: Set<string>, settings: ErdClustererSettings): Map<string, string> {
    for (let pass = 0; pass < MAX_FOLD_PASSES; pass++) {
      const sizes = new Map<string, number>();
      for (const hub of owner.values()) sizes.set(hub, (sizes.get(hub) ?? 0) + 1);
      const tiny = new Set([...sizes].filter(([hub, n]) => n < settings.minClusterSize && !forcedHubs.has(hub)).map(([hub]) => hub));
      if (tiny.size === 0) break;
      for (const hub of tiny) {
        const votes = new Map<string, number>();
        for (const [table, o] of owner) {
          if (o !== hub) continue;
          for (const n of this.neighbours(graph, table)) {
            const target = owner.get(n);
            if (target && target !== hub && !tiny.has(target)) votes.set(target, (votes.get(target) ?? 0) + 1);
          }
        }
        const best = [...votes].sort((a, b) => b[1] - a[1])[0];
        if (!best) continue;
        for (const [table, o] of owner) if (o === hub) owner.set(table, best[0]);
      }
    }
    return owner;
  }

  private buildCluster(graph: Graph, owner: Map<string, string>, hub: string, list: string[], settings: ErdClustererSettings): ErdCluster {
    const score = (key: string) => graph.hubScore.get(key) ?? 0;
    const rest = list.filter(k => k !== hub).sort((a, b) => (score(b) - score(a)) || a.localeCompare(b));
    const ordered = [hub, ...rest];
    const inside = new Set(ordered);

    const pages: ErdClusterPage[] = [];
    for (let i = 0, n = 1; i < Math.max(1, rest.length); i += settings.pageSize, n++) {
      pages.push({ Number: n, Tables: [hub, ...rest.slice(i, i + settings.pageSize)], BaseName: '', Title: '' });
    }

    const internal: ErdEdge[] = [], outboundEdges: ErdEdge[] = [], inboundEdges: ErdEdge[] = [];
    const referenceUse = new Map<string, number>();
    for (const e of graph.edges.values()) {
      if (inside.has(e.From) && inside.has(e.To)) internal.push(e);
      else if (inside.has(e.From) && graph.references.has(e.To)) referenceUse.set(e.To, (referenceUse.get(e.To) ?? 0) + 1);
      else if (inside.has(e.From) && owner.has(e.To)) outboundEdges.push(e);
      else if (inside.has(e.To) && owner.has(e.From)) inboundEdges.push(e);
    }
    return {
      Hub: hub,
      HubName: graph.nameOf(hub),
      Tables: ordered,
      Pages: pages,
      InternalEdges: internal,
      OutboundEdges: outboundEdges,
      InboundEdges: inboundEdges,
      ReferenceTables: [...referenceUse]
        .map(([t, n]) => ({ Table: graph.nameOf(t), UsedBy: n }))
        .sort((a, b) => b.UsedBy - a.UsedBy || a.Table.localeCompare(b.Table)),
    };
  }

  /**
   * File names are decided once here so every renderer links to the same page. Two hubs whose names
   * sanitise to the same identifier (`Order-Item`, `Order_Item`) get a numeric suffix instead of
   * overwriting each other.
   */
  private assignPageFileNames(clusters: ErdCluster[]): void {
    const taken = new Map<string, number>();
    for (const cluster of clusters) {
      const base = `cluster-${cluster.HubName.replace(/[^A-Za-z0-9_]/g, '_')}`;
      const seen = taken.get(base) ?? 0;
      taken.set(base, seen + 1);
      const unique = seen === 0 ? base : `${base}~${seen + 1}`;
      const multi = cluster.Pages.length > 1;
      for (const page of cluster.Pages) {
        page.BaseName = multi ? `${unique}-${page.Number}` : unique;
        page.Title = multi ? `${cluster.HubName} (${page.Number} of ${cluster.Pages.length})` : cluster.HubName;
      }
    }
  }
}
