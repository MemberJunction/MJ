/**
 * A4 attacks 6, 7 (the Action half) and 10 (the Engine half) — **Profile Prediction Target** (§5.1.5, D5-32): the
 * read-only profile of a draft unit's development rows. It reads the rows through `AgentReadScope` (so 0 holdout rows),
 * applies the fixed small-data refusal before any compute, sends the development arrays to the sidecar's `/profile`
 * otherwise, applies the no-usable-signal verdict to the GLM's improvement, marks leak suspects, records the compute
 * cost, and writes no row: no `MJ: ML Training Snapshots`, `MJ: ML Training Runs` or `MJ: ML Evaluation Protocols`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunActionParams, type ActionParam, type ActionResultSimple } from '@memberjunction/actions-base';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import type { HoldoutSplit, ModelingPlanSpec, ProfileRequest, ProfileResponse, ProfileResult, UnitDraft } from '@memberjunction/predictive-studio-core';

import { ProfilePredictionTargetAction, type ProfileTargetDeps } from '../profile-prediction-target.action';
import { DraftPredictionUnitAction } from '../draft-prediction-unit.action';
import { AgentReadScope, type AgentRowSet } from '../../agent/agent-read-scope';
import { ProtocolDefaults } from '../../protocol/protocol-defaults';
import type { UnitRow } from '../../prediction-unit/unit-row-reader';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';

const YEARS = new EntityInfo({
  ID: '6A1D2E3F-0000-4000-8000-0000000A4501', Name: 'Years', SchemaName: 'pstest', BaseTable: 'Years', BaseView: 'vwYears',
  Fields: [
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4511', Name: 'ID', Type: 'nvarchar', Length: 50, IsPrimaryKey: true, Sequence: 1 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4512', Name: 'PersonID', Type: 'nvarchar', Length: 50, Sequence: 2 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4513', Name: 'StartDate', Type: 'date', Sequence: 3 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4514', Name: 'EventsAttended', Type: 'int', Sequence: 4 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4515', Name: 'Region', Type: 'nvarchar', Length: 50, Sequence: 5 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4516', Name: 'Renewed', Type: 'bit', Sequence: 6 },
  ],
});
const USER = new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000A4521', Name: 'tester', Type: 'Owner' });
const NOW = new Date('2026-11-27T00:00:00Z');
const PROPOSAL: NonNullable<ModelingPlanSpec['TargetDefinition']['Unit']> = {
  DecisionDateColumn: 'StartDate', DecisionDateOffsetDays: 334, LabelWindowDays: 31, LabelGapDays: 0,
  Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'Years', field: 'StartDate' } },
  TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
};

const scopeDeps = () => ({ DataAccess: new TableDataAccess(UnitYearsWorld.Tables()), Metadata: UnitYearsWorld.Metadata(), Now: NOW });

async function yearsUnit(): Promise<UnitDraft> {
  const out = await DraftPredictionUnitAction.Draft(
    { EntityName: 'Years', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC', Unit: PROPOSAL },
    { Provider: new EntitiesOnlyProvider([YEARS], USER), ReadDevelopmentRows: (d) => AgentReadScope.DevelopmentRowsWith(d, scopeDeps()) },
  );
  if (out.Kind !== 'draft') throw new Error(`the years unit does not draft: ${JSON.stringify(out.Refusal)}`);
  return out.Draft;
}

const HOLDOUT: HoldoutSplit = { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-12-01', holdoutEnd: null, newEntityReport: null };

/** `n` development rows, `minority` of them labelled '1', with a numeric, a categorical and an identifier column. */
function rows(n: number, minority: number): AgentRowSet {
  const list: UnitRow[] = [];
  for (let i = 0; i < n; i++) {
    const label = i < minority ? '1' : '0';
    list.push({
      RowID: `r${i}`, EntityKey: `e${i}`, DecisionDate: NOW, WindowEnd: NOW, GroupKey: `e${i}`, Period: null, Label: label,
      Source: { ID: `e${i}`, EventsAttended: i % 7, Region: i % 2 === 0 ? 'EU' : 'US', Renewed: label === '1', StartDate: NOW, MemberNumber: `M-${i}`, Missing: null },
    });
  }
  return { Status: 'read', Rows: list, HoldoutRowsRead: 0, HoldoutRowsExcluded: Math.round(n / 4), Holdout: HOLDOUT };
}

function mwi(value: number, lower: number, upper: number, n: number) {
  return { metric: 'log-loss' as const, value, interval: { level: 0.95, lower, upper }, n };
}

function deps(read: AgentRowSet, answer: (req: ProfileRequest) => ProfileResponse): ProfileTargetDeps & { readonly Calls: ProfileRequest[] } {
  const calls: ProfileRequest[] = [];
  return {
    Calls: calls,
    ReadDevelopmentRows: async () => read,
    Profile: async (req) => { calls.push(req); return answer(req); },
  };
}

const SIGNAL: (req: ProfileRequest) => ProfileResponse = (req) => ({
  fields: Object.keys(req.features).map((name) => ({ name, improvement: name === 'Renewed' ? mwi(0.4, 0.38, 0.42, req.labels.length) : mwi(0.002, -0.01, 0.015, req.labels.length), nearUnique: name === 'MemberNumber' })),
  glmVsDummy: mwi(0.05, 0.03, 0.07, req.labels.length),
  computeSeconds: 2.5,
});

afterEach(() => vi.restoreAllMocks());

describe('A4 attack 6: the profile on a draft unit reads 0 holdout rows (AgentReadScope)', () => {
  it('on the years world the profile reads exactly the scope\'s development rows: HoldoutRowsRead = 0, the holdout rows counted, none read', async () => {
    const unit = await yearsUnit();
    const scope = await AgentReadScope.DevelopmentRowsWith(unit, scopeDeps());
    expect(scope.Status).toBe('read');
    if (scope.Status !== 'read') return;
    const d = deps(scope, SIGNAL);
    const out = await ProfilePredictionTargetAction.Profile(unit, ['EventsAttended', 'Region'], d);
    expect(out.Kind).toBe('profiled');
    if (out.Kind !== 'profiled') return;
    expect(out.Result.holdoutRowsRead).toBe(0);
    expect(out.Result.resolvedRows).toBe(scope.Rows.length);
    expect(out.Result.holdoutRowsExcluded).toBe(scope.HoldoutRowsExcluded);
    expect(scope.HoldoutRowsExcluded).toBeGreaterThan(0);
  });

  it('the arrays sent to /profile are the development rows\' values only, aligned with their labels', async () => {
    const read = rows(300, 90);
    const d = deps(read, SIGNAL);
    const out = await ProfilePredictionTargetAction.Profile(await yearsUnit(), ['EventsAttended', 'Region', 'Missing'], d);
    expect(out.Kind).toBe('profiled');
    expect(d.Calls).toHaveLength(1);
    const req = d.Calls[0];
    expect(req.labels).toHaveLength(300);
    expect(req.features['EventsAttended']).toEqual(read.Status === 'read' ? read.Rows.map((r) => r.Source['EventsAttended']) : []);
    expect(req.features['Region']?.slice(0, 2)).toEqual(['EU', 'US']);
    expect(req.features['Missing']?.every((v) => v === null)).toBe(true);
    expect(req.labels.filter((l) => l === '1')).toHaveLength(90);
    expect(req.folds).toBe(ProfilePredictionTargetAction.FOLDS);
    expect(req.seed).toBe(ProtocolDefaults.DEFAULT_SEED);
  });

  it('a read the scope refused → refused, no sidecar call, HoldoutRowsRead = 0', async () => {
    const d = deps({ Status: 'refused', Reason: 'no rows', HoldoutRowsRead: 0 }, SIGNAL);
    const out = await ProfilePredictionTargetAction.Profile(await yearsUnit(), ['EventsAttended'], d);
    expect(out).toEqual({ Kind: 'refused', Reason: 'no rows', HoldoutRowsRead: 0 });
    expect(d.Calls).toHaveLength(0);
  });
});

describe('A4 attack 7 (the Action half): W7 s42\'s counts end the profile with the fixed small-data refusal, before any compute', () => {
  it('301 resolved rows with 24 in the minority class → verdict small-data with the counts, no sidecar call', async () => {
    const d = deps(rows(301, 24), SIGNAL);
    const out = await ProfilePredictionTargetAction.Profile(await yearsUnit(), ['EventsAttended'], d);
    expect(out.Kind).toBe('profiled');
    if (out.Kind !== 'profiled') return;
    expect(out.Result.verdict).toEqual({ kind: 'small-data', resolvedRows: 301, minorityRows: 24, minResolved: 200, minMinority: 50 });
    expect(out.Result.classCounts).toEqual({ '0': 277, '1': 24 });
    expect(d.Calls).toHaveLength(0);
    expect(out.Result.computeSeconds).toBe(0);
  });

  it('enough rows and a GLM interval that includes 0 → verdict no-usable-signal', async () => {
    const d = deps(rows(400, 120), (req) => ({ ...SIGNAL(req), glmVsDummy: mwi(0.004, -0.01, 0.02, req.labels.length) }));
    const out = await ProfilePredictionTargetAction.Profile(await yearsUnit(), ['EventsAttended'], d);
    expect(out.Kind === 'profiled' ? out.Result.verdict : null).toEqual({ kind: 'no-usable-signal', improvement: mwi(0.004, -0.01, 0.02, 400) });
  });

  it('enough rows and signal → no verdict; the label-equal field and the near-unique identifier are leak suspects', async () => {
    const d = deps(rows(400, 120), SIGNAL);
    const out = await ProfilePredictionTargetAction.Profile(await yearsUnit(), ['EventsAttended', 'Renewed', 'MemberNumber'], d);
    expect(out.Kind).toBe('profiled');
    if (out.Kind !== 'profiled') return;
    expect(out.Result.verdict).toBeNull();
    expect(out.Result.leakSuspects.sort()).toEqual(['MemberNumber', 'Renewed']);
    expect(out.Result.computeSeconds).toBe(2.5);
    expect(out.Result.glmVsDummy).toEqual(mwi(0.05, 0.03, 0.07, 400));
  });
});

/** The Action over injected deps and a provider that throws on any data operation. */
class TestableProfileAction extends ProfilePredictionTargetAction {
  constructor(private readonly deps: ProfileTargetDeps) {
    super();
  }
  protected override BuildDeps(): ProfileTargetDeps {
    return this.deps;
  }
  public Execute(params: RunActionParams): Promise<ActionResultSimple> {
    return this.InternalRunAction(params);
  }
}

function runParams(list: ActionParam[]): RunActionParams {
  const p = new RunActionParams();
  p.Params = list;
  p.ContextUser = USER;
  p.Provider = new EntitiesOnlyProvider([YEARS], USER);
  return p;
}
function output(p: RunActionParams, name: string): ActionParam['Value'] {
  return p.Params.find((x) => x.Name === name && x.Type !== 'Input')?.Value;
}

describe('A4 attack 10 (the Engine half): the Action writes no row and records the compute cost', () => {
  it('outputs the profile, HoldoutRowsRead = 0 and ComputeSeconds; no entity object is created', async () => {
    const params = runParams([
      { Name: 'UnitDraft', Type: 'Input', Value: JSON.stringify(await yearsUnit()) },
      { Name: 'Features', Type: 'Input', Value: JSON.stringify(['EventsAttended', 'Renewed']) },
    ]);
    const create = vi.spyOn(params.Provider as EntitiesOnlyProvider, 'GetEntityObject');
    const result = await new TestableProfileAction(deps(rows(400, 120), SIGNAL)).Execute(params);
    expect(result.Success).toBe(true);
    expect(create).not.toHaveBeenCalled();
    const profile = JSON.parse(String(output(params, 'ProfileResult'))) as ProfileResult;
    expect(profile.resolvedRows).toBe(400);
    expect(output(params, 'HoldoutRowsRead')).toBe(0);
    expect(output(params, 'ComputeSeconds')).toBe(2.5);
    expect(output(params, 'Refusal')).toBeUndefined();
  });

  it('a verdict is written as the Refusal output', async () => {
    const params = runParams([
      { Name: 'UnitDraft', Type: 'Input', Value: JSON.stringify(await yearsUnit()) },
      { Name: 'Features', Type: 'Input', Value: JSON.stringify(['EventsAttended']) },
    ]);
    await new TestableProfileAction(deps(rows(301, 24), SIGNAL)).Execute(params);
    expect(JSON.parse(String(output(params, 'Refusal')))).toEqual({ kind: 'small-data', resolvedRows: 301, minorityRows: 24, minResolved: 200, minMinority: 50 });
  });

  it('a missing or invalid UnitDraft fails the Action without reading anything', async () => {
    const d = deps(rows(400, 120), SIGNAL);
    const result = await new TestableProfileAction(d).Execute(runParams([{ Name: 'Features', Type: 'Input', Value: '["EventsAttended"]' }]));
    expect(result.Success).toBe(false);
    expect(d.Calls).toHaveLength(0);
  });
});
