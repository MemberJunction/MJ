/**
 * Precedence tests for the three `DiscoverFieldsViaFetch` discovery budgets.
 *
 * WHY THIS FILE EXISTS: `discoveryMaxRecords` was declared in the cfg type, documented as a
 * per-connection knob, accepted and persisted by `IntegrationSetSyncConfig`, returned by
 * `IntegrationGetSyncConfig`, and surfaced in MJCentral as a "Max records" field — but the
 * `Configuration` read was simply absent from the line that resolved it. An operator (and
 * MJCentral's own catalog-breadth scaling) set a value that nothing ever read.
 *
 * Nothing caught it because NO test asserted budget precedence for any of the three. So these
 * tests pin all three, not just the one that was broken: the omission is the kind of bug that
 * recurs on a sibling the next time a knob is added.
 *
 * Contract under test, for each budget:
 *     explicit opts > per-connection Configuration > operator env > default
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type {
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
    FetchContext,
    FetchBatchResult,
} from '../BaseIntegrationConnector.js';
import type { StreamDiscoveryOptions, PkPickOptions } from '../StreamingDiscovery.js';
import { PK_STAT_MIN_ROWS_FOR_SIGNIFICANCE } from '../StreamingDiscovery.js';

/** The three budgets as `DiscoverFieldsViaFetch` resolved them for a given call. */
type ResolvedBudgets = { BatchSize: number; MaxRecords: number; TimeBudgetMs: number | undefined };

/**
 * Captures the budgets at the two seams they cross rather than reaching into the method: batchSize
 * and maxRecords are arguments to the record stream, and the time budget is an option to the stream
 * consumer. Both are `protected`, so overriding them is the supported way to observe this.
 */
@RegisterClass(BaseIntegrationConnector, 'DiscoveryBudgetProbeConnector')
class DiscoveryBudgetProbeConnector extends BaseIntegrationConnector {
    public Captured: ResolvedBudgets | undefined;

    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'OK' }; }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> { return []; }
    public async DiscoverFields(): Promise<ExternalFieldSchema[]> { return []; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> { return { Records: [], HasMore: false }; }

    protected override async *DiscoverySampleRecordStream(
        _companyIntegration: MJCompanyIntegrationEntity,
        _objectName: string,
        _contextUser: UserInfo,
        batchSize: number,
        maxRecords: number,
    ): AsyncGenerator<Record<string, unknown>> {
        this.Captured = { BatchSize: batchSize, MaxRecords: maxRecords, TimeBudgetMs: this.Captured?.TimeBudgetMs };
        // Yield nothing: this pins WHICH budgets were resolved, not what sampling then does with them.
    }

    protected override async DiscoverFieldsViaStream(
        records: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
        opts?: { Discovery?: StreamDiscoveryOptions; Pk?: PkPickOptions; ReadOnly?: boolean },
    ): Promise<ExternalFieldSchema[]> {
        const timeBudgetMs = opts?.Discovery?.TimeBudgetMs;
        this.Captured = { ...(this.Captured ?? { BatchSize: -1, MaxRecords: -1 }), TimeBudgetMs: timeBudgetMs };
        // Drain so the stream override above runs and records its two arguments.
        for await (const _ of records) { /* no rows */ }
        this.Captured = { ...this.Captured, TimeBudgetMs: timeBudgetMs };
        return [];
    }
}

/**
 * `DiscoverFieldsViaFetch` touches exactly one property of the entity — `Configuration` — before
 * resolving budgets, and then only passes the entity through to the (overridden) stream. A literal
 * standing in for the generated entity keeps this test provider-free; the cast is narrowed to the
 * one field the code under test actually reads.
 */
function connectionWithConfiguration(configuration: string | null): MJCompanyIntegrationEntity {
    return { Configuration: configuration } as unknown as MJCompanyIntegrationEntity;
}

const NO_USER = {} as unknown as UserInfo;   // passed straight through to the overridden stream

/**
 * Engine defaults, asserted here so a silent change to one shows up as a test failure.
 *
 * MaxRecords is the per-table sample TARGET and is deliberately the classifier's significance floor,
 * not a round number: 50 rows fully answers two of the three questions sampling asks (significant
 * primary key, custom-discoverable columns) and only the third (largest observed string) benefits
 * from more — and that one has its own safety nets. Sourced from the constant rather than restated,
 * so the two cannot drift apart.
 */
const DEFAULTS = {
    BatchSize: 500,
    MaxRecords: PK_STAT_MIN_ROWS_FOR_SIGNIFICANCE,
    TimeBudgetMs: 5 * 60 * 1000,
} as const;

const ENV_KEYS = [
    'MJ_INTEGRATION_DISCOVERY_TIME_BUDGET_MS',
    'MJ_INTEGRATION_DISCOVERY_BATCH_SIZE',
    'MJ_INTEGRATION_DISCOVERY_MAX_RECORDS',
] as const;

describe('BaseIntegrationConnector.DiscoverFieldsViaFetch — discovery budget precedence', () => {
    const saved: Record<string, string | undefined> = {};
    let connector: DiscoveryBudgetProbeConnector;

    beforeEach(() => {
        for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
        connector = new DiscoveryBudgetProbeConnector();
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    /** Runs discovery and returns the budgets it resolved. */
    async function resolve(
        configuration: string | null,
        opts: { TimeBudgetMs?: number; BatchSize?: number; MaxRecords?: number } = {},
    ): Promise<ResolvedBudgets> {
        await connector.DiscoverFieldsViaFetch(connectionWithConfiguration(configuration), 'Contact', NO_USER, opts);
        return connector.Captured!;
    }

    it('falls back to the engine defaults when nothing is configured', async () => {
        expect(await resolve(null)).toEqual(DEFAULTS);
    });

    it('reads ALL THREE budgets from per-connection Configuration', async () => {
        // maxRecords is the one that was missing its read: before that fix it ignored Configuration entirely.
        const budgets = await resolve(JSON.stringify({
            discoveryTimeBudgetMs: 90_000,
            discoveryBatchSize: 25,
            discoveryMaxRecords: 40,
        }));
        expect(budgets).toEqual({ TimeBudgetMs: 90_000, BatchSize: 25, MaxRecords: 40 });
    });

    it('reads discoveryMaxRecords on its own — the sibling knobs are not what makes it work', async () => {
        // Guards the specific regression: a Configuration carrying ONLY maxRecords must still land.
        const budgets = await resolve(JSON.stringify({ discoveryMaxRecords: 40 }));
        expect(budgets.MaxRecords).toBe(40);
        expect(budgets.BatchSize).toBe(DEFAULTS.BatchSize);
        expect(budgets.TimeBudgetMs).toBe(DEFAULTS.TimeBudgetMs);
    });

    it('lets explicit opts win over Configuration', async () => {
        const budgets = await resolve(
            JSON.stringify({ discoveryTimeBudgetMs: 90_000, discoveryBatchSize: 25, discoveryMaxRecords: 40 }),
            { TimeBudgetMs: 1_000, BatchSize: 7, MaxRecords: 9 },
        );
        expect(budgets).toEqual({ TimeBudgetMs: 1_000, BatchSize: 7, MaxRecords: 9 });
    });

    it('falls through to env when Configuration does not set the knob', async () => {
        process.env.MJ_INTEGRATION_DISCOVERY_MAX_RECORDS = '77';
        process.env.MJ_INTEGRATION_DISCOVERY_BATCH_SIZE = '11';
        const budgets = await resolve(JSON.stringify({ discoveryTimeBudgetMs: 90_000 }));
        expect(budgets).toEqual({ TimeBudgetMs: 90_000, BatchSize: 11, MaxRecords: 77 });
    });

    it('prefers Configuration over env', async () => {
        process.env.MJ_INTEGRATION_DISCOVERY_MAX_RECORDS = '77';
        expect((await resolve(JSON.stringify({ discoveryMaxRecords: 40 }))).MaxRecords).toBe(40);
    });

    it('ignores non-positive and non-numeric Configuration values rather than honouring them', async () => {
        // A 0/negative cap would sample nothing and a string would poison the arithmetic; both must
        // fall through to the next source instead.
        const budgets = await resolve(JSON.stringify({ discoveryMaxRecords: 0, discoveryBatchSize: -5, discoveryTimeBudgetMs: 'soon' }));
        expect(budgets).toEqual(DEFAULTS);
    });

    it('survives malformed Configuration JSON', async () => {
        expect(await resolve('{ not json')).toEqual(DEFAULTS);
    });
});
