import { describe, it, expect } from 'vitest';
import { makeJudgeCacheKey, JudgeVerdictCache } from '../engine/judge-cache.js';
import { JudgeVerdict } from '../types/judge.js';

const UUID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const UUID_B = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('makeJudgeCacheKey', () => {
    it('is stable for the same goal/url/state', () => {
        expect(makeJudgeCacheKey('g1', 'http://x/app/data', 's1')).toBe(makeJudgeCacheKey('g1', 'http://x/app/data', 's1'));
    });

    it('normalizes the URL (per-record UUIDs key the same)', () => {
        const a = makeJudgeCacheKey('g1', `http://x/r/${UUID_A}`, 's1');
        const b = makeJudgeCacheKey('g1', `http://x/r/${UUID_B}`, 's1');
        expect(a).toBe(b);
    });

    it('differs when the state hash differs', () => {
        expect(makeJudgeCacheKey('g1', 'http://x', 's1')).not.toBe(makeJudgeCacheKey('g1', 'http://x', 's2'));
    });
});

describe('JudgeVerdictCache', () => {
    it('stores and retrieves verdicts by key', () => {
        const cache = new JudgeVerdictCache();
        const v = Object.assign(new JudgeVerdict(), { Impossible: true, Reason: 'no permission' });
        const key = makeJudgeCacheKey('g', 'http://x', 's');

        expect(cache.has(key)).toBe(false);
        cache.set(key, v);
        expect(cache.has(key)).toBe(true);
        expect(cache.get(key)).toBe(v);
        expect(cache.size).toBe(1);
    });

    it('clears', () => {
        const cache = new JudgeVerdictCache();
        cache.set(makeJudgeCacheKey('g', 'http://x', 's'), new JudgeVerdict());
        cache.clear();
        expect(cache.size).toBe(0);
    });
});
