import { describe, it, expect } from 'vitest';
import { AgentPlans } from '../agent-plan';
import { EntityInfo } from '@memberjunction/core';

// A real EntityInfo built from field rows: AgentPlans.Build reads its Name and each field's TSType (derived from Type).
const entity = new EntityInfo({ Name: 'PS Truth: W3_MembershipYear', Fields: [{ Name: 'Plan', Type: 'nvarchar' }, { Name: 'EventsAttended', Type: 'int' }, { Name: 'Status', Type: 'nvarchar' }] });

describe('AgentPlans.Build', () => {
  it('builds an approved plan with one experiment per algorithm in the given order', () => {
    const plan = AgentPlans.Build({
      Name: 'PSTruth: G0.3 lr-first',
      Entity: entity,
      Target: 'Renewed',
      Features: ['Plan', 'EventsAttended', 'Status'],
      Algorithms: ['logistic_regression', 'xgboost'],
      DenyFields: ['ID', 'PersonID', 'WorldID', 'Seed'],
    });
    expect(plan.Approved).toBe(true);
    expect(plan.ProposedExperiments?.map((e) => e.AlgorithmName)).toEqual(['logistic_regression', 'xgboost']);
    expect(plan.CandidateFeatures?.find((f) => f.Name === 'Plan')?.Kind).toBe('categorical');
    expect(plan.ValidationStrategy).toEqual({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 });
  });
});
