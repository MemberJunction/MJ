/**
 * Tests for the Predictive Studio Home panel's "Ask the agent" entry path (WS5b).
 *
 * Covers PS_AGENT_STARTER_PROMPT — the entity-agnostic starter prompt seeded into the Model Development
 * Agent chat when the user clicks an "Ask the agent" CTA. Asserts it stays domain-neutral (never names a
 * specific entity, target column, or business vertical) so Predictive Studio remains 100% entity-agnostic.
 *
 * Imported from the pure `ps-agent-starter-prompt` module (zero Angular imports) so the test runs in the
 * package's node-environment vitest without the Angular JIT compiler — matching the package convention
 * that pure, testable values live apart from `@Component` classes. The `onAskAgent()` handler that emits
 * this constant on the `askAgent` output is a one-line forward, type-checked by the build.
 */
import { describe, it, expect } from 'vitest';
import { PS_AGENT_STARTER_PROMPT } from '../PredictiveStudio/components/ps-agent-starter-prompt';

describe('PS_AGENT_STARTER_PROMPT', () => {
  it('is a non-empty, human-readable prompt', () => {
    expect(typeof PS_AGENT_STARTER_PROMPT).toBe('string');
    expect(PS_AGENT_STARTER_PROMPT.trim().length).toBeGreaterThan(20);
  });

  it('invites building a predictive model in plain English', () => {
    expect(PS_AGENT_STARTER_PROMPT.toLowerCase()).toContain('predictive model');
  });

  it('stays entity-agnostic — never presumes a specific entity / target / domain', () => {
    const lower = PS_AGENT_STARTER_PROMPT.toLowerCase();
    // Guard against domain leakage: the prompt must NOT bake in any particular entity, outcome column,
    // or vertical. The agent owns that discovery once the user lands in the seeded conversation.
    const forbidden = ['member', 'renewal', 'churn', 'lapse', 'donor', 'customer', 'invoice', 'lead score'];
    for (const term of forbidden) {
      expect(lower).not.toContain(term);
    }
  });
});
