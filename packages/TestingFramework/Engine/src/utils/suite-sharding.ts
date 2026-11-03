/**
 * @fileoverview Deterministic transport filtering and duration-aware LPT sharding for test suites.
 * @module @memberjunction/testing-engine
 */

/** Minimal shape of a test required for transport filtering and shard assignment. */
export interface ShardableTest {
    ID: string;
    Name: string;
    Configuration?: string | null;
}

/** 1-based shard specification (`1 <= index <= total`). */
export interface SuiteShardSpec {
    index: number;
    total: number;
}

interface ParsedTestConfig {
    transport?: 'server' | 'client';
    estimatedDurationSeconds?: number;
    /**
     * Declarative opt-in for server-transport tests that talk to the live MJAPI instance
     * or seed database/in-memory state consumed by a client-transport test. When true,
     * `ResolveTestTransport` routes the test to the `'client'` worker group (which shares
     * MJAPI's database and executes sequence-ordered server prerequisites before client bundles).
     */
    requiresSharedServerDatabase?: boolean;
    /**
     * Declarative list of companion bundle names that must be assigned to the same LPT shard
     * as this test when both are present in the candidate list.
     */
    coLocateWithBundles?: string[];
    checks?: Array<{ type?: string }>;
}

/**
 * Legacy fallback for bundles whose transport is `'client'` when `Configuration.transport`
 * is omitted (mirrors `IntegrationTestDriver.CLIENT_BUNDLES`). All current suite members set
 * `Configuration.transport` explicitly; kept as a defensive fallback for ad-hoc test records.
 */
const CLIENT_BUNDLES: ReadonlySet<string> = new Set([
    'client-cache',
    'rls-isolation-client',
    'remote-op-wire-progress',
    'fls-enforcement-client',
]);

/**
 * Fallback set of server-transport bundles that interact with the live MJAPI instance or seed
 * in-memory/DB fixtures consumed by a client-transport bundle when `Configuration.requiresSharedServerDatabase`
 * is not yet set on the Test record:
 * - `realtime-session-guard` (IT111, sequence 49): seeds server-decided session rows in the
 *   database and publishes their IDs in-process for `realtime-session-verification` (IT112,
 *   sequence 50, client transport).
 * - `calendar-event-links` (IT127, sequence 49): check CL1 connects a secondary
 *   `GraphQLDataProvider` to MJAPI (`GRAPHQL_PORT`) and verifies rows written via the local
 *   `SQLServerDataProvider` against the same database MJAPI serves.
 *
 * New tests should prefer setting `"requiresSharedServerDatabase": true` in `Configuration`.
 */
const WIRE_COMPANION_SERVER_BUNDLES: ReadonlySet<string> = new Set([
    'realtime-session-guard',
    'calendar-event-links',
]);

/**
 * Fallback companion bundle pairs `(bundleA, bundleB)` that MUST be assigned to the same shard
 * when both are present in the candidate list and `Configuration.coLocateWithBundles` is not set
 * on the Test record.
 *
 * New tests should prefer setting `"coLocateWithBundles": ["<companion-bundle>"]` in `Configuration`.
 */
const CO_LOCATED_BUNDLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['realtime-session-guard', 'realtime-session-verification'],
];

/**
 * Fallback empirical execution weights (in seconds) for heavyweight integration test bundles
 * when `Configuration.estimatedDurationSeconds` is not set on the Test record. Used by
 * Longest Processing Time (LPT) shard assignment so no two multi-minute bundles collide in the
 * same worker shard.
 *
 * Note: Under 4-way parallel execution on a 4-vCPU CI runner, per-test wall times scale by roughly
 * 1.8x-2.0x due to shared CPU and SQL Server I/O contention, while relative test weights remain
 * proportional. New tests should prefer setting `"estimatedDurationSeconds"` in `Configuration`.
 */
export const KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS: Readonly<Record<string, number>> = {
    IT143: 194,
    IT146: 172,
    IT145: 95,
    IT02: 60,
    IT142: 55,
    IT151: 43,
    IT134: 35,
    IT102: 34,
    IT140: 32,
    IT90: 30,
    IT92: 28,
    IT133: 28,
    IT135: 28,
};

/** Default weight (in seconds) for tests without an explicit or known weight entry. */
export const DEFAULT_TEST_WEIGHT_SECONDS = 4;

function parseTestConfig(raw: string | null | undefined): ParsedTestConfig | undefined {
    if (!raw || !raw.trim()) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(raw) as ParsedTestConfig | null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function getSelectedBundles(config: ParsedTestConfig | undefined): string[] {
    if (!config || !Array.isArray(config.checks)) {
        return [];
    }
    return config.checks
        .map(c => (c && typeof c.type === 'string' ? c.type : ''))
        .filter(Boolean);
}

/**
 * Parse and validate a shard specification string (`"<index>/<total>"`, e.g. `"1/3"`) or object.
 *
 * @throws Error when the format is invalid or `1 <= index <= total` does not hold.
 */
export function ParseShardSpec(input: string | SuiteShardSpec): SuiteShardSpec {
    if (typeof input === 'string') {
        const trimmed = input.trim();
        const match = /^(\d+)\/(\d+)$/.exec(trimmed);
        if (!match) {
            throw new Error(
                `Invalid --shard value '${input}': expected '<index>/<total>' with positive integers (e.g. '1/3').`
            );
        }
        const index = Number.parseInt(match[1], 10);
        const total = Number.parseInt(match[2], 10);
        return ValidateShardSpec({ index, total }, input);
    }
    return ValidateShardSpec(input, `${input.index}/${input.total}`);
}

/**
 * Validate a {@link SuiteShardSpec} object.
 */
export function ValidateShardSpec(spec: SuiteShardSpec, rawLabel?: string): SuiteShardSpec {
    const label = rawLabel ?? `${spec.index}/${spec.total}`;
    if (
        !Number.isInteger(spec.index) ||
        !Number.isInteger(spec.total) ||
        spec.total < 1 ||
        spec.index < 1 ||
        spec.index > spec.total
    ) {
        throw new Error(
            `Invalid shard specification '${label}': requires integer 1 <= index <= total (got index=${spec.index}, total=${spec.total}).`
        );
    }
    return { index: spec.index, total: spec.total };
}

/**
 * Determine which transport worker group (`'server'` or `'client'`) a test belongs to.
 *
 * - Reads `Configuration.transport` (`'server'` | `'client'`), falling back to bundle-based
 *   inference (`CLIENT_BUNDLES` -> `'client'`, else `'server'`).
 * - Promotes tests with `Configuration.requiresSharedServerDatabase === true` (or fallback
 *   `WIRE_COMPANION_SERVER_BUNDLES`) to `'client'` so they execute in the worker attached
 *   to MJAPI's database ahead of the client-transport bundles.
 */
export function ResolveTestTransport(test: ShardableTest): 'server' | 'client' {
    const config = parseTestConfig(test.Configuration);
    if (config?.requiresSharedServerDatabase === true) {
        return 'client';
    }
    const bundles = getSelectedBundles(config);
    if (bundles.some(b => WIRE_COMPANION_SERVER_BUNDLES.has(b))) {
        return 'client';
    }
    if (config?.transport === 'client' || config?.transport === 'server') {
        return config.transport;
    }
    if (bundles.some(b => CLIENT_BUNDLES.has(b))) {
        return 'client';
    }
    return 'server';
}

/**
 * Filter an ordered list of suite tests by transport (`'server'` | `'client'` | `'all'`).
 * Preserves the input order.
 */
export function FilterTestsByTransport<T extends ShardableTest>(
    tests: readonly T[],
    transport?: 'server' | 'client' | 'all'
): T[] {
    if (!transport || transport === 'all') {
        return [...tests];
    }
    if (transport !== 'server' && transport !== 'client') {
        throw new Error(`Invalid transport filter '${String(transport)}': expected 'server', 'client', or 'all'.`);
    }
    return tests.filter(t => ResolveTestTransport(t) === transport);
}

/**
 * Estimate a test's execution duration in seconds for LPT shard balancing.
 * Priority:
 * 1. `Configuration.estimatedDurationSeconds` (if positive number)
 * 2. `KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS` by leading `IT<number>` prefix in `test.Name`
 * 3. `DEFAULT_TEST_WEIGHT_SECONDS` (4s)
 */
export function EstimateTestWeightSeconds(test: ShardableTest): number {
    const config = parseTestConfig(test.Configuration);
    if (
        config?.estimatedDurationSeconds !== undefined &&
        typeof config.estimatedDurationSeconds === 'number' &&
        Number.isFinite(config.estimatedDurationSeconds) &&
        config.estimatedDurationSeconds > 0
    ) {
        return config.estimatedDurationSeconds;
    }
    const prefixMatch = /^(IT\d+)\b/.exec((test.Name ?? '').trim());
    if (prefixMatch && KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS[prefixMatch[1]] !== undefined) {
        return KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS[prefixMatch[1]];
    }
    return DEFAULT_TEST_WEIGHT_SECONDS;
}

/**
 * Partition an ordered list of tests across `shard.total` shards using deterministic
 * Longest Processing Time (LPT) greedy load balancing, and return the tests for
 * `shard.index` (1-based) in their **original sequence order**.
 *
 * Key invariants:
 * 1. **Disjoint & complete partition**: Every test in `tests` is assigned to exactly one shard
 *    in `1..shard.total`.
 * 2. **Order preservation**: Within each shard, assigned tests are sorted back into their original
 *    index order from `tests`, preserving all sequence invariants (including server-before-client).
 * 3. **Companion co-location**: Linked bundle pairs (`CO_LOCATED_BUNDLE_PAIRS`, e.g.
 *    `realtime-session-guard` + `realtime-session-verification`) are always placed in the same shard.
 * 4. **Uniform fallback**: When all tests have equal weight, tie-breaking by bucket item count and
 *    bucket index produces exact round-robin (`i % total === index - 1`) assignment.
 */
export function AssignTestsToShard<T extends ShardableTest>(
    tests: readonly T[],
    shard: SuiteShardSpec
): T[] {
    const validated = ValidateShardSpec(shard);
    if (validated.total === 1 || tests.length === 0) {
        return [...tests];
    }

    interface IndexedItem {
        test: T;
        originalIndex: number;
        weight: number;
        bundles: string[];
        coLocateWithBundles: string[];
    }

    const indexed: IndexedItem[] = tests.map((test, originalIndex) => {
        const config = parseTestConfig(test.Configuration);
        const coLocateWithBundles = Array.isArray(config?.coLocateWithBundles)
            ? config.coLocateWithBundles.filter((b): b is string => typeof b === 'string' && b.length > 0)
            : [];
        return {
            test,
            originalIndex,
            weight: EstimateTestWeightSeconds(test),
            bundles: getSelectedBundles(config),
            coLocateWithBundles,
        };
    });

    // Identify co-located companion followers (from Configuration.coLocateWithBundles or CO_LOCATED_BUNDLE_PAIRS)
    const companionLeaderByFollowerIdx = new Map<number, number>();
    const companionFollowersByLeaderIdx = new Map<number, IndexedItem[]>();
    const linkedIndexPairs = new Set<string>();
    const linkCompanionIndices = (idxA: number, idxB: number): void => {
        if (idxA === -1 || idxB === -1 || idxA === idxB) {
            return;
        }
        const pairKey = idxA < idxB ? `${idxA}:${idxB}` : `${idxB}:${idxA}`;
        if (linkedIndexPairs.has(pairKey)) {
            return;
        }
        linkedIndexPairs.add(pairKey);
        const leaderIdx = indexed[idxB].weight >= indexed[idxA].weight ? idxB : idxA;
        const followerIdx = leaderIdx === idxB ? idxA : idxB;
        if (companionLeaderByFollowerIdx.has(followerIdx)) {
            return;
        }
        companionLeaderByFollowerIdx.set(followerIdx, leaderIdx);
        const list = companionFollowersByLeaderIdx.get(leaderIdx) ?? [];
        list.push(indexed[followerIdx]);
        companionFollowersByLeaderIdx.set(leaderIdx, list);
    };

    for (const item of indexed) {
        for (const companionBundle of item.coLocateWithBundles) {
            const companionIdx = indexed.findIndex(other => other.bundles.includes(companionBundle));
            linkCompanionIndices(item.originalIndex, companionIdx);
        }
    }
    for (const [bundleA, bundleB] of CO_LOCATED_BUNDLE_PAIRS) {
        const idxA = indexed.findIndex(item => item.bundles.includes(bundleA));
        const idxB = indexed.findIndex(item => item.bundles.includes(bundleB));
        linkCompanionIndices(idxA, idxB);
    }

    // Sort primary items by descending effective weight, tie-breaking by originalIndex ascending
    const primaryItems = indexed.filter(item => !companionLeaderByFollowerIdx.has(item.originalIndex));
    const sortedPrimary = [...primaryItems].sort((a, b) => {
        const followersA = companionFollowersByLeaderIdx.get(a.originalIndex) ?? [];
        const followersB = companionFollowersByLeaderIdx.get(b.originalIndex) ?? [];
        const weightA = a.weight + followersA.reduce((sum, f) => sum + f.weight, 0);
        const weightB = b.weight + followersB.reduce((sum, f) => sum + f.weight, 0);
        if (weightB !== weightA) {
            return weightB - weightA;
        }
        return a.originalIndex - b.originalIndex;
    });

    const buckets: Array<{ totalWeight: number; items: IndexedItem[] }> = Array.from(
        { length: validated.total },
        () => ({ totalWeight: 0, items: [] })
    );

    for (const item of sortedPrimary) {
        let bestBucketIdx = 0;
        for (let b = 1; b < validated.total; b++) {
            const candidate = buckets[b];
            const best = buckets[bestBucketIdx];
            if (
                candidate.totalWeight < best.totalWeight ||
                (candidate.totalWeight === best.totalWeight && candidate.items.length < best.items.length)
            ) {
                bestBucketIdx = b;
            }
        }
        const followers = companionFollowersByLeaderIdx.get(item.originalIndex) ?? [];
        buckets[bestBucketIdx].items.push(item, ...followers);
        buckets[bestBucketIdx].totalWeight +=
            item.weight + followers.reduce((sum, f) => sum + f.weight, 0);
    }

    const chosenBucket = buckets[validated.index - 1];
    return chosenBucket.items
        .sort((a, b) => a.originalIndex - b.originalIndex)
        .map(item => item.test);
}
