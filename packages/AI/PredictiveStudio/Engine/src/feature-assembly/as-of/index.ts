/**
 * @module feature-assembly/as-of
 *
 * Barrel for the as-of feature assembly of Prediction Unit pipelines: the shared refusal, feature resolution, keyed
 * reads, the Record Changes history, windowed aggregates over dated child tables and series lags and rolling windows.
 */

export * from './refusal';
export * from './feature-resolution';
export * from './read-by-keys';
export * from './record-history';
export * from './windowed-aggregate';
export * from './series-features';
