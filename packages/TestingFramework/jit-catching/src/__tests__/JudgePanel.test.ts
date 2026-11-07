import { describe, it, expect } from 'vitest';
import { ctx } from './helpers/judgeFixtures';
import { BaseCatchJudge } from '../contracts/BaseCatchJudge';
import { JudgePanel } from '../judges/JudgePanel';
import { TpProbJudge } from '../judges/TpProbJudge';
import { BucketJudge } from '../judges/BucketJudge';
import { TestLLM, MakeFailedChatResult } from '@memberjunction/unit-testing';
import type { Bucket, JudgeScore } from '../types';

describe('JudgePanel', () => {
  const fake = (name: string, score: number, bucket: Bucket | null) => new (class extends BaseCatchJudge { get Name() { return name; } async Judge() { return { Judge: name, Model: name, Score: score, Bucket: bucket, Reason: name }; } })();
  it('takes the median of bucket scores and passes TP Prob through', async () => {
    const r = await new JudgePanel([fake('TpProb', 0.4, null), fake('a', 1, 'High'), fake('b', 0, 'Medium'), fake('c', -1, 'Low')]).Judge(ctx());
    expect(r.TPProb).toBe(0.4); expect(r.Median).toBe('Medium'); expect(r.Buckets.map((b) => b.Bucket)).toEqual(['High', 'Medium', 'Low']);
  });
  it('a judge that throws is recorded as Medium with the error as reason, and does not fail the panel', async () => {
    const bad = new (class extends BaseCatchJudge { get Name() { return 'bad'; } async Judge(): Promise<JudgeScore> { throw new Error('429'); } })();
    const r = await new JudgePanel([fake('a', 1, 'High'), bad]).Judge(ctx()); expect(r.Buckets.find((b) => b.Model === 'bad')?.Reason).toMatch(/429/);
  });
  it('a TP Prob judge that throws gives no TP Prob and adds no bucket', async () => {
    const bad = new (class extends BaseCatchJudge { get Name() { return 'TpProb'; } async Judge(): Promise<JudgeScore> { throw new Error('404'); } })();
    const r = await new JudgePanel([bad, fake('a', 1, 'High')]).Judge(ctx()); expect(r.TPProb).toBeNull(); expect(r.Buckets).toHaveLength(1);
  });
  it('a TP Prob judge whose provider fails gives a null TP Prob', async () => {
    const r = await new JudgePanel([new TpProbJudge(new TestLLM().Script({ kind: 'failResult', result: MakeFailedChatResult({ errorMessage: '404' }) }), 'm'), fake('a', 1, 'High')]).Judge(ctx());
    expect(r.TPProb).toBeNull();
  });
  it('a bucket judge that fails records its model name', async () => {
    const c = ctx(); (c.Analysis as { ChangedFiles: unknown }).ChangedFiles = undefined;
    const r = await new JudgePanel([new BucketJudge(new TestLLM(), 'claude-opus-5-5')]).Judge(c);
    expect(r.Buckets[0]).toMatchObject({ Model: 'claude-opus-5-5', Bucket: 'Medium' });
  });
  it('collects the token usage every judge reported, priced per model', async () => {
    const price = { Input: 1, Output: 4, CachedInput: 0.5 };
    const r = await new JudgePanel([new BucketJudge(new TestLLM().Script({ kind: 'succeed', content: '{"bucket":"High","reason":"x"}' }), 'b-model', price),
      new TpProbJudge(new TestLLM().Script({ kind: 'succeed', content: 'Yes' }), 'tp-model', null)]).Judge(ctx());
    expect(r.Usage).toEqual([
      { Model: 'b-model', InputTokens: 10, OutputTokens: 5, CacheReadTokens: 0, CostUSD: (10 * 1 + 5 * 4) / 1_000_000 },
      { Model: 'tp-model', InputTokens: 10, OutputTokens: 5, CacheReadTokens: 0, CostUSD: 0 }]);
  });
});
