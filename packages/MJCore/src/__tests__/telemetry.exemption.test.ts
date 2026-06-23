import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TelemetryManager } from '../generic/telemetryManager';

/**
 * Coverage for RunView telemetry exemption (`RunViewParams.Telemetry.Exempt`, threaded into the
 * telemetry event params as `Exempt`). An exempted query must:
 *   1. produce no optimization/redundancy insight itself, and
 *   2. not count toward those analyzers for OTHER queries (excluded from the analyzer context).
 *
 * Driven end-to-end through StartEvent/EndEvent so the manager's runAnalyzers / buildAnalyzerContext
 * exemption paths are exercised (not just an analyzer in isolation).
 */
describe('TelemetryManager — RunView exemption (Telemetry.Exempt)', () => {
    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true); // level defaults to 'standard' → params (incl. Exempt) are stored
    });

    function recordRunView(entity: string, filter: string, exempt?: boolean): void {
        const tm = TelemetryManager.Instance;
        const id = tm.StartEvent('RunView', 'ProviderBase.RunView', {
            EntityName: entity,
            ExtraFilter: filter,
            ResultType: 'simple',
            Exempt: exempt,
        });
        tm.EndEvent(id);
    }

    it('flags 3 distinct non-exempt queries of the same entity (baseline)', () => {
        recordRunView('MJ: Scheduled Jobs', 'Status=1');
        recordRunView('MJ: Scheduled Jobs', 'Status=2');
        recordRunView('MJ: Scheduled Jobs', 'Status=3');

        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Scheduled Jobs' });
        expect(insights.some(i => i.analyzerName === 'SameEntityMultipleCallsAnalyzer')).toBe(true);
    });

    it('does NOT flag the same queries when each is exempt', () => {
        recordRunView('MJ: Scheduled Jobs', 'Status=1', true);
        recordRunView('MJ: Scheduled Jobs', 'Status=2', true);
        recordRunView('MJ: Scheduled Jobs', 'Status=3', true);

        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Scheduled Jobs' });
        expect(insights.length).toBe(0);
    });

    it('exempt queries do not count toward a later non-exempt query', () => {
        // 2 exempt reads + 1 normal read of the same entity → only 1 analyzable (non-exempt)
        // fingerprint, below the >=3 distinct-filter threshold, so nothing is flagged.
        recordRunView('MJ: Scheduled Jobs', 'Status=1', true);
        recordRunView('MJ: Scheduled Jobs', 'Status=2', true);
        recordRunView('MJ: Scheduled Jobs', 'Status=3', false);

        const insights = TelemetryManager.Instance.GetInsights({ entityName: 'MJ: Scheduled Jobs' });
        expect(insights.length).toBe(0);
    });

    it('flags an identical repeated query as Duplicate (baseline) but not when exempt', () => {
        const tm = TelemetryManager.Instance;

        // Baseline: same entity + same filter twice → DuplicateRunViewAnalyzer (count >= 2).
        recordRunView('MJ: AI Agent Runs', 'Status=1');
        recordRunView('MJ: AI Agent Runs', 'Status=1');
        expect(
            tm.GetInsights({ entityName: 'MJ: AI Agent Runs' }).some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')
        ).toBe(true);

        tm.Reset();
        tm.SetEnabled(true);

        // Exempt: identical pair does not form a duplicate pattern (updatePattern skips it).
        recordRunView('MJ: AI Agent Runs', 'Status=1', true);
        recordRunView('MJ: AI Agent Runs', 'Status=1', true);
        expect(tm.GetInsights({ entityName: 'MJ: AI Agent Runs' }).length).toBe(0);
    });

    it('honors exemption on a RunViews batch (all-views-exempt batch produces no insight)', () => {
        const tm = TelemetryManager.Instance;
        const recordBatch = (entities: string[], exempt?: boolean) => {
            const id = tm.StartEvent('RunView', 'ProviderBase.RunViews', {
                BatchSize: entities.length,
                Entities: entities,
                Filters: entities.map(() => 'Status=1'),
                Exempt: exempt,
            });
            tm.EndEvent(id);
        };

        // Baseline: two identical batches → duplicate.
        recordBatch(['MJ: Actions', 'MJ: Action Params']);
        recordBatch(['MJ: Actions', 'MJ: Action Params']);
        expect(tm.GetInsights().some(i => i.analyzerName === 'DuplicateRunViewAnalyzer')).toBe(true);

        tm.Reset();
        tm.SetEnabled(true);

        // Exempt batch repeated → nothing flagged.
        recordBatch(['MJ: Actions', 'MJ: Action Params'], true);
        recordBatch(['MJ: Actions', 'MJ: Action Params'], true);
        expect(tm.GetInsights().length).toBe(0);
    });

    describe('verbose breadcrumb', () => {
        let logSpy: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            TelemetryManager.Instance.UpdateSettings({ level: 'verbose' });
            logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        });
        afterEach(() => logSpy.mockRestore());

        it('emits a verbose breadcrumb carrying the exemption Reason', () => {
            const tm = TelemetryManager.Instance;
            const id = tm.StartEvent('RunView', 'ProviderBase.RunView', {
                EntityName: 'MJ: Scheduled Jobs',
                ExtraFilter: 'LockToken IS NULL',
                ResultType: 'simple',
                Exempt: true,
                ExemptReason: 'live lock-state read',
            });
            tm.EndEvent(id);

            const line = logSpy.mock.calls.map(c => String(c[0])).find(s => s.includes('exempt'));
            expect(line).toBeDefined();
            expect(line).toContain('MJ: Scheduled Jobs');
            expect(line).toContain('live lock-state read');
        });
    });
});
