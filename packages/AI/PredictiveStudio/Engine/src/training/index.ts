/**
 * @module training
 *
 * Barrel for the Predictive Studio **training orchestration** — the
 * {@link TrainingEngine}, its dependency-injection seams (entity factory, record
 * loader, sidecar trainer, artifact store), and the production + in-memory
 * implementations of those seams. See `./training-engine` for the flow overview.
 */

export * from './types';
export * from './artifact-store';
export * from './seams';
export * from './training-engine';
