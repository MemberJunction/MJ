import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager } from '../generic/telemetryManager';

/**
 * Pagination sweeps read the same entity+filter+orderBy page after page, differing ONLY in the
 * cursor (keyset `AfterKey` or offset `StartRow`). The single-RunView telemetry fingerprint now
 * includes those cursors, so consecutive pages are DISTINCT fingerprints and are not falsely
 * reported as a Duplicate RunView. (Regression for the "MJ: Entities called 2 times" vectorize log.)
 */
describe('TelemetryManager — pagination cursor in the RunView fingerprint', () => {
    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
    });

    function recordPage(entity: string, opts: { afterKey?: string; startRow?: number }): void {
        const tm = TelemetryManager.Instance;
        const id = tm.StartEvent('RunView', 'ProviderBase.RunView', {
            EntityName: entity,
            OrderBy: 'ID',
            ResultType: 'simple',
            MaxRows: 200,
            AfterKey: opts.afterKey,
            StartRow: opts.startRow,
        });
        tm.EndEvent(id);
    }

    it('does NOT flag consecutive keyset pages (different AfterKey) as duplicate', () => {
        recordPage('MJ: Entities', { afterKey: undefined });        // page 1
        recordPage('MJ: Entities', { afterKey: 'ID|aaa' });          // page 2
        recordPage('MJ: Entities', { afterKey: 'ID|bbb' });          // page 3

        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Entities' });
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(false);
    });

    it('does NOT flag consecutive offset pages (different StartRow) as duplicate', () => {
        recordPage('MJ: Entities', { startRow: 0 });
        recordPage('MJ: Entities', { startRow: 200 });

        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Entities' });
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(false);
    });

    it('still flags a genuinely identical repeat (same cursor) as duplicate', () => {
        recordPage('MJ: Entities', { afterKey: 'ID|aaa' });
        recordPage('MJ: Entities', { afterKey: 'ID|aaa' });

        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Entities' });
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(true);
    });
});

/**
 * The single-RunView fingerprint alone does NOT protect a paginated sweep, because
 * `ProviderBase.RunView` delegates to `RunViews([params])` whenever `BypassCache` or `AfterKey`
 * is set (and unconditionally on the client). Every page of a keyset sweep therefore arrives as
 * a size-1 BATCH event, and the batch fingerprint must carry the cursor too — otherwise all the
 * pages collapse onto one fingerprint. (Regression for the "Entity Vector Sync - Daily"
 * `MJ: Actions / MJ: Entities / MJ: AI Models / MJ: AI Prompts / MJ: AI Agents called 2 times`
 * warnings, where the vectorize sweep pages each entity 20 rows at a time via AfterKey.)
 */
describe('TelemetryManager — pagination cursor in the BATCH RunViews fingerprint', () => {
    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
    });

    /** Mirrors ProviderBase.PreRunViews for a size-1 batch, the shape a keyset sweep produces. */
    function recordBatchPage(entity: string, opts: { afterKey?: string; startRow?: number }): void {
        const tm = TelemetryManager.Instance;
        const id = tm.StartEvent('RunView', 'ProviderBase.RunViews', {
            BatchSize: 1,
            Entities: [entity],
            Filters: [undefined],
            OrderBys: ['ID'],
            StartRows: [opts.startRow],
            AfterKeys: [opts.afterKey],
        });
        tm.EndEvent(id);
    }

    it('does NOT flag consecutive keyset pages of a size-1 batch as duplicate', () => {
        recordBatchPage('MJ: Actions', { startRow: 0 });      // page 1 (offset form, no cursor yet)
        recordBatchPage('MJ: Actions', { afterKey: 'ID|aaa' }); // page 2
        recordBatchPage('MJ: Actions', { afterKey: 'ID|bbb' }); // page 3

        const insights = TelemetryManager.Instance.GetInsights();
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(false);
    });

    it('does NOT flag consecutive offset pages of a multi-view batch as duplicate', () => {
        const tm = TelemetryManager.Instance;
        for (const startRow of [0, 200, 400]) {
            const id = tm.StartEvent('RunView', 'ProviderBase.RunViews', {
                BatchSize: 2,
                Entities: ['MJ: Entities', 'MJ: AI Models'],
                Filters: [undefined, undefined],
                OrderBys: ['ID', 'ID'],
                StartRows: [startRow, startRow],
                AfterKeys: [undefined, undefined],
            });
            tm.EndEvent(id);
        }

        expect(tm.GetInsights().some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(false);
    });

    it('still flags a genuinely identical batch (same cursor) as duplicate', () => {
        recordBatchPage('MJ: AI Prompts', { afterKey: 'ID|aaa' });
        recordBatchPage('MJ: AI Prompts', { afterKey: 'ID|aaa' });

        const insights = TelemetryManager.Instance.GetInsights();
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(true);
    });

    it('treats StartRow 0 and an omitted StartRow as the same page', () => {
        recordBatchPage('MJ: AI Agents', { startRow: 0 });
        recordBatchPage('MJ: AI Agents', {});

        const insights = TelemetryManager.Instance.GetInsights();
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(true);
    });
});

/**
 * `RunViewParams.Telemetry.Exempt` marks an intentional repeat so it produces no warning. It was
 * threaded through the DEPRECATED batch path but not the live one — so exemption was silently
 * ineffective for every batch RunView, and (because RunView delegates to RunViews whenever
 * BypassCache or AfterKey is set) for those single reads too. A caller who correctly marked their
 * repeat got warned anyway, with nothing indicating their exemption had been dropped.
 */
describe('TelemetryManager — exemption on the BATCH RunViews path', () => {
    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
    });

    /** Records the same batch read twice — the shape that trips the Duplicate analyzer. */
    function recordIdenticalBatchTwice(exempt: boolean, reason?: string): void {
        const tm = TelemetryManager.Instance;
        for (let i = 0; i < 2; i++) {
            const id = tm.StartEvent('RunView', 'ProviderBase.RunViews', {
                BatchSize: 1,
                Entities: ['MJ: Actions'],
                Filters: [undefined],
                OrderBys: [undefined],
                StartRows: [undefined],
                AfterKeys: [undefined],
                Exempt: exempt,
                ExemptReason: reason,
            });
            tm.EndEvent(id);
        }
    }

    it('still flags an identical repeat when NOT exempt — the control', () => {
        // Asserted FIRST and deliberately: without it, the suppression test below passes even if
        // batch insights were broken entirely, which is exactly how a vacuous test looks.
        recordIdenticalBatchTwice(false);
        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Actions' });
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(true);
    });

    it('suppresses the duplicate warning when the batch is exempt', () => {
        recordIdenticalBatchTwice(true, 'intentional re-read after direct SQL');
        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Actions' });
        expect(insights.some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(false);
    });
});
