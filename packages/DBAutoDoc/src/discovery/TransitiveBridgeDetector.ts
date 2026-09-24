/**
 * TransitiveBridgeDetector — Pattern 3 orchestrator.
 *
 * Reads the existing Pattern 1/2 organic-key clusters (the "hubs") + the FK
 * relationships of the database (hard + soft) and finds tables that can reach
 * each hub via 2-3 FK hops without carrying the key directly. For each such
 * spoke, it generates the CREATE VIEW SQL the bridge needs, packaged in PR
 * #2193's `TransitiveView` config block.
 *
 * Outputs `TransitiveBridgeFinding[]` — one per (hub, spoke, path) triple. The
 * caller (OrganicKeyDetector) merges these into the OrganicKeyTranslator's
 * spokes list so that PR #2193's CodeGen can pick them up.
 *
 * Notes:
 *   - Direct-FK paths (length 1) are SKIPPED — those tables are already
 *     reachable via the existing relationship system; no bridge needed.
 *   - When multiple paths exist from the same spoke to the same hub, only the
 *     SHORTEST one is kept (paths of length 2 beat paths of length 3); ties
 *     broken by highest confidence.
 *   - Spoke PK is resolved from state.json. Tables without a single-column PK
 *     are skipped (composite-PK bridge join is future work).
 */

import { FindBridgePaths, FKEdge } from './FKGraphWalker.js';
import { GenerateBridgeView, GeneratedBridgeView, BridgeViewProvider } from './BridgeViewSQLGenerator.js';
import { OrganicKeyCluster, MemberColumns } from '../types/organic-keys.js';
import { DatabaseDocumentation, ForeignKeyReference } from '../types/state.js';

/** One transitive bridge finding ready for spoke emission. */
export interface TransitiveBridgeFinding {
    HubSchema: string;
    HubTable: string;
    HubKeyFields: string[];          // = MatchFieldNames on the hub's organic key
    SpokeSchema: string;
    SpokeTable: string;
    SpokeJoinField: string;          // = RelatedEntityJoinFieldName (spoke PK)
    View: GeneratedBridgeView;       // CREATE VIEW SQL + projected aliases
    PathLength: number;
    PathConfidence: number;
    /** Concept name from the underlying organic key (e.g. "email_address"). Used for the spoke's DisplayName. */
    HubConcept: string;
}

export interface TransitiveBridgeDetectorOptions {
    MaxHops?: number;
    MinSoftFKConfidence?: number;
    /** Drop bridges whose path confidence falls below this. Default 0.7. */
    MinPathConfidence?: number;
    /** Limit bridges per (hub, spoke) pair — keeps only the best path. Default true. */
    KeepShortestOnly?: boolean;
    /** Platform the generated bridge-view SQL is written for. Default `'sqlserver'`. */
    provider?: BridgeViewProvider;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

const DEFAULTS: Required<TransitiveBridgeDetectorOptions> = {
    MaxHops: 3,
    MinSoftFKConfidence: 0.6,
    MinPathConfidence: 0.7,
    KeepShortestOnly: true,
    provider: 'sqlserver',
};

/**
 * Detect transitive bridges for every hub × spoke pair whose graph distance
 * falls in [2, maxHops].
 *
 * @param organicKeyClusters - Pattern 1 + 2 output. Hubs are derived as the
 *                             unique (schema, table) of every cluster member.
 * @param edges              - FK edges (hard + soft) to walk.
 * @param state              - DatabaseDocumentation, used to look up spoke PKs.
 */
export function DetectTransitiveBridges(
    organicKeyClusters: OrganicKeyCluster[],
    edges: FKEdge[],
    state: DatabaseDocumentation,
    opts: TransitiveBridgeDetectorOptions = {},
): TransitiveBridgeFinding[] {
    // `?? DEFAULTS.provider`: runStructuralPhase passes `{ provider }` with an optional provider,
    // and a spread of an explicit `undefined` would overwrite the default.
    const o = { ...DEFAULTS, ...opts, provider: opts.provider ?? DEFAULTS.provider };

    // ─── 1. Build the hub set from existing organic-key clusters ────────────
    // Each hub is a (schema, table) carrying one or more organic-key match field(s).
    // We emit one hub entry per (schema, table, primary match field) because
    // PR #2193's MatchFieldNames is a tuple; we use the FIRST field of the
    // tuple as the projected bridge column (the rest are positional siblings
    // emitted via TransitiveMatchFieldNames).
    interface HubEntry {
        schema: string;
        table: string;
        keyFields: string[];          // Full MatchFieldNames tuple
        concept: string;
    }
    const hubsByKey = new Map<string, HubEntry>();
    for (const cluster of organicKeyClusters) {
        for (const member of cluster.members) {
            const cols = MemberColumns(member);
            const k = `${member.schema}.${member.table}.${cols.join(',')}`;
            if (hubsByKey.has(k)) continue;
            hubsByKey.set(k, {
                schema: member.schema,
                table: member.table,
                keyFields: cols,
                concept: cluster.concept,
            });
        }
    }

    // ─── 2. Build the spoke candidate set (every table in the DB) ──────────
    const allTables: Array<{ schema: string; table: string }> = [];
    const spokePKByKey = new Map<string, string>();
    for (const s of state.schemas) {
        for (const t of s.tables) {
            allTables.push({ schema: s.name, table: t.name });
            const pk = pickSinglePK(t.columns);
            if (pk) spokePKByKey.set(`${s.name}.${t.name}`, pk);
        }
    }

    // ─── 3. Run BFS per hub × spoke pair ────────────────────────────────────
    const hubsForWalker: Array<{ schema: string; table: string; keyField: string }> = [];
    for (const h of hubsByKey.values()) {
        hubsForWalker.push({ schema: h.schema, table: h.table, keyField: h.keyFields[0] });
    }
    const allPaths = FindBridgePaths(edges, hubsForWalker, allTables, {
        MaxHops: o.MaxHops,
        MinSoftFKConfidence: o.MinSoftFKConfidence,
        PruneCycles: true,
    });

    // ─── 4. For each path, materialize the bridge view ─────────────────────
    const findings: TransitiveBridgeFinding[] = [];
    for (const path of allPaths) {
        if (path.PathConfidence < o.MinPathConfidence) continue;
        const spokeKey = `${path.SpokeSchema}.${path.SpokeTable}`;
        const spokePK = spokePKByKey.get(spokeKey);
        if (!spokePK) continue; // skip composite-PK spokes for now

        // Resolve the originating hub entry to recover the full keyFields tuple + concept.
        const hubMatch = Array.from(hubsByKey.values()).find(
            (h) => h.schema === path.HubSchema && h.table === path.HubTable && h.keyFields[0] === path.HubKeyField,
        );
        if (!hubMatch) continue;

        const view = GenerateBridgeView(path, spokePK, { provider: o.provider });
        findings.push({
            HubSchema: hubMatch.schema,
            HubTable: hubMatch.table,
            HubKeyFields: hubMatch.keyFields,
            SpokeSchema: path.SpokeSchema,
            SpokeTable: path.SpokeTable,
            SpokeJoinField: spokePK,
            View: view,
            PathLength: path.PathLength,
            PathConfidence: path.PathConfidence,
            HubConcept: hubMatch.concept,
        });
    }

    // ─── 5. Dedupe per (hub, spoke) — keep shortest, then highest-confidence ─
    if (o.KeepShortestOnly) {
        const byPair = new Map<string, TransitiveBridgeFinding>();
        for (const f of findings) {
            const k = `${f.HubSchema}.${f.HubTable}::${f.SpokeSchema}.${f.SpokeTable}::${f.HubKeyFields[0]}`;
            const existing = byPair.get(k);
            if (!existing) {
                byPair.set(k, f);
                continue;
            }
            if (f.PathLength < existing.PathLength) byPair.set(k, f);
            else if (f.PathLength === existing.PathLength && f.PathConfidence > existing.PathConfidence) {
                byPair.set(k, f);
            }
        }
        return Array.from(byPair.values());
    }
    return findings;
}

/** @deprecated Use {@link DetectTransitiveBridges}. */
export function detectTransitiveBridges(
    organicKeyClusters: OrganicKeyCluster[],
    edges: FKEdge[],
    state: DatabaseDocumentation,
    opts: TransitiveBridgeDetectorOptions = {},
): TransitiveBridgeFinding[] {
    return DetectTransitiveBridges(organicKeyClusters, edges, state, opts);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick the single-column PK from a table's column list. Returns null when no PK
 * is declared OR when the table has a composite PK (we skip those for now —
 * compound-PK bridge joins are Pattern 4 territory).
 */
function pickSinglePK(columns: Array<{ name: string; isPrimaryKey?: boolean }>): string | null {
    const pks = columns.filter((c) => c.isPrimaryKey);
    if (pks.length !== 1) return null;
    return pks[0].name;
}

/**
 * Pull FK edges out of state.json's keyDetection.discovered.foreignKeys block
 * AND from any schema-declared hard FKs in the dependencies array. Returns the
 * combined set ready for the walker.
 */
export function CollectFKEdgesFromState(state: DatabaseDocumentation): FKEdge[] {
    const out: FKEdge[] = [];

    // Hard FKs from the FK-SOURCE side via `dependsOn`. Each entry on table
    // T's `dependsOn` array describes an FK that T holds pointing at another
    // table.
    //
    // We deliberately use `dependsOn` rather than the reverse `dependents`
    // array because in observed state.json files `dependents` sometimes contains
    // inverted/duplicate entries (e.g. on Campaign.dependents you may see both
    // `column: ID, referencedColumn: CampaignID` AND
    // `column: CampaignID, referencedColumn: ID` — only one is real). The
    // `dependsOn` side is canonical: it's authored from the table that actually
    // owns the FK column.
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            const deps: ForeignKeyReference[] = table.dependsOn ?? [];
            for (const d of deps) {
                out.push({
                    SourceSchema: schema.name,
                    SourceTable: table.name,
                    SourceColumn: d.column,
                    TargetSchema: d.schema,
                    TargetTable: d.table,
                    TargetColumn: d.referencedColumn,
                    Kind: 'hard',
                    confidence: 1,
                });
            }
        }
    }

    // Dedup hard FKs (a single FK can sometimes appear twice in state.json).
    const dedupHard = dedupEdges(out.splice(0));
    out.push(...dedupHard);

    // Soft FKs from the keyDetection phase.
    const softFKs =
        (state as unknown as { phases?: { keyDetection?: { discovered?: { foreignKeys?: Array<Record<string, unknown>> } } } })
            .phases?.keyDetection?.discovered?.foreignKeys ?? [];
    for (const f of softFKs) {
        if (
            typeof f.schemaName === 'string' &&
            typeof f.sourceTable === 'string' &&
            typeof f.sourceColumn === 'string' &&
            typeof f.targetSchema === 'string' &&
            typeof f.targetTable === 'string' &&
            typeof f.targetColumn === 'string' &&
            typeof f.confidence === 'number'
        ) {
            out.push({
                SourceSchema: f.schemaName,
                SourceTable: f.sourceTable,
                SourceColumn: f.sourceColumn,
                TargetSchema: f.targetSchema,
                TargetTable: f.targetTable,
                TargetColumn: f.targetColumn,
                Kind: 'soft',
                confidence: f.confidence / 100, // state stores 0-100
            });
        }
    }
    // Final dedup — if a soft FK redundantly describes a hard FK, keep one.
    // We keep the HARD one (confidence=1) when both exist.
    const deduped = dedupEdges(out);

    // Guard: drop any edge whose source OR target column doesn't actually exist
    // in the schema. Soft-FK detection can name a target column by heuristic that
    // isn't real (e.g. `Subscriber.Email` when the real column is `EmailAddress`);
    // building a bridge view on such an edge yields uncreatable SQL ("Invalid
    // column name"). Keeping only edges whose endpoints exist guarantees every
    // generated bridge view compiles.
    const validColumns = new Set<string>();
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            for (const col of table.columns) {
                validColumns.add(`${schema.name}.${table.name}.${col.name}`.toLowerCase());
            }
        }
    }
    const exists = (s: string, t: string, c: string): boolean =>
        validColumns.has(`${s}.${t}.${c}`.toLowerCase());
    return deduped.filter(
        (e) => exists(e.SourceSchema, e.SourceTable, e.SourceColumn) && exists(e.TargetSchema, e.TargetTable, e.TargetColumn),
    );
}

/** @deprecated Use {@link CollectFKEdgesFromState}. */
export function collectFKEdgesFromState(state: DatabaseDocumentation): FKEdge[] {
    return CollectFKEdgesFromState(state);
}

/**
 * Dedupe FK edges by (source, target) column pair. When duplicates exist,
 * prefer the entry with kind='hard' (highest confidence); for two soft
 * entries with the same pair, keep the higher-confidence one.
 */
function dedupEdges(edges: FKEdge[]): FKEdge[] {
    const byKey = new Map<string, FKEdge>();
    for (const e of edges) {
        const k = `${e.SourceSchema}.${e.SourceTable}.${e.SourceColumn}->${e.TargetSchema}.${e.TargetTable}.${e.TargetColumn}`;
        const existing = byKey.get(k);
        if (!existing) {
            byKey.set(k, e);
            continue;
        }
        if (existing.Kind === 'hard') continue;
        if (e.Kind === 'hard') { byKey.set(k, e); continue; }
        if (e.confidence > existing.confidence) byKey.set(k, e);
    }
    return Array.from(byKey.values());
}
