/**
 * @module feature-assembly
 *
 * Barrel for the FeatureAssembly executor and its correctness primitives — the
 * data-access seam, the point-in-time ("as-of") assembly helpers, and the
 * leakage guard. See `./feature-assembly-executor` for the design overview.
 */

export * from './data-access';
export * from './read-policy';
export * from './assembly-metadata';
export * from './read-cap-error';
export * from './as-of';
export * from './as-of/index';
export * from './leakage-guard';
export * from './vision-llm';
export * from './feature-assembly-executor';
