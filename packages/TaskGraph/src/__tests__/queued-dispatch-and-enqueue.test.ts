import { afterEach, describe, expect, it } from 'vitest';
import {
    BoundedRunnerSemaphore,
    CompactCompletionBitmap,
    EffectiveIsolatedRunnerLimit,
    EffectivePublishConcurrency,
    ForEachEnqueueCoordinator,
    TaskGraphCallerNotificationService,
    TaskGraphQueueRegistry,
} from '../index';

describe('TaskGraph Slice 2 utilities: compact bitmap, bounded runner semaphore & early buffer', () => {
    afterEach(() => {
        ForEachEnqueueCoordinator.Instance.ResetState();
        TaskGraphCallerNotificationService.Instance.ResetInMemoryState();
        TaskGraphQueueRegistry.Instance.RegisterPublisher(null);
        BoundedRunnerSemaphore.Instance.ResetMetrics();
    });

    it('tracks 10,000 item completions in CompactCompletionBitmap (~2.5 KB hex) without double-counting', () => {
        const total = 10_000;
        const bmp = new CompactCompletionBitmap(total);
        for (let i = 0; i < total; i++) {
            expect(bmp.Mark(i)).toBe(true);
            // Duplicate attempt returns false -> never double-counted
            expect(bmp.Mark(i)).toBe(false);
        }
        const hex = bmp.ToHex();
        expect(hex.length).toBe(Math.ceil(total / 8) * 2);

        const restored = new CompactCompletionBitmap(total, hex);
        expect(restored.Has(0)).toBe(true);
        expect(restored.Has(9999)).toBe(true);
        expect(restored.Mark(42)).toBe(false);
    });

    it('enforces bounded concurrent isolated runner limit cleanly under 200 concurrent submissions', async () => {
        BoundedRunnerSemaphore.Instance.ResetMetrics();
        const limit = Math.min(4, EffectiveIsolatedRunnerLimit(4));
        let concurrent = 0;
        let maxObserved = 0;

        await Promise.all(
            Array.from({ length: 200 }, () =>
                BoundedRunnerSemaphore.Instance.RunBounded(limit, async () => {
                    concurrent++;
                    if (concurrent > maxObserved) maxObserved = concurrent;
                    await new Promise<void>((r) => setTimeout(r, 2));
                    concurrent--;
                }),
            ),
        );

        expect(maxObserved).toBeLessThanOrEqual(limit);
        expect(BoundedRunnerSemaphore.Instance.ActiveCount).toBe(0);
    });

    it('buffers and parses fan-out correlation keys & early completions cleanly', () => {
        const parsed = ForEachEnqueueCoordinator.Instance.ParseFanOutItemCorrelationKey('run-1:step-1:item:42');
        expect(parsed).toEqual({ BaseKey: 'run-1:step-1', ItemIndex: 42 });
        expect(ForEachEnqueueCoordinator.Instance.ParseFanOutItemCorrelationKey('plain-key')).toBeNull();

        ForEachEnqueueCoordinator.Instance.BufferEarlyCompletion({
            CorrelationKey: 'early-k',
            Status: 'Complete',
            Payload: { ok: true },
            ReceivedAt: new Date().toISOString(),
        });
        const entries = ForEachEnqueueCoordinator.Instance.ConsumeEarlyCompletions('early-k');
        expect(entries).toHaveLength(1);
        expect(entries[0].Payload).toEqual({ ok: true });
        expect(ForEachEnqueueCoordinator.Instance.ConsumeEarlyCompletions('early-k')).toHaveLength(0);
    });

    it('clamps publish concurrency cleanly against LimitsConfigResolver defaults', () => {
        const ceiling = EffectivePublishConcurrency(undefined);
        expect(ceiling).toBeGreaterThanOrEqual(1);
        expect(EffectivePublishConcurrency(999_999)).toBe(ceiling);
        expect(EffectivePublishConcurrency(2)).toBe(Math.min(2, ceiling));
    });
});
