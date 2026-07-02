import { describe, it, expect } from 'vitest';
import { summarizeBuildResult, buildOutcomeMessage } from '../pipeline-builder-agent';
import type { BuildPredictionResult } from '../pipeline-builder';

/**
 * The code sub-agent's pure projection helpers — they turn the rich builder result into the compact,
 * payload-safe outcome + the plain user-facing sentence the agent narrates. The agent's executeAgentInternal
 * glue is verified end-to-end by the in-process agent integration test; here we pin the projection + copy.
 */
const published: BuildPredictionResult = {
  success: true, pipelineId: 'p1', modelId: 'm1', published: true, leakageFlagged: false, heldReason: null, errorMessage: null,
  trust: { grade: 'Good', score01: 0.56, oneLiner: 'Right about 8 out of 10 times.', explanation: '', canAct: true, gateReason: null, headlineMetric: { key: 'AUC', value: 0.78 }, unknown: false },
};
const held: BuildPredictionResult = {
  success: true, pipelineId: 'p2', modelId: 'm2', published: false, leakageFlagged: false, errorMessage: null,
  heldReason: 'This prediction is about as accurate as guessing, so it isn\'t safe to act on yet.',
  trust: { grade: 'Poor', score01: 0, oneLiner: 'About as accurate as guessing — not reliable.', explanation: '', canAct: false, gateReason: 'x', headlineMetric: { key: 'AUC', value: 0.51 }, unknown: false },
};
const failed: BuildPredictionResult = { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage: 'Algorithm not found' };

describe('summarizeBuildResult', () => {
  it('projects a published result', () => {
    expect(summarizeBuildResult(published)).toMatchObject({ success: true, pipelineId: 'p1', modelId: 'm1', trustGrade: 'Good', published: true, heldReason: null, errorMessage: null });
  });
  it('projects a HELD result, carrying the plain reason (the safety gate)', () => {
    const o = summarizeBuildResult(held);
    expect(o.published).toBe(false);
    expect(o.trustGrade).toBe('Poor');
    expect(o.heldReason).toMatch(/guessing/i);
  });
  it('projects a failed build', () => {
    expect(summarizeBuildResult(failed)).toMatchObject({ success: false, published: false, errorMessage: 'Algorithm not found' });
  });
});

describe('buildOutcomeMessage', () => {
  it('describes published / held / failed in plain language', () => {
    expect(buildOutcomeMessage(summarizeBuildResult(published))).toMatch(/built and published/i);
    expect(buildOutcomeMessage(summarizeBuildResult(held))).toMatch(/holding it back/i);
    expect(buildOutcomeMessage(summarizeBuildResult(failed))).toMatch(/couldn't build/i);
  });
});
