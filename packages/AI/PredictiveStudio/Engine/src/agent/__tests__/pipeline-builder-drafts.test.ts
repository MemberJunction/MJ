/**
 * A3 attack 9 (F-003) and the builder half of attack 5: the Pipeline Builder creates the unit and the protocol from the
 * approved payload's drafts. With `UnitDraft` it saves unit version 1 from it (`PredictionUnitVersioning
 * .CreatePredictionUnitV1`) and binds it (`RunViewPredictionUnitStore.ApplyUnitToPipeline`) instead of the migration's
 * column mapping; with `ProtocolDraft` its non-guard members are merged over the default protocol, and the guard members
 * are always the template's, even from a hand-edited payload. A spec without drafts builds exactly as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLEvaluationProtocolEntity, MJMLPredictionUnitEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import {
  EvaluationProtocolRules, GUARD_FIELDS, PredictionUnit, ProtocolRows,
  type EvaluationProtocolDraft, type HoldoutSplit, type ModelingPlanSpec, type PredictionUnitSpec, type ProtocolDraftMembers, type UnitDraft,
} from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPipelineBuilder, type ProtocolPromotionSetting } from '../pipeline-builder';
import { PredictionUnitVersioning } from '../../prediction-unit/unit-versioning';
import { RunViewPredictionUnitStore } from '../../prediction-unit/unit-store';
import { PipelineMigration } from '../../migration/legacy-pipeline-migration';
import { EvaluationProtocolVersioning } from '../../protocol/protocol-versioning';
import { ProtocolDefaults } from '../../protocol/protocol-defaults';
import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { MemoryStorageAccount } from '../../__tests__/fakes/storage-fakes';

/** The builder's binding steps, exposed. */
class DraftsBuilder extends PredictiveStudioPipelineBuilder {
  public Unit(spec: ModelingPlanSpec, pipeline: MJMLTrainingPipelineEntity, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    return this.BindUnit(spec, pipeline, provider, user);
  }
  public Protocol(
    pipeline: MJMLTrainingPipelineEntity, unit: PredictionUnitSpec, draft: ProtocolDraftMembers | undefined, promotion: ProtocolPromotionSetting | null, provider: IMetadataProvider, user: UserInfo,
  ): Promise<void> {
    return this.BindProtocol(pipeline, unit, draft, 2, promotion, provider, user);
  }
}

/** The approved renewal unit: censoring rule R (corpus end on StartDate) and decision date D (StartDate + 334 days). */
const CENSORING_R: UnitDraft['Censoring'] = { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'Members', field: 'StartDate' } };
const DECISION_D: Extract<UnitDraft['UnitRows'], { kind: 'grain' }>['decisionDate'] = { kind: 'column-offset', column: 'StartDate', offsetDays: 334 };
const UNIT_DRAFT: UnitDraft = {
  Name: 'Renewal unit', Description: 'drafted by the agent',
  UnitRows: { kind: 'grain', grainEntity: 'Members', decisionDate: DECISION_D, filter: [] },
  LabelRule: { kind: 'column', column: 'Renewed' }, LabelWindowDays: 31, LabelGapDays: 0,
  TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, Censoring: CENSORING_R,
  ChangeHistoryPolicy: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
  DecisionSpec: { action: 'call', actorRole: 'membership', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
};

const SPEC: ModelingPlanSpec = {
  Goal: 'Predict renewal',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [], CandidateFeatures: [{ Name: 'Age', SourceRef: 'Members', Kind: 'numeric', Why: 'raw' }], LeakageNotes: [],
  ProposedExperiments: [{ Label: 'A', AlgorithmName: 'xgboost', FeatureSet: [], Rationale: 'r', Priority: 1 }],
  ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 }, ProposedBudget: {},
};

const HOLDOUT: HoldoutSplit = { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-12-01', holdoutEnd: null, newEntityReport: null };

let store: GateTestStore;
let provider: IMetadataProvider;
let pipeline: MJMLTrainingPipelineEntity;

/** The unit spec of a draft, as the builder parses the saved row. */
function specOf(draft: UnitDraft): PredictionUnitSpec {
  const parsed = PredictionUnit.ParsePredictionUnitRow({ ...ProtocolRows.UnitDraftColumns(draft), ID: 'U-1', LineageRootID: 'U-1', Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify({ kind: 'system', component: 'test' }) });
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

beforeEach(async () => {
  store = new GateTestStore();
  new GateWorld(store, new MemoryStorageAccount('builder-drafts', []));
  provider = store.Provider();
  pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', GateWorld.User);
  if (!(await pipeline.Load(GateWorld.PipelineID))) throw new Error('the world has no pipeline');
  pipeline.PredictionUnitID = null;
  pipeline.EvaluationProtocolID = null;
  vi.spyOn(ProtocolDefaults, 'DefaultHoldoutFor').mockResolvedValue(HOLDOUT);
});
afterEach(() => vi.restoreAllMocks());

/** Spies the unit writers: version 1 returns an unsaved row written from the draft; the binding records its unit. */
function spyUnitWriters(): { readonly Created: UnitDraft[]; readonly Bound: PredictionUnitSpec[]; readonly Migrated: () => number } {
  const created: UnitDraft[] = [];
  const bound: PredictionUnitSpec[] = [];
  vi.spyOn(PredictionUnitVersioning, 'CreatePredictionUnitV1').mockImplementation(async (draft, actor, _factory, user) => {
    created.push(draft);
    const row = await provider.GetEntityObject<MJMLPredictionUnitEntity>('MJ: ML Prediction Units', user);
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, draft, { ID: '6A1D2E3F-0000-4000-8000-0000000A3901', LineageRootID: '6A1D2E3F-0000-4000-8000-0000000A3901', Version: 1, LabelVersion: 1, AuthoredBy: actor });
    return row;
  });
  vi.spyOn(RunViewPredictionUnitStore, 'ApplyUnitToPipeline').mockImplementation((p, unitId, s) => {
    bound.push(s);
    p.PredictionUnitID = unitId;
  });
  const migrate = vi.spyOn(PipelineMigration, 'BindMigratedUnit').mockResolvedValue({ Ok: true });
  return { Created: created, Bound: bound, Migrated: () => migrate.mock.calls.length };
}

/** Spies protocol version 1 and returns the drafts it was created from. */
function spyProtocolWriter(): EvaluationProtocolDraft[] {
  const drafts: EvaluationProtocolDraft[] = [];
  vi.spyOn(EvaluationProtocolVersioning, 'CreateEvaluationProtocolV1').mockImplementation(async (draft) => {
    drafts.push(draft);
    const row = await provider.GetEntityObject<MJMLEvaluationProtocolEntity>('MJ: ML Evaluation Protocols', GateWorld.User);
    row.ID = '6A1D2E3F-0000-4000-8000-0000000A3902';
    return row;
  });
  return drafts;
}

/** The default protocol the builder binds for `unit` (the template). */
function template(unit: PredictionUnitSpec): EvaluationProtocolDraft {
  return EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unit, Holdout: HOLDOUT, Candidates: 2, Seed: ProtocolDefaults.DEFAULT_SEED, Name: `${pipeline.Name} — protocol` });
}

describe('A3 attack 9: the builder consumes the approved drafts', () => {
  it('a UnitDraft naming censoring rule R and decision date D → unit version 1 carries R and D, not the migration mapping', async () => {
    const writers = spyUnitWriters();
    await new DraftsBuilder().Unit({ ...SPEC, UnitDraft: UNIT_DRAFT }, pipeline, provider, GateWorld.User);
    expect(writers.Created).toEqual([UNIT_DRAFT]);
    expect(writers.Migrated()).toBe(0);
    expect(writers.Bound).toHaveLength(1);
    expect(writers.Bound[0].censoring).toEqual(CENSORING_R);
    expect(writers.Bound[0].rows.kind === 'grain' ? writers.Bound[0].rows.decisionDate : null).toEqual(DECISION_D);
    expect(pipeline.PredictionUnitID).toBe('6A1D2E3F-0000-4000-8000-0000000A3901');
  });

  it('a non-guard ProtocolDraft member set to V → the bound protocol carries V; every other member is the template', async () => {
    const drafts = spyProtocolWriter();
    const unit = specOf(UNIT_DRAFT);
    await new DraftsBuilder().Protocol(pipeline, unit, { seed: 4242 }, null, provider, GateWorld.User);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({ ...template(unit), seed: 4242 });
    expect(pipeline.EvaluationProtocolID).toBe('6A1D2E3F-0000-4000-8000-0000000A3902');
  });

  it('a draft-free spec builds as on next: the migration mapping binds the unit and the protocol is the template', async () => {
    const writers = spyUnitWriters();
    await new DraftsBuilder().Unit(SPEC, pipeline, provider, GateWorld.User);
    expect([writers.Migrated(), writers.Created.length]).toEqual([1, 0]);
    const drafts = spyProtocolWriter();
    const unit = specOf(UNIT_DRAFT);
    await new DraftsBuilder().Protocol(pipeline, unit, undefined, null, provider, GateWorld.User);
    expect(drafts[0]).toEqual(template(unit));
  });
});

describe('A3 attack 5 (builder half): a ProtocolDraft carrying guard members still binds the template\'s guard values', () => {
  it('a hand-edited payload\'s holdout, promotion, leakage audit, exclusions, budgets and search are ignored', async () => {
    const drafts = spyProtocolWriter();
    const unit = specOf(UNIT_DRAFT);
    const forgedGuards = {
      holdout: { kind: 'seeded-random', fraction: 0.01 }, promotion: { margin: -1 }, leakageAudit: { singleFeatureHeldOutAucMax: 1 },
      exclusions: { denyFields: [], denySources: [] }, budgets: { maxCandidates: 10000 }, minMinorityClassRows: 0, search: { kind: 'grid' },
      guardFieldsEditableBy: 'non-agent',
    };
    const handEdited: ProtocolDraftMembers = { seed: 11, ...forgedGuards };
    await new DraftsBuilder().Protocol(pipeline, unit, handEdited, null, provider, GateWorld.User);
    const bound = drafts[0];
    const t = template(unit);
    for (const guard of GUARD_FIELDS) {
      if (guard in t) expect(bound[guard as keyof EvaluationProtocolDraft], guard).toEqual(t[guard as keyof EvaluationProtocolDraft]);
    }
    expect(bound.seed).toBe(11);
  });

  it("the caller's promotion setting (not the payload) still applies over the template", async () => {
    const drafts = spyProtocolWriter();
    const unit = specOf(UNIT_DRAFT);
    await new DraftsBuilder().Protocol(pipeline, unit, { seed: 3 }, { autoPublishKeepBaseline: true }, provider, GateWorld.User);
    expect(drafts[0].promotion).toEqual({ ...template(unit).promotion, autoPublishKeepBaseline: true });
  });
});
