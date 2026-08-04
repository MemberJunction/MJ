import { describe, it, expect } from 'vitest';
import {
  PS_AGENT_CONTEXT_NAME_LIST_CAP,
  capPSNames,
  resolvePSRecord,
  buildPSNotFoundError,
  buildPredictionsAgentContext,
  buildStudioAgentContext,
  buildModelsAgentContext,
} from '../PredictiveStudio/predictive-studio-agent-context';

describe('capPSNames', () => {
  it('caps to PS_AGENT_CONTEXT_NAME_LIST_CAP without mutating the input', () => {
    const input = Array.from({ length: 40 }, (_, i) => `n${i}`);
    const out = capPSNames(input);
    expect(out).toHaveLength(PS_AGENT_CONTEXT_NAME_LIST_CAP);
    expect(input).toHaveLength(40); // untouched
    expect(out[0]).toBe('n0');
  });

  it('returns short lists unchanged', () => {
    expect(capPSNames(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('resolvePSRecord', () => {
  const cards = [
    { ID: 'AAA', Name: 'Renewal Risk' },
    { ID: 'BBB', Name: 'Lapse Likelihood' },
  ];

  it('matches by exact ID case-insensitively (UUID casing tolerance)', () => {
    expect(resolvePSRecord('aaa', cards)?.Name).toBe('Renewal Risk');
  });

  it('matches by exact name (trimmed, case-insensitive)', () => {
    expect(resolvePSRecord('  lapse likelihood ', cards)?.ID).toBe('BBB');
  });

  it('falls back to a contains match on the name — but only when unambiguous', () => {
    expect(resolvePSRecord('renewal', cards)?.ID).toBe('AAA');
  });

  it('returns null (never a silent first-match) when the needle matches several names', () => {
    const many = [...cards, { ID: 'CCC', Name: 'Renewal Amount' }];
    expect(resolvePSRecord('renewal', many)).toBeNull();
  });

  it('returns null on a miss or empty input', () => {
    expect(resolvePSRecord('nope', cards)).toBeNull();
    expect(resolvePSRecord('', cards)).toBeNull();
  });
});

describe('buildPSNotFoundError', () => {
  it('samples available names', () => {
    const msg = buildPSNotFoundError('xyz', [{ ID: '1', Name: 'Alpha' }, { ID: '2', Name: 'Beta' }], 'prediction');
    expect(msg).toContain('"xyz"');
    expect(msg).toContain('Alpha');
    expect(msg).toContain('Beta');
  });

  it('handles an empty candidate set', () => {
    expect(buildPSNotFoundError('x', [], 'section')).toContain('(none)');
  });

  it('becomes a "did you mean" listing exactly the contenders on an ambiguous partial match', () => {
    const many = [
      { ID: '1', Name: 'Renewal Risk' },
      { ID: '2', Name: 'Renewal Amount' },
      { ID: '3', Name: 'Lapse Likelihood' },
    ];
    const msg = buildPSNotFoundError('renewal', many, 'prediction');
    expect(msg).toContain('did you mean');
    expect(msg).toContain('Renewal Risk');
    expect(msg).toContain('Renewal Amount');
    expect(msg).not.toContain('Lapse Likelihood');
  });
});

describe('buildPredictionsAgentContext', () => {
  it('publishes catalog counts + bounded names, and omits workspace/at-risk fields in catalog view', () => {
    const ctx = buildPredictionsAgentContext({
      View: 'catalog',
      PredictionCount: 3,
      ReadyPredictionCount: 2,
      VisiblePredictionNames: ['A', 'B', 'C'],
      ChatOpen: false,
    });
    expect(ctx).toMatchObject({ View: 'catalog', PredictionCount: 3, ReadyPredictionCount: 2, ChatOpen: false });
    expect(ctx['VisiblePredictionNames']).toEqual(['A', 'B', 'C']);
    expect(ctx['SelectedPredictionName']).toBeUndefined();
    expect(ctx['AtRiskCount']).toBeUndefined();
  });

  it('surfaces a companion count when the visible name list is truncated', () => {
    const names = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const ctx = buildPredictionsAgentContext({ View: 'catalog', PredictionCount: 30, ReadyPredictionCount: 30, VisiblePredictionNames: names, ChatOpen: false });
    expect((ctx['VisiblePredictionNames'] as string[]).length).toBe(PS_AGENT_CONTEXT_NAME_LIST_CAP);
    expect(ctx['VisiblePredictionNameCount']).toBe(30);
  });

  it('publishes the selection + at-risk breakdown + drivers in workspace view once loaded', () => {
    const ctx = buildPredictionsAgentContext({
      View: 'workspace',
      PredictionCount: 1,
      ReadyPredictionCount: 1,
      VisiblePredictionNames: ['Renewal Risk'],
      ChatOpen: false,
      Selected: { Name: 'Renewal Risk', TrustGrade: 'Excellent', CanOpen: true },
      AtRiskLoaded: true,
      AtRiskCount: 10,
      HighRiskCount: 4,
      MediumRiskCount: 3,
      LowRiskCount: 3,
      Drivers: ['Overdue Invoices', 'Event Attendance'],
    });
    expect(ctx).toMatchObject({
      SelectedPredictionName: 'Renewal Risk',
      SelectedPredictionTrust: 'Excellent',
      SelectedPredictionCanAct: true,
      AtRiskCount: 10,
      HighRiskCount: 4,
    });
    expect(ctx['Drivers']).toEqual(['Overdue Invoices', 'Event Attendance']);
  });

  it('never fabricates at-risk counts before the list has loaded', () => {
    const ctx = buildPredictionsAgentContext({
      View: 'workspace',
      PredictionCount: 1,
      ReadyPredictionCount: 1,
      VisiblePredictionNames: ['Renewal Risk'],
      ChatOpen: false,
      Selected: { Name: 'Renewal Risk', TrustGrade: 'Good', CanOpen: true },
      AtRiskLoaded: false,
    });
    expect(ctx['SelectedPredictionName']).toBe('Renewal Risk');
    expect(ctx['AtRiskCount']).toBeUndefined();
    expect(ctx['HighRiskCount']).toBeUndefined();
  });
});

describe('buildStudioAgentContext', () => {
  it('publishes the active section, section labels, and workbench counts', () => {
    const ctx = buildStudioAgentContext({
      ActiveSection: 'pipelines',
      ActiveSectionLabel: 'Training Pipelines',
      SectionLabels: ['Overview', 'Training Pipelines', 'Algorithm Catalog'],
      PublishedModelCount: 2,
      RunningSessionCount: 1,
      PipelineCount: 5,
      AlgorithmCount: 7,
      ExperimentCount: 3,
      TrainingRunCount: 12,
      ChatOpen: true,
    });
    expect(ctx).toMatchObject({
      ActiveSection: 'pipelines',
      ActiveSectionLabel: 'Training Pipelines',
      PipelineCount: 5,
      AlgorithmCount: 7,
      ChatOpen: true,
    });
    expect(ctx['SectionLabels']).toEqual(['Overview', 'Training Pipelines', 'Algorithm Catalog']);
  });
});

describe('buildModelsAgentContext', () => {
  it('publishes the active section + lifecycle counts', () => {
    const ctx = buildModelsAgentContext({
      ActiveSection: 'production',
      ActiveSectionLabel: 'Models in Production',
      SectionLabels: ['Model Registry', 'Models in Production'],
      TotalModelCount: 6,
      PublishedModelCount: 3,
      DraftModelCount: 2,
      ProductionModelCount: 1,
    });
    expect(ctx).toMatchObject({
      ActiveSection: 'production',
      TotalModelCount: 6,
      PublishedModelCount: 3,
      DraftModelCount: 2,
      ProductionModelCount: 1,
    });
  });
});
