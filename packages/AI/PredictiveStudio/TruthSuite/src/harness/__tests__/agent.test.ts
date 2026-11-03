import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { ModelingPlanToPipelineConfig } from '@memberjunction/predictive-studio';
import { AgentPlans } from '../agent-plan';
import { HarnessAgent } from '../agent';
import type { AlgorithmKey } from '../types';

// A real EntityInfo built from field rows: AgentPlans.Build reads its Name and each field's TSType (derived from Type).
const entity = new EntityInfo({ Name: 'PS Truth: W7_MembershipYear', Fields: [{ Name: 'Plan', Type: 'nvarchar' }, { Name: 'EventsAttended', Type: 'int' }] });

/** A plan as the agent-run gates build it. */
function plan(name: string, algorithms: AlgorithmKey[]): ModelingPlanSpec {
  return AgentPlans.Build({
    Name: name, Entity: entity, Target: 'Renewed', Features: ['Plan', 'EventsAttended'], Algorithms: algorithms, DenyFields: ['ID'],
  });
}

describe('HarnessAgent.BuilderPipelineNames', () => {
  it("lists every name the builder gives a tournament's pipelines", () => {
    const p = plan('PSTruth: G0.12 W7 s42 run-1', ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest']);
    const builderNames = [ModelingPlanToPipelineConfig(p).name, ...(p.ProposedExperiments || []).map((_, i) => ModelingPlanToPipelineConfig(p, i).name)];
    expect(HarnessAgent.BuilderPipelineNames(p).sort()).toEqual([...new Set(builderNames)].sort());
  });
  it('matches the builder for a single-experiment plan and for a name over 80 characters', () => {
    const single = plan('PSTruth: G0.3 run-1', ['logistic_regression']);
    expect(HarnessAgent.BuilderPipelineNames(single)).toEqual([ModelingPlanToPipelineConfig(single, 0).name]);
    const long = plan(`PSTruth: ${'x'.repeat(90)}`, ['logistic_regression']);
    expect(HarnessAgent.BuilderPipelineNames(long)).toEqual([ModelingPlanToPipelineConfig(long).name]);
  });
  it('is empty for an unnamed plan', () => {
    expect(HarnessAgent.BuilderPipelineNames({ ...plan('x', ['xgboost']), Name: '' })).toEqual([]);
  });
});
