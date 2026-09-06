import { describe, it, expect } from 'vitest';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { shouldForceArchitect, type PredictiveStudioArchitecturePayload } from '../architect-forcing';
import { gateArchitecture } from '../architecture-gate';

/**
 * Two failures used to land in the same invisible place — the Architect never being consulted, and
 * the Architect running and writing nothing. Both produced a plan with no `Architecture`, which the
 * gate read as the pre-Architect shape and executed as though none was ever intended.
 */
const payload = (over: Partial<PredictiveStudioArchitecturePayload> = {}): PredictiveStudioArchitecturePayload =>
  ({ Goal: 'g', Statistics: { RowCount: 100 }, ...over } as unknown as PredictiveStudioArchitecturePayload);

describe('shouldForceArchitect', () => {
  it('forces once the statistics exist and no decision has been made', () => {
    expect(shouldForceArchitect(payload())).toBe(true);
  });

  it('does not force before the statistics exist', () => {
    // Deciding without the pre-pass is the guess-from-the-goal the Architect exists to replace.
    expect(shouldForceArchitect(payload({ Statistics: undefined }))).toBe(false);
  });

  it('does not force once a decision exists', () => {
    expect(shouldForceArchitect(payload({ Architecture: { Decision: 'commit' } as never }))).toBe(false);
  });

  it('does not re-fire for the same user message when the Architect returned nothing', () => {
    // The loop guard: without it, an Architect that writes nothing is asked again immediately,
    // forever, on the same turn.
    expect(shouldForceArchitect(payload({ ArchitectureAttemptUserMessageCount: 3 }), 3)).toBe(false);
  });

  it('retries on a fresh user message', () => {
    expect(shouldForceArchitect(payload({ ArchitectureAttemptUserMessageCount: 3 }), 4)).toBe(true);
  });

  it('does nothing without a payload at all', () => {
    expect(shouldForceArchitect(undefined)).toBe(false);
  });
});

describe('gateArchitecture — a missing decision means two different things', () => {
  it('executes a plan that predates the Architect', () => {
    const gate = gateArchitecture({ Goal: 'g' } as unknown as ModelingPlanSpec);
    expect(gate.Executable).toBe(true);
    expect(gate.Architecture).toBeNull();
  });

  it('refuses a plan where the Architect ran and produced nothing', () => {
    const gate = gateArchitecture({ Goal: 'g', ArchitectureAttempted: true } as unknown as ModelingPlanSpec);

    // The whole point: an absent decision AFTER an attempt is a failure, not a legacy plan.
    expect(gate.Executable).toBe(false);
    expect(gate.Reasons.join(' ')).toContain('produced no architecture decision');
  });

  it('still executes normally once a decision was actually written', () => {
    const gate = gateArchitecture({
      Goal: 'g',
      ArchitectureAttempted: true,
      Architecture: { Decision: 'commit', Rationale: 'clear', Candidates: [{ ComponentTypeRef: 'Random Forest', Rationale: 'r' }] },
    } as unknown as ModelingPlanSpec);

    expect(gate.Executable).toBe(true);
  });
});
