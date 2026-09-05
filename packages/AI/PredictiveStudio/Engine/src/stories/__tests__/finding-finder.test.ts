import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FindingFinder, EVIDENCE_STRENGTH } from '../finding-finder';

/**
 * The finder returns facts someone will CITE, so the filters that matter are the ones that stop a
 * citation saying more than the record supports:
 *
 *  - the evidence floor must narrow the READ, not the ranking — a caller asking for tested
 *    interventions and getting associations back has been actively misled;
 *  - superseded measurements are excluded by default, so "what do we know" does not return a 2024
 *    number beside its 2026 replacement;
 *  - a retracted finding is never an answer, even when the caller asks for history.
 */

const mockRunView = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: Object.assign(
      class {
        RunView = (...args: unknown[]) => mockRunView(...args);
      },
      { FromMetadataProvider: () => ({ RunView: (...args: unknown[]) => mockRunView(...args) }) },
    ),
  };
});

const ROWS = [
  {
    ID: 'f-committee',
    Name: 'Committee membership and Renewed',
    Statement: 'Committee membership is associated with higher Renewed.',
    EvidenceType: 'Predictive Contribution',
    Direction: 'Increases',
    Magnitude: 0.31,
    MagnitudeUnit: 'importance share',
    Confidence: 'High',
    MeasuredAt: '2026-09-03T00:00:00Z',
    PopulationSize: 2180,
    HoldoutMetric: 'auc',
    HoldoutMetricValue: 0.741,
    TargetVariable: 'Renewed',
    Status: 'Active',
    Story: 'Members on a committee renew more often.',
    StoryVector: '[1,0]',
  },
  {
    ID: 'f-tenure',
    Name: 'Tenure and Renewed',
    Statement: 'Tenure carries almost none of the explanation.',
    EvidenceType: 'Observed Association',
    Direction: 'None',
    Magnitude: 0.005,
    MagnitudeUnit: 'importance share',
    Confidence: 'Low',
    MeasuredAt: '2026-09-03T00:00:00Z',
    PopulationSize: 2180,
    HoldoutMetric: null,
    HoldoutMetricValue: null,
    TargetVariable: 'Renewed',
    Status: 'Active',
    Story: 'Length of membership does not predict renewal here.',
    StoryVector: '[0,1]',
  },
];

describe('FindingFinder', () => {
  // Braces matter: a concise arrow would RETURN the mock, and vitest calls a beforeEach's
  // return value as a teardown hook — invoking the mock with no arguments.
  beforeEach(() => {
    mockRunView.mockReset();
  });

  it('ranks by meaning and carries everything a citation needs', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });

    const result = await new FindingFinder().find({ QueryVector: [1, 0] });

    expect(result.CandidatesConsidered).toBe(2);
    expect(result.Matches[0].ID).toBe('f-committee');
    expect(result.Matches[0]).toMatchObject({
      EvidenceType: 'Predictive Contribution',
      Direction: 'Increases',
      Magnitude: 0.31,
      MagnitudeUnit: 'importance share',
      PopulationSize: 2180,
      HoldoutMetric: 'auc',
    });
  });

  it('applies the evidence floor to the READ, so a weaker finding is never ranked in', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: [ROWS[0]] });

    await new FindingFinder().find({ QueryVector: [1, 0], MinEvidence: 'Predictive Contribution' });

    const filter = mockRunView.mock.calls[0][0].ExtraFilter as string;
    expect(filter).toContain("EvidenceType IN ('Predictive Contribution','Tested Intervention')");
    expect(filter).not.toContain("'Observed Association'");
  });

  it('excludes superseded measurements by default and includes them on request', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });

    await new FindingFinder().find({ QueryVector: [1, 0] });
    expect(mockRunView.mock.calls[0][0].ExtraFilter).toContain("Status = 'Active'");

    mockRunView.mockClear();
    await new FindingFinder().find({ QueryVector: [1, 0], IncludeSuperseded: true });
    const historical = mockRunView.mock.calls[0][0].ExtraFilter as string;
    // History is offered, but a finding found to be WRONG is never an answer.
    expect(historical).toContain("Status <> 'Retracted'");
  });

  it('warns rather than silently dropping an unrecognized evidence floor', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });

    const result = await new FindingFinder().find({ QueryVector: [1, 0], MinEvidence: 'Proven' });

    expect(mockRunView.mock.calls[0][0].ExtraFilter).not.toContain('EvidenceType IN');
    expect(result.Warnings.join(' ')).toContain(EVIDENCE_STRENGTH.join(', '));
  });

  it('scopes to one outcome when asked, escaping the value', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });

    await new FindingFinder().find({ QueryVector: [1, 0], TargetVariable: "O'Brien" });

    expect(mockRunView.mock.calls[0][0].ExtraFilter).toContain("TargetVariable = 'O''Brien'");
  });

  it('skips a malformed vector instead of guessing at it', async () => {
    mockRunView.mockResolvedValue({
      Success: true,
      Results: [ROWS[0], { ...ROWS[1], ID: 'f-bad', StoryVector: '[1,"x"]' }],
    });

    const result = await new FindingFinder().find({ QueryVector: [1, 0] });

    expect(result.CandidatesConsidered).toBe(1);
    expect(result.Warnings.join(' ')).toContain('1 finding(s) had an unreadable story vector');
  });

  it('reports a failed read rather than an empty body of knowledge', async () => {
    mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'permission denied' });

    const result = await new FindingFinder().find({ QueryVector: [1, 0] });

    expect(result.Matches).toEqual([]);
    expect(result.Warnings.join(' ')).toContain('permission denied');
  });

  it('refuses an empty query vector', async () => {
    const result = await new FindingFinder().find({ QueryVector: [] });

    expect(mockRunView).not.toHaveBeenCalled();
    expect(result.Warnings[0]).toContain('No query vector');
  });
});
