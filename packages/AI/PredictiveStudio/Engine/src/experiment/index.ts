/**
 * @module experiment
 *
 * Barrel for the Predictive Studio **experiment orchestration** — the
 * {@link ExperimentOrchestrator} (the deterministic, wave-based execution-phase
 * plan executor, plan §8.3 / §8.4 / §9.1), its dependency-injection seams
 * (entity factory, per-iteration trainer, clock, optional wave strategist), the
 * pure leaderboard/pruning math, the bounded-concurrency pool, and the default
 * deterministic wave strategist. See `./experiment-orchestrator` for the flow.
 */

export * from './types';
export * from './leaderboard';
export * from './concurrency';
export * from './wave-strategist';
export * from './seams';
export * from './experiment-orchestrator';
