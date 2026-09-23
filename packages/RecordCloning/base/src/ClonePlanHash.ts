/**
 * @file ClonePlanHash.ts
 * Deterministic, canonical SHA-256 hashing of ClonePlan topology and transformations.
 * Stable across key ordering and ignores pre-minted TargetKey values.
 * Client-safe with pure, dependency-free SHA-256 implementation.
 * @see plans/record-cloning/README.md §3.5, §13.1
 */

import {
    CloneFieldChange,
    ClonePlanEdge,
    ClonePlanNode,
    FormatCompositeKey,
} from './types';

/**
 * Pure TypeScript SHA-256 hash function.
 * Runs synchronously in Node, browsers, and workers without external dependencies.
 */
export function sha256(ascii: string): string {
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i = 0;
    let j = 0;
    let result = '';

    const words: number[] = [];
    const asciiBitLength = ascii[lengthProperty] * 8;

    let hash: number[] = [];
    const k: number[] = [];
    let primeCounter = 0;

    const isComposite: Record<number, number> = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 300; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }

    hash = hash.slice(0, 8);

    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) {
        ascii += '\x00';
    }
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return ''; // non-ascii
        words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength | 0;

    for (j = 0; j < words[lengthProperty]; ) {
        const w = words.slice(j, (j += 16));
        const oldHash = hash;
        hash = hash.slice(0, 8);

        for (i = 0; i < 64; i++) {
            const w15 = w[i - 15];
            const w2 = w[i - 2];

            const s0 =
                ((w15 >>> 7) | (w15 << 25)) ^
                ((w15 >>> 18) | (w15 << 14)) ^
                (w15 >>> 3);
            const s1 =
                ((w2 >>> 17) | (w2 << 15)) ^
                ((w2 >>> 19) | (w2 << 13)) ^
                (w2 >>> 10);

            const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
            const maj =
                (hash[0] & hash[1]) ^
                (hash[0] & hash[2]) ^
                (hash[1] & hash[2]);
            const s0Maj =
                ((hash[0] >>> 2) | (hash[0] << 30)) ^
                ((hash[0] >>> 13) | (hash[0] << 19)) ^
                ((hash[0] >>> 22) | (hash[0] << 10));
            const s1Ch =
                ((hash[4] >>> 6) | (hash[4] << 26)) ^
                ((hash[4] >>> 11) | (hash[4] << 21)) ^
                ((hash[4] >>> 25) | (hash[4] << 7));

            const temp1 =
                hash[7] +
                s1Ch +
                ch +
                k[i] +
                (w[i] =
                    i < 16
                        ? w[i]
                        : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
            const temp2 = s0Maj + maj;

            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    for (i = 0; i < 8; i++) {
        for (let b = 3; b >= 0; b--) {
            const byte = (hash[i] >> (b * 8)) & 255;
            result += (byte < 16 ? '0' : '') + byte.toString(16);
        }
    }
    return result;
}

/**
 * Deterministically stringifies an arbitrary value for canonical hashing.
 */
function canonicalizeValue(val: unknown): string {
    if (val === null || val === undefined) {
        return '';
    }
    if (typeof val === 'object') {
        if (val instanceof Date) {
            return val.toISOString();
        }
        if (Array.isArray(val)) {
            return `[${val.map(canonicalizeValue).join(',')}]`;
        }
        const obj = val as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeValue(obj[k])}`).join(',')}}`;
    }
    return JSON.stringify(val);
}

/**
 * Input subset of ClonePlan required for computing the canonical hash.
 */
export interface ClonePlanHashInput {
    Nodes: ClonePlanNode[];
    Edges: ClonePlanEdge[];
    Excluded?: unknown[];
}

/**
 * Computes a stable, canonical SHA-256 hash across a plan's nodes, edges,
 * actions, and field transformations.
 *
 * Requirements:
 * - Covers every node's (EntityName, SourceKey, Action)
 * - Covers every edge's (FromKey, ToKey, Policy)
 * - Covers every FieldChange (Field, Kind, OldValue, NewValue, Reason)
 * - EXCLUDES TargetKey values (so re-planning does not drift on pre-minted UUIDs)
 * - Immune to array ordering of nodes, edges, or field changes
 */
export function ComputePlanHash(plan: ClonePlanHashInput): string {
    // 1. Canonicalize and sort nodes
    const sortedNodes = [...plan.Nodes]
        .map((n) => {
            const sortedChanges = [...n.FieldChanges]
                .sort((a, b) => a.Field.localeCompare(b.Field))
                .map((fc: CloneFieldChange) => ({
                    Field: fc.Field,
                    Kind: fc.Kind,
                    OldValue: canonicalizeValue(fc.OldValue),
                    NewValue: canonicalizeValue(fc.NewValue),
                    Reason: fc.Reason || '',
                }));

            return {
                EntityName: n.EntityName,
                SourceKey: FormatCompositeKey(n.SourceKey),
                Action: n.Action,
                FieldChanges: sortedChanges,
            };
        })
        .sort((a, b) => {
            const cmp = a.EntityName.localeCompare(b.EntityName);
            if (cmp !== 0) return cmp;
            return a.SourceKey.localeCompare(b.SourceKey);
        });

    // 2. Canonicalize and sort edges
    const sortedEdges = [...plan.Edges]
        .map((e) => ({
            FromKey: e.FromKey,
            ToKey: e.ToKey,
            Policy: e.Policy,
        }))
        .sort((a, b) => {
            const cmp = a.FromKey.localeCompare(b.FromKey);
            if (cmp !== 0) return cmp;
            const cmp2 = a.ToKey.localeCompare(b.ToKey);
            if (cmp2 !== 0) return cmp2;
            return a.Policy.localeCompare(b.Policy);
        });

    // 3. Form canonical string
    const canonicalPayload = JSON.stringify({
        Nodes: sortedNodes,
        Edges: sortedEdges,
    });

    return sha256(canonicalPayload);
}

export const ComputeClonePlanHash = ComputePlanHash;
