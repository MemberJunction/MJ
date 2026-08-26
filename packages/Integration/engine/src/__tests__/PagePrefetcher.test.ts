/**
 * The prefetcher's whole job is latency hiding WITHOUT changing which records the loop sees.
 * The property that makes that true is the claim check: a page in flight is served only when it
 * is the page the loop actually wants. These pin that, and the failure modes around it.
 */
import { describe, it, expect, vi } from 'vitest';
import { PagePrefetcher, PrefetchEnabled } from '../PagePrefetcher.js';

const prefetcher = (enabled = true) => new PagePrefetcher<string>(enabled);

describe('PagePrefetcher', () => {
    it('serves the in-flight page when the cursor matches', async () => {
        const p = prefetcher();
        p.Start(true, 'cursor-2', () => Promise.resolve('page-2'));
        const claimed = p.Claim('cursor-2');
        expect(claimed).not.toBeNull();
        await expect(claimed!).resolves.toBe('page-2');
    });

    it('REFUSES the in-flight page when the cursor moved elsewhere', async () => {
        // The safety property. A gap skip or a reset moves the loop somewhere the prefetch did not
        // anticipate; serving that page would skip or duplicate records silently.
        const p = prefetcher();
        p.Start(true, 'cursor-2', () => Promise.resolve('page-2'));
        expect(p.Claim('cursor-9')).toBeNull();
    });

    it('does not retain a refused page for a later iteration to match by coincidence', () => {
        const p = prefetcher();
        p.Start(true, 'cursor-2', () => Promise.resolve('page-2'));
        expect(p.Claim('cursor-9')).toBeNull();
        // cursor-2 comes around later; the stale page must NOT be served.
        expect(p.Claim('cursor-2')).toBeNull();
    });

    it('treats a null cursor as the empty key, so the first page can be claimed', async () => {
        const p = prefetcher();
        p.Start(true, '', () => Promise.resolve('first'));
        // Start requires a truthy cursor, so an empty one never arms — the loop fetches normally.
        expect(p.Claim(null)).toBeNull();
    });

    it('never starts a page when the batch says there is no more', () => {
        const p = prefetcher();
        const start = vi.fn();
        p.Start(false, 'cursor-2', start);
        p.Start(undefined, 'cursor-2', start);
        expect(start).not.toHaveBeenCalled();
        expect(p.HasPageInFlight).toBe(false);
    });

    it('never starts a page for a connector that produced no cursor — that is the cursor-mode gate', () => {
        const p = prefetcher();
        const start = vi.fn();
        p.Start(true, null, start);
        p.Start(true, undefined, start);
        expect(start).not.toHaveBeenCalled();
    });

    it('starts the fetch IMMEDIATELY, which is the entire point', () => {
        const p = prefetcher();
        const start = vi.fn().mockResolvedValue('page-2');
        p.Start(true, 'cursor-2', start);
        // Not deferred until Claim — it must already be downloading while the caller works.
        expect(start).toHaveBeenCalledTimes(1);
        expect(p.HasPageInFlight).toBe(true);
    });

    it('absorbs an in-flight rejection, then rethrows it into the loop that claims it', async () => {
        // Two things at once: no unhandled rejection while it sits in flight, AND the error is not
        // swallowed — it surfaces where the loop's own error handling can see it.
        const p = prefetcher();
        p.Start(true, 'cursor-2', () => Promise.reject(new Error('vendor 500')));
        await new Promise(r => setTimeout(r, 0)); // a tick, where an unhandled rejection would fire
        const claimed = p.Claim('cursor-2');
        await expect(claimed!).rejects.toThrow('vendor 500');
    });

    it('Discard drops a page nobody will consume', () => {
        const p = prefetcher();
        p.Start(true, 'cursor-2', () => Promise.resolve('page-2'));
        p.Discard();
        expect(p.HasPageInFlight).toBe(false);
        expect(p.Claim('cursor-2')).toBeNull();
    });

    it('disabled: never starts, never serves — the loop is byte-for-byte what it was', () => {
        const p = prefetcher(false);
        const start = vi.fn();
        p.Start(true, 'cursor-2', start);
        expect(start).not.toHaveBeenCalled();
        expect(p.Claim('cursor-2')).toBeNull();
    });
});

describe('PrefetchEnabled', () => {
    it('is on by default and off only when explicitly disabled', () => {
        expect(PrefetchEnabled({} as NodeJS.ProcessEnv)).toBe(true);
        expect(PrefetchEnabled({ MJ_INTEGRATION_PREFETCH: 'off' } as unknown as NodeJS.ProcessEnv)).toBe(false);
        expect(PrefetchEnabled({ MJ_INTEGRATION_PREFETCH: 'OFF' } as unknown as NodeJS.ProcessEnv)).toBe(false);
        // Anything else means on — a typo must not silently disable a performance path.
        expect(PrefetchEnabled({ MJ_INTEGRATION_PREFETCH: 'yes' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    });
});
