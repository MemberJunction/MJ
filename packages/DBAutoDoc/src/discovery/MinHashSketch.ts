/**
 * MinHash signatures for cheap, approximate Jaccard similarity over column value sets.
 *
 * Approach:
 *   1. For each value in a column, compute K independent hash functions
 *   2. Keep only the MINIMUM hash output observed for each of the K functions
 *   3. The resulting K-vector is the MinHash signature
 *   4. Jaccard(A, B) ≈ (# matching positions in signatures) / K
 *
 * Deps-free implementation using xxHash-style mixing over a 32-bit seed space.
 * Not cryptographically secure (and doesn't need to be — only collision-resistant enough
 * for Jaccard estimation at small K).
 */

const DEFAULT_NUM_HASHES = 128;

/**
 * A MinHash signature — fixed-length array of 32-bit minimum hashes.
 * Two sketches with the same numHashes can be compared via {@link jaccardEstimate}.
 */
export interface MinHashSignature {
    numHashes: number;
    /** Length = numHashes. Each entry is the min observed hash for that seed. */
    sketch: Uint32Array;
}

/**
 * Compute a MinHash signature for a set of string values.
 * Empty input returns a sketch of all-max values (representing the empty set).
 */
export function computeMinHash(values: Iterable<string>, numHashes = DEFAULT_NUM_HASHES): MinHashSignature {
    const sketch = new Uint32Array(numHashes);
    sketch.fill(0xffffffff);

    let count = 0;
    for (const value of values) {
        if (value == null) continue;
        count++;
        const normalized = String(value).trim().toLowerCase();
        if (normalized.length === 0) continue;
        const baseHash = murmurish32(normalized, 0);
        for (let i = 0; i < numHashes; i++) {
            const h = mix32(baseHash, i);
            if (h < sketch[i]) sketch[i] = h;
        }
    }

    return { numHashes, sketch };
}

/**
 * Estimate Jaccard similarity between two MinHash signatures.
 * Both signatures must have been built with the same numHashes.
 *
 * Returns 0 when either signature has not observed any values (all-max sentinel).
 */
export function jaccardEstimate(a: MinHashSignature, b: MinHashSignature): number {
    if (a.numHashes !== b.numHashes) {
        throw new Error(
            `Cannot compare MinHash signatures of different sizes: ${a.numHashes} vs ${b.numHashes}`,
        );
    }
    if (isEmptySignature(a) || isEmptySignature(b)) return 0;

    let matches = 0;
    for (let i = 0; i < a.numHashes; i++) {
        if (a.sketch[i] === b.sketch[i]) matches++;
    }
    return matches / a.numHashes;
}

/** Convenience: Jaccard distance = 1 - estimated Jaccard similarity. */
export function jaccardDistance(a: MinHashSignature, b: MinHashSignature): number {
    return 1 - jaccardEstimate(a, b);
}

/** Whether a signature represents the empty set (sketch is all 0xffffffff). */
export function isEmptySignature(sig: MinHashSignature): boolean {
    for (let i = 0; i < sig.numHashes; i++) {
        if (sig.sketch[i] !== 0xffffffff) return false;
    }
    return true;
}

/** Serialize a signature to a base64-encoded string for compact storage in state.json. */
export function serializeSignature(sig: MinHashSignature): string {
    const buf = Buffer.from(sig.sketch.buffer, sig.sketch.byteOffset, sig.sketch.byteLength);
    return buf.toString('base64');
}

/** Deserialize a base64-encoded signature back into a MinHashSignature. */
export function deserializeSignature(encoded: string, numHashes = DEFAULT_NUM_HASHES): MinHashSignature {
    const buf = Buffer.from(encoded, 'base64');
    if (buf.byteLength !== numHashes * 4) {
        throw new Error(
            `Signature byte length ${buf.byteLength} does not match expected ${numHashes * 4} for numHashes=${numHashes}`,
        );
    }
    const sketch = new Uint32Array(buf.buffer, buf.byteOffset, numHashes);
    // Defensive copy so the consumer owns the memory
    return { numHashes, sketch: new Uint32Array(sketch) };
}

// ─── Hash internals (deps-free) ─────────────────────────────────────────────

/**
 * Tiny non-cryptographic hash modeled on xxHash/murmur3 mixing. Stable, fast,
 * adequate for Jaccard estimation at typical K=64–256.
 */
function murmurish32(str: string, seed: number): number {
    let h = (seed ^ 0x9e3779b1) >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x85ebca6b) >>> 0;
        h ^= h >>> 13;
        h = Math.imul(h, 0xc2b2ae35) >>> 0;
        h ^= h >>> 16;
    }
    // Final avalanche
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

function mix32(baseHash: number, seed: number): number {
    let h = (baseHash ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}
