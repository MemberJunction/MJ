import { describe, it, expect } from 'vitest';
import type { PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import { HarnessAgent } from '../agent';

describe('HarnessAgent.ReportMarkdownOf', () => {
  it("is the delivered payload's Markdown (what AgentStepResult.ReportMarkdown carries)", () => {
    const payload: Pick<PredictiveStudioBuilderPayload, 'Markdown'> = { Markdown: '# Model Development Results: PSTruth: G3.8\n' };
    expect(HarnessAgent.ReportMarkdownOf(payload)).toBe('# Model Development Results: PSTruth: G3.8\n');
  });

  it('is null when the run delivered no payload, no Markdown or an empty one', () => {
    expect(HarnessAgent.ReportMarkdownOf(undefined)).toBeNull();
    expect(HarnessAgent.ReportMarkdownOf({})).toBeNull();
    expect(HarnessAgent.ReportMarkdownOf({ Markdown: '' })).toBeNull();
  });
});
