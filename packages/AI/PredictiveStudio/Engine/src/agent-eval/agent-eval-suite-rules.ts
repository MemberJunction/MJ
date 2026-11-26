import type { AgentEvalSuiteSpec, AgentEvalTrap } from './types';

/** Required minimum scenario count for a statistically meaningful paired eval suite (§5.1.8). */
const MIN_SCENARIO_COUNT = 100; // §5.1.8: paired eval suite requires at least 100 scenarios
/** Required minimum repeat count per scenario for pass^k reliability checks (D5-6). */
const MIN_REPEAT_COUNT = 3; // D5-6: pass^k requires at least 3 independent repeats per scenario

/** Every trap category that must be represented in the suite spec. */
const ALL_TRAPS: readonly AgentEvalTrap[] = [
  'pure-noise',
  'leaky-field',
  'small-n',
  'unresolved-reference',
  'negated-build-request',
  'none',
];

/**
 * Validation rules for a Predictive Studio Agent Eval suite specification (§5.1.8).
 * Ensures the suite has enough scenarios, enough repeats for pass^k, and coverage of every trap kind.
 */
export class AgentEvalSuiteRules {
  /**
   * Validate an {@link AgentEvalSuiteSpec}. Returns a list of human-readable failure reasons,
   * or an empty array when valid.
   */
  public static Validate(spec: AgentEvalSuiteSpec): readonly string[] {
    const errors: string[] = [];

    if (spec.scenarioCount < MIN_SCENARIO_COUNT || spec.scenarios.length < MIN_SCENARIO_COUNT) {
      errors.push(
        `Agent eval suite must contain at least ${MIN_SCENARIO_COUNT} scenarios (got declared=${spec.scenarioCount}, actual=${spec.scenarios.length}).`
      );
    }

    if (spec.scenarioCount !== spec.scenarios.length) {
      errors.push(
        `Agent eval suite scenarioCount (${spec.scenarioCount}) does not match scenarios.length (${spec.scenarios.length}).`
      );
    }

    if (spec.repeats < MIN_REPEAT_COUNT || spec.passK < MIN_REPEAT_COUNT) {
      errors.push(
        `Agent eval suite requires at least ${MIN_REPEAT_COUNT} repeats for pass^k (got repeats=${spec.repeats}, passK=${spec.passK}).`
      );
    }

    for (const scenario of spec.scenarios) {
      if (scenario.repeatCount < MIN_REPEAT_COUNT) {
        errors.push(
          `Scenario '${scenario.key}' (${scenario.testId}) has repeatCount=${scenario.repeatCount}, minimum is ${MIN_REPEAT_COUNT}.`
        );
      }
    }

    const countsByTrap = new Map<AgentEvalTrap, number>();
    for (const trap of ALL_TRAPS) {
      countsByTrap.set(trap, 0);
    }
    for (const scenario of spec.scenarios) {
      countsByTrap.set(scenario.trap, (countsByTrap.get(scenario.trap) ?? 0) + 1);
    }

    for (const trap of ALL_TRAPS) {
      const count = countsByTrap.get(trap) ?? 0;
      if (count === 0) {
        errors.push(`Agent eval suite is missing scenarios for trap kind '${trap}'.`);
      }
    }

    return errors;
  }
}
