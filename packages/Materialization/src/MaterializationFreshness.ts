import { IMetadataProvider, RunView, UserInfo, IsMaterializedDataSource } from '@memberjunction/core';

/** The scalar fields Inspect reads from 'MJ: Materialized Results' (ResultType:'simple' shape). */
type MaterializedFreshnessRow = {
    SourceType: string | null;
    SourceEntityID: string | null;
    GeneratedEntityID: string | null;
    Status: string | null;
    LastRefreshedAt: Date | string | null;
};

/**
 * Phase 4 (plan §13 — mixed-freshness joins): once live and materialized (snapshot) entities coexist,
 * a caller can read/join across them and get subtly inconsistent results (e.g. a member present live but
 * not yet in last night's snapshot). MJ can't stop a caller from doing this, but per §13 the
 * selection-contract metadata should let an agent NOTICE and FLAG it rather than silently return it.
 *
 * This module surfaces that: given the entities a caller intends to read and whether each is read live or
 * from its materialized snapshot, it reports whether the read mixes freshness (live + snapshot, or a held/
 * stale snapshot) so the caller/agent can decide. It does not block anything — it's an advisory signal.
 */

/** One entity's freshness posture within a planned read/join. */
export interface EntityFreshness {
    entityName: string;
    /** True when this entity is being read from its materialized snapshot (DataSource:'Materialized'). */
    isMaterialized: boolean;
    /** MaterializedResult.Status, when materialized (e.g. 'Active', 'Stale', 'DriftHold'). */
    status?: string;
    /** When the snapshot was last refreshed, when materialized. */
    lastRefreshedAt?: Date | null;
}

/** The mixed-freshness verdict for a planned read/join across a set of entities. */
export interface MixedFreshnessReport {
    /** True when the read mixes a LIVE entity with a MATERIALIZED (snapshot) one — the canonical hazard. */
    mixed: boolean;
    hasLive: boolean;
    hasMaterialized: boolean;
    /** Materialized entities that are NOT cleanly fresh (Status not 'Active') — e.g. Stale / DriftHold. */
    unhealthySnapshots: string[];
    /** Spread (ms) between the newest and oldest snapshot refresh across materialized entities (0 if <2). */
    snapshotFreshnessSpreadMs: number;
    /** Human/agent-readable advisory when there is anything to flag; undefined when the read is uniform. */
    warning?: string;
    entities: EntityFreshness[];
}

/**
 * Pure analysis of a planned read's freshness posture. No DB/IO — fully unit-testable.
 * Flags: (a) mixing live + snapshot in one read; (b) any non-Active snapshot (Stale/DriftHold); and
 * reports the refresh-time spread across snapshots so an agent can weigh cross-snapshot skew.
 */
export function analyzeMixedFreshness(entities: EntityFreshness[]): MixedFreshnessReport {
    const materialized = entities.filter((e) => e.isMaterialized);
    const hasLive = entities.some((e) => !e.isMaterialized);
    const hasMaterialized = materialized.length > 0;
    const mixed = hasLive && hasMaterialized;

    const unhealthySnapshots = materialized
        .filter((e) => e.status && e.status !== 'Active')
        .map((e) => `${e.entityName} (${e.status})`);

    const refreshTimes = materialized
        .map((e) => (e.lastRefreshedAt ? new Date(e.lastRefreshedAt).getTime() : null))
        // Exclude NaN (an unparseable lastRefreshedAt) as well as null: NaN passes `!= null`, and a single
        // NaN poisons Math.max/Math.min (both return NaN), silently suppressing the real cross-snapshot spread
        // warning. Dropping the bad value lets the spread be computed from the parseable timestamps.
        .filter((t): t is number => t != null && !Number.isNaN(t));
    const snapshotFreshnessSpreadMs =
        refreshTimes.length >= 2 ? Math.max(...refreshTimes) - Math.min(...refreshTimes) : 0;

    const notes: string[] = [];
    if (mixed) {
        const liveNames = entities.filter((e) => !e.isMaterialized).map((e) => e.entityName);
        const matNames = materialized.map((e) => e.entityName);
        notes.push(`reads mix live [${liveNames.join(', ')}] with materialized snapshot [${matNames.join(', ')}] — results may be inconsistent (a row present live may be absent from the snapshot, or vice-versa)`);
    }
    if (unhealthySnapshots.length) {
        notes.push(`snapshot(s) not fresh: [${unhealthySnapshots.join(', ')}]`);
    }
    if (materialized.length >= 2 && snapshotFreshnessSpreadMs > 0) {
        notes.push(`snapshots were refreshed at different times (spread ${Math.round(snapshotFreshnessSpreadMs / 1000)}s)`);
    }

    return {
        mixed,
        hasLive,
        hasMaterialized,
        unhealthySnapshots,
        snapshotFreshnessSpreadMs,
        warning: notes.length ? notes.join('; ') : undefined,
        entities,
    };
}

/** A planned read of one entity: its name and whether the caller intends to read it live or materialized. */
export interface PlannedEntityRead {
    entityName: string;
    dataSource?: 'Live' | 'Materialized';
}

/**
 * Loads freshness facts for a planned read and analyzes it. For each entity the caller intends to read
 * from its snapshot (`dataSource:'Materialized'`), looks up the base-view MaterializedResult's Status +
 * LastRefreshedAt; entities read live (or with no materialization) are reported as live. Advisory only.
 */
export class MaterializationFreshness {
    public static async Inspect(
        reads: PlannedEntityRead[],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MixedFreshnessReport> {
        // Resolve every planned read to its entity. The two materialization types have DIFFERENT freshness
        // semantics:
        //   • Base-view materialization reuses the SOURCE entity and exposes BOTH a live and a snapshot read,
        //     so it is a snapshot read only when the caller asked for one (dataSource:'Materialized'). Matched
        //     by SourceEntityID.
        //   • Query materialization mints a NEW virtual entity whose base view IS the snapshot (there is no
        //     live alternative), so a read of it is ALWAYS a snapshot read regardless of the dataSource flag.
        //     Matched by GeneratedEntityID.
        // We therefore look up materializations for ALL reads (not only dataSource:'Materialized' ones).
        const resolved = reads.map((r) => ({ read: r, entity: provider.EntityByName(r.entityName) }));
        const wantedIds = resolved.map((x) => x.entity?.ID).filter((id): id is string => !!id);

        // Advisory/hot path reading only scalar fields (never mutated/saved) → ResultType:'simple' + explicit
        // Fields, not full MJMaterializedResultEntity objects (the RunView anti-pattern the root CLAUDE.md
        // flags). Scoped by entity ID so we don't pull the whole materialization set. (uniqueidentifier/uuid
        // comparison is type-normalized on both engines, so raw-cased ID literals match regardless of casing.)
        const baseViewByEntityId = new Map<string, MaterializedFreshnessRow>();
        const queryByEntityId = new Map<string, MaterializedFreshnessRow>();
        if (wantedIds.length > 0) {
            const inList = wantedIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
            // Use the PASSED-IN provider (not the global default new RunView()) — entity resolution above uses
            // `provider`, so in a multi-provider client the materialization rows must come from that SAME
            // server/DB, or the entity IDs won't match and every read is misreported as not-materialized.
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<MaterializedFreshnessRow>(
                {
                    EntityName: 'MJ: Materialized Results',
                    ExtraFilter: `(SourceType='EntityBaseView' AND SourceEntityID IN (${inList})) OR (SourceType='Query' AND GeneratedEntityID IN (${inList}))`,
                    Fields: ['SourceType', 'SourceEntityID', 'GeneratedEntityID', 'Status', 'LastRefreshedAt'],
                    ResultType: 'simple',
                },
                contextUser,
            );
            if (res.Success) {
                // Key each row by the ID that identifies the ENTITY a caller reads (lowercased for UUID-casing
                // robustness): base-view → SourceEntityID, query → GeneratedEntityID.
                for (const mr of res.Results) {
                    if (mr.SourceType === 'Query') {
                        if (mr.GeneratedEntityID) queryByEntityId.set(mr.GeneratedEntityID.toLowerCase(), mr);
                    } else if (mr.SourceEntityID) {
                        baseViewByEntityId.set(mr.SourceEntityID.toLowerCase(), mr);
                    }
                }
            }
        }

        const toFreshness = (name: string, mr: MaterializedFreshnessRow): EntityFreshness => ({
            entityName: name,
            isMaterialized: true,
            status: mr.Status ?? undefined,
            // ResultType:'simple' can deliver a datetimeoffset as a raw string; normalize to Date | null.
            lastRefreshedAt: mr.LastRefreshedAt ? new Date(mr.LastRefreshedAt) : null,
        });

        const entities: EntityFreshness[] = resolved.map(({ read, entity }) => {
            if (!entity) return { entityName: read.entityName, isMaterialized: false };
            const id = entity.ID.toLowerCase();
            // Query materialization → always a snapshot read (no live form), flag regardless of dataSource.
            const queryMat = queryByEntityId.get(id);
            if (queryMat) return toFreshness(read.entityName, queryMat);
            // Base-view materialization → a snapshot read ONLY when the caller opted in via dataSource.
            // NOTE: reporting isMaterialized:false here is a freshness *report* only; it does NOT mean a
            // DataSource:'Materialized' RunView would fall back to live — GetEffectiveBaseView resolves
            // 'Materialized' to materialized_vw<CodeName> with no existence check, so such a read on an entity
            // with no materialization targets a missing view and errors at the DB.
            if (IsMaterializedDataSource(read.dataSource)) {
                const baseMat = baseViewByEntityId.get(id);
                if (baseMat) return toFreshness(read.entityName, baseMat);
            }
            return { entityName: read.entityName, isMaterialized: false };
        });

        return analyzeMixedFreshness(entities);
    }
}
