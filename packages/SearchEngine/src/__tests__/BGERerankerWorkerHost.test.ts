/**
 * Verifies BGEReRanker's worker_threads offload (`BGERerankerWorkerHost` + `HandleBGERerankerRequest`):
 * event-loop non-blocking under synchronous CPU work, concurrent call multiplexing, timeout
 * termination + worker recycling + fallback, crash circuit-breaker, and in-process env switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

import type { UserInfo } from '@memberjunction/core';
import type { SearchResultItem } from '../generic/search.types';
import { BGEReRanker } from '../rerankers/BGEReRanker';
import { BGE_RERANKER_IN_PROCESS_ENV, BGERerankerWorkerHost } from '../rerankers/BGERerankerWorkerHost';
import { HandleBGERerankerRequest } from '../rerankers/BGERerankerWorkerHandler';

const FAKE_WORKER = fileURLToPath(new URL('./fixtures/fake-bge-worker.mjs', import.meta.url));
const DIST_WORKER = fileURLToPath(new URL('../../dist/rerankers/BGERerankerWorker.js', import.meta.url));
const fakeUser = { ID: 'u1' } as unknown as UserInfo;

function makeItem(id: string, title: string, score: number): SearchResultItem {
    return {
        ID: id,
        EntityName: 'E',
        RecordID: id,
        SourceType: 'vector',
        ResultType: 'entity-record',
        Title: title,
        Snippet: '',
        Score: score,
        ScoreBreakdown: { Vector: score },
        Tags: [],
        MatchedAt: new Date(),
    };
}

describe('BGERerankerWorkerHost', () => {
    beforeEach(() => {
        delete process.env[BGE_RERANKER_IN_PROCESS_ENV];
        BGERerankerWorkerHost.Instance.UseScriptPath(FAKE_WORKER);
    });

    afterEach(async () => {
        await BGERerankerWorkerHost.Instance.Shutdown();
        BGERerankerWorkerHost.Instance.UseScriptPath(null);
        delete process.env[BGE_RERANKER_IN_PROCESS_ENV];
    });

    it('keeps the main Node.js event loop responsive while the worker thread blocks for 600ms', async () => {
        let worstLagMs = 0;
        let last = performance.now();
        const ticker = setInterval(() => {
            const now = performance.now();
            worstLagMs = Math.max(worstLagMs, now - last - 10);
            last = now;
        }, 10);

        try {
            const scores = await BGERerankerWorkerHost.Instance.Run({
                Kind: 'rerank',
                ModelId: 'Xenova/bge-reranker-base',
                Pairs: [['q', 'BLOCK:600']],
                BatchSize: 32,
            });
            expect(scores).toEqual([0.09]);
        } finally {
            clearInterval(ticker);
        }

        expect(worstLagMs).toBeLessThan(150);
    });

    it('multiplexes concurrent requests by ID on one reusable worker', async () => {
        const host = BGERerankerWorkerHost.Instance;
        const results = await Promise.all([
            host.Run({ Kind: 'rerank', ModelId: 'm', Pairs: [['q', 'aa']], BatchSize: 32 }),
            host.Run({ Kind: 'rerank', ModelId: 'm', Pairs: [['q', 'aaaaaa']], BatchSize: 32 }),
            host.Run({ Kind: 'rerank', ModelId: 'm', Pairs: [['q', 'aaaa']], BatchSize: 32 }),
        ]);
        expect(results).toEqual([[0.02], [0.06], [0.04]]);
    });

    it('rejects on timeout, terminates the stalled worker, and spawns a fresh worker on the next call', async () => {
        const host = BGERerankerWorkerHost.Instance;
        await expect(
            host.Run({ Kind: 'rerank', ModelId: 'm', Pairs: [['q', 'BLOCK:1500']], BatchSize: 32 }, 60),
        ).rejects.toThrow('BGE reranker worker timed out after 60ms');

        // Worker is still available and spawns a fresh thread cleanly
        expect(host.IsAvailable).toBe(true);
        const recovered = await host.Run({ Kind: 'rerank', ModelId: 'm', Pairs: [['q', 'hello']], BatchSize: 32 });
        expect(recovered).toEqual([0.05]);
    });

    it('disables itself after 3 worker crashes within 60s', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const host = BGERerankerWorkerHost.Instance;
            for (let i = 0; i < 3; i++) {
                await expect(
                    host.Run({ Kind: 'rerank', ModelId: 'm', Pairs: [['q', 'CRASH']], BatchSize: 32 }),
                ).rejects.toThrow(/BGE reranker worker stopped/);
            }
            expect(host.IsAvailable).toBe(false);
            expect(host.DisabledReason).toMatch(/^3 worker crashes in 60s/);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it(`respects ${BGE_RERANKER_IN_PROCESS_ENV}=true`, () => {
        process.env[BGE_RERANKER_IN_PROCESS_ENV] = 'true';
        expect(BGERerankerWorkerHost.Instance.IsAvailable).toBe(false);
    });

    it('routes BGEReRanker.ReRank through the worker host and falls back safely on worker timeout/error', async () => {
        const rr = new BGEReRanker();
        const ranked = await rr.ReRank('q', [makeItem('1', 'short', 0.5), makeItem('2', 'much longer doc', 0.2)], 2, fakeUser);
        expect(ranked.map((r) => r.RecordID)).toEqual(['2', '1']);
        expect(ranked[0].ScoreBreakdown.ReRank).toBeCloseTo(0.15);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const fallbackOnFail = await rr.ReRank('q', [makeItem('1', 'FAIL', 0.9), makeItem('2', 'ok', 0.1)], 1, fakeUser);
            expect(fallbackOnFail.map((r) => r.RecordID)).toEqual(['1']);

            const fallbackOnTimeout = await rr.ReRank(
                'q',
                [makeItem('1', 'BLOCK:1000', 0.9), makeItem('2', 'ok', 0.1)],
                2,
                fakeUser,
                { timeoutMs: 50 },
            );
            expect(fallbackOnTimeout.map((r) => r.RecordID)).toEqual(['1', '2']);
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('builds the compiled worker entrypoint at dist/rerankers/BGERerankerWorker.js', () => {
        expect(existsSync(DIST_WORKER)).toBe(true);
    });
});

describe('HandleBGERerankerRequest', () => {
    it('dispatches rerank and clear calls to runtime operations', async () => {
        const scorePairs = vi.fn().mockResolvedValue([0.8, 0.4]);
        const clear = vi.fn();
        const ops = { ScorePairs: scorePairs, Clear: clear };

        const rerankRes = await HandleBGERerankerRequest(
            { Kind: 'rerank', ModelId: 'Xenova/bge-reranker-base', Pairs: [['q', 'd1'], ['q', 'd2']], BatchSize: 16 },
            ops,
        );
        expect(rerankRes).toEqual({ Result: [0.8, 0.4] });
        expect(scorePairs).toHaveBeenCalledWith('Xenova/bge-reranker-base', undefined, [['q', 'd1'], ['q', 'd2']], 16);

        const clearRes = await HandleBGERerankerRequest({ Kind: 'clear' }, ops);
        expect(clearRes).toEqual({ Result: [] });
        expect(clear).toHaveBeenCalledOnce();
    });
});
