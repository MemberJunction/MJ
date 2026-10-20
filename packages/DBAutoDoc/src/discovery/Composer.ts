/**
 * Composer — flag-and-emit (no destructive filtering).
 *
 * Computes `isFKRedundant` for each cluster (PR #2193 organic keys are meant
 * to be used "in place of a foreign-key reference" — when every non-PK member
 * is a declared FK pointing to the PK member, the cluster adds no new
 * navigation). Sets the flag on the cluster but does NOT drop — well-modeled
 * OLTP schemas would lose 30-50% of valid organic-key candidates if we
 * dropped, and the discovery value (cross-system extension, naming
 * consistency checks) survives the redundancy.
 *
 * The dashboard surfaces a "hide FK-redundant" filter so users get the lookup-
 * table-PK noise out of view without losing the underlying candidates.
 */

import { OrganicKeyCluster, OrganicKeyClusterMember } from '../types/organic-keys.js';
import {
    DetectedOrganicKeysOutput,
    TransitiveSpokeInput,
    TranslateClusters,
    CountOutputEntries,
} from './OrganicKeyTranslator.js';
import { TransitiveBridgeFinding } from './TransitiveBridgeDetector.js';

/** Output of the compose step: the PR #2193 JSON, the FK-redundancy-annotated clusters, and emit counts. */
export interface ComposerResult {
    output: DetectedOrganicKeysOutput;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Clusters with isFKRedundant filled in — callers that persist the cluster list
     *  (e.g. detector → state.json → dashboard) should use THIS, not the pre-compose
     *  input, otherwise the flag is silently lost. */
    AnnotatedClusters: OrganicKeyCluster[];
    Emitted: number;
    FlaggedFKRedundant: number;
    Summary: { outputSchemas: number; outputTables: number; outputKeys: number; outputSpokes: number };
}

/**
 * Compose detected clusters + transitive bridges into the PR #2193 emit JSON.
 *
 * Each cluster is annotated with `isFKRedundant` (true when it's already navigable via a
 * declared foreign key — kept but flagged, not dropped). Matching transitive bridges are
 * attached as spokes. Returns the JSON plus the annotated clusters and emit counts.
 */
export function Compose(
    clusters: OrganicKeyCluster[],
    bridges: TransitiveBridgeFinding[],
): ComposerResult {
    let flaggedCount = 0;
    const annotated: OrganicKeyCluster[] = clusters.map((c) => {
        const redundant = isFKRedundant(c);
        if (redundant) flaggedCount += 1;
        return { ...c, isFKRedundant: redundant };
    });

    const hubKeys = new Set<string>();
    for (const c of annotated) {
        for (const m of c.members) hubKeys.add(`${m.schema}.${m.table}.${m.column}`);
    }
    const spokes: TransitiveSpokeInput[] = bridges
        .filter((b) => hubKeys.has(`${b.HubSchema}.${b.HubTable}.${b.HubKeyFields[0]}`))
        .map((b) => ({
            hubSchema: b.HubSchema,
            hubTable: b.HubTable,
            hubKeyFields: b.HubKeyFields,
            spokeSchema: b.SpokeSchema,
            spokeTable: b.SpokeTable,
            transitiveView: { Name: b.View.ViewName, SchemaName: b.View.schemaName, SQL: b.View.Sql },
            transitiveMatchFieldNames: [b.View.HubKeyField],
            transitiveOutputFieldName: b.View.SpokeOutputField,
            relatedEntityJoinFieldName: b.View.SpokeJoinField,
            hubConcept: b.HubConcept,
        }));

    const output = TranslateClusters(annotated, spokes);
    const counts = CountOutputEntries(output);

    return {
        output,
        AnnotatedClusters: annotated,
        Emitted: annotated.length,
        FlaggedFKRedundant: flaggedCount,
        Summary: {
            outputSchemas: counts.schemas,
            outputTables: counts.tables,
            outputKeys: counts.keys,
            outputSpokes: counts.spokes,
        },
    };
}

/** @deprecated Use {@link Compose}. */
export function compose(
    clusters: OrganicKeyCluster[],
    bridges: TransitiveBridgeFinding[],
): ComposerResult {
    return Compose(clusters, bridges);
}

/**
 * A cluster is FK-redundant when ALL non-PK members are declared FKs pointing
 * at the same target column (typically the PK member of the cluster). PR #2193
 * organic keys are "used in place of a foreign-key reference" — if the FK is
 * already declared, the cluster doesn't add navigability.
 *
 * Requires at least one PK and at least one FK in the cluster to apply.
 * Returns false for clusters that are entirely PKs, entirely non-FKs, or that
 * have mixed FK targets (the latter is a genuine value-based correlation that
 * no single FK covers).
 */
function isFKRedundant(cluster: OrganicKeyCluster): boolean {
    const pkMembers = cluster.members.filter((m) => m.isPrimaryKey);
    const nonPK = cluster.members.filter((m) => !m.isPrimaryKey);
    if (pkMembers.length === 0 || nonPK.length === 0) return false;

    // Build the set of plausible "target" identifiers from the PK members.
    const pkTargets = new Set<string>(
        pkMembers.map((m) => `${m.schema}.${m.table}.${m.column}`.toLowerCase()),
    );

    // Every non-PK member must be a FK pointing into one of the PK targets.
    for (const m of nonPK) {
        if (!m.participatesInFK || !m.fkTarget) return false;
        const key = `${m.fkTarget.schema}.${m.fkTarget.table}.${m.fkTarget.column}`.toLowerCase();
        if (!pkTargets.has(key)) return false;
    }
    return true;
}

/** Re-export for tests / observability. */
export const TestHooks = { isFKRedundant };

/** @deprecated Use {@link TestHooks}. */
export const Test__ = TestHooks;

/** @deprecated Use {@link TestHooks}. */
export const __test__ = TestHooks;
export type { OrganicKeyClusterMember };
