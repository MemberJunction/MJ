/**
 * @module maintenance
 *
 * Barrel for the Predictive Studio **maintenance** pillar (plan §12 / SP10) — the
 * {@link MaintenanceEngine} (staleness detection / scheduled re-scoring /
 * retraining triggers + challenger-vs-incumbent promotion recommendation), the
 * {@link RetrainingPolicy} model + defaults, the dependency-injection seams, and
 * their production + default implementations.
 *
 * See `./maintenance-engine` for the flow overview and `./types` for the policy +
 * seam contracts. The default, honest {@link RowCountProxyDriftDetector} and the
 * production loader / row-counter / re-score runner live in `./seams`; the holdout
 * -metric comparison helpers live in `./metrics`.
 */

export * from './types';
export * from './metrics';
export * from './maintenance-engine';
export * from './seams';
