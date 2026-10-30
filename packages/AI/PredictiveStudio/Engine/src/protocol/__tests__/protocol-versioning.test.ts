import { describe, it, expect } from 'vitest';
import { EvaluationProtocol, EvaluationProtocolRules, type Actor, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { EvaluationProtocolVersioning, type EvaluationProtocolVersionRow } from '../protocol-versioning';

/** An in-memory protocol row: the written columns, a counted Save() and its result. */
class MemoryProtocolRow implements EvaluationProtocolVersionRow {
  public ID = ''; public LineageRootID = ''; public Version = 0; public Name = ''; public Description: string | null = null;
  public Holdout = ''; public InnerValidation = ''; public Seed = 0; public HoldoutAccessBudget: 1 = 1; public PrimaryScore = '';
  public SecondaryMetrics = ''; public Baselines = ''; public Calibration = ''; public Resampling = ''; public Intervals = '';
  public Promotion = ''; public AllowedOutcomes = ''; public LeakageAudit = ''; public Exclusions = ''; public Slices = '';
  public PredictionIntervals: string | null = null; public ResidualDiagnostics: string | null = null; public RetrainTriggers = '';
  public SearchStrategy = ''; public Budgets = ''; public MinMinorityClassRows = 0; public GuardFieldsEditableBy: 'non-agent' | 'human-only' = 'non-agent';
  public AuthoredBy = '';
  public Saves = 0;
  public LatestResult: { readonly CompleteMessage: string } | null = null;
  constructor(private readonly failWith: string | null = null) {}
  public async Save(): Promise<boolean> {
    this.Saves++;
    if (this.failWith === null) return true;
    this.LatestResult = { CompleteMessage: this.failWith };
    return false;
  }
}

const user: Actor = { kind: 'human', userId: 'U' };
const agent: Actor = { kind: 'agent', agentRunId: 'A' };
const unit: PredictionUnitSpec = {
  id: 'U1', lineageRootId: 'U1', version: 1, name: 'members',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: user,
};
const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
  Unit: unit, Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null }, Candidates: 2, Seed: 0, Name: 'renewal',
});

async function savedV1(): Promise<MemoryProtocolRow> {
  const row = new MemoryProtocolRow();
  await EvaluationProtocolVersioning.WriteVersionRow(row, EvaluationProtocolVersioning.BuildV1Columns(draft, user), 'v1');
  return row;
}

describe('protocol version rows', () => {
  it('writes version 1 as its own lineage root with a client-supplied ID, and the row parses back to the draft', async () => {
    const v1 = await savedV1();
    expect(v1.Saves).toBe(1);
    expect(v1.Version).toBe(1);
    expect(v1.ID).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
    expect(v1.LineageRootID).toBe(v1.ID);
    expect(EvaluationProtocol.ParseEvaluationProtocolRow(v1)).toEqual({ Ok: true, Value: { ...draft, id: v1.ID, lineageRootId: v1.ID, version: 1, authoredBy: user } });
  });

  it('writes the next version under the same lineage with the changes applied and no client ID, as unit versions are written', async () => {
    const v1 = await savedV1();
    v1.Description = 'kept across versions';
    const next = EvaluationProtocolVersioning.BuildNextVersionColumns(v1, { seed: 7 }, agent);
    expect([next.ID, next.Version, next.LineageRootID, next.Seed, next.AuthoredBy, next.Description]).toEqual([null, 2, v1.ID, 7, JSON.stringify(agent), 'kept across versions']);
    const v2 = new MemoryProtocolRow();
    v2.ID = 'SERVER-ASSIGNED';
    await EvaluationProtocolVersioning.WriteVersionRow(v2, next, 'v2');
    expect([v2.ID, v2.Version, v2.LineageRootID, v2.Seed]).toEqual(['SERVER-ASSIGNED', 2, v1.ID, 7]);
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow({ ...next, ID: 'P2' });
    expect(parsed.Ok && EvaluationProtocolRules.DraftFromProtocolSpec(parsed.Value)).toEqual({ ...draft, seed: 7 });
  });

  it('refuses to start a next version from a row that does not parse', () => {
    const broken = new MemoryProtocolRow();
    expect(() => EvaluationProtocolVersioning.BuildNextVersionColumns(broken, { seed: 7 }, user)).toThrow(/does not parse/);
  });

  it('throws with the save message when the row is not saved', async () => {
    const row = new MemoryProtocolRow('Violation of CHECK constraint');
    await expect(EvaluationProtocolVersioning.WriteVersionRow(row, EvaluationProtocolVersioning.BuildV1Columns(draft, user), 'Evaluation Protocol "renewal" v1'))
      .rejects.toThrow('Saving Evaluation Protocol "renewal" v1 failed: Violation of CHECK constraint');
  });
});
