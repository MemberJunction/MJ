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
