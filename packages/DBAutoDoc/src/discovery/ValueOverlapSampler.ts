/**
 * Value Overlap Sampler — fetches sample values per column and computes MinHash
 * signatures for organic key cluster detection.
 *
 * Uses {@link BaseAutoDocDriver.getSampleValues} so it works against any database
 * driver DBAutoDoc supports. Skips columns of incompatible data types (binary,
 * BLOB, etc.) and columns that fail to sample (those simply get no signature).
 */

import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { computeMinHash, MinHashSignature } from './MinHashSketch.js';

export interface ColumnIdentity {
    schema: string;
    table: string;
    column: string;
    dataType: string;
}

export interface SamplerOptions {
    /** Number of hash functions per signature (default: 128). */
    numHashes?: number;
    /** Number of values to sample per column (default: 500). */
    sampleSize?: number;
    /** Concurrency limit for parallel column sampling (default: 4). */
    concurrency?: number;
    /** Optional progress callback. */
    onProgress?: (sampled: number, total: number, current: string) => void;
}

export class ValueOverlapSampler {
    constructor(private driver: BaseAutoDocDriver) {}

    /**
     * Sample values and compute MinHash signatures for the given columns.
     * Returns a Map keyed by 'schema.table.column' → signature.
     * Columns that fail to sample or are type-incompatible are simply absent from the map.
     */
    public async sampleAll(
        columns: ColumnIdentity[],
        opts: SamplerOptions = {},
    ): Promise<Map<string, MinHashSignature>> {
        const numHashes = opts.numHashes ?? 128;
        const sampleSize = opts.sampleSize ?? 500;
        const concurrency = Math.max(1, opts.concurrency ?? 4);

        const eligible = columns.filter((c) => isSamplable(c.dataType));
        const total = eligible.length;
        const out = new Map<string, MinHashSignature>();

        let cursor = 0;
        let completed = 0;
        const runners = Array.from({ length: concurrency }, async () => {
            while (true) {
                const idx = cursor++;
                if (idx >= eligible.length) return;
                const col = eligible[idx];
                const key = `${col.schema}.${col.table}.${col.column}`;
                opts.onProgress?.(completed, total, key);
                try {
                    const values = await this.driver.getSampleValues(
                        col.schema,
                        col.table,
                        col.column,
                        sampleSize,
                    );
                    const strings = (values ?? [])
                        .filter((v) => v != null)
                        .map((v) => String(v));
                    if (strings.length > 0) {
                        out.set(key, computeMinHash(strings, numHashes));
                    }
                } catch {
                    // Sampling failure is non-fatal — skip this column's signature
                }
                completed++;
            }
        });

        await Promise.all(runners);
        return out;
    }
}

/**
 * Whether a SQL data type is reasonable to sample values from for MinHash overlap.
 * Excludes binary blobs (no useful Jaccard) and floats (continuous values rarely match).
 */
function isSamplable(dataType: string): boolean {
    if (!dataType) return false;
    const t = dataType.toLowerCase().trim();
    if (
        t.includes('binary') ||
        t.includes('blob') ||
        t.includes('image') ||
        t.includes('varbinary') ||
        t.includes('xml')
    ) {
        return false;
    }
    if (t.includes('float') || t.includes('real')) {
        return false;
    }
    return true;
}
