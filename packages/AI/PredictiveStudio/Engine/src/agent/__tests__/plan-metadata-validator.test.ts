/**
 * A3 attacks 1 and 7: `PlanMetadataValidator.Validate` resolves every name a plan presents against the passed provider's
 * metadata, and the control path never presents a plan with an unresolved name — after two failed repairs the session
 * ends `decline-unresolved-reference`, listing the names.
 */
import { describe, expect, it } from 'vitest';
import { EntityInfo, QueryInfo, UserInfo } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import type { ModelingPlanSpec, UnresolvedReference } from '@memberjunction/predictive-studio-core';

import { PlanMetadataValidator } from '../plan-metadata-validator';
import { AgentControlPath, type AgentControlFacts } from '../control-path';

/** The W1-signal membership-year entity, as the truth suite loads it (the names a real plan uses). */
const YEARS_ENTITY = new EntityInfo({
  ID: '6A1D2E3F-0000-4000-8000-0000000A3001', Name: 'PS Truth W1 Membership Years', SchemaName: 'pstruth', BaseTable: 'W1_MembershipYear',
  BaseView: 'vwW1_MembershipYears', Description: 'One row per person and membership year.',
  Fields: [
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3101', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3102', Name: 'PersonID', Type: 'uniqueidentifier', Sequence: 2 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3103', Name: 'StartDate', Type: 'date', Sequence: 3 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3104', Name: 'EventsAttended', Type: 'int', Sequence: 4 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3105', Name: 'Region', Type: 'nvarchar', Length: 100, Sequence: 5 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A3106', Name: 'Renewed', Type: 'bit', Sequence: 6 },
  ],
});

/** A real query the plan may name as a source. */
const QUERY = new QueryInfo({ ID: '6A1D2E3F-0000-4000-8000-0000000A3201', Name: 'PS Truth: Events per Year', Status: 'Approved' });

/** A provider that knows only the entity and the query above. */
function ValidatorProvider(): EntitiesOnlyProvider {
  const provider = new EntitiesOnlyProvider([YEARS_ENTITY], new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000A3301', Name: 'tester', Type: 'Owner' }));
  Object.defineProperty(provider, 'Queries', { get: () => [QUERY] });
  return provider;
}

/** A plan of real names: every entity, field and query resolves. */
function RealPlan(): ModelingPlanSpec {
  return {
    Goal: 'Predict who renews',
    TargetDefinition: { EntityName: 'PS Truth W1 Membership Years', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [
      { Kind: 'Entity', Ref: 'PS Truth W1 Membership Years', Why: 'the rows' },
      { Kind: 'Query', Ref: 'PS Truth: Events per Year', Why: 'events' },
    ],
    CandidateFeatures: [
      { Name: 'EventsAttended', SourceRef: 'PS Truth W1 Membership Years', Kind: 'numeric', Why: 'engagement' },
      { Name: 'Region', SourceRef: 'PS Truth W1 Membership Years', Kind: 'categorical', Why: 'region' },
    ],
    LeakageNotes: [{ Field: 'PersonID', Risk: 'identifier', Action: 'exclude' }],
    ProposedExperiments: [{ Label: 'lr', AlgorithmName: 'logistic_regression', FeatureSet: ['EventsAttended', 'Region'], Rationale: 'r', Priority: 1 }],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
  };
}

/** The assessment's invented plan: an entity and three columns that do not exist. */
function InventedPlan(): ModelingPlanSpec {
  return {
    Goal: 'Predict lapse',
    TargetDefinition: { EntityName: 'Members', TargetVariable: 'LapsedInSubsequentYear', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [],
    CandidateFeatures: [
      { Name: 'TenureYears', SourceRef: 'Members', Kind: 'numeric', Why: 'tenure' },
      { Name: 'PlanTier', SourceRef: 'Members', Kind: 'categorical', Why: 'tier' },
    ],
    LeakageNotes: [],
    ProposedExperiments: [{ Label: 'lr', AlgorithmName: 'logistic_regression', FeatureSet: ['TenureYears', 'PlanTier'], Rationale: 'r', Priority: 1 }],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
  };
}

describe('A3 attack 1: PlanMetadataValidator.Validate resolves every name against the passed provider', () => {
  it("the assessment's invented names → four UnresolvedReferences (Members, LapsedInSubsequentYear, TenureYears, PlanTier)", () => {
    const refs = PlanMetadataValidator.Validate(InventedPlan(), ValidatorProvider());
    expect(refs.map((r) => [r.kind, r.name])).toEqual([
      ['entity', 'Members'],
      ['field', 'LapsedInSubsequentYear'],
      ['field', 'TenureYears'],
      ['field', 'PlanTier'],
    ]);
    expect(refs.map((r) => r.path)).toEqual(['TargetDefinition.EntityName', 'TargetDefinition.TargetVariable', 'CandidateFeatures[0].Name', 'CandidateFeatures[1].Name']);
  });

  it('a plan of real names → []', () => {
    expect(PlanMetadataValidator.Validate(RealPlan(), ValidatorProvider())).toEqual([]);
  });

  it('an unknown query, a leakage field and an experiment feature not in the plan are each unresolved', () => {
    const plan = RealPlan();
    plan.CandidateSources.push({ Kind: 'Query', Ref: 'No Such Query', Why: 'x' });
    plan.LeakageNotes.push({ Field: 'CancelledFlag', Risk: 'leak', Action: 'exclude' });
    plan.ProposedExperiments[0].FeatureSet.push('NotAFeature');
    const refs: UnresolvedReference[] = PlanMetadataValidator.Validate(plan, ValidatorProvider());
    expect(refs.map((r) => [r.kind, r.name, r.path])).toEqual([
      ['query', 'No Such Query', 'CandidateSources[2].Ref'],
      ['field', 'CancelledFlag', 'LeakageNotes[1].Field'],
      ['field', 'NotAFeature', 'ProposedExperiments[0].FeatureSet[2]'],
    ]);
  });

  it('a qualified Entity.Field leakage note resolves when its entity has the field (found at runtime, 2026-11-27)', () => {
    const plan = RealPlan();
    plan.LeakageNotes.push({ Field: 'PS Truth W1 Membership Years.Region', Risk: 'r', Action: 'exclude' }, { Field: 'PS Truth W1 Membership Years.NoSuchColumn', Risk: 'r', Action: 'exclude' });
    expect(PlanMetadataValidator.Validate(plan, ValidatorProvider()).map((r) => r.name)).toEqual(['PS Truth W1 Membership Years.NoSuchColumn']);
  });

  it("a unit draft's grain entity and columns are resolved too", () => {
    const plan: ModelingPlanSpec = {
      ...RealPlan(),
      UnitDraft: {
        Name: 'u', Description: null,
        UnitRows: { kind: 'grain', grainEntity: 'PS Truth W1 Membership Years', decisionDate: { kind: 'column', column: 'RenewalDate' }, filter: [] },
        LabelRule: { kind: 'column', column: 'Renewed' }, LabelWindowDays: 30, LabelGapDays: 0,
        TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
        Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } },
        ChangeHistoryPolicy: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' },
        GroupKey: null, TemporalSpec: null, DecisionSpec: { action: 'a', actorRole: 'r', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
      },
    };
    expect(PlanMetadataValidator.Validate(plan, ValidatorProvider()).map((r) => [r.kind, r.name, r.path])).toEqual([
      ['field', 'RenewalDate', 'UnitDraft.UnitRows.decisionDate.column'],
    ]);
  });
});

/** Facts of a complete, drafted, unpresented plan whose validation found `unresolved`, after `repairs` repairs. */
function validatedFacts(unresolved: readonly UnresolvedReference[], repairs: number): AgentControlFacts {
  return {
    PayloadHash: 'h', PlanComplete: true, PresentedPlanHash: null, Approval: { kind: 'no-request' }, Claim: null, BuildDispatchedThisRun: false,
    Drafts: { UnitDraftCurrent: true, ProtocolDraftCurrent: true, Refusal: null, Unresolved: unresolved, RepairsUsed: repairs },
  };
}

const INVENTED: readonly UnresolvedReference[] = [
  { path: 'TargetDefinition.EntityName', name: 'Members', kind: 'entity' },
  { path: 'CandidateFeatures[0].Name', name: 'TenureYears', kind: 'field' },
];

describe('A3 attack 7: a presented plan with an unresolved name is never shown', () => {
  it('a drafted plan is validated before it is presented', () => {
    const f = validatedFacts([], 0);
    expect(AgentControlPath.StateOf(f)).toBe('validate-plan');
    expect(AgentControlPath.Next('validate-plan', f)).toEqual({ Kind: 'present-plan' });
  });

  it('an unresolved name goes back for a repair (twice), naming the names; the plan is not presented', () => {
    for (const repairs of [0, 1]) {
      const t = AgentControlPath.Next('validate-plan', validatedFacts(INVENTED, repairs));
      expect(t.Kind).toBe('repair');
      if (t.Kind === 'repair') {
        expect(t.Reason).toContain('Members');
        expect(t.Reason).toContain('TenureYears');
      }
    }
  });

  it('after two failed repairs the session ends decline-unresolved-reference listing the names', () => {
    const t = AgentControlPath.Next('validate-plan', validatedFacts(INVENTED, 2));
    expect(t).toEqual({ Kind: 'decline-unresolved-reference', References: INVENTED });
    const message = AgentControlPath.DeclineUnresolvedMessage(INVENTED);
    expect(message).toContain('Members');
    expect(message).toContain('TenureYears');
  });

  it('no state with unresolved names transitions to present-plan', () => {
    for (const repairs of [0, 1, 2, 3]) {
      const f = validatedFacts(INVENTED, repairs);
      expect(AgentControlPath.Next(AgentControlPath.StateOf(f), f).Kind).not.toBe('present-plan');
    }
  });
});

/** Facts of a gathered, incomplete plan whose target names `unresolved`, after `repairs` repairs (wave-4 integration). */
function gatheredFacts(unresolved: readonly UnresolvedReference[] | null, repairs: number): AgentControlFacts {
  return {
    PayloadHash: 'h', PlanComplete: false, PresentedPlanHash: null, Approval: { kind: 'no-request' }, Claim: null, BuildDispatchedThisRun: false,
    Drafts: { UnitDraftCurrent: false, ProtocolDraftCurrent: false, Refusal: null, Unresolved: null, TargetUnresolved: unresolved, RepairsUsed: repairs },
  };
}

const USER_NAMED: readonly UnresolvedReference[] = [
  { path: 'TargetDefinition.EntityName', name: 'Nonexistent Course Drop Reasons', kind: 'entity' },
  { path: 'TargetDefinition.TargetVariable', name: 'PhantomOutcomeScore', kind: 'field' },
];

describe('wave-4 integration: a target naming things that do not exist ends decline-unresolved-reference before the plan is complete', () => {
  it('ValidateTarget resolves only the target slice: the entity and the variable', () => {
    const plan: Pick<ModelingPlanSpec, 'TargetDefinition'> = {
      TargetDefinition: { EntityName: 'Nonexistent Course Drop Reasons', TargetVariable: 'PhantomOutcomeScore', ProblemType: 'classification', SuccessMetric: 'AUC' },
    };
    expect(PlanMetadataValidator.ValidateTarget(plan, ValidatorProvider())).toEqual(USER_NAMED);
  });

  it('a real target, and a target with no entity yet, resolve to []', () => {
    expect(PlanMetadataValidator.ValidateTarget(RealPlan(), ValidatorProvider())).toEqual([]);
    const empty: Pick<ModelingPlanSpec, 'TargetDefinition'> = { TargetDefinition: { EntityName: '', TargetVariable: '', ProblemType: 'classification', SuccessMetric: 'AUC' } };
    expect(PlanMetadataValidator.ValidateTarget(empty, ValidatorProvider())).toEqual([]);
    const noVariable: Pick<ModelingPlanSpec, 'TargetDefinition'> = { TargetDefinition: { EntityName: 'PS Truth W1 Membership Years', TargetVariable: '', ProblemType: 'classification', SuccessMetric: 'AUC' } };
    expect(PlanMetadataValidator.ValidateTarget(noVariable, ValidatorProvider())).toEqual([]);
  });

  it('in gather, an unresolved target goes to the Goal Analyst for a repair (twice), naming the names', () => {
    for (const repairs of [0, 1]) {
      const f = gatheredFacts(USER_NAMED, repairs);
      expect(AgentControlPath.StateOf(f)).toBe('gather');
      const t = AgentControlPath.Next('gather', f);
      expect(t.Kind).toBe('repair');
      if (t.Kind === 'repair') {
        expect(t.Owner).toBe('Goal Analyst');
        expect(t.Reason).toContain('Nonexistent Course Drop Reasons');
        expect(t.Reason).toContain('PhantomOutcomeScore');
      }
    }
  });

  it('after two repairs the session ends decline-unresolved-reference listing the names', () => {
    expect(AgentControlPath.Next('gather', gatheredFacts(USER_NAMED, 2))).toEqual({ Kind: 'decline-unresolved-reference', References: USER_NAMED });
  });

  it('a resolved or not-yet-named target leaves gather to the prompt', () => {
    expect(AgentControlPath.Next('gather', gatheredFacts([], 0))).toEqual({ Kind: 'prompt', State: 'gather' });
    expect(AgentControlPath.Next('gather', gatheredFacts(null, 0))).toEqual({ Kind: 'prompt', State: 'gather' });
  });

  it('the repair keeps a name the user asked for: it is never swapped for another entity', () => {
    const t = AgentControlPath.Next('gather', gatheredFacts(USER_NAMED, 0));
    expect(t.Kind === 'repair' ? t.Reason : '').toContain('keep it as the user wrote it');
  });
});
