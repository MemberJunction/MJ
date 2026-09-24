/**
 * The base discovery sampler hands its deadline to the connector so the connector can bound its
 * own internal fan-out — but a connector that ignores the marker (every connector predating it)
 * keeps returning HasMore=true, and until now nothing above it enforced the budget at all: one
 * page short of the sample target, the loop would ask forever. The between-pages deadline stop is
 * the sampler's own guarantee. These tests drive the real generator with a scripted FetchChanges.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type { FetchContext, FetchResult } from '../types.js';

class ScriptedConnector extends BaseIntegrationConnector {
    public contexts: FetchContext[] = [];
    constructor(private script: Array<Pick<FetchResult, 'Records' | 'HasMore'> & { NextOffset?: number }>,
                private onPage?: (page: number) => void) { super(); }
    public override async FetchChanges(ctx: FetchContext): Promise<FetchResult> {
        this.contexts.push(ctx);
        this.onPage?.(this.contexts.length);
        const step = this.script[Math.min(this.contexts.length - 1, this.script.length - 1)];
        return { Records: step.Records, HasMore: step.HasMore, NextOffset: step.NextOffset } as FetchResult;
    }
    // Abstracts irrelevant to the sampler:
    public override async TestConnection(): Promise<never> { throw new Error('unused'); }
    public override async DiscoverObjects(): Promise<never> { throw new Error('unused'); }
    public override async DiscoverFields(): Promise<never> { throw new Error('unused'); }

    public Sample(maxRecords: number, deadlineMs?: number) {
        return this.DiscoverySampleRecordStream(
            { IntegrationID: 'int-1' } as never, 'contacts', { ID: 'u1' } as never, 50, maxRecords, deadlineMs,
        );
    }
}

const record = (i: number) => ({ ID: `r${i}`, Fields: { id: `r${i}` } }) as never;

async function drain(gen: AsyncGenerator<Record<string, unknown>>): Promise<number> {
    let n = 0;
    for await (const _ of gen) n++;
    return n;
}

afterEach(() => vi.restoreAllMocks());

describe('DiscoverySampleRecordStream deadline', () => {
    it('stops between pages once the deadline passes, keeping what it collected', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // Every page says HasMore=true — a connector that ignores the discovery marker.
        const connector = new ScriptedConnector(
            [{ Records: [record(1), record(2)], HasMore: true, NextOffset: 2 }],
        );
        const yielded = await drain(connector.Sample(1000, Date.now() - 1));
        expect(yielded).toBe(2);
        expect(connector.contexts).toHaveLength(1);
    });

    it('runs to the sample target when the deadline is far away', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const connector = new ScriptedConnector(
            [{ Records: [record(1), record(2)], HasMore: true, NextOffset: 2 }],
        );
        const yielded = await drain(connector.Sample(5, Date.now() + 60_000));
        expect(yielded).toBe(5);
        expect(connector.contexts.length).toBeGreaterThan(1);
    });

    it('still hands the connector the discovery markers on every page', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const deadline = Date.now() + 60_000;
        const connector = new ScriptedConnector([{ Records: [record(1)], HasMore: false }]);
        await drain(connector.Sample(10, deadline));
        expect(connector.contexts[0].IsDiscoverySample).toBe(true);
        expect(connector.contexts[0].SampleTargetRecords).toBe(10);
        expect(connector.contexts[0].DeadlineMs).toBe(deadline);
    });

    it('behaves exactly as before when no deadline is supplied — legacy callers unchanged', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const connector = new ScriptedConnector(
            [{ Records: [record(1)], HasMore: true, NextOffset: 1 }],
        );
        const yielded = await drain(connector.Sample(3));
        expect(yielded).toBe(3);
    });
});
