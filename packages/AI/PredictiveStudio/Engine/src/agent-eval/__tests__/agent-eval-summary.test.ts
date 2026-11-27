import { describe, expect, it } from 'vitest';
import {
  AgentEvalSummary,
  type AgentEvalScenario,
  type AgentEvalSuiteSpec,
  type AgentEvalTrap,
  type TestRunOutcome,
} from '../index';

function BuildScenario(index: number, trap: AgentEvalTrap, repeatCount = 3): AgentEvalScenario {
  return {
    testId: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    suiteTestId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    key: `scn-${index}`,
    name: `Scenario ${index}`,
    description: `Synthetic scenario ${index}`,
    trap,
    world: trap === 'negated-build-request' ? 'C1' : 'W1-signal',
    repeatCount,
    input: { userMessage: `Prompt ${index}` },
    expected: {
      gateOutcome: trap === 'none' ? 'model' : 'no-build',
      mustExcludeFields: trap === 'leaky-field' ? ['CompletedOn'] : [],
    },
  };
}

function BuildSpec(scenarios: readonly AgentEvalScenario[]): AgentEvalSuiteSpec {
  return {
    testSuiteId: '30000000-0000-4000-8000-000000000001',
    scenarios,
    scenarioCount: scenarios.length,
    repeats: 3,
    passK: 3,
    comparison: {
      baselineAgentVersion: 'm0-baseline',
      candidateAgentVersion: 'pr5-candidate',
      pairedOn: 'same-scenarios',
      interval: { level: 0.95, method: 'wilson' },
      nonInferiorityMargin: 0.05,
    },
  };
}

function AllPassingOutcomes(scenarios: readonly AgentEvalScenario[]): TestRunOutcome[] {
  const out: TestRunOutcome[] = [];
  for (const s of scenarios) {
    for (let r = 1; r <= s.repeatCount; r++) {
      out.push({ TestId: s.testId, RepeatIndex: r, Passed: true, RunId: `${s.testId}-r${r}`, Status: 'Passed' });
    }
  }
  return out;
}

describe('AgentEvalSummary — Attack 2', () => {
  it('fails a scenario under pass^k when one of three repeats fails', () => {
    const scenarios = [
      BuildScenario(1, 'none', 3),
      BuildScenario(2, 'none', 3),
    ];
    const spec = BuildSpec(scenarios);
    const baseline = AllPassingOutcomes(scenarios);
    const candidate = AllPassingOutcomes(scenarios).map((o) =>
      o.TestId === scenarios[0].testId && o.RepeatIndex === 2 ? { ...o, Passed: false, Status: 'Failed' } : o
    );

    const summary = AgentEvalSummary.Compute(candidate, baseline, spec);
    expect(summary.passKRate.Count).toBe(2);
    expect(summary.passKRate.Successes).toBe(1);
    expect(summary.passKRate.Value).toBeCloseTo(0.5, 6);
  });

  it('rejects a candidate whose paired interval lower bound >= -0.05 when one safety scenario fails pass^k', () => {
    const scenarios: AgentEvalScenario[] = [
      BuildScenario(1, 'leaky-field', 3),
      BuildScenario(2, 'pure-noise', 3),
      BuildScenario(3, 'small-n', 3),
      BuildScenario(4, 'unresolved-reference', 3),
      BuildScenario(5, 'negated-build-request', 5),
    ];
    for (let i = 6; i <= 100; i++) {
      scenarios.push(BuildScenario(i, 'none', 3));
    }
    const spec = BuildSpec(scenarios);
    const baseline = AllPassingOutcomes(scenarios);
    // Only ONE safety scenario fails 1 repeat -> candidate 99/100, baseline 100/100 (diff -0.01, lower bound >= -0.05),
    // but leaky-field is a safety scenario with pass^k < 1 -> accepted MUST be false.
    const candidate = AllPassingOutcomes(scenarios).map((o) =>
      o.TestId === scenarios[0].testId && o.RepeatIndex === 3 ? { ...o, Passed: false, Status: 'Failed' } : o
    );

    const summary = AgentEvalSummary.Compute(candidate, baseline, spec);
    expect(summary.pairedDifference.Interval.Lower).toBeGreaterThanOrEqual(-0.05);
    expect(summary.pairedDifference.Passed).toBe(true);
    expect(summary.safetyAllPassed).toBe(false);
    expect(summary.failingSafetyTestIds).toContain(scenarios[0].testId);
    expect(summary.accepted).toBe(false);
  });

  it('accepts when paired interval lower bound >= -0.05 and all safety scenarios have pass^k = 1', () => {
    const scenarios: AgentEvalScenario[] = [
      BuildScenario(1, 'leaky-field', 3),
      BuildScenario(2, 'pure-noise', 3),
      BuildScenario(3, 'small-n', 3),
      BuildScenario(4, 'unresolved-reference', 3),
      BuildScenario(5, 'negated-build-request', 5),
    ];
    for (let i = 6; i <= 100; i++) {
      scenarios.push(BuildScenario(i, 'none', 3));
    }
    const spec = BuildSpec(scenarios);
    const baseline = AllPassingOutcomes(scenarios);
    // One non-safety ('none') scenario fails; all safety scenarios pass 100%.
    const nonSafetyId = scenarios[10].testId;
    const candidate = AllPassingOutcomes(scenarios).map((o) =>
      o.TestId === nonSafetyId && o.RepeatIndex === 1 ? { ...o, Passed: false, Status: 'Failed' } : o
    );

    const summary = AgentEvalSummary.Compute(candidate, baseline, spec);
    expect(summary.pairedDifference.Interval.Lower).toBeGreaterThanOrEqual(-0.05);
    expect(summary.safetyAllPassed).toBe(true);
    expect(summary.failingSafetyTestIds).toEqual([]);
    expect(summary.accepted).toBe(true);
  });
});
