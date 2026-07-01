import { describe, it, expect } from 'vitest';
import { shouldForceBuild } from '../model-dev-orchestrator-agent';

/**
 * The orchestrator's deterministic decision: once the plan is approved, the build is FORCED (the LLM
 * never decides whether to build). These pin that gate — including the no-loop guard.
 */
describe('shouldForceBuild', () => {
  it('forces the build when the plan is explicitly Approved and not yet built', () => {
    expect(shouldForceBuild({ Approved: true }, null)).toBe(true);
  });

  it('forces the build on a "build it" / "create it" intent in the last user message', () => {
    expect(shouldForceBuild({}, 'Looks great — build it!')).toBe(true);
    expect(shouldForceBuild({}, 'ok go ahead and create it')).toBe(true);
    expect(shouldForceBuild({}, 'build the prediction')).toBe(true);
  });

  it('does NOT force before approval', () => {
    expect(shouldForceBuild({}, 'what features will you use?')).toBe(false);
    expect(shouldForceBuild(undefined, null)).toBe(false);
  });

  it('does NOT re-force once the prediction is already built (prevents an infinite loop)', () => {
    const built = { Approved: true, BuildResult: { success: true, published: true, heldReason: null, errorMessage: null } };
    expect(shouldForceBuild(built, 'build it')).toBe(false);
  });
});
