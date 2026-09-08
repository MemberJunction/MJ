import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';
import { TelemetryManager, TelemetryParamsUnion, TelemetryRunViewsBatchParams, isBatchRunViewParams } from '../generic/telemetryManager';
import { CompositeKey } from '../generic/compositeKey';

/**
 * Wiring tests for the BATCH telemetry event `ProviderBase.PreRunViews` records — driven through
 * the real public `RunViews`/`RunView` pipeline, not hand-built StartEvent params (which is what
 * `telemetry.paginationFingerprint.test.ts` uses to pin the TelemetryManager contract). Covers:
 *   - per-view StartRows/AfterKeys threading (incl. CompositeKey serialization),
 *   - the exemption aggregation rule: a batch is Exempt only when EVERY view is exempt,
 *   - Entities index-parallelism: a view with no EntityName/ViewName/ViewID records '' rather
 *     than being dropped, so cursors stay paired with THEIR view,
 *   - the RunView -> RunViews([params]) delegation for AfterKey reads, end-to-end into the
 *     Duplicate analyzer (a keyset sweep is not flagged; a genuine repeat still is).
 */
class BatchTelemetryTestProvider extends TestMetadataProvider {
    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        return params.map(() => ({
            Success: true,
            Results: [] as T[],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));
    }
}

describe('ProviderBase batch telemetry threading (PreRunViews)', () => {
    let provider: BatchTelemetryTestProvider;

    beforeEach(async () => {
        provider = new BatchTelemetryTestProvider();
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        // Every call must execute and record its own telemetry event — no linger/coalesce reuse.
        ProviderBase.DedupLingerMs = 0;
        ProviderBase.CoalesceWindowMs = 0;
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
    });

    afterEach(() => {
        ProviderBase.DedupLingerMs = 5000;
        ProviderBase.CoalesceWindowMs = 10;
    });

    function lastBatchParams(): TelemetryRunViewsBatchParams | undefined {
        const events = TelemetryManager.Instance.GetEvents({ operation: 'ProviderBase.RunViews' });
        return events[events.length - 1]?.params as TelemetryRunViewsBatchParams | undefined;
    }

    it('threads per-view StartRows and AfterKeys, serializing AfterKey via ToConcatenatedString', async () => {
        const key = CompositeKey.FromID('aaa');
        await provider.RunViews([
            { EntityName: 'Test Entity 1', StartRow: 200 },
            { EntityName: 'Test Entity 1', OrderBy: 'ID', AfterKey: key },
        ]);

        const p = lastBatchParams();
        expect(p).toBeDefined();
        expect(p?.StartRows).toEqual([200, undefined]);
        expect(p?.AfterKeys).toEqual([undefined, key.ToConcatenatedString()]);
    });

    it('a mixed batch (one exempt view, one not) is NOT exempt — every view must opt out', async () => {
        await provider.RunViews([
            { EntityName: 'Test Entity 1', Telemetry: { Exempt: true, Reason: 'intentional re-read' } },
            { EntityName: 'Test Entity 1', ExtraFilter: 'ID IS NOT NULL' },
        ]);

        const p = lastBatchParams();
        expect(p?.Exempt).toBe(false);
        // The Reason still surfaces (first view that supplied one) even when the batch is analyzed.
        expect(p?.ExemptReason).toBe('intentional re-read');
    });

    it('an all-exempt batch IS exempt, with the first Reason threaded through', async () => {
        await provider.RunViews([
            { EntityName: 'Test Entity 1', Telemetry: { Exempt: true, Reason: 'first reason' } },
            { EntityName: 'Test Entity 1', ExtraFilter: 'ID IS NOT NULL', Telemetry: { Exempt: true } },
        ]);

        const p = lastBatchParams();
        expect(p?.Exempt).toBe(true);
        expect(p?.ExemptReason).toBe('first reason');
    });

    it('a batch with no Telemetry options at all is not exempt', async () => {
        await provider.RunViews([{ EntityName: 'Test Entity 1' }]);
        expect(lastBatchParams()?.Exempt).toBe(false);
    });

    it('records "" (not a dropped entry) for a view with no EntityName/ViewName/ViewID, keeping cursors paired', async () => {
        // A ViewEntity-only view has no name at telemetry time. StartEvent fires BEFORE
        // EntityStatusCheck resolves/rejects the param, so the recorded batch shape is asserted
        // via a spy even though this degenerate param later rejects the pipeline.
        const spy = vi.spyOn(TelemetryManager.Instance, 'StartEvent');
        const key = CompositeKey.FromID('bbb');
        await provider.RunViews([
            {},
            { EntityName: 'Test Entity 1', OrderBy: 'ID', AfterKey: key },
        ]).catch(() => undefined);

        const call = spy.mock.calls.find(c => c[1] === 'ProviderBase.RunViews');
        expect(call).toBeDefined();
        const p: TelemetryParamsUnion = call![2];
        if (!isBatchRunViewParams(p)) throw new Error('expected batch RunViews telemetry params');
        expect(p.Entities).toEqual(['', 'Test Entity 1']);
        // The named view's cursor must sit at ITS index — not shifted onto index 0.
        expect(p.AfterKeys).toEqual([undefined, key.ToConcatenatedString()]);
        spy.mockRestore();
    });

    it('RunView with AfterKey arrives as a size-1 batch; a keyset sweep is not flagged, a true repeat is', async () => {
        const tm = TelemetryManager.Instance;
        const page = (id: string) =>
            provider.RunView({ EntityName: 'Test Entity 1', OrderBy: 'ID', AfterKey: CompositeKey.FromID(id) });

        // Sweep: two consecutive pages with different cursors.
        await page('aaa');
        await page('bbb');

        const events = tm.GetEvents({ operation: 'ProviderBase.RunViews' });
        expect(events.length).toBe(2);
        expect((events[0].params as TelemetryRunViewsBatchParams).BatchSize).toBe(1);
        expect(tm.GetInsights().some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(false);

        // Control: the same page read again IS a genuine duplicate.
        await page('bbb');
        expect(tm.GetInsights().some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(true);
    });
});
