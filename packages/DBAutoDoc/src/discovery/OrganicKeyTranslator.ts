/**
 * OrganicKeyTranslator — PURE EMISSION.
 *
 * Takes a list of clusters that have ALREADY been gated by the Composer, plus
 * the transitive spokes for those that survived, and fans them out into PR
 * #2193's per-schema/per-table JSON.
 *
 * No filtering, no thresholds, no scoring logic in here. The Composer is the
 * single emission gate; this file is its render-to-JSON helper.
 *
 * Same-concept consolidation: clusters that the LLM normalizer assigned the
 * same canonical concept name (e.g. four separate geometric clusters all
 * named `product_id`) are MERGED here into a single conceptual cluster before
 * fan-out — deterministic equivalent of an LLM concept-merge pass.
 */

import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyNormalizationStrategy,
    memberColumns,
    isCompoundMember,
} from '../types/organic-keys.js';

// ─── PR #2193 output shape ───────────────────────────────────────────────────
// These interfaces are the public contract emitted into additionalSchemaInfo.json and
// consumed by CodeGen's organic-key processing to upsert EntityOrganicKey /
// EntityOrganicKeyRelatedEntity metadata. Field casing matches the PR #2193 schema.

/** A generated SQL bridge view backing a transitive (multi-hop) spoke. */
export interface TransitiveViewConfig {
    Name: string;
    SchemaName?: string;
    SQL: string;
}

/** One related entity (spoke) reachable from an organic key — either a direct field match or a transitive (bridge-view) match. */
export interface OrganicKeyRelatedEntityConfig {
    SchemaName: string;
    TableName: string;
    RelatedFieldNames?: string[];
    TransitiveView?: TransitiveViewConfig;
    TransitiveMatchFieldNames?: string[];
    TransitiveOutputFieldName?: string;
    RelatedEntityJoinFieldName?: string;
    DisplayName?: string;
}

/** A single organic key anchored on one table's column(s), with its own normalization and its spokes. */
export interface OrganicKeyConfig {
    Name: string;
    Description?: string;
    MatchFieldNames: string[];
    NormalizationStrategy: OrganicKeyNormalizationStrategy;
    CustomNormalizationExpression?: string;
    AutoCreateRelatedViewOnForm?: boolean;
    RelatedEntities: OrganicKeyRelatedEntityConfig[];
}

/** All organic keys anchored on a given table. */
export interface TableOrganicKeyConfig {
    TableName: string;
    OrganicKeys: OrganicKeyConfig[];
}

/** The full emit payload: schema name → its tables' organic-key configs. */
export type DetectedOrganicKeysOutput = Record<string, TableOrganicKeyConfig[]>;

// ─── Transitive spoke input (from Phase B) ──────────────────────────────────

export interface TransitiveSpokeInput {
    hubSchema: string;
    hubTable: string;
    hubKeyFields: string[];
    spokeSchema: string;
    spokeTable: string;
    transitiveView: TransitiveViewConfig;
    transitiveMatchFieldNames: string[];
    transitiveOutputFieldName: string;
    relatedEntityJoinFieldName: string;
    hubConcept?: string;
}

// ─── Entry point — pure fan-out ─────────────────────────────────────────────

/**
 * Render gated clusters into PR #2193 JSON. Same-concept consolidation +
 * per-table fan-out + transitive spoke attachment. No filters, no thresholds.
 *
 * The caller (Composer) is responsible for filtering. Anything passed in
 * gets emitted.
 */
export function translateClusters(
    clusters: OrganicKeyCluster[],
    transitiveSpokes: TransitiveSpokeInput[] = [],
): DetectedOrganicKeysOutput {
    // Step 1 — group by normalized canonical concept name.
    const byConcept = new Map<string, OrganicKeyCluster[]>();
    for (const cluster of clusters) {
        if (cluster.members.length < 2) continue;
        const key = normalizeConceptName(cluster.concept);
        const bucket = byConcept.get(key);
        if (bucket) bucket.push(cluster);
        else byConcept.set(key, [cluster]);
    }

    const out: DetectedOrganicKeysOutput = {};

    for (const group of byConcept.values()) {
        // Step 2 — union members across all clusters in the group, deduped by
        // full column key (schema.table.col1,col2,...).
        const memberMap = new Map<string, OrganicKeyClusterMember>();
        for (const c of group) {
            for (const m of c.members) {
                const k = `${m.schema}.${m.table}.${memberColumns(m).join(',')}`;
                if (!memberMap.has(k)) memberMap.set(k, m);
            }
        }
        const allMembers = Array.from(memberMap.values());
        if (allMembers.length < 2) continue;
        const distinctTables = new Set(allMembers.map((m) => `${m.schema}.${m.table}`));
        if (distinctTables.size < 2) continue;

        // Pick the anchor (highest confidence, ties by member count).
        const anchor = group
            .slice()
            .sort((a, b) => (b.confidence - a.confidence) || (b.members.length - a.members.length))[0];
        const name = prettyConceptName(anchor.concept);

        // Step 3 — fan out: one entry per unique owner, spokes = all OTHER unique members.
        for (const owner of allMembers) {
            const tableEntry = upsertTable(out, owner.schema, owner.table);

            const seenSpokes = new Set<string>();
            const spokes: OrganicKeyRelatedEntityConfig[] = [];

            // Direct spokes — every other cluster member.
            for (const target of allMembers) {
                if (target === owner) continue;
                const targetColumns = memberColumns(target);
                const k = `${target.schema}.${target.table}.${targetColumns.join(',')}`;
                if (seenSpokes.has(k)) continue;
                seenSpokes.add(k);
                spokes.push({
                    SchemaName: target.schema,
                    TableName: target.table,
                    RelatedFieldNames: targetColumns,
                    DisplayName: `${target.schema}.${target.table}`,
                });
            }

            // Transitive spokes — bridge views attached to matching hubs.
            const ownerColumns = memberColumns(owner);
            const matchingTransitive = transitiveSpokes.filter(
                (t) =>
                    t.hubSchema === owner.schema &&
                    t.hubTable === owner.table &&
                    t.hubKeyFields.length === ownerColumns.length &&
                    t.hubKeyFields.every((f, idx) => f === ownerColumns[idx]),
            );
            for (const t of matchingTransitive) {
                spokes.push({
                    SchemaName: t.spokeSchema,
                    TableName: t.spokeTable,
                    TransitiveView: t.transitiveView,
                    TransitiveMatchFieldNames: t.transitiveMatchFieldNames,
                    TransitiveOutputFieldName: t.transitiveOutputFieldName,
                    RelatedEntityJoinFieldName: t.relatedEntityJoinFieldName,
                    DisplayName: `${t.spokeSchema}.${t.spokeTable} (via ${t.hubConcept ?? 'bridge'})`,
                });
            }

            const compoundSuffix = isCompoundMember(owner) ? ` (compound: ${ownerColumns.join('+')})` : '';
            // Per-column normalization: each emitted EntityOrganicKey row carries the
            // transformation for ITS owner column. The runtime looks up each side's
            // own expression at match time (see EntityInfo.BuildOrganicKeyViewParams),
            // so different columns in the same cluster can carry different functions.
            // Falls back to cluster-level normalization if a member didn't get its own.
            const ownerNormalization = owner.normalizationStrategy ?? anchor.normalization;
            const ownerCustomExpression =
                owner.customNormalizationExpression ?? anchor.customNormalizationExpression;
            tableEntry.OrganicKeys.push({
                Name: name + compoundSuffix,
                Description: anchor.reasoning,
                MatchFieldNames: ownerColumns,
                NormalizationStrategy: ownerNormalization,
                CustomNormalizationExpression: ownerCustomExpression,
                AutoCreateRelatedViewOnForm: true,
                RelatedEntities: spokes,
            });
        }
    }

    return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeConceptName(name: string): string {
    return (name ?? '')
        .toLowerCase()
        .replace(/[\s\-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim();
}

function prettyConceptName(concept: string): string {
    const pretty = concept
        .split('_')
        .filter((p) => p.length > 0)
        .map((p) => p[0].toUpperCase() + p.slice(1))
        .join(' ');
    return `${pretty} Match`;
}

function upsertTable(
    out: DetectedOrganicKeysOutput,
    schema: string,
    table: string,
): TableOrganicKeyConfig {
    let bySchema = out[schema];
    if (!bySchema) {
        bySchema = [];
        out[schema] = bySchema;
    }
    let entry = bySchema.find((t) => t.TableName === table);
    if (!entry) {
        entry = { TableName: table, OrganicKeys: [] };
        bySchema.push(entry);
    }
    return entry;
}

/** Tally the emit payload: number of schemas, tables, organic keys, and spokes it contains. */
export function countOutputEntries(out: DetectedOrganicKeysOutput): {
    schemas: number;
    tables: number;
    keys: number;
    spokes: number;
} {
    let tables = 0;
    let keys = 0;
    let spokes = 0;
    const schemas = Object.keys(out).length;
    for (const tableList of Object.values(out)) {
        tables += tableList.length;
        for (const t of tableList) {
            keys += t.OrganicKeys.length;
            for (const k of t.OrganicKeys) spokes += k.RelatedEntities.length;
        }
    }
    return { schemas, tables, keys, spokes };
}
