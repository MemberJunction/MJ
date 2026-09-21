import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, EntityInfo } from '@memberjunction/core';
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

  it('never renders double periods on held messages whether heldReason has trailing period or not', () => {
    const heldWithoutPeriod: BuildPredictionResult = {
      ...held,
      heldReason: 'Accuracy too low to trust',
    };
    const msg1 = buildOutcomeMessage(summarizeBuildResult(heldWithoutPeriod));
    expect(msg1).not.toContain('..');
    expect(msg1).toContain('Accuracy too low to trust.');

    const heldWithPeriod: BuildPredictionResult = {
      ...held,
      heldReason: 'Accuracy too low to trust.',
    };
    const msg2 = buildOutcomeMessage(summarizeBuildResult(heldWithPeriod));
    expect(msg2).not.toContain('..');
    expect(msg2).toContain('Accuracy too low to trust.');

    const heldNullReason: BuildPredictionResult = {
      ...held,
      heldReason: null,
    };
    const msg3 = buildOutcomeMessage(summarizeBuildResult(heldNullReason));
    expect(msg3).not.toContain('..');
    expect(msg3).toContain('it needs review before it can be published.');
  });

  it('projects a result with warnings and surfaces them in the message', () => {
    const withWarnings: BuildPredictionResult = {
      ...published,
      warnings: [
        { FeatureName: 'JobTitleNorm', Kind: 'llm-derived', Reason: 'Requires upstream Feature Pipeline' },
      ],
    };
    const summary = summarizeBuildResult(withWarnings);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings?.[0].FeatureName).toBe('JobTitleNorm');
    expect(buildOutcomeMessage(summary)).toContain('Note: 1 candidate feature(s) could not be mapped to pipeline steps');
    expect(buildOutcomeMessage(summary)).toContain('JobTitleNorm: Requires upstream Feature Pipeline');
  });

  it('surfaces warnings even on a failed build outcome', () => {
    const failedWithWarnings: BuildPredictionResult = {
      ...failed,
      warnings: [
        { FeatureName: 'UnmappedCol', Kind: 'embedding', Reason: 'Dedicated vector step needed' },
      ],
    };
    const summary = summarizeBuildResult(failedWithWarnings);
    expect(summary.success).toBe(false);
    expect(summary.warnings).toHaveLength(1);
    const msg = buildOutcomeMessage(summary);
    expect(msg).toContain("I couldn't build the prediction: Algorithm not found.");
    expect(msg).toContain('Note: 1 candidate feature(s) could not be mapped to pipeline steps');
    expect(msg).toContain('UnmappedCol: Dedicated vector step needed');
  });
});

describe('parseFeatureImportance', () => {
  it('parses JSON string object of key/value weights', async () => {
    const { parseFeatureImportance } = await import('../pipeline-builder-agent');
    const res = parseFeatureImportance('{"DuesAmount": 0.45, "TenureMonths": 0.28}');
    expect(res).toEqual([
      { feature: 'DuesAmount', importance: 0.45 },
      { feature: 'TenureMonths', importance: 0.28 },
    ]);
  });

  it('parses array of feature/importance objects', async () => {
    const { parseFeatureImportance } = await import('../pipeline-builder-agent');
    const res = parseFeatureImportance([
      { feature: 'LeadTimeDays', importance: 0.62 },
      { feature: 'Tier', importance: 0.38 },
    ]);
    expect(res).toEqual([
      { feature: 'LeadTimeDays', importance: 0.62 },
      { feature: 'Tier', importance: 0.38 },
    ]);
  });

  it('handles null/undefined gracefully', async () => {
    const { parseFeatureImportance } = await import('../pipeline-builder-agent');
    expect(parseFeatureImportance(null)).toEqual([]);
    expect(parseFeatureImportance(undefined)).toEqual([]);
    expect(parseFeatureImportance('invalid json')).toEqual([]);
  });
});

describe('generateMarkdownReport', () => {
  it('formats a structured markdown report with metrics and features', async () => {
    const { generateMarkdownReport } = await import('../pipeline-builder-agent');
    const md = generateMarkdownReport(
      'Member Renewal Risk',
      'Predict renewal',
      'Status',
      'AUC',
      0.864,
      'Great',
      'Accurate and reliable.',
      true,
      [{ feature: 'DuesAmount', importance: 0.45 }]
    );
    expect(md).toContain('# Model Development Results: Member Renewal Risk');
    expect(md).toContain('**AUC** = **0.864**');
    expect(md).toContain('DuesAmount');
    expect(md).toContain('Published to Catalog');
  });
});

describe('resolveEntity', () => {
  it('resolves entity by name, baseView, baseTable, schema prefix, and stripped prefix', async () => {
    const { resolveEntity } = await import('../pipeline-builder');
    const fakeEntity = {
      ID: 'E1',
      Name: 'MJ: AI Prompt Runs',
      BaseView: 'vwAIPromptRuns',
      BaseTable: 'AIPromptRun',
      SchemaName: '__mj',
      Fields: [{ Name: 'ID' }, { Name: 'CompletedAt' }],
    } as unknown as EntityInfo;
    const fakeProvider = {
      EntityByName: (n: string) => (n.toLowerCase() === fakeEntity.Name.toLowerCase() ? fakeEntity : undefined),
      Entities: [fakeEntity],
    } as unknown as IMetadataProvider;

    // Direct name
    expect(resolveEntity('MJ: AI Prompt Runs', fakeProvider)?.ID).toBe('E1');
    // Base view
    expect(resolveEntity('vwAIPromptRuns', fakeProvider)?.ID).toBe('E1');
    // Base table
    expect(resolveEntity('AIPromptRun', fakeProvider)?.ID).toBe('E1');
    // Schema qualified view
    expect(resolveEntity('__mj.vwAIPromptRuns', fakeProvider)?.ID).toBe('E1');
    // Stripped prefix
    expect(resolveEntity('AI Prompt Runs', fakeProvider)?.ID).toBe('E1');
    // Unknown returns undefined
    expect(resolveEntity('NonExistentEntity', fakeProvider)).toBeUndefined();
  });
});


