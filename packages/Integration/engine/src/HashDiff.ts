import { createHash } from 'node:crypto';
import { computeContentHash } from './ContentHash.js';

/**
 * Partitioned / Merkle-style hash-diff (§7 "hash-diff / full-table compare to find changed
 * partitions cheaply when no incremental cursor exists").
 *
 * The problem: some sources have NO usable watermark — they can't tell us "what changed since T"
 * (e.g. YourMembership re-fetches every record every time). Per-record content hashing
 * (`computeContentHash`) already lets us skip the per-record load+write for the unchanged majority,
 * but we still have to FETCH every record to hash it. When the remote can expose a cheap per-PARTITION
 * rollup hash (a folder digest, an aggregated checksum, or just a previously-stored snapshot of one),
 * we can compare partition rollups first and only deep-fetch the partitions whose rollup moved.
 *
 * This module builds the local side of that comparison ON TOP of `computeContentHash`:
 *   1. `partitionRecords`     — bucket records by an arbitrary partition key.
 *   2. `partitionRollupHash`  — fold each bucket's per-record hashes into ONE order-independent digest.
 *   3. `diffPartitions`       — compare two partition→rollup maps; only the differing partitions
 *                               (changed/added/removed) need a deep re-sync.
 *
 * Everything here is pure, deterministic, and free of DB/network — it operates on in-memory
 * record arrays and plain string→string maps, so it is cheaply unit-testable and reusable on either
 * side of the comparison.
 */

/**
 * Stable partition bucket for a record IDENTITY (e.g. its ExternalID). Hashing the identity (not the
 * content) keeps a record in the SAME partition across syncs even when its content changes — so a
 * content edit shows up as a *changed partition* rather than a record hopping buckets. SHA-256 of the
 * id, first 4 bytes folded modulo `partitionCount`, gives an even, deterministic spread. Default 256
 * buckets is a sane balance (few enough rollups to store, fine-grained enough to skip most work).
 */
export function partitionKeyForIdentity(identity: string, partitionCount = 256): string {
    const hex = createHash('sha256').update(identity).digest('hex').slice(0, 8);
    return String(parseInt(hex, 16) % Math.max(1, partitionCount));
}

/** Outcome of comparing a local partition→rollup map against a remote one. */
export type PartitionDiff = {
    /** Partitions present on BOTH sides whose rollup hash differs — need a deep re-sync. */
    changed: string[];
    /** Partitions present ONLY in the local map — new since the remote snapshot. */
    added: string[];
    /** Partitions present ONLY in the remote map — removed since the remote snapshot. */
    removed: string[];
};

/**
 * Buckets records by a partition key. `getKey` is accepted to keep the call shape symmetric with
 * the rest of the diff pipeline (callers thread a stable record identity through partition + rollup);
 * partitioning itself only needs `getPartition`. Returns a Map keyed by partition string, each value
 * the array of records that fall in that partition. Records arrive in the order encountered — order
 * is preserved within a bucket and never relied upon by the rollup (see `partitionRollupHash`).
 */
export function partitionRecords<T>(
    records: readonly T[],
    getKey: (record: T) => string,
    getPartition: (record: T) => string,
): Map<string, T[]> {
    // getKey is part of the documented signature (callers pass a record-identity accessor) but
    // bucketing is driven purely by partition; reference it so the contract stays explicit.
    void getKey;
    const buckets = new Map<string, T[]>();
    for (const record of records) {
        const partition = getPartition(record);
        const bucket = buckets.get(partition);
        if (bucket) {
            bucket.push(record);
        } else {
            buckets.set(partition, [record]);
        }
    }
    return buckets;
}

/**
 * ORDER-INDEPENDENT rollup of a partition's records into a single hash. Each record's mapped fields
 * are content-hashed via `computeContentHash`, the per-record hashes are SORTED, then the sorted list
 * is concatenated and SHA-256'd. Sorting before combining is what makes the rollup stable regardless
 * of the order records were fetched in — `[a,b]` and `[b,a]` produce the identical partition digest,
 * so a re-fetch that merely reorders rows never spuriously flags the partition as changed.
 *
 * An empty partition rolls up to the SHA-256 of the empty string, a stable sentinel distinct from any
 * non-empty partition.
 */
export function partitionRollupHash<T>(
    records: readonly T[],
    fieldsOf: (record: T) => Record<string, unknown>,
): string {
    const recordHashes = records.map(record => computeContentHash(fieldsOf(record)));
    recordHashes.sort();
    // Length-prefix each hash so the concatenation is unambiguous and can't collide across different
    // record counts. SHA-256 hex is fixed-width, but the prefix keeps the combine future-proof.
    const combined = recordHashes.map(hash => `${hash.length}:${hash}`).join('');
    return createHash('sha256').update(combined).digest('hex');
}

/**
 * Compares two partition→rollup maps and reports which partitions diverge. Only `changed`/`added`/
 * `removed` partitions need a deep re-sync; partitions whose rollup matches on both sides are proven
 * identical and can be skipped entirely. The result arrays are sorted for deterministic output.
 *
 * - `changed` — key in BOTH maps, rollup values differ.
 * - `added`   — key in `local` only.
 * - `removed` — key in `remote` only.
 */
export function diffPartitions(
    local: ReadonlyMap<string, string>,
    remote: ReadonlyMap<string, string>,
): PartitionDiff {
    const changed: string[] = [];
    const added: string[] = [];
    for (const [partition, localRollup] of local) {
        if (!remote.has(partition)) {
            added.push(partition);
        } else if (remote.get(partition) !== localRollup) {
            changed.push(partition);
        }
    }
    const removed: string[] = [];
    for (const partition of remote.keys()) {
        if (!local.has(partition)) {
            removed.push(partition);
        }
    }
    changed.sort();
    added.sort();
    removed.sort();
    return { changed, added, removed };
}
