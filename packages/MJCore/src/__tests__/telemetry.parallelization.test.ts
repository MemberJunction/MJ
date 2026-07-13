import { describe, it, expect, beforeEach } from 'vitest';
import {
    TelemetryManager,
    TelemetryAnalyzer,
    TelemetryEvent,
    TelemetryAnalyzerContext,
    TelemetryRunViewParams,
    TelemetryRunViewsBatchParams
} from '../generic/telemetryManager';

/**
 * Regression coverage for the ParallelizationOpportunityAnalyzer false positive.
 *
 * The boot-time trace `batch, batch, MJ: AI Agent Sessions, batch` was flagged "Sequential Queries
 * Could Be Parallelized" — but those calls come from unrelated startup subsystems (engine config
 * loads = `batch`, the session janitor's keyset sweep = the lone single RunView), and the single one
 * is keyset-paginated (page N depends on page N-1) so it can't be a parallel batch at all.
 *
 * The analyzer now:
 *  - Guard 1 (all levels): only SINGLE RunViews are candidates — neither the trigger nor a neighbor
 *    may be an already-batched RunViews call.
 *  - Guard 2 (verbose+ best-effort): when stack traces exist, neighbors must share the trigger's call
 *    site, so temporally-adjacent calls from different subsystems aren't grouped.
 *
 * These tests drive the analyzer directly (via the public GetAnalyzers()) so event params, stack
 * traces, and timing are fully controlled.
 */
describe('TelemetryManager — ParallelizationOpportunityAnalyzer (false-positive guards)', () => {
    let analyzer: TelemetryAnalyzer;

    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
        const found = tm.GetAnalyzers().find(a => a.name === 'ParallelizationOpportunityAnalyzer');
        if (!found) throw new Error('ParallelizationOpportunityAnalyzer not registered');
        analyzer = found;
    });

    let nextId = 0;

    const singleEvent = (
        entity: string,
        startTime: number,
        endTime: number,
        stackTrace?: string
    ): TelemetryEvent<TelemetryRunViewParams> => ({
        id: `evt-${nextId++}`,
        category: 'RunView',
        operation: 'ProviderBase.RunView',
        fingerprint: `RunView:${entity}`,
        startTime,
        endTime,
        elapsedMs: endTime - startTime,
        params: { EntityName: entity, ResultType: 'entity_object' },
        stackTrace
    });

    const batchEvent = (
        entities: string[],
        startTime: number,
        endTime: number
    ): TelemetryEvent<TelemetryRunViewsBatchParams> => ({
        id: `evt-${nextId++}`,
        category: 'RunView',
        operation: 'ProviderBase.RunViews',
        fingerprint: `RunView:batch:${entities.join(',')}`,
        startTime,
        endTime,
        elapsedMs: endTime - startTime,
        params: { BatchSize: entities.length, Entities: entities }
    });

    const contextOf = (recentEvents: TelemetryEvent[]): TelemetryAnalyzerContext => ({
        recentEvents,
        patterns: new Map(),
        getEngineLoadedEntities: () => new Map()
    });

    it('does NOT flag the boot trace: a single keyset RunView surrounded by RunViews batches', () => {
        // batch(0-5), batch(6-11), single AI Agent Sessions(12-17), batch(18-23) — all within the window.
        const b1 = batchEvent(['MJ: AI Models', 'MJ: AI Prompts'], 0, 5);
        const b2 = batchEvent(['MJ: Queries', 'MJ: Dashboards'], 6, 11);
        const sessions = singleEvent('MJ: AI Agent Sessions', 12, 17);
        const b3 = batchEvent(['MJ: Integrations', 'MJ: Templates'], 18, 23);

        // Trigger on the single one (the batch events are skipped as triggers by Guard 1).
        const insight = analyzer.analyze(sessions, contextOf([b1, b2, sessions, b3]));
        expect(insight).toBeNull();
    });

    it('does NOT flag when the trigger event is itself a RunViews batch', () => {
        const s1 = singleEvent('Users', 0, 5);
        const s2 = singleEvent('Roles', 6, 11);
        const trigger = batchEvent(['Apps', 'Settings'], 12, 17);

        const insight = analyzer.analyze(trigger, contextOf([s1, s2, trigger]));
        expect(insight).toBeNull();
    });

    it('DOES flag 3 sequential single RunViews (standard level, no stack traces)', () => {
        const s1 = singleEvent('Users', 0, 5);
        const s2 = singleEvent('Roles', 6, 11);
        const trigger = singleEvent('Permissions', 12, 17);

        const insight = analyzer.analyze(trigger, contextOf([s1, s2, trigger]));
        expect(insight).not.toBeNull();
        expect(insight!.title).toBe('Sequential Queries Could Be Parallelized');
        expect(insight!.metadata!.entities).toEqual(['Users', 'Roles', 'Permissions']);
    });

    it('does NOT flag single RunViews from DIFFERENT call sites (verbose+)', () => {
        const s1 = singleEvent('Users', 0, 5, 'at OtherSubsystem.load (other.ts:10)');
        const s2 = singleEvent('Roles', 6, 11, 'at OtherSubsystem.load (other.ts:10)');
        const trigger = singleEvent('Permissions', 12, 17, 'at SomeService.fetch (svc.ts:42)');

        const insight = analyzer.analyze(trigger, contextOf([s1, s2, trigger]));
        expect(insight).toBeNull();
    });

    it('DOES flag single RunViews from the SAME call site (verbose+)', () => {
        const site = 'at SomeService.fetch (svc.ts:42)';
        const s1 = singleEvent('Users', 0, 5, site);
        const s2 = singleEvent('Roles', 6, 11, site);
        const trigger = singleEvent('Permissions', 12, 17, site);

        const insight = analyzer.analyze(trigger, contextOf([s1, s2, trigger]));
        expect(insight).not.toBeNull();
        expect(insight!.relatedEventIds).toHaveLength(3);
    });

    it('does NOT flag when fewer than 3 calls are in the sequential window', () => {
        const s1 = singleEvent('Users', 0, 5);
        const trigger = singleEvent('Roles', 6, 11);

        const insight = analyzer.analyze(trigger, contextOf([s1, trigger]));
        expect(insight).toBeNull();
    });

    it('does NOT flag single RunViews separated by more than the 100ms window', () => {
        const s1 = singleEvent('Users', 0, 5);
        const s2 = singleEvent('Roles', 6, 11);
        // Trigger starts 200ms after s2 ended — outside the window.
        const trigger = singleEvent('Permissions', 211, 216);

        const insight = analyzer.analyze(trigger, contextOf([s1, s2, trigger]));
        expect(insight).toBeNull();
    });
});
