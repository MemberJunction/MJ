import { describe, it, expect } from 'vitest';
import { TestLLM } from '@memberjunction/unit-testing';
import { scripted, ctx } from './helpers/judgeFixtures';
import { TpProbJudge } from '../judges/TpProbJudge';
import { JUDGE_ERROR_PREFIX } from '../judges/SafeChat';

describe('TpProbJudge', () => {
  const logprobs = (yes: number, no: number) => ({ content: [{ token: 'Yes', logprob: Math.log(yes), bytes: null, top_logprobs: [{ token: 'Yes', logprob: Math.log(yes), bytes: null }, { token: 'No', logprob: Math.log(no), bytes: null }] }], refusal: null });
  it('maps P(yes) − P(no) into [−1, 1]', async () => {
    const j = new TpProbJudge(scripted({ content: 'Yes', logprobs: logprobs(0.8, 0.15) }), 'gpt-4.1-mini');
    const s = await j.Judge(ctx()); expect(s.Score).toBeCloseTo(0.65, 2); expect(s.Bucket).toBeNull(); expect(s.Judge).toBe('TpProb');
  });
  it('matches " yes" / "NO" variants and returns 0 with a reason when no logprobs come back', async () => {
    expect((await new TpProbJudge(scripted({ content: 'no', logprobs: { content: [{ token: ' no', logprob: Math.log(0.9), bytes: null, top_logprobs: [{ token: ' no', logprob: Math.log(0.9), bytes: null }] }], refusal: null } }), 'm').Judge(ctx())).Score).toBeCloseTo(-0.9, 2);
    const s = await new TpProbJudge(scripted({ content: 'Yes' }), 'm').Judge(ctx()); expect(s.Score).toBe(0); expect(s.Reason).toMatch(/logprobs/);
  });
  it('records a thrown provider error and a success: false result the same way', async () => {
    for (const outcome of [{ kind: 'throw' as const, error: new Error('404 model not found') }, { kind: 'fail' as const, error: new Error('404 model not found') }]) {
      const s = await new TpProbJudge(new TestLLM().Script(outcome), 'm').Judge(ctx());
      expect(s).toMatchObject({ Score: 0, Bucket: null }); expect(s.Reason).toMatch(/^error: provider error/);
    }
  });
  it('asks for exactly one output token with logprobs', async () => { const llm = scripted({ content: 'Yes' }); await new TpProbJudge(llm, 'm').Judge(ctx()); expect(llm.Calls[0]).toMatchObject({ includeLogProbs: true, topLogProbs: 5, maxOutputTokens: 1 }); });
  it('does not count "Not" as "no"', async () => {
    const lp = { content: [{ token: 'Yes', logprob: Math.log(0.6), bytes: null, top_logprobs: [{ token: 'Yes', logprob: Math.log(0.6), bytes: null }, { token: 'Not', logprob: Math.log(0.3), bytes: null }] }], refusal: null };
    expect((await new TpProbJudge(scripted({ content: 'Yes', logprobs: lp }), 'm').Judge(ctx())).Score).toBeCloseTo(0.6, 2);
  });
  it('starts the reason with the error prefix when no logprobs come back', async () => {
    expect((await new TpProbJudge(scripted({ content: 'Yes' }), 'm').Judge(ctx())).Reason.startsWith(JUDGE_ERROR_PREFIX)).toBe(true);
  });
});
