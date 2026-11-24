import { describe, it, expect } from 'vitest';
import { UserInfo, type RunViewResult } from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import { MonitoringFixture, type StoredMonitoringRow } from '../checks/ps-gates/ps-gate-monitoring';

/** M6.6 — the monitoring gates' row reader fails closed: a corrupt row or a failed read never reads as "nothing fired". */
const ROW: StoredMonitoringRow = {
  ID: 'E6000000-0000-4000-8000-000000000001', Period: new Date('2022-01-01T00:00:00.000Z'), State: 'evaluated', ErrorMessage: null, ScoredRows: 120, JoinedRows: 100,
  ExcludedInTrainingRows: 20, PrimaryValue: 0.4, PrimaryLower: 0.35, PrimaryUpper: 0.45, TrackedMetrics: null,
  TriggersFired: JSON.stringify([{ kind: 'outcome-degradation', reason: 'lower bound above the margin' }]), ChallengerRunID: null,
  ChallengerResult: JSON.stringify({ outcome: 'withheld', trainingRunId: 'run-1', recordId: 'R1', reason: 'no sign-off', mirror: null }),
  RollbackCheck: JSON.stringify({ kind: 'no-predecessor' }), Parity: JSON.stringify({ sampled: 10, maxAbsDifference: 0, passed: true, tolerance: 1e-9, resampled: false, trainingRunId: null, skipped: null }),
};

/** A database provider whose every view read fails, as an unreachable database answers. */
class FailingReads extends DatabaseProviderStub {
  public override async RunView<T>(): Promise<RunViewResult<T>> {
    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'the database is unreachable', UserViewRunID: '' };
  }
}

const USER = new UserInfo(null, { ID: 'E6000000-0000-4000-8000-0000000000F1', Email: 'gate@example.com', Type: 'User', IsActive: true, UserRoles: [] });

describe('MonitoringFixture.PeriodOf', () => {
  it('reads the stored row with its kinds typed', () => {
    const p = MonitoringFixture.PeriodOf(3, ROW);
    expect(p).toMatchObject({ Index: 3, Start: '2022-01-01', TriggersFired: ['outcome-degradation'], ChallengerOutcome: 'withheld', RollbackKind: 'no-predecessor', ParityPassed: true, ClosedWindowPredictions: 100 });
  });

  it('a TriggersFired that does not parse throws naming the row, never reads as nothing fired (M6-6)', () => {
    expect(() => MonitoringFixture.PeriodOf(3, { ...ROW, TriggersFired: '{not json' })).toThrow(`period row ${ROW.ID}'s TriggersFired does not parse`);
    expect(() => MonitoringFixture.PeriodOf(3, { ...ROW, TriggersFired: JSON.stringify([{ kind: 'input-drift', reason: 'x' }]) })).toThrow('TriggersFired does not parse');
  });

  it('a stored challenger outcome or rollback kind outside the contract throws (M6-22)', () => {
    expect(() => MonitoringFixture.PeriodOf(3, { ...ROW, ChallengerResult: JSON.stringify({ outcome: 'promoted' }) })).toThrow("ChallengerResult.outcome 'promoted' is not one of");
    expect(() => MonitoringFixture.PeriodOf(3, { ...ROW, RollbackCheck: JSON.stringify({ kind: 'reverted' }) })).toThrow("RollbackCheck.kind 'reverted' is not one of");
    expect(MonitoringFixture.PeriodOf(3, { ...ROW, ChallengerResult: null, RollbackCheck: null })).toMatchObject({ ChallengerOutcome: null, RollbackKind: null });
  });
});

describe('the monitoring gates\' reads fail closed (M6-7)', () => {
  const h = { Provider: new FailingReads(), User: USER };
  it('StatusOf, ChallengerModel, ReferenceUpper and PipelineOf throw on a failed read instead of answering null', async () => {
    await expect(MonitoringFixture.StatusOf(h, ROW.ID)).rejects.toThrow('the database is unreachable');
    await expect(MonitoringFixture.ChallengerModel(h, 'run-1')).rejects.toThrow('the database is unreachable');
    await expect(MonitoringFixture.ReferenceUpper(h, ROW.ID)).rejects.toThrow('the database is unreachable');
    await expect(MonitoringFixture.PipelineOf(h, ROW.ID)).rejects.toThrow('the database is unreachable');
  });
});
