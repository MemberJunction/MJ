import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryManager } from '../generic/telemetryManager';
import { Metadata } from '../generic/metadata';
import type { ProviderBase } from '../generic/providerBase';

/**
 * The DuplicateRunViewAnalyzer finding is valid for ANY entity (a real duplicate read is worth
 * knowing). But its default suggestion recommends caching — which is bad advice for an entity that
 * has explicitly disabled caching (`EntityInfo.AllowCaching = false`, e.g. MJ: Record Changes). For
 * those entities the manager keeps the finding but rewrites the suggestion to dedupe/consolidate.
 */
describe('TelemetryManager — cacheability-aware duplicate suggestion', () => {
    const DEDUPE_HINT = 'caching is not an option';
    const CACHE_HINT = 'use an engine';

    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);

        // Stub the global provider so isNonCacheableEntity can resolve AllowCaching.
        Metadata.Provider = {
            EntityByName: (name: string) => {
                if (name === 'MJ: Record Changes') return { AllowCaching: false };
                if (name === 'MJ: Users') return { AllowCaching: true };
                return undefined;
            },
        } as unknown as ProviderBase;
    });

    afterEach(() => {
        Metadata.Provider = null as unknown as ProviderBase;
    });

    function recordIdenticalPair(entity: string): void {
        const tm = TelemetryManager.Instance;
        for (let i = 0; i < 2; i++) {
            const id = tm.StartEvent('RunView', 'ProviderBase.RunView', {
                EntityName: entity,
                ExtraFilter: 'Status=1',
                ResultType: 'simple',
            });
            tm.EndEvent(id);
        }
    }

    function duplicateInsight(entity: string) {
        return TelemetryManager.Instance
            .GetInsights({ entityName: entity })
            .find(i => i.analyzerName === 'DuplicateRunViewAnalyzer');
    }

    it('still flags the duplicate for a non-cacheable entity (finding is not suppressed)', () => {
        recordIdenticalPair('MJ: Record Changes');
        expect(duplicateInsight('MJ: Record Changes')).toBeDefined();
    });

    it('rewrites the suggestion to dedupe (not "cache it") for a non-cacheable entity', () => {
        recordIdenticalPair('MJ: Record Changes');
        const insight = duplicateInsight('MJ: Record Changes');
        expect(insight?.suggestion).toContain(DEDUPE_HINT);
        expect(insight?.suggestion).not.toContain(CACHE_HINT);
    });

    it('keeps the cache suggestion for a cacheable entity', () => {
        recordIdenticalPair('MJ: Users');
        const insight = duplicateInsight('MJ: Users');
        expect(insight?.suggestion).toContain(CACHE_HINT);
    });
});
