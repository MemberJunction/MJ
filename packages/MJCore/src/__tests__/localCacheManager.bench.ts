/**
 * Performance benchmarks for LocalCacheManager's hot PURE paths — the cache-key /
 * fingerprint computations that run on EVERY RunView/RunQuery (fingerprint generation),
 * on every BaseEntity save/delete event fan-out (fingerprint classification), and on
 * every in-place cache maintenance pass (cheap PK keying) — plus the BaseEngine
 * params-builder → fingerprint pipeline that every engine Config() load goes through.
 *
 * ── Tier seed ────────────────────────────────────────────────────────────────────
 * This file ESTABLISHES the perf-bench tier; it does not yet enforce it. Baselines
 * and regression tolerances (e.g. "GenerateRunViewFingerprint must stay within X% of
 * the recorded baseline") are a FOLLOW-UP — once a few runs have produced stable
 * numbers on CI hardware, wire the recorded baselines + tolerance gates in. Until
 * then the benches are informational: run them locally before/after touching any of
 * the benched paths and compare hz by eye.
 *
 * ── Running ──────────────────────────────────────────────────────────────────────
 *   cd packages/MJCore
 *   npx vitest bench --run                                    # all bench files
 *   npx vitest bench --run src/__tests__/localCacheManager.bench.ts
 *
 * Bench files are deliberately OUTSIDE the unit-test tier: `pnpm test` runs vitest's
 * test include patterns (`src/**\/*.test.ts` — see vitest.shared.ts), which never
 * match `*.bench.ts`, and bench() cases only execute under `vitest bench`.
 *
 * ── What is (and isn't) benched ──────────────────────────────────────────────────
 * Only pure, synchronous, allocation-bounded paths — no storage provider, no
 * BaseEntity event bus, no async cache I/O. Input shapes mirror the unit tests:
 * localCacheManager.cheapKeyFuzz.test.ts (cheap-key corpus generation),
 * localCacheManager.viewFingerprint.test.ts / rlsFingerprint.test.ts (fingerprint
 * params), and baseEngine.fingerprintConsistency.test.ts (engine config → params).
 */
import { bench, describe } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { AggregateExpression, RunViewParams } from '../views/runView';
import { AggregateResult, IMetadataProvider } from '../generic/interfaces';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';

// ---------------------------------------------------------------------------------
// Private-access seam (same pattern as localCacheManager.cheapKeyFuzz.test.ts):
// the cheap-key builders, simpleHash, and the fingerprint classifiers are
// private/protected, but they are the hot inner loops — bench them directly.
// ---------------------------------------------------------------------------------
type Internal = {
    cheapRowKey: (row: Record<string, unknown>, pkFieldNames: string[]) => string;
    cheapKeyFromCompositeKey: (key: CompositeKey) => string;
    simpleHash: (str: string) => string;
    isFilteredFingerprint: (fingerprint: string) => boolean;
    isSubsetFingerprint: (fingerprint: string) => boolean;
    extractEntityFromFingerprint: (fingerprint: string) => string | null;
};
const asInternal = (cm: LocalCacheManager) => cm as unknown as Internal;

const cm = LocalCacheManager.Instance;
const internal = asInternal(cm);

// ---------------------------------------------------------------------------------
// Fixed inputs — built ONCE, outside the measured loops, so the benches measure the
// key/fingerprint computation itself rather than input construction.
// ---------------------------------------------------------------------------------

/** Minimal params — the most common fingerprint shape (unfiltered full-entity read). */
const minimalParams: RunViewParams = { EntityName: 'MJ: AI Agents' };

const aggregates: AggregateExpression[] = [
    { expression: 'COUNT(*)', alias: 'Total' },
    { expression: 'SUM(TokensUsed)', alias: 'Tokens' },
    { expression: 'MAX(__mj_UpdatedAt)', alias: 'Latest' },
];

/** Fully-loaded params — every optional fingerprint segment engaged at once. */
const loadedParams: RunViewParams = {
    EntityName: 'MJ: AI Agent Runs',
    ExtraFilter: "Status='Completed' AND AgentID='11111111-2222-3333-4444-555555555555'",
    OrderBy: '__mj_UpdatedAt DESC, ID ASC',
    MaxRows: 500,
    StartRow: 1000,
    UserSearchString: 'annual gala',
    IgnoreMaxRows: true,
    Aggregates: aggregates,
    AfterKey: CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')]),
    ViewID: 'view-1234',
};

const CONNECTION_PREFIX = 'mssql://db.example.com:1433/MJ_Prod';
const RLS_CLAUSE = "UserID='99999999-8888-7777-6666-555555555555' OR IsPublic=1";

/** Pre-computed fingerprints for the classification benches. */
const fpUnfiltered = cm.GenerateRunViewFingerprint(minimalParams);
const fpLoaded = cm.GenerateRunViewFingerprint(loadedParams, CONNECTION_PREFIX, RLS_CLAUSE);

const shortHashInput = RLS_CLAUSE;
const longHashInput = Array.from({ length: 64 }, (_, i) => `Field${i} = 'Value ${i}' AND `).join('') + '1=1';

const queryParameters: Record<string, unknown> = { status: 'active', minDate: '2026-01-01', limit: 250 };

// Deterministic composite-key corpus (same LCG approach as the cheap-key fuzz test —
// index-driven, never Math.random, so every run measures identical inputs).
function makeRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}
const KEY_VALUE_POOL = ['A', 'AB', 'A B', 'x,y', 'k:v', '42', 'üñîçødé', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'];
const KEY_FIELD_POOL = ['F1', 'F2', 'F3', 'F4'];

interface KeyCorpusEntry {
    row: Record<string, unknown>;
    fields: string[];
    key: CompositeKey;
}
function buildKeyCorpus(seed: number, n: number): KeyCorpusEntry[] {
    const rng = makeRng(seed);
    const out: KeyCorpusEntry[] = [];
    for (let i = 0; i < n; i++) {
        const fieldCount = 1 + Math.floor(rng() * 4); // 1..4 PK fields
        const fields = KEY_FIELD_POOL.slice(0, fieldCount);
        const row: Record<string, unknown> = {};
        const pairs: KeyValuePair[] = [];
        for (const f of fields) {
            const v = KEY_VALUE_POOL[Math.floor(rng() * KEY_VALUE_POOL.length)];
            row[f] = v;
            pairs.push(new KeyValuePair(f, v));
        }
        out.push({ row, fields, key: CompositeKey.FromKeyValuePairs(pairs) });
    }
    return out;
}
const keyCorpus = buildKeyCorpus(0xc0ffee, 256);

// Aggregate reorder inputs: a cached slot warmed in one order, requested in another.
const cachedAggResults: AggregateResult[] = [
    { expression: 'SUM(TokensUsed)', alias: 'Tokens', value: 123456 },
    { expression: 'COUNT(*)', alias: 'Total', value: 42 },
    { expression: 'MAX(__mj_UpdatedAt)', alias: 'Latest', value: '2026-08-01T00:00:00Z' },
];
const requestedAggOrder: AggregateExpression[] = [
    { expression: 'COUNT(*)', alias: 'Total' },
    { expression: 'MAX(__mj_UpdatedAt)', alias: 'Latest' },
    { expression: 'SUM(TokensUsed)', alias: 'Tokens' },
];

// ---------------------------------------------------------------------------------
// BaseEngine fingerprint pipeline — drivable purely (no Config() load, no provider):
// BuildRunViewParamsForConfig is a pure params projection, and
// GenerateRunViewFingerprint is a pure function of those params. Mirrors
// baseEngine.fingerprintConsistency.test.ts.
// ---------------------------------------------------------------------------------
class BenchEngine extends BaseEngine<BenchEngine> {
    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op — benches exercise params construction, not loading
    }
    public BuildParams(config: BaseEnginePropertyConfig, bypassCache: boolean = false): RunViewParams {
        return this.BuildRunViewParamsForConfig(config, bypassCache);
    }
}
const engine = new BenchEngine();
const engineConfig = new BaseEnginePropertyConfig({
    PropertyName: '_items',
    EntityName: 'MJ: AI Prompts',
    Filter: "Status='Active'",
    OrderBy: 'Name ASC',
});

// =================================================================================
// Benches
// =================================================================================

describe('GenerateRunViewFingerprint', () => {
    bench('minimal params (unfiltered entity read)', () => {
        cm.GenerateRunViewFingerprint(minimalParams);
    });

    bench('fully-loaded params (filter/orderBy/paging/aggregates/search/afterKey/view)', () => {
        cm.GenerateRunViewFingerprint(loadedParams);
    });

    bench('fully-loaded params + connection prefix + RLS clause hash', () => {
        cm.GenerateRunViewFingerprint(loadedParams, CONNECTION_PREFIX, RLS_CLAUSE);
    });
});

describe('GenerateRunQueryFingerprint', () => {
    bench('by name only', () => {
        cm.GenerateRunQueryFingerprint(undefined, 'GetActiveUsers');
    });

    bench('id + name + parameters + connection + category path', () => {
        cm.GenerateRunQueryFingerprint('q-1234', 'GetActiveUsers', queryParameters, CONNECTION_PREFIX, '/Admin/Users/');
    });
});

describe('simpleHash (djb2 — RLS/aggregate segment hashing)', () => {
    bench('short input (~60 chars, typical RLS clause)', () => {
        internal.simpleHash(shortHashInput);
    });

    bench('long input (~1.5KB, wide synthetic WHERE clause)', () => {
        internal.simpleHash(longHashInput);
    });
});

describe('cheap PK keying (per-row inner loop of Upsert/RemoveSingleEntity)', () => {
    bench('cheapRowKey — 256-row deterministic corpus, 1-4 PK fields', () => {
        for (const entry of keyCorpus) {
            internal.cheapRowKey(entry.row, entry.fields);
        }
    });

    bench('cheapKeyFromCompositeKey — same 256-key corpus', () => {
        for (const entry of keyCorpus) {
            internal.cheapKeyFromCompositeKey(entry.key);
        }
    });
});

describe('fingerprint classification (BaseEntity event fan-out, per cached slot)', () => {
    bench('isFilteredFingerprint — unfiltered base fingerprint', () => {
        internal.isFilteredFingerprint(fpUnfiltered);
    });

    bench('isFilteredFingerprint — fully-loaded fingerprint (all segments)', () => {
        internal.isFilteredFingerprint(fpLoaded);
    });

    bench('isSubsetFingerprint — fully-loaded fingerprint', () => {
        internal.isSubsetFingerprint(fpLoaded);
    });

    bench('extractEntityFromFingerprint', () => {
        internal.extractEntityFromFingerprint(fpLoaded);
    });
});

describe('ReorderAggregateResultsToRequest (cache-hit remap)', () => {
    bench('3 aggregates, cached order differs from requested order', () => {
        cm.ReorderAggregateResultsToRequest(cachedAggResults, requestedAggOrder);
    });
});

describe('BaseEngine fingerprint pipeline (per engine Config slot)', () => {
    bench('BuildRunViewParamsForConfig', () => {
        engine.BuildParams(engineConfig);
    });

    bench('BuildRunViewParamsForConfig → GenerateRunViewFingerprint (end-to-end)', () => {
        cm.GenerateRunViewFingerprint(engine.BuildParams(engineConfig));
    });
});
