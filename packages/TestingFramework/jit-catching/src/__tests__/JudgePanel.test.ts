import { describe, it, expect } from 'vitest';
import { ctx } from './helpers/judgeFixtures';
import { BaseCatchJudge } from '../contracts/BaseCatchJudge';
import { JudgePanel } from '../judges/JudgePanel';
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
});
