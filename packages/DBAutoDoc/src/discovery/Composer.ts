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

import { OrganicKeyCluster, OrganicKeyClusterMember, memberColumns } from '../types/organic-keys.js';
import {
    DetectedOrganicKeysOutput,
    TransitiveSpokeInput,
    translateClusters,
    countOutputEntries,
} from './OrganicKeyTranslator.js';
import { TransitiveBridgeFinding } from './TransitiveBridgeDetector.js';
import { JoinProbeResult, KeyVerifier } from './JoinProbe.js';

/** Output of the compose step: the PR #2193 JSON, the FK-redundancy-annotated clusters, and emit counts. */
export interface ComposerResult {
    output: DetectedOrganicKeysOutput;
    /** Per-cluster record of what the value-overlap probe concluded, for reporting. */
    verification: ClusterVerification[];
    /** Clusters with isFKRedundant filled in — callers that persist the cluster list
     *  (e.g. detector → state.json → dashboard) should use THIS, not the pre-compose
     *  input, otherwise the flag is silently lost. */
    annotatedClusters: OrganicKeyCluster[];
    emitted: number;
    flaggedFKRedundant: number;
    /** Clusters dropped because the probe refuted the shared value space. */
    droppedUnverified: number;
    /** Individual members dropped for not sharing the anchor's value space. */
    droppedMembers: number;
    summary: { outputSchemas: number; outputTables: number; outputKeys: number; outputSpokes: number };
}

/** What the probe concluded about one cluster. */
export interface ClusterVerification {
    clusterId: string;
    concept: string;
    /** `schema.table.column` of the member every other member was probed against. */
    anchor: string;
    membersIn: number;
    membersKept: number;
    /** One entry per probed member. */
    results: Array<{ member: string; status: JoinProbeResult['status']; reason: string }>;
    /** True when the cluster was not emitted at all. */
    dropped: boolean;
}

/**
 * Compose detected clusters + transitive bridges into the PR #2193 emit JSON.
 *
 * Each cluster is annotated with `isFKRedundant` (true when it's already navigable via a
 * declared foreign key — kept but flagged, not dropped). Matching transitive bridges are
 * attached as spokes. Returns the JSON plus the annotated clusters and emit counts.
 */
export async function compose(
    clusters: OrganicKeyCluster[],
    bridges: TransitiveBridgeFinding[],
    verifier: KeyVerifier | null = null,
    options: ComposeOptions = {},
): Promise<ComposerResult> {
    let flaggedCount = 0;
    const preVerify: OrganicKeyCluster[] = clusters.map((c) => {
        const redundant = isFKRedundant(c);
        if (redundant) flaggedCount += 1;
        return { ...c, isFKRedundant: redundant };
    });

    // ── Value-overlap gate ───────────────────────────────────────────────────────
    //
    // A cluster asserts that its member columns share a value space: that two rows
    // holding the same value refer to the same real-world entity. Nothing checked
    // that. Membership was decided by LLM concept naming and embedding distance, so
    // columns that merely SOUND alike were emitted as a key — and the emitted key
    // becomes a related-record view that value-joins them, producing "related" rows
    // that are not related.
    //
    // Each member is probed against ONE anchor rather than against every other
    // member: N-1 probes per cluster instead of N², and it tests the cluster's actual
    // claim, since sharing a value space is transitive through the anchor. The anchor
    // is a PK member when the cluster has one (a PK is the canonical, unique value
    // space), otherwise the first member.
    const { clusters: annotated, verification, droppedMembers } =
        await verifyClusters(preVerify, verifier);
    const droppedUnverified = preVerify.length - annotated.length;

    const hubKeys = new Set<string>();
    for (const c of annotated) {
        for (const m of c.members) hubKeys.add(`${m.schema}.${m.table}.${m.column}`);
    }
    const spokes: TransitiveSpokeInput[] = bridges
        .filter((b) => hubKeys.has(`${b.hubSchema}.${b.hubTable}.${b.hubKeyFields[0]}`))
        .map((b) => ({
            hubSchema: b.hubSchema,
            hubTable: b.hubTable,
            hubKeyFields: b.hubKeyFields,
            spokeSchema: b.spokeSchema,
            spokeTable: b.spokeTable,
            transitiveView: { Name: b.view.viewName, SchemaName: b.view.schemaName, SQL: b.view.sql },
            transitiveMatchFieldNames: [b.view.hubKeyField],
            transitiveOutputFieldName: b.view.spokeOutputField,
            relatedEntityJoinFieldName: b.view.spokeJoinField,
            hubConcept: b.hubConcept,
        }));

    const output = translateClusters(annotated, spokes, {
        autoCreateRelatedViewOnForm: options.autoCreateRelatedViewOnForm,
    });
    const counts = countOutputEntries(output);

    return {
        output,
        annotatedClusters: annotated,
        verification,
        emitted: annotated.length,
        flaggedFKRedundant: flaggedCount,
        droppedUnverified,
        droppedMembers,
        summary: {
            outputSchemas: counts.schemas,
            outputTables: counts.tables,
            outputKeys: counts.keys,
            outputSpokes: counts.spokes,
        },
    };
}

/** Emit-time options threaded through to the translator. */
export interface ComposeOptions {
    /** See {@link import('./OrganicKeyTranslator.js').TranslateOptions}. Default false. */
    autoCreateRelatedViewOnForm?: boolean;
}

/** `schema.table.col[,col]` for a cluster member. */
function memberLabel(m: OrganicKeyClusterMember): string {
    return `${m.schema}.${m.table}.${memberColumns(m).join(',')}`;
}

/**
 * Pick the member every other member is probed against.
 *
 * A PK member is preferred: its value space is canonical and unique, so containment
 * into it is a meaningful measure. Failing that, the first member — arbitrary but
 * stable, and the probe is symmetric enough that the choice does not change which
 * clusters survive, only which member is reported as the reference.
 */
function pickAnchorMember(members: OrganicKeyClusterMember[]): OrganicKeyClusterMember {
    return members.find((m) => m.isPrimaryKey) ?? members[0];
}

/**
 * Drop cluster members whose values do not overlap the anchor's, and drop any cluster
 * left with fewer than two members or spanning fewer than two tables.
 *
 * `Unprobed` members are KEPT. Refusing to emit whenever a probe cannot run would turn
 * a permissions or budget problem into silent total key loss; the member stays and the
 * per-cluster record says it was never checked. Only a measured refutation removes
 * anything.
 */
async function verifyClusters(
    clusters: OrganicKeyCluster[],
    verifier: KeyVerifier | null,
): Promise<{ clusters: OrganicKeyCluster[]; verification: ClusterVerification[]; droppedMembers: number }> {
    const out: OrganicKeyCluster[] = [];
    const verification: ClusterVerification[] = [];
    let droppedMembers = 0;

    for (const cluster of clusters) {
        if (!verifier || cluster.members.length < 2) {
            // Nothing to probe against, or no probe available: emit unchanged and say so.
            verification.push({
                clusterId: cluster.id,
                concept: cluster.concept,
                anchor: cluster.members.length > 0 ? memberLabel(pickAnchorMember(cluster.members)) : '',
                membersIn: cluster.members.length,
                membersKept: cluster.members.length,
                results: [],
                dropped: false,
            });
            out.push(cluster);
            continue;
        }

        const anchorMember = pickAnchorMember(cluster.members);
        const kept: OrganicKeyClusterMember[] = [];
        const results: ClusterVerification['results'] = [];

        for (const member of cluster.members) {
            if (member === anchorMember) {
                kept.push(member);
                continue;
            }
            const probe = await verifier.verify({
                child: { schema: member.schema, table: member.table, column: member.column },
                parent: { schema: anchorMember.schema, table: anchorMember.table, column: anchorMember.column },
            });
            results.push({ member: memberLabel(member), status: probe.status, reason: probe.reason });
            if (probe.status === 'Refuted') {
                droppedMembers += 1;
                continue;
            }
            kept.push(member);
        }

        const distinctTables = new Set(kept.map((m) => `${m.schema}.${m.table}`));
        const dropped = kept.length < 2 || distinctTables.size < 2;
        verification.push({
            clusterId: cluster.id,
            concept: cluster.concept,
            anchor: memberLabel(anchorMember),
            membersIn: cluster.members.length,
            membersKept: dropped ? 0 : kept.length,
            results,
            dropped,
        });
        if (dropped) {
            // Everything but the anchor was refuted, or what survives no longer spans
            // two tables — there is no cross-table organic key left to emit.
            droppedMembers += kept.length;
            continue;
        }
        out.push({ ...cluster, members: kept });
    }

    return { clusters: out, verification, droppedMembers };
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
export const __test__ = { isFKRedundant };
export type { OrganicKeyClusterMember };
