/**
 * @module scheduling
 *
 * Barrel for the Predictive Studio **scheduling** layer (plan PS2-6) — the
 * {@link createScheduledModelScoring} helper that binds a trained model to write
 * its prediction into a target entity column on a recurring schedule, by assembling
 * a single scheduled `MJ: Record Processes` row over the existing Record Set
 * Processing + Scheduling substrates (no new scheduling/dispatch/write-back code).
 *
 * See `./scheduled-model-scoring` for the full flow.
 */

export * from './scheduled-model-scoring';
