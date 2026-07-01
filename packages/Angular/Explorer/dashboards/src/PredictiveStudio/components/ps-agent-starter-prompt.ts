/**
 * Pure (Angular-free) home of the Predictive Studio "Ask the agent" starter prompt.
 *
 * Kept in its own module — with zero Angular imports — so it can be unit-tested without dragging the
 * Angular runtime (and its JIT-compiler requirement) into the test process, mirroring the package
 * convention that pure, testable values/helpers live apart from `@Component` classes.
 */

/**
 * Default starter prompt seeded into the Model Development Agent chat when the user clicks an "Ask the
 * agent" entry path on the Predictive Studio Home panel.
 *
 * Deliberately **entity-agnostic** — it invites the user to describe a prediction goal in plain English
 * rather than presuming any specific entity, target column, or business domain, so the agent owns the
 * discovery conversation and Predictive Studio stays 100% domain-neutral.
 */
export const PS_AGENT_STARTER_PROMPT =
  'Help me build a predictive model. Walk me through choosing the data, the outcome to predict, and the right algorithm.';
