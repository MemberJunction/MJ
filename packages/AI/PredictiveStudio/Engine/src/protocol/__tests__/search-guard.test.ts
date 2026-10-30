import { describe, it, expect } from 'vitest';
import { UUIDsEqual } from '@memberjunction/global';
import { EvaluationProtocolRules, type EvaluationProtocolDraft, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { ProtocolSearchGuard } from '../search-guard';
import type { IEvaluationProtocolStore, LoadedProtocol, StoredEvaluationProtocol } from '../../training/evaluation-protocol-store';

const unit: PredictionUnitSpec = {
  id: 'U1', lineageRootId: 'U1', version: 1, name: 'members',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'membership team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
};
const draft: EvaluationProtocolDraft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
  Unit: unit, Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null }, Candidates: 2, Seed: 42, Name: 'p',
});
const createdAt = new Date('2026-01-01T00:00:00Z');
const row: StoredEvaluationProtocol = {
  ...EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(draft, { ID: 'P1', LineageRootID: 'P1', Version: 1, AuthoredBy: { kind: 'human', userId: 'U' } }),
  __mj_CreatedAt: createdAt,
};

/** Serves one protocol row by ID (or none) and counts the reads. */
class FakeStore implements IEvaluationProtocolStore {
  public Reads = 0;
  constructor(private readonly stored: StoredEvaluationProtocol | null) {}
  public async Load(protocolId: string): Promise<StoredEvaluationProtocol | null> {
    this.Reads++;
    return this.stored !== null && UUIDsEqual(this.stored.ID, protocolId) ? this.stored : null;
  }
}

describe('ProtocolSearchGuard.RequireProtocolForSearch (no protocol, no search)', () => {
  it('refuses a search on a unit pipeline that has no Evaluation Protocol, without reading one', async () => {
    const store = new FakeStore(row);
    expect(await ProtocolSearchGuard.RequireProtocolForSearch(store, { ID: 'pipe-1', EvaluationProtocolID: null }, 1))
      .toEqual({ Ok: false, Refusal: { kind: 'protocol-required', pipelineId: 'pipe-1' } });
    expect(store.Reads).toBe(0);
  });
  it('refuses a search whose bound protocol row does not exist', async () => {
    expect(await ProtocolSearchGuard.RequireProtocolForSearch(new FakeStore(null), { ID: 'pipe-1', EvaluationProtocolID: 'P1' }, 1))
      .toEqual({ Ok: false, Refusal: { kind: 'protocol-required', pipelineId: 'pipe-1' } });
  });
  it('refuses more candidates than the protocol budget allows instead of silently running the first ones', async () => {
    expect(await ProtocolSearchGuard.RequireProtocolForSearch(new FakeStore(row), { ID: 'pipe-1', EvaluationProtocolID: 'P1' }, 3))
      .toEqual({ Ok: false, Refusal: { kind: 'too-many-candidates', pipelineId: 'pipe-1', candidates: 3, maxCandidates: 2 } });
  });
  it('returns the exact bound protocol version, with its row creation time, when the candidates fit', async () => {
    const r = await ProtocolSearchGuard.RequireProtocolForSearch(new FakeStore(row), { ID: 'pipe-1', EvaluationProtocolID: 'P1' }, 2);
    expect(r.Ok === false ? r.Refusal : [r.Loaded.RowID, r.Loaded.Version, r.Loaded.CreatedAt.toISOString(), r.Loaded.Protocol.primaryScore])
      .toEqual(['P1', 1, '2026-01-01T00:00:00.000Z', { family: 'binary', metric: 'log-loss' }]);
  });
  it('reads a creation time stored as text the same way', async () => {
    const asText = { ...row, __mj_CreatedAt: new Date('2026-01-01T00:00:00Z') };
    Object.defineProperty(asText, '__mj_CreatedAt', { value: '2026-01-01T00:00:00.000Z' });
    const r = await ProtocolSearchGuard.RequireProtocolForSearch(new FakeStore(asText), { ID: 'pipe-1', EvaluationProtocolID: 'P1' }, 1);
    expect(r.Ok === true ? r.Loaded.CreatedAt.getTime() : null).toBe(createdAt.getTime());
  });
  it('refuses a bound protocol row that does not parse as protocol-invalid', async () => {
    const broken: StoredEvaluationProtocol = { ...row, Holdout: '{"kind":"sideways"}' };
    await expect(ProtocolSearchGuard.RequireProtocolForSearch(new FakeStore(broken), { ID: 'pipe-1', EvaluationProtocolID: 'P1' }, 1))
      .rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-invalid', protocolId: 'P1' } } });
  });
});

describe('ProtocolSearchGuard.ProtocolPrecedesRun and CheckProtocolForUnit', () => {
  const loaded: LoadedProtocol = { RowID: 'P1', Version: 1, CreatedAt: createdAt, Protocol: { ...draft, id: 'P1', lineageRootId: 'P1', version: 1, authoredBy: { kind: 'human', userId: 'U' } } };
  it('accepts a protocol created before (or at) the run row and refuses one created after it', () => {
    const run = new Date('2026-05-01T10:00:00.000Z');
    expect(ProtocolSearchGuard.ProtocolPrecedesRun(new Date('2026-05-01T09:59:59.999Z'), run)).toBe(true);
    expect(ProtocolSearchGuard.ProtocolPrecedesRun(run, run)).toBe(true);
    expect(ProtocolSearchGuard.ProtocolPrecedesRun(new Date('2026-05-01T10:00:00.001Z'), run)).toBe(false);
  });
  it('turns unit-dependent protocol refusals into one stored refusal, and accepts a protocol that fits', () => {
    const count: PredictionUnitSpec = { ...unit, label: { ...unit.label, outcome: { kind: 'count' } } };
    expect(ProtocolSearchGuard.CheckProtocolForUnit(loaded, count)).toEqual({
      kind: 'protocol-unit-mismatch', protocolId: 'P1',
      problems: ['The primary score is a binary score but the Prediction Unit\'s task is count; candidates may only be ranked by a count score.'],
    });
    expect(ProtocolSearchGuard.CheckProtocolForUnit(loaded, unit)).toBeNull();
  });
  it('refuses inner folds grouped by a key other than the unit group key', () => {
    const grouped: LoadedProtocol = { ...loaded, Protocol: { ...loaded.Protocol, innerValidation: { kind: 'grouped-kfold', folds: 5, repeats: 1, groupKey: 'PersonID' } } };
    expect(ProtocolSearchGuard.CheckProtocolForUnit(grouped, unit)).toEqual({
      kind: 'protocol-unit-mismatch', protocolId: 'P1',
      problems: ['The protocol groups its inner validation by "PersonID", but the Prediction Unit has no group key (its rows are grouped by their entity key); the folds would not be grouped the way the protocol says.'],
    });
    expect(ProtocolSearchGuard.CheckProtocolForUnit(grouped, { ...unit, groupKey: 'personid' })).toBeNull();
  });
});
