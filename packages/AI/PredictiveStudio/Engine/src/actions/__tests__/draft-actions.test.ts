/**
 * A3 attacks 2, 3, 4 and the Action half of 6: the two draft Actions validate every name against the passed provider's
 * metadata, refuse guard fields and a label window without a censoring rule, write no row, and read development rows
 * only (`HoldoutRowsRead = 0` on every call).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunActionParams, type ActionParam, type ActionResultSimple } from '@memberjunction/actions-base';
import { EntityInfo, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import type { DraftRefusal, HoldoutSplit, ModelingPlanSpec, UnitDraft } from '@memberjunction/predictive-studio-core';

import { DraftPredictionUnitAction, type DraftUnitDeps } from '../draft-prediction-unit.action';
import { DraftEvaluationProtocolAction, type DraftProtocolDeps } from '../draft-evaluation-protocol.action';
import { AgentReadScope } from '../../agent/agent-read-scope';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';

/** The years world's entity as the provider's metadata describes it (the names the Action validates against). */
const YEARS = new EntityInfo({
  ID: '6A1D2E3F-0000-4000-8000-0000000A3401', Name: 'Years', SchemaName: 'pstest', BaseTable: 'Years', BaseView: 'vwYears',
  Fields: [
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3411', Name: 'ID', Type: 'nvarchar', Length: 50, IsPrimaryKey: true, Sequence: 1 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3412', Name: 'PersonID', Type: 'nvarchar', Length: 50, Sequence: 2 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3413', Name: 'StartDate', Type: 'date', Sequence: 3 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3414', Name: 'EventsAttended', Type: 'int', Sequence: 4 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3415', Name: 'Region', Type: 'nvarchar', Length: 50, Sequence: 5 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3416', Name: 'Renewed', Type: 'bit', Sequence: 6 },
  ],
});
const USER = new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000A3421', Name: 'tester', Type: 'Owner' });
const NOW = new Date('2026-11-27T00:00:00Z');

/** A provider that knows only `Years`; every data operation throws, so a write would fail the test. */
function provider(): EntitiesOnlyProvider {
  return new EntitiesOnlyProvider([YEARS], USER);
}

/** The unit Action's deps over the years world: metadata from the provider, rows through the read scope. */
function unitDeps(p: IMetadataProvider = provider()): DraftUnitDeps {
  return {
    Provider: p,
    ReadDevelopmentRows: (draft) => AgentReadScope.DevelopmentRowsWith(draft, { DataAccess: new TableDataAccess(UnitYearsWorld.Tables()), Metadata: UnitYearsWorld.Metadata(), Now: NOW }),
  };
}

/** A renewal target on the years world with the Goal Analyst's unit proposal. */
function target(unit: NonNullable<ModelingPlanSpec['TargetDefinition']['Unit']>): ModelingPlanSpec['TargetDefinition'] {
  return { EntityName: 'Years', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC', Unit: unit };
}

/** A complete, valid proposal: decided 334 days after StartDate, a 31-day window, censored at the corpus end. */
const VALID_PROPOSAL: NonNullable<ModelingPlanSpec['TargetDefinition']['Unit']> = {
  DecisionDateColumn: 'StartDate', DecisionDateOffsetDays: 334, LabelWindowDays: 31, LabelGapDays: 0,
  Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'Years', field: 'StartDate' } },
  TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
};

afterEach(() => vi.restoreAllMocks());

describe('A3 attack 2: a draft-unit call naming a missing field, or a date field that is not a date, is refused', () => {
  it('a decision-date column that does not exist → unresolved-reference, no draft, no row written', async () => {
    const p = provider();
    const create = vi.spyOn(p, 'GetEntityObject');
    const out = await DraftPredictionUnitAction.Draft(target({ ...VALID_PROPOSAL, DecisionDateColumn: 'RenewalDate' }), unitDeps(p));
    expect(out.Kind).toBe('refused');
    if (out.Kind !== 'refused') return;
    expect(out.Refusal).toEqual({ kind: 'unresolved-reference', references: [{ path: 'TargetDefinition.Unit.DecisionDateColumn', name: 'RenewalDate', kind: 'field' }] });
    expect(out.HoldoutRowsRead).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('a decision-date column that is not a date → unresolved-reference naming it', async () => {
    const out = await DraftPredictionUnitAction.Draft(target({ ...VALID_PROPOSAL, DecisionDateColumn: 'Region' }), unitDeps());
    expect(out.Kind === 'refused' ? out.Refusal : null).toEqual({ kind: 'unresolved-reference', references: [{ path: 'TargetDefinition.Unit.DecisionDateColumn', name: 'Region', kind: 'field' }] });
  });

  it('a grain entity or label column that does not exist → unresolved-reference', async () => {
    const out = await DraftPredictionUnitAction.Draft({ ...target(VALID_PROPOSAL), EntityName: 'Members', TargetVariable: 'Lapsed' }, unitDeps());
    expect(out.Kind === 'refused' ? out.Refusal : null).toEqual({
      kind: 'unresolved-reference',
      references: [
        { path: 'TargetDefinition.EntityName', name: 'Members', kind: 'entity' },
        { path: 'TargetDefinition.TargetVariable', name: 'Lapsed', kind: 'field' },
        // the decision-date column cannot resolve on an entity that does not exist
        { path: 'TargetDefinition.Unit.DecisionDateColumn', name: 'StartDate', kind: 'field' },
      ],
    });
  });

  it('through the Action: the refusal is the output, nothing is written to the payload, HoldoutRowsRead = 0', async () => {
    const action = new TestableUnitAction(unitDeps());
    const params = runParams([{ Name: 'TargetDefinition', Value: JSON.stringify(target({ ...VALID_PROPOSAL, DecisionDateColumn: 'RenewalDate' })), Type: 'Input' }]);
    const r = await action.Execute(params);
    expect(r.ResultCode).toBe('REFUSED');
    expect(output(params, 'UnitDraft')).toBeUndefined();
    expect(JSON.parse(String(output(params, 'Refusal')))).toMatchObject({ kind: 'unresolved-reference' });
    expect(output(params, 'HoldoutRowsRead')).toBe(0);
  });
});

describe('A3 attack 4: a unit with a label window and no censoring rule is refused', () => {
  it('LabelWindowDays > 0 and no Censoring → censoring-required', async () => {
    const { Censoring, ...noCensoring } = VALID_PROPOSAL;
    void Censoring;
    const out = await DraftPredictionUnitAction.Draft(target(noCensoring), unitDeps());
    expect(out.Kind === 'refused' ? out.Refusal : null).toEqual({ kind: 'censoring-required' });
  });

  it('an explicit null censoring rule with a window is refused the same way', async () => {
    const out = await DraftPredictionUnitAction.Draft(target({ ...VALID_PROPOSAL, Censoring: null }), unitDeps());
    expect(out.Kind === 'refused' ? out.Refusal : null).toEqual({ kind: 'censoring-required' });
  });
});

describe('A3: a label window needs a decision date (found at runtime, 2026-11-27: every row was censored)', () => {
  it('a window with no DecisionDateColumn is refused with the fix in words, before any row is read', async () => {
    const read = vi.fn(unitDeps().ReadDevelopmentRows);
    const out = await DraftPredictionUnitAction.Draft(target({ LabelWindowDays: 31, Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } } }), { ...unitDeps(), ReadDevelopmentRows: read });
    expect(out.Kind === 'refused' ? out.Refusal.kind : out.Kind).toBe('draft-invalid');
    expect(out.Kind === 'refused' && out.Refusal.kind === 'draft-invalid' ? out.Refusal.problems[0] : '').toMatch(/DecisionDateColumn/);
    expect(read).not.toHaveBeenCalled();
  });

  it('no window and no date is a snapshot of the stored outcome, drafted with the default censoring', async () => {
    const out = await DraftPredictionUnitAction.Draft(target({ TaskType: VALID_PROPOSAL.TaskType }), { ...unitDeps(), Today: new Date('2026-11-27T00:00:00Z') });
    expect(out.Kind === 'draft' ? out.Draft.Censoring : null).toEqual({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-11-28' } });
  });
});

describe('A3 attack 6 (Action half): a valid draft previews development rows only', () => {
  it('returns the validated UnitDraft carrying the named censoring rule, with HoldoutRowsRead = 0', async () => {
    const out = await DraftPredictionUnitAction.Draft(target(VALID_PROPOSAL), unitDeps());
    expect(out.Kind).toBe('draft');
    if (out.Kind !== 'draft') return;
    const d: UnitDraft = out.Draft;
    expect(d.Censoring).toEqual(VALID_PROPOSAL.Censoring);
    expect(d.UnitRows).toEqual({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'column-offset', column: 'StartDate', offsetDays: 334 }, filter: [] });
    expect(d.LabelRule).toEqual({ kind: 'column', column: 'Renewed' });
    expect(out.HoldoutRowsRead).toBe(0);
    const scope = await unitDeps().ReadDevelopmentRows(d);
    expect(scope.Status === 'read' ? out.DevelopmentRows : -1).toBe(scope.Status === 'read' ? scope.Rows.length : 0);
  });

  it('a binary task with no declared class order takes it from the development rows only', async () => {
    const { TaskType, ...noTask } = VALID_PROPOSAL;
    void TaskType;
    const out = await DraftPredictionUnitAction.Draft(target(noTask), unitDeps());
    expect(out.Kind === 'draft' ? out.Draft.TaskType.kind : out.Refusal).toBe('binary');
  });
});

/** A unit draft of the years world for the protocol Action. */
async function yearsUnit(): Promise<UnitDraft> {
  const out = await DraftPredictionUnitAction.Draft(target(VALID_PROPOSAL), unitDeps());
  if (out.Kind !== 'draft') throw new Error(`the years unit does not draft: ${JSON.stringify(out.Refusal)}`);
  return out.Draft;
}

/** The protocol Action's deps: the default holdout, read as the builder reads it. */
function protocolDeps(): DraftProtocolDeps {
  const holdout: HoldoutSplit = { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-12-01', holdoutEnd: null, newEntityReport: null };
  return { DefaultHoldout: async () => holdout };
}

describe('A3 attack 3: a draft-protocol call that sets a guard field is refused', () => {
  const guardProposals: ReadonlyArray<readonly [string, Record<string, string | number | boolean | object>]> = [
    ['PromotionRule', { PromotionRule: { margin: 0 } }],
    ['LeakageAuditSpec', { LeakageAuditSpec: { singleFeatureHeldOutAucMax: 1 } }],
    ['Budgets', { Budgets: { maxComputeSeconds: 99999 } }],
    ['holdout policy', { holdout: { kind: 'seeded-random', fraction: 0.01 } }],
    ['promotion (stored name)', { promotion: { margin: 0 } }],
    ['guardFieldsEditableBy', { guardFieldsEditableBy: 'non-agent' }],
  ];
  for (const [label, proposal] of guardProposals) {
    it(`${label} → guard-field-edited-by-disallowed-author, no draft`, async () => {
      const out = await DraftEvaluationProtocolAction.Draft(proposal, await yearsUnit(), protocolDeps());
      expect(out.Kind).toBe('refused');
      const refusal: DraftRefusal | null = out.Kind === 'refused' ? out.Refusal : null;
      expect(refusal?.kind).toBe('guard-field-edited-by-disallowed-author');
      expect(out.HoldoutRowsRead).toBe(0);
    });
  }

  it('a guard field next to a valid member still refuses the whole call', async () => {
    const out = await DraftEvaluationProtocolAction.Draft({ seed: 7, Budgets: { maxCandidates: 500 } }, await yearsUnit(), protocolDeps());
    expect(out.Kind === 'refused' ? out.Refusal : null).toEqual({ kind: 'guard-field-edited-by-disallowed-author', fields: ['budgets'] });
  });

  it('non-guard members only → the validated ProtocolDraft carries exactly them', async () => {
    const out = await DraftEvaluationProtocolAction.Draft({ seed: 7 }, await yearsUnit(), protocolDeps());
    expect(out.Kind === 'draft' ? out.Draft : out.Refusal).toEqual({ seed: 7 });
    expect(out.HoldoutRowsRead).toBe(0);
  });

  it('through the Action: a guard field is refused in the output and no draft is returned', async () => {
    const action = new TestableProtocolAction(protocolDeps());
    const params = runParams([
      { Name: 'Protocol', Value: JSON.stringify({ PromotionRule: { margin: 0 } }), Type: 'Input' },
      { Name: 'UnitDraft', Value: JSON.stringify(await yearsUnit()), Type: 'Input' },
    ]);
    const r = await action.Execute(params);
    expect(r.ResultCode).toBe('REFUSED');
    expect(output(params, 'ProtocolDraft')).toBeUndefined();
    expect(JSON.parse(String(output(params, 'Refusal')))).toMatchObject({ kind: 'guard-field-edited-by-disallowed-author' });
    expect(output(params, 'HoldoutRowsRead')).toBe(0);
  });
});

/** The unit Action over injected deps. */
class TestableUnitAction extends DraftPredictionUnitAction {
  constructor(private readonly deps: DraftUnitDeps) {
    super();
  }
  protected override BuildDeps(): DraftUnitDeps {
    return this.deps;
  }
  public Execute(params: RunActionParams): Promise<ActionResultSimple> {
    return this.InternalRunAction(params);
  }
}

/** The protocol Action over injected deps. */
class TestableProtocolAction extends DraftEvaluationProtocolAction {
  constructor(private readonly deps: DraftProtocolDeps) {
    super();
  }
  protected override BuildDeps(): DraftProtocolDeps {
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
  return p;
}

function output(p: RunActionParams, name: string): ActionParam['Value'] {
  return p.Params.find((x) => x.Name === name && x.Type !== 'Input')?.Value;
}
